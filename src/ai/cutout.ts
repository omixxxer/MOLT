import { garmentColors, type ColorShare } from './colors'
import { encodeImage, outline, outlineAlpha } from './sam'
import { bestMatch, borderCoverage, garmentRegions, patchCenter, promptFor, regionMask, type Region, type SegmentationMap } from './segmentation'

// Garments cut out of a photo with a transparent background: the coarse map says where each one is, SlimSAM
// draws its exact outline, and anything far from the coarse region is dropped (an arm, the wall behind).

/** Cut-outs are made at most this size (longest side), plenty for the gallery and the detail view. */
const CUTOUT_SIDE = 1024
/** Size used to compare SlimSAM's candidates with the coarse region. */
const MATCH_SIDE = 128
const MIN_COVERAGE = 0.01
/** The outline must cover at least this share of the coarse region, or SlimSAM did not find the garment. */
const MIN_RECALL = 0.5

export interface GarmentCutout {
  region: Region
  /** The garment on a transparent background, cropped to it (WebP, or PNG where WebP cannot be written). */
  image: Blob
  width: number
  height: number
  /** Share of the photo the garment covers. */
  coverage: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of the alpha above `threshold`, grown by `margin` of its size, or undefined if empty. */
export function alphaBox(alpha: Uint8ClampedArray, width: number, height: number, threshold = 128, margin = 0.04): Box | undefined {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x]! < threshold) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return undefined
  const padX = Math.round((right - left + 1) * margin)
  const padY = Math.round((bottom - top + 1) * margin)
  const x = Math.max(0, left - padX)
  const y = Math.max(0, top - padY)
  return { x, y, width: Math.min(width, right + 1 + padX) - x, height: Math.min(height, bottom + 1 + padY) - y }
}

/** The chosen outline is a garment: not the background (most of the border) and covering most of the region. */
export function outlineFound(mask: Uint8Array, coarse: Uint8Array, width: number, height: number): boolean {
  let inRegion = 0
  let covered = 0
  for (let i = 0; i < coarse.length; i += 1) {
    if (!coarse[i]) continue
    inRegion += 1
    if (mask[i]) covered += 1
  }
  return borderCoverage(mask, width, height) <= 0.4 && inRegion > 0 && covered / inRegion >= MIN_RECALL
}

/** Colours of a cut-out, from its opaque pixels only. */
export async function cutoutColors(image: Blob): Promise<ColorShare[]> {
  const bitmap = await createImageBitmap(image)
  try {
    const size = sizeWithin(bitmap.width, bitmap.height, 96)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return []
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const pixels = context.getImageData(0, 0, size.width, size.height)
    const opaque = new Uint8Array(size.width * size.height).map((_, i) => (pixels.data[i * 4 + 3]! >= 128 ? 1 : 0))
    return garmentColors(pixels, opaque)
  } finally {
    bitmap.close()
  }
}

/**
 * Product photos on a plain backdrop: when most of the border has one colour, everything of that colour connected
 * to the border is background (like a chroma key, pixel exact). Returns alpha (0 or 255, with a soft 1 px edge),
 * or undefined when the backdrop is not plain. With the garment's coarse region (`garment`, same size): when the
 * fill eats into its interior (a light grey sweatshirt on white lost whole pieces), a pixel there must be almost
 * the backdrop's colour to go; and opaque specks that do not touch the region (dust, a shadow's edge) are
 * dropped. Exported for tests.
 */
export function plainBackgroundAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 34,
  garment?: { region: Uint8Array; interior: Uint8Array }
): Uint8ClampedArray | undefined {
  const border: number[] = []
  for (let x = 0; x < width; x += 1) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y += 1) border.push(y * width, y * width + width - 1)
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (const i of border) {
    const key = `${data[i * 4]! >> 4}:${data[i * 4 + 1]! >> 4}:${data[i * 4 + 2]! >> 4}`
    const entry = counts.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    entry.count += 1
    entry.r += data[i * 4]!
    entry.g += data[i * 4 + 1]!
    entry.b += data[i * 4 + 2]!
    counts.set(key, entry)
  }
  const dominant = [...counts.values()].sort((a, b) => b.count - a.count)[0]!
  const reference = [dominant.r / dominant.count, dominant.g / dominant.count, dominant.b / dominant.count]
  const difference = (i: number) => Math.abs(data[i * 4]! - reference[0]!) + Math.abs(data[i * 4 + 1]! - reference[1]!) + Math.abs(data[i * 4 + 2]! - reference[2]!)
  if (border.filter((i) => difference(i) <= tolerance * 3).length < border.length * 0.7) return undefined

  const fill = (strictInGarment: boolean) => {
    const near = (i: number) => difference(i) <= (strictInGarment && garment?.interior[i] ? GARMENT_TOLERANCE : tolerance) * 3
    const background = new Uint8Array(width * height)
    const stack = border.filter(near)
    for (const i of stack) background[i] = 1
    while (stack.length) {
      const i = stack.pop()!
      const x = i % width
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (next >= 0 && next < width * height && !background[next] && near(next)) {
          background[next] = 1
          stack.push(next)
        }
      }
    }
    return background
  }
  let background = fill(false)
  if (garment) {
    // Stricter inside the garment only when it is light (its colour close to the backdrop) and the plain fill ate
    // into it; not for a dark bag, whose handle shows backdrop in shadow that must still go. What counts as eaten
    // is what was removed there but is clearly not the backdrop's colour (the coarse region covers some backdrop).
    const inside: number[] = []
    let eaten = 0
    for (let i = 0; i < garment.interior.length; i += 1) {
      if (!garment.interior[i]) continue
      inside.push(difference(i))
      if (background[i] && difference(i) > CLEARLY_NOT_BACKDROP) eaten += 1
    }
    inside.sort((a, b) => a - b)
    const light = inside.length > 0 && inside[Math.floor(inside.length / 2)]! <= LIGHT_GARMENT
    if (light && eaten / inside.length > 0.08) background = fill(true)
    dropSpecks(background, garment.region, width, height)
  }
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alpha.length; i += 1) {
    if (background[i]) continue
    const x = i % width
    const edge = (x > 0 && background[i - 1]) || (x < width - 1 && background[i + 1]) || background[i - width] || background[i + width]
    alpha[i] = edge ? 140 : 255
  }
  return alpha
}

/** Inside the garment a pixel only counts as backdrop when its colour is this close (per channel). */
const GARMENT_TOLERANCE = 10
/** Summed over the channels: a light grey garment on white is ~90 away, a soft shadow ~50. */
const CLEARLY_NOT_BACKDROP = 60
/** A garment whose typical pixel is this close to the backdrop (summed) is a light garment on a light backdrop. */
const LIGHT_GARMENT = 150

/** Opaque patches that do not touch the garment become background (in place). */
function dropSpecks(background: Uint8Array, garment: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(width * height)
  for (let start = 0; start < background.length; start += 1) {
    if (background[start] || seen[start]) continue
    const pixels = [start]
    seen[start] = 1
    let touches = false
    for (let index = 0; index < pixels.length; index += 1) {
      const i = pixels[index]!
      if (garment[i]) touches = true
      const x = i % width
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (next >= 0 && next < width * height && !background[next] && !seen[next]) {
          seen[next] = 1
          pixels.push(next)
        }
      }
    }
    if (!touches) for (const i of pixels) background[i] = 1
  }
}

/** Share of the region (mask of the same size) the alpha covers, and of the alpha inside the region. */
function agreement(alpha: Uint8ClampedArray, region: Uint8Array): { recall: number; precision: number } {
  let inRegion = 0
  let opaque = 0
  let both = 0
  for (let i = 0; i < alpha.length; i += 1) {
    const on = alpha[i]! >= 128
    if (region[i]) inRegion += 1
    if (on) opaque += 1
    if (on && region[i]) both += 1
  }
  return { recall: inRegion ? both / inRegion : 0, precision: opaque ? both / opaque : 0 }
}

function sizeWithin(width: number, height: number, side: number) {
  const scale = Math.min(1, side / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
  if (webp?.type === 'image/webp') return webp
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('No se pudo crear el recorte de la prenda.')
  return png
}

/**
 * The region to cut out of a photo of one garment: every garment area together (the head may read a hoodie's
 * sleeves as outerwear, a shoe as bits of several classes). None for a close-up: the garment fills the photo and
 * there is no background to remove (the plain fill took the fabric itself for one). Exported for tests.
 */
export function singleGarmentRegion(map: SegmentationMap, width: number, height: number): Region | undefined {
  const [merged] = garmentRegions(map, width, height, true)
  if (!merged) return undefined
  let visible = 0
  for (let patch = 0; patch < map.grid * map.grid; patch += 1) if (patchCenter(patch, map.grid, width, height)) visible += 1
  return merged.patches.length >= 0.85 * visible ? undefined : merged
}

/**
 * single: the photo shows one garment (see singleGarmentRegion). outfit: a person wearing several, one cut-out per
 * garment found, largest first.
 */
export async function cutOutGarments(photo: Blob, map: SegmentationMap, mode: 'single' | 'outfit'): Promise<GarmentCutout[]> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  try {
    const work = sizeWithin(bitmap.width, bitmap.height, CUTOUT_SIDE)
    const match = sizeWithin(bitmap.width, bitmap.height, MATCH_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = work.width
    canvas.height = work.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('El navegador no permite procesar la imagen.')
    context.drawImage(bitmap, 0, 0, work.width, work.height)
    const pixels = context.getImageData(0, 0, work.width, work.height)

    // A product picture that already comes without background (transparent PNG or WebP) keeps its own outline:
    // the models see its transparent part as black and would cut it worse.
    const own = Uint8ClampedArray.from({ length: work.width * work.height }, (_, i) => pixels.data[i * 4 + 3]!)
    const transparent = own.reduce((count, value) => count + (value < 128 ? 1 : 0), 0) / own.length
    if (mode === 'single' && transparent >= 0.05 && transparent <= 0.95) {
      const box = alphaBox(own, work.width, work.height)
      return box ? [{ region: { classId: 'garment', patches: [], confidence: 1 }, image: await crop(own, box), width: box.width, height: box.height, coverage: 1 - transparent }] : []
    }

    const single = mode === 'single' ? singleGarmentRegion(map, bitmap.width, bitmap.height) : undefined
    const regions = mode === 'single' ? (single ? [single] : []) : garmentRegions(map, bitmap.width, bitmap.height, false)
    if (!regions.length) return []

    // A single garment on a plain backdrop is cut out pixel by pixel, without SlimSAM, if the result agrees with
    // where the segmentation head sees the garment.
    const coarse = (region: Region, grow: number) => regionMask(region, map.grid, bitmap.width, bitmap.height, work.width, work.height, grow)
    const plain = single
      ? plainBackgroundAlpha(pixels.data, work.width, work.height, 34, { region: coarse(single, 0), interior: coarse(single, -1) })
      : undefined
    let encoded: Awaited<ReturnType<typeof encodeImage>> | undefined
    const cutouts: GarmentCutout[] = []
    for (const region of regions) {
      const near = regionMask(region, map.grid, bitmap.width, bitmap.height, work.width, work.height, 1)
      let alpha: Uint8ClampedArray | undefined
      if (plain) {
        const { recall, precision } = agreement(plain, near)
        // High precision: on a model photo the fill keeps the person (head, arms, the other garments) too.
        if (recall >= 0.4 && precision >= 0.92) alpha = plain.slice()
      }
      alpha ??= await outlineWithSam(region)
      if (!alpha) continue
      let covered = 0
      for (let i = 0; i < alpha.length; i += 1) {
        if (!near[i]) alpha[i] = 0
        if (alpha[i]! >= 128) covered += 1
      }
      const coverage = covered / alpha.length
      const box = alphaBox(alpha, work.width, work.height)
      if (!box || coverage < MIN_COVERAGE) continue
      cutouts.push({ region, image: await crop(alpha, box), width: box.width, height: box.height, coverage })
    }
    return cutouts

    async function outlineWithSam(region: Region): Promise<Uint8ClampedArray | undefined> {
      const image = encoded ??= await encodeImage(photo)
      const candidates = await outline(image, promptFor(region, map.grid, bitmap.width, bitmap.height, mode === 'single'))
      const coarse = regionMask(region, map.grid, bitmap.width, bitmap.height, match.width, match.height, 0)
      const binary = candidates.map((candidate) => Uint8Array.from(outlineAlpha(candidate.logits, image, match.width, match.height), (value) => value >= 128 ? 1 : 0))
      const index = bestMatch(binary, coarse, match.width, match.height)
      // Unsure (a light garment on a light background, say): better the original photo than a bad cut-out.
      if (!outlineFound(binary[index]!, coarse, match.width, match.height)) return undefined
      return outlineAlpha(candidates[index]!.logits, image, work.width, work.height)
    }

    async function crop(alpha: Uint8ClampedArray, box: Box): Promise<Blob> {
      const cut = new ImageData(box.width, box.height)
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const source = (box.y + y) * work.width + box.x + x
          const target = (y * box.width + x) * 4
          cut.data[target] = pixels.data[source * 4]!
          cut.data[target + 1] = pixels.data[source * 4 + 1]!
          cut.data[target + 2] = pixels.data[source * 4 + 2]!
          cut.data[target + 3] = alpha[source]!
        }
      }
      const output = document.createElement('canvas')
      output.width = box.width
      output.height = box.height
      output.getContext('2d')!.putImageData(cut, 0, 0)
      return canvasBlob(output)
    }
  } finally {
    bitmap.close()
  }
}
