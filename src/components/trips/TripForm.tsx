import { useState, type FormEvent } from 'react'
import { defaultExtras, occasionOfKind, PACKING_STYLES, planDays, TRIP_KINDS, type TripKind } from '../../trips/packingPlan'
import type { Garment, PackingStyle, Trip } from '../../types/domain'
import { dayFromToday, FORECAST_DAYS, getForecast, MAX_TRIP_DAYS, searchPlaces, type Place } from '../../weather/openMeteo'
import type { OutfitData } from '../outfits/outfitData'
import PlaceField from '../weather/PlaceField'
import { WeatherCredit } from '../weather/WeatherBar'

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000)
}

function addDays(day: string, days: number) {
  return dayFromToday(days, new Date(`${day}T12:00:00`))
}

interface TripFormProps {
  garments: Garment[]
  data: OutfitData
  onCreated: (trip: Trip) => Promise<void>
}

/** Where, when, what for and how light: everything else comes from the weather and the wardrobe. */
export default function TripForm({ garments, data, onCreated }: TripFormProps) {
  const today = dayFromToday(0)
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<Place>()
  const [startDate, setStartDate] = useState(() => dayFromToday(1))
  const [endDate, setEndDate] = useState(() => dayFromToday(3))
  const [kind, setKind] = useState<TripKind>('leisure')
  const [style, setStyle] = useState<PackingStyle>('balanced')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const length = daysBetween(startDate, endDate) + 1
  const tooLong = length > MAX_TRIP_DAYS
  const invalid = length < 1 || startDate < today
  const beyondForecast = !invalid && daysBetween(today, endDate) >= FORECAST_DAYS

  function changeStart(value: string) {
    setStartDate(value)
    // The end moves with the start, keeping the length, as long as that makes sense.
    if (value && length >= 1) setEndDate(addDays(value, Math.min(length, MAX_TRIP_DAYS) - 1))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const destination = place ?? (await searchPlaces(query))[0]
      if (!destination) throw new Error(`No encontramos «${query.trim()}». Prueba con otro nombre.`)
      const { days, fetchedAt } = await getForecast(destination, startDate, length)
      const occasion = occasionOfKind(kind)
      const planned = planDays(garments, days.map((weather) => ({ date: weather.date, weather, occasion, garmentIds: [] })), style, { preferences: data.preferences, feedback: data.feedback, wear: data.wear })
      const now = new Date().toISOString()
      await onCreated({
        id: crypto.randomUUID(),
        place: destination,
        startDate,
        endDate,
        kind,
        style,
        days: planned,
        packedIds: [],
        extras: defaultExtras(days, kind),
        fetchedAt,
        createdAt: now,
        updatedAt: now
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo preparar la maleta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="trip-form" onSubmit={(event) => void submit(event)}>
      <p className="page-intro">Dinos a dónde vas: miramos el tiempo y te proponemos qué ponerte cada día, repitiendo prendas para que la maleta pese menos.</p>
      <PlaceField label="Destino" query={query} onQuery={(text) => { setQuery(text); setPlace(undefined) }} onSelect={setPlace} placeholder="p. ej. Valencia" />
      <div className="trip-dates">
        <label className="form-field">Primer día
          <input type="date" value={startDate} min={today} onChange={(event) => changeStart(event.target.value)} required />
        </label>
        <label className="form-field">Último día
          <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required />
        </label>
      </div>
      {tooLong && <p className="form-error" role="alert">El viaje puede durar hasta {MAX_TRIP_DAYS} días.</p>}
      {length < 1 && <p className="form-error" role="alert">El último día no puede ser anterior al primero.</p>}
      {startDate < today && <p className="form-error" role="alert">El viaje no puede empezar en una fecha pasada.</p>}

      <fieldset className="trip-choice">
        <legend>Tipo de viaje</legend>
        <div className="choice-row">
          {TRIP_KINDS.map((item) => <button key={item.id} type="button" className={`choice-chip ${kind === item.id ? 'selected' : ''}`} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{item.label}</button>)}
        </div>
      </fieldset>
      <fieldset className="trip-choice">
        <legend>Maleta</legend>
        <div className="trip-styles">
          {(Object.entries(PACKING_STYLES) as Array<[PackingStyle, (typeof PACKING_STYLES)[PackingStyle]]>).map(([id, rules]) => (
            <button key={id} type="button" className="trip-style" aria-pressed={style === id} onClick={() => setStyle(id)}>
              <strong>{rules.label}</strong><span>{rules.detail}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark" type="submit" disabled={loading || !query.trim() || invalid || tooLong}>
        {loading ? 'Consultando el tiempo…' : 'Preparar la maleta'}
      </button>
      <p className="weather-note">
        {beyondForecast ? `La previsión llega a ${FORECAST_DAYS} días; para el resto usaremos cómo fue el tiempo esas fechas en años anteriores, y lo actualizaremos al acercarse. ` : ''}
        Solo se envían el destino y las fechas: tus prendas no salen del dispositivo. <WeatherCredit />
      </p>
    </form>
  )
}
