// Measures «Desde un look» as LookImport.tsx runs it (find the garments, cut each out, recognise each cut-out) on
// full-body photos with reference garment masks, prepared by `python -m vesta_ml.look_eval` (ml/). Open
// bench/look.html?set=eval-looks&auto.
import { analyzeGarmentImage } from '../src/ai/clothingAnalyzer'
import { cutOutGarments, cutoutColors } from '../src/ai/cutout'
import type { SegmentationMap } from '../src/ai/segmentation'
import { taxonomy } from '../src/ml/taxonomy'

interface Photo { id: string; file: string; mask: string; width: number; height: number; classes: Record<string, number> }

/** A garment class must cover at least this share of the photo to count as one the look should find. */
const MIN_SHARE = 0.005
/** A garment is found when the cut-outs given to it cover at least this share of its pixels. */
const FOUND_RECALL = 0.5

const categoryId = new Map(taxonomy.categories.map((entry) => [entry.label as string, entry.id as string]))
const status = document.querySelector('#status')!
const output = document.querySelector('#output')!
const say = (text: string) => { status.textContent = text }

async function memoryMb(): Promise<number | null> {
  const measure = (performance as Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> }).measureUserAgentSpecificMemory
  if (!measure || !self.crossOriginIsolated) return null
  try { return Math.round((await measure.call(performance)).bytes / 1024 / 1024) } catch { return null }
}

const percentile = (values: number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!) : 0
}

async function pixels(image: Blob, width: number, height: number, place?: { x: number; y: number; width: number; height: number }) {
  const bitmap = await createImageBitmap(image)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingEnabled = !!place
  if (place) context.drawImage(bitmap, place.x * width, place.y * height, place.width * width, place.height * height)
  else context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return context.getImageData(0, 0, width, height).data
}

export async function run(set: string, options: { limit?: number } = {}) {
  const list = await (await fetch(`/test-photos/${set}/list.json`)).json() as { classes: string[]; photos: Photo[] }
  const classes = list.classes
  const photos = options.limit ? list.photos.slice(0, options.limit) : list.photos
  const memory: Record<string, unknown> = { before: await memoryMb() }
  const every10: Array<number | null> = []
  const rows = []
  for (const [index, photo] of photos.entries()) {
    say(`${index + 1}/${photos.length}: ${photo.file}`)
    const file = await (await fetch(`/test-photos/${set}/${photo.file}`)).blob()
    const t0 = performance.now()
    // As LookImport.tsx: the whole photo, then each cut-out on its own.
    const [map] = (await analyzeGarmentImage([file])).segmentations as Array<SegmentationMap | undefined>
    const cutouts = map ? await cutOutGarments(file, map, 'outfit') : []
    const recognised = []
    for (const cutout of cutouts) {
      const suggestion = await analyzeGarmentImage([cutout.image])
      const colors = (await cutoutColors(cutout.image)).map((entry) => entry.color)
      recognised.push({ cutout, category: categoryId.get(suggestion.category) ?? suggestion.category, subcategory: suggestion.subcategory, colors: colors.length ? colors : suggestion.colors })
    }
    const ms = performance.now() - t0
    if (index === 0) memory.afterFirst = await memoryMb()
    if ((index + 1) % 10 === 0) every10.push(await memoryMb())

    // Reference: class index per pixel (grey PNG), at a size small enough to count fast.
    const scale = Math.min(1, 320 / Math.max(photo.width, photo.height))
    const width = Math.max(1, Math.round(photo.width * scale))
    const height = Math.max(1, Math.round(photo.height * scale))
    const reference = await pixels(await (await fetch(`/test-photos/${set}/${photo.mask}`)).blob(), width, height)
    const truth = new Uint8Array(width * height).map((_, i) => reference[i * 4]!)
    const classPixels = classes.map((_, klass) => truth.reduce((sum, value) => sum + (value === klass ? 1 : 0), 0))

    const cuts = []
    const coveredBy = classes.map(() => new Uint8Array(width * height))
    for (const entry of recognised) {
      const alpha = await pixels(entry.cutout.image, width, height, entry.cutout.place)
      const perClass = classes.map(() => 0)
      let total = 0
      for (let i = 0; i < width * height; i += 1) {
        if (alpha[i * 4 + 3]! < 128) continue
        perClass[truth[i]!]! += 1
        total += 1
      }
      const garmentPixels = perClass.slice(1)
      const dominant = garmentPixels.indexOf(Math.max(...garmentPixels)) + 1
      const ownGarment = perClass[dominant]! / Math.max(1, total)
      const isGarment = total > 0 && perClass[0]! / total < 0.5 && perClass[dominant]! > 0
      if (isGarment) for (let i = 0; i < width * height; i += 1) if (alpha[i * 4 + 3]! >= 128 && truth[i] === dominant) coveredBy[dominant]![i] = 1
      const union = classPixels[dominant]! + total - perClass[dominant]!
      cuts.push({
        region: entry.cutout.region.classId,
        category: entry.category,
        subcategory: entry.subcategory,
        colors: entry.colors,
        truth: isGarment ? classes[dominant]! : 'background',
        /** Share of the cut-out that is its garment; the rest is other garments, skin, hair or background. */
        purity: +ownGarment.toFixed(3),
        outsideGarments: +(perClass[0]! / Math.max(1, total)).toFixed(3),
        iou: +(perClass[dominant]! / Math.max(1, union)).toFixed(3)
      })
    }
    const expected = classes.slice(1).filter((name) => (photo.classes[name] ?? 0) >= MIN_SHARE)
    const found = Object.fromEntries(expected.map((name) => {
      const klass = classes.indexOf(name)
      const recall = coveredBy[klass]!.reduce((sum, value) => sum + value, 0) / Math.max(1, classPixels[klass]!)
      return [name, +recall.toFixed(3)]
    }))
    rows.push({ id: photo.id, file: photo.file, ms: Math.round(ms), expected, recall: found, cuts })
  }
  memory.after = await memoryMb()
  memory.every10 = every10
  const result = { set, photos: rows.length, userAgent: navigator.userAgent, crossOriginIsolated: self.crossOriginIsolated, threads: navigator.hardwareConcurrency, ...summary(rows, classes), latencyMs: latency(rows.map((row) => row.ms)), memoryMb: memory, rows }
  render(result)
  say(`Terminado: ${rows.length} fotos.`)
  return result
}

const latency = (times: number[]) => ({ first: times[0] ?? 0, median: percentile(times.slice(1), 0.5), p90: percentile(times.slice(1), 0.9) })

type Row = { expected: string[]; recall: Record<string, number>; cuts: Array<{ truth: string; category: string; purity: number; outsideGarments: number; iou: number }> }

function summary(rows: Row[], classes: string[]) {
  const byClass = Object.fromEntries(classes.slice(1).map((name) => {
    const present = rows.filter((row) => row.expected.includes(name))
    const found = present.filter((row) => (row.recall[name] ?? 0) >= FOUND_RECALL)
    const cuts = rows.flatMap((row) => row.cuts.filter((cut) => cut.truth === name))
    return [name, {
      present: present.length,
      found: found.length,
      cutouts: cuts.length,
      categoryRight: cuts.filter((cut) => cut.category === name).length,
      medianIou: percentile(cuts.map((cut) => cut.iou * 1000), 0.5) / 1000,
      medianPurity: percentile(cuts.map((cut) => cut.purity * 1000), 0.5) / 1000
    }]
  }))
  const cuts = rows.flatMap((row) => row.cuts)
  const garmentCuts = cuts.filter((cut) => cut.truth !== 'background')
  const expected = rows.reduce((sum, row) => sum + row.expected.length, 0)
  const found = rows.reduce((sum, row) => sum + row.expected.filter((name) => (row.recall[name] ?? 0) >= FOUND_RECALL).length, 0)
  return {
    garments: { expected, found, recall: +(found / Math.max(1, expected)).toFixed(3) },
    cutouts: {
      total: cuts.length,
      notAGarment: cuts.length - garmentCuts.length,
      perPhoto: +(cuts.length / Math.max(1, rows.length)).toFixed(2),
      categoryRight: +(garmentCuts.filter((cut) => cut.category === cut.truth).length / Math.max(1, garmentCuts.length)).toFixed(3),
      medianIou: percentile(garmentCuts.map((cut) => cut.iou * 1000), 0.5) / 1000,
      medianOutsideGarments: percentile(garmentCuts.map((cut) => cut.outsideGarments * 1000), 0.5) / 1000,
      withOver20PercentOutside: garmentCuts.filter((cut) => cut.outsideGarments > 0.2).length
    },
    byClass
  }
}

function render(result: Awaited<ReturnType<typeof run>>) {
  output.innerHTML = `<pre>${JSON.stringify({ ...result, rows: undefined }, null, 1)}</pre>`
  const link = document.querySelector<HTMLAnchorElement>('#download')!
  link.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 1)], { type: 'application/json' }))
  link.download = `look-${result.set}.json`
  link.hidden = false
}

declare global { interface Window { runLookBench: typeof run; lookBenchResult?: unknown } }
window.runLookBench = run
const params = new URLSearchParams(location.search)
const set = params.get('set')
if (set && params.has('auto')) {
  void run(set, { limit: params.get('limit') ? Number(params.get('limit')) : undefined })
    .then((result) => { window.lookBenchResult = result })
    .catch((error: unknown) => say(`Error: ${String(error)}`))
}
