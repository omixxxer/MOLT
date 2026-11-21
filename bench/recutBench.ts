// Would the tidier wardrobe pictures (src/ai/recompose.ts) improve with garments cut out again? For each garment of
// this browser or of a wardrobe backup (read only): the stored cut-out, today's (A) and today's with SlimSAM's
// second pass (B, src/ai/refine.ts), each recomposed. How much background is left is estimated without reference
// masks: a pixel of a cut-out looks like background when its colour is much commoner right around today's cut-out
// than inside it. B is guided by the same idea, so its figure flatters it; the pictures decide.
//
// Measured 21-11-2026 on a backup of 13 garments (9 different photos, all cut out 6–20 Nov.): A barely differs from
// the stored cut-outs (2 a little cleaner, the beige jacket dirtier). B changes 3 of the 9 photos: the black hoodie
// and the beige jacket lose the bedspread's bits; the orange sweatshirt loses most of them and a piece of a sleeve.
// Where the bedspread is a large part of the cut-out (the plaid jacket, the green hoodie, the grey jumper) it is
// taken for the garment and nothing changes. ~0.2 s more per garment.
//
// C (21-11-2026, same backup): B told where the segmentation map sees the garment, so the garment's colours are
// read only there and what the map leaves out of the cut-out counts as backdrop. It changes 7 of the 9 photos and
// takes nothing of a garment seen by eye: the green hoodie loses the whole bedspread around it; the beige jacket,
// the black hoodie and the navy sweatshirt (with the shirt under it) come out clean; the orange sweatshirt keeps its
// sleeve this time. Left: a bedspread band above the grey jumper, the orange flowers next to the orange sweatshirt
// (its own colour) and the plaid jacket, whose best outline takes out too little or a bit of the jacket. Background
// left, by the figure that flatters B and C: 9.9 % stored, 10.1 % A, 7.4 % B, 4.5 % C.
import { analyzeGarmentImage } from '../src/ai/clothingAnalyzer'
import { cutOutGarments, type GarmentCutout, type RefineReport } from '../src/ai/cutout'
import { recompose } from '../src/ai/recompose'
import { backdropColours, distanceInside } from '../src/ai/refine'
import type { SegmentationMap } from '../src/ai/segmentation'
import { garmentRepository } from '../src/db/garmentRepository'
import { readWardrobeBackup } from '../src/db/wardrobeBackup'
import type { Garment } from '../src/types/domain'

const status = document.querySelector('#status')!
const say = (text: string) => { status.textContent = text }
const SIDE = 256
const params = new URLSearchParams(location.search)
const limit = Number(params.get('limit') ?? Infinity)

type Variant = 'guardado' | 'A' | 'B' | 'C'
interface Source { garment: Garment; photo: Blob; cutout?: Blob }

async function pixels(image: Blob, width: number, height: number) {
  const bitmap = await createImageBitmap(image)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return context.getImageData(0, 0, width, height).data
}

async function sizeOf(image: Blob) {
  const bitmap = await createImageBitmap(image)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

/** The cut-out where it sits in the photo (small copy), 1 inside. */
async function maskInPhoto(cut: GarmentCutout, width: number, height: number) {
  const bitmap = await createImageBitmap(cut.image)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, cut.place.x * width, cut.place.y * height, cut.place.width * width, cut.place.height * height)
  bitmap.close()
  const data = context.getImageData(0, 0, width, height).data
  return Uint8Array.from({ length: width * height }, (_, i) => (data[i * 4 + 3]! >= 128 ? 1 : 0))
}

/** Share of a cut-out's opaque pixels with the backdrop's colours, and how many opaque pixels it has (small copy). */
async function leakOf(image: Blob, isBackdrop: (r: number, g: number, b: number) => boolean) {
  const size = await sizeOf(image)
  const scale = Math.min(1, SIDE / Math.max(size.width, size.height))
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))
  const data = await pixels(image, width, height)
  let opaque = 0
  let like = 0
  for (let i = 0; i < width * height; i += 1) {
    if (data[i * 4 + 3]! < 128) continue
    opaque += 1
    if (isBackdrop(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!)) like += 1
  }
  return opaque ? like / opaque : 0
}

function figure(image: Blob | undefined, label: string, kind: 'photo' | 'cut' | 'tidy', changed = false) {
  const cell = document.createElement('figure')
  cell.className = kind === 'cut' ? 'cut' : ''
  cell.innerHTML = image
    ? `<img alt="" class="${changed ? 'changed' : ''}" src="${URL.createObjectURL(image)}" /><figcaption>${label}</figcaption>`
    : `<div class="none">—</div><figcaption>${label}</figcaption>`
  return cell
}

async function sources(): Promise<Source[]> {
  const zip = params.get('zip')
  if (zip) {
    const backup = await readWardrobeBackup(await (await fetch(zip)).blob())
    return backup.garments.map((garment) => ({ garment, photo: garment.image, ...(garment.cutout ? { cutout: garment.cutout } : {}) }))
  }
  const garments = await garmentRepository.list()
  const found: Source[] = []
  for (const garment of garments) {
    const photos = await garmentRepository.photos(garment.id)
    if (photos?.image) found.push({ garment, photo: photos.image, ...(photos.cutout ? { cutout: photos.cutout } : {}) })
  }
  return found
}

export async function run(list?: Source[]) {
  const all = (list ?? await sources()).slice(0, limit)
  document.querySelector('#rows')!.replaceChildren()
  const rows: Array<{ name: string; category: string; leak: Partial<Record<Variant, number>>; changed: Partial<Record<'B' | 'C', boolean>>; areaVsA: Partial<Record<'B' | 'C', number>>; ms: Partial<Record<Variant, number>>; refine: Partial<Record<'B' | 'C', RefineReport>> }> = []
  for (const [index, { garment, photo, cutout: stored }] of all.entries()) {
    const name = garment.name || garment.subcategory || garment.category
    say(`${index + 1}/${all.length}: ${name}`)
    const [map] = (await analyzeGarmentImage([photo])).segmentations as Array<SegmentationMap | undefined>
    if (!map) continue
    const cut: Partial<Record<Variant, GarmentCutout>> = {}
    const ms: Partial<Record<Variant, number>> = {}
    const refine: Partial<Record<'B' | 'C', RefineReport>> = {}
    for (const variant of ['A', 'B', 'C'] as const) {
      const started = performance.now()
      const options = variant === 'A' ? {} : { refine: variant === 'C' ? 'map' as const : true, onRefine: (report: RefineReport) => { refine[variant] = report } }
      ;[cut[variant]] = await cutOutGarments(photo, map, 'single', options)
      ms[variant] = Math.round(performance.now() - started)
    }
    const images: Partial<Record<Variant, Blob>> = { ...(stored ? { guardado: stored } : {}), ...(cut.A ? { A: cut.A.image } : {}), ...(cut.B ? { B: cut.B.image } : {}), ...(cut.C ? { C: cut.C.image } : {}) }

    // Colours of the photo's border against those well inside today's cut-out.
    const leak: Partial<Record<Variant, number>> = {}
    const areaVsA: Partial<Record<'B' | 'C', number>> = {}
    const changed: Partial<Record<'B' | 'C', boolean>> = {}
    if (cut.A) {
      const size = await sizeOf(photo)
      const scale = Math.min(1, SIDE / Math.max(size.width, size.height))
      const width = Math.max(1, Math.round(size.width * scale))
      const height = Math.max(1, Math.round(size.height * scale))
      const data = await pixels(photo, width, height)
      const maskA = await maskInPhoto(cut.A, width, height)
      const inside = distanceInside(maskA, width, height)
      const band = Math.max(2, Math.min(width, height) * 0.03)
      let core = Uint8Array.from(inside, (value) => (value >= band ? 1 : 0))
      if (!core.some(Boolean)) core = maskA
      const isBackdrop = backdropColours(data, maskA, core, width, height)
      for (const variant of Object.keys(images) as Variant[]) leak[variant] = await leakOf(images[variant]!, isBackdrop)
      for (const variant of ['B', 'C'] as const) {
        const other = cut[variant]
        if (!other) continue
        const maskOther = await maskInPhoto(other, width, height)
        const areaA = maskA.reduce((sum, value) => sum + value, 0)
        const area = maskOther.reduce((sum, value) => sum + value, 0)
        let differ = 0
        for (let i = 0; i < maskA.length; i += 1) if (maskA[i] !== maskOther[i]) differ += 1
        areaVsA[variant] = area / Math.max(1, areaA)
        changed[variant] = differ > areaA * 0.01
      }
    }

    const tidy: Partial<Record<Variant, Blob>> = {}
    for (const variant of Object.keys(images) as Variant[]) tidy[variant] = (await recompose(images[variant]!, garment.category, photo))?.image

    const caption = (variant: Variant) => leak[variant] === undefined ? '' : `fondo ${(leak[variant]! * 100).toFixed(1)} %`
    const title = document.createElement('h3')
    const changes = (['B', 'C'] as const).filter((variant) => changed[variant]).map((variant) => ` · ${variant} cambia (${((areaVsA[variant] ?? 1) * 100).toFixed(0)} % del área de A)`).join('')
    title.textContent = `${index + 1}. ${name} · ${garment.category}${changes}`
    const line = document.createElement('div')
    line.className = 'row'
    line.append(
      figure(photo, 'foto', 'photo'),
      figure(images.guardado, caption('guardado'), 'cut'), figure(tidy.guardado, '', 'tidy'),
      figure(images.A, `${caption('A')} · ${ms.A} ms`, 'cut'), figure(tidy.A, '', 'tidy'),
      figure(images.B, `${caption('B')} · ${ms.B} ms`, 'cut', changed.B), figure(tidy.B, '', 'tidy', changed.B),
      figure(images.C, `${caption('C')} · ${ms.C} ms`, 'cut', changed.C), figure(tidy.C, '', 'tidy', changed.C)
    )
    document.querySelector('#rows')!.append(title, line)
    rows.push({ name, category: garment.category, leak, changed, areaVsA, ms, refine })
  }

  const mean = (variant: Variant) => {
    const values = rows.map((row) => row.leak[variant]).filter((value): value is number => value !== undefined)
    return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) * 100).toFixed(1))
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
  const both = rows.filter((row) => row.leak.guardado !== undefined && row.leak.A !== undefined)
  const summary = {
    garments: rows.length,
    backgroundLeftMeanPercent: { guardado: mean('guardado'), A: mean('A'), B: mean('B'), C: mean('C') },
    aCleanerThanStored: both.filter((row) => row.leak.A! < row.leak.guardado! - 0.02).map((row) => row.name),
    aDirtierThanStored: both.filter((row) => row.leak.A! > row.leak.guardado! + 0.02).map((row) => row.name),
    bChanged: rows.filter((row) => row.changed.B).map((row) => `${row.name} (${((row.areaVsA.B ?? 1) * 100).toFixed(0)} %)`),
    cChanged: rows.filter((row) => row.changed.C).map((row) => `${row.name} (${((row.areaVsA.C ?? 1) * 100).toFixed(0)} %)`),
    msMedian: { A: median(rows.map((row) => row.ms.A ?? 0)), B: median(rows.map((row) => row.ms.B ?? 0)), C: median(rows.map((row) => row.ms.C ?? 0)) }
  }
  document.querySelector('#summary')!.innerHTML = `<pre>${JSON.stringify(summary, null, 1)}</pre>`
  say(`Listo: ${rows.length} prendas.`)
  return { summary, rows }
}

declare global { interface Window { recutResult?: unknown } }
const start = (list?: Source[]) => run(list).then((result) => { window.recutResult = result }).catch((error: unknown) => say(`Error: ${String(error)}`))
document.querySelector<HTMLInputElement>('#zip')!.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const backup = await readWardrobeBackup(file)
  void start(backup.garments.map((garment) => ({ garment, photo: garment.image, ...(garment.cutout ? { cutout: garment.cutout } : {}) })))
})
if (params.has('zip') || params.has('auto')) void start()
