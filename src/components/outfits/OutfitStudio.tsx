import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Add01Icon, Alert02Icon, FavouriteIcon, ShuffleIcon, SparklesIcon, SquareLock02Icon, SquareUnlock02Icon, ThumbsDownIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  createOutfitFeedback,
  createOutfitRecord,
  explainNoOutfits,
  fitLabel,
  generateOutfitCandidates,
  optionsForRole,
  outfitKey,
  scoreOutfit,
  seasonOfDate,
  withGarment,
  type OutfitCandidate,
  type OutfitContext,
  type OutfitGenerationOptions,
  type OutfitTemplate
} from '../../outfits/outfitGenerator'
import { database } from '../../db/database'
import type { Garment, GarmentRole, Outfit } from '../../types/domain'
import { localDay } from '../../stats/wardrobeStats'
import { weatherContext } from '../../weather/openMeteo'
import { useDayForecast } from '../../weather/useDayForecast'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import GarmentPicker from './GarmentPicker'
import OutfitCollage from './OutfitCollage'
import SaveOutfitDialog from './SaveOutfitDialog'
import WeatherBar from '../weather/WeatherBar'
import type { OutfitData } from './outfitData'

const occasions: OutfitTemplate[] = ['Diario', 'Arreglado', 'Formal', 'Deportivo', 'Frío y capas', 'Calor y pocas capas']
const SLOT_LABELS: Record<GarmentRole, string> = { Capa: 'Capa', Top: 'Parte de arriba', Bottom: 'Parte de abajo', 'Una pieza': 'Vestido o mono', Calzado: 'Calzado', Accesorio: 'Accesorio' }
const SLOT_ORDER: GarmentRole[] = ['Capa', 'Top', 'Una pieza', 'Bottom', 'Calzado', 'Accesorio']

interface OutfitStudioProps {
  garments: Garment[]
  data: OutfitData
  /** Garments to start from: one to build an outfit around, or a saved outfit to wear or change. */
  start?: { garmentIds: string[]; nonce: number }
  desiredStyle: string
  manualTemperature: string
  onChanged: () => Promise<void>
  onAvailabilityChange: (garment: Garment) => Promise<void>
  /** To «Mis outfits», from the notice after saving or wearing. */
  onShowSaved: () => void
  /** The saved outfit being changed («Cambiar» in «Mis outfits»): saving updates it instead of making another. */
  editing?: Outfit
  /** Leaves the outfit being changed for a new one. */
  onCreateNew: () => void
}

/**
 * Where outfits are made: it opens with today's proposal, each piece can be kept, changed or chosen by hand (the
 * garments that go best first), and whatever is on the board can be worn or saved.
 */
export default function OutfitStudio({ garments, data, start, desiredStyle, manualTemperature, onChanged, onAvailabilityChange, onShowSaved, editing, onCreateNew }: OutfitStudioProps) {
  const [occasion, setOccasion] = useState<OutfitTemplate>('Diario')
  const forecast = useDayForecast()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** After saving or wearing: what happened, with a way to «Mis outfits». */
  const [kept, setKept] = useState('')
  const [saving, setSaving] = useState(false)
  const [looks, setLooks] = useState<OutfitCandidate[]>([])
  const [board, setBoard] = useState<Garment[]>([])
  const [locked, setLocked] = useState<string[]>([])
  const [edited, setEdited] = useState(false)
  const [picking, setPicking] = useState<GarmentRole>()
  const [tried, setTried] = useState<Record<string, string[]>>({})
  const shownKeys = useRef(new Set<string>())
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const appliedStart = useRef<number | undefined>(undefined)

  const context = useMemo<OutfitContext>(() => {
    const manual = manualTemperature === '' ? undefined : Number(manualTemperature)
    return {
      occasion,
      desiredStyle: desiredStyle || undefined,
      ...(manual === undefined ? weatherContext(forecast.day) : { temperatureCelsius: manual }),
      season: seasonOfDate(new Date()),
      includeGarmentIds: locked
    }
  }, [occasion, desiredStyle, manualTemperature, forecast.day, locked])

  const options = useMemo<OutfitGenerationOptions>(() => ({
    preferences: data.preferences,
    feedback: data.feedback,
    wear: data.wear,
    seed: localDay()
  }), [data.preferences, data.feedback, data.wear])

  const current = useMemo(() => (board.length ? scoreOutfit(board, context, options) : undefined), [board, context, options])
  /** The combinations kept in «Mis outfits» (saved or made by hand). */
  const savedKeys = useMemo(() => new Set(data.outfits.filter((outfit) => outfit.favorite || outfit.kind === 'manual').map((outfit) => [...outfit.garmentIds].sort().join('|'))), [data.outfits])
  const boardKey = outfitKey(board)
  const sameOutfit = data.outfits.filter((outfit) => [...outfit.garmentIds].sort().join('|') === boardKey)
  const saved = sameOutfit.some((outfit) => outfit.favorite || outfit.kind === 'manual')
  const wornToday = sameOutfit.some((outfit) => outfit.wornAt && localDay(new Date(outfit.wornAt)) === localDay())
  const changedFromEditing = Boolean(editing) && [...editing!.garmentIds].sort().join('|') !== boardKey
  const hasBase = board.some((garment) => garment.role === 'Una pieza') || (board.some((garment) => garment.role === 'Top') && board.some((garment) => garment.role === 'Bottom'))

  // The notice after saving or wearing is about that outfit: another one on the board clears it.
  useEffect(() => setKept(''), [boardKey])

  const propose = useCallback((more: boolean, keep: string[] = locked) => {
    setError('')
    setNotice('')
    const request = { ...context, includeGarmentIds: keep }
    if (!more) {
      shownKeys.current.clear()
      // A new outfit is a new one: the combinations already in «Mis outfits» are not proposed again (they are
      // there to wear), unless nothing else can be made.
      for (const key of savedKeys) shownKeys.current.add(key)
    }
    let found = generateOutfitCandidates(garments, request, { ...options, skip: shownKeys.current })
    if (!found.length && !more && savedKeys.size) {
      shownKeys.current.clear()
      found = generateOutfitCandidates(garments, request, options)
    }
    if (!found.length && more) {
      shownKeys.current.clear()
      found = generateOutfitCandidates(garments, request, options)
      if (found.length) setNotice('Ya has visto todas las combinaciones: volvemos a empezar.')
    }
    for (const candidate of found) shownKeys.current.add(outfitKey(candidate.garments))
    setLooks(found)
    setEdited(false)
    setTried({})
    if (found[0]) setBoard(found[0].garments)
    else if (!more) setNotice(explainNoOutfits(garments, request))
  }, [context, garments, locked, options, savedKeys])

  // A new proposal whenever the plan changes; before painting, so the board never shows empty first.
  const plan = JSON.stringify([occasion, desiredStyle])
  const conditions = JSON.stringify([plan, context.temperatureCelsius, context.weatherConditions])
  const plannedFor = useRef('')
  const proposedFor = useRef('')
  useLayoutEffect(() => {
    if (start && appliedStart.current !== start.nonce) return
    if (proposedFor.current === conditions) return
    const onlyWeather = plannedFor.current === plan
    proposedFor.current = conditions
    plannedFor.current = plan
    // New weather does not undo what the user is doing on the board.
    if (!onlyWeather || !edited) propose(false)
  }, [conditions, edited, plan, propose, start])

  // Arriving with garments: a saved outfit goes on the board as it is; a single garment gets an outfit around it.
  useLayoutEffect(() => {
    if (!start || appliedStart.current === start.nonce) return
    appliedStart.current = start.nonce
    proposedFor.current = conditions
    plannedFor.current = plan
    const chosen = start.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment))
    setLocked(chosen.map((garment) => garment.id))
    if (chosen.length > 1) {
      setBoard(chosen)
      setLooks([])
      setEdited(true)
    } else {
      propose(false, chosen.map((garment) => garment.id))
    }
  }, [conditions, garments, plan, propose, start])

  function toggleLock(garment: Garment) {
    setLocked((list) => list.includes(garment.id) ? list.filter((id) => id !== garment.id) : [...list, garment.id])
  }

  /** The next garment for this place, the best not tried yet; it starts over when all have been seen. */
  function swap(garment: Garment) {
    const alternatives = optionsForRole(garment.role, board, garments, context, options)
    if (!alternatives.length) {
      setNotice(`No hay otra prenda disponible de este tipo. Añade más al armario.`)
      return
    }
    const seen = tried[garment.role] ?? []
    const next = alternatives.find((option) => !seen.includes(option.garment.id)) ?? alternatives[0]!
    setTried({ ...tried, [garment.role]: seen.length >= alternatives.length ? [garment.id] : [...seen, garment.id] })
    setNotice('')
    setBoard(withGarment(board, next.garment))
    setEdited(true)
  }

  function pick(garment: Garment) {
    const nextBoard = withGarment(board, garment)
    setBoard(nextBoard)
    setLocked((list) => [...list.filter((id) => nextBoard.some((item) => item.id === id)), garment.id])
    setEdited(true)
    setPicking(undefined)
    setNotice('')
  }

  function removeFromBoard(role: GarmentRole) {
    const leaving = board.find((garment) => garment.role === role)
    setBoard(board.filter((garment) => garment.role !== role))
    if (leaving) setLocked((list) => list.filter((id) => id !== leaving.id))
    setEdited(true)
    setPicking(undefined)
  }

  function startEmpty() {
    setBoard([])
    setLocked([])
    setLooks([])
    setEdited(true)
    setNotice('')
  }

  async function changeAvailability(garment: Garment, availability: Garment['availability']) {
    setError('')
    try {
      await onAvailabilityChange({ ...garment, availability })
      // The rest of the outfit stays: only this garment leaves the board and the ideas.
      if (availability !== 'available') {
        setLocked((list) => list.filter((id) => id !== garment.id))
        setBoard((list) => list.filter((item) => item.id !== garment.id))
        setLooks((list) => list.filter((look) => !look.garments.some((item) => item.id === garment.id)))
      }
    } catch {
      setError('No se pudo guardar la disponibilidad de la prenda.')
    }
  }

  /** The stored outfit with these garments, updated, so saving and wearing the same one never make two. */
  async function keep(change: Partial<Outfit>, eventType: 'saved' | 'worn') {
    if (!current) return
    setError('')
    setNotice('')
    setKept('')
    try {
      const at = new Date().toISOString()
      const existing = sameOutfit[0]
      const outfit: Outfit = {
        ...(existing ?? { ...createOutfitRecord(current, context, at), ...(edited ? { kind: 'manual' as const } : {}) }),
        score: current.score,
        ...change
      }
      await database.transaction('rw', database.outfits, database.outfitFeedback, async () => {
        await database.outfits.put(outfit)
        await database.outfitFeedback.add(createOutfitFeedback(eventType, outfit.garmentIds, outfit.id, at))
      })
      await onChanged()
      setKept(eventType === 'saved' ? `«${outfit.name || outfit.occasion}» está en Mis outfits.` : 'Apuntado: te lo pones hoy.')
    } catch {
      setError('No se pudo guardar el outfit en este dispositivo.')
    }
  }

  /** The outfit being changed, with the garments now on the board; its name, history and the rest stay. */
  async function saveChanges() {
    if (!editing || !current) return
    setError('')
    setNotice('')
    try {
      const at = new Date().toISOString()
      const outfit: Outfit = { ...editing, garmentIds: board.map((garment) => garment.id), score: current.score, favorite: true }
      await database.transaction('rw', database.outfits, database.outfitFeedback, async () => {
        await database.outfits.put(outfit)
        await database.outfitFeedback.add(createOutfitFeedback('saved', outfit.garmentIds, outfit.id, at))
      })
      await onChanged()
      setKept(`Cambios guardados en «${outfit.name || outfit.occasion}».`)
    } catch {
      setError('No se pudieron guardar los cambios del outfit.')
    }
  }

  async function save(name: string) {
    await keep({ favorite: true, ...(name ? { name } : {}) }, 'saved')
    setSaving(false)
  }

  async function discard() {
    if (!board.length) return
    setError('')
    try {
      await database.outfitFeedback.add(createOutfitFeedback('dislike', board.map((garment) => garment.id)))
      await onChanged()
      const remaining = looks.filter((look) => outfitKey(look.garments) !== boardKey)
      setLooks(remaining)
      if (remaining[0]) {
        setBoard(remaining[0].garments)
        setEdited(false)
      } else {
        // The feedback above reaches the options on the next render; what is discarded is skipped already.
        shownKeys.current.add(boardKey)
        propose(true)
      }
      setNotice('Descartado: no volveremos a proponer esta combinación.')
    } catch {
      setError('No se pudo guardar tu valoración.')
    }
  }

  /** Finishes a partial board around everything on it. */
  function complete() {
    const keepIds = board.map((garment) => garment.id)
    setLocked(keepIds)
    propose(false, keepIds)
  }

  function showLook(look: OutfitCandidate) {
    setBoard(look.garments)
    setEdited(false)
    setNotice('')
  }

  function finishSwipe(event: TouchEvent<HTMLElement>) {
    const begin = touchStart.current
    touchStart.current = null
    const touch = event.changedTouches[0]
    if (!begin || !touch) return
    const deltaX = touch.clientX - begin.x
    if (Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(touch.clientY - begin.y)) return
    const position = looks.findIndex((look) => outfitKey(look.garments) === boardKey)
    const next = looks[position + (deltaX < 0 ? 1 : -1)]
    if (next) showLook(next)
  }

  const slots = SLOT_ORDER.flatMap<{ role: GarmentRole; garment?: Garment }>((role) => {
    const garment = board.find((item) => item.role === role)
    if (garment) return [{ role, garment }]
    // An empty place is offered when it makes sense: a dress leaves no place for a top.
    const onePiece = board.some((item) => item.role === 'Una pieza')
    if (role === 'Una pieza') return []
    if (onePiece && (role === 'Top' || role === 'Bottom')) return []
    return garments.some((item) => item.role === role) ? [{ role }] : []
  }).sort((a, b) => Number(!a.garment) - Number(!b.garment)) // What is worn first, what could be added after it.
  const pickerCurrent = picking && board.find((garment) => garment.role === picking)

  return (
    <div className="studio">
      {editing && (
        <p className="studio-editing" role="status">
          <span>Cambiando <strong>«{editing.name || editing.occasion}»</strong>. «Guardar cambios» lo actualiza en Mis outfits.</span>
          <button type="button" className="studio-link" onClick={onCreateNew}>Crear uno nuevo</button>
        </p>
      )}
      <div className="studio-plan">
        <div className="choice-row" role="group" aria-label="¿Para qué es?">
          {occasions.map((item) => (
            <button key={item} type="button" className={`choice-chip ${occasion === item ? 'selected' : ''}`} aria-pressed={occasion === item} onClick={() => setOccasion(item)}>{item}</button>
          ))}
        </div>
        <WeatherBar forecast={forecast} showDays manualTemperature={manualTemperature} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="studio-layout">
        <section className="studio-board" aria-label="Outfit" data-collage={hasBase ? '' : undefined} onTouchStart={(event) => { touchStart.current = { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 } }} onTouchEnd={finishSwipe}>
          {hasBase ? (
            <>
              {/* The outfit as it will look: a collage; touching a garment changes it. */}
              <OutfitCollage
                garments={board}
                onSelect={(garment) => setPicking(garment.role)}
                label={(garment) => `Elegir ${SLOT_LABELS[garment.role].toLocaleLowerCase('es')}: ahora, ${garmentLabel(garment)}`}
                className="studio-collage"
              />
              <p className="studio-hint">Toca una prenda para elegir otra. Fija las que quieras mantener y pide otra combinación.</p>
              <ul className="studio-pieces" aria-label="Prendas del outfit">
                {slots.flatMap(({ role, garment }) => garment ? [{ role, garment }] : []).map(({ role, garment }) => {
                  const isLocked = locked.includes(garment.id)
                  return (
                    <li key={garment.id} className="studio-piece" data-locked={isLocked ? '' : undefined}>
                      <GarmentThumbnail garment={garment} alt="" />
                      <span className="studio-piece-text"><small>{SLOT_LABELS[role]}</small>{garmentLabel(garment)}</span>
                      <button type="button" className="icon-button" aria-pressed={isLocked} onClick={() => toggleLock(garment)} aria-label={`${isLocked ? 'Soltar' : 'Fijar'} ${garmentLabel(garment)}`} title={isLocked ? 'Fijada: no cambiará' : 'Fijar esta prenda'}>
                        <HugeiconsIcon icon={isLocked ? SquareLock02Icon : SquareUnlock02Icon} size={15} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => swap(garment)} aria-label={`Cambiar ${garmentLabel(garment)}`} title="Probar otra"><HugeiconsIcon icon={ShuffleIcon} size={15} /></button>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
          <ul className="studio-slots">
            {slots.map(({ role, garment }) => (
              <li key={role} className={garment ? 'studio-slot' : 'studio-slot studio-slot-empty'}>
                {garment ? (
                  <>
                    <button type="button" className="studio-slot-photo" onClick={() => setPicking(role)} aria-label={`Elegir ${SLOT_LABELS[role].toLocaleLowerCase('es')}: ahora, ${garmentLabel(garment)}`}>
                      <span className="garment-tile"><GarmentThumbnail garment={garment} alt={garmentLabel(garment)} /></span>
                    </button>
                    <span className="studio-slot-tools">
                      <button type="button" className="icon-button" aria-pressed={locked.includes(garment.id)} onClick={() => toggleLock(garment)} aria-label={`${locked.includes(garment.id) ? 'Soltar' : 'Fijar'} ${garmentLabel(garment)}`} title={locked.includes(garment.id) ? 'Fijada: no cambiará' : 'Fijar esta prenda'}>
                        <HugeiconsIcon icon={locked.includes(garment.id) ? SquareLock02Icon : SquareUnlock02Icon} size={15} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => swap(garment)} aria-label={`Cambiar ${garmentLabel(garment)}`} title="Probar otra"><HugeiconsIcon icon={ShuffleIcon} size={15} /></button>
                    </span>
                    <span className="studio-slot-name">{garmentLabel(garment)}</span>
                  </>
                ) : (
                  <button type="button" className="studio-slot-add" onClick={() => setPicking(role)}>
                    <HugeiconsIcon icon={Add01Icon} size={18} />
                    {role === 'Capa' || role === 'Accesorio' ? `Añadir ${SLOT_LABELS[role].toLocaleLowerCase('es')}` : `Elegir ${SLOT_LABELS[role].toLocaleLowerCase('es')}`}
                  </button>
                )}
              </li>
            ))}
          </ul>
          )}
          {/* Once the outfit can be worn, what could still be added is a small button, not a place as big as a garment. */}
          {hasBase && slots.some(({ garment }) => !garment) && (
            <div className="studio-add-row">
              {slots.filter(({ garment }) => !garment).map(({ role }) => (
                <button key={role} type="button" className="trip-add" onClick={() => setPicking(role)}>
                  <HugeiconsIcon icon={Add01Icon} size={13} />
                  {role === 'Capa' || role === 'Accesorio' ? `Añadir ${SLOT_LABELS[role].toLocaleLowerCase('es')}` : `Elegir ${SLOT_LABELS[role].toLocaleLowerCase('es')}`}
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="studio-side">
          {notice && <p className="outfit-notice" role="status">{notice}</p>}
          {kept && (
            <p className="outfit-notice outfit-kept" role="status">
              <HugeiconsIcon icon={Tick02Icon} size={14} />{kept}
              <button type="button" className="studio-link" onClick={onShowSaved}>Ver Mis outfits</button>
            </p>
          )}
          {current && (
            <div className="studio-verdict">
              <p className="studio-fit">{fitLabel(current.score)}</p>
              {current.explanation.length > 0 && (
                <ul className="studio-reasons">
                  {current.explanation.map((reason) => <li key={reason}><HugeiconsIcon icon={Tick02Icon} size={13} />{reason}</li>)}
                </ul>
              )}
              {current.warnings.length > 0 && (
                <ul className="studio-warnings">
                  {current.warnings.map((warning) => <li key={warning}><HugeiconsIcon icon={Alert02Icon} size={13} />{warning}</li>)}
                </ul>
              )}
            </div>
          )}

          {hasBase && (
            <div className="studio-actions">
              <button type="button" className="button button-dark" onClick={() => void keep({ wornAt: new Date().toISOString() }, 'worn')} disabled={wornToday}>{wornToday ? 'Puesto hoy' : 'Me lo pongo hoy'}</button>
              {editing
                ? <button type="button" className="button button-outline" onClick={() => void saveChanges()} disabled={!changedFromEditing}><HugeiconsIcon icon={changedFromEditing ? FavouriteIcon : Tick02Icon} size={15} />{changedFromEditing ? 'Guardar cambios' : 'Guardado'}</button>
                : <button type="button" className="button button-outline" onClick={() => setSaving(true)} disabled={saved}><HugeiconsIcon icon={saved ? Tick02Icon : FavouriteIcon} size={15} />{saved ? 'Guardado' : 'Guardar'}</button>}
              <button type="button" className="icon-button" onClick={() => void discard()} aria-label="No me convence" title="No me convence: no volverá a proponerse"><HugeiconsIcon icon={ThumbsDownIcon} size={16} /></button>
            </div>
          )}
          <div className="studio-more">
            {board.length > 0 && !hasBase
              ? <button type="button" className="button button-dark" onClick={complete}><HugeiconsIcon icon={SparklesIcon} size={15} />Completar el outfit</button>
              : <button type="button" className="button button-outline" onClick={() => propose(true)}><HugeiconsIcon icon={ShuffleIcon} size={15} />{locked.length ? 'Otra con lo fijado' : 'Otra combinación'}</button>}
            {board.length > 0 && <button type="button" className="studio-link" onClick={startEmpty}>Empezar de cero</button>}
          </div>

          {looks.length > 1 && (
            <section className="studio-ideas" aria-label="Otras ideas">
              <h2>Otras ideas</h2>
              <ul>
                {looks.map((look, index) => {
                  const key = outfitKey(look.garments)
                  return (
                    <li key={key}>
                      <button type="button" aria-pressed={key === boardKey} aria-label={`Idea ${index + 1}: ${look.garments.map(garmentLabel).join(', ')}`} onClick={() => showLook(look)}>
                        <OutfitCollage garments={look.garments} compact />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {saving && <SaveOutfitDialog garments={board} context={{ ...context, occasion }} onSave={save} onClose={() => setSaving(false)} />}
      {picking && (
        <GarmentPicker
          title={`Elige ${SLOT_LABELS[picking].toLocaleLowerCase('es')}`}
          options={optionsForRole(picking, board, garments, context, options)}
          unavailable={garments.filter((garment) => garment.role === picking && (garment.availability === 'laundry' || garment.availability === 'unavailable'))}
          current={pickerCurrent}
          canRemove={picking === 'Capa' || picking === 'Accesorio' || picking === 'Calzado'}
          onPick={pick}
          onRemove={() => removeFromBoard(picking)}
          onAvailability={(garment, availability) => void changeAvailability(garment, availability)}
          onClose={() => setPicking(undefined)}
        />
      )}
    </div>
  )
}
