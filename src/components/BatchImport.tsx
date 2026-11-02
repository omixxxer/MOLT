import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Add01Icon, Camera01Icon, Image02Icon, Tag01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { taxonomy } from '../ml/taxonomy'
import BatchCard from './batchImport/BatchCard'
import {
  addPhotos,
  clearBatch,
  retryFailed,
  reviewReasons,
  savable,
  saveBatch,
  timeLeft,
  useBatch
} from './batchImport/batchQueue'
import GarmentPhoto from './GarmentPhoto'
import { LatticeLoader } from './reactBits'

interface BatchImportProps {
  /** After saving: how many garments were added. */
  onDone: (added: number) => void
}

const maxPhotoSize = 12 * 1024 * 1024
const accepted = ['image/jpeg', 'image/png', 'image/webp']
const acceptAttribute = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

function minutes(milliseconds: number): string {
  const total = Math.max(1, Math.round(milliseconds / 60000))
  return total === 1 ? 'menos de 1 minuto' : `unos ${total} minutos`
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * Many garments at once: choose all the photos, VESTA analyses them one by one, groups the photos of each garment
 * (taken seconds apart, same type and colour) with its label, and cuts out the main photo. Nothing is saved until
 * the review; the analysis goes on if the user leaves this screen.
 */
export default function BatchImport({ onDone }: BatchImportProps) {
  const batch = useBatch()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [onlyDoubtful, setOnlyDoubtful] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const photos = new Map(batch.photos.map((photo) => [photo.id, photo]))
  const done = batch.photos.filter((photo) => photo.status === 'done' || photo.status === 'failed').length
  const failed = batch.photos.filter((photo) => photo.status === 'failed').length
  const waiting = batch.photos.length - done
  const current = batch.photos.find((photo) => photo.status === 'analyzing')
  const toSave = savable(batch)
  const doubtful = batch.garments.filter((garment) => garment.include && reviewReasons(garment).length > 0)
  const left = timeLeft(batch, now)
  // A garment being corrected stays in view until the tab changes: it must not vanish at the first letter typed.
  const keptInView = useRef(new Set<string>())
  if (onlyDoubtful) for (const garment of doubtful) keptInView.current.add(garment.id)
  const shown = onlyDoubtful ? batch.garments.filter((garment) => keptInView.current.has(garment.id)) : batch.garments
  const started = batch.photos.length > 0

  function showDoubtful(only: boolean) {
    keptInView.current.clear()
    setOnlyDoubtful(only)
  }

  useEffect(() => {
    if (!batch.running) return
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [batch.running])

  function choose(files: FileList | null) {
    setError('')
    const chosen = [...(files ?? [])]
    const valid = chosen.filter((file) => accepted.includes(file.type) && file.size > 0 && file.size <= maxPhotoSize)
    const rejected = chosen.length - valid.length
    if (rejected) setError(`${plural(rejected, 'archivo no se ha añadido', 'archivos no se han añadido')}: solo fotos JPG, PNG o WebP de 12 MB o menos.`)
    if (valid.length) void addPhotos(valid)
  }

  async function save() {
    setSaving(true)
    setSaved(0)
    setError('')
    try {
      const added = await saveBatch(setSaved)
      clearBatch()
      onDone(added)
    } catch (failure) {
      console.error('No se pudieron guardar las prendas del lote:', failure)
      setError('No se pudieron guardar todas las prendas. Las ya guardadas están en el armario; comprueba el espacio disponible.')
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    clearBatch()
    setConfirmingDiscard(false)
    showDoubtful(false)
    setError('')
  }

  const fileInput = (
    <input
      type="file"
      multiple
      accept={acceptAttribute}
      onChange={(event) => {
        choose(event.currentTarget.files)
        event.currentTarget.value = ''
      }}
      aria-label="Seleccionar fotos de varias prendas"
      disabled={saving}
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
      if (!saving) choose(event.dataTransfer.files)
    }
  }

  if (!started) {
    return (
      <div className="batch-import" {...dropHandlers} {...(dragging ? { 'data-dragging': '' } : {})}>
        <label className="batch-drop">
          <span className="batch-drop-photos" aria-hidden="true">
            <span><HugeiconsIcon icon={Tag01Icon} size={22} /></span>
            <span><HugeiconsIcon icon={Image02Icon} size={22} /></span>
            <span><HugeiconsIcon icon={Camera01Icon} size={22} /></span>
          </span>
          <strong>Elige todas las fotos de una vez</strong>
          <small>Decenas o cientos, del carrete o arrastradas aquí</small>
          <span className="button button-dark">Elegir fotos</span>
          {fileInput}
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <ol className="batch-steps">
          <li><strong>Fotografía prenda a prenda</strong><p>Delante, detrás y la etiqueta, seguidas. Después, pasa a la siguiente.</p></li>
          <li><strong>VESTA las ordena</strong><p>Junta las fotos de cada prenda, lee la etiqueta y quita el fondo.</p></li>
          <li><strong>Revisa y guarda</strong><p>Corrige solo lo que esté mal. Nada se guarda hasta que tú lo decidas.</p></li>
        </ol>
        <p className="batch-privacy"><span className="privacy-indicator" />Las fotos se procesan aquí y no salen de tu dispositivo.</p>
      </div>
    )
  }

  const progress = saving ? saved / Math.max(1, toSave.length) : done / batch.photos.length
  const headline = saving
    ? `Guardando ${saved} de ${toSave.length}…`
    : batch.running
      ? waiting ? `Analizando ${done} de ${plural(batch.photos.length, 'foto', 'fotos')}` : 'Quitando los últimos fondos…'
      : plural(toSave.length, 'prenda lista', 'prendas listas')
  const detail = batch.running
    ? `${plural(batch.garments.filter((garment) => garment.photoIds.length).length, 'prenda', 'prendas')}${left !== undefined ? ` · quedan ${minutes(left)}` : ''}`
    : doubtful.length
      ? `${doubtful.length} por revisar; el resto parece correcto`
      : 'Todo parece correcto'

  return (
    <div className="batch-import" {...dropHandlers} {...(dragging ? { 'data-dragging': '' } : {})}>
      <div className="batch-toolbar">
        <div className="batch-tabs" role="group" aria-label="Qué prendas mostrar">
          <button type="button" aria-pressed={!onlyDoubtful} onClick={() => showDoubtful(false)}>Todas ({batch.garments.filter((garment) => garment.photoIds.length).length})</button>
          <button type="button" aria-pressed={onlyDoubtful} onClick={() => showDoubtful(true)}>Por revisar ({doubtful.length})</button>
        </div>
        <label className="batch-add-more">
          <HugeiconsIcon icon={Add01Icon} size={14} />
          Añadir más fotos
          {fileInput}
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!batch.running && failed > 0 && (
        <button type="button" className="batch-notice" onClick={retryFailed}>{plural(failed, 'foto no se pudo analizar', 'fotos no se pudieron analizar')}: reintentar</button>
      )}

      {taxonomy.categories.map((category) => (
        <datalist key={category.id} id={`batch-subcategories-${category.id}`}>
          {taxonomy.subcategories.filter((entry) => entry.category === category.id).map((entry) => <option key={entry.id} value={entry.label} />)}
        </datalist>
      ))}
      {onlyDoubtful && !shown.length
        ? <p className="batch-none">{batch.running ? 'Por ahora, nada dudoso.' : 'Nada dudoso: puedes guardar.'}</p>
        : (
            <ul className="batch-grid">
              {shown.map((garment) => (
                <BatchCard key={garment.id} garment={garment} photos={photos} canMerge={!onlyDoubtful && batch.garments[0]?.id !== garment.id} disabled={saving} />
              ))}
              {!onlyDoubtful && current && (
                <li className="batch-card batch-card-pending" aria-hidden="true">
                  <div className="batch-card-image">
                    <GarmentPhoto image={current.file} alt="" />
                    <span className="batch-card-tag"><LatticeLoader label="Analizando" fontSize={10} cellSize={3} /></span>
                  </div>
                  <p className="batch-pending-note">
                    {waiting > 1 && <strong>Y {plural(waiting - 1, 'foto', 'fotos')} más en cola. </strong>}
                    Puedes usar la app mientras tanto.
                  </p>
                </li>
              )}
            </ul>
          )}

      <div className="batch-dock">
        <div className="batch-dock-bar"><span style={{ width: `${progress * 100}%` }} /></div>
        <div className="batch-dock-row" role="status">
          <div className="batch-dock-text">
            <strong>{confirmingDiscard ? `¿Descartar ${plural(batch.photos.length, 'foto', 'fotos')}?` : headline}</strong>
            <span>{confirmingDiscard ? 'Se perderá el análisis; no se guardará ninguna prenda.' : detail}</span>
          </div>
          <div className="batch-dock-actions">
            {confirmingDiscard
              ? (
                  <>
                    <button className="button button-outline" type="button" onClick={() => setConfirmingDiscard(false)}>Seguir</button>
                    <button className="button button-danger" type="button" onClick={discard}>Descartar</button>
                  </>
                )
              : (
                  <>
                    <button className="button button-outline" type="button" onClick={() => setConfirmingDiscard(true)} disabled={saving}>Descartar</button>
                    <button className="button button-dark" type="button" onClick={() => void save()} disabled={saving || batch.running || !toSave.length}>
                      {batch.running ? 'Analizando…' : `Guardar ${plural(toSave.length, 'prenda', 'prendas')}`}
                    </button>
                  </>
                )}
          </div>
        </div>
      </div>
    </div>
  )
}
