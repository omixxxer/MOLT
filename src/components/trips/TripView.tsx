import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy01Icon, Delete02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { forecastChanges, packingGroups, packingText, PACKING_STYLES, planDays, summarizeWeather, TRIP_KINDS, tripDates, type ForecastChange } from '../../trips/packingPlan'
import type { Garment, Trip, TripDay } from '../../types/domain'
import { dayFromToday, getForecast, placeLabel } from '../../weather/openMeteo'
import { askConfirm } from '../confirmDialog'
import { garmentLabel } from '../OutfitBoard'
import type { OutfitData } from '../outfits/outfitData'
import { WeatherCredit, weatherIcon } from '../weather/WeatherBar'
import PackingList from './PackingList'
import TripDayCard from './TripDayCard'

const weekday = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' })
const REFRESH_AFTER = 3 * 3_600_000

export function dayName(day: string, format: Intl.DateTimeFormat = weekday) {
  return format.format(new Date(`${day}T12:00:00`))
}

interface TripViewProps {
  trip: Trip
  garments: Garment[]
  data: OutfitData
  onChange: (trip: Trip) => Promise<void>
  onDelete: (trip: Trip) => Promise<void>
  onDataChanged: () => Promise<void>
  onAvailabilityChange: (garment: Garment) => Promise<void>
}

/** A trip: its weather, what to wear each day and the list to pack, kept up to date as the dates approach. */
export default function TripView({ trip, garments, data, onChange, onDelete, onDataChanged, onAvailabilityChange }: TripViewProps) {
  const today = dayFromToday(0)
  const [pane, setPane] = useState<'days' | 'list'>('days')
  const [refreshing, setRefreshing] = useState(false)
  const [changes, setChanges] = useState<ForecastChange[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const latest = useRef(trip)
  latest.current = trip

  const options = useMemo(() => ({ preferences: data.preferences, feedback: data.feedback, wear: data.wear }), [data.preferences, data.feedback, data.wear])
  const summary = useMemo(() => summarizeWeather(trip.days.map((day) => day.weather)), [trip.days])
  const groups = useMemo(() => packingGroups(garments, trip.days), [garments, trip.days])
  const garmentCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const packedCount = groups.flatMap((group) => group.items).filter(({ garment }) => trip.packedIds.includes(garment.id)).length + trip.extras.filter((extra) => extra.packed).length
  const totalCount = garmentCount + trip.extras.length
  const finished = trip.endDate < today

  function update(change: Partial<Trip>) {
    void onChange({ ...latest.current, ...change, updatedAt: new Date().toISOString() })
  }

  async function refresh(force: boolean) {
    const current = latest.current
    const coming = current.days.filter((day) => day.date >= today)
    if (!coming.length) return
    setRefreshing(true)
    setError('')
    setMessage('')
    try {
      const { days, fetchedAt, stale } = await getForecast(current.place, coming[0]!.date, coming.length, { force })
      setChanges(forecastChanges(coming.map((day) => day.weather), days))
      update({ days: current.days.map((day) => ({ ...day, weather: days.find((item) => item.date === day.date) ?? day.weather })), fetchedAt })
      setMessage(stale ? 'Sin conexión: es la última previsión guardada.' : force ? 'Previsión actualizada.' : '')
    } catch (reason) {
      if (force) setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la previsión.')
    } finally {
      setRefreshing(false)
    }
  }

  // When the plan is opened after a while, the weather is looked at again: forecasts change, and far dates come within reach.
  useEffect(() => {
    if (!finished && Date.now() - Date.parse(trip.fetchedAt ?? '') > REFRESH_AFTER) void refresh(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function adjustOutfits() {
    update({ days: planDays(garments, latest.current.days, trip.style, options) })
    setChanges([])
    setMessage('Outfits reajustados al nuevo tiempo.')
  }

  function replaceDay(index: number, day: TripDay) {
    update({ days: latest.current.days.map((item, position) => (position === index ? day : item)) })
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(packingText(trip, garments, garmentLabel))
      setMessage('Lista copiada.')
    } catch {
      setError('No se pudo copiar la lista.')
    }
  }

  async function remove() {
    if (await askConfirm(`¿Eliminar el viaje a ${trip.place.name}? Las prendas siguen en tu armario.`, 'Eliminar viaje')) await onDelete(trip)
  }

  const kindLabel = TRIP_KINDS.find((item) => item.id === trip.kind)?.label
  const fetched = trip.fetchedAt ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(trip.fetchedAt)) : undefined

  return (
    <div className="trip">
      <header className="trip-header">
        <div>
          <h2>{trip.place.name}</h2>
          <p>{tripDates(trip)} · {trip.days.length} {trip.days.length === 1 ? 'día' : 'días'} · {kindLabel} · maleta {PACKING_STYLES[trip.style].label.toLocaleLowerCase('es')}</p>
          <p className="trip-place">{placeLabel(trip.place)}</p>
        </div>
        <div className="trip-tools">
          {!finished && <button type="button" className="button button-outline" onClick={() => void refresh(true)} disabled={refreshing}><HugeiconsIcon icon={Refresh01Icon} size={15} />{refreshing ? 'Consultando…' : 'Actualizar tiempo'}</button>}
          <button type="button" className="icon-button" onClick={() => void copyList()} aria-label="Copiar la lista" title="Copiar la lista"><HugeiconsIcon icon={Copy01Icon} size={16} /></button>
          <button type="button" className="icon-button" onClick={() => void remove()} aria-label="Eliminar el viaje" title="Eliminar el viaje"><HugeiconsIcon icon={Delete02Icon} size={16} /></button>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="outfit-notice" role="status">{message}</p>}
      {changes.length > 0 && (
        <section className="trip-changes" aria-label="Cambios en el tiempo">
          <div>
            <strong>Ha cambiado la previsión</strong>
            <ul>{changes.map((change) => <li key={change.date}><span className="trip-capitalize">{dayName(change.date)}</span>: {change.text}</li>)}</ul>
          </div>
          <div className="trip-changes-actions">
            <button type="button" className="button button-dark" onClick={adjustOutfits}>Reajustar outfits</button>
            <button type="button" className="studio-link" onClick={() => setChanges([])}>Dejarlos como están</button>
          </div>
        </section>
      )}

      <section className="trip-weather" aria-label="Tiempo durante el viaje">
        <ul className="weather-strip">
          {trip.days.map(({ weather }) => (
            <li key={weather.date} className={weather.source === 'climate' ? 'climate' : undefined}>
              <span className="trip-capitalize">{dayName(weather.date)}</span>
              <HugeiconsIcon icon={weatherIcon(weather)} size={22} />
              <strong>{weather.high ?? weather.temperatureCelsius}°</strong>
              <small>{weather.low ?? weather.temperatureCelsius}°</small>
              <small className="weather-rain">{weather.rainChance !== undefined && weather.rainChance >= 20 ? `${weather.rainChance} %` : ' '}</small>
            </li>
          ))}
        </ul>
        <div className="trip-advice">
          {summary.advice.map((advice) => <p key={advice}>{advice}</p>)}
          {summary.climateDays > 0 && <p>{summary.climateDays === trip.days.length ? 'Fechas lejanas' : `${summary.climateDays} de los días están lejos`}: es lo habitual en años anteriores, no una previsión. Se actualizará al acercarse.</p>}
          <p className="weather-note">{fetched && `Consultado el ${fetched}. `}<WeatherCredit /></p>
        </div>
      </section>

      <div className="trip-tabs" role="tablist" aria-label="Ver">
        <button type="button" role="tab" aria-selected={pane === 'days'} onClick={() => setPane('days')}>Qué ponerte</button>
        <button type="button" role="tab" aria-selected={pane === 'list'} onClick={() => setPane('list')}>Lista · {packedCount}/{totalCount}</button>
      </div>

      <div className="trip-layout" data-pane={pane}>
        <section className="trip-days" aria-label="Qué ponerte cada día">
          {trip.days.map((day, index) => (
            <TripDayCard
              key={day.date}
              day={day}
              days={trip.days}
              index={index}
              style={trip.style}
              garments={garments}
              data={data}
              options={options}
              onChange={(next) => replaceDay(index, next)}
              onDataChanged={onDataChanged}
              onAvailabilityChange={onAvailabilityChange}
            />
          ))}
        </section>
        <PackingList trip={trip} groups={groups} onChange={update} />
      </div>
    </div>
  )
}
