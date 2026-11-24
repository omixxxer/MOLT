import { useEffect, useMemo, useRef, useState } from 'react'
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { garmentCategories, type Garment } from '../../types/domain'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'

interface SuitcasePickerProps {
  garments: Garment[]
  /** Already in the suitcase because a day of the plan wears them: shown as such, not offered. */
  inPlan: Set<string>
  /** Added by hand («por si acaso»): tapping again takes them out. */
  added: string[]
  onToggle: (garment: Garment) => void
  onClose: () => void
}

/** The wardrobe, to put garments in the suitcase that no day of the plan wears, or take them out again. */
export default function SuitcasePicker({ garments, inPlan, added, onToggle, onClose }: SuitcasePickerProps) {
  const dialog = useRef<HTMLDivElement>(null)
  const [category, setCategory] = useState<string>('')

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

  const offered = useMemo(() => garments.filter((garment) => !inPlan.has(garment.id) && (!category || garment.category === category)), [garments, inPlan, category])
  const present = garmentCategories.filter((value) => garments.some((garment) => garment.category === value && !inPlan.has(garment.id)))

  return (
    <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="picker suitcase-picker" role="dialog" aria-modal="true" aria-label="Añadir prendas a la maleta" tabIndex={-1} ref={dialog}>
        <header className="picker-header">
          <h2>Añadir prendas a la maleta</h2>
          <button className="close-button" type="button" onClick={onClose} aria-label="Cerrar"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
        </header>
        <p className="picker-note">Van a la lista como «por si acaso»: ningún día las tiene en su outfit.</p>
        {present.length > 1 && (
          <div className="suitcase-filter" role="group" aria-label="Tipo de prenda">
            <button type="button" className={`choice-chip ${category ? '' : 'selected'}`} aria-pressed={!category} onClick={() => setCategory('')}>Todas</button>
            {present.map((value) => (
              <button key={value} type="button" className={`choice-chip ${category === value ? 'selected' : ''}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>
            ))}
          </div>
        )}
        {offered.length === 0 && <p className="picker-empty">Todas estas prendas ya van en algún outfit del viaje.</p>}
        <ul className="picker-grid">
          {offered.map((garment) => {
            const chosen = added.includes(garment.id)
            return (
              <li key={garment.id}>
                <button type="button" className="picker-option" aria-pressed={chosen} onClick={() => onToggle(garment)} aria-label={garmentLabel(garment)}>
                  <span className="garment-tile"><GarmentThumbnail garment={garment} alt="" /></span>
                  {chosen && <span className="picker-best suitcase-chosen"><HugeiconsIcon icon={Tick02Icon} size={12} />En la maleta</span>}
                  <span className="picker-name">{garmentLabel(garment)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <footer className="suitcase-picker-footer">
          <button type="button" className="button button-dark" onClick={onClose}>Listo</button>
        </footer>
      </div>
    </div>
  )
}
