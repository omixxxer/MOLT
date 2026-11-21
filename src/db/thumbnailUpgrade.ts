import type { Garment } from '../types/domain'
import { database } from './database'
import { garmentRepository } from './garmentRepository'
import { createThumbnail } from './imageProcessing'

// Thumbnails of cut-outs used to be JPEGs on white: in the gallery that white was multiplied into the card's colour,
// so a white garment melted into it. They are made again from the stored cut-out, with its transparency
// (createThumbnail), once: on opening the app and after an import (a backup from before brings JPEGs back). No model
// runs; the garment's data and updatedAt are not touched, so nothing moves in the wardrobe.

/** Remakes the JPEG thumbnails of garments with a cut-out; returns how many changed. */
export async function upgradeCutoutThumbnails(garments: Garment[]): Promise<number> {
  const withCutout = garments.filter((garment) => garment.hasCutout).map((garment) => garment.id)
  if (!withCutout.length) return 0
  const stored = await database.garmentThumbnails.bulkGet(withCutout)
  let changed = 0
  for (const [index, id] of withCutout.entries()) {
    const thumbnail = stored[index]?.thumbnail
    if (thumbnail && thumbnail.type !== 'image/jpeg') continue
    try {
      const cutout = (await garmentRepository.photos(id))?.cutout
      if (!cutout) continue
      const made = await createThumbnail(cutout, { transparent: true })
      await database.garmentThumbnails.put({ garmentId: id, thumbnail: made.thumbnail })
      changed += 1
    } catch (error) {
      console.warn('No se pudo rehacer la miniatura de una prenda:', error)
    }
  }
  return changed
}
