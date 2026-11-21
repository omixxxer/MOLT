import type { GarmentCategory } from '../types/domain'

// A tidier picture of a garment for the wardrobe, from its cut-out (prototype, measured in bench/recompose.html):
// straightened when it was clearly photographed askew, centred and sized by its kind (every T-shirt the same size,
// a coat bigger than a belt), brightened a little when the photo was dark, without the stray specks of the cut-out,
// and with a soft shadow under it. Nothing is generated: the garment's own pixels, only moved and lit. The photo
// and the cut-out are never changed.

/** The picture: the wardrobe cards are 4:5. */
export const OUT_WIDTH = 800
export const OUT_HEIGHT = 1000

/** Share of the picture each kind of garment may take (width, height). */
const FIT: Record<GarmentCategory, [number, number]> = {
  'Parte superior': [0.8, 0.74],
  'Parte inferior': [0.66, 0.82],
  'Vestido / mono': [0.7, 0.84],
  Abrigo: [0.82, 0.8],
  Calzado: [0.74, 0.5],
  Accesorio: [0.6, 0.56]
}

/** Only a garment clearly askew is turned: between these degrees (less is noise; more is how it is, like a sleeve). */
const MIN_TURN = 3
const MAX_TURN = 25
/** The silhouette must be this much longer one way than the other for its direction to mean anything. */
const MIN_ELONGATION = 1.35

/** Pieces of the cut-out smaller than this share of it are specks (a thread, a bit of the floor). */
const SPECK = 0.01

/** Keeps the opaque areas that are not specks: 1 for kept pixels, 0 for the rest. */
export function cleanMask(alpha: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 128): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) mask[i] = alpha[i]! >= threshold ? 1 : 0
  const total = mask.reduce((sum, value) => sum + value, 0)
  const label = new Int32Array(width * height)
  const keep = new Uint8Array(width * height)
  let next = 1
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || label[start]) continue
    const stack = [start]
    const members: number[] = []
    label[start] = next
    while (stack.length) {
      const index = stack.pop()!
      members.push(index)
      const x = index % width
      const y = (index - x) / width
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const neighbour = ny * width + nx
        if (mask[neighbour] && !label[neighbour]) {
          label[neighbour] = next
          stack.push(neighbour)
        }
      }
    }
    if (members.length >= total * SPECK) for (const index of members) keep[index] = 1
    next += 1
  }
  return keep
}

/**
 * How many degrees the silhouette is turned from upright (or from lying flat), from its principal axis; 0 when it
 * is not elongated enough to say, or turned too little or too much to touch.
 */
export function straightenAngle(mask: Uint8Array, width: number): number {
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue
    count += 1
    sumX += i % width
    sumY += Math.floor(i / width)
  }
  if (count < 50) return 0
  const meanX = sumX / count
  const meanY = sumY / count
  let xx = 0
  let yy = 0
  let xy = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue
    const dx = (i % width) - meanX
    const dy = Math.floor(i / width) - meanY
    xx += dx * dx
    yy += dy * dy
    xy += dx * dy
  }
  const trace = xx + yy
  const root = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy)
  const major = trace / 2 + root
  const minor = trace / 2 - root
  if (minor <= 0 || Math.sqrt(major / minor) < MIN_ELONGATION) return 0
  // Direction of the major axis (image coordinates, y down), then its distance to the nearest of upright and flat.
  const degrees = (Math.atan2(2 * xy, xx - yy) / 2) * 180 / Math.PI
  let off = ((degrees % 90) + 90) % 90
  if (off > 45) off -= 90
  return Math.abs(off) >= MIN_TURN && Math.abs(off) <= MAX_TURN ? off : 0
}

/**
 * A gain for a dark photo, from the whole photo (garment and background): its brightest part (98th percentile of
 * the luminance) is taken up towards 235, at most ×1.25. Measured on the garment alone it cannot tell a dark photo
 * from a dark garment: it lifted black trousers and sweatshirts to grey (bench/recompose.html, 20-11-2026). A
 * black jacket on a lit bed has a bright background, so it is not touched.
 */
export function exposureGain(luminances: number[]): number {
  if (!luminances.length) return 1
  const sorted = [...luminances].sort((a, b) => a - b)
  const top = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]!
  if (top >= 215) return 1
  return Math.min(1.25, 235 / Math.max(top, 1))
}

/** Where the garment goes in the picture: scaled to its kind's share, centred, a little above the middle. */
export function placement(category: GarmentCategory, width: number, height: number) {
  const [shareWidth, shareHeight] = FIT[category] ?? FIT['Parte superior']
  const scale = Math.min((OUT_WIDTH * shareWidth) / width, (OUT_HEIGHT * shareHeight) / height)
  const drawnWidth = width * scale
  const drawnHeight = height * scale
  return { scale, x: (OUT_WIDTH - drawnWidth) / 2, y: OUT_HEIGHT * 0.47 - drawnHeight / 2, width: drawnWidth, height: drawnHeight }
}

export interface Recomposed {
  image: Blob
  /** Degrees it was turned (0 when it was not). */
  angle: number
  /** Light gain applied (1 when none). */
  gain: number
  /** Pixels taken away as specks, as a share of the cut-out. */
  specks: number
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('El navegador no permite procesar la imagen.')
  return { element, context }
}

/** Luminance of the photo's pixels, read small (every pixel of a 256 px copy). */
async function photoLuminances(photo: Blob): Promise<number[]> {
  const bitmap = await createImageBitmap(photo)
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height))
    const small = canvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
    small.context.drawImage(bitmap, 0, 0, small.element.width, small.element.height)
    const data = small.context.getImageData(0, 0, small.element.width, small.element.height).data
    const values: number[] = []
    for (let i = 0; i < data.length; i += 4) values.push(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    return values
  } finally {
    bitmap.close()
  }
}

/**
 * The tidy picture of a cut-out (a PNG or WebP with transparency); undefined when it has no transparency to work
 * with (a garment kept with its background), which stays as it is.
 */
export async function recompose(cutout: Blob, category: GarmentCategory, photo?: Blob): Promise<Recomposed | undefined> {
  const bitmap = await createImageBitmap(cutout)
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const source = canvas(width, height)
    source.context.drawImage(bitmap, 0, 0, width, height)
    const pixels = source.context.getImageData(0, 0, width, height)
    const alpha = Uint8ClampedArray.from({ length: width * height }, (_, i) => pixels.data[i * 4 + 3]!)
    const transparent = alpha.reduce((sum, value) => sum + (value < 128 ? 1 : 0), 0) / alpha.length
    if (transparent < 0.02) return undefined

    // Specks out, and a little light when the photo was dark.
    const mask = cleanMask(alpha, width, height)
    let removed = 0
    let kept = 0
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i]) {
        kept += 1
        continue
      }
      if (alpha[i]! >= 128) removed += 1
      pixels.data[i * 4 + 3] = alpha[i]! < 128 ? alpha[i]! : 0
    }
    const gain = photo ? exposureGain(await photoLuminances(photo)) : 1
    if (gain !== 1) for (let i = 0; i < mask.length; i += 1) for (let c = 0; c < 3; c += 1) pixels.data[i * 4 + c] = Math.min(255, pixels.data[i * 4 + c]! * gain)
    source.context.putImageData(pixels, 0, 0)

    // Turned upright, on a canvas big enough for any turn, then cropped to what is opaque.
    const angle = category === 'Accesorio' ? 0 : straightenAngle(mask, width)
    const side = Math.ceil(Math.hypot(width, height))
    const turned = canvas(side, side)
    turned.context.translate(side / 2, side / 2)
    turned.context.rotate((-angle * Math.PI) / 180)
    turned.context.drawImage(source.element, -width / 2, -height / 2)
    const turnedAlpha = turned.context.getImageData(0, 0, side, side).data
    let left = side
    let top = side
    let right = -1
    let bottom = -1
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        if (turnedAlpha[(y * side + x) * 4 + 3]! < 128) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
    if (right < left) return undefined
    const boxWidth = right - left + 1
    const boxHeight = bottom - top + 1

    // On white, as the other pictures (the wardrobe card blends white into its colour), with a soft shadow.
    const out = canvas(OUT_WIDTH, OUT_HEIGHT)
    out.context.fillStyle = '#ffffff'
    out.context.fillRect(0, 0, OUT_WIDTH, OUT_HEIGHT)
    const place = placement(category, boxWidth, boxHeight)
    const floor = place.y + place.height
    const glow = out.context.createRadialGradient(OUT_WIDTH / 2, floor, 0, OUT_WIDTH / 2, floor, place.width * 0.5)
    glow.addColorStop(0, 'rgba(45, 40, 56, 0.16)')
    glow.addColorStop(1, 'rgba(45, 40, 56, 0)')
    out.context.save()
    out.context.translate(0, floor)
    out.context.scale(1, 0.12)
    out.context.translate(0, -floor)
    out.context.fillStyle = glow
    out.context.fillRect(0, floor - place.width * 0.5, OUT_WIDTH, place.width)
    out.context.restore()
    out.context.shadowColor = 'rgba(45, 40, 56, 0.18)'
    out.context.shadowBlur = 22
    out.context.shadowOffsetY = 8
    out.context.drawImage(turned.element, left, top, boxWidth, boxHeight, place.x, place.y, place.width, place.height)

    const image = await new Promise<Blob>((resolve, reject) => out.element.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/jpeg', 0.86))
    return { image, angle, gain, specks: removed / Math.max(1, kept + removed) }
  } finally {
    bitmap.close()
  }
}
