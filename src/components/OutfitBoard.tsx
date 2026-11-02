import type { Garment } from '../types/domain'
import GarmentPhoto from './GarmentPhoto'

export function garmentLabel(garment: Garment) {
  return garment.name.trim() || garment.subcategory || garment.category
}

/** The garments of an outfit together, like clothes laid out on a light surface. */
export default function OutfitBoard({ garments }: { garments: Garment[] }) {
  return (
    <div className="outfit-garments">
      {garments.map((garment) => (
        <figure key={garment.id}>
          <span className="garment-tile"><GarmentPhoto image={garment.thumbnail ?? garment.image} alt={garmentLabel(garment)} /></span>
          <figcaption>{garmentLabel(garment)}</figcaption>
        </figure>
      ))}
    </div>
  )
}
