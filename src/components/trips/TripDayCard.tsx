import { useMemo, useRef, useState } from 'react'
import { Add01Icon, Alert02Icon, ShuffleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createOutfitRecord, optionsForRole, outfitKey, scoreOutfit, withGarment, type OutfitGenerationOptions } from '../../outfits/outfitGenerator'
import { logWear } from '../../stats/wearLog'
import { dayContext, nextOutfitForDay } from '../../trips/packingPlan'
import type { Garment, GarmentRole, PackingStyle, TripDay } from '../../types/domain'
import { dayFromToday } from '../../weather/openMeteo'
import GarmentPhoto from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import GarmentPicker from '../outfits/GarmentPicker'
import type { OutfitData } from '../outfits/outfitData'
import { weatherIcon, weatherSummary } from '../weather/WeatherBar'

const OCCASIONS = ['Diario', 'Arreglado', 'Formal', 'Deportivo', 'Frío y capas', 'Calor y pocas capas']
const ROLE_ORDER: GarmentRole[] = ['Capa', 'Top', 'Una pieza', 'Bottom', 'Calzado', 'Accesorio']
const ROLE_LABELS: Record<GarmentRole, string> = { Capa: 'capa', Top: 'parte de arriba', Bottom: 'parte de abajo', 'Una pieza': 'vestido o mono', Calzado: 'calzado', Accesorio: 'accesorio' }
const dateFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

interface TripDayCardProps {
  day: TripDay
  days: TripDay[]
  index: number
  style: PackingStyle
  garments: Garment[]
  data: OutfitData
  options: OutfitGenerationOptions
  onChange: (day: TripDay) => void
  onDataChanged: () => Promise<void>
  onAvailabilityChange: (garment: Garment) => Promise<void>
}

/** One day of the trip: its weather, what it is for and the outfit, which can be changed piece by piece. */
export default function TripDayCard({ day, days, index, style, garments, data, options, onChange, onDataChanged, onAvailabilityChange }: TripDayCardProps) {
  const [picking, setPicking] = useState<GarmentRole>()
  const [notice, setNotice] = useState('')
  const seen = useRef(new Set<string>())
  const outfit = useMemo(() => day.garmentIds
    .map((id) => garments.find((garment) => garment.id === id))
    .filter((garment): garment is Garment => Boolean(garment))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)), [day.garmentIds, garments])
  const context = useMemo(() => dayContext(day), [day])
  const verdict = useMemo(() => (outfit.length ? scoreOutfit(outfit, context, options) : undefined), [outfit, context, options])
  const key = outfitKey(outfit)
  const isToday = day.date === dayFromToday(0)
  const wornToday = isToday && data.outfits.some((item) => item.wornAt && [...item.garmentIds].sort().join('|') === key && dayFromToday(0, new Date(item.wornAt)) === day.date)
  const onePiece = outfit.some((garment) => garment.role === 'Una pieza')
  const missing = ROLE_ORDER.filter((role) => {
    if (outfit.some((garment) => garment.role === role) || !garments.some((garment) => garment.role === role)) return false
    if (role === 'Una pieza') return false
    return !(onePiece && (role === 'Top' || role === 'Bottom'))
  })
  const pickerCurrent = picking && outfit.find((garment) => garment.role === picking)

  function otherOutfit() {
    seen.current.add(key)
    setNotice('')
    let next = nextOutfitForDay(garments, days, index, style, seen.current, options)
    if (!next && seen.current.size > 1) {
      seen.current.clear()
      seen.current.add(key)
      next = nextOutfitForDay(garments, days, index, style, seen.current, options)
    }
    if (next) onChange({ ...day, garmentIds: next.garments.map((garment) => garment.id), edited: true })
    else setNotice('No hay otra combinación para este día.')
  }

  function changeOccasion(occasion: string) {
    const changed = { ...day, occasion }
    seen.current.clear()
    const best = nextOutfitForDay(garments, days.map((item, position) => (position === index ? changed : item)), index, style, seen.current, options)
    onChange({ ...changed, garmentIds: best?.garments.map((garment) => garment.id) ?? [], edited: true })
    if (!best) setNotice('No hay prendas para ese plan.')
  }

  function pick(garment: Garment) {
    onChange({ ...day, garmentIds: withGarment(outfit, garment).map((item) => item.id), edited: true })
    setPicking(undefined)
  }

  async function wear() {
    if (!verdict) return
    const existing = data.outfits.find((item) => [...item.garmentIds].sort().join('|') === key)
    await logWear(existing ?? createOutfitRecord(verdict, context))
    await onDataChanged()
  }

  return (
    <article className="outfit-card trip-day" aria-label={dateFormat.format(new Date(`${day.date}T12:00:00`))}>
      <header className="trip-day-header">
        <div>
          <h3>{dateFormat.format(new Date(`${day.date}T12:00:00`))}{isToday && ' · hoy'}</h3>
          <p><HugeiconsIcon icon={weatherIcon(day.weather)} size={15} />{weatherSummary(day.weather)} · {day.weather.conditions[0]}{day.weather.source === 'climate' && ' (lo habitual)'}</p>
        </div>
        <label className="trip-occasion"><span className="visually-hidden">Plan del día</span>
          <select value={day.occasion} onChange={(event) => changeOccasion(event.target.value)}>
            {OCCASIONS.map((occasion) => <option key={occasion}>{occasion}</option>)}
          </select>
        </label>
      </header>

      {outfit.length ? (
        <ul className="trip-pieces">
          {outfit.map((garment) => (
            <li key={garment.id}>
              <button type="button" onClick={() => setPicking(garment.role)} aria-label={`Cambiar ${garmentLabel(garment)}`}>
                <span className="garment-tile"><GarmentPhoto image={garment.thumbnail ?? garment.image} alt={garmentLabel(garment)} /></span>
                <span className="trip-piece-name">{garmentLabel(garment)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="outfit-explanation">No hay una combinación posible para este día con las prendas disponibles.</p>}

      {verdict && verdict.warnings.length > 0 && (
        <ul className="studio-warnings">{verdict.warnings.map((warning) => <li key={warning}><HugeiconsIcon icon={Alert02Icon} size={13} />{warning}</li>)}</ul>
      )}
      {notice && <p className="outfit-explanation" role="status">{notice}</p>}

      <div className="trip-day-actions">
        <button type="button" className="button button-outline" onClick={otherOutfit}><HugeiconsIcon icon={ShuffleIcon} size={15} />Otra opción</button>
        {isToday && outfit.length > 0 && <button type="button" className="button button-dark" onClick={() => void wear()} disabled={wornToday}>{wornToday ? 'Puesto hoy' : 'Me lo pongo hoy'}</button>}
        {missing.map((role) => (
          <button key={role} type="button" className="trip-add" onClick={() => setPicking(role)}><HugeiconsIcon icon={Add01Icon} size={13} />{ROLE_LABELS[role]}</button>
        ))}
      </div>

      {picking && (
        <GarmentPicker
          title={`Elige ${ROLE_LABELS[picking]}`}
          options={optionsForRole(picking, outfit, garments, context, options)}
          unavailable={garments.filter((garment) => garment.role === picking && (garment.availability === 'laundry' || garment.availability === 'unavailable'))}
          current={pickerCurrent}
          canRemove={picking === 'Capa' || picking === 'Accesorio' || picking === 'Calzado'}
          onPick={pick}
          onRemove={() => {
            onChange({ ...day, garmentIds: outfit.filter((garment) => garment.role !== picking).map((garment) => garment.id), edited: true })
            setPicking(undefined)
          }}
          onAvailability={(garment, availability) => void onAvailabilityChange({ ...garment, availability })}
          onClose={() => setPicking(undefined)}
        />
      )}
    </article>
  )
}
