import { withAiTimeout } from './aiTimeout'
import { fetchModelFile, loadOrt } from './onnxRuntime'
import type { Plain, SamRequest, SamResponse, SamResult } from './sam.worker'
import type { Prompt } from './segmentation'

// SlimSAM: the photo is encoded once (1024 px, a few seconds on a laptop) and each garment is then outlined from a
// few points in a few tens of milliseconds.
//
// Memory: the encoder grows its WebAssembly runtime to ~1.6 GB, and WebAssembly memory never shrinks. In the
// runtime shared with the classifier (ONNX Runtime's proxy worker) that stayed in the page for good (measured
// 18-11-2026: 157 MB without cut-outs, 1,680 MB from the first one on). So SlimSAM gets a worker and runtime of
// its own (sam.worker.ts), ended SAM_IDLE_MS after the last cut-out. Where workers cannot start (tests, an old
// browser), it runs in the shared runtime as before.

const BASE = '/models/sam/'
const SIZE = 1024
/** The low resolution masks cover the padded 1024 square. */
export const MASK_SIZE = 256
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
export const SAM_DOWNLOAD_SIZE = '13,8 MB'
/** A batch of photos keeps the worker (no reloading per photo); this long after the last cut-out it is ended. */
export const SAM_IDLE_MS = 5_000

type Unsent = SamRequest extends infer Request ? Request extends unknown ? Omit<Request, 'id'> : never : never

interface Backend {
  run(request: Unsent, transfer?: Transferable[]): Promise<SamResult>
  close(): void
}

class WorkerUnavailable extends Error {}

let backendPromise: Promise<Backend> | undefined
let useShared = typeof Worker === 'undefined'
let users = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

async function modelFiles() {
  const [encoder, decoder] = await Promise.all(['encoder', 'decoder'].map((name) => fetchModelFile(`${BASE}${name}.onnx?v=slimsam-77-q`)))
  return { encoder: encoder!, decoder: decoder! }
}

async function workerBackend(): Promise<Backend> {
  const worker = new Worker(new URL('./sam.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 1
  let failed: Error | undefined
  const pending = new Map<number, { resolve: (result: SamResult) => void; reject: (error: Error) => void }>()
  const fail = (error: Error) => {
    failed ??= error
    worker.terminate()
    for (const waiting of pending.values()) waiting.reject(error)
    pending.clear()
  }
  worker.onmessage = (event: MessageEvent<SamResponse>) => {
    const waiting = pending.get(event.data.id)
    if (!waiting) return
    pending.delete(event.data.id)
    if (event.data.error !== undefined) waiting.reject(new Error(event.data.error))
    else waiting.resolve(event.data.result ?? null)
  }
  // A worker that cannot load (a blocked script, an old browser): SlimSAM runs in the shared runtime instead.
  worker.onerror = (event) => {
    event.preventDefault()
    fail(new WorkerUnavailable())
  }
  const backend: Backend = {
    run: (request, transfer = []) => {
      if (failed) return Promise.reject(failed)
      const id = nextId++
      return new Promise<SamResult>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ ...request, id }, transfer)
      })
    },
    close: () => fail(new Error('El recorte se ha cerrado.'))
  }
  try {
    const { encoder, decoder } = await modelFiles()
    await withAiTimeout(() => backend.run({ kind: 'load', encoder, decoder }, [encoder, decoder]))
    return backend
  } catch (error) {
    backend.close()
    throw error
  }
}

/** The previous way, in the runtime shared with the classifier, whose memory stays in the page. */
async function sharedBackend(): Promise<Backend> {
  const ort = await loadOrt()
  const models = await modelFiles()
  const [encoder, decoder] = await Promise.all([models.encoder, models.decoder].map((model) =>
    withAiTimeout(() => ort.InferenceSession.create(model, { executionProviders: ['wasm'] }))))
  // ONNX Runtime's proxy worker takes over (detaches) the buffers of the tensors it is given: keep copies.
  const keep = (tensor: { data: unknown; dims: readonly number[] } | undefined): Plain => {
    if (!tensor) throw new Error('El modelo de recorte no devolvió la imagen codificada.')
    return { data: Float32Array.from(tensor.data as Float32Array), dims: tensor.dims }
  }
  return {
    run: async (request) => {
      if (request.kind === 'load') return null
      if (request.kind === 'encode') {
        const output = await encoder!.run({ pixel_values: new ort.Tensor('float32', request.pixels, [1, 3, request.size, request.size]) })
        return { embeddings: keep(output.image_embeddings), positions: keep(output.image_positional_embeddings) }
      }
      const count = request.labels.length
      const output = await decoder!.run({
        input_points: new ort.Tensor('float32', request.points, [1, 1, count, 2]),
        input_labels: new ort.Tensor('int64', request.labels, [1, 1, count]),
        image_embeddings: new ort.Tensor('float32', request.embeddings.data, request.embeddings.dims),
        image_positional_embeddings: new ort.Tensor('float32', request.positions.data, request.positions.dims)
      })
      return { scores: output.iou_scores!.data as Float32Array, masks: output.pred_masks!.data as Float32Array }
    },
    close: () => undefined
  }
}

function backend(): Promise<Backend> {
  clearTimeout(idleTimer)
  const start = performance.now()
  backendPromise ??= (useShared ? sharedBackend() : workerBackend().catch((error: unknown) => {
    if (!(error instanceof WorkerUnavailable)) throw error
    useShared = true
    return sharedBackend()
  })).then((sam) => {
    // What starting SlimSAM costs (again after each idle end); bench/classifier.html reports it.
    performance.measure('molt:sam-load', { start })
    return sam
  }).catch((error: unknown) => {
    backendPromise = undefined
    throw error
  })
  return backendPromise
}

async function run(request: Unsent, transfer?: Transferable[]): Promise<SamResult> {
  const sam = await backend()
  try {
    return await withAiTimeout(() => sam.run(request, transfer))
  } catch (error) {
    // A worker that failed is ended (its memory with it); the next cut-out starts a new one.
    if (!useShared) closeSam()
    throw error
  }
}

function closeSam() {
  clearTimeout(idleTimer)
  const closing = backendPromise
  backendPromise = undefined
  void closing?.then((sam) => sam.close(), () => undefined)
}

/**
 * Cut-outs run inside this: SlimSAM's worker stays while any of them runs and is ended `idleMs` after the last
 * one (right away with 0), so its memory leaves the page.
 */
export async function withSam<T>(step: () => Promise<T>, idleMs = SAM_IDLE_MS): Promise<T> {
  users += 1
  clearTimeout(idleTimer)
  try {
    return await step()
  } finally {
    users -= 1
    if (users === 0 && backendPromise && !useShared) {
      if (idleMs <= 0) closeSam()
      else idleTimer = setTimeout(() => { if (users === 0) closeSam() }, idleMs)
    }
  }
}

export interface EncodedImage {
  width: number
  height: number
  /** The photo scaled so its longest side is 1024 (the rest of the square is padding). */
  scale: number
  /** Encoder outputs as plain arrays; the runtime takes over the buffers it is sent, so each decoding gets copies. */
  embeddings: Plain
  positions: Plain
}

export interface Outline {
  /** Mask logits, MASK_SIZE × MASK_SIZE over the padded square; > 0 is the garment. */
  logits: Float32Array
  score: number
}

export async function encodeImage(image: Blob): Promise<EncodedImage> {
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
    const output = await run({ kind: 'encode', pixels, size: SIZE }, [pixels.buffer])
    if (!output || !('embeddings' in output)) throw new Error('El modelo de recorte no devolvió la imagen codificada.')
    return { width: bitmap.width, height: bitmap.height, scale, embeddings: output.embeddings, positions: output.positions }
  } finally {
    bitmap.close()
  }
}

/** The three candidate outlines SlimSAM gives for a prompt (whole object, part, sub-part). */
export async function outline(encoded: EncodedImage, prompt: Prompt): Promise<Outline[]> {
  const points = new Float32Array(prompt.points.flatMap(([x, y]) => [x * encoded.scale, y * encoded.scale]))
  const labels = BigInt64Array.from(prompt.labels.map((label) => BigInt(label)))
  const embeddings = { data: encoded.embeddings.data.slice(), dims: encoded.embeddings.dims }
  const positions = { data: encoded.positions.data.slice(), dims: encoded.positions.dims }
  const output = await run({ kind: 'decode', points, labels, embeddings, positions }, [points.buffer, labels.buffer, embeddings.data.buffer, positions.data.buffer])
  if (!output || !('scores' in output)) throw new Error('El modelo de recorte no devolvió el contorno.')
  const { scores, masks } = output
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
