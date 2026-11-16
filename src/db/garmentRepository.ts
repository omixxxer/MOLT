import { database } from './database'
import { codePrefix, nextCode } from './garmentCodes'
import type { Garment, GarmentPhotos, GarmentWithPhotos } from '../types/domain'

/** The next code for the garment's type; call inside a transaction over garments and garmentCodeCounters. */
async function newCode(garment: Garment): Promise<string> {
  const prefix = codePrefix(garment)
  // The unique index lists the codes without loading the garments.
  const codes = await database.garments.where('code').startsWith(`${prefix}-`).keys()
  const counter = await database.garmentCodeCounters.get(prefix)
  const code = nextCode(prefix, codes as string[], counter?.last)
  await database.garmentCodeCounters.put({ prefix, last: Number(code.slice(prefix.length + 1)) })
  return code
}

/** The three stores a garment is spread over: its data, its photos and its thumbnail. */
export const garmentTables = () => [database.garments, database.garmentPhotos, database.garmentThumbnails]

/** Writes a garment and its images, each in its store; call inside a transaction over garmentTables(). */
export async function putGarmentWithPhotos(garment: GarmentWithPhotos): Promise<void> {
  const { image, additionalImages, labelImage, cutout, thumbnail, hasCutout: _hasCutout, ...fields } = garment
  await database.garments.put({ ...fields, ...(cutout ? { hasCutout: true } : {}) })
  await database.garmentPhotos.put({
    garmentId: garment.id,
    image,
    ...(additionalImages?.length ? { additionalImages } : {}),
    ...(labelImage ? { labelImage } : {}),
    ...(cutout ? { cutout } : {})
  })
  await database.garmentThumbnails.put({ garmentId: garment.id, thumbnail })
}

async function photosOf(id: string): Promise<GarmentPhotos | undefined> {
  const stored = await database.garmentPhotos.get(id)
  if (!stored) return undefined
  const { garmentId: _garmentId, ...photos } = stored
  return photos
}

/** A garment with every image; undefined if the garment or its photos are missing. */
export async function getGarmentWithPhotos(id: string): Promise<GarmentWithPhotos | undefined> {
  const [garment, photos, thumbnail] = await Promise.all([
    database.garments.get(id), photosOf(id), database.garmentThumbnails.get(id)
  ])
  if (!garment || !photos) return undefined
  return { ...garment, ...photos, thumbnail: thumbnail?.thumbnail ?? photos.cutout ?? photos.image }
}

export const garmentRepository = {
  /** Data only: no photo or thumbnail is read. */
  list: () => database.garments.orderBy('updatedAt').reverse().toArray(),
  get: (id: string) => database.garments.get(id),
  /** The original photos of one garment, for the detail, the form and the exports. */
  photos: photosOf,
  withPhotos: getGarmentWithPhotos,
  /** Thumbnails of the given garments only; one without thumbnail (first versions of the app) gets its photo. */
  thumbnails: async (ids: string[]): Promise<Map<string, Blob>> => {
    const stored = await database.garmentThumbnails.bulkGet(ids)
    const found = new Map<string, Blob>()
    for (const [index, id] of ids.entries()) {
      const thumbnail = stored[index]?.thumbnail ?? (await database.garmentPhotos.get(id))?.image
      if (thumbnail) found.set(id, thumbnail)
    }
    return found
  },
  /** Gives the garment its code (e.g. SUD-002) in the same transaction, so two saves cannot take the same one. */
  create: (garment: GarmentWithPhotos) => database.transaction('rw', [...garmentTables(), database.garmentCodeCounters], async () => {
    if (await database.garments.get(garment.id)) throw new Error(`La prenda ${garment.id} ya existe.`)
    const code = await newCode(garment)
    await putGarmentWithPhotos({ ...garment, code })
    return code
  }),
  /**
   * A garment keeps its code when edited, even if its type changes. Without images (e.g. a change of availability)
   * only the data is written and the stored photos stay as they are.
   */
  update: (garment: Garment | GarmentWithPhotos) => database.transaction('rw', [...garmentTables(), database.garmentCodeCounters], async () => {
    const code = garment.code ?? (await database.garments.get(garment.id))?.code ?? await newCode(garment)
    if ('image' in garment) await putGarmentWithPhotos({ ...garment, code })
    else await database.garments.put({ ...garment, code })
  }),
  remove: (id: string) => database.transaction('rw', garmentTables(), async () => {
    await database.garments.delete(id)
    await database.garmentPhotos.delete(id)
    await database.garmentThumbnails.delete(id)
  }),
  count: () => database.garments.count()
}
