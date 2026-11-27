import { useState, type DragEvent } from 'react'
import { Add01Icon, Cancel01Icon, ClipboardPasteIcon, Image02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { MAX_PHOTO_MB } from '../../db/photoLimits'
import GarmentPhoto from '../GarmentPhoto'
import { LatticeLoader } from '../reactBits'
import TakePhoto from '../TakePhoto'
import EditIcon from '../EditIcon'
import { canReadClipboardImages, imagesFromClipboard, imagesFromDrop, type IntakeResult } from '../imageIntake'
import PhotoEditor from './PhotoEditor'

interface PhotoCollectionProps {
  photos: Blob[]
  max: number
  disabled: boolean
  /** Files chosen by the user, still to be checked; `web` when they came from a web page or the clipboard. */
  onAdd: (files: FileList | File[] | null, web?: boolean) => void
  /** Why a drop or a paste brought nothing. */
  onIntakeError: (message: string) => void
  /** The new list after making a photo the main one or removing it. */
  onChange: (photos: Blob[]) => void
  /** The main photo without background, shown in its place. */
  cutout?: Blob
  cuttingOut: boolean
  canToggleCutout: boolean
  onToggleCutout: () => void
}

/**
 * The garment's photos: before the first one, a place to drop them; then the photo in large with the others as
 * thumbnails. The first is the main one; the one in view can be made main, edited (turned and cropped) or removed.
 */
export default function PhotoCollection({ photos, max, disabled, onAdd, onIntakeError, onChange, cutout, cuttingOut, canToggleCutout, onToggleCutout }: PhotoCollectionProps) {
  const [viewed, setViewed] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const index = Math.min(viewed, Math.max(0, photos.length - 1))
  const isMain = index === 0
  const photo = photos[index]
  const fileInput = (
    <input
      type="file"
      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      multiple
      onChange={(event) => {
        onAdd(event.currentTarget.files)
        event.currentTarget.value = ''
      }}
      aria-label="Seleccionar fotografía de la prenda"
      disabled={disabled}
    />
  )
  const dropHandlers = {
    onDragOver: (event: DragEvent) => {
      // Files, or an image dragged from another tab (its address).
      if (!['Files', 'text/uri-list', 'text/html'].some((type) => event.dataTransfer.types.includes(type))) return
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      // From the computer, files; from another tab, the image (downloaded from its address when it is not a file).
      if (!disabled) void imagesFromDrop(event.dataTransfer).then(take)
    }
  }
  const take = ({ files, fromWeb, error }: IntakeResult) => {
    if (files.length) onAdd(files, fromWeb)
    else if (error) onIntakeError(error)
  }
  // «Pegar imagen», where the browser lets a button read the clipboard; Ctrl+V works anywhere in the form.
  const pasteButton = canReadClipboardImages() && (
    <button type="button" className="button button-outline photo-paste" onClick={() => void imagesFromClipboard().then(take)} disabled={disabled}>
      <HugeiconsIcon icon={ClipboardPasteIcon} size={16} aria-hidden="true" />Pegar imagen
    </button>
  )

  if (!photo) {
    return (
      <div className="photo-drop" {...dropHandlers} {...(dragging ? { 'data-dragging': '' } : {})}>
        <span className="photo-drop-icon" aria-hidden="true"><HugeiconsIcon icon={Image02Icon} size={26} /></span>
        <strong>Añade una foto de la prenda</strong>
        <small>Molt sugiere el tipo, el color y el estampado, y le quita el fondo.</small>
        <div className="photo-drop-actions">
          <TakePhoto label="Hacer foto" ariaLabel="Hacer una foto de la prenda" disabled={disabled} onTake={onAdd} />
          <label className="button button-dark photo-drop-choose">Elegir fotos{fileInput}</label>
          {pasteButton}
        </div>
        <small>Hasta {max} fotos · JPG, PNG o WebP · {MAX_PHOTO_MB} MB cada una</small>
        <small className="photo-drop-web">¿Una foto de una tienda? Cópiala y pégala aquí (Ctrl+V) o arrástrala desde su pestaña.</small>
      </div>
    )
  }

  const showCutout = isMain && cutout
  return (
    <div className="photo-gallery" {...dropHandlers} {...(dragging ? { 'data-dragging': '' } : {})}>
      <div className="photo-stage" {...(showCutout ? { 'data-cutout': '' } : {})}>
        <GarmentPhoto image={showCutout ? cutout : photo} alt={`Foto ${index + 1} de la prenda${showCutout ? ', sin fondo' : ''}`} />
        <button type="button" className="photo-stage-remove" onClick={() => { onChange(photos.filter((_, photoIndex) => photoIndex !== index)); setViewed(0) }} disabled={disabled} aria-label={`Quitar foto ${index + 1}`} title="Quitar esta foto">
          <HugeiconsIcon icon={Cancel01Icon} size={15} />
        </button>
        <div className="photo-stage-bar">
          {isMain
            ? cuttingOut
              ? <span className="photo-stage-pill"><LatticeLoader label="Quitando el fondo" pattern="spiral" fontSize={10} cellSize={3} showTimer={false} /></span>
              : <span className="photo-stage-pill">Foto principal</span>
            : <button type="button" className="photo-stage-pill" onClick={() => { onChange([photo, ...photos.filter((_, photoIndex) => photoIndex !== index)]); setViewed(0) }} disabled={disabled}>Hacer principal</button>}
          {isMain && canToggleCutout && !cuttingOut && (
            <button type="button" className="photo-stage-pill" onClick={onToggleCutout} disabled={disabled}>{cutout ? 'Ver con fondo' : 'Quitar fondo'}</button>
          )}
          <button type="button" className="photo-stage-pill edit-photo" onClick={() => setEditing(true)} disabled={disabled} aria-label={`Editar foto ${index + 1}: recortar o girar`} title="Recortar o girar la foto">
            <EditIcon />
          </button>
        </div>
      </div>
      {editing && (
        <PhotoEditor
          photo={photo}
          onCancel={() => setEditing(false)}
          onApply={(edited) => {
            setEditing(false)
            onChange(photos.map((entry, photoIndex) => (photoIndex === index ? edited : entry)))
          }}
        />
      )}
      <div className="photo-strip">
        {photos.length > 1 && photos.map((entry, photoIndex) => (
          <button type="button" className="photo-thumb" key={`${photoIndex}-${entry.size}-${entry.type}`} aria-pressed={photoIndex === index} aria-label={`Mostrar foto ${photoIndex + 1}`} onClick={() => setViewed(photoIndex)}>
            <GarmentPhoto image={photoIndex === 0 && cutout ? cutout : entry} alt="" />
          </button>
        ))}
        {photos.length < max && (
          <label className="photo-thumb photo-thumb-add" title="Añadir otra foto">
            <HugeiconsIcon icon={Add01Icon} size={16} />
            {photos.length === 1 && <span>Añadir otra foto</span>}
            {fileInput}
          </label>
        )}
        {photos.length < max && <TakePhoto ariaLabel="Hacer otra foto de la prenda" className="photo-thumb photo-thumb-add" disabled={disabled} onTake={onAdd} />}
      </div>
    </div>
  )
}
