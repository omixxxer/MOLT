import { useCallback, useLayoutEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
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
import GarmentPhoto from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import GarmentPicker from './GarmentPicker'
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
}

/**
 * Where outfits are made: it opens with today's proposal, each piece can be kept, changed or chosen by hand (the
 * garments that go best first), and whatever is on the board can be worn or saved.
 */
export default function OutfitStudio({ garments, data, start, desiredStyle, manualTemperature, onChanged, onAvailabilityChange }: OutfitStudioProps) {
  const [occasion, setOccasion] = useState<OutfitTemplate>('Diario')
  const forecast = useDayForecast()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
  const boardKey = outfitKey(board)
  const sameOutfit = data.outfits.filter((outfit) => [...outfit.garmentIds].sort().join('|') === boardKey)
  const saved = sameOutfit.some((outfit) => outfit.favorite || outfit.kind === 'manual')
  const wornToday = sameOutfit.some((outfit) => outfit.wornAt && localDay(new Date(outfit.wornAt)) === localDay())
  const hasBase = board.some((garment) => garment.role === 'Una pieza') || (board.some((garment) => garment.role === 'Top') && board.some((garment) => garment.role === 'Bottom'))

  const propose = useCallback((more: boolean, keep: string[] = locked) => {
    setError('')
    setNotice('')
    const request = { ...context, includeGarmentIds: keep }
    if (!more) shownKeys.current.clear()
    let found = generateOutfitCandidates(garments, request, { ...options, skip: shownKeys.current })
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
  }, [context, garments, locked, options])

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
    } catch {
      setError('No se pudo guardar el outfit en este dispositivo.')
    }
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
        <section className="studio-board" aria-label="Outfit" onTouchStart={(event) => { touchStart.current = { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 } }} onTouchEnd={finishSwipe}>
          <ul className="studio-slots">
            {slots.map(({ role, garment }) => (
              <li key={role} className={garment ? 'studio-slot' : 'studio-slot studio-slot-empty'}>
                {garment ? (
                  <>
                    <button type="button" className="studio-slot-photo" onClick={() => setPicking(role)} aria-label={`Elegir ${SLOT_LABELS[role].toLocaleLowerCase('es')}: ahora, ${garmentLabel(garment)}`}>
                      <span className="garment-tile"><GarmentPhoto image={garment.thumbnail ?? garment.image} alt={garmentLabel(garment)} /></span>
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
        </section>

        <aside className="studio-side">
          {notice && <p className="outfit-notice" role="status">{notice}</p>}
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
              <button type="button" className="button button-outline" onClick={() => void keep({ favorite: true }, 'saved')} disabled={saved}><HugeiconsIcon icon={FavouriteIcon} size={15} />{saved ? 'Guardado' : 'Guardar'}</button>
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
                        {look.garments.filter((garment) => garment.role !== 'Accesorio').slice(0, 4).map((garment) => <GarmentPhoto key={garment.id} image={garment.thumbnail ?? garment.image} alt="" />)}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>

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
