import type { Garment, GarmentPhotos } from '../types/domain'
import { categoryIdForLabel, categoryOfSubcategory, matchLabel, TAXONOMY_VERSION, type LabelHead } from './taxonomy'
import { blobBytes, createZip, type ZipEntry } from './zip'

export const EXPORT_FORMAT = 'vesta-training-export'

type ReviewState = 'corrected' | 'accepted-suggestion' | 'manual'

export interface TrainingRecord {
  garmentId: string
  images: string[]
  labels: Record<LabelHead, string | string[] | null>
  /** How each label was obtained, so training can down-weight unreviewed model suggestions. */
  review: Partial<Record<LabelHead, ReviewState>>
  /** Original text, kept so unmatched values can be added to the taxonomy later. */
  raw: { category: string; subcategory: string; pattern?: string; colors: string[]; seasons: string[]; dressLevels: string[] }
}

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function reviewState(garment: Garment, attribute: 'category' | 'subcategory' | 'colors'): ReviewState {
  if (garment.analysis?.correctedAttributes.includes(attribute)) return 'corrected'
  if (garment.suggestedAttributes.includes(attribute)) return 'accepted-suggestion'
  return 'manual'
}

function uniqueMatches(head: LabelHead, values: string[]): string[] | null {
  const matches = [...new Set(values.map((value) => matchLabel(head, value)).filter((value): value is string => value !== null))]
  return matches.length ? matches : null
}

export function photosOf(photos: GarmentPhotos): Blob[] {
  return [photos.image, ...(photos.additionalImages ?? [])]
}

/** Labels only: no name, brand, size or notes leave the device in the export. */
export function toTrainingRecord(garment: Garment, photos: Blob[]): TrainingRecord {
  const subcategory = matchLabel('subcategory', garment.subcategory)
  return {
    garmentId: garment.id,
    images: photos.map((photo, index) => `images/${garment.id}-${index}.${extensions[photo.type] ?? 'jpg'}`),
    labels: {
      // The taxonomy decides the category when the subcategory is known (e.g. a jersey is a top).
      category: (subcategory && categoryOfSubcategory(subcategory)) ?? categoryIdForLabel(garment.category),
      subcategory,
      sleeve: null,
      fit: null,
      pattern: matchLabel('pattern', garment.pattern),
      formality: uniqueMatches('formality', garment.dressLevels),
      seasons: uniqueMatches('seasons', garment.seasons),
      colors: uniqueMatches('colors', garment.colors)
    },
    review: {
      category: reviewState(garment, 'category'),
      subcategory: reviewState(garment, 'subcategory'),
      colors: reviewState(garment, 'colors'),
      pattern: 'manual',
      formality: 'manual',
      seasons: 'manual'
    },
    raw: {
      category: garment.category,
      subcategory: garment.subcategory,
      ...(garment.pattern ? { pattern: garment.pattern } : {}),
      colors: garment.colors,
      seasons: garment.seasons,
      dressLevels: garment.dressLevels
    }
  }
}

/** Photos are read one garment at a time through loadPhotos; a garment whose photos are missing is left out. */
export async function createTrainingExport(
  garments: Garment[],
  loadPhotos: (garmentId: string) => Promise<GarmentPhotos | undefined>,
  exportedAt = new Date()
): Promise<Blob> {
  const encoder = new TextEncoder()
  const records: TrainingRecord[] = []
  const images: ZipEntry[] = []
  for (const garment of garments) {
    const stored = await loadPhotos(garment.id)
    if (!stored) continue
    const photos = photosOf(stored)
    const record = toTrainingRecord(garment, photos)
    records.push(record)
    for (const [index, name] of record.images.entries()) images.push({ name, data: await blobBytes(photos[index]!) })
  }
  const entries: ZipEntry[] = [
    {
      name: 'export.json',
      data: encoder.encode(JSON.stringify({
        format: EXPORT_FORMAT,
        taxonomyVersion: TAXONOMY_VERSION,
        exportedAt: exportedAt.toISOString(),
        garments: records.length
      }, null, 2))
    },
    { name: 'labels.jsonl', data: encoder.encode(records.map((record) => JSON.stringify(record)).join('\n') + '\n') }
  ]
  return createZip([...entries, ...images])
}
