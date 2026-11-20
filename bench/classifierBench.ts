// Evaluates the classifier and the colour estimator as the app runs them (int8 ONNX in the browser, the app's own
// preprocessing, calibration and colour code) on a local labelled set prepared by scripts/eval-prepare.mjs.
// Open bench/classifier.html?set=<name>; see the page for options.
import { analyzeGarmentImage } from '../src/ai/clothingAnalyzer'
import { cutOutGarments, cutoutColors } from '../src/ai/cutout'
import type { SegmentationMap } from '../src/ai/segmentation'
import { taxonomy } from '../src/ml/taxonomy'

interface Photo {
  id: string
  file: string
  category: string
  subcategory: string | null
  colors?: string[]
}

interface Row {
  id: string
  category: string
  subcategory: string | null
  predictedCategory: string
  predictedSubcategory: string | null
  confidence: number
  ms: number
  colors?: string[]
  analysisColors: string[]
  cutoutColors?: string[]
  /** Time of the cut-out alone, and a fingerprint of its image to compare runs (the same pixels give the same one). */
  cutoutMs?: number
  cutout?: { width: number; height: number; coverage: number; sha256: string } | null
}

async function fingerprint(image: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

const categoryId = new Map(taxonomy.categories.map((entry) => [entry.label as string, entry.id as string]))
const subcategoryId = new Map(taxonomy.subcategories.map((entry) => [entry.label as string, entry.id as string]))

const status = document.querySelector('#status')!
const output = document.querySelector('#output')!
const say = (text: string) => { status.textContent = text }

async function memoryMb(): Promise<number | null> {
  const measure = (performance as Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> }).measureUserAgentSpecificMemory
  if (!measure || !self.crossOriginIsolated) return null
  try {
    return Math.round((await measure.call(performance)).bytes / 1024 / 1024)
  } catch {
    return null
  }
}

const percentile = (values: number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!) : 0
}

/** Accuracy, macro-F1, precision/recall/F1 per class and the confusion matrix of two label lists. */
export function scores(truth: string[], predicted: string[]) {
  const classes = [...new Set([...truth, ...predicted])].sort()
  const matrix = Object.fromEntries(classes.map((row) => [row, Object.fromEntries(classes.map((column) => [column, 0]))])) as Record<string, Record<string, number>>
  truth.forEach((label, index) => { matrix[label]![predicted[index]!]! += 1 })
  const perClass = Object.fromEntries(classes.filter((label) => truth.includes(label)).map((label) => {
    const tp = matrix[label]![label]!
    const support = truth.filter((value) => value === label).length
    const predictedCount = predicted.filter((value) => value === label).length
    const precision = predictedCount ? tp / predictedCount : 0
    const recall = support ? tp / support : 0
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0
    return [label, { support, precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +f1.toFixed(3) }]
  }))
  const f1s = Object.values(perClass).map((entry) => entry.f1)
  return {
    n: truth.length,
    accuracy: +(truth.filter((label, index) => label === predicted[index]).length / Math.max(1, truth.length)).toFixed(3),
    macroF1: +(f1s.reduce((sum, value) => sum + value, 0) / Math.max(1, f1s.length)).toFixed(3),
    perClass,
    matrix
  }
}

/** Main colour right, and any reference colour among the proposed ones. */
export function colorScores(rows: Array<{ colors?: string[]; proposed?: string[] }>) {
  const usable = rows.filter((row) => row.colors?.length && row.proposed)
  const main = usable.filter((row) => row.proposed![0] === row.colors![0]).length
  const any = usable.filter((row) => row.proposed!.some((color) => row.colors!.includes(color))).length
  const none = usable.filter((row) => !row.proposed!.length).length
  return { n: usable.length, mainColor: +(main / Math.max(1, usable.length)).toFixed(3), anyColor: +(any / Math.max(1, usable.length)).toFixed(3), noColor: none }
}

export async function run(set: string, options: { limit?: number; colorsOnly?: boolean; cutouts?: boolean } = {}) {
  const list = await (await fetch(`/test-photos/${set}/list.json`)).json() as { source: string; split: string; photos: Photo[] }
  let photos = list.photos
  if (options.colorsOnly) photos = photos.filter((photo) => photo.colors?.length)
  if (options.limit) photos = photos.slice(0, options.limit)
  const rows: Row[] = []
  const memory: Record<string, number | null> = { before: await memoryMb() }
  const memoryEvery10: Array<number | null> = []
  const started = performance.now()
  for (const [index, photo] of photos.entries()) {
    say(`${index + 1}/${photos.length}: ${photo.file}`)
    const blob = await (await fetch(`/test-photos/${set}/${photo.file}`)).blob()
    const t0 = performance.now()
    const suggestion = await analyzeGarmentImage([blob])
    const ms = performance.now() - t0
    if (index === 0) memory.afterFirst = await memoryMb()
    if ((index + 1) % 10 === 0) memoryEvery10.push(await memoryMb())
    const row: Row = {
      id: photo.id,
      category: photo.category,
      subcategory: photo.subcategory,
      predictedCategory: categoryId.get(suggestion.category) ?? suggestion.category,
      predictedSubcategory: subcategoryId.get(suggestion.subcategory) ?? null,
      confidence: +(suggestion.confidenceByAttribute.category ?? 0).toFixed(3),
      ms: Math.round(ms),
      analysisColors: suggestion.colors,
      ...(photo.colors ? { colors: photo.colors } : {})
    }
    // Colours as the form ends up with them: from the cut-out when there is one, else from the analysis.
    if (photo.colors?.length && options.cutouts !== false) {
      const map = suggestion.segmentations[0] as SegmentationMap | undefined
      const t1 = performance.now()
      const [cut] = map ? await cutOutGarments(blob, map, 'single') : []
      row.cutoutMs = Math.round(performance.now() - t1)
      row.cutout = cut ? { width: cut.width, height: cut.height, coverage: +cut.coverage.toFixed(4), sha256: await fingerprint(cut.image) } : null
      if (cut && keepCutouts) cutoutImages.set(photo.id, cut.image)
      row.cutoutColors = cut ? (await cutoutColors(cut.image)).map((entry) => entry.color) : suggestion.colors
    }
    rows.push(row)
  }
  memory.after = await memoryMb()
  const times = rows.map((row) => row.ms)
  const cutTimes = rows.flatMap((row) => row.cutoutMs === undefined ? [] : [row.cutoutMs])
  const withSub = rows.filter((row) => row.subcategory)
  const result = {
    set, source: list.source, split: list.split, photos: rows.length,
    userAgent: navigator.userAgent, crossOriginIsolated: self.crossOriginIsolated, threads: navigator.hardwareConcurrency,
    latencyMs: { first: times[0] ?? 0, median: percentile(times.slice(1), 0.5), p90: percentile(times.slice(1), 0.9), totalSeconds: Math.round((performance.now() - started) / 1000) },
    cutoutLatencyMs: cutTimes.length ? { first: cutTimes[0]!, median: percentile(cutTimes.slice(1), 0.5), p90: percentile(cutTimes.slice(1), 0.9), n: cutTimes.length } : null,
    /** Each start of SlimSAM (src/ai/sam.ts): its worker is ended 5 s after the last cut-out and started again. */
    samLoadsMs: performance.getEntriesByName('molt:sam-load').map((entry) => Math.round(entry.duration)),
    memoryMb: { ...memory, every10: memoryEvery10 },
    category: scores(rows.map((row) => row.category), rows.map((row) => row.predictedCategory)),
    subcategory: scores(withSub.map((row) => row.subcategory!), withSub.map((row) => row.predictedSubcategory ?? '(ninguna)')),
    colors: {
      analysis: colorScores(rows.map((row) => ({ colors: row.colors, proposed: row.analysisColors }))),
      app: colorScores(rows.map((row) => ({ colors: row.colors, proposed: row.cutoutColors })))
    },
    rows
  }
  render(result)
  say(`Terminado: ${rows.length} fotos.`)
  return result
}

function render(result: Awaited<ReturnType<typeof run>>) {
  const category = result.category
  const classes = Object.keys(category.matrix)
  const table = `<table><tr><th>real \\ predicha</th>${classes.map((label) => `<th>${label}</th>`).join('')}</tr>${classes.map((row) => `<tr><th>${row}</th>${classes.map((column) => `<td class="${row === column ? 'hit' : ''}">${category.matrix[row]![column] || ''}</td>`).join('')}</tr>`).join('')}</table>`
  const summary = { ...result, rows: undefined, category: { ...category, matrix: undefined }, subcategory: { ...result.subcategory, matrix: undefined } }
  output.innerHTML = `<h2>Matriz de confusión (categoría)</h2>${table}<h2>Resumen</h2><pre>${JSON.stringify(summary, null, 1)}</pre>`
  const blob = new Blob([JSON.stringify(result, null, 1)], { type: 'application/json' })
  const link = document.querySelector<HTMLAnchorElement>('#download')!
  link.href = URL.createObjectURL(blob)
  link.download = `classifier-${result.set}.json`
  link.hidden = false
}

/** With ?keepcuts the cut-outs stay here by photo id, to compare their pixels between two versions. */
const cutoutImages = new Map<string, Blob>()
const keepCutouts = new URLSearchParams(location.search).has('keepcuts')

declare global { interface Window { runClassifierBench: typeof run; classifierBenchResult?: unknown; benchCutouts: Map<string, Blob> } }
window.runClassifierBench = run
window.benchCutouts = cutoutImages
const params = new URLSearchParams(location.search)
const set = params.get('set')
if (set && params.has('auto')) {
  void run(set, { limit: params.get('limit') ? Number(params.get('limit')) : undefined, colorsOnly: params.has('colors'), cutouts: !params.has('nocut') })
    .then((result) => { window.classifierBenchResult = result })
    .catch((error: unknown) => say(`Error: ${String(error)}`))
}
