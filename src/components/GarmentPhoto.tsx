import type { Garment } from '../types/domain'
import { useGarmentThumbnail } from './useGarmentImages'
import { useObjectUrl } from './useObjectUrl'

interface GarmentPhotoProps {
  image: Blob
  alt: string
  className?: string
}

export default function GarmentPhoto({ image, alt, className }: GarmentPhotoProps) {
  const imageUrl = useObjectUrl(image)
  if (!imageUrl) return null
  return <img className={className} src={imageUrl} alt={alt} />
}

interface GarmentThumbnailProps {
  garment: Pick<Garment, 'id' | 'updatedAt'>
  alt: string
  className?: string
}

/** The thumbnail of a garment, read from the database when shown; its object URL is revoked on unmount. */
export function GarmentThumbnail({ garment, alt, className }: GarmentThumbnailProps) {
  const imageUrl = useObjectUrl(useGarmentThumbnail(garment))
  if (!imageUrl) return null
  return <img className={className} src={imageUrl} alt={alt} />
}
