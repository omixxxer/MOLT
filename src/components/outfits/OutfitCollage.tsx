import type { CSSProperties } from 'react'
import type { Garment, GarmentRole } from '../../types/domain'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'

/** Where a piece sits on the collage, in % of its width and height, and which piece goes over which. */
interface Spot { left: number; top: number; width: number; height: number; z: number }

/**
 * The places on a 3:4 board, laid out like clothes on a table (a «flat lay»): the coat behind on the right, the top
 * and the bottom down the left, the shoes at the bottom right, the accessories in the gaps. Without a coat, the top
 * and the bottom take more room.
 */
function layout(roles: Set<GarmentRole>): Partial<Record<GarmentRole, Spot>> & { extra: Spot[] } {
  const layer = roles.has('Capa')
  const onePiece = roles.has('Una pieza')
  const shoes = roles.has('Calzado')
  return {
    Capa: { left: 38, top: 2, width: 60, height: 44, z: 1 },
    Top: layer ? { left: 2, top: 8, width: 46, height: 36, z: 3 } : { left: 6, top: 3, width: 58, height: 42, z: 3 },
    'Una pieza': layer ? { left: 2, top: 6, width: 48, height: 66, z: 3 } : { left: 8, top: 3, width: 56, height: 72, z: 3 },
    Bottom: layer ? { left: 4, top: 46, width: 50, height: 36, z: 2 } : { left: 10, top: 46, width: 52, height: shoes ? 40 : 48, z: 2 },
    Calzado: onePiece || layer ? { left: 56, top: 62, width: 40, height: 34, z: 4 } : { left: 60, top: 58, width: 36, height: 36, z: 4 },
    // The accessories, in order: in the gap on the right, then low on the left, then up on the right.
    extra: layer
      ? [{ left: 60, top: 46, width: 30, height: 16, z: 5 }, { left: 6, top: 82, width: 26, height: 15, z: 5 }, { left: 34, top: 84, width: 20, height: 13, z: 5 }]
      : [{ left: 66, top: 8, width: 28, height: 22, z: 5 }, { left: 68, top: 34, width: 26, height: 20, z: 5 }, { left: 4, top: 82, width: 24, height: 15, z: 5 }]
  }
}

/**
 * The gap for the nth accessory. Any number can be worn (several earrings, a watch, a bag): past the gaps, each goes
 * over one of them, a little smaller and to one side, so every piece shows and can be touched.
 */
function extraSpot(gaps: Spot[], index: number): Spot {
  const gap = gaps[index % gaps.length]!
  const round = Math.floor(index / gaps.length)
  if (!round) return gap
  const scale = 0.8 ** round
  const width = gap.width * scale
  const height = gap.height * scale
  return {
    left: Math.min(100 - width, gap.left + round * 6),
    top: Math.min(100 - height, gap.top + round * 5),
    width,
    height,
    z: gap.z + round
  }
}

const style = ({ left, top, width, height, z }: Spot): CSSProperties => ({ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, zIndex: z })

interface OutfitCollageProps {
  garments: Garment[]
  /** Each piece becomes a button: in the studio, to change it. */
  onSelect?: (garment: Garment) => void
  /** The accessible name of each piece's button. */
  label?: (garment: Garment) => string
  /** Small, as in the ideas: no names, nothing to press. */
  compact?: boolean
  className?: string
}

/** An outfit as a collage, the garments laid out together on one board, as on a mood board. */
export default function OutfitCollage({ garments, onSelect, label = garmentLabel, compact, className }: OutfitCollageProps) {
  const spots = layout(new Set(garments.map((garment) => garment.role)))
  let extra = 0
  const placed = garments.map((garment) => {
    const own = garment.role === 'Accesorio' || garment.role === 'Joya' ? undefined : spots[garment.role]
    // A second piece of the same kind, or an accessory, goes to the next free gap.
    const taken = own && garments.findIndex((item) => item.role === garment.role) !== garments.indexOf(garment)
    const spot = own && !taken ? own : extraSpot(spots.extra, extra++)
    return { garment, spot }
  })
  return (
    <div className={`outfit-collage${compact ? ' outfit-collage-compact' : ''}${className ? ` ${className}` : ''}`} role={onSelect ? undefined : 'img'} aria-label={onSelect ? undefined : garments.map(garmentLabel).join(', ')}>
      {placed.map(({ garment, spot }) => onSelect
        ? (
            <button key={garment.id} type="button" className="outfit-collage-piece" style={style(spot)} onClick={() => onSelect(garment)} aria-label={label(garment)}>
              <GarmentThumbnail garment={garment} alt={garmentLabel(garment)} />
            </button>
          )
        : (
            <span key={garment.id} className="outfit-collage-piece" style={style(spot)}>
              <GarmentThumbnail garment={garment} alt="" />
            </span>
          ))}
    </div>
  )
}
