import { TAXONOMY_VERSION, taxonomy } from '../ml/taxonomy'
import type { GarmentCategory } from '../types/domain'
import { findBrand, type BrandMatch } from './brands'
import { garmentColors } from './colors'
import { findComposition, findSize, type LabelValue } from './labelParser'
import { garmentRegions, regionMask, type SegmentationMap } from './segmentation'
import { withAiTimeout } from './aiTimeout'
import { fetchDescription, fetchModelFile, loadOrt } from './onnxRuntime'
import { readText, type TextLine } from './textReader'

// Own model trained in ml/ (DINOv2-small + heads); exported with python -m vesta_ml.export.
export const CLOTHING_MODEL_ID = 'molt/dinov2-small-heads'
export const MODEL_DOWNLOAD_SIZE = 'aprox. 52 MB (clasificador de 25,7 MB, lector de texto de 12,9 MB y recorte de 13,8 MB)'
const MODEL_BASE = `${import.meta.env.BASE_URL}models/vesta/`

/** Probabilities per head (category, subcategory, sleeve, fit, pattern), keyed by taxonomy id. */
export type HeadProbabilities = Record<string, Record<string, number>>

export interface AttributeSuggestion {
  value: string
  label: string
  score: number
}

export interface ClothingAnalysisSuggestion {
  category: GarmentCategory
  subcategory: string
  colors: string[]
  pattern?: AttributeSuggestion
  sleeve?: AttributeSuggestion
  fit?: AttributeSuggestion
  /** Brand found in text visible in the photos (on-device OCR); logos without lettering are not recognised. */
  brand?: BrandMatch
  alternatives: Array<{
    category: GarmentCategory
    subcategory: string
    score: number
  }>
  confidenceByAttribute: Partial<Record<'category' | 'subcategory' | 'colors' | 'pattern' | 'brand', number>>
  unknownAttributes: string[]
  modelId: string
  modelVersion: string
  /** Scores adjusted by temperature scaling so that 80 % is right about 8 times in 10 (vesta_ml.calibrate). */
  calibrated: boolean
  /** Coarse garment map of each photo, in order (undefined with a model without segmentation head). */
  segmentations: Array<SegmentationMap | undefined>
  /** Text read in each photo, in order (to tell a label photo among many); empty where reading failed. */
  textByPhoto?: TextLine[][]
  analyzedAt: string
}

interface ModelDescription {
  format: string
  name: string
  taxonomyVersion: number
  preprocessing: { inputSize: number; padColor: number[]; mean: number[]; std: number[] }
  input: string
  /** temperature divides the logits before the softmax; missing in models exported before calibration. */
  heads: Array<{ name: string; multiLabel: boolean; values: string[]; temperature?: number }>
  file: string
  bytes: number
  /** Patch segmentation head (vesta_ml.segment), in models exported with --segmentation. */
  segmentation?: { output: string; classes: string[]; grid: number }
}

interface NormalizedImage {
  blob: Blob
  /** 96 × 96 sample of the whole photo, for colour. */
  pixels: ImageData
  width: number
  height: number
}

interface Classification {
  modelVersion: string
  probabilities: HeadProbabilities
  calibrated?: boolean
  /** Where the garments are in the photo, when the model has a segmentation head. */
  segmentation?: SegmentationMap
}

interface RankedPair {
  category: string
  subcategory?: string
  score: number
  conditional: number
}

type Classifier = (image: Blob) => Promise<Classification>
type ImageNormalizer = (image: Blob) => Promise<NormalizedImage>
type TextReader = (image: Blob) => Promise<TextLine[]>

let classifierPromise: Promise<Classifier> | undefined

const categoryLabels = new Map(taxonomy.categories.map((entry) => [entry.id, entry.label as GarmentCategory]))
const subcategoryEntries = new Map(taxonomy.subcategories.map((entry) => [entry.id, entry]))

async function normalizeImage(image: Blob): Promise<NormalizedImage> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('El navegador no permite preparar la imagen.')
    // Cut-outs are transparent: on white, as JPEG has no transparency (black otherwise).
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = 96
    colorCanvas.height = 96
    const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true })
    if (!colorContext) throw new Error('El navegador no permite analizar los colores.')
    colorContext.drawImage(canvas, 0, 0, 96, 96)
    const pixels = colorContext.getImageData(0, 0, 96, 96)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('No se pudo normalizar la imagen.'))
      }, 'image/jpeg', 0.9)
    })
    return { blob, pixels, width: canvas.width, height: canvas.height }
  } finally {
    bitmap.close()
  }
}

/** Same as ml/vesta_ml/features.preprocess: letterbox on the mean colour, then ImageNet normalisation, CHW. */
async function preprocess(image: Blob, settings: ModelDescription['preprocessing']): Promise<Float32Array> {
  const size = settings.inputSize
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('El navegador no permite preparar la imagen.')
    const [red, green, blue] = settings.padColor
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`
    context.fillRect(0, 0, size, size)
    const scale = size / Math.max(bitmap.width, bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height)
    const { data } = context.getImageData(0, 0, size, size)
    const pixels = new Float32Array(3 * size * size)
    for (let index = 0; index < size * size; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[channel * size * size + index] = ((data[index * 4 + channel]! / 255) - settings.mean[channel]!) / settings.std[channel]!
      }
    }
    return pixels
  } finally {
    bitmap.close()
  }
}

function softmax(logits: ArrayLike<number>, temperature = 1): number[] {
  const values = Array.from(logits, (value) => value / temperature)
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error('El modelo devolvió puntuaciones de clasificación no válidas.')
  }
  const maximum = Math.max(...values)
  const exponentials = values.map((value) => Math.exp(value - maximum))
  const total = exponentials.reduce((sum, value) => sum + value, 0)
  return exponentials.map((value) => value / total)
}

/** Softmax over the classes of every patch of the segmentation logits (grid * grid * classes). */
function patchSoftmax(logits: Float32Array, settings: NonNullable<ModelDescription['segmentation']>): SegmentationMap {
  const classes = settings.classes.length
  const probabilities = new Float32Array(logits.length)
  for (let patch = 0; patch < settings.grid * settings.grid; patch += 1) {
    const scores = softmax(logits.subarray(patch * classes, (patch + 1) * classes))
    probabilities.set(scores, patch * classes)
  }
  return { classes: settings.classes, grid: settings.grid, probabilities }
}

async function loadDescription(): Promise<ModelDescription> {
  const description = await fetchDescription<ModelDescription>(`${MODEL_BASE}vesta-model.json`)
  if (description.format !== 'vesta-model') throw new Error('La descripción del modelo no es válida.')
  if (description.taxonomyVersion !== TAXONOMY_VERSION) {
    throw new Error(`El modelo usa la taxonomía v${description.taxonomyVersion} y la app la v${TAXONOMY_VERSION}.`)
  }
  return description
}

async function loadClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    const pending = (async (): Promise<Classifier> => {
      const [ort, description] = await Promise.all([loadOrt(), loadDescription()])
      // Cached by name and size, so a new export is downloaded again.
      const model = await fetchModelFile(`${MODEL_BASE}${description.file}?v=${description.name}-${description.bytes}`)
      const session = await withAiTimeout(() => ort.InferenceSession.create(model, { executionProviders: ['wasm'] }))
      const heads = description.heads.filter((head) => !head.multiLabel)
      const size = description.preprocessing.inputSize
      return async (image) => {
        const pixels = await preprocess(image, description.preprocessing)
        const outputs = await withAiTimeout(() => session.run({ [description.input]: new ort.Tensor('float32', pixels, [1, 3, size, size]) }))
        const probabilities: HeadProbabilities = {}
        for (const head of heads) {
          const output = outputs[head.name]
          if (!output) throw new Error(`El modelo no devolvió la cabeza ${head.name}.`)
          const scores = softmax(output.data as Float32Array, head.temperature)
          probabilities[head.name] = Object.fromEntries(head.values.map((value, index) => [value, scores[index] ?? 0]))
        }
        const segmentation = description.segmentation && outputs[description.segmentation.output]
        return {
          modelVersion: description.name,
          probabilities,
          calibrated: heads.every((head) => head.temperature !== undefined),
          ...(segmentation && description.segmentation ? { segmentation: patchSoftmax(segmentation.data as Float32Array, description.segmentation) } : {})
        }
      }
    })()
    classifierPromise = pending.catch((error: unknown) => {
      classifierPromise = undefined
      throw error
    })
  }
  return classifierPromise
}

async function classifyLocally(image: Blob): Promise<Classification> {
  return (await loadClassifier())(image)
}

function best(scores: Record<string, number> | undefined): [string, number] | undefined {
  return Object.entries(scores ?? {}).sort((left, right) => right[1] - left[1])[0]
}

/** Mirrors Taxonomy.applies in ml/vesta_ml/taxonomy.py: sleeve on tops, fit on trousers… */
export function attributeApplies(head: string, category: string, subcategory: string | undefined): boolean {
  const attribute = (taxonomy.attributes as Record<string, { appliesTo?: string[]; appliesToSubcategories?: string[] }>)[head]
  if (attribute?.appliesTo && !attribute.appliesTo.includes(category)) return false
  return !attribute?.appliesToSubcategories || !subcategory || attribute.appliesToSubcategories.includes(subcategory)
}

/** Subcategory scores within one category, renormalised (ml/vesta_ml/targets.apply_rules). */
function subcategoriesOf(category: string, scores: Record<string, number>): Array<[string, number]> {
  const within = Object.entries(scores).filter(([value]) => subcategoryEntries.get(value)?.category === category)
  const total = within.reduce((sum, [, score]) => sum + score, 0)
  return total > 0 ? within.map(([value, score]): [string, number] => [value, score / total]).sort((left, right) => right[1] - left[1]) : []
}

function attributeSuggestion(head: string, scores: Record<string, number> | undefined): AttributeSuggestion | undefined {
  const top = best(scores)
  const values = (taxonomy.attributes as Record<string, { values: Array<{ id: string; label: string }> }>)[head]?.values
  const label = values?.find((value) => value.id === top?.[0])?.label
  return top && label ? { value: top[0], label, score: top[1] } : undefined
}

export async function analyzeGarmentImage(
  images: Blob | Blob[],
  classify: Classifier = classifyLocally,
  normalize: ImageNormalizer = normalizeImage,
  read: TextReader = readText
): Promise<ClothingAnalysisSuggestion> {
  const imageList = Array.isArray(images) ? images : [images]
  if (!imageList.length || imageList.some((image) => image.size === 0)) {
    throw new Error('Añade al menos una imagen válida.')
  }

  // Probabilities of every photo are averaged per head; colours are counted per photo. The care label has its own
  // field and is read apart (readGarmentLabel), so it never weighs on these results.
  const averaged: HeadProbabilities = {}
  const colorShares = new Map<string, number>()
  const segmentations: Array<SegmentationMap | undefined> = []
  const textByPhoto: TextLine[][] = []
  let textFailed = false
  let modelVersion = ''
  let calibrated = true
  for (const image of imageList) {
    const normalized = await normalize(image)
    // Reading text is a bonus: if it fails the rest of the suggestion still stands, just without a brand.
    const [result, lines] = await Promise.all([
      classify(normalized.blob),
      textFailed ? Promise.resolve([]) : read(normalized.blob).catch((error: unknown) => {
        console.warn('No se pudo leer el texto de la foto:', error)
        textFailed = true
        return []
      })
    ])
    textByPhoto.push(lines)
    if (!result.probabilities.category || Object.values(result.probabilities).some((scores) =>
      Object.values(scores).some((score) => !Number.isFinite(score) || score < 0 || score > 1)
    )) {
      throw new Error('El clasificador devolvió puntuaciones o etiquetas no válidas.')
    }
    modelVersion = result.modelVersion
    calibrated &&= result.calibrated === true
    for (const [head, scores] of Object.entries(result.probabilities)) {
      const total = averaged[head] ??= {}
      for (const [value, score] of Object.entries(scores)) total[value] = (total[value] ?? 0) + score / imageList.length
    }

    // With the segmentation head the colour is measured on the garment only; without it, on what is not border.
    const [region] = result.segmentation ? garmentRegions(result.segmentation, normalized.width, normalized.height, true) : []
    const mask = region && result.segmentation
      ? regionMask(region, result.segmentation.grid, normalized.width, normalized.height, normalized.pixels.width, normalized.pixels.height, 0)
      : undefined
    segmentations.push(result.segmentation)
    for (const { color, share } of garmentColors(normalized.pixels, mask)) {
      colorShares.set(color, (colorShares.get(color) ?? 0) + share / imageList.length)
    }
  }

  const categoryScores = averaged.category!
  // Every (category, subcategory) pair ranked by P(category) × P(subcategory | category).
  const ranked = Object.entries(categoryScores)
    .filter(([category]) => categoryLabels.has(category))
    .flatMap(([category, categoryScore]): RankedPair[] => {
      const subcategories = subcategoriesOf(category, averaged.subcategory ?? {})
      return subcategories.length
        ? subcategories.map(([subcategory, score]) => ({ category, subcategory, score: categoryScore * score, conditional: score }))
        : [{ category, subcategory: undefined, score: categoryScore, conditional: 0 }]
    })
    .sort((left, right) => right.score - left.score)
  const [category, categoryScore] = best(categoryScores) ?? []
  if (!category || categoryScore === undefined || !categoryLabels.has(category)) {
    throw new Error('El clasificador devolvió una etiqueta no reconocida.')
  }
  const top = ranked.find((entry) => entry.category === category)!
  const labelOf = (subcategory: string | undefined) => (subcategory && subcategoryEntries.get(subcategory)?.label) || ''

  const attributes = Object.fromEntries((['pattern', 'sleeve', 'fit'] as const)
    .filter((head) => attributeApplies(head, category, top.subcategory))
    .map((head) => [head, attributeSuggestion(head, averaged[head])])
    .filter(([, suggestion]) => suggestion)) as Partial<Record<'pattern' | 'sleeve' | 'fit', AttributeSuggestion>>

  // A colour seen in only one of several photos (another garment, a reflection) does not count.
  const colors = [...colorShares.entries()]
    .filter(([, share]) => share >= 0.12)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
  const brand = findBrand(textByPhoto.flat())
  return {
    category: categoryLabels.get(category)!,
    subcategory: labelOf(top.subcategory),
    colors: colors.map(([color]) => color),
    ...attributes,
    ...(brand ? { brand } : {}),
    alternatives: ranked.filter((entry) => entry !== top).slice(0, 3).map((entry) => ({
      category: categoryLabels.get(entry.category)!,
      subcategory: labelOf(entry.subcategory),
      score: entry.score
    })),
    confidenceByAttribute: {
      category: categoryScore,
      ...(top.subcategory ? { subcategory: top.conditional } : {}),
      ...(attributes.pattern ? { pattern: attributes.pattern.score } : {}),
      ...(brand ? { brand: brand.score } : {}),
      ...(colors[0] ? { colors: colors[0][1] } : {})
    },
    unknownAttributes: [
      ...(!top.subcategory ? ['subcategory'] : []),
      ...(!colors.length ? ['colors'] : []),
      ...(!attributes.pattern ? ['pattern'] : []),
      'neckline',
      'style',
      'formality',
      'season',
      ...(!brand ? ['brand'] : []),
      // Read from the label photo, which is analysed apart.
      'size',
      'textileComposition',
      'multipleItems',
      'occlusion'
    ],
    modelId: CLOTHING_MODEL_ID,
    modelVersion,
    calibrated,
    segmentations,
    textByPhoto,
    analyzedAt: new Date().toISOString()
  }
}

export interface LabelReading {
  /** Every line read, so the size can be chosen again when the category changes (findSize depends on it). */
  lines: TextLine[]
  brand?: BrandMatch
  composition?: LabelValue
}

/** Reads the care label photo: only text, never the garment classifier, so it does not affect the type or colour. */
export async function readGarmentLabel(
  image: Blob,
  normalize: ImageNormalizer = normalizeImage,
  read: TextReader = readText
): Promise<LabelReading> {
  if (image.size === 0) throw new Error('La foto de la etiqueta está vacía.')
  const lines = await read((await normalize(image)).blob)
  const brand = findBrand(lines)
  const composition = findComposition(lines)
  return { lines, ...(brand ? { brand } : {}), ...(composition ? { composition } : {}) }
}

/** The size on a label for a garment category (the category label shown in the app). */
export function labelSize(reading: LabelReading | undefined, category: GarmentCategory): LabelValue | undefined {
  if (!reading) return undefined
  const categoryId = taxonomy.categories.find((entry) => entry.label === category)?.id
  return findSize(reading.lines, categoryId)
}
