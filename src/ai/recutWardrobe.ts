import { garmentRepository } from '../db/garmentRepository'
import { createThumbnail } from '../db/imageProcessing'
import type { Garment } from '../types/domain'
import { analyzeGarmentImage } from './clothingAnalyzer'
import { cutOutGarments } from './cutout'
import { appCutoutOptions } from './cutoutOptions'

// «Mejorar los recortes»: the garments already stored are cut out again the app's way (cutoutOptions.ts). Only
// those the new way changes are saved (the second pass took bits of the backdrop out, or a person was taken out):
// otherwise the cut-out would be today's plain one, which barely differs from the stored ones and was once worse
// (bench/recut.html, 21-11-2026). What each one had is kept, so the whole run can be undone.

/** What a garment had before, to undo. */
export interface PreviousCutout {
  id: string
  cutout: Blob
  thumbnail: Blob
  width: number
  height: number
  updatedAt: string
}

export interface RecutResult {
  /** Garments with a cut-out that were looked at. */
  checked: number
  /** Those whose cut-out changed, with what they had. */
  changed: PreviousCutout[]
  /** Those that could not be processed (their photo, the models). */
  failed: number
}

/** Garments that have a cut-out: those kept with their background are not touched. */
export function recutCandidates(garments: Garment[]): Garment[] {
  return garments.filter((garment) => garment.hasCutout)
}

export async function recutWardrobe(garments: Garment[], onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<RecutResult> {
  const candidates = recutCandidates(garments)
  const result: RecutResult = { checked: 0, changed: [], failed: 0 }
  for (const [index, garment] of candidates.entries()) {
    if (signal?.aborted) break
    onProgress(index, candidates.length)
    try {
      const stored = await garmentRepository.withPhotos(garment.id)
      if (!stored?.cutout) continue
      result.checked += 1
      const [map] = (await analyzeGarmentImage([stored.image])).segmentations
      if (!map) continue
      let improved = false
      const [cut] = await cutOutGarments(stored.image, map, 'single', {
        ...appCutoutOptions(garment.category),
        onRefine: (report) => { if (report.outcome === 'replaced') improved = true },
        onPerson: (report) => { if (report.person) improved = true }
      })
      if (!cut || !improved) continue
      const { thumbnail, width, height } = await createThumbnail(cut.image)
      result.changed.push({ id: garment.id, cutout: stored.cutout, thumbnail: stored.thumbnail, width: stored.width, height: stored.height, updatedAt: stored.updatedAt })
      await garmentRepository.update({ ...stored, cutout: cut.image, thumbnail, width, height, updatedAt: new Date().toISOString() })
    } catch (error) {
      console.warn('No se pudo volver a recortar una prenda:', error)
      result.failed += 1
    }
  }
  onProgress(candidates.length, candidates.length)
  return result
}

/** Puts back what the garments had before the run. */
export async function undoRecut(previous: PreviousCutout[]): Promise<void> {
  for (const before of previous) {
    const stored = await garmentRepository.withPhotos(before.id)
    if (!stored) continue
    await garmentRepository.update({ ...stored, cutout: before.cutout, thumbnail: before.thumbnail, width: before.width, height: before.height, updatedAt: new Date().toISOString() })
  }
}
