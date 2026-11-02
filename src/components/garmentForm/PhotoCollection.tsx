import { useState, type DragEvent } from 'react'
import { Add01Icon, Cancel01Icon, Image02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import GarmentPhoto from '../GarmentPhoto'
import { LatticeLoader } from '../reactBits'

interface PhotoCollectionProps {
  photos: Blob[]
  max: number
  disabled: boolean
  /** Files chosen by the user, still to be checked. */
  onAdd: (files: FileList | null) => void
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
 * thumbnails. The first is the main one; the one in view can be made main or removed.
 */
export default function PhotoCollection({ photos, max, disabled, onAdd, onChange, cutout, cuttingOut, canToggleCutout, onToggleCutout }: PhotoCollectionProps) {
  const [viewed, setViewed] = useState(0)
  const [dragging, setDragging] = useState(false)
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
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      if (!disabled) onAdd(event.dataTransfer.files)
    }
  }

  if (!photo) {
    return (
      <label className="photo-drop" {...dropHandlers} {...(dragging ? { 'data-dragging': '' } : {})}>
        <span className="photo-drop-icon" aria-hidden="true"><HugeiconsIcon icon={Image02Icon} size={26} /></span>
        <strong>Añade una foto de la prenda</strong>
        <small>Molt sugiere el tipo, el color y el estampado, y le quita el fondo.</small>
        <span className="button button-dark">Elegir fotos</span>
        <small>Hasta {max} fotos · JPG, PNG o WebP · 8 MB cada una</small>
        {fileInput}
      </label>
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
        </div>
      </div>
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
      </div>
    </div>
  )
}
