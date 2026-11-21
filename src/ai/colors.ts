// Garment colours from pixels: each pixel is named in CIELAB (closer to how we see colour than RGB). A pixel with
// little colour (chroma under NEUTRAL_CHROMA) is black, grey or white by its lightness; any other, the nearest
// coloured shade of the taxonomy palette. The colours covering a fair share of the garment are returned. With a mask
// (from the segmentation head) only garment pixels count; without one, the border colour is taken as background.

interface PaletteColor {
  label: string
  rgb: [number, number, number]
}

// Reference shades; the names are the taxonomy labels. Some names have several shades: light grey is grey,
// burgundy is red, khaki and camel are beige, olive is green, denim is blue.
const PALETTE: PaletteColor[] = [
  { label: 'Negro', rgb: [28, 28, 30] },
  { label: 'Blanco', rgb: [244, 244, 240] },
  { label: 'Gris', rgb: [125, 125, 125] },
  { label: 'Gris', rgb: [80, 82, 86] },
  { label: 'Gris', rgb: [192, 192, 190] },
  { label: 'Beige', rgb: [214, 196, 163] },
  { label: 'Beige', rgb: [176, 156, 118] },
  { label: 'Beige', rgb: [196, 154, 108] },
  { label: 'Marrón', rgb: [112, 76, 50] },
  { label: 'Marrón', rgb: [70, 50, 38] },
  { label: 'Rojo', rgb: [190, 32, 40] },
  { label: 'Rojo', rgb: [104, 28, 40] },
  { label: 'Rojo', rgb: [66, 22, 32] },
  { label: 'Naranja', rgb: [236, 122, 40] },
  { label: 'Amarillo', rgb: [238, 208, 60] },
  { label: 'Verde', rgb: [64, 128, 72] },
  { label: 'Verde', rgb: [104, 108, 62] },
  { label: 'Verde', rgb: [150, 200, 150] },
  { label: 'Azul', rgb: [52, 102, 190] },
  { label: 'Azul', rgb: [96, 128, 168] },
  { label: 'Azul', rgb: [150, 185, 220] },
  { label: 'Azul marino', rgb: [32, 40, 78] },
  { label: 'Morado', rgb: [112, 62, 140] },
  { label: 'Morado', rgb: [180, 150, 205] },
  { label: 'Rosa', rgb: [236, 152, 180] },
  { label: 'Rosa', rgb: [214, 92, 140] }
]

/** sRGB (0–255) to CIELAB (D65). */
export function toLab(red: number, green: number, blue: number): [number, number, number] {
  const linear = [red, green, blue].map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const NEUTRALS = new Set(['Negro', 'Blanco', 'Gris'])
const paletteLab = PALETTE.filter((entry) => !NEUTRALS.has(entry.label)).map((entry) => ({ label: entry.label, lab: toLab(...entry.rgb) }))

// Measured on 74 photos of Clothing Dataset (garments on floors and walls, often dim) and 28 own photos, with the
// colours reviewed by hand (bench/colors.html): a white shirt in dim light is L ≈ 72–82 with chroma ≈ 3, and a
// faded blue one has chroma ≈ 6–8, so nearest-shade naming called most of them «Gris claro».
const NEUTRAL_CHROMA = 10
const BLACK_BELOW = 30
const WHITE_FROM = 75

/** CSS colour to show a colour name as a swatch (its first shade); several colours for «Multicolor». */
export function colorSwatch(label: string): string {
  if (label === 'Multicolor') return 'conic-gradient(#b5463c, #d9a441, #5e8a5a, #3f6ea5, #7a5a9c, #b5463c)'
  // Metals are chosen by hand (jewellery, buckles): their shine cannot be told from yellow or grey by the pixels, so
  // they are not in PALETTE and colorName never returns them.
  if (label === 'Dorado') return 'linear-gradient(135deg, #f3dc8e, #b98a2e 55%, #e9c86a)'
  if (label === 'Plateado') return 'linear-gradient(135deg, #f1f1f3, #9b9ea6 55%, #dadbe0)'
  // Named by earlier versions; garments saved then may still have it.
  if (label === 'Gris claro') return 'rgb(192 192 190)'
  const entry = PALETTE.find((color) => color.label === label)
  return entry ? `rgb(${entry.rgb.join(' ')})` : 'var(--stone)'
}

/** The palette colour of an RGB value: a neutral by lightness when it has little colour, else the nearest shade. */
export function colorName(red: number, green: number, blue: number): string {
  const [l, a, b] = toLab(red, green, blue)
  if (Math.hypot(a, b) < NEUTRAL_CHROMA) return l < BLACK_BELOW ? 'Negro' : l >= WHITE_FROM ? 'Blanco' : 'Gris'
  let best = paletteLab[0]!
  let bestDistance = Infinity
  for (const entry of paletteLab) {
    const distance = (l - entry.lab[0]) ** 2 + (a - entry.lab[1]) ** 2 + (b - entry.lab[2]) ** 2
    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
    }
  }
  return best.label
}

export interface ColorShare {
  color: string
  /** Share of the garment's pixels with this colour. */
  share: number
}

/** Without a mask: everything inside an 8 % margin that does not look like the border's most common colour. */
function backgroundHeuristic(pixels: ImageData): Uint8Array {
  const { data, width, height } = pixels
  const bucket = (offset: number) => [data[offset]!, data[offset + 1]!, data[offset + 2]!].map((value) => Math.floor(value / 32)).join(':')
  const border = new Map<string, number>()
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) continue
      const key = bucket((y * width + x) * 4)
      border.set(key, (border.get(key) ?? 0) + 1)
    }
  }
  const background = [...border.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.split(':').map((value) => Number(value) * 32 + 16)
  const mask = new Uint8Array(width * height)
  const marginX = Math.floor(width * 0.08)
  const marginY = Math.floor(height * 0.08)
  for (let y = marginY; y < height - marginY; y += 1) {
    for (let x = marginX; x < width - marginX; x += 1) {
      const offset = (y * width + x) * 4
      const away = !background || Math.abs(data[offset]! - background[0]!) + Math.abs(data[offset + 1]! - background[1]!) + Math.abs(data[offset + 2]! - background[2]!) >= 72
      mask[y * width + x] = away ? 1 : 0
    }
  }
  return mask
}

/**
 * The mask without its edge: pixels at most `radius` away (in a square) from a pixel outside it. Edge pixels blend
 * the garment with what is around it (the backdrop, a soft cut-out edge), so they do not say the garment's colour.
 * When that would leave under 40 % of the mask (a strap, a thin belt), the whole mask is kept.
 */
export function maskInterior(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius < 1) return mask
  // Distance to the nearest outside pixel along rows, then along columns (square neighbourhood).
  const across = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    let run = 0
    for (let x = 0; x < width; x += 1) {
      run = mask[y * width + x] ? run + 1 : 0
      across[y * width + x] = Math.min(run, radius + 1)
    }
    run = 0
    for (let x = width - 1; x >= 0; x -= 1) {
      run = mask[y * width + x] ? run + 1 : 0
      across[y * width + x] = Math.min(across[y * width + x]!, run)
    }
  }
  const interior = new Uint8Array(width * height)
  for (let x = 0; x < width; x += 1) {
    let run = 0
    const down = new Uint8Array(height)
    for (let y = 0; y < height; y += 1) {
      run = across[y * width + x]! > radius ? run + 1 : 0
      down[y] = Math.min(run, radius + 1)
    }
    run = 0
    for (let y = height - 1; y >= 0; y -= 1) {
      run = across[y * width + x]! > radius ? run + 1 : 0
      if (Math.min(down[y]!, run) > radius) interior[y * width + x] = 1
    }
  }
  const before = mask.reduce((sum, value) => sum + (value ? 1 : 0), 0)
  const after = interior.reduce((sum, value) => sum + value, 0)
  return after >= before * 0.4 ? interior : mask
}

/**
 * Colours of the garment, most common first, each covering at least `minShare` of it (at most three). A mask with
 * too few pixels (under 3 % of the image) is ignored in favour of the background heuristic.
 */
export function garmentColors(pixels: ImageData, mask?: Uint8Array, minShare = 0.15): ColorShare[] {
  const { data, width, height } = pixels
  if (!width || !height || data.length < width * height * 4) return []
  const masked = mask ? mask.reduce((sum, value) => sum + (value ? 1 : 0), 0) : 0
  const use = maskInterior(mask && masked >= width * height * 0.03 ? mask : backgroundHeuristic(pixels), width, height, Math.round(Math.min(width, height) / 48))
  const counts = new Map<string, number>()
  let total = 0
  for (let i = 0; i < width * height; i += 1) {
    if (!use[i] || data[i * 4 + 3]! < 128) continue
    const name = colorName(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!)
    counts.set(name, (counts.get(name) ?? 0) + 1)
    total += 1
  }
  if (!total) return []
  return [...counts.entries()]
    .map(([color, count]) => ({ color, share: count / total }))
    .filter((entry) => entry.share >= minShare)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3)
}
