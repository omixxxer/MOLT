import { withAiTimeout } from './aiTimeout'
import { fetchModelFile, loadOrt, type Ort } from './onnxRuntime'
import type { Prompt } from './segmentation'

// SlimSAM: the photo is encoded once (1024 px, ~1–3 s on a laptop, in ONNX Runtime's worker) and each garment is
// then outlined from a few points in a few tens of milliseconds.

const BASE = '/models/sam/'
const SIZE = 1024
/** The low resolution masks cover the padded 1024 square. */
export const MASK_SIZE = 256
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
export const SAM_DOWNLOAD_SIZE = '13,8 MB'

interface Sessions {
  ort: Ort
  encoder: Awaited<ReturnType<Ort['InferenceSession']['create']>>
  decoder: Awaited<ReturnType<Ort['InferenceSession']['create']>>
}

let sessionsPromise: Promise<Sessions> | undefined

function loadSessions(): Promise<Sessions> {
  sessionsPromise ??= (async () => {
    const ort = await loadOrt()
    const [encoder, decoder] = await Promise.all(['encoder', 'decoder'].map(async (name) => {
      const model = await fetchModelFile(`${BASE}${name}.onnx?v=slimsam-77-q`)
      return withAiTimeout(() => ort.InferenceSession.create(model, { executionProviders: ['wasm'] }))
    }))
    return { ort, encoder: encoder!, decoder: decoder! }
  })().catch((error: unknown) => {
    sessionsPromise = undefined
    throw error
  })
  return sessionsPromise
}

export interface EncodedImage {
  width: number
  height: number
  /** The photo scaled so its longest side is 1024 (the rest of the square is padding). */
  scale: number
  /**
   * Encoder outputs as plain arrays: ONNX Runtime's worker takes over (detaches) the buffers of the tensors it
   * is given, so each decoding gets fresh copies.
   */
  embeddings: { data: Float32Array; dims: readonly number[] }
  positions: { data: Float32Array; dims: readonly number[] }
}

export interface Outline {
  /** Mask logits, MASK_SIZE × MASK_SIZE over the padded square; > 0 is the garment. */
  logits: Float32Array
  score: number
}

export async function encodeImage(image: Blob): Promise<EncodedImage> {
  const { ort, encoder } = await loadSessions()
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  try {
    const scale = SIZE / Math.max(bitmap.width, bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('El navegador no permite preparar la imagen.')
    context.drawImage(bitmap, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    // Normalised and padded with zeros at the right and bottom, as SAM's processor does.
    const pixels = new Float32Array(3 * SIZE * SIZE)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = (y * width + x) * 4
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[channel * SIZE * SIZE + y * SIZE + x] = (data[source + channel]! / 255 - MEAN[channel]!) / STD[channel]!
        }
      }
    }
    const output = await withAiTimeout(() => encoder.run({ pixel_values: new ort.Tensor('float32', pixels, [1, 3, SIZE, SIZE]) }))
    const keep = (tensor: (typeof output)[string] | undefined) => {
      if (!tensor) throw new Error('El modelo de recorte no devolvió la imagen codificada.')
      return { data: Float32Array.from(tensor.data as Float32Array), dims: tensor.dims }
    }
    return { width: bitmap.width, height: bitmap.height, scale, embeddings: keep(output.image_embeddings), positions: keep(output.image_positional_embeddings) }
  } finally {
    bitmap.close()
  }
}

/** The three candidate outlines SlimSAM gives for a prompt (whole object, part, sub-part). */
export async function outline(encoded: EncodedImage, prompt: Prompt): Promise<Outline[]> {
  const { ort, decoder } = await loadSessions()
  const count = prompt.points.length
  const points = new Float32Array(prompt.points.flatMap(([x, y]) => [x * encoded.scale, y * encoded.scale]))
  const output = await withAiTimeout(() => decoder.run({
    input_points: new ort.Tensor('float32', points, [1, 1, count, 2]),
    input_labels: new ort.Tensor('int64', BigInt64Array.from(prompt.labels.map((label) => BigInt(label))), [1, 1, count]),
    image_embeddings: new ort.Tensor('float32', encoded.embeddings.data.slice(), encoded.embeddings.dims),
    image_positional_embeddings: new ort.Tensor('float32', encoded.positions.data.slice(), encoded.positions.dims)
  }))
  const scores = output.iou_scores!.data as Float32Array
  const masks = output.pred_masks!.data as Float32Array
  return [0, 1, 2].map((index) => ({
    logits: masks.slice(index * MASK_SIZE * MASK_SIZE, (index + 1) * MASK_SIZE * MASK_SIZE),
    score: scores[index]!
  }))
}

/**
 * The outline at width × height of the photo, as alpha 0–255 with soft edges: the logits are sampled bilinearly
 * (the low resolution square holds the photo in its top left corner) and squashed with a steep sigmoid.
 */
export function outlineAlpha(outlineLogits: Float32Array, encoded: Pick<EncodedImage, 'width' | 'height' | 'scale'>, width: number, height: number): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height)
  const ratio = MASK_SIZE / SIZE
  const sourceWidth = encoded.width * encoded.scale * ratio
  const sourceHeight = encoded.height * encoded.scale * ratio
  for (let y = 0; y < height; y += 1) {
    const v = Math.max(0, Math.min(MASK_SIZE - 1, (y + 0.5) * sourceHeight / height - 0.5))
    const v0 = Math.floor(v)
    const v1 = Math.min(MASK_SIZE - 1, v0 + 1)
    const fv = v - v0
    for (let x = 0; x < width; x += 1) {
      const u = Math.max(0, Math.min(MASK_SIZE - 1, (x + 0.5) * sourceWidth / width - 0.5))
      const u0 = Math.floor(u)
      const u1 = Math.min(MASK_SIZE - 1, u0 + 1)
      const fu = u - u0
      const top = outlineLogits[v0 * MASK_SIZE + u0]! * (1 - fu) + outlineLogits[v0 * MASK_SIZE + u1]! * fu
      const bottom = outlineLogits[v1 * MASK_SIZE + u0]! * (1 - fu) + outlineLogits[v1 * MASK_SIZE + u1]! * fu
      const logit = top * (1 - fv) + bottom * fv
      alpha[y * width + x] = 255 / (1 + Math.exp(-8 * logit))
    }
  }
  return alpha
}
