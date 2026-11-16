import { suggestUsage } from '../ai/usageRules'
import { matchLabel } from '../ml/taxonomy'
import { dressLevels, type DressLevel, type Garment, type GarmentRole, type Outfit, type OutfitFeedback, type OutfitFeedbackType, type Season, type UserPreferences } from '../types/domain'

// The outfit engine: scores a set of garments the way someone dressing would look at it (does it suit the plan, will
// I be warm enough, do the colours go together, have I just worn it, do I like it), searches the wardrobe for the best
// sets, and answers which garment goes best in a slot of the outfit being put together. Everything runs on the device.

export type OutfitTemplate = 'Diario' | 'Arreglado' | 'Formal' | 'Deportivo' | 'Frío y capas' | 'Calor y pocas capas'

export interface OutfitContext {
  occasion: string
  desiredStyle?: string
  temperatureCelsius?: number
  /** The day's range: a warm afternoon can have a cool morning. */
  temperatureLow?: number
  temperatureHigh?: number
  weatherConditions?: string[]
  /** The season now, for when there is no forecast: no shorts in November just because the weather is unknown. */
  season?: Season
  includeGarmentIds?: string[]
  excludeGarmentIds?: string[]
}

export interface OutfitCandidate {
  garments: Garment[]
  score: number
  scores: {
    occasion: number
    visualStyle: number
    thermal: number
    preference: number
    rotation: number
  }
  /** Why this outfit, in the user's words; only what is true of it. */
  explanation: string[]
  /** What may not work, such as being too warm for the day. */
  warnings: string[]
}

/** Garments worn on a day. */
export interface WearEvent {
  garmentIds: string[]
  at: string
}

export interface OutfitGenerationOptions {
  preferences?: UserPreferences
  /** Outfits just proposed, most recent first, so a trip does not repeat itself. */
  recentOutfits?: Outfit[]
  feedback?: OutfitFeedback[]
  /** What has been worn, to rest what was worn lately and bring back what has been forgotten. */
  wear?: WearEvent[]
  limit?: number
  /** Combinations not to propose (outfitKey), so asking again gives other ones. */
  skip?: Set<string>
  /** A different seed gives a slightly different order among similar outfits: today's is not yesterday's. */
  seed?: string
  now?: Date
}

export const OUTFIT_SCORE_WEIGHTS = {
  occasion: 0.25,
  visualStyle: 0.25,
  thermal: 0.25,
  preference: 0.13,
  rotation: 0.12
} as const

const TEMPLATE_LEVEL: Record<OutfitTemplate, DressLevel | undefined> = {
  Diario: 'Diario',
  Arreglado: 'Arreglado',
  Formal: 'Formal',
  Deportivo: 'Deportivo',
  'Frío y capas': undefined,
  'Calor y pocas capas': undefined
}

// The garments of each role that enter the search, chosen by rankForRole; the rest wait their turn. Their product,
// about 1800 combinations, keeps generating instant on a phone with any wardrobe.
const MAX_PER_ROLE: Record<GarmentRole, number> = { Top: 7, Bottom: 7, 'Una pieza': 7, Capa: 3, Calzado: 3, Accesorio: 2 }
const MAX_RESULTS = 5
const DAY = 86_400_000
const FEEDBACK_HALF_LIFE_DAYS = 60

function normalize(value: string) {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function isAvailable(garment: Garment) {
  return garment.availability !== 'laundry' && garment.availability !== 'unavailable'
}

// Warmth

/** How much each type of garment warms, in rough units: a T-shirt is 1, a down jacket 5. */
const WARMTH: Record<string, number> = {
  'camiseta-tirantes': 0.5, top: 0.6, camiseta: 1, polo: 1.2, blusa: 1.2, 'prenda-deportiva': 1, 'camiseta-manga-larga': 1.5, camisa: 1.5,
  sudadera: 3, 'sudadera-capucha': 3.2, jersey: 3.5,
  'pantalon-corto': 0.5, falda: 1, leggings: 1.2, medias: 0.8, vaqueros: 2, pantalon: 2, 'pantalon-chandal': 2.2,
  vestido: 1.5, mono: 2,
  chaleco: 1.5, chubasquero: 1.5, cardigan: 1.8, blazer: 2, chaqueta: 2.5, abrigo: 4.5, plumifero: 5,
  chanclas: 0, sandalias: 0, zuecos: 0.3, tacones: 0.3, zapatillas: 0.4, zapatos: 0.4, botas: 0.8,
  bufanda: 0.5, gorro: 0.4
}
const WARMTH_BY_ROLE: Record<GarmentRole, number> = { Top: 1.5, Bottom: 2, 'Una pieza': 1.8, Capa: 2.5, Calzado: 0.4, Accesorio: 0 }
const WARM_FIBRES = /lana|cachemira|alpaca|mohair|plumón|pluma/i
const COOL_FIBRES = /lino|seda/i
const OPEN_SHOES = new Set(['sandalias', 'chanclas'])
const RAIN_LAYERS = new Set(['chubasquero', 'abrigo', 'plumifero'])

const subcategoryId = (garment: Garment) => matchLabel('subcategory', garment.subcategory)

function warmth(garment: Garment) {
  const base = WARMTH[subcategoryId(garment) ?? ''] ?? WARMTH_BY_ROLE[garment.role]
  const fibres = garment.composition ?? ''
  return base + (WARM_FIBRES.test(fibres) ? 0.5 : COOL_FIBRES.test(fibres) ? -0.3 : 0)
}

/** The warmth to wear at a temperature: about a T-shirt and shorts at 30 °C, a coat over a jumper at 0 °C. */
function warmthNeeded(temperature: number) {
  return Math.max(1.2, 9 - temperature * 0.25)
}

/** The temperature to dress for: the forecast, or what the plan or the season suggest. */
function dressingTemperature(context: OutfitContext): number | undefined {
  if (context.occasion === 'Frío y capas') return Math.min(context.temperatureCelsius ?? 5, 8)
  if (context.occasion === 'Calor y pocas capas') return Math.max(context.temperatureCelsius ?? 28, 25)
  if (context.temperatureCelsius !== undefined) return context.temperatureCelsius
  return context.season ? { Invierno: 8, Primavera: 17, Otoño: 15, Verano: 27 }[context.season] : undefined
}

function hasRain(context: OutfitContext) {
  return (context.weatherConditions ?? []).some((condition) => /lluvia|llovizna|chubasco|tormenta|nieve/.test(normalize(condition)))
}

/** How warm the outfit is to wear: on a day that cools down a layer spends most of the day in the hand. */
function wornWarmth(garments: Garment[], context: OutfitContext) {
  const carried = coolsDown(context) ? 0.3 : 1
  return garments.reduce((sum, garment) => sum + warmth(garment) * (garment.role === 'Capa' ? carried : 1), 0)
}

function thermalScore(garments: Garment[], context: OutfitContext) {
  const temperature = dressingTemperature(context)
  let score = 72
  if (temperature !== undefined) {
    const difference = wornWarmth(garments, context) - warmthNeeded(temperature)
    // Being cold is worse than being warm: a layer can come off.
    score = 100 - Math.abs(difference) * (difference < 0 ? 24 : 18)
  }
  if (hasRain(context)) {
    if (garments.some((garment) => RAIN_LAYERS.has(subcategoryId(garment) ?? ''))) score += 8
    if (garments.some((garment) => OPEN_SHOES.has(subcategoryId(garment) ?? ''))) score -= 20
  }
  const signals = (context.weatherConditions ?? []).map(normalize)
  if (signals.some((condition) => condition.includes('viento'))) score += garments.some((garment) => garment.role === 'Capa') ? 8 : -8
  if (coolsDown(context)) score += garments.some((garment) => garment.role === 'Capa') ? 6 : -6
  return Math.max(0, Math.min(100, score))
}

/** A day that starts or ends cool even if it warms up: something to take off beats being cold. */
function coolsDown(context: OutfitContext) {
  const { temperatureLow: low, temperatureHigh: high } = context
  return low !== undefined && high !== undefined && low <= 14 && high - low >= 7
}

// The occasion is what the user asked for: «Frío y capas» on a hot day still means layers, and the other way round.
function isWarmOutfit(context: OutfitContext) {
  if (context.occasion === 'Frío y capas') return false
  return context.occasion === 'Calor y pocas capas' || (context.temperatureCelsius !== undefined && context.temperatureCelsius >= 25 && !coolsDown(context))
}

/** The season of a date (northern hemisphere). */
export function seasonOfDate(date: Date): Season {
  const month = date.getMonth()
  return month < 2 || month === 11 ? 'Invierno' : month < 5 ? 'Primavera' : month < 8 ? 'Verano' : 'Otoño'
}

/** The seasons whose clothes suit this context, or undefined when nothing says. */
function suitableSeasons(context: OutfitContext): Season[] | undefined {
  if (context.occasion === 'Frío y capas') return ['Invierno', 'Otoño']
  if (context.occasion === 'Calor y pocas capas') return ['Verano']
  const temperature = context.temperatureCelsius
  if (temperature !== undefined) {
    return temperature >= 25 ? ['Verano'] : temperature <= 8 ? ['Invierno'] : temperature < 16 ? ['Otoño', 'Primavera', 'Invierno'] : ['Primavera', 'Otoño', 'Verano']
  }
  if (context.season === 'Invierno') return ['Invierno', 'Otoño']
  if (context.season === 'Verano') return ['Verano', 'Primavera']
  return context.season ? ['Primavera', 'Otoño', context.season === 'Otoño' ? 'Invierno' : 'Verano'] : undefined
}

/** The garment's seasons; for one saved without them, those its type suggests (a hoodie is not for summer). */
function garmentSeasons(garment: Garment): Season[] {
  return garment.seasons.length ? garment.seasons : suggestUsage({ category: garment.category, subcategory: garment.subcategory }).seasons
}

// Colours

const NEUTRALS = new Set(['negro', 'blanco', 'gris', 'gris claro', 'beige', 'crema', 'camel', 'marron', 'azul marino'])
const HUES: Record<string, number> = { rojo: 0, naranja: 30, amarillo: 55, verde: 130, azul: 215, morado: 275, rosa: 335 }
/** Neutrals that sit too close to look intended. */
const DULL_PAIRS = [['negro', 'azul marino'], ['negro', 'marron'], ['azul marino', 'marron']]

function hueDistance(first: string, second: string) {
  const distance = Math.abs((HUES[first] ?? 0) - (HUES[second] ?? 0))
  return Math.min(distance, 360 - distance)
}

/** How the main colours of the garments go together, and what to say about it. */
function colorHarmony(garments: Garment[]): { score: number; reason: string } {
  const main = garments.map((garment) => normalize(garment.colors[0] ?? '')).filter(Boolean)
  if (main.length < 2) return { score: 70, reason: '' }
  const accents = main.filter((color) => !NEUTRALS.has(color))
  const distinct = [...new Set(accents)]
  // A secondary colour that picks up another garment's main one ties the outfit together.
  const echoes = garments.some((garment) => garment.colors.slice(1).some((color) => main.includes(normalize(color)) && !NEUTRALS.has(normalize(color))))
  const echo = echoes ? 4 : 0
  if (distinct.includes('multicolor')) return distinct.length === 1 && accents.length === 1 ? { score: 88, reason: 'Una prenda protagonista' } : { score: 55, reason: '' }
  if (!distinct.length) {
    const unique = new Set(main)
    const dull = DULL_PAIRS.some(([first, second]) => unique.has(first!) && unique.has(second!))
    if (dull) return { score: 70, reason: '' }
    return unique.size === 1 ? { score: 76, reason: 'Todo en un mismo tono' } : { score: 84, reason: 'Neutros que combinan' }
  }
  if (distinct.length === 1) return accents.length === 1 ? { score: 94, reason: 'Un color protagonista' } : { score: 84 + echo, reason: 'Tonos de un mismo color' }
  if (distinct.length === 2) {
    const distance = hueDistance(distinct[0]!, distinct[1]!)
    if (distance <= 45) return { score: 82 + echo, reason: 'Colores vecinos' }
    if (distance >= 150) return { score: 74 + echo, reason: 'Colores complementarios' }
    return { score: 58 + echo, reason: '' }
  }
  return { score: 44, reason: '' }
}

function styleCompatibility(garments: Garment[], desiredStyle?: string) {
  const styles = garments.flatMap((garment) => garment.styles.map(normalize))
  const defined = new Set(styles)
  let score = defined.size === 0 ? 72 : defined.size === 1 && styles.length > 1 ? 92 : styles.length > defined.size ? 84 : 66
  if (desiredStyle) {
    const target = normalize(desiredStyle)
    const known = garments.filter((garment) => garment.styles.length > 0)
    if (known.length) score = (score + known.filter((garment) => garment.styles.some((style) => normalize(style) === target)).length / known.length * 100) / 2
  }
  return score
}

/** One print with plain garments is the safe combination; the same print twice is bold, two different ones clash. */
function patternCompatibility(garments: Garment[]) {
  const patterns = garments.map((garment) => normalize(garment.pattern ?? '')).filter(Boolean)
  if (patterns.length < 2) return 68
  const prints = patterns.filter((pattern) => pattern !== 'liso')
  if (prints.length < 2) return 88
  return new Set(prints).size === 1 ? 70 : 48
}

// Occasion

/** 100 when the garment suits the level, 62 one step away (Diario for Arreglado), 35 further; 72 when unknown. */
function levelFit(garment: Garment, target: DressLevel) {
  if (!garment.dressLevels.length) return 72
  const distance = Math.min(...garment.dressLevels.map((level) => Math.abs(dressLevels.indexOf(level) - dressLevels.indexOf(target))))
  return distance === 0 ? 100 : distance === 1 ? 62 : 35
}

/** Whether the garments belong together: tracksuit bottoms and heels share no level. */
function levelCoherence(garments: Garment[]) {
  const known = garments.filter((garment) => garment.dressLevels.length)
  if (known.length < 2) return 80
  if (dressLevels.some((level) => known.every((garment) => garment.dressLevels.includes(level)))) return 96
  const lows = known.map((garment) => Math.max(...garment.dressLevels.map((level) => dressLevels.indexOf(level))))
  const highs = known.map((garment) => Math.min(...garment.dressLevels.map((level) => dressLevels.indexOf(level))))
  return Math.max(...highs) - Math.min(...lows) <= 1 ? 72 : 40
}

function occasionScore(garments: Garment[], context: OutfitContext) {
  const coherence = levelCoherence(garments)
  const target = TEMPLATE_LEVEL[context.occasion as OutfitTemplate]
  if (!target || !garments.length) return 50 + coherence * 0.45
  const fits = garments.map((garment) => levelFit(garment, target))
  // The garment that fits worst counts: one out-of-place piece spoils the outfit.
  const fit = fits.reduce((sum, value) => sum + value, 0) / fits.length * 0.6 + Math.min(...fits) * 0.4
  return fit * 0.75 + coherence * 0.25
}

// Taste

function eventWeight(event: OutfitFeedback, now: number) {
  const age = Math.max(0, now - Date.parse(event.createdAt)) / DAY
  const strength = event.type === 'saved' ? 1.2 : event.type === 'like' ? 1 : event.type === 'worn' ? 0.6 : event.type === 'dislike' ? -1 : 0
  return strength * 0.5 ** (age / FEEDBACK_HALF_LIFE_DAYS)
}

function preferenceScore(garments: Garment[], options: OutfitGenerationOptions) {
  const feedback = options.feedback ?? []
  const now = (options.now ?? new Date()).getTime()
  const ids = garments.map((garment) => garment.id)
  let signal = 0
  for (const event of feedback) {
    const weight = eventWeight(event, now)
    if (!weight) continue
    const present = ids.filter((id) => event.garmentIds.includes(id)).length
    // What went together counts for the pair: disliking an outfit says little about each garment alone.
    signal += weight * (present / Math.max(1, ids.length)) * (weight < 0 ? 4 : 6)
    if (present >= 2) signal += weight * (present - 1) * 8
  }
  let score = 55 + signal
  const preferences = options.preferences
  if (preferences) {
    for (const garment of garments) {
      if (preferences.preferredColors.length && garment.colors.length) {
        score += garment.colors.some((color) => preferences.preferredColors.some((preferred) => normalize(color) === normalize(preferred))) ? 5 : -2
      }
      if (preferences.preferredStyles.length && garment.styles.length) {
        score += garment.styles.some((style) => preferences.preferredStyles.some((preferred) => normalize(style) === normalize(preferred))) ? 5 : -2
      }
      if (preferences.preferredDressLevel && garment.dressLevels.length) score += garment.dressLevels.includes(preferences.preferredDressLevel) ? 4 : -2
    }
  }
  return Math.max(0, Math.min(100, score))
}

/** Days since each garment was last worn. */
function lastWorn(options: OutfitGenerationOptions) {
  const now = (options.now ?? new Date()).getTime()
  const days = new Map<string, number>()
  for (const event of options.wear ?? []) {
    const age = Math.max(0, now - Date.parse(event.at)) / DAY
    for (const id of event.garmentIds) if (!days.has(id) || age < days.get(id)!) days.set(id, age)
  }
  return days
}

function rotationScore(garments: Garment[], options: OutfitGenerationOptions) {
  const worn = lastWorn(options)
  const now = (options.now ?? new Date()).getTime()
  let score = 80
  for (const garment of garments) {
    const days = worn.get(garment.id)
    if (days === undefined) continue
    // Fewer points for accessories and shoes: nobody minds repeating them.
    const weight = garment.role === 'Calzado' || garment.role === 'Accesorio' ? 0.4 : 1
    score += (days < 1.5 ? -22 : days < 3.5 ? -12 : days < 7.5 ? -5 : days > 21 ? 5 : 0) * weight
  }
  const key = outfitKey(garments)
  if ((options.wear ?? []).some((event) => [...event.garmentIds].sort().join('|') === key && now - Date.parse(event.at) < 14 * DAY)) score -= 25
  // A plan in the making (a trip): the days just proposed.
  const ids = new Set(garments.map((garment) => garment.id))
  const recent = (options.recentOutfits ?? []).slice(0, 12)
  const match = recent.findIndex((outfit) => outfit.garmentIds.length === ids.size && outfit.garmentIds.every((id) => ids.has(id)))
  if (match >= 0) score -= Math.max(0, 50 - match * 6)
  score -= Math.min(20, recent.reduce((count, outfit) => count + outfit.garmentIds.filter((id) => ids.has(id)).length, 0) / Math.max(1, garments.length) * 2)
  return Math.max(0, Math.min(100, score))
}

// The whole outfit

function climateNotes(garments: Garment[], context: OutfitContext, thermal: number) {
  const reasons: string[] = []
  const warnings: string[] = []
  const temperature = context.temperatureCelsius
  const at = temperature !== undefined ? ` a ${temperature} °C` : ''
  const target = dressingTemperature(context)
  if (target !== undefined) {
    const difference = wornWarmth(garments, context) - warmthNeeded(target)
    if (difference > 1.5) warnings.push(`Puede darte calor${at}`)
    else if (difference < -1.5) warnings.push(`Puede darte frío${at}`)
    else if (temperature !== undefined && thermal >= 70) reasons.push(`Bien para ${temperature} °C`)
  }
  if (hasRain(context)) {
    if (garments.some((garment) => RAIN_LAYERS.has(subcategoryId(garment) ?? ''))) reasons.push('Preparado para la lluvia')
    if (garments.some((garment) => OPEN_SHOES.has(subcategoryId(garment) ?? ''))) warnings.push('Calzado abierto con lluvia')
  }
  if (coolsDown(context)) {
    const range = `de ${context.temperatureLow} a ${context.temperatureHigh} °C`
    if (garments.some((garment) => garment.role === 'Capa')) reasons.push(`Con capa para un día ${range}`)
    else warnings.push(`Sin capa para un día ${range}`)
  }
  return { reasons, warnings }
}

/** Scores any set of garments, generated or put together by the user. */
export function scoreOutfit(garments: Garment[], context: OutfitContext, options: OutfitGenerationOptions = {}): OutfitCandidate {
  const harmony = colorHarmony(garments)
  const patterns = patternCompatibility(garments)
  const scores = {
    occasion: occasionScore(garments, context),
    visualStyle: harmony.score * 0.5 + styleCompatibility(garments, context.desiredStyle) * 0.2 + patterns * 0.3,
    thermal: thermalScore(garments, context),
    preference: preferenceScore(garments, options),
    rotation: rotationScore(garments, options)
  }
  const score = Math.round((Object.keys(OUTFIT_SCORE_WEIGHTS) as Array<keyof typeof OUTFIT_SCORE_WEIGHTS>).reduce((total, key) => total + scores[key] * OUTFIT_SCORE_WEIGHTS[key], 0) * 10) / 10
  const climate = climateNotes(garments, context, scores.thermal)
  const worn = lastWorn(options)
  const forgotten = garments.find((garment) => (worn.get(garment.id) ?? 0) > 21 && garment.role !== 'Accesorio')
  const justWorn = garments.find((garment) => (worn.get(garment.id) ?? 99) < 3.5 && (garment.role === 'Top' || garment.role === 'Bottom' || garment.role === 'Una pieza'))
  const explanation = [
    TEMPLATE_LEVEL[context.occasion as OutfitTemplate] && scores.occasion >= 80 ? `Encaja con ${context.occasion.toLocaleLowerCase('es')}` : '',
    context.occasion === 'Frío y capas' && garments.some((garment) => garment.role === 'Capa') ? 'Lleva capa de abrigo' : '',
    ...climate.reasons,
    harmony.reason,
    patterns === 88 ? 'Un solo estampado' : '',
    context.desiredStyle && garments.some((garment) => garment.styles.some((style) => normalize(style) === normalize(context.desiredStyle!))) ? `Estética ${context.desiredStyle.toLocaleLowerCase('es')}` : '',
    forgotten ? 'Recupera una prenda que hace tiempo que no usas' : ''
  ].filter(Boolean)
  const warnings = [
    ...climate.warnings,
    levelCoherence(garments) <= 40 ? 'Mezcla prendas de estilos muy distintos' : '',
    justWorn ? `Llevaste ${justWorn.subcategory ? justWorn.subcategory.toLocaleLowerCase('es') : 'esta prenda'} hace poco` : ''
  ].filter(Boolean)
  return { garments, score, scores, explanation, warnings }
}

/** The score in words: three digits would promise more precision than rules like these have. */
export function fitLabel(score: number) {
  return score >= 82 ? 'Encaje excelente' : score >= 72 ? 'Muy buen encaje' : score >= 60 ? 'Buen encaje' : 'Encaje justo'
}

function fitsFormal(garment: Garment) {
  return !garment.dressLevels.length || garment.dressLevels.includes('Formal')
}

/** Identifies a combination of garments, whatever their order. */
export function outfitKey(garments: Garment[]): string {
  return garments.map((garment) => garment.id).sort().join('|')
}

function tally(idLists: string[][]) {
  const counts = new Map<string, number>()
  for (const ids of idLists) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/** A small repeatable number for a text, to vary the order from one day to the next. */
function jitter(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return (Math.abs(hash) % 1000) / 1000
}

/**
 * Who gets a place in the search: what suits the occasion, what the user likes, and what has not been worn lately or
 * shown already, so that asking again reaches the whole wardrobe.
 */
function rankForRole(garment: Garment, context: OutfitContext, options: OutfitGenerationOptions, shown: Map<string, number>, worn: Map<string, number>) {
  const target = TEMPLATE_LEVEL[context.occasion as OutfitTemplate]
  const wanted = context.desiredStyle && garment.styles.some((style) => normalize(style) === normalize(context.desiredStyle!))
  const days = worn.get(garment.id)
  return (target ? levelFit(garment, target) : 72)
    + (wanted ? 30 : 0)
    + (options.feedback ?? []).reduce((sum, event) => sum + (event.garmentIds.includes(garment.id) ? eventWeight(event, (options.now ?? new Date()).getTime()) * 8 : 0), 0)
    - (days === undefined ? 0 : days < 3.5 ? 25 : days < 7.5 ? 8 : 0)
    - (shown.get(garment.id) ?? 0) * 12
    + (options.seed ? jitter(options.seed + garment.id) * 10 : 0)
}

export function generateOutfitCandidates(allGarments: Garment[], context: OutfitContext, options: OutfitGenerationOptions = {}): OutfitCandidate[] {
  const excludedIds = new Set(context.excludeGarmentIds ?? [])
  const includedIds = new Set(context.includeGarmentIds ?? [])
  if ([...includedIds].some((id) => excludedIds.has(id))) return []
  const garments = allGarments.filter((garment) => !excludedIds.has(garment.id) && (isAvailable(garment) || includedIds.has(garment.id)))
  if ([...includedIds].some((id) => !garments.some((garment) => garment.id === id))) return []

  // Out of season only when known and there is something else to wear for that role; a pinned garment always stays.
  const seasons = suitableSeasons(context)
  const inSeason = (garment: Garment) => {
    const known = garmentSeasons(garment)
    return !seasons || !known.length || known.some((season) => seasons.includes(season))
  }
  const shown = tally([...(options.skip ?? [])].map((key) => key.split('|')))
  const worn = lastWorn(options)
  const disliked = new Set((options.feedback ?? []).filter((event) => event.type === 'dislike').map((event) => [...event.garmentIds].sort().join('|')))
  const byRole = (role: GarmentRole) => {
    const ofRole = garments.filter((garment) => garment.role === role)
    const suitable = ofRole.filter((garment) => includedIds.has(garment.id) || inSeason(garment))
    const pool = suitable.length ? suitable : ofRole
    const rank = new Map(pool.map((garment) => [garment.id, rankForRole(garment, context, options, shown, worn)]))
    const sorted = [...pool].sort((a, b) => Number(includedIds.has(b.id)) - Number(includedIds.has(a.id)) || rank.get(b.id)! - rank.get(a.id)! || a.id.localeCompare(b.id))
    return sorted.slice(0, Math.max(MAX_PER_ROLE[role], sorted.filter((item) => includedIds.has(item.id)).length))
  }
  const tops = byRole('Top')
  const bottoms = byRole('Bottom')
  const onePieces = byRole('Una pieza')
  const layers = byRole('Capa')
  const shoes = byRole('Calzado')
  const accessories = byRole('Accesorio')
  const hasPinnedRole = (role: GarmentRole) => garments.some((garment) => includedIds.has(garment.id) && garment.role === role)
  const candidates: OutfitCandidate[] = []
  const seen = new Set<string>()

  const add = (base: Garment[], layer?: Garment, shoe?: Garment, accessory?: Garment) => {
    const selected = [...base, layer, shoe, accessory].filter((item): item is Garment => Boolean(item))
    // What the user pins is respected; the rules below are about what Molt proposes on its own.
    const proposed = selected.filter((item) => !includedIds.has(item.id))
    if (context.occasion === 'Formal' && proposed.some((item) => !fitsFormal(item))) return
    if (isWarmOutfit(context) && proposed.some((item) => item.role === 'Capa')) return
    if ([...includedIds].some((id) => !selected.some((garment) => garment.id === id))) return
    const key = outfitKey(selected)
    if (seen.has(key) || options.skip?.has(key) || disliked.has(key)) return
    seen.add(key)
    candidates.push(scoreOutfit(selected, context, options))
  }

  const optional = (base: Garment[]) => {
    // Layers are optional, and warmth decides: only «Frío y capas» insists on one.
    const layerOptions: Array<Garment | undefined> = hasPinnedRole('Capa')
      ? layers.filter((layer) => includedIds.has(layer.id))
      : context.occasion === 'Frío y capas' ? layers
        : isWarmOutfit(context) ? [undefined] : [undefined, ...layers]
    // An outfit is not finished without shoes: when there are any that suit it, it wears them.
    const suitableShoes = context.occasion === 'Formal' ? shoes.filter(fitsFormal) : shoes
    const shoeOptions: Array<Garment | undefined> = hasPinnedRole('Calzado')
      ? shoes.filter((shoe) => includedIds.has(shoe.id))
      : suitableShoes.length ? suitableShoes : [undefined]
    const accessoryOptions: Array<Garment | undefined> = hasPinnedRole('Accesorio')
      ? accessories.filter((item) => includedIds.has(item.id))
      : [undefined, ...accessories]
    for (const layer of layerOptions) {
      for (const shoe of shoeOptions) {
        for (const accessory of accessoryOptions) add(base, layer, shoe, accessory)
      }
    }
  }

  const requiresOnePiece = hasPinnedRole('Una pieza') && (hasPinnedRole('Top') || hasPinnedRole('Bottom'))
  if (!requiresOnePiece) {
    for (const top of tops) {
      for (const bottom of bottoms) optional([top, bottom])
    }
  }
  if (!hasPinnedRole('Top') && !hasPinnedRole('Bottom')) {
    for (const onePiece of onePieces) optional([onePiece])
  }
  return pickVaried(candidates, Math.max(1, Math.min(options.limit ?? MAX_RESULTS, MAX_RESULTS)), shown, options.seed)
}

/**
 * The best outfits that also differ from each other: each pick weighs its score against how many of its garments are
 * already in the list and how often they have been shown, or the list reads as one outfit five times.
 */
function pickVaried(candidates: OutfitCandidate[], limit: number, shown: Map<string, number>, seed?: string) {
  const base = new Map(candidates.map((candidate) => [
    candidate,
    candidate.score
      - candidate.garments.reduce((sum, garment) => sum + (shown.get(garment.id) ?? 0), 0) * 3
      + (seed ? jitter(seed + outfitKey(candidate.garments)) * 2 : 0)
  ]))
  const used = new Map<string, number>()
  const picked: OutfitCandidate[] = []
  const remaining = [...candidates].sort((a, b) => base.get(b)! - base.get(a)! || outfitKey(a.garments).localeCompare(outfitKey(b.garments)))
  while (picked.length < limit && remaining.length) {
    let best = 0
    let bestValue = -Infinity
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      const overlap = candidate.garments.reduce((sum, garment) => sum + (used.get(garment.id) ?? 0) * (garment.role === 'Top' || garment.role === 'Bottom' || garment.role === 'Una pieza' ? 9 : 4), 0)
      const value = base.get(candidate)! - overlap
      if (value > bestValue) {
        bestValue = value
        best = index
      }
    }
    const [chosen] = remaining.splice(best, 1)
    picked.push(chosen!)
    for (const garment of chosen!.garments) used.set(garment.id, (used.get(garment.id) ?? 0) + 1)
  }
  return picked
}

/** The outfit with this garment in its place: same role replaced; a dress takes the place of a top and a bottom. */
export function withGarment(outfit: Garment[], garment: Garment): Garment[] {
  const replaced = (item: Garment) => item.role === garment.role
    || (garment.role === 'Una pieza' && (item.role === 'Top' || item.role === 'Bottom'))
    || ((garment.role === 'Top' || garment.role === 'Bottom') && item.role === 'Una pieza')
  return [...outfit.filter((item) => !replaced(item)), garment]
}

export interface GarmentOption {
  garment: Garment
  candidate: OutfitCandidate
}

/** The garments that could take a role in this outfit, best first: what the picker shows and «cambiar» goes through. */
export function optionsForRole(role: GarmentRole, outfit: Garment[], allGarments: Garment[], context: OutfitContext, options: OutfitGenerationOptions = {}): GarmentOption[] {
  return allGarments
    .filter((garment) => garment.role === role && isAvailable(garment) && !outfit.some((item) => item.id === garment.id))
    .map((garment) => ({ garment, candidate: scoreOutfit(withGarment(outfit, garment), context, options) }))
    .sort((a, b) => b.candidate.score - a.candidate.score || a.garment.id.localeCompare(b.garment.id))
}

/** Why there is nothing to propose, in terms of what the user can change. */
export function explainNoOutfits(allGarments: Garment[], context: OutfitContext): string {
  const garments = allGarments.filter((garment) => isAvailable(garment) && !context.excludeGarmentIds?.includes(garment.id))
  const count = (role: GarmentRole, items = garments) => items.filter((garment) => garment.role === role).length
  const pinned = allGarments.filter((garment) => context.includeGarmentIds?.includes(garment.id))
  const pinnedConflict = (['Top', 'Bottom', 'Calzado', 'Capa', 'Accesorio', 'Una pieza'] as GarmentRole[]).some((role) => count(role, pinned) > 1)
    || (pinned.some((garment) => garment.role === 'Una pieza') && pinned.some((garment) => garment.role === 'Top' || garment.role === 'Bottom'))
  if (pinnedConflict) return 'Las prendas fijadas no pueden ir juntas en un mismo outfit. Suelta alguna.'
  const offered = (role: GarmentRole) => context.occasion === 'Formal' ? garments.filter((garment) => garment.role === role && fitsFormal(garment)).length : count(role)
  if (context.occasion === 'Formal' && !offered('Una pieza') && (!offered('Top') || !offered('Bottom'))) return 'Para un outfit formal hacen falta prendas marcadas como «Formal»: una parte de arriba y una de abajo, o un vestido. Puedes marcarlas en el Estilo de cada prenda.'
  if (!offered('Una pieza') && (!offered('Top') || !offered('Bottom'))) return 'Hace falta al menos una parte de arriba y una de abajo disponibles, o un vestido. Revisa las que están en la lavadora.'
  if (context.occasion === 'Frío y capas' && !count('Capa')) return 'Para este plan hace falta una capa de abrigo disponible, y ahora no hay ninguna.'
  return 'No quedan combinaciones con estas condiciones. Suelta alguna prenda fijada o prueba otro plan.'
}

export function createOutfitRecord(candidate: Pick<OutfitCandidate, 'garments' | 'score'>, context: OutfitContext, now = new Date().toISOString()): Outfit {
  return {
    id: crypto.randomUUID(),
    garmentIds: candidate.garments.map((garment) => garment.id),
    occasion: context.occasion,
    kind: 'generated',
    weather: context.temperatureCelsius === undefined && !context.weatherConditions?.length
      ? undefined
      : { temperatureCelsius: context.temperatureCelsius, conditions: context.weatherConditions },
    score: candidate.score,
    createdAt: now,
    favorite: false
  }
}

export function createOutfitFeedback(
  type: OutfitFeedbackType,
  garmentIds: string[],
  outfitId?: string,
  now = new Date().toISOString()
): OutfitFeedback {
  return { id: crypto.randomUUID(), type, garmentIds: [...new Set(garmentIds)], outfitId, createdAt: now }
}
