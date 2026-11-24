import { Refresh01Icon, Sun03Icon, Tick02Icon, UserFullViewIcon, UserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState, type DragEvent } from 'react'
import { analyzeGarmentImage, type ClothingAnalysisSuggestion } from '../ai/clothingAnalyzer'
import { colorSwatch } from '../ai/colors'
import { cutOutGarments, cutoutColors, type LookOptions } from '../ai/cutout'
import { lookType } from '../ai/lookType'
import { suggestUsage } from '../ai/usageRules'
import { database } from '../db/database'
import { garmentRepository } from '../db/garmentRepository'
import { createThumbnail } from '../db/imageProcessing'
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB } from '../db/photoLimits'
import { isStorageFull, STORAGE_FULL_MESSAGE } from '../db/storageHealth'
import { garmentCategories, roleByCategory, type GarmentCategory, type GarmentWithPhotos, type Outfit } from '../types/domain'
import { analysisRecord } from './garmentForm/analysisRecord'
import { createSuggestedGarmentName } from './garmentForm/garmentName'
import PhotoEditor from './garmentForm/PhotoEditor'
import EditIcon from './EditIcon'
import GarmentPhoto from './GarmentPhoto'
import LookIllustration from './LookIllustration'
import TakePhoto from './TakePhoto'
import { useObjectUrl } from './useObjectUrl'

interface LookImportProps {
  /** After saving: how many garments were added. */
  onDone: (added: number) => void
  onCancel: () => void
}

interface FoundGarment {
  id: string
  image: Blob
  suggestion: ClothingAnalysisSuggestion
  colors: string[]
  include: boolean
  category: GarmentCategory
  subcategory: string
}

type Stage = 'finding' | 'cutting' | 'naming'

const STAGES: Array<{ id: Stage; title: string; detail: string }> = [
  { id: 'finding', title: 'Buscando tus prendas', detail: 'Dónde está cada una y cómo estás de pie.' },
  { id: 'cutting', title: 'Recortando cada prenda', detail: 'Sin fondo, sin piel ni pelo.' },
  { id: 'naming', title: 'Reconociendo cada una', detail: 'Tipo, color y estampado.' }
]

const ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * Adds the garments of a full-body photo at once: the segmentation head finds them, MediaPipe's pose and body parts
 * (body.ts) say where each one sits on the body, SlimSAM cuts each one out, the classifier names it, and the user
 * picks which to keep. Measured on 50 looks in README («Desde un look»). The look can be saved as an outfit worn
 * today. The whole photo (with the face) is only shown while choosing; it is never stored.
 */
export default function LookImport({ onDone, onCancel }: LookImportProps) {
  const [stage, setStage] = useState<Stage>()
  const [named, setNamed] = useState({ done: 0, total: 0 })
  const [photo, setPhoto] = useState<File>()
  const [error, setError] = useState('')
  const [found, setFound] = useState<FoundGarment[]>()
  const [saveLook, setSaveLook] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const photoUrl = useObjectUrl(photo)
  const busy = Boolean(stage) || saving

  async function choose(file: File | undefined) {
    if (!file || busy) return
    setError('')
    setFound(undefined)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      setError(`Elige una foto JPG, PNG o WebP de ${MAX_PHOTO_MB} MB o menos.`)
      return
    }
    setPhoto(file)
    try {
      setStage('finding')
      const [map] = (await analyzeGarmentImage(file)).segmentations
      if (!map) throw new Error('El modelo instalado no localiza prendas en la foto.')
      // Without the pose (no person found, or MediaPipe cannot load) the look is cut out as before.
      const body = await import('../ai/body').then(({ readBody }) => readBody(file)).catch((failure: unknown) => {
        console.warn('No se pudo leer la pose de la foto:', failure)
        return undefined
      })
      setStage('cutting')
      const look: LookOptions = body ? { body, zones: true, feet: true, merge: true, clean: 'skin' } : {}
      const cutouts = await cutOutGarments(file, map, 'outfit', look)
      setStage('naming')
      setNamed({ done: 0, total: cutouts.length })
      const garments: FoundGarment[] = []
      for (const cutout of cutouts) {
        const suggestion = await analyzeGarmentImage(cutout.image)
        const colors = (await cutoutColors(cutout.image)).map((entry) => entry.color)
        const type = lookType(cutout.region.classId, suggestion)
        garments.push({
          id: crypto.randomUUID(),
          image: cutout.image,
          suggestion,
          colors: colors.length ? colors : suggestion.colors,
          include: true,
          category: type.category,
          subcategory: type.subcategory
        })
        setNamed({ done: garments.length, total: cutouts.length })
      }
      setFound(garments)
    } catch (failure) {
      console.error('No se pudo analizar la foto de cuerpo entero:', failure)
      setError(failure instanceof Error ? failure.message : 'No se pudo analizar la foto.')
    } finally {
      setStage(undefined)
    }
  }

  /** The look photo turned or cropped (to leave out another person, say): it replaces the photo and is analysed again. */
  function applyEdit(edited: Blob) {
    setEditing(false)
    if (!photo) return
    void choose(new File([edited], photo.name, { type: edited.type || photo.type, lastModified: photo.lastModified }))
  }

  function restart() {
    setFound(undefined)
    setPhoto(undefined)
    setError('')
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void choose(event.dataTransfer.files?.[0])
  }

  function change(id: string, update: Partial<FoundGarment>) {
    setFound((current) => current?.map((entry) => entry.id === id ? { ...entry, ...update } : entry))
  }

  async function save() {
    const chosen = found?.filter((entry) => entry.include) ?? []
    if (!chosen.length) {
      setError('Marca al menos una prenda para añadir.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const ids: string[] = []
      for (const entry of chosen) {
        const { suggestion } = entry
        const usage = suggestUsage({ category: entry.category, subcategory: entry.subcategory, sleeve: suggestion.sleeve?.value })
        const { thumbnail, width, height } = await createThumbnail(entry.image, { transparent: true })
        const values = {
          category: entry.category,
          subcategory: entry.subcategory,
          colors: entry.colors,
          pattern: suggestion.pattern?.label ?? '',
          brand: suggestion.brand?.brand ?? '',
          size: '',
          composition: ''
        }
        const garment: GarmentWithPhotos = {
          id: crypto.randomUUID(),
          name: createSuggestedGarmentName(entry.subcategory, entry.colors, values.brand),
          category: entry.category,
          subcategory: entry.subcategory,
          colors: entry.colors,
          ...(suggestion.pattern ? { pattern: suggestion.pattern.label } : {}),
          ...(suggestion.brand ? { brand: suggestion.brand.brand } : {}),
          seasons: usage.seasons,
          styles: usage.styles,
          dressLevels: usage.dressLevels,
          role: roleByCategory[entry.category],
          image: entry.image,
          cutout: entry.image,
          thumbnail,
          width,
          height,
          confirmedAttributes: [],
          suggestedAttributes: ['category', 'subcategory', 'colors', 'seasons', 'dressLevels', 'styles', ...(suggestion.pattern ? ['pattern'] : [])],
          analysis: analysisRecord({ suggestion, labelReading: undefined, labelSize: undefined, imageChanged: true, garment: undefined, values }),
          createdAt: now,
          updatedAt: now
        }
        await garmentRepository.create(garment)
        ids.push(garment.id)
      }
      if (saveLook) {
        const outfit: Outfit = {
          id: crypto.randomUUID(),
          garmentIds: ids,
          occasion: 'Look',
          kind: 'manual',
          name: `Look del ${new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date())}`,
          score: 100,
          createdAt: now,
          favorite: true,
          wornAt: now
        }
        await database.outfits.put(outfit)
      }
      onDone(ids.length)
    } catch (failure) {
      console.error('No se pudieron guardar las prendas del look:', failure)
      setError(isStorageFull(failure) ? STORAGE_FULL_MESSAGE : 'No se pudieron guardar las prendas. Comprueba el espacio disponible e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const chosen = found?.filter((entry) => entry.include) ?? []
  const editButton = (
    <button type="button" className="edit-photo look-edit" onClick={() => setEditing(true)} disabled={busy} aria-label="Editar la foto del look: recortar o girar" title="Recortar o girar la foto. Molt la analizará de nuevo.">
      <EditIcon />
    </button>
  )
  const editor = editing && photo && <PhotoEditor photo={photo} onCancel={() => setEditing(false)} onApply={applyEdit} />
  const pickPhoto = (label: string, className: string) => (
    <label className={className}>
      {label}
      <input
        type="file"
        accept={ACCEPT}
        onChange={(event) => {
          void choose(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
        aria-label="Seleccionar foto de cuerpo entero"
        disabled={busy}
      />
    </label>
  )

  // While the photo is analysed: the photo with a scan over it, and where the analysis is.
  if (stage) {
    const current = STAGES.findIndex((entry) => entry.id === stage)
    return (
      <div className="look-import">
        <section className="look-analysis" aria-labelledby="look-analysis-title">
          <figure className="look-scan">
            {photoUrl && <img src={photoUrl} alt="La foto que se está analizando" />}
            <span className="look-scan-line" aria-hidden="true" />
          </figure>
          <div className="look-analysis-text">
            <h2 id="look-analysis-title" className="look-title">Analizando tu look…</h2>
            <ol className="look-progress" role="status" aria-live="polite">
              {STAGES.map((entry, index) => {
                const state = index < current ? 'done' : index === current ? 'current' : 'pending'
                const count = entry.id === 'naming' && state === 'current' && named.total > 0 ? ` (${Math.min(named.done + 1, named.total)} de ${named.total})` : ''
                return (
                  <li key={entry.id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                    <span className="look-progress-mark" aria-hidden="true">{state === 'done' && <HugeiconsIcon icon={Tick02Icon} size={14} />}</span>
                    <span>
                      <strong>{entry.title}{count}</strong>
                      <small>{entry.detail}</small>
                    </span>
                  </li>
                )
              })}
            </ol>
            <p className="look-note">Todo ocurre en este dispositivo. La primera vez descarga los modelos; después va más rápido.</p>
          </div>
        </section>
      </div>
    )
  }

  // The garments found, to review before saving.
  if (found && found.length > 0) {
    return (
      <div className="look-import">
        <section className="look-results" aria-labelledby="look-results-title">
          <aside className="look-source">
            <div className="look-source-photo">
              {photoUrl && <img src={photoUrl} alt="Tu foto" />}
              {editButton}
            </div>
            <small>Tu foto no se guarda: solo los recortes.</small>
            {pickPhoto('Usar otra foto', 'batch-add-more')}
          </aside>
          <div className="look-results-main">
            <h2 id="look-results-title" className="look-title">{found.length === 1 ? 'Hemos encontrado 1 prenda' : `Hemos encontrado ${found.length} prendas`}</h2>
            <p className="look-hint">Quita las que no quieras y corrige el tipo si hace falta.</p>
            <ul className="batch-grid look-grid">
              {found.map((entry, index) => {
                const name = entry.subcategory || entry.category
                return (
                  <li key={entry.id} className="batch-card" data-off={entry.include ? undefined : ''} style={{ animationDelay: `${index * 60}ms` }}>
                    <div className="batch-card-image" data-cutout="">
                      <GarmentPhoto image={entry.image} alt={name} />
                      <label className="batch-check" title={entry.include ? 'Se añadirá' : 'No se añadirá'}>
                        <input type="checkbox" checked={entry.include} onChange={(event) => change(entry.id, { include: event.target.checked })} aria-label={`Añadir ${name}`} />
                        <HugeiconsIcon icon={Tick02Icon} size={16} aria-hidden="true" />
                      </label>
                      {!entry.include && <span className="batch-card-tag">No se añadirá</span>}
                    </div>
                    <div className="batch-card-body">
                      <input className="batch-title" aria-label="Subcategoría" placeholder="Tipo de prenda" value={entry.subcategory} onChange={(event) => change(entry.id, { subcategory: event.target.value })} maxLength={50} />
                      <select className="batch-category" aria-label="Categoría" value={entry.category} onChange={(event) => change(entry.id, { category: event.target.value as GarmentCategory })}>
                        {garmentCategories.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <span className="look-colors">
                        {entry.colors.length
                          ? entry.colors.map((color) => <span key={color}><span className="color-dot" style={{ background: colorSwatch(color) }} />{color}</span>)
                          : <span>Sin color detectado</span>}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <label className="look-outfit" data-on={saveLook ? '' : undefined}>
              <input type="checkbox" checked={saveLook} onChange={(event) => setSaveLook(event.target.checked)} />
              <span className="look-outfit-stack" aria-hidden="true">
                {chosen.slice(0, 3).map((entry) => <GarmentPhoto key={entry.id} image={entry.image} alt="" />)}
              </span>
              <span className="look-outfit-text">
                <strong>Guardar también el look como outfit</strong>
                <small>Aparecerá en tu historial como usado hoy.</small>
              </span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </section>
        <div className="batch-dock look-dock">
          <div className="batch-dock-row">
            <div className="batch-dock-text">
              <strong>{chosen.length ? `${plural(chosen.length, 'prenda', 'prendas')} de ${found.length}` : 'Ninguna prenda elegida'}</strong>
              <span>{chosen.length ? 'Se guardan con su recorte, como si las añadieras una a una.' : 'Marca al menos una para añadirla.'}</span>
            </div>
            <div className="batch-dock-actions">
              <button className="button button-outline" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
              <button className="button button-dark" type="button" onClick={() => void save()} disabled={saving || !chosen.length}>
                {saving ? 'Guardando…' : `Añadir ${plural(chosen.length, 'prenda', 'prendas')}`}
              </button>
            </div>
          </div>
        </div>
        {editor}
      </div>
    )
  }

  // Nothing found in the photo: say why it may be, and try another.
  if (found) {
    return (
      <div className="look-import">
        <section className="look-empty" aria-labelledby="look-empty-title">
          <div className="look-empty-photo">
            {photoUrl && <img src={photoUrl} alt="La foto analizada" />}
            {editButton}
          </div>
          <div>
            <h2 id="look-empty-title" className="look-title">No hemos encontrado prendas</h2>
            <p>Suele pasar si la foto no es de cuerpo entero, hay poca luz o salen varias personas. Si sale alguien más, recórtala con el lápiz.</p>
            <div className="photo-drop-actions">
              <TakePhoto label="Hacer otra foto" ariaLabel="Hacer otra foto de cuerpo entero" disabled={busy} onTake={(files) => void choose(files?.[0])} />
              {pickPhoto('Elegir otra foto', 'button button-dark look-choose')}
            </div>
            <button className="look-link" type="button" onClick={restart}><HugeiconsIcon icon={Refresh01Icon} size={14} aria-hidden="true" />Volver al principio</button>
          </div>
        </section>
        <footer className="form-footer">
          <button className="button button-outline" type="button" onClick={onCancel}>Cancelar</button>
        </footer>
        {editor}
      </div>
    )
  }

  // Before a photo: what it does, how to take the photo, and that the photo stays here.
  return (
    <div className="look-import">
      <section
        className="look-hero"
        data-dragging={dragging ? '' : undefined}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        aria-labelledby="look-hero-title"
      >
        <div className="look-hero-art" aria-hidden="true">
          <LookIllustration />
        </div>
        <div className="look-hero-text">
          <span className="look-badge">Prototipo</span>
          <h2 id="look-hero-title" className="look-hero-title">Una foto, todo tu look</h2>
          <p>Hazte una foto de cuerpo entero: Molt encuentra cada prenda, la recorta y te la deja lista para tu armario.</p>
          <div className="photo-drop-actions">
            <TakePhoto label="Hacer foto" ariaLabel="Hacer una foto de cuerpo entero" disabled={busy} onTake={(files) => void choose(files?.[0])} />
            {pickPhoto('Elegir foto', 'button button-dark look-choose')}
          </div>
          <small className="look-drop-hint">O arrastra una foto aquí.</small>
          <ul className="look-tips">
            <li><HugeiconsIcon icon={UserFullViewIcon} size={18} aria-hidden="true" />De pies a cabeza, con los zapatos</li>
            <li><HugeiconsIcon icon={Sun03Icon} size={18} aria-hidden="true" />De frente y con buena luz</li>
            <li><HugeiconsIcon icon={UserIcon} size={18} aria-hidden="true" />Solo tú en la foto</li>
          </ul>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ol className="batch-steps">
        <li><strong>Hazte la foto</strong><p>En el espejo o que te la hagan. Vale una que ya tengas.</p></li>
        <li><strong>Molt busca cada prenda</strong><p>Lee tu postura, recorta cada prenda y reconoce su tipo y color.</p></li>
        <li><strong>Revisa y guarda</strong><p>Quita lo que sobre y corrige el tipo. Nada se guarda hasta que tú lo decidas.</p></li>
      </ol>
      <p className="batch-privacy"><span className="privacy-indicator" />La foto completa no sale de tu dispositivo ni se guarda: solo el recorte de cada prenda.</p>
      <footer className="form-footer">
        <button className="button button-outline" type="button" onClick={onCancel}>Cancelar</button>
      </footer>
    </div>
  )
}
