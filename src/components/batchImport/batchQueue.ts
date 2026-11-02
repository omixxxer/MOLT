import { useSyncExternalStore } from 'react'
import { addPhoto, isLabelPhoto, type PhotoGroup } from '../../ai/batchGrouping'
import { analyzeGarmentImage, labelSize, type ClothingAnalysisSuggestion, type LabelReading } from '../../ai/clothingAnalyzer'
import { findBrand } from '../../ai/brands'
import { cutOutGarments, cutoutColors } from '../../ai/cutout'
import { findComposition } from '../../ai/labelParser'
import { captureTime } from '../../ai/photoTime'
import type { TextLine } from '../../ai/textReader'
import { suggestUsage } from '../../ai/usageRules'
import { garmentRepository } from '../../db/garmentRepository'
import { createThumbnail, reducePhoto } from '../../db/imageProcessing'
import { roleByCategory, type GarmentCategory } from '../../types/domain'
import { analysisRecord } from '../garmentForm/analysisRecord'
import { createSuggestedGarmentName } from '../garmentForm/garmentName'

// Many garments at once: the photos are analysed one by one (classifier, text, cut-out) in the order they were
// chosen and grouped into garments as they come. The state lives here, outside the screen, so the analysis goes on
// while the user looks at something else; nothing is saved until the user reviews it.

export interface BatchPhoto {
  id: string
  file: File
  time?: number
  status: 'waiting' | 'analyzing' | 'done' | 'failed'
  suggestion?: ClothingAnalysisSuggestion
  lines: TextLine[]
  label: boolean
}

export interface BatchGarment extends PhotoGroup {
  id: string
  /** Undefined until the user changes it: the main photo's suggestion is shown. */
  subcategory?: string
  include: boolean
  cutout?: Blob
  cutoutStatus: 'waiting' | 'working' | 'done' | 'none'
  /** The user prefers the photo with its background: the cut-out is not saved. */
  keepBackground?: boolean
  /** Colours typed by the user are not replaced by the ones measured on the cut-out. */
  colorsEdited: boolean
}

export interface BatchState {
  photos: BatchPhoto[]
  garments: BatchGarment[]
  running: boolean
  /** When the current run started and how many photos it has analysed (cut-outs included in the time). */
  runStartedAt?: number
  runAnalyzed: number
}

type Job = { kind: 'analyze'; photoId: string } | { kind: 'cutout'; garmentId: string }

let state: BatchState = { photos: [], garments: [], running: false, runAnalyzed: 0 }
const listeners = new Set<() => void>()
let jobs: Job[] = []
/** Bumped by clearBatch, so a job that was running when the batch was discarded does not write into a new one. */
let generation = 0

function set(update: Partial<BatchState>) {
  state = { ...state, ...update }
  for (const listener of listeners) listener()
}

export function useBatch(): BatchState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => state)
}

export function getBatch(): BatchState {
  return state
}

const photoById = (id: string) => state.photos.find((photo) => photo.id === id)

/** The main photo's analysis, which the garment's type, subcategory and attributes come from. */
export function mainSuggestion(garment: BatchGarment): ClothingAnalysisSuggestion | undefined {
  return garment.photoIds[0] ? photoById(garment.photoIds[0])?.suggestion : undefined
}

export function garmentSubcategory(garment: BatchGarment): string {
  return garment.subcategory ?? mainSuggestion(garment)?.subcategory ?? ''
}

/** What the garment's label photos (all of them) say: brand, composition and every line for the size. */
export function garmentLabel(garment: BatchGarment): LabelReading | undefined {
  if (!garment.labelIds.length) return undefined
  const lines = garment.labelIds.flatMap((id) => photoById(id)?.lines ?? [])
  const brand = findBrand(lines)
  const composition = findComposition(lines)
  return { lines, ...(brand ? { brand } : {}), ...(composition ? { composition } : {}) }
}

export function garmentSize(garment: BatchGarment) {
  return labelSize(garmentLabel(garment), garment.category as GarmentCategory)
}

/** Calibrated scores: below these the model is wrong often enough to be worth a look. */
const SURE_CATEGORY = 0.7
const SURE_SUBCATEGORY = 0.5

/**
 * Why a garment is worth checking, in the user's words; empty when nothing looks doubtful. With a hundred
 * garments, this is what lets the review skip most of them. What the user has already changed is not questioned.
 */
export function reviewReasons(garment: BatchGarment): string[] {
  const confidence = mainSuggestion(garment)?.confidenceByAttribute
  if (!confidence) return []
  const reasons: string[] = []
  const typeEdited = garment.subcategory !== undefined || garment.category !== mainSuggestion(garment)?.category
  if (!typeEdited && ((confidence.category ?? 1) < SURE_CATEGORY || (confidence.subcategory ?? 1) < SURE_SUBCATEGORY)) reasons.push('Comprueba el tipo')
  if (!garment.colors.length) reasons.push('Falta el color')
  return reasons
}

export async function addPhotos(files: File[]) {
  const photos = await Promise.all(files.map(async (file): Promise<BatchPhoto> => {
    const time = await captureTime(file)
    return { id: crypto.randomUUID(), file, ...(time !== undefined ? { time } : {}), status: 'waiting', lines: [], label: false }
  }))
  set({ photos: [...state.photos, ...photos] })
  jobs.push(...photos.map((photo): Job => ({ kind: 'analyze', photoId: photo.id })))
  void run()
}

async function run() {
  if (state.running) return
  set({ running: true, runStartedAt: Date.now(), runAnalyzed: 0 })
  const current = generation
  try {
    while (jobs.length && current === generation) {
      const job = jobs.shift()!
      if (job.kind === 'analyze') await analyze(job.photoId, current)
      else await cutOut(job.garmentId, current)
    }
  } finally {
    if (current === generation) set({ running: false })
  }
}

function updatePhoto(id: string, update: Partial<BatchPhoto>) {
  set({ photos: state.photos.map((photo) => photo.id === id ? { ...photo, ...update } : photo) })
}

function updateGarment(id: string, update: Partial<BatchGarment>) {
  set({ garments: state.garments.map((garment) => garment.id === id ? { ...garment, ...update } : garment) })
}

async function analyze(photoId: string, current: number) {
  const photo = photoById(photoId)
  if (!photo) return
  updatePhoto(photoId, { status: 'analyzing' })
  try {
    const suggestion = await analyzeGarmentImage(photo.file)
    if (current !== generation) return
    const lines = suggestion.textByPhoto?.[0] ?? []
    const label = isLabelPhoto(lines)
    updatePhoto(photoId, { status: 'done', suggestion, lines, label })
    const facts = { id: photoId, category: suggestion.category, colors: suggestion.colors, label, ...(photo.time !== undefined ? { time: photo.time } : {}) }
    const groups = addPhoto(state.garments, facts) as Array<PhotoGroup & Partial<BatchGarment>>
    const garments = groups.map((group): BatchGarment => group.id
      ? group as BatchGarment
      : { ...group, id: crypto.randomUUID(), include: true, cutoutStatus: 'waiting', colorsEdited: false })
    set({ garments })
    // A garment's first photo is its main one: it is cut out now.
    const owner = garments.find((garment) => garment.photoIds[0] === photoId)
    if (owner) jobs.unshift({ kind: 'cutout', garmentId: owner.id })
  } catch (error) {
    console.error('No se pudo analizar una foto del lote:', error)
    if (current === generation) updatePhoto(photoId, { status: 'failed' })
  } finally {
    if (current === generation) set({ runAnalyzed: state.runAnalyzed + 1 })
  }
}

/** Estimated milliseconds left, from the pace of the current run; undefined until a photo is done. */
export function timeLeft(batch: BatchState, now: number): number | undefined {
  const waiting = batch.photos.filter((photo) => photo.status === 'waiting' || photo.status === 'analyzing').length
  if (!batch.running || !batch.runStartedAt || !batch.runAnalyzed) return undefined
  return ((now - batch.runStartedAt) / batch.runAnalyzed) * waiting
}

async function cutOut(garmentId: string, current: number) {
  const garment = state.garments.find((entry) => entry.id === garmentId)
  const main = garment?.photoIds[0] ? photoById(garment.photoIds[0]) : undefined
  const map = main?.suggestion?.segmentations[0]
  if (!garment || !main || !map) {
    if (garment) updateGarment(garmentId, { cutoutStatus: 'none' })
    return
  }
  updateGarment(garmentId, { cutoutStatus: 'working' })
  try {
    const [cutout] = await cutOutGarments(main.file, map, 'single')
    if (current !== generation) return
    const colors = cutout ? (await cutoutColors(cutout.image)).map((entry) => entry.color) : []
    if (current !== generation) return
    const latest = state.garments.find((entry) => entry.id === garmentId)
    // The main photo may have changed meanwhile (photos moved by the user): that cut-out no longer applies.
    if (!latest || latest.photoIds[0] !== main.id) return
    updateGarment(garmentId, {
      cutoutStatus: cutout ? 'done' : 'none',
      ...(cutout ? { cutout: cutout.image } : {}),
      ...(colors.length && !latest.colorsEdited ? { colors } : {})
    })
  } catch (error) {
    console.warn('No se pudo quitar el fondo de una foto del lote:', error)
    if (current === generation) updateGarment(garmentId, { cutoutStatus: 'none' })
  }
}

// Corrections from the review.

export function editGarment(id: string, update: Pick<Partial<BatchGarment>, 'category' | 'subcategory' | 'colors' | 'include' | 'keepBackground'>) {
  updateGarment(id, { ...update, ...(update.colors ? { colorsEdited: true } : {}) })
}

/** The garment joins the one before it (its photos and labels after the others). */
export function mergeWithPrevious(id: string) {
  const index = state.garments.findIndex((garment) => garment.id === id)
  if (index < 1) return
  const previous = state.garments[index - 1]!
  const garment = state.garments[index]!
  const merged: BatchGarment = {
    ...previous,
    photoIds: [...previous.photoIds, ...garment.photoIds],
    labelIds: [...previous.labelIds, ...garment.labelIds],
    ...(previous.photoIds.length ? {} : { category: garment.category, colors: garment.colors, cutoutStatus: 'waiting' as const })
  }
  set({ garments: [...state.garments.slice(0, index - 1), merged, ...state.garments.slice(index + 1)] })
  if (!previous.photoIds.length && merged.photoIds.length) queueCutout(merged.id)
}

/** A photo that is not the main one becomes a garment of its own, right after this one. */
export function splitPhoto(garmentId: string, photoId: string) {
  const index = state.garments.findIndex((garment) => garment.id === garmentId)
  const garment = state.garments[index]
  const photo = photoById(photoId)
  if (!garment || !photo?.suggestion || garment.photoIds[0] === photoId) return
  const alone: BatchGarment = {
    id: crypto.randomUUID(),
    photoIds: [photoId],
    labelIds: [],
    category: photo.suggestion.category,
    colors: photo.suggestion.colors,
    include: true,
    cutoutStatus: 'waiting',
    colorsEdited: false
  }
  const rest = { ...garment, photoIds: garment.photoIds.filter((id) => id !== photoId) }
  set({ garments: [...state.garments.slice(0, index), rest, alone, ...state.garments.slice(index + 1)] })
  queueCutout(alone.id)
}

/** Another photo of the garment becomes the main one, which is the one cut out and shown in the wardrobe. */
export function makeMain(garmentId: string, photoId: string) {
  const garment = state.garments.find((entry) => entry.id === garmentId)
  if (!garment?.photoIds.includes(photoId) || garment.photoIds[0] === photoId) return
  set({
    garments: state.garments.map((entry) => entry.id === garmentId
      ? { ...entry, photoIds: [photoId, ...entry.photoIds.filter((id) => id !== photoId)], cutout: undefined, cutoutStatus: 'waiting' as const }
      : entry)
  })
  queueCutout(garmentId)
}

/** A photo taken for a label is a garment photo after all, or the other way round. */
export function toggleLabel(garmentId: string, photoId: string) {
  const garment = state.garments.find((entry) => entry.id === garmentId)
  if (!garment) return
  const isLabel = garment.labelIds.includes(photoId)
  if (!isLabel && garment.photoIds[0] === photoId) return
  updateGarment(garmentId, isLabel
    ? { labelIds: garment.labelIds.filter((id) => id !== photoId), photoIds: [...garment.photoIds, photoId] }
    : { photoIds: garment.photoIds.filter((id) => id !== photoId), labelIds: [...garment.labelIds, photoId] })
  if (isLabel && !garment.photoIds.length) queueCutout(garmentId)
}

function queueCutout(garmentId: string) {
  jobs.push({ kind: 'cutout', garmentId })
  void run()
}

export function retryFailed() {
  const failed = state.photos.filter((photo) => photo.status === 'failed')
  set({ photos: state.photos.map((photo) => photo.status === 'failed' ? { ...photo, status: 'waiting' as const } : photo) })
  jobs.push(...failed.map((photo): Job => ({ kind: 'analyze', photoId: photo.id })))
  void run()
}

/** The garments to save: chosen and with at least one garment photo (a lone label is not a garment). */
export function savable(batch: BatchState): BatchGarment[] {
  return batch.garments.filter((garment) => garment.include && garment.photoIds.length > 0 && photoById(garment.photoIds[0]!)?.suggestion)
}

/** Saves the chosen garments as the form would (reduced photos, label photo, cut-out, suggested use); returns how many. */
export async function saveBatch(onProgress: (saved: number) => void): Promise<number> {
  const chosen = savable(state)
  let saved = 0
  for (const garment of chosen) {
    const suggestion = mainSuggestion(garment)!
    const category = garment.category as GarmentCategory
    const subcategory = garmentSubcategory(garment).trim()
    const reading = garmentLabel(garment)
    const size = garmentSize(garment)
    const brand = reading?.brand?.brand ?? suggestion.brand?.brand ?? ''
    const composition = reading?.composition?.value ?? ''
    const [image, ...additionalImages] = await Promise.all(garment.photoIds.map((id) => reducePhoto(photoById(id)!.file))) as [Blob, ...Blob[]]
    const labelFile = garment.labelIds[0] ? photoById(garment.labelIds[0])?.file : undefined
    const labelImage = labelFile ? await reducePhoto(labelFile) : undefined
    const cutout = garment.keepBackground ? undefined : garment.cutout
    const { thumbnail, width, height } = await createThumbnail(cutout ?? image)
    const usage = suggestUsage({ category, subcategory, sleeve: suggestion.sleeve?.value, composition })
    const values = { category, subcategory, colors: garment.colors, pattern: suggestion.pattern?.label ?? '', brand, size: size?.value ?? '', composition }
    const now = new Date().toISOString()
    await garmentRepository.create({
      id: crypto.randomUUID(),
      name: createSuggestedGarmentName(subcategory, garment.colors, brand),
      category,
      subcategory,
      colors: garment.colors,
      ...(suggestion.pattern ? { pattern: suggestion.pattern.label } : {}),
      ...(brand ? { brand } : {}),
      ...(size ? { size: size.value } : {}),
      ...(composition ? { composition } : {}),
      seasons: usage.seasons,
      styles: usage.styles,
      dressLevels: usage.dressLevels,
      role: roleByCategory[category],
      image,
      ...(additionalImages.length ? { additionalImages } : {}),
      ...(labelImage ? { labelImage } : {}),
      ...(cutout ? { cutout } : {}),
      thumbnail,
      width,
      height,
      confirmedAttributes: [],
      suggestedAttributes: ['category', 'subcategory', 'colors', 'seasons', 'dressLevels', 'styles',
        ...(suggestion.pattern ? ['pattern'] : []), ...(brand ? ['brand'] : []), ...(size ? ['size'] : []), ...(composition ? ['composition'] : [])],
      analysis: analysisRecord({ suggestion, labelReading: reading, labelSize: size, imageChanged: true, garment: undefined, values }),
      createdAt: now,
      updatedAt: now
    })
    saved += 1
    onProgress(saved)
  }
  return saved
}

/** Discards the batch (after saving it, or on cancel); a job still running finishes without writing. */
export function clearBatch() {
  generation += 1
  jobs = []
  set({ photos: [], garments: [], running: false, runStartedAt: undefined, runAnalyzed: 0 })
}
