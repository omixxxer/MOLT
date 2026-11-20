// Cutting the garments stored in this browser out again (read only): the cut-out kept with each one, the one the
// app makes today, and today's with MediaPipe's body parts (skin and hair out when a person is in the photo, and
// then only what it calls clothes). How much background is left is estimated without reference masks: a pixel of a
// cut-out looks like background when its colour is much commoner on the photo's border (the bedspread, the floor)
// than on the part every version agrees is the garment.
import { analyzeGarmentImage } from '../src/ai/clothingAnalyzer'
import { cutOutGarments, type GarmentCutout, type LookOptions } from '../src/ai/cutout'
import type { SegmentationMap } from '../src/ai/segmentation'
import { garmentRepository } from '../src/db/garmentRepository'
import { categoryIdForLabel } from '../src/ml/taxonomy'

const status = document.querySelector('#status')!
const say = (text: string) => { status.textContent = text }
const SIDE = 256
const BINS = 6

type Variant = 'hoy' | 'propuesta'

async function pixelsOf(image: Blob, width: number, height: number, place?: GarmentCutout['place']) {
  const bitmap = await createImageBitmap(image)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  if (place) context.drawImage(bitmap, place.x * width, place.y * height, place.width * width, place.height * height)
  else context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return context.getImageData(0, 0, width, height).data
}

const bin = (data: Uint8ClampedArray, i: number) => Math.min(BINS - 1, Math.floor(data[i * 4]! / (256 / BINS))) * BINS * BINS + Math.min(BINS - 1, Math.floor(data[i * 4 + 1]! / (256 / BINS))) * BINS + Math.min(BINS - 1, Math.floor(data[i * 4 + 2]! / (256 / BINS)))

function histogram(data: Uint8ClampedArray, members: (i: number) => boolean, count: number) {
  const bins = new Float32Array(BINS ** 3)
  let total = 0
  for (let i = 0; i < count; i += 1) if (members(i)) { bins[bin(data, i)]! += 1; total += 1 }
  for (let b = 0; b < bins.length; b += 1) bins[b] = bins[b]! / Math.max(1, total)
  return bins
}

function thumb(image: Blob | undefined, label: string) {
  const cell = document.createElement('figure')
  cell.innerHTML = image ? `<img alt="" src="${URL.createObjectURL(image)}" /><figcaption>${label}</figcaption>` : `<div class="none">—</div><figcaption>${label}</figcaption>`
  return cell
}

export async function run() {
  const { readBody } = await import('../src/ai/body')
  const garments = await garmentRepository.list()
  const rows: Array<{ name: string; person: boolean; leak: Record<string, number | undefined>; areaVsToday: Record<string, number | undefined> }> = []
  for (const [index, garment] of garments.entries()) {
    say(`${index + 1}/${garments.length}: ${garment.name}`)
    const photos = await garmentRepository.photos(garment.id)
    if (!photos?.image) continue
    const photo = photos.image
    const [map] = (await analyzeGarmentImage([photo])).segmentations as Array<SegmentationMap | undefined>
    if (!map) continue
    const body = await readBody(photo).catch(() => undefined)
    // The proposal: with a person, only the garment's own regions without skin or hair; then only what MediaPipe
    // calls clothes, unless the backdrop was plain.
    const focus = categoryIdForLabel(garment.category)
    const options: Record<Variant, LookOptions> = {
      hoy: {},
      propuesta: body ? { body, clean: 'skin', clothes: true, ...(focus ? { focus } : {}) } : {}
    }
    const cut: Partial<Record<Variant, GarmentCutout>> = {}
    for (const variant of Object.keys(options) as Variant[]) [cut[variant]] = await cutOutGarments(photo, map, 'single', options[variant])

    // Where each version is on a small copy of the photo, the border, and what they all agree is the garment.
    const bitmap = await createImageBitmap(photo)
    const width = Math.max(1, Math.round(SIDE * Math.min(1, bitmap.width / bitmap.height)))
    const height = Math.max(1, Math.round(SIDE * Math.min(1, bitmap.height / bitmap.width)))
    bitmap.close()
    const image = await pixelsOf(photo, width, height)
    const masks: Partial<Record<Variant, Uint8Array>> = {}
    for (const variant of Object.keys(cut) as Variant[]) {
      const found = cut[variant]
      if (!found) continue
      const data = await pixelsOf(found.image, width, height, found.place)
      masks[variant] = Uint8Array.from({ length: width * height }, (_, i) => (data[i * 4 + 3]! >= 128 ? 1 : 0))
    }
    const all = Object.values(masks)
    const core = (i: number) => all.length > 0 && all.every((mask) => mask[i] === 1)
    const ring = Math.max(2, Math.round(Math.min(width, height) * 0.05))
    const border = (i: number) => { const x = i % width; const y = Math.floor(i / width); return x < ring || y < ring || x >= width - ring || y >= height - ring }
    const backdrop = histogram(image, border, width * height)
    const garmentColours = histogram(image, core, width * height)
    const leak = (mask: Uint8Array | undefined) => {
      if (!mask) return undefined
      let inside = 0
      let like = 0
      for (let i = 0; i < mask.length; i += 1) {
        if (!mask[i]) continue
        inside += 1
        const b = bin(image, i)
        if (!core(i) && backdrop[b]! > 1.5 * garmentColours[b]! && backdrop[b]! > 0.002) like += 1
      }
      return inside ? like / inside : 0
    }
    const area = (mask: Uint8Array | undefined) => mask?.reduce((sum, value) => sum + value, 0) ?? 0
    const row = {
      name: garment.name,
      person: Boolean(body?.landmarks),
      leak: Object.fromEntries((Object.keys(options) as Variant[]).map((variant) => [variant, leak(masks[variant])])),
      areaVsToday: Object.fromEntries((Object.keys(options) as Variant[]).map((variant) => [variant, area(masks.hoy) ? area(masks[variant]) / area(masks.hoy) : undefined]))
    }
    rows.push(row)

    const line = document.createElement('div')
    line.className = 'row'
    line.append(thumb(photo, 'foto'), thumb(photos.cutout, 'guardado'))
    for (const variant of Object.keys(options) as Variant[]) {
      const value = row.leak[variant]
      line.append(thumb(cut[variant]?.image, `${variant}${value === undefined ? '' : ` · fondo ${(value * 100).toFixed(0)} %`}`))
    }
    const title = document.createElement('h3')
    title.textContent = `${garment.name}${row.person ? ' (con persona)' : ''}`
    document.querySelector('#rows')!.append(title, line)
  }
  const mean = (variant: Variant) => {
    const values = rows.map((row) => row.leak[variant]).filter((value): value is number => value !== undefined)
    return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(3))
  }
  const summary = {
    garments: rows.length,
    withPerson: rows.filter((row) => row.person).length,
    backgroundLeftMean: { hoy: mean('hoy'), propuesta: mean('propuesta') },
    changed: rows.filter((row) => Math.abs((row.areaVsToday.propuesta ?? 1) - 1) > 0.02).map((row) => `${row.name} ${(((row.areaVsToday.propuesta ?? 1)) * 100).toFixed(0)} %`)
  }
  document.querySelector('#summary')!.innerHTML = `<pre>${JSON.stringify(summary, null, 1)}</pre>`
  say(`Listo: ${rows.length} prendas.`)
  return { summary, rows }
}

declare global { interface Window { recutResult?: unknown } }
void run().then((result) => { window.recutResult = result }).catch((error: unknown) => say(`Error: ${String(error)}`))
