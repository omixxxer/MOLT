import { useState } from 'react'
import { Alert02Icon, Tag01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { colorSwatch } from '../../ai/colors'
import { categoryIdForLabel, subcategoryOptions } from '../../ml/taxonomy'
import { garmentCategories, type GarmentCategory } from '../../types/domain'
import ColorPalette from '../ColorPalette'
import GarmentPhoto from '../GarmentPhoto'
import EditIcon from '../EditIcon'
import PhotoEditor from '../garmentForm/PhotoEditor'
import {
  editGarment,
  garmentLabel,
  garmentSize,
  garmentSubcategory,
  mainSuggestion,
  makeMain,
  replacePhoto,
  reviewReasons,
  splitPhoto,
  toggleLabel,
  type BatchGarment,
  type BatchPhoto
} from './batchQueue'
import { useCardDrag } from './cardDrag'

const OTHER = 'other'

interface BatchCardProps {
  garment: BatchGarment
  photos: Map<string, BatchPhoto>
  disabled: boolean
}

/**
 * One garment to review. It reads as a finished garment, not as a form: the type is edited in place, the colours
 * open a palette, and the actions on a photo appear when its thumbnail is touched.
 */
export default function BatchCard({ garment, photos, disabled }: BatchCardProps) {
  const [selected, setSelected] = useState<string>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [writingOther, setWritingOther] = useState(false)
  /** The photo being turned or cropped (PhotoEditor). */
  const [editing, setEditing] = useState<string>()
  const { dragging, handle } = useCardDrag()
  const main = garment.photoIds[0] ? photos.get(garment.photoIds[0]) : undefined
  // What dragging shows on this card: it is the one being moved, or the one the pointer is over.
  const dragProps = {
    'data-drop-garment': garment.id,
    ...(dragging?.over?.garmentId === garment.id && dragging.item.garmentId !== garment.id ? { 'data-drop-over': dragging.over.zone } : {}),
    ...(dragging?.item.kind === 'garment' && dragging.item.garmentId === garment.id ? { 'data-drag-source': '' } : {})
  }
  const draggingPhoto = dragging?.item.kind === 'photo'

  if (!main) {
    return (
      <li className="batch-card batch-orphan" {...dragProps}>
        <p>Esta etiqueta se unirá a la siguiente prenda que analices, o arrastra aquí la prenda a la que pertenece.</p>
      </li>
    )
  }

  const subcategory = garmentSubcategory(garment)
  const categoryId = categoryIdForLabel(garment.category as GarmentCategory)
  const options = subcategoryOptions(categoryId)
  // A type outside the list (written by the user) is shown in the text field.
  const typing = writingOther || (subcategory !== '' && !options.includes(subcategory))
  const label = garmentLabel(garment)
  const read = [label?.brand?.brand ?? mainSuggestion(garment)?.brand?.brand, garmentSize(garment)?.value, label?.composition?.value].filter(Boolean).join(' · ')
  const reasons = reviewReasons(garment)
  const showCutout = garment.cutout && !garment.keepBackground
  const cuttingOut = garment.cutoutStatus === 'waiting' || garment.cutoutStatus === 'working'
  const others = [...garment.photoIds.slice(1), ...garment.labelIds]
  const chosen = selected && others.includes(selected) ? selected : undefined
  const chosenIsLabel = chosen ? garment.labelIds.includes(chosen) : false

  return (
    <li className="batch-card" {...(garment.include ? {} : { 'data-off': '' })} {...dragProps}>
      <div
        className="batch-card-image"
        {...(showCutout ? { 'data-cutout': '' } : {})}
        {...handle({ kind: 'garment', garmentId: garment.id, image: showCutout ? garment.cutout! : main.file }, disabled)}
        title="Arrastra sobre otra prenda para unirlas"
      >
        <GarmentPhoto image={showCutout ? garment.cutout! : main.file} alt={subcategory || garment.category} />
        {draggingPhoto && <span className="card-drop-label" data-drop-label={garment.id}><HugeiconsIcon icon={Tag01Icon} size={13} />Como etiqueta</span>}
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
        <button
          type="button"
          className="edit-photo batch-edit-photo"
          onClick={() => setEditing(main.id)}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={disabled}
          aria-label={`Editar la foto principal de ${subcategory || garment.category}: recortar o girar`}
          title="Recortar o girar la foto"
        >
          <EditIcon />
        </button>
      </div>

      {others.length > 0 && (
        <ul className="batch-thumbs" aria-label="Otras fotos de esta prenda">
          {others.map((id) => {
            const photo = photos.get(id)
            if (!photo) return null
            const isLabel = garment.labelIds.includes(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  className="batch-thumb"
                  aria-pressed={chosen === id}
                  onClick={() => setSelected(chosen === id ? undefined : id)}
                  aria-label={isLabel ? 'Foto de la etiqueta' : 'Otra foto de la prenda'}
                  title="Tócala para ver qué hacer, o arrástrala a otra prenda"
                  {...handle({ kind: 'photo', garmentId: garment.id, photoId: id, image: photo.file }, disabled)}
                  {...(dragging?.item.kind === 'photo' && dragging.item.photoId === id ? { 'data-drag-source': '' } : {})}
                >
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
          <button type="button" className="edit-photo batch-thumb-edit" onClick={() => setEditing(chosen)} disabled={disabled} aria-label={chosenIsLabel ? 'Editar la foto de la etiqueta: recortar o girar' : 'Editar esta foto: recortar o girar'} title="Recortar o girar la foto">
            <EditIcon size={16} />
          </button>
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
        <select
          className="batch-title"
          aria-label="Tipo de prenda"
          value={typing ? OTHER : subcategory}
          onChange={(event) => {
            const other = event.target.value === OTHER
            setWritingOther(other)
            editGarment(garment.id, { subcategory: other ? '' : event.target.value })
          }}
          disabled={disabled}
        >
          <option value="" disabled>Elige el tipo</option>
          {options.map((option) => <option key={option}>{option}</option>)}
          <option value={OTHER}>Otro…</option>
        </select>
        {typing && (
          <input
            className="batch-other"
            aria-label="Escribe el tipo de prenda"
            placeholder="Escribe el tipo"
            value={subcategory}
            onChange={(event) => editGarment(garment.id, { subcategory: event.target.value })}
            maxLength={50}
            autoFocus={writingOther}
            disabled={disabled}
          />
        )}
        <select
          className="batch-category"
          aria-label="Categoría"
          value={garment.category}
          onChange={(event) => {
            setWritingOther(false)
            editGarment(garment.id, { category: event.target.value as GarmentCategory, subcategory: '' })
          }}
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
      </div>
      {editing && photos.get(editing) && (
        <PhotoEditor
          photo={photos.get(editing)!.file}
          onCancel={() => setEditing(undefined)}
          onApply={(edited) => {
            replacePhoto(editing, edited)
            setEditing(undefined)
          }}
        />
      )}
    </li>
  )
}
