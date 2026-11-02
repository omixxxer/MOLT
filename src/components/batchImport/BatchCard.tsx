import { useState } from 'react'
import { Alert02Icon, Link01Icon, Tag01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { colorSwatch } from '../../ai/colors'
import { categoryIdForLabel } from '../../ml/taxonomy'
import { garmentCategories, type GarmentCategory } from '../../types/domain'
import ColorPalette from '../ColorPalette'
import GarmentPhoto from '../GarmentPhoto'
import {
  editGarment,
  garmentLabel,
  garmentSize,
  garmentSubcategory,
  mainSuggestion,
  makeMain,
  mergeWithPrevious,
  reviewReasons,
  splitPhoto,
  toggleLabel,
  type BatchGarment,
  type BatchPhoto
} from './batchQueue'

interface BatchCardProps {
  garment: BatchGarment
  photos: Map<string, BatchPhoto>
  /** There is a garment before this one to join. */
  canMerge: boolean
  disabled: boolean
}

/**
 * One garment to review. It reads as a finished garment, not as a form: the type is edited in place, the colours
 * open a palette, and the actions on a photo appear when its thumbnail is touched.
 */
export default function BatchCard({ garment, photos, canMerge, disabled }: BatchCardProps) {
  const [selected, setSelected] = useState<string>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const main = garment.photoIds[0] ? photos.get(garment.photoIds[0]) : undefined

  if (!main) {
    return (
      <li className="batch-card batch-orphan">
        <p>Esta etiqueta se unirá a la siguiente prenda que analices.</p>
        {canMerge && <MergeButton id={garment.id} disabled={disabled} />}
      </li>
    )
  }

  const subcategory = garmentSubcategory(garment)
  const label = garmentLabel(garment)
  const read = [label?.brand?.brand ?? mainSuggestion(garment)?.brand?.brand, garmentSize(garment)?.value, label?.composition?.value].filter(Boolean).join(' · ')
  const reasons = reviewReasons(garment)
  const showCutout = garment.cutout && !garment.keepBackground
  const cuttingOut = garment.cutoutStatus === 'waiting' || garment.cutoutStatus === 'working'
  const others = [...garment.photoIds.slice(1), ...garment.labelIds]
  const chosen = selected && others.includes(selected) ? selected : undefined
  const chosenIsLabel = chosen ? garment.labelIds.includes(chosen) : false

  return (
    <li className="batch-card" {...(garment.include ? {} : { 'data-off': '' })}>
      <div className="batch-card-image" {...(showCutout ? { 'data-cutout': '' } : {})}>
        <GarmentPhoto image={showCutout ? garment.cutout! : main.file} alt={subcategory || garment.category} />
        <label className="batch-check" title={garment.include ? 'Se añadirá al armario' : 'No se añadirá'}>
          <input
            type="checkbox"
            checked={garment.include}
            onChange={(event) => editGarment(garment.id, { include: event.target.checked })}
            disabled={disabled}
            aria-label={`Añadir ${subcategory || garment.category} al armario`}
          />
          <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.4} />
        </label>
        {cuttingOut && <span className="batch-card-tag">Quitando el fondo…</span>}
        {garment.cutout && (
          <button type="button" className="batch-background" onClick={() => editGarment(garment.id, { keepBackground: !garment.keepBackground })} disabled={disabled}>
            {garment.keepBackground ? 'Quitar fondo' : 'Ver con fondo'}
          </button>
        )}
      </div>

      {others.length > 0 && (
        <ul className="batch-thumbs" aria-label="Otras fotos de esta prenda">
          {others.map((id) => {
            const photo = photos.get(id)
            if (!photo) return null
            const isLabel = garment.labelIds.includes(id)
            return (
              <li key={id}>
                <button type="button" className="batch-thumb" aria-pressed={chosen === id} onClick={() => setSelected(chosen === id ? undefined : id)} aria-label={isLabel ? 'Foto de la etiqueta' : 'Otra foto de la prenda'}>
                  <GarmentPhoto image={photo.file} alt="" />
                  {isLabel && <span className="batch-thumb-label"><HugeiconsIcon icon={Tag01Icon} size={11} /></span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {chosen && (
        <div className="batch-thumb-actions">
          {chosenIsLabel
            ? <button type="button" onClick={() => toggleLabel(garment.id, chosen)} disabled={disabled}>No es la etiqueta</button>
            : (
                <>
                  <button type="button" onClick={() => makeMain(garment.id, chosen)} disabled={disabled}>Hacer principal</button>
                  <button type="button" onClick={() => toggleLabel(garment.id, chosen)} disabled={disabled}>Es la etiqueta</button>
                  <button type="button" onClick={() => splitPhoto(garment.id, chosen)} disabled={disabled}>Es otra prenda</button>
                </>
              )}
        </div>
      )}

      <div className="batch-card-body">
        {reasons.length > 0 && (
          <p className="batch-reason"><HugeiconsIcon icon={Alert02Icon} size={13} />{reasons.join(' · ')}</p>
        )}
        <input
          className="batch-title"
          aria-label="Tipo de prenda"
          placeholder="Tipo de prenda"
          list={`batch-subcategories-${categoryIdForLabel(garment.category as GarmentCategory)}`}
          value={subcategory}
          onChange={(event) => editGarment(garment.id, { subcategory: event.target.value })}
          maxLength={50}
          disabled={disabled}
        />
        <select
          className="batch-category"
          aria-label="Categoría"
          value={garment.category}
          onChange={(event) => editGarment(garment.id, { category: event.target.value as GarmentCategory, subcategory: '' })}
          disabled={disabled}
        >
          {garmentCategories.map((value) => <option key={value}>{value}</option>)}
        </select>
        <button type="button" className="batch-colors-toggle" aria-expanded={paletteOpen} onClick={() => setPaletteOpen(!paletteOpen)} disabled={disabled} title="Cambiar los colores">
          {garment.colors.map((color) => <span key={color} className="color-dot" style={{ background: colorSwatch(color) }} />)}
          {garment.colors.join(', ') || 'Elegir color'}
        </button>
        {paletteOpen && (
          <ColorPalette values={garment.colors} onChange={(colors) => editGarment(garment.id, { colors })} disabled={disabled} />
        )}
        {read && <p className="batch-read">{read}</p>}
        {canMerge && <MergeButton id={garment.id} disabled={disabled} />}
      </div>
    </li>
  )
}

function MergeButton({ id, disabled }: { id: string; disabled: boolean }) {
  return (
    <button type="button" className="batch-merge" onClick={() => mergeWithPrevious(id)} disabled={disabled}>
      <HugeiconsIcon icon={Link01Icon} size={13} />
      Es la misma que la anterior
    </button>
  )
}
