import { useCallback, useEffect, useState } from 'react'
import { Add01Icon, ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { colorSwatch } from '../ai/colors'
import { database } from '../db/database'
import { taxonomy } from '../ml/taxonomy'
import { OUTFIT_SCORE_WEIGHTS } from '../outfits/outfitGenerator'
import { dressLevels, type DressLevel, type Garment, type Outfit, type UserPreferences } from '../types/domain'
import { ChipsField, FormFold } from './garmentForm/fields'
import { emptyOutfitData, emptyPreferences, loadOutfitData, type OutfitData } from './outfits/outfitData'
import OutfitStudio from './outfits/OutfitStudio'
import SavedOutfits from './outfits/SavedOutfits'

interface OutfitGeneratorProps {
  garments: Garment[]
  onAvailabilityChange: (garment: Garment) => Promise<void>
  /** To the screen for adding garments, offered while the wardrobe is empty. */
  onAddGarments?: () => void
  /** A garment to build an outfit around, coming from its detail in the wardrobe. */
  startGarmentId?: { id: string; nonce: number }
}

type OutfitView = 'studio' | 'saved'

const colorOptions = taxonomy.attributes.colors.values.map((value) => value.label)

/**
 * Outfits: «Mis outfits» first (the ones saved, made by hand or worn), and «Crear outfit» to make a new one in the
 * studio, which opens with Molt's proposal for today. Coming from a garment, the studio opens around it.
 */
export default function OutfitGenerator({ garments, onAvailabilityChange, onAddGarments, startGarmentId }: OutfitGeneratorProps) {
  const [view, setView] = useState<OutfitView>(startGarmentId ? 'studio' : 'saved')
  const [data, setData] = useState<OutfitData>(emptyOutfitData)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [start, setStart] = useState<{ garmentIds: string[]; nonce: number } | undefined>(startGarmentId && { garmentIds: [startGarmentId.id], nonce: startGarmentId.nonce })
  const [desiredStyle, setDesiredStyle] = useState('')
  const [manualTemperature, setManualTemperature] = useState('')
  const wardrobeStyles = [...new Set(garments.flatMap((garment) => garment.styles).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))

  const reload = useCallback(async () => {
    setData(await loadOutfitData())
  }, [])

  useEffect(() => {
    let active = true
    loadOutfitData()
      .then((loaded) => { if (active) setData(loaded) })
      .catch(() => { if (active) setError('No se pudo cargar tu historial de outfits.') })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  function openOutfit(outfit: Outfit) {
    setStart({ garmentIds: outfit.garmentIds, nonce: Date.now() })
    show('studio')
  }

  // A garment chosen in the wardrobe while this screen is open: the studio, around it.
  useEffect(() => {
    if (!startGarmentId) return
    setStart({ garmentIds: [startGarmentId.id], nonce: startGarmentId.nonce })
    setView('studio')
  }, [startGarmentId?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePreferences(next: UserPreferences) {
    setData((current) => ({ ...current, preferences: next }))
    try {
      await database.preferences.put({ ...next, updatedAt: new Date().toISOString() })
    } catch {
      setError('No se pudieron guardar las preferencias.')
    }
  }

  const { preferences } = data
  const adjustments = [desiredStyle, manualTemperature && `${manualTemperature} °C`, ...preferences.preferredColors, ...preferences.preferredStyles, preferences.preferredDressLevel].filter(Boolean).join(' · ')
  function show(next: OutfitView) {
    setView(next)
    document.getElementById('outfits-title')?.scrollIntoView?.({ block: 'start' })
  }

  return (
    <section className="feature-screen outfit-generator" aria-labelledby="outfits-title">
      <div className="outfit-heading">
        <h1 id="outfits-title">{view === 'studio' ? 'Crear outfit' : 'Mis outfits'}<span>.</span></h1>
        {garments.length > 0 && view === 'saved' && (
          <button type="button" className="button button-dark outfit-create" onClick={() => show('studio')}><HugeiconsIcon icon={Add01Icon} size={15} />Crear outfit</button>
        )}
      </div>
      {garments.length > 0 && view === 'studio' && (
        <button type="button" className="trip-back" onClick={() => show('saved')}><HugeiconsIcon icon={ArrowLeft01Icon} size={16} />Mis outfits</button>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {garments.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark" aria-hidden="true">✳</div>
          <h2>Primero, tu armario.</h2>
          <p>Los outfits se crean con tus propias prendas. Añade al menos una parte de arriba y una de abajo.</p>
          {onAddGarments && <button className="button button-dark" type="button" onClick={onAddGarments}>Añadir prendas</button>}
        </section>
      ) : !ready ? null : (
        <>
          {view === 'saved' && <SavedOutfits garments={garments} data={data} onChanged={reload} onOpen={openOutfit} onCreate={() => show('studio')} />}
          <div hidden={view !== 'studio'}>
            <OutfitStudio
              garments={garments}
              data={data}
              start={start}
              desiredStyle={desiredStyle}
              manualTemperature={manualTemperature}
              onChanged={reload}
              onAvailabilityChange={onAvailabilityChange}
              onShowSaved={() => show('saved')}
            />
            <div className="outfit-folds">
              <FormFold title="Ajustes" summary={adjustments || 'Tus colores y estilos, y la temperatura a mano'}>
                <label className="form-field">Estética para hoy
                  <select value={desiredStyle} onChange={(event) => setDesiredStyle(event.target.value)}>
                    <option value="">Sin preferencia</option>
                    {wardrobeStyles.map((style) => <option key={style}>{style}</option>)}
                  </select>
                </label>
                <label className="form-field">Temperatura a mano (°C)
                  <input type="number" value={manualTemperature} onChange={(event) => setManualTemperature(event.target.value)} placeholder="La de la previsión" />
                </label>
                <ChipsField label="Colores preferidos" values={preferences.preferredColors} onChange={(preferredColors) => void savePreferences({ ...preferences, preferredColors })} options={colorOptions} placeholder="p. ej. Azul marino" swatch={colorSwatch} />
                <ChipsField label="Estéticas preferidas" values={preferences.preferredStyles} onChange={(preferredStyles) => void savePreferences({ ...preferences, preferredStyles })} options={wardrobeStyles} placeholder="p. ej. Minimalista" />
                <label className="form-field">Estilo preferido
                  <select value={preferences.preferredDressLevel ?? ''} onChange={(event) => void savePreferences({ ...preferences, preferredDressLevel: (event.target.value || undefined) as DressLevel | undefined })}>
                    <option value="">Sin preferencia</option>
                    {dressLevels.map((level) => <option key={level}>{level}</option>)}
                  </select>
                </label>
                <div className="preference-actions">
                  <button className="button button-outline" type="button" onClick={() => void savePreferences(emptyPreferences)}>Restablecer preferencias</button>
                </div>
              </FormFold>
              <FormFold title="Cómo se elige" summary="Reglas orientativas, en tu dispositivo">
                <p className="score-note form-field full">
                  Cada outfit se valora por la ocasión ({Math.round(OUTFIT_SCORE_WEIGHTS.occasion * 100)} %: estilo de cada prenda y si encajan entre sí), cómo se ve ({Math.round(OUTFIT_SCORE_WEIGHTS.visualStyle * 100)} %: armonía de colores, estampados y estética), el abrigo ({Math.round(OUTFIT_SCORE_WEIGHTS.thermal * 100)} %: lo que abriga cada tipo de prenda frente al tiempo o, sin previsión, la temporada), tus gustos ({Math.round(OUTFIT_SCORE_WEIGHTS.preference * 100)} %: lo que guardas, llevas y descartas, sobre todo las prendas que han ido juntas, y con menos peso cuanto más antiguo) y la rotación ({Math.round(OUTFIT_SCORE_WEIGHTS.rotation * 100)} %: descansa lo que llevaste hace poco y recupera lo olvidado). Son reglas iniciales, no una valoración estilística validada; los datos que faltan no descartan una prenda. Todo se calcula en este dispositivo.
                </p>
              </FormFold>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
