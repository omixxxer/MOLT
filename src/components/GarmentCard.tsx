import { colorSwatch } from '../ai/colors'
import type { Garment } from '../types/domain'
import GarmentPhoto from './GarmentPhoto'

interface GarmentCardProps {
  garment: Garment
  label: string
  onOpen: () => void
}

/** A garment in the wardrobe: the picture on a light surface, what it is underneath. */
export default function GarmentCard({ garment, label, onOpen }: GarmentCardProps) {
  const details = [garment.brand, garment.size].filter(Boolean).join(' · ') || garment.category
  return (
    <button className="garment-card" type="button" onClick={onOpen} aria-label={label}>
      <span className="garment-card-image" {...(garment.cutout ? { 'data-cutout': '' } : {})}>
        <GarmentPhoto image={garment.thumbnail ?? garment.image} alt="" />
        {garment.code && <span className="garment-card-code">{garment.code}</span>}
      </span>
      <span className="garment-card-title">{label}</span>
      <span className="garment-card-meta">
        {garment.colors.slice(0, 4).map((color) => <span key={color} className="color-dot" style={{ background: colorSwatch(color) }} title={color} />)}
        <span className="garment-card-details">{details}</span>
      </span>
    </button>
  )
}
