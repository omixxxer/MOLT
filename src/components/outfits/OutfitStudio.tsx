import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Add01Icon, Alert02Icon, FavouriteIcon, ShuffleIcon, SparklesIcon, SquareLock02Icon, SquareUnlock02Icon, ThumbsDownIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  createOutfitFeedback,
  createOutfitRecord,
  explainNoOutfits,
  fitLabel,
  generateOutfitCandidates,
  goesOver,
  goesUnder,
  isAccessory,
  optionsForRole,
  optionsUnder,
  outfitKey,
  scoreOutfit,
  seasonOfDate,
  topLayers,
  withGarment,
  withUnder,
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
import { PulseHeart } from './reactBitsOutfits'
import OutfitCollage from './OutfitCollage'
import SaveOutfitDialog from './SaveOutfitDialog'
import WeatherBar from '../weather/WeatherBar'
import type { OutfitData } from './outfitData'

const occasions: OutfitTemplate[] = ['Diario', 'Arreglado', 'Formal', 'Deportivo', 'Frío y capas', 'Calor y pocas capas']
// Jewellery is an accessory here: one place where any number of them go (several earrings, a watch, a bag…).
const SLOT_LABELS: Record<GarmentRole, string> = { Capa: 'Capa', Top: 'Parte de arriba', Bottom: 'Parte de abajo', 'Una pieza': 'Vestido o mono', Calzado: 'Calzado', Accesorio: 'Accesorio', Joya: 'Accesorio' }
const SLOT_ORDER: GarmentRole[] = ['Capa', 'Top', 'Una pieza', 'Bottom', 'Calzado']

/**
 * What the picker is choosing: a role's place, or (accessories, and the T-shirt under the top) one to add or the one
 * touched, to replace.
 */
interface Picking {
  role: GarmentRole
  replacing?: Garment
  /** The T-shirt under the top. */
  under?: boolean
}

/** A place on the board: a role, or the T-shirt under the top. */
const placeLabel = (role: GarmentRole, under?: boolean) => under ? 'Debajo' : SLOT_LABELS[role]

/** «Añadir» for what is optional (a layer, accessories, a T-shirt underneath), «Elegir» for what the outfit needs. */
const slotAction = (role: GarmentRole, under?: boolean) => under
  ? 'Añadir camiseta debajo'
  : `${role === 'Capa' || isAccessory({ role }) ? 'Añadir' : 'Elegir'} ${SLOT_LABELS[role].toLocaleLowerCase('es')}`

/**
 * What the studio opens with: an idea chosen in the wizard, a saved outfit to change (`lock`: every piece pinned), a
 * single garment to build around, or nothing (`empty`, «Desde cero»).
 */
export interface StudioStart {
  garmentIds: string[]
  nonce: number
  /** Pin every garment, as for a saved outfit. */
  lock?: boolean
  /** The garments to pin (the one the outfit was started from). */
  lockIds?: string[]
  /** An empty board, to choose piece by piece. */
  empty?: boolean
  /** The idea's name, as shown in the wizard: the one proposed on saving while the outfit stays as it came. */
  name?: string
}

interface OutfitStudioProps {
  garments: Garment[]
  data: OutfitData
  start?: StudioStart
  /** The plan chosen before arriving here. */
  initialOccasion?: OutfitTemplate
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
export default function OutfitStudio({ garments, data, start, initialOccasion, desiredStyle, manualTemperature, onChanged, onAvailabilityChange, onShowSaved, editing, onCreateNew }: OutfitStudioProps) {
  const [occasion, setOccasion] = useState<OutfitTemplate>(initialOccasion ?? 'Diario')
  /** The board came chosen (an idea, a saved outfit): the weather arriving later does not replace it. */
  const chosenBoard = useRef(false)
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
  const [picking, setPicking] = useState<Picking>()
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
    // New weather does not undo what the user is doing on the board, nor an outfit chosen to get here.
    if (!onlyWeather || (!edited && !chosenBoard.current)) {
      chosenBoard.current = false
      propose(false)
    }
  }, [conditions, edited, plan, propose, start])

  // Arriving with garments: an idea or a saved outfit goes on the board as it is; a single garment gets an outfit
  // around it; «Desde cero», an empty board.
  useLayoutEffect(() => {
    if (!start || appliedStart.current === start.nonce) return
    appliedStart.current = start.nonce
    proposedFor.current = conditions
    plannedFor.current = plan
    if (start.empty) {
      startEmpty()
      return
    }
    const chosen = start.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment))
    if (chosen.length > 1) {
      setLocked(start.lock ? chosen.map((garment) => garment.id) : (start.lockIds ?? []))
      setBoard(chosen)
      setLooks([])
      setEdited(Boolean(start.lock))
      chosenBoard.current = true
    } else {
      setLocked(chosen.map((garment) => garment.id))
      propose(false, chosen.map((garment) => garment.id))
    }
  }, [conditions, garments, plan, propose, start]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleLock(garment: Garment) {
    setLocked((list) => list.includes(garment.id) ? list.filter((id) => id !== garment.id) : [...list, garment.id])
  }

  /** Opens the picker for this garment's place (for an accessory or the T-shirt underneath, that very one). */
  function choose(garment: Garment) {
    const under = garment.id === topLayers(board).under?.id
    setPicking({ role: garment.role, ...(isAccessory(garment) || under ? { replacing: garment } : {}), ...(under ? { under } : {}) })
  }

  /** The next garment for this place, the best not tried yet; it starts over when all have been seen. */
  function swap(garment: Garment) {
    const under = garment.id === topLayers(board).under?.id
    const replacing = isAccessory(garment) || under ? garment : undefined
    const alternatives = optionsForRole(garment.role, board, garments, context, options, replacing)
    if (!alternatives.length) {
      setNotice(`No hay otra prenda disponible de este tipo. Añade más al armario.`)
      return
    }
    const place = placeLabel(garment.role, under)
    const seen = tried[place] ?? []
    const next = alternatives.find((option) => !seen.includes(option.garment.id)) ?? alternatives[0]!
    setTried({ ...tried, [place]: seen.length >= alternatives.length ? [garment.id] : [...seen, garment.id] })
    setNotice('')
    setBoard(withGarment(board, next.garment, replacing))
    setEdited(true)
  }

  function pick(garment: Garment) {
    const nextBoard = picking?.under && !picking.replacing ? withUnder(board, garment) : withGarment(board, garment, picking?.replacing)
    setBoard(nextBoard)
    setLocked((list) => [...list.filter((id) => nextBoard.some((item) => item.id === id)), garment.id])
    setEdited(true)
    setPicking(undefined)
    setNotice('')
  }

  function removeFromBoard(leaving: Garment) {
    setBoard(board.filter((garment) => garment.id !== leaving.id))
    setLocked((list) => list.filter((id) => id !== leaving.id))
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

  const layers = topLayers(board)
  type Slot = { role: GarmentRole; garment?: Garment; under?: boolean }
  const slots: Slot[] = [
    ...SLOT_ORDER.flatMap<Slot>((role) => {
      const garment = role === 'Top' ? layers.outer : board.find((item) => item.role === role)
      // Under a top that goes over one, the T-shirt underneath, or room for one.
      const under = role === 'Top' && garment && goesOver(garment)
        ? layers.under ? [{ role, garment: layers.under, under: true }] : garments.some(goesUnder) ? [{ role, under: true }] : []
        : []
      if (garment) return [{ role, garment }, ...under]
      // An empty place is offered when it makes sense: a dress leaves no place for a top.
      const onePiece = board.some((item) => item.role === 'Una pieza')
      if (role === 'Una pieza') return []
      if (onePiece && (role === 'Top' || role === 'Bottom')) return []
      return garments.some((item) => item.role === role) ? [{ role }] : []
    }),
    // Every accessory worn, and always room for one more.
    ...board.filter(isAccessory).map((garment) => ({ role: garment.role, garment })),
    ...(garments.some(isAccessory) ? [{ role: 'Accesorio' as GarmentRole }] : [])
  ].sort((a, b) => Number(!a.garment) - Number(!b.garment)) // What is worn first, what could be added after it.
  const pickerCurrent = picking && (picking.replacing ?? (isAccessory(picking) || picking.under ? undefined : picking.role === 'Top' ? layers.outer : board.find((garment) => garment.role === picking.role)))

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
                onSelect={choose}
                label={(garment) => `Elegir ${placeLabel(garment.role, garment.id === layers.under?.id).toLocaleLowerCase('es')}: ahora, ${garmentLabel(garment)}`}
                className="studio-collage"
              />
              <p className="studio-hint">Toca una prenda para elegir otra. Fija las que quieras mantener y pide otra combinación.</p>
              <ul className="studio-pieces" aria-label="Prendas del outfit">
                {slots.flatMap(({ role, garment, under }) => garment ? [{ role, garment, under }] : []).map(({ role, garment, under }) => {
                  const isLocked = locked.includes(garment.id)
                  return (
                    <li key={garment.id} className="studio-piece" data-locked={isLocked ? '' : undefined}>
                      <GarmentThumbnail garment={garment} alt="" />
                      <span className="studio-piece-text"><small>{placeLabel(role, under)}</small>{garmentLabel(garment)}</span>
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
            {slots.map(({ role, garment, under }) => (
              <li key={garment?.id ?? `${role}${under ? '-under' : ''}`} className={garment ? 'studio-slot' : 'studio-slot studio-slot-empty'}>
                {garment ? (
                  <>
                    <button type="button" className="studio-slot-photo" onClick={() => choose(garment)} aria-label={`Elegir ${placeLabel(role, under).toLocaleLowerCase('es')}: ahora, ${garmentLabel(garment)}`}>
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
                  <button type="button" className="studio-slot-add" onClick={() => setPicking({ role, ...(under ? { under } : {}) })}>
                    <HugeiconsIcon icon={Add01Icon} size={18} />
                    {slotAction(role, under)}
                  </button>
                )}
              </li>
            ))}
          </ul>
          )}
          {/* Once the outfit can be worn, what could still be added is a small button, not a place as big as a garment. */}
          {hasBase && slots.some(({ garment }) => !garment) && (
            <div className="studio-add-row">
              {slots.filter(({ garment }) => !garment).map(({ role, under }) => (
                <button key={`${role}${under ? '-under' : ''}`} type="button" className="trip-add" onClick={() => setPicking({ role, ...(under ? { under } : {}) })}>
                  <HugeiconsIcon icon={Add01Icon} size={13} />
                  {slotAction(role, under)}
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
                : (
                    // React Bits' PulseHeart, without its counter: it beats when pressed and opens the save dialog; filled once
                    // the outfit is in «Mis outfits».
                    <PulseHeart
                      className="studio-save"
                      liked={saved}
                      onChange={() => { if (!saved) setSaving(true) }}
                      disabled={saved}
                      showCount={false}
                      label={saved ? 'Guardado' : 'Guardar'}
                      size={22}
                      corner={8}
                      pillColor="#F8F6FB"
                      idleColor="#2D2838"
                      likedColor="#C8436A"
                      textColor="#2D2838"
                    />
                  )}
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

      {saving && (
        <SaveOutfitDialog
          garments={board}
          context={{ ...context, occasion }}
          initialName={start?.name && start.garmentIds.slice().sort().join('|') === boardKey ? start.name : undefined}
          onSave={save}
          onClose={() => setSaving(false)}
        />
      )}
      {picking && (
        <GarmentPicker
          title={picking.under
            ? picking.replacing ? 'Elige la camiseta de debajo' : 'Añade una camiseta debajo'
            : isAccessory(picking) && !picking.replacing ? 'Añade un accesorio' : `Elige ${SLOT_LABELS[picking.role].toLocaleLowerCase('es')}`}
          options={picking.under && !picking.replacing ? optionsUnder(board, garments, context, options) : optionsForRole(picking.role, board, garments, context, options, picking.replacing)}
          unavailable={garments.filter((garment) => (picking.under ? goesUnder(garment) : isAccessory(picking) ? isAccessory(garment) : garment.role === picking.role) && (garment.availability === 'laundry' || garment.availability === 'unavailable'))}
          current={pickerCurrent}
          canRemove={picking.role === 'Capa' || picking.role === 'Calzado' || isAccessory(picking) || Boolean(picking.under)}
          onPick={pick}
          onRemove={() => { if (pickerCurrent) removeFromBoard(pickerCurrent) }}
          onAvailability={(garment, availability) => void changeAvailability(garment, availability)}
          onClose={() => setPicking(undefined)}
        />
      )}
    </div>
  )
}
