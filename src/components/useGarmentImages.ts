import { useEffect, useState } from 'react'
import { garmentRepository } from '../db/garmentRepository'
import type { Garment, GarmentWithPhotos } from '../types/domain'

// Thumbnails asked for in the same tick (a screen showing 40 cards) are read in one request to the database.
let waiting: Map<string, Array<(thumbnail: Blob | undefined) => void>> | undefined

function readThumbnail(garmentId: string): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    if (!waiting) {
      const batch = waiting = new Map()
      queueMicrotask(() => {
        waiting = undefined
        void garmentRepository.thumbnails([...batch.keys()])
          .catch(() => new Map<string, Blob>())
          .then((thumbnails) => {
            for (const [id, resolvers] of batch) for (const done of resolvers) done(thumbnails.get(id))
          })
      })
    }
    waiting.set(garmentId, [...(waiting.get(garmentId) ?? []), resolve])
  })
}

/** The thumbnail of one garment, read when the component mounts and again after the garment is edited. */
export function useGarmentThumbnail(garment: Pick<Garment, 'id' | 'updatedAt'>): Blob | undefined {
  const [thumbnail, setThumbnail] = useState<Blob>()

  useEffect(() => {
    let cancelled = false
    void readThumbnail(garment.id).then((blob) => { if (!cancelled) setThumbnail(blob) })
    return () => { cancelled = true }
  }, [garment.id, garment.updatedAt])

  return thumbnail
}

/** The garment with its original photos, read when the detail opens; `photos` is undefined while loading. */
export function useGarmentWithPhotos(garment: Pick<Garment, 'id' | 'updatedAt'>): { photos?: GarmentWithPhotos; failed: boolean } {
  const [state, setState] = useState<{ photos?: GarmentWithPhotos; failed: boolean }>({ failed: false })

  useEffect(() => {
    let cancelled = false
    void garmentRepository.withPhotos(garment.id)
      .then((photos) => { if (!cancelled) setState({ photos, failed: !photos }) })
      .catch(() => { if (!cancelled) setState({ failed: true }) })
    return () => { cancelled = true }
  }, [garment.id, garment.updatedAt])

  // Photos read for another garment or an earlier version are not shown.
  return state.photos && (state.photos.id !== garment.id) ? { failed: false } : state
}
