import { useEffect, useRef } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { garmentLabel } from '../OutfitBoard'
import GarmentPhoto from '../GarmentPhoto'
import type { GarmentOption } from '../../outfits/outfitGenerator'
import type { Garment } from '../../types/domain'

interface GarmentPickerProps {
  title: string
  /** Best first; the first ones are marked as those that go best with the outfit. */
  options: GarmentOption[]
  /** In the wash or put away: they can be brought back from here. */
  unavailable: Garment[]
  /** What is in this place now, which can be taken off when the outfit does not need it. */
  current?: Garment
  canRemove: boolean
  onPick: (garment: Garment) => void
  onRemove: () => void
  onAvailability: (garment: Garment, availability: Garment['availability']) => void
  onClose: () => void
}

/** Chooses a garment for a place in the outfit, those that go best with the rest first. */
export default function GarmentPicker({ title, options, unavailable, current, canRemove, onPick, onRemove, onAvailability, onClose }: GarmentPickerProps) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="picker" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialog}>
        <header className="picker-header">
          <h2>{title}</h2>
          <button className="close-button" type="button" onClick={onClose} aria-label="Cerrar"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
        </header>
        {current && canRemove && <button className="button button-outline picker-remove" type="button" onClick={onRemove}>Quitar {garmentLabel(current)}</button>}
        {options.length === 0 && <p className="picker-empty">No hay otras prendas disponibles de este tipo.</p>}
        <ul className="picker-grid">
          {options.map(({ garment }, index) => (
            <li key={garment.id}>
              <button type="button" className="picker-option" onClick={() => onPick(garment)} aria-label={garmentLabel(garment)}>
                <span className="garment-tile"><GarmentPhoto image={garment.thumbnail ?? garment.image} alt="" /></span>
                {index < 3 && options.length > 3 && <span className="picker-best">Combina mejor</span>}
                <span className="picker-name">{garmentLabel(garment)}</span>
              </button>
              <button type="button" className="picker-wash" onClick={() => onAvailability(garment, 'laundry')} aria-label={`Marcar ${garmentLabel(garment)} como en la lavadora`}>A la lavadora</button>
            </li>
          ))}
        </ul>
        {unavailable.length > 0 && (
          <section className="picker-away">
            <h3>En la lavadora o guardadas</h3>
            <ul>
              {unavailable.map((garment) => (
                <li key={garment.id}>
                  <GarmentPhoto image={garment.thumbnail ?? garment.image} alt="" />
                  <span>{garmentLabel(garment)}</span>
                  <button type="button" onClick={() => onAvailability(garment, 'available')} aria-label={`Marcar ${garmentLabel(garment)} como disponible`}>Ya está disponible</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
