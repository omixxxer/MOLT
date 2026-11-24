import { useEffect, useMemo, useRef, useState } from 'react'
import { Cancel01Icon, Copy01Icon, Delete02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { forecastChanges, packingGroups, packingText, PACKING_STYLES, summarizeWeather, TRIP_KINDS, tripDates, type ForecastChange } from '../../trips/packingPlan'
import { coverImage, findDestinationPhoto, forgetCover } from '../../trips/destinationPhoto'
import { planDaysInBackground } from '../../trips/plannerClient'
import { sceneFor } from '../../trips/tripScene'
import type { Garment, PackingStyle, Trip, TripCover, TripDay } from '../../types/domain'
import { dayFromToday, getForecast, placeLabel } from '../../weather/openMeteo'
import { askConfirm } from '../confirmDialog'
import { garmentLabel } from '../OutfitBoard'
import type { OutfitData } from '../outfits/outfitData'
import { WeatherCredit, weatherIcon } from '../weather/WeatherBar'
import PackingList from './PackingList'
import TripDayCard from './TripDayCard'
import TripScene from './TripScene'
import { useObjectUrl } from '../useObjectUrl'

const weekday = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' })
/** The forecast is looked at again on its own once it is this old: on opening the trip, coming back to the app, or while it stays open. */
export const REFRESH_AFTER = 3 * 3_600_000
/** How often an open trip checks whether its forecast has grown old. */
const CHECK_EVERY = 10 * 60_000
/** A place Wikipedia had no free photo of is looked for again after this long. */
const COVER_RETRY_MS = 30 * 86_400_000

export function dayName(day: string, format: Intl.DateTimeFormat = weekday) {
  return format.format(new Date(`${day}T12:00:00`))
}

/** «ahora mismo», «hace 5 min», «hace 2 h», «el 3 dic»: how old the forecast is. */
export function sinceText(at: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(at))}`
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

/** A trip: its weather, what to wear each day and the list to pack, kept up to date on its own as the dates approach. */
export default function TripView({ trip, garments, data, onChange, onDelete, onDataChanged, onAvailabilityChange }: TripViewProps) {
  const today = dayFromToday(0)
  const [pane, setPane] = useState<'days' | 'list'>('days')
  const refreshing = useRef(false)
  const [checking, setChecking] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [changes, setChanges] = useState<ForecastChange[]>([])
  /** The days as they were before the new weather changed them, for «Deshacer». */
  const [before, setBefore] = useState<TripDay[]>()
  const [now, setNow] = useState(Date.now())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const latest = useRef(trip)
  latest.current = trip

  const options = useMemo(() => ({ preferences: data.preferences, feedback: data.feedback, wear: data.wear }), [data.preferences, data.feedback, data.wear])
  const summary = useMemo(() => summarizeWeather(trip.days.map((day) => day.weather)), [trip.days])
  const groups = useMemo(() => packingGroups(garments, trip.days, trip.extraGarmentIds), [garments, trip.days, trip.extraGarmentIds])
  const garmentCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  const packedCount = groups.flatMap((group) => group.items).filter(({ garment }) => trip.packedIds.includes(garment.id)).length + trip.extras.filter((extra) => extra.packed).length
  const totalCount = garmentCount + trip.extras.length
  const finished = trip.endDate < today

  function update(change: Partial<Trip>) {
    // Changes can come close together (the weather, the outfits, the photo, all on opening): each one builds on the
    // last, even before the screen has shown it, so none undoes another.
    const next = { ...latest.current, ...change, updatedAt: new Date().toISOString() }
    latest.current = next
    void onChange(next)
  }

  /**
   * Looks at the forecast again. When it has changed, the days the user has not edited are planned again on their own
   * (the edited ones stay as they are), and «Deshacer» brings the outfits back as they were.
   */
  async function refresh(force: boolean) {
    const current = latest.current
    const coming = current.days.filter((day) => day.date >= today)
    if (!coming.length || refreshing.current) return
    refreshing.current = true
    setChecking(true)
    setError('')
    if (force) setMessage('')
    try {
      const { days, fetchedAt, stale } = await getForecast(current.place, coming[0]!.date, coming.length, { force })
      const found = forecastChanges(coming.map((day) => day.weather), days)
      update({ days: current.days.map((day) => ({ ...day, weather: days.find((item) => item.date === day.date) ?? day.weather })), fetchedAt })
      if (found.length) {
        setChanges(found)
        await adjustOutfits(current.days)
      } else if (stale) {
        setMessage('Sin conexión: es la última previsión guardada.')
      } else if (force) {
        setMessage('El tiempo no ha cambiado.')
      }
    } catch (reason) {
      if (force) setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la previsión.')
    } finally {
      refreshing.current = false
      setChecking(false)
      setNow(Date.now())
    }
  }

  // The weather is looked at again on its own when the forecast has grown old: on opening the trip, on coming back to
  // the app, and every so often while it stays open. Forecasts change, and far dates come within reach.
  useEffect(() => {
    if (finished) return
    const check = () => {
      setNow(Date.now())
      if (document.visibilityState !== 'hidden' && Date.now() - Date.parse(latest.current.fetchedAt ?? '') > REFRESH_AFTER) void refresh(false)
    }
    check()
    const timer = window.setInterval(check, CHECK_EVERY)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The days not edited, planned again for the new weather; `previous` is kept for «Deshacer». */
  async function adjustOutfits(previous: TripDay[]) {
    setAdjusting(true)
    try {
      const planned = await planDaysInBackground(garments, latest.current.days, latest.current.style, options)
      update({ days: planned })
      setBefore(previous)
    } catch {
      setError('No se pudieron reajustar los outfits al nuevo tiempo.')
    } finally {
      setAdjusting(false)
    }
  }

  function undoAdjust() {
    if (!before) return
    // The outfits as they were, with the new weather.
    update({ days: before.map((day) => ({ ...day, weather: latest.current.days.find((item) => item.date === day.date)?.weather ?? day.weather })) })
    setBefore(undefined)
    setChanges([])
    setMessage('Outfits como estaban, con el tiempo nuevo.')
  }

  function closeChanges() {
    setChanges([])
    setBefore(undefined)
  }

  /** Another kind of suitcase: the days the user has not edited are planned again with its rules. */
  async function changeStyle(style: PackingStyle) {
    if (style === latest.current.style || adjusting) return
    setAdjusting(true)
    setError('')
    try {
      const days = await planDaysInBackground(garments, latest.current.days, style, options)
      update({ style, days })
      const kept = days.filter((day) => day.edited).length
      setMessage(`Maleta ${PACKING_STYLES[style].label.toLocaleLowerCase('es')}: outfits elegidos de nuevo${kept ? ` (los ${kept} días que cambiaste se quedan como estaban)` : ''}.`)
    } catch {
      setError('No se pudo cambiar la maleta.')
    } finally {
      setAdjusting(false)
    }
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
    if (!await askConfirm(`¿Eliminar el viaje a ${trip.place.name}? Las prendas siguen en tu armario.`, 'Eliminar viaje')) return
    await forgetCover(trip.cover)
    await onDelete(trip)
  }

  // The header's picture: a photo of the destination, looked for on Wikipedia when the trip is opened; the drawn
  // scene while it loads and when there is none. A place without a free photo is not asked again for a while.
  const scene = useMemo(() => sceneFor(trip), [trip.kind, trip.days, trip.place]) // eslint-disable-line react-hooks/exhaustive-deps
  const [coverBlob, setCoverBlob] = useState<Blob>()
  const coverUrl = useObjectUrl(coverBlob)
  useEffect(() => {
    setCoverBlob(undefined)
    let current = true
    const show = (cover: TripCover) => coverImage(cover).then((blob) => { if (current) setCoverBlob(blob) })
    if (trip.cover) {
      show(trip.cover).catch(() => undefined)
    } else if (!(Date.now() - Date.parse(trip.coverCheckedAt ?? '') < COVER_RETRY_MS)) {
      findDestinationPhoto(trip.place).then(async (cover) => {
        if (!current) return
        if (!cover) {
          update({ coverCheckedAt: new Date().toISOString() })
          return
        }
        await show(cover)
        if (current) update({ cover })
      }).catch(() => undefined)
    }
    return () => { current = false }
  }, [trip.id, trip.cover?.imageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const kindLabel = TRIP_KINDS.find((item) => item.id === trip.kind)?.label
  const fetched = trip.fetchedAt ? sinceText(Date.parse(trip.fetchedAt), now) : undefined
  const kept = trip.days.filter((day) => day.edited).length

  return (
    <div className="trip">
      <header className="trip-header" data-photo={coverUrl ? '' : undefined}>
        <div className="trip-hero" aria-hidden="true">
          {coverUrl ? <img src={coverUrl} alt="" /> : <TripScene scene={scene} />}
        </div>
        <div className="trip-header-text">
          <h2>{trip.place.name}</h2>
          <p>{tripDates(trip)} · {trip.days.length} {trip.days.length === 1 ? 'día' : 'días'} · {kindLabel}</p>
          <p className="trip-place">{placeLabel(trip.place)}</p>
          <div className="trip-style-switch" role="group" aria-label="Tipo de maleta">
            {(Object.entries(PACKING_STYLES) as Array<[PackingStyle, (typeof PACKING_STYLES)[PackingStyle]]>).map(([id, rules]) => (
              <button key={id} type="button" aria-pressed={trip.style === id} title={rules.detail} onClick={() => void changeStyle(id)} disabled={adjusting}>
                <span className="trip-style-prefix">Maleta </span>{rules.label.toLocaleLowerCase('es')}
              </button>
            ))}
          </div>
        </div>
        <div className="trip-tools">
          <button type="button" className="icon-button" onClick={() => void copyList()} aria-label="Copiar la lista" title="Copiar la lista"><HugeiconsIcon icon={Copy01Icon} size={16} /></button>
          <button type="button" className="icon-button" onClick={() => void remove()} aria-label="Eliminar el viaje" title="Eliminar el viaje"><HugeiconsIcon icon={Delete02Icon} size={16} /></button>
        </div>
        {trip.cover && coverUrl && (
          <small className="trip-credit" title={`${trip.cover.title} · ${trip.cover.author} · ${trip.cover.license} · Wikimedia Commons`}>
            <a href={trip.cover.pageUrl} target="_blank" rel="noreferrer">© {trip.cover.author}</a>, {trip.cover.licenseUrl ? <a href={trip.cover.licenseUrl} target="_blank" rel="noreferrer">{trip.cover.license}</a> : trip.cover.license}
          </small>
        )}
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="outfit-notice" role="status">{message}</p>}
      {changes.length > 0 && (
        <section className="trip-changes" aria-label="Cambios en el tiempo">
          <div>
            <strong>Ha cambiado la previsión</strong>
            <ul>{changes.map((change) => <li key={change.date}><span className="trip-capitalize">{dayName(change.date)}</span>: {change.text}</li>)}</ul>
            <p className="trip-changes-done" role="status">
              {adjusting
                ? 'Reajustando los outfits…'
                : before && (kept
                  ? `Outfits reajustados. ${kept === 1 ? 'El día que cambiaste se queda como estaba' : `Los ${kept} días que cambiaste se quedan como estaban`}.`
                  : 'Outfits reajustados al nuevo tiempo.')}
            </p>
          </div>
          <div className="trip-changes-actions">
            {before && !adjusting && <button type="button" className="button button-outline" onClick={undoAdjust}>Deshacer</button>}
            <button type="button" className="icon-button" onClick={closeChanges} aria-label="Cerrar el aviso del tiempo" title="Cerrar"><HugeiconsIcon icon={Cancel01Icon} size={14} /></button>
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
              <small className="weather-rain">{weather.rainChance !== undefined && weather.rainChance >= 20 ? `${weather.rainChance} %` : ' '}</small>
            </li>
          ))}
        </ul>
        <div className="trip-advice">
          {summary.advice.map((advice) => <p key={advice}>{advice}</p>)}
          {summary.climateDays > 0 && <p>{summary.climateDays === trip.days.length ? 'Fechas lejanas' : `${summary.climateDays} de los días están lejos`}: es lo habitual en años anteriores, no una previsión. Se actualizará al acercarse.</p>}
          <p className="weather-note">
            {!finished && (
              <span className="weather-updated">
                {checking ? 'Consultando el tiempo…' : fetched ? `Actualizado ${fetched}; se actualiza solo.` : 'Se actualiza solo.'}
                <button type="button" className="weather-refresh" onClick={() => void refresh(true)} disabled={checking} aria-label="Consultar el tiempo ahora" title="Consultar el tiempo ahora"><HugeiconsIcon icon={Refresh01Icon} size={13} /></button>
              </span>
            )}
            {finished && fetched && `Consultado ${fetched}. `}
            <WeatherCredit />
          </p>
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
        <PackingList trip={trip} groups={groups} garments={garments} onChange={update} />
      </div>
    </div>
  )
}
