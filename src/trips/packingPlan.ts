import { generateOutfitCandidates, outfitKey, seasonOfDate, type OutfitCandidate, type OutfitContext, type OutfitGenerationOptions } from '../outfits/outfitGenerator'
import type { Garment, GarmentRole, PackingStyle, Trip, TripDay, TripExtra } from '../types/domain'
import { isRainy, isSnowy, isWindy, weatherContext, type DailyWeather } from '../weather/openMeteo'

interface StyleRules {
  label: string
  detail: string
  /** Days a garment may be worn before it counts as overused. */
  wearsPerTop: number
  wearsPerBottom: number
  shoes: number
  layers: number
  /** What each new garment in the suitcase costs against how well an outfit fits. */
  newGarment: number
}

export const PACKING_STYLES: Record<PackingStyle, StyleRules> = {
  light: { label: 'Ligera', detail: 'Repite prendas; lo justo', wearsPerTop: 3, wearsPerBottom: 5, shoes: 1, layers: 1, newGarment: 14 },
  balanced: { label: 'Equilibrada', detail: 'Repite lo razonable', wearsPerTop: 2, wearsPerBottom: 3, shoes: 2, layers: 2, newGarment: 7 },
  roomy: { label: 'Holgada', detail: 'Algo distinto cada día', wearsPerTop: 1, wearsPerBottom: 2, shoes: 3, layers: 3, newGarment: 1 }
}

export const TRIP_KINDS = [
  { id: 'leisure', label: 'Ocio', occasion: 'Diario' },
  { id: 'work', label: 'Trabajo', occasion: 'Arreglado' },
  { id: 'event', label: 'Evento', occasion: 'Formal' },
  { id: 'beach', label: 'Playa', occasion: 'Calor y pocas capas' },
  { id: 'snow', label: 'Nieve', occasion: 'Frío y capas' },
  { id: 'sport', label: 'Deporte', occasion: 'Deportivo' }
] as const

export type TripKind = (typeof TRIP_KINDS)[number]['id']

export function occasionOfKind(kind: string) {
  return TRIP_KINDS.find((item) => item.id === kind)?.occasion ?? 'Diario'
}

export function dayContext(day: Pick<TripDay, 'date' | 'occasion' | 'weather'>): OutfitContext {
  return { occasion: day.occasion, season: seasonOfDate(new Date(`${day.date}T12:00:00`)), ...weatherContext(day.weather) }
}

/** How often each garment is worn in these days, leaving one out. */
function wearCounts(days: TripDay[], except?: number) {
  const counts = new Map<string, number>()
  days.forEach((day, index) => {
    if (index === except) return
    for (const id of day.garmentIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  })
  return counts
}

/** The proposals for a day: the best ones overall, and those around each garment already in the suitcase. */
function candidatesForDay(garments: Garment[], day: TripDay, packed: Garment[], options: OutfitGenerationOptions) {
  const context = dayContext(day)
  const found = new Map<string, OutfitCandidate>()
  const collect = (list: OutfitCandidate[]) => {
    for (const candidate of list) found.set(outfitKey(candidate.garments), candidate)
  }
  collect(generateOutfitCandidates(garments, context, { ...options, seed: day.date, limit: 8 }))
  for (const garment of packed) {
    if (garment.role !== 'Accesorio') collect(generateOutfitCandidates(garments, { ...context, includeGarmentIds: [garment.id] }, { ...options, seed: day.date, limit: 3 }))
  }
  return [...found.values()]
}

/** How good an outfit is for the trip: its own score, minus what it adds to the suitcase and overuses. */
function tripValue(candidate: OutfitCandidate, others: Map<string, number>, previous: TripDay | undefined, garments: Garment[], rules: StyleRules) {
  const packedOfRole = (role: GarmentRole) => garments.filter((garment) => garment.role === role && others.has(garment.id)).length
  // Being caught out by the weather away from home costs more than one more garment in the suitcase.
  let value = candidate.score - candidate.warnings.length * 12
  for (const garment of candidate.garments) {
    const worn = others.get(garment.id) ?? 0
    if (!worn) {
      value -= rules.newGarment
      if (garment.role === 'Calzado' && packedOfRole('Calzado') >= rules.shoes) value -= 25
      if (garment.role === 'Capa' && packedOfRole('Capa') >= rules.layers) value -= 15
      if (garment.role === 'Accesorio') value -= 4
    }
    const limit = garment.role === 'Top' || garment.role === 'Una pieza' ? rules.wearsPerTop : garment.role === 'Bottom' ? rules.wearsPerBottom : Infinity
    if (worn >= limit) value -= 30 * (worn - limit + 1)
    if ((garment.role === 'Top' || garment.role === 'Una pieza') && previous?.garmentIds.includes(garment.id)) value -= 12
  }
  if (previous && outfitKey(candidate.garments) === [...previous.garmentIds].sort().join('|')) value -= 20
  return value
}

function ranked(garments: Garment[], days: TripDay[], index: number, style: PackingStyle, options: OutfitGenerationOptions) {
  const others = wearCounts(days, index)
  const packed = garments.filter((garment) => others.has(garment.id))
  const candidates = candidatesForDay(garments, days[index]!, packed, options)
  const value = new Map(candidates.map((candidate) => [candidate, tripValue(candidate, others, days[index - 1], garments, PACKING_STYLES[style])]))
  return candidates.sort((a, b) => value.get(b)! - value.get(a)! || outfitKey(a.garments).localeCompare(outfitKey(b.garments)))
}

/** An outfit for each day, sharing garments so the suitcase stays small. Days the user has edited stay as they are. */
export function planDays(garments: Garment[], days: TripDay[], style: PackingStyle, options: OutfitGenerationOptions = {}): TripDay[] {
  const plan = days.map((day) => (day.edited ? day : { ...day, garmentIds: [] }))
  plan.forEach((day, index) => {
    if (day.edited) return
    const [best] = ranked(garments, plan, index, style, options)
    plan[index] = { ...day, garmentIds: best?.garments.map((garment) => garment.id) ?? [] }
  })
  return plan
}

/** Another proposal for a day, the best one not yet seen; undefined when there are no others. */
export function nextOutfitForDay(garments: Garment[], days: TripDay[], index: number, style: PackingStyle, seen: Set<string>, options: OutfitGenerationOptions = {}) {
  return ranked(garments, days, index, style, options).find((candidate) => !seen.has(outfitKey(candidate.garments)))
}

export interface PackingGroup {
  role: GarmentRole
  title: string
  items: Array<{ garment: Garment; days: number }>
}

const GROUPS: Array<[GarmentRole, string]> = [['Capa', 'Abrigos y chaquetas'], ['Top', 'Partes de arriba'], ['Una pieza', 'Vestidos y monos'], ['Bottom', 'Partes de abajo'], ['Calzado', 'Calzado'], ['Accesorio', 'Accesorios']]

/** Each garment once, with how many days it is worn; a garment since deleted drops out. */
export function packingGroups(garments: Garment[], days: TripDay[]): PackingGroup[] {
  const counts = wearCounts(days)
  return GROUPS.flatMap(([role, title]) => {
    const items = garments.filter((garment) => garment.role === role && counts.has(garment.id)).map((garment) => ({ garment, days: counts.get(garment.id)! }))
    return items.length ? [{ role, title, items }] : []
  })
}

export interface WeatherSummary {
  low: number
  high: number
  rainDays: number
  snowDays: number
  windyDays: number
  /** Days that are averages of past years, not a forecast. */
  climateDays: number
  advice: string[]
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

export function summarizeWeather(days: DailyWeather[]): WeatherSummary {
  const low = Math.min(...days.map((day) => day.low ?? day.temperatureCelsius))
  const high = Math.max(...days.map((day) => day.high ?? day.temperatureCelsius))
  const rainDays = days.filter(isRainy).length
  const snowDays = days.filter(isSnowy).length
  const windyDays = days.filter(isWindy).length
  const advice: string[] = []
  if (rainDays) advice.push(`Lluvia ${plural(rainDays, 'día', 'días')}: mejor calzado cerrado y algo que no cale.`)
  if (snowDays) advice.push(`Nieve ${plural(snowDays, 'día', 'días')}: calzado con suela y ropa de abrigo.`)
  if (low <= 5) advice.push(`Frío, hasta ${low} °C: lleva abrigo.`)
  else if (high - low >= 10) advice.push(`Mucha diferencia entre el día y la noche: mejor por capas.`)
  if (high >= 30) advice.push(`Calor, hasta ${high} °C: tejidos frescos.`)
  if (windyDays) advice.push(`Viento ${plural(windyDays, 'día', 'días')}: una capa cortavientos ayuda.`)
  return { low, high, rainDays, snowDays, windyDays, climateDays: days.filter((day) => day.source === 'climate').length, advice }
}

/** What is not in the wardrobe but goes in the suitcase, some of it because of the weather. */
export function defaultExtras(days: DailyWeather[], kind: string): TripExtra[] {
  const nights = days.length
  const hasStrongSun = days.some((day) => (day.uvIndex ?? 0) >= 6 || (day.high ?? 0) >= 28)
  const labels = [
    'Documentación y tarjetas',
    'Cargador del móvil',
    'Neceser',
    `Ropa interior × ${nights + 1}`,
    `Calcetines × ${nights + 1}`,
    'Pijama',
    ...(days.some(isRainy) ? ['Paraguas o chubasquero'] : []),
    ...(hasStrongSun ? ['Gafas de sol', 'Protector solar'] : []),
    ...(kind === 'beach' ? ['Bañador', 'Toalla de playa'] : []),
    ...(kind === 'snow' || days.some((day) => (day.low ?? 10) <= 2) ? ['Guantes y gorro'] : []),
    ...(kind === 'work' ? ['Portátil y cargador'] : [])
  ]
  return labels.map((label) => ({ id: label, label, packed: false }))
}

export interface ForecastChange {
  date: string
  text: string
}

/** What has really changed in the weather since the outfits were chosen. */
export function forecastChanges(before: DailyWeather[], after: DailyWeather[]): ForecastChange[] {
  return after.flatMap((day) => {
    const previous = before.find((item) => item.date === day.date)
    if (!previous) return []
    const parts: string[] = []
    const difference = day.temperatureCelsius - previous.temperatureCelsius
    if (Math.abs(difference) >= 4) parts.push(`de ${previous.temperatureCelsius} a ${day.temperatureCelsius} °C`)
    if (isRainy(day) && !isRainy(previous)) parts.push('ahora con lluvia')
    if (!isRainy(day) && isRainy(previous)) parts.push('ya sin lluvia')
    if (isSnowy(day) && !isSnowy(previous)) parts.push('ahora con nieve')
    return parts.length ? [{ date: day.date, text: parts.join(', ') }] : []
  })
}

/** The list as plain text, to send or keep elsewhere. */
export function packingText(trip: Trip, garments: Garment[], label: (garment: Garment) => string) {
  const groups = packingGroups(garments, trip.days)
  const mark = (packed: boolean) => (packed ? '[x]' : '[ ]')
  return [
    `Maleta para ${trip.place.name} (${trip.startDate} a ${trip.endDate})`,
    ...groups.flatMap((group) => ['', group.title, ...group.items.map(({ garment }) => `${mark(trip.packedIds.includes(garment.id))} ${label(garment)}`)]),
    '',
    'Además',
    ...trip.extras.map((extra) => `${mark(extra.packed)} ${extra.label}`)
  ].join('\n')
}

const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

export function tripDates(trip: Pick<Trip, 'startDate' | 'endDate'>) {
  const format = (day: string) => shortDate.format(new Date(`${day}T12:00:00`))
  return trip.startDate === trip.endDate ? format(trip.startDate) : `${format(trip.startDate)} – ${format(trip.endDate)}`
}
