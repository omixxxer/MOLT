import { useState } from 'react'
import { Add01Icon, Cancel01Icon, Image02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import EditIcon from '../EditIcon'
import GarmentPhoto from '../GarmentPhoto'
import { LatticeLoader } from '../reactBits'
import TakePhoto from '../TakePhoto'
import PhotoEditor from './PhotoEditor'

/** [field, value used, text as read] for each field the label gave. */
export type LabelFinding = readonly [string, string | undefined, string | undefined]

interface LabelPhotoSlotProps {
  photos: Blob[]
  max: number
  reading: boolean
  /** The label has been read (even if nothing was recognised). */
  read: boolean
  findings: LabelFinding[]
  error: string
  disabled: boolean
  /** Photos chosen in the gallery or taken with the camera, still to be checked. */
  onSelect: (files: File[]) => void
  onRead: () => void
  /** A label photo turned or cropped (PhotoEditor): it replaces that photo and the label is read again. */
  onEdit: (index: number, edited: Blob) => void
  onRemove: (index: number) => void
}

const ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

/**
 * The care label's own photos (both sides, or a second label): only read for brand, size and composition, never
 * classified. The gallery is the usual way to add them, so it gets the large button; the camera, the small one.
 */
export default function LabelPhotoSlot({ photos, max, reading, read, findings, error, disabled, onSelect, onRead, onEdit, onRemove }: LabelPhotoSlotProps) {
  const [editing, setEditing] = useState<number>()
  const room = photos.length < max
  const choose = (files: FileList | null) => onSelect([...(files ?? [])])
  const galleryInput = (label: string) => (
    <input
      type="file"
      accept={ACCEPT}
      multiple
      onChange={(event) => {
        choose(event.currentTarget.files)
        event.currentTarget.value = ''
      }}
      aria-label={label}
      disabled={disabled || reading}
    />
  )

  return (
    <section className="label-slot" aria-label="Fotos de la etiqueta">
      {photos.length ? (
        <div className="label-slot-body">
          <ul className="label-slot-photos" aria-label="Fotos de la etiqueta">
            {photos.map((photo, index) => (
              <li className="label-slot-photo" key={`${index}-${photo.size}`}>
                <GarmentPhoto image={photo} alt={photos.length > 1 ? `Etiqueta, foto ${index + 1}` : 'Etiqueta de la prenda'} />
                <button type="button" className="edit-photo label-slot-edit" onClick={() => setEditing(index)} disabled={disabled || reading} aria-label={`Editar la foto ${index + 1} de la etiqueta: recortar o girar`} title="Recortar o girar la foto">
                  <EditIcon />
                </button>
                <button type="button" className="label-slot-remove" onClick={() => onRemove(index)} disabled={disabled} aria-label={`Quitar la foto ${index + 1} de la etiqueta`} title="Quitar esta foto">
                  <HugeiconsIcon icon={Cancel01Icon} size={13} />
                </button>
              </li>
            ))}
            {room && (
              <li>
                <label className="label-slot-add" title="Añadir otra foto de la etiqueta (por ejemplo, el otro lado)">
                  <HugeiconsIcon icon={Add01Icon} size={16} aria-hidden="true" />
                  <span>Añadir otra</span>
                  {galleryInput('Añadir otra foto de la etiqueta')}
                </label>
              </li>
            )}
            {room && (
              <li className="label-slot-camera">
                <TakePhoto ariaLabel="Hacer otra foto de la etiqueta" className="label-slot-add" disabled={disabled || reading} onTake={choose} />
              </li>
            )}
          </ul>
          <div className="label-slot-reading" role="status">
            {reading && <LatticeLoader label={photos.length > 1 ? 'Leyendo las etiquetas' : 'Leyendo la etiqueta'} pattern="snake" fontSize={10} cellSize={4} />}
            {!reading && findings.length > 0 && (
              <dl className="analysis-read">
                {findings.map(([label, value, text]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}{text && text.toLocaleLowerCase('es') !== value?.toLocaleLowerCase('es') && <> <q>{text}</q></>}</dd></div>
                ))}
              </dl>
            )}
            {!reading && read && !findings.length && !error && (
              <p className="analysis-progress">No se ha reconocido marca, talla ni composición.</p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            {!read && !reading && (
              <div className="label-slot-actions">
                <button type="button" onClick={onRead} disabled={disabled}>Leer etiqueta</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="label-slot-empty">
          <label className="label-upload">
            <HugeiconsIcon icon={Image02Icon} size={22} aria-hidden="true" />
            <span>Añadir fotos de la etiqueta <small>Desde la galería. Molt lee la marca, la talla y la composición</small></span>
            {galleryInput('Seleccionar fotos de la etiqueta')}
          </label>
          <TakePhoto label="Cámara" ariaLabel="Hacer una foto de la etiqueta" className="button button-outline label-take-photo" disabled={disabled} onTake={choose} />
        </div>
      )}
      {!photos.length && error && <p className="form-error" role="alert">{error}</p>}
      {editing !== undefined && photos[editing] && (
        <PhotoEditor
          photo={photos[editing]}
          onCancel={() => setEditing(undefined)}
          onApply={(edited) => {
            const index = editing
            setEditing(undefined)
            onEdit(index, edited)
          }}
        />
      )}
    </section>
  )
}
