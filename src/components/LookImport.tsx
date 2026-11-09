import { Image02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { analyzeGarmentImage, type ClothingAnalysisSuggestion } from '../ai/clothingAnalyzer'
import { cutOutGarments, cutoutColors } from '../ai/cutout'
import { suggestUsage } from '../ai/usageRules'
import { database } from '../db/database'
import { garmentRepository } from '../db/garmentRepository'
import { createThumbnail } from '../db/imageProcessing'
import { MAX_PHOTO_BYTES, MAX_PHOTO_MB } from '../db/photoLimits'
import { isStorageFull, STORAGE_FULL_MESSAGE } from '../db/storageHealth'
import { garmentCategories, roleByCategory, type Garment, type GarmentCategory, type Outfit } from '../types/domain'
import { analysisRecord } from './garmentForm/analysisRecord'
import { createSuggestedGarmentName } from './garmentForm/garmentName'
import GarmentPhoto from './GarmentPhoto'
import { LatticeLoader } from './reactBits'
import TakePhoto from './TakePhoto'

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

/**
 * Adds the garments of a full-body photo at once: the segmentation head finds them, SlimSAM cuts each one out,
 * the classifier names it, and the user picks which to keep. The look can be saved as an outfit worn today.
 * The whole photo (with the face) is not stored; only the garment cut-outs.
 */
export default function LookImport({ onDone, onCancel }: LookImportProps) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [found, setFound] = useState<FoundGarment[]>()
  const [saveLook, setSaveLook] = useState(true)
  const [saving, setSaving] = useState(false)

  async function choose(file: File | undefined) {
    setError('')
    setFound(undefined)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      setError(`Elige una foto JPG, PNG o WebP de ${MAX_PHOTO_MB} MB o menos.`)
      return
    }
    try {
      setStatus('Buscando las prendas')
      const [map] = (await analyzeGarmentImage(file)).segmentations
      if (!map) throw new Error('El modelo instalado no localiza prendas en la foto.')
      setStatus('Recortando cada prenda')
      const cutouts = await cutOutGarments(file, map, 'outfit')
      setStatus('Reconociendo cada prenda')
      const garments: FoundGarment[] = []
      for (const cutout of cutouts) {
        const suggestion = await analyzeGarmentImage(cutout.image)
        const colors = (await cutoutColors(cutout.image)).map((entry) => entry.color)
        garments.push({
          id: crypto.randomUUID(),
          image: cutout.image,
          suggestion,
          colors: colors.length ? colors : suggestion.colors,
          include: true,
          category: suggestion.category,
          subcategory: suggestion.subcategory
        })
      }
      setFound(garments)
      if (!garments.length) setError('No se ha encontrado ninguna prenda. Prueba con una foto de cuerpo entero, de frente y con buena luz.')
    } catch (failure) {
      console.error('No se pudo analizar la foto de cuerpo entero:', failure)
      setError(failure instanceof Error ? failure.message : 'No se pudo analizar la foto.')
    } finally {
      setStatus('')
    }
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
        const { thumbnail, width, height } = await createThumbnail(entry.image)
        const values = {
          category: entry.category,
          subcategory: entry.subcategory,
          colors: entry.colors,
          pattern: suggestion.pattern?.label ?? '',
          brand: suggestion.brand?.brand ?? '',
          size: '',
          composition: ''
        }
        const garment: Garment = {
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

  const chosenCount = found?.filter((entry) => entry.include).length ?? 0

  return (
    <div className="look-import">
      <div className="photo-drop">
        <span className="photo-drop-icon" aria-hidden="true"><HugeiconsIcon icon={Image02Icon} size={26} /></span>
        <strong>{found ? 'Elegir otra foto' : 'Elige una foto de cuerpo entero'}</strong>
        <small>De frente, con buena luz. La foto completa no se guarda: solo el recorte de cada prenda.</small>
        <div className="photo-drop-actions">
          <TakePhoto label="Hacer foto" ariaLabel="Hacer una foto de cuerpo entero" disabled={Boolean(status) || saving} onTake={(files) => void choose(files?.[0])} />
          <label className="button button-dark photo-drop-choose">
            Elegir foto
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void choose(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
              aria-label="Seleccionar foto de cuerpo entero"
              disabled={Boolean(status) || saving}
            />
          </label>
        </div>
      </div>

      {status && <div className="look-status"><LatticeLoader label={status} fontSize={12} /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {found && found.length > 0 && (
        <>
          <p className="look-intro">{found.length === 1 ? 'Se ha encontrado 1 prenda' : `Se han encontrado ${found.length} prendas`}. Revisa el tipo y marca las que quieras añadir.</p>
          <ul className="look-garments">
            {found.map((entry) => (
              <li key={entry.id} className={entry.include ? '' : 'excluded'}>
                <GarmentPhoto image={entry.image} alt={entry.subcategory || entry.category} />
                <label className="look-include">
                  <input type="checkbox" checked={entry.include} onChange={(event) => change(entry.id, { include: event.target.checked })} />
                  Añadir
                </label>
                <select aria-label="Categoría" value={entry.category} onChange={(event) => change(entry.id, { category: event.target.value as GarmentCategory })}>
                  {garmentCategories.map((value) => <option key={value}>{value}</option>)}
                </select>
                <input aria-label="Subcategoría" value={entry.subcategory} onChange={(event) => change(entry.id, { subcategory: event.target.value })} maxLength={50} />
                <small>{entry.colors.join(', ') || 'Sin color detectado'}</small>
              </li>
            ))}
          </ul>
          <label className="look-save-outfit">
            <input type="checkbox" checked={saveLook} onChange={(event) => setSaveLook(event.target.checked)} />
            Guardar también el look como outfit (usado hoy)
          </label>
        </>
      )}

      <footer className="form-footer">
        <button className="button button-outline" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
        {found && found.length > 0 && (
          <button className="button button-dark" type="button" onClick={() => void save()} disabled={saving || Boolean(status)}>
            {saving ? 'Guardando…' : `Añadir ${chosenCount} ${chosenCount === 1 ? 'prenda' : 'prendas'}`}
          </button>
        )}
      </footer>
    </div>
  )
}
