import { withAiTimeout } from './aiTimeout'
import { fetchDescription, fetchModelFile, loadOrt } from './onnxRuntime'

// PaddleOCR PP-OCRv5 mobile (Apache-2.0): a text detector and a Latin-script recognizer, run on the device.
const OCR_BASE = `${import.meta.env.BASE_URL}models/ocr/`
const MAX_LINES = 24
/** The second, closer look at the label is made when its text covers less than this share of the photo. */
const ZOOM_BELOW = 0.35
const MAX_ZOOM = 3

/** Where a line was read, in photo pixels (the axis-aligned bounds of its possibly tilted box). */
export interface LineBounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** The tilted rectangle a line was read from, in photo pixels; `angle` is the direction of the text. */
export interface LineShape {
  centerX: number
  centerY: number
  angle: number
  length: number
  thickness: number
}

export interface TextLine {
  text: string
  score: number
  bounds?: LineBounds
  shape?: LineShape
}

/**
 * A detected word or line: axis-aligned bounds, plus the tilted rectangle that fits it (centre, angle of the
 * text direction in radians, length along it and thickness across it), all in detection-map pixels.
 */
export interface TextBox {
  left: number
  top: number
  right: number
  bottom: number
  score: number
  centerX: number
  centerY: number
  angle: number
  length: number
  thickness: number
}

interface OcrDescription {
  format: string
  detector: {
    file: string
    bytes: number
    maxSide: number
    multiple: number
    mean: number[]
    std: number[]
    threshold: number
    boxThreshold: number
    unclipRatio: number
  }
  recognizer: { file: string; bytes: number; height: number; maxWidth: number }
  characters: string[]
}

type TextReader = (image: Blob) => Promise<TextLine[]>

let readerPromise: Promise<TextReader> | undefined

/**
 * Text regions from the detector's probability map (DB post-processing, as PaddleOCR): connected pixels above
 * `threshold`, kept when their mean probability reaches `boxThreshold`. The text direction comes from the
 * principal axis of the pixels, so tilted labels are read along their lines; nearly square regions (a single
 * letter) stay upright. Each box is grown by area × unclipRatio / perimeter, because the map covers only the
 * core of each word.
 */
export function detectTextBoxes(
  probabilities: ArrayLike<number>,
  width: number,
  height: number,
  settings: Pick<OcrDescription['detector'], 'threshold' | 'boxThreshold' | 'unclipRatio'>
): TextBox[] {
  const visited = new Uint8Array(width * height)
  const boxes: TextBox[] = []
  const stack: number[] = []
  const pixels: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || probabilities[start]! <= settings.threshold) continue
    visited[start] = 1
    stack.push(start)
    pixels.length = 0
    let left = width, top = height, right = 0, bottom = 0, total = 0
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0
    while (stack.length) {
      const index = stack.pop()!
      const x = index % width
      const y = (index - x) / width
      pixels.push(index)
      left = Math.min(left, x); right = Math.max(right, x + 1)
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1)
      total += probabilities[index]!
      sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next >= 0 && !visited[next] && probabilities[next]! > settings.threshold) {
          visited[next] = 1
          stack.push(next)
        }
      }
    }
    const count = pixels.length
    if (Math.min(right - left, bottom - top) < 3 || total / count < settings.boxThreshold) continue

    const meanX = sumX / count
    const meanY = sumY / count
    let angle = 0.5 * Math.atan2(2 * (sumXY / count - meanX * meanY), sumXX / count - meanX * meanX - (sumYY / count - meanY * meanY))
    let [length, thickness, centerX, centerY] = extent(pixels, width, angle)
    // A letter or a short block has no clear direction (an upright "L" is taller than wide), and a slight tilt is
    // not worth turning.
    if (length < thickness * 2 || Math.abs(angle) < 0.05) {
      angle = 0
      ;[length, thickness, centerX, centerY] = [right - left, bottom - top, (left + right) / 2, (top + bottom) / 2]
    }
    const grow = (length * thickness * settings.unclipRatio) / (2 * (length + thickness))
    length += 2 * grow
    thickness += 2 * grow
    const halfWidth = (Math.abs(Math.cos(angle)) * length + Math.abs(Math.sin(angle)) * thickness) / 2
    const halfHeight = (Math.abs(Math.sin(angle)) * length + Math.abs(Math.cos(angle)) * thickness) / 2
    boxes.push({
      left: Math.max(0, centerX - halfWidth),
      top: Math.max(0, centerY - halfHeight),
      right: Math.min(width, centerX + halfWidth),
      bottom: Math.min(height, centerY + halfHeight),
      score: total / count,
      centerX,
      centerY,
      angle,
      length,
      thickness
    })
  }
  return boxes
}

/** Length and thickness of the pixels along `angle` and across it, and the centre of that rectangle. */
function extent(pixels: number[], width: number, angle: number): [number, number, number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const index of pixels) {
    const x = (index % width) + 0.5
    const y = Math.floor(index / width) + 0.5
    const u = x * cos + y * sin
    const v = -x * sin + y * cos
    minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    minV = Math.min(minV, v); maxV = Math.max(maxV, v)
  }
  const u = (minU + maxU) / 2
  const v = (minV + maxV) / 2
  return [maxU - minU + 1, maxV - minV + 1, u * cos - v * sin, u * sin + v * cos]
}

/** Intersection over union of two bounds, to drop a line read twice. */
function overlap(a: LineBounds, b: LineBounds): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (width <= 0 || height <= 0) return 0
  const area = (bounds: LineBounds) => (bounds.right - bounds.left) * (bounds.bottom - bounds.top)
  return (width * height) / (area(a) + area(b) - width * height)
}

/**
 * The part of the photo with readable text (lines read with some confidence), grown by half its size on each
 * side so the rest of the label is included; undefined when nothing was read.
 */
export function textArea(lines: TextLine[], width: number, height: number): LineBounds | undefined {
  const found = lines.filter((line) => line.bounds && line.score >= 0.5).map((line) => line.bounds!)
  if (!found.length) return undefined
  const left = Math.min(...found.map((bounds) => bounds.left))
  const top = Math.min(...found.map((bounds) => bounds.top))
  const right = Math.max(...found.map((bounds) => bounds.right))
  const bottom = Math.max(...found.map((bounds) => bounds.bottom))
  const margin = Math.max(right - left, bottom - top) / 2
  return {
    left: Math.max(0, left - margin),
    top: Math.max(0, top - margin),
    right: Math.min(width, right + margin),
    bottom: Math.min(height, bottom + margin)
  }
}

/** Lines of both passes; where two overlap, the more confident reading stays. */
export function mergeLines(first: TextLine[], second: TextLine[]): TextLine[] {
  const merged = [...first]
  for (const line of second) {
    const same = merged.findIndex((other) => other.bounds && line.bounds && overlap(other.bounds, line.bounds) > 0.5)
    if (same < 0) merged.push(line)
    else if (line.score > merged[same]!.score) merged[same] = line
  }
  return merged
}

/** Greedy CTC decoding: best class per step, repeats merged, blanks (class 0) dropped. */
export function ctcDecode(logits: ArrayLike<number>, steps: number, classes: number, characters: string[]): TextLine {
  let text = ''
  let total = 0
  let count = 0
  let previous = 0
  for (let step = 0; step < steps; step += 1) {
    let best = 0
    let bestScore = -Infinity
    for (let index = 0; index < classes; index += 1) {
      const score = logits[step * classes + index]!
      if (score > bestScore) {
        best = index
        bestScore = score
      }
    }
    if (best !== 0 && best !== previous) {
      text += characters[best - 1] ?? ''
      total += bestScore
      count += 1
    }
    previous = best
  }
  return { text, score: count ? total / count : 0 }
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('El navegador no permite preparar la imagen.')
  return { canvas, context }
}

/** PaddleOCR models take BGR, CHW, normalised per channel in that BGR order. */
function toTensorData(data: Uint8ClampedArray, width: number, height: number, mean: number[], std: number[]): Float32Array {
  const pixels = new Float32Array(3 * width * height)
  for (let index = 0; index < width * height; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[index * 4 + 2 - channel]! / 255
      pixels[channel * width * height + index] = (value - mean[channel]!) / std[channel]!
    }
  }
  return pixels
}

async function loadReader(): Promise<TextReader> {
  if (!readerPromise) {
    const pending = (async (): Promise<TextReader> => {
      const [ort, description] = await Promise.all([loadOrt(), fetchDescription<OcrDescription>(`${OCR_BASE}ocr-model.json`)])
      if (description.format !== 'molt-ocr') throw new Error('La descripción del OCR no es válida.')
      const { detector, recognizer } = description
      const [detectorModel, recognizerModel] = await Promise.all([
        fetchModelFile(`${OCR_BASE}${detector.file}?v=${detector.bytes}`),
        fetchModelFile(`${OCR_BASE}${recognizer.file}?v=${recognizer.bytes}`)
      ])
      const options = { executionProviders: ['wasm'] }
      const [detection, recognition] = await Promise.all([
        withAiTimeout(() => ort.InferenceSession.create(detectorModel, options)),
        withAiTimeout(() => ort.InferenceSession.create(recognizerModel, options))
      ])

      /** The text of a tilted rectangle (photo pixels), turned upright and read; `angle` is the reading direction. */
      async function recognize(bitmap: ImageBitmap, centerX: number, centerY: number, angle: number, length: number, thickness: number): Promise<TextLine> {
        const lineWidth = Math.max(8, Math.min(recognizer.maxWidth, Math.round(recognizer.height * length / thickness)))
        const { context } = canvasOf(lineWidth, recognizer.height)
        context.scale(lineWidth / length, recognizer.height / thickness)
        context.translate(length / 2, thickness / 2)
        context.rotate(-angle)
        context.translate(-centerX, -centerY)
        context.drawImage(bitmap, 0, 0)
        const data = toTensorData(context.getImageData(0, 0, lineWidth, recognizer.height).data, lineWidth, recognizer.height, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
        const output = await withAiTimeout(() => recognition.run({ [recognition.inputNames[0]!]: new ort.Tensor('float32', data, [1, 3, recognizer.height, lineWidth]) }))
        const logits = output[recognition.outputNames[0]!]!
        const [, steps, classes] = logits.dims
        return ctcDecode(logits.data as Float32Array, steps!, classes!, description.characters)
      }

      /** Detects and reads the text in a region of the photo, at most `maxZoom` times its size. */
      async function readRegion(bitmap: ImageBitmap, region: LineBounds, maxZoom: number): Promise<TextLine[]> {
        const regionWidth = region.right - region.left
        const regionHeight = region.bottom - region.top
        const scale = Math.min(maxZoom, detector.maxSide / Math.max(regionWidth, regionHeight))
        const round = (value: number) => Math.max(detector.multiple, Math.round(value * scale / detector.multiple) * detector.multiple)
        const width = round(regionWidth)
        const height = round(regionHeight)
        const { context } = canvasOf(width, height)
        context.drawImage(bitmap, region.left, region.top, regionWidth, regionHeight, 0, 0, width, height)
        const input = toTensorData(context.getImageData(0, 0, width, height).data, width, height, detector.mean, detector.std)
        const detected = await withAiTimeout(() => detection.run({ [detection.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, height, width]) }))
        const map = detected[detection.outputNames[0]!]!
        const boxes = detectTextBoxes(map.data as Float32Array, width, height, detector)
          .sort((left, right) => right.length * right.thickness - left.length * left.thickness)
          .slice(0, MAX_LINES)

        const scaleX = regionWidth / width
        const scaleY = regionHeight / height
        const lines: TextLine[] = []
        for (const box of boxes) {
          // The tilted rectangle in photo pixels (the map may be stretched a little to a multiple of 32).
          const along = [Math.cos(box.angle) * scaleX, Math.sin(box.angle) * scaleY] as const
          const across = [-Math.sin(box.angle) * scaleX, Math.cos(box.angle) * scaleY] as const
          const angle = Math.atan2(along[1], along[0])
          const length = box.length * Math.hypot(...along)
          const thickness = box.thickness * Math.hypot(...across)
          const centerX = region.left + box.centerX * scaleX
          const centerY = region.top + box.centerY * scaleY
          // Text runs along its direction. Steep or vertical text may read either way (up a heel or down a neck
          // label): both are tried and the more confident one kept.
          const candidates = Math.abs(angle) > Math.PI / 4
            ? [[angle, length, thickness], [angle + Math.PI, length, thickness]] as const
            : [[angle, length, thickness]] as const
          let best: TextLine | undefined
          for (const [direction, textLength, textThickness] of candidates) {
            const read = await recognize(bitmap, centerX, centerY, direction, textLength, textThickness)
            if (read.text.trim() && (!best || read.score > best.score)) {
              best = { ...read, shape: { centerX, centerY, angle: direction, length: textLength, thickness: textThickness } }
            }
          }          if (best) {
            best.bounds = { left: region.left + box.left * scaleX, top: region.top + box.top * scaleY, right: region.left + box.right * scaleX, bottom: region.top + box.bottom * scaleY }
            lines.push(best)
          }
        }
        return lines
      }

      return async (image) => {
        const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
        try {
          const whole = { left: 0, top: 0, right: bitmap.width, bottom: bitmap.height }
          const lines = await readRegion(bitmap, whole, 1)
          // A label is often a small part of the photo: a second, closer look at the area with text finds what
          // was too small the first time (a size in a circle, a table of sizes).
          const area = textArea(lines, bitmap.width, bitmap.height)
          if (!area || (area.right - area.left) * (area.bottom - area.top) > ZOOM_BELOW * bitmap.width * bitmap.height) return lines
          return mergeLines(lines, await readRegion(bitmap, area, MAX_ZOOM))
        } finally {
          bitmap.close()
        }
      }
    })()
    readerPromise = pending.catch((error: unknown) => {
      readerPromise = undefined
      throw error
    })
  }
  return readerPromise
}

/** Lines of text visible in a photo, with the recognizer's mean confidence per line. */
export async function readText(image: Blob): Promise<TextLine[]> {
  return (await loadReader())(image)
}
