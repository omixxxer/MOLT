/** A place chosen from the search: coordinates, so «Valencia» is never a surprise in Venezuela. */
export interface Place {
  id?: number
  name: string
  region?: string
  country?: string
  latitude: number
  longitude: number
}

export interface DailyWeather {
  date: string
  /** The temperature to dress for: how the day feels, leaning towards its waking hours. */
  temperatureCelsius: number
  high?: number
  low?: number
  /** Chance of rain at the wettest moment, 0-100; unknown for climate averages. */
  rainChance?: number
  rainMm?: number
  windKmh?: number
  uvIndex?: number
  /** WMO code of the day; none for climate averages. */
  code?: number
  conditions: string[]
  /** A forecast, or what these dates were like in past years when they are too far ahead to forecast. */
  source?: 'forecast' | 'climate'
}

export type WeatherErrorKind = 'not-found' | 'range' | 'offline' | 'limit' | 'service'

export class WeatherError extends Error {
  constructor(readonly kind: WeatherErrorKind, message: string) {
    super(message)
    this.name = 'WeatherError'
  }
}

export interface ForecastResult {
  days: DailyWeather[]
  /** When the oldest of these days was asked for. */
  fetchedAt: string
  /** The service could not be reached and these are the last known days. */
  stale: boolean
}

interface GeocodingResponse {
  results?: Array<{ id?: number; name: string; latitude: number; longitude: number; country?: string; admin1?: string }>
}

interface DailyResponse {
  daily?: {
    time: string[]
    temperature_2m_max: Array<number | null>
    temperature_2m_min: Array<number | null>
    apparent_temperature_max?: Array<number | null>
    apparent_temperature_min?: Array<number | null>
    precipitation_sum?: Array<number | null>
    precipitation_probability_max?: Array<number | null>
    wind_speed_10m_max?: Array<number | null>
    uv_index_max?: Array<number | null>
    weather_code?: Array<number | null>
  }
}

export const WEATHER_ATTRIBUTION = { label: 'Datos de Open-Meteo', url: 'https://open-meteo.com/' }

/** How far ahead the forecast reaches; from there on, past years. */
export const FORECAST_DAYS = 16
export const MAX_TRIP_DAYS = 14
const CLIMATE_YEARS = 2
const REQUEST_TIMEOUT = 10_000
const FORECAST_TTL = 3 * 3_600_000
const CLIMATE_TTL = 7 * 86_400_000
const CACHE_KEY = 'molt-weather-cache'
const WINDY_KMH = 40
const DAY = 86_400_000

const weatherDescriptions: Record<number, string> = {
  0: 'despejado',
  1: 'mayormente despejado',
  2: 'parcialmente nuboso',
  3: 'nuboso',
  45: 'niebla',
  48: 'niebla',
  51: 'llovizna',
  53: 'llovizna',
  55: 'llovizna',
  56: 'llovizna helada',
  57: 'llovizna helada',
  61: 'lluvia',
  63: 'lluvia',
  65: 'lluvia intensa',
  66: 'lluvia helada',
  67: 'lluvia helada',
  71: 'nieve',
  73: 'nieve',
  75: 'nieve intensa',
  77: 'nieve',
  80: 'chubascos',
  81: 'chubascos',
  82: 'chubascos intensos',
  85: 'nieve',
  86: 'nieve intensa',
  95: 'tormenta',
  96: 'tormenta',
  99: 'tormenta'
}

export function placeLabel(place: Place) {
  return [place.name, place.region !== place.name ? place.region : undefined, place.country].filter(Boolean).join(', ')
}

export function dayFromToday(offset: number, today = new Date()) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`)
  return dayFromToday(days, date)
}

function dayOffset(day: string, today: Date) {
  return Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${dayFromToday(0, today)}T12:00:00`)) / DAY)
}

function withYearsBack(day: string, years: number) {
  return `${Number(day.slice(0, 4)) - years}${day.slice(4)}`.replace(/-02-29$/, '-02-28')
}

/** Answers from the service, one retry when it is its fault or the network's, and errors that say what to do. */
async function fetchJson<T>(url: URL, signal?: AbortSignal, attempt = 1): Promise<T> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT)
  const onAbort = () => timeout.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const response = await fetch(url, { signal: timeout.signal })
    if (response.ok) return await response.json() as T
    if (response.status === 429) throw new WeatherError('limit', 'El servicio del tiempo está saturado. Inténtalo dentro de un rato.')
    if (response.status >= 500 && attempt < 2) return await fetchJson<T>(url, signal, attempt + 1)
    throw new WeatherError('service', `El servicio del tiempo no ha podido responder (${response.status}).`)
  } catch (reason) {
    if (reason instanceof WeatherError || signal?.aborted) throw reason
    if (attempt < 2) return await fetchJson<T>(url, signal, attempt + 1)
    throw new WeatherError('offline', 'No se pudo consultar el tiempo. Comprueba tu conexión.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Places matching a name, the most relevant first. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const name = query.trim()
  if (name.length < 2) return []
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.search = new URLSearchParams({ name, count: '6', language: 'es', format: 'json' }).toString()
  const { results } = await fetchJson<GeocodingResponse>(url, signal)
  return (results ?? []).map(({ id, name: placeName, admin1, country, latitude, longitude }) => ({ id, name: placeName, region: admin1, country, latitude, longitude }))
}

/**
 * Rain only when it is likely: the weather code gives the worst moment of the day, so a code of «lluvia» may come with
 * a 12 % chance and 0.1 mm, and nobody should dress for that.
 */
function describe(code: number | undefined, chance: number | undefined, mm: number | undefined, wind: number | undefined) {
  const wet = code !== undefined && code >= 51 && code !== 77 && code !== 85 && code !== 86 && !(code >= 71 && code <= 75)
  const likely = (chance ?? 100) >= 40 || (mm ?? 0) >= 1
  const description = code === undefined ? 'condiciones variables' : wet && !likely ? 'nuboso' : weatherDescriptions[code] ?? 'condiciones variables'
  const conditions = [description]
  if (!wet && (chance ?? 0) >= 50) conditions.push('lluvia probable')
  if ((wind ?? 0) >= WINDY_KMH) conditions.push('viento')
  return conditions
}

function dressingTemperature(high: number, low: number, feelsHigh?: number, feelsLow?: number) {
  return Math.round((feelsHigh ?? high) * 0.6 + (feelsLow ?? low) * 0.4)
}

function roundedOrUndefined(value: number | null | undefined) {
  return value === null || value === undefined ? undefined : Math.round(value)
}

function daysFrom(response: DailyResponse, expected: number): DailyWeather[] {
  const daily = response.daily
  if (!daily || daily.time.length < expected) throw new WeatherError('service', 'La previsión no cubre todas las fechas pedidas.')
  return daily.time.slice(0, expected).map((date, index) => {
    const high = daily.temperature_2m_max[index]
    const low = daily.temperature_2m_min[index]
    if (high === null || high === undefined || low === null || low === undefined) throw new WeatherError('service', 'La respuesta del tiempo está incompleta.')
    const code = daily.weather_code?.[index] ?? undefined
    const rainChance = roundedOrUndefined(daily.precipitation_probability_max?.[index])
    const rainMm = daily.precipitation_sum?.[index] ?? undefined
    const windKmh = roundedOrUndefined(daily.wind_speed_10m_max?.[index])
    return {
      date,
      temperatureCelsius: dressingTemperature(high, low, daily.apparent_temperature_max?.[index] ?? undefined, daily.apparent_temperature_min?.[index] ?? undefined),
      high: Math.round(high),
      low: Math.round(low),
      rainChance,
      rainMm,
      windKmh,
      uvIndex: roundedOrUndefined(daily.uv_index_max?.[index]),
      code,
      conditions: describe(code, rainChance, rainMm, windKmh),
      source: 'forecast'
    }
  })
}

function coordinates(place: Place) {
  return { latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto' }
}

async function fetchForecast(place: Place, start: string, count: number, signal?: AbortSignal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    ...coordinates(place),
    daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,weather_code',
    start_date: start,
    end_date: shiftDay(start, count - 1)
  }).toString()
  return daysFrom(await fetchJson<DailyResponse>(url, signal), count)
}

/** What these dates were like, on average, in the last years. */
async function fetchClimate(place: Place, start: string, count: number, signal?: AbortSignal): Promise<DailyWeather[]> {
  const years = await Promise.all(Array.from({ length: CLIMATE_YEARS }, async (_, index) => {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.search = new URLSearchParams({
      ...coordinates(place),
      daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max',
      start_date: withYearsBack(start, index + 1),
      end_date: withYearsBack(shiftDay(start, count - 1), index + 1)
    }).toString()
    return daysFrom(await fetchJson<DailyResponse>(url, signal), count)
  }))
  return Array.from({ length: count }, (_, index) => {
    const samples = years.map((year) => year[index]!)
    const mean = (pick: (day: DailyWeather) => number) => samples.reduce((sum, day) => sum + pick(day), 0) / samples.length
    const rainMm = mean((day) => day.rainMm ?? 0)
    const windKmh = Math.round(mean((day) => day.windKmh ?? 0))
    return {
      date: shiftDay(start, index),
      temperatureCelsius: Math.round(mean((day) => day.temperatureCelsius)),
      high: Math.round(mean((day) => day.high ?? day.temperatureCelsius)),
      low: Math.round(mean((day) => day.low ?? day.temperatureCelsius)),
      rainMm: Math.round(rainMm * 10) / 10,
      windKmh,
      conditions: [rainMm >= 1 ? 'lluvia probable' : 'suele estar seco', ...(windKmh >= WINDY_KMH ? ['viento'] : [])],
      source: 'climate'
    }
  })
}

interface CachedDay {
  day: DailyWeather
  at: number
}

type WeatherCache = Record<string, CachedDay>

function readCache(): WeatherCache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as WeatherCache
  } catch {
    return {}
  }
}

function writeCache(cache: WeatherCache, today: string) {
  // Days gone by are of no use: the cache stays small by itself.
  const kept = Object.entries(cache).filter(([, entry]) => entry.day.date >= today)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Without storage every consultation simply asks again.
  }
}

function cacheKey(place: Place, date: string) {
  return `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}:${date}`
}

function isFresh(entry: CachedDay | undefined, inForecastRange: boolean, now: Date) {
  if (!entry) return false
  if (inForecastRange && entry.day.source === 'climate') return false
  return now.getTime() - entry.at < (entry.day.source === 'climate' ? CLIMATE_TTL : FORECAST_TTL)
}

/** The day if it is already known and recent, so a screen can open with it without waiting. */
export function peekForecast(place: Place, date: string, now = new Date()): DailyWeather | undefined {
  const entry = readCache()[cacheKey(place, date)]
  return isFresh(entry, dayOffset(date, now) < FORECAST_DAYS, now) ? entry!.day : undefined
}

/**
 * The weather of some consecutive days, any distance ahead: the forecast while it reaches, and past years after that.
 * Recent answers are reused, and if the service cannot be reached the last known days are returned, marked as stale.
 */
export async function getForecast(place: Place, startDate: string, days: number, options: { signal?: AbortSignal; force?: boolean; now?: Date } = {}): Promise<ForecastResult> {
  const now = options.now ?? new Date()
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIP_DAYS) throw new WeatherError('range', `El viaje debe durar entre 1 y ${MAX_TRIP_DAYS} días.`)
  const startOffset = dayOffset(startDate, now)
  if (!Number.isFinite(startOffset)) throw new WeatherError('range', 'La fecha no es válida.')
  if (startOffset < 0) throw new WeatherError('range', 'El viaje no puede empezar en una fecha pasada.')

  const dates = Array.from({ length: days }, (_, index) => shiftDay(startDate, index))
  const inRange = (date: string) => dayOffset(date, now) < FORECAST_DAYS
  const cache = readCache()
  const entryOf = (date: string) => cache[cacheKey(place, date)]
  const needed = options.force ? dates : dates.filter((date) => !isFresh(entryOf(date), inRange(date), now))
  const toForecast = dates.filter(inRange)
  const toAverage = dates.filter((date) => !inRange(date))

  let stale = false
  try {
    const requests: Array<Promise<DailyWeather[]>> = []
    if (toForecast.some((date) => needed.includes(date))) requests.push(fetchForecast(place, toForecast[0]!, toForecast.length, options.signal))
    if (toAverage.some((date) => needed.includes(date))) requests.push(fetchClimate(place, toAverage[0]!, toAverage.length, options.signal))
    for (const day of (await Promise.all(requests)).flat()) cache[cacheKey(place, day.date)] = { day, at: now.getTime() }
    if (requests.length) writeCache(cache, dayFromToday(0, now))
  } catch (reason) {
    if (options.signal?.aborted || !dates.every((date) => entryOf(date))) throw reason
    stale = true
  }
  return {
    days: dates.map((date) => entryOf(date)!.day),
    fetchedAt: new Date(Math.min(...dates.map((date) => entryOf(date)!.at))).toISOString(),
    stale
  }
}

/** What the outfit generator needs from a day's weather. */
export function weatherContext(day: DailyWeather | undefined) {
  if (!day) return {}
  return { temperatureCelsius: day.temperatureCelsius, temperatureLow: day.low, temperatureHigh: day.high, weatherConditions: day.conditions }
}

export function isRainy(day: DailyWeather) {
  return day.conditions.some((condition) => /lluvia|llovizna|chubasco|tormenta/.test(condition))
}

export function isSnowy(day: DailyWeather) {
  return day.conditions.some((condition) => condition.includes('nieve'))
}

export function isWindy(day: DailyWeather) {
  return day.conditions.includes('viento')
}
