import { useState } from 'react'
import { CloudAngledRainIcon, CloudAngledZapIcon, CloudIcon, CloudSnowIcon, FastWindIcon, Location01Icon, RainIcon, SlowWindsIcon, Sun03Icon, SunCloud01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isRainy, isSnowy, placeLabel, WEATHER_ATTRIBUTION, type DailyWeather } from '../../weather/openMeteo'
import type { DayForecast } from '../../weather/useDayForecast'
import PlaceField from './PlaceField'

/** The symbol of a day, from what it will really be like: a code of rain with a low chance is a cloudy day. */
export function weatherIcon(day: DailyWeather) {
  if (isSnowy(day)) return CloudSnowIcon
  if (day.code !== undefined && day.code >= 95) return CloudAngledZapIcon
  if (isRainy(day)) return (day.rainMm ?? 0) >= 8 ? CloudAngledRainIcon : RainIcon
  if (day.code === 45 || day.code === 48) return SlowWindsIcon
  if (day.conditions.includes('viento')) return FastWindIcon
  if (day.code === undefined) return Sun03Icon
  return day.code === 0 || day.code === 1 ? Sun03Icon : day.code === 2 ? SunCloud01Icon : CloudIcon
}

/** «10–17 °C · lluvia 60 %», what is worth knowing of a day. */
export function weatherSummary(day: DailyWeather) {
  const range = day.low !== undefined && day.high !== undefined ? `${day.low}–${day.high} °C` : `${day.temperatureCelsius} °C`
  const rain = day.rainChance !== undefined && day.rainChance >= 20 ? ` · lluvia ${day.rainChance} %` : ''
  return `${range}${rain}`
}

export function WeatherCredit() {
  return <a className="weather-credit" href={WEATHER_ATTRIBUTION.url} target="_blank" rel="noreferrer">{WEATHER_ATTRIBUTION.label}</a>
}

interface WeatherBarProps {
  forecast: DayForecast
  /** With today and tomorrow to choose from. */
  showDays?: boolean
  /** A temperature set by hand wins over the forecast. */
  manualTemperature?: string
}

/** The weather being dressed for, and where to change the city. */
export default function WeatherBar({ forecast, showDays, manualTemperature }: WeatherBarProps) {
  const { place, setPlace, offset, setOffset, day, loading, stale, error } = forecast
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState(place ? placeLabel(place) : '')

  return (
    <div className="weather-bar">
      <div className="weather-line">
        <HugeiconsIcon icon={day && !manualTemperature ? weatherIcon(day) : Location01Icon} size={17} />
        {manualTemperature
          ? <span>{manualTemperature} °C, indicado por ti</span>
          : place
            ? <span><strong>{place.name}</strong>{day ? <> · {weatherSummary(day)} · {day.conditions[0]}{day.temperatureCelsius !== day.high && <> · sensación {day.temperatureCelsius} °C</>}</> : loading ? ' · consultando el tiempo…' : ''}</span>
            : <span>Sin previsión: se usa la temporada</span>}
        {place && showDays && !manualTemperature && (
          <span className="weather-days" role="group" aria-label="Día">
            {(['Hoy', 'Mañana'] as const).map((label, index) => (
              <button key={label} type="button" aria-pressed={offset === index} onClick={() => setOffset(index as 0 | 1)}>{label}</button>
            ))}
          </span>
        )}
        {!manualTemperature && <button type="button" className="studio-link" aria-expanded={editing} onClick={() => setEditing(!editing)}>{place ? 'Cambiar ciudad' : 'Añadir tu ciudad'}</button>}
      </div>
      {stale && <p className="weather-note" role="status">Sin conexión: es la última previsión guardada.</p>}
      {error && <p className="weather-note" role="alert">{error}</p>}
      {editing && (
        <div className="weather-edit">
          <PlaceField label="Tu ciudad" query={query} onQuery={setQuery} onSelect={(next) => { setPlace(next); setEditing(false) }} placeholder="p. ej. Castellón" autoFocus />
          {place && <button type="button" className="studio-link" onClick={() => { setPlace(undefined); setQuery(''); setEditing(false) }}>Quitar</button>}
          <p className="weather-note">Solo se envía la ciudad para pedir el tiempo: tus prendas no salen del dispositivo. <WeatherCredit /></p>
        </div>
      )}
    </div>
  )
}
