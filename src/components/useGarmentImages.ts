import { useEffect, useRef, useState } from 'react'
import { garmentRepository } from '../db/garmentRepository'
import type { Garment, GarmentWithPhotos } from '../types/domain'

interface LoadedThumbnail {
  /** updatedAt of the garment when its thumbnail was read, to read it again after an edit. */
  version: string
  url: string
}

/**
 * Object URLs of the thumbnails of the given garments, by garment id. Only thumbnails not loaded yet are read from
 * the database; a URL is revoked when its garment leaves the list or changes, and all of them on unmount.
 */
export function useThumbnailUrls(garments: Garment[]): ReadonlyMap<string, string> {
  const loaded = useRef(new Map<string, LoadedThumbnail>())
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const missing = garments.filter((garment) => loaded.current.get(garment.id)?.version !== garment.updatedAt)

    function show(thumbnails: Map<string, Blob>) {
      const previous = loaded.current
      const next = new Map<string, LoadedThumbnail>()
      for (const garment of garments) {
        const current = previous.get(garment.id)
        const thumbnail = thumbnails.get(garment.id)
        if (current?.version === garment.updatedAt) next.set(garment.id, current)
        else if (thumbnail) next.set(garment.id, { version: garment.updatedAt, url: URL.createObjectURL(thumbnail) })
      }
      loaded.current = next
      setUrls(new Map([...next].map(([id, entry]) => [id, entry.url])))
      for (const [id, entry] of previous) if (next.get(id) !== entry) URL.revokeObjectURL(entry.url)
    }

    if (!missing.length) {
      show(new Map())
      return
    }
    void garmentRepository.thumbnails(missing.map((garment) => garment.id))
      .catch(() => new Map<string, Blob>())
      .then((thumbnails) => { if (!cancelled) show(thumbnails) })
    return () => { cancelled = true }
  }, [garments])

  useEffect(() => () => {
    for (const entry of loaded.current.values()) URL.revokeObjectURL(entry.url)
    loaded.current = new Map()
  }, [])

  return urls
}

/** The thumbnail of one garment, read when the component mounts and again after the garment is edited. */
export function useGarmentThumbnail(garment: Pick<Garment, 'id' | 'updatedAt'>): Blob | undefined {
  const [thumbnail, setThumbnail] = useState<Blob>()

  useEffect(() => {
    let cancelled = false
    void garmentRepository.thumbnails([garment.id])
      .then((thumbnails) => { if (!cancelled) setThumbnail(thumbnails.get(garment.id)) })
      .catch(() => { if (!cancelled) setThumbnail(undefined) })
    return () => { cancelled = true }
  }, [garment.id, garment.updatedAt])

  return thumbnail
}

/** The garment with its original photos, read when the detail opens; undefined while loading. */
export function useGarmentWithPhotos(garment: Pick<Garment, 'id' | 'updatedAt'>): { photos?: GarmentWithPhotos; failed: boolean } {
  const [state, setState] = useState<{ photos?: GarmentWithPhotos; failed: boolean }>({ failed: false })

  useEffect(() => {
    let cancelled = false
    setState({ failed: false })
    void garmentRepository.withPhotos(garment.id)
      .then((photos) => { if (!cancelled) setState({ photos, failed: !photos }) })
      .catch(() => { if (!cancelled) setState({ failed: true }) })
    return () => { cancelled = true }
  }, [garment.id, garment.updatedAt])

  return state
}
