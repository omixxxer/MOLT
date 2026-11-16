import { seasonOfDate } from '../outfits/outfitGenerator'
import type { Garment, Outfit, OutfitFeedback } from '../types/domain'

/** What was worn on one day: the calendar and the statistics are both read from these. */
export interface WearEntry {
  key: string
  /** Local day, YYYY-MM-DD. */
  day: string
  at: string
  garmentIds: string[]
  outfitId?: string
}

export interface GarmentUse {
  garment: Garment
  wears: number
  lastWorn?: string
}

export interface StatRow {
  label: string
  /** How many of the wardrobe, what the bar measures. */
  count: number
  /** How many wearings in the period. */
  wears: number
}

export interface WardrobeGap {
  title: string
  detail: string
}

export interface WardrobeStats {
  wears: number
  daysLogged: number
  /** Garments worn at least once in the period, of those in the wardrobe. */
  usedGarments: number
  mostWorn: GarmentUse[]
  forgotten: GarmentUse[]
  colors: StatRow[]
  brands: StatRow[]
  categories: StatRow[]
  cost: {
    /** Garments with a price. */
    priced: number
    total: number
    /** Spent per wearing, over everything worn with a price; undefined until something has been worn. */
    perWear?: number
    /** Priced garments, the cheapest per wearing first. */
    garments: Array<GarmentUse & { price: number; perWear: number }>
  }
}

const DAY = 86_400_000
/** Worn this long ago, or never: a garment worth remembering. */
export const FORGOTTEN_AFTER_DAYS = 30
const MAX_ROWS = 6

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function daysBetween(from: string, to: Date) {
  return Math.floor((to.getTime() - Date.parse(from)) / DAY)
}

function entryKey(day: string, garmentIds: string[]) {
  return `${day}:${[...garmentIds].sort().join('|')}`
}

/**
 * One entry per outfit and day, newest first. Wearings are feedback events; an outfit's wornAt adds those recorded
 * without one, such as a saved look. Deleting an outfit from the list keeps its days in the history.
 */
export function wearEntries(outfits: Outfit[], feedback: OutfitFeedback[]): WearEntry[] {
  const entries = new Map<string, WearEntry>()
  const add = (garmentIds: string[], at: string, outfitId?: string) => {
    const day = localDay(new Date(at))
    const key = entryKey(day, garmentIds)
    const known = entries.get(key)
    if (!known) entries.set(key, { key, day, at, garmentIds, outfitId })
    else if (!known.outfitId) known.outfitId = outfitId
  }
  for (const event of feedback) if (event.type === 'worn') add(event.garmentIds, event.createdAt, event.outfitId)
  for (const outfit of outfits) if (outfit.wornAt) add(outfit.garmentIds, outfit.wornAt, outfit.id)
  return [...entries.values()].sort((a, b) => b.at.localeCompare(a.at))
}

/** Each garment with how often it was worn in these entries and when it was last worn. */
function usesOf(garments: Garment[], entries: WearEntry[]) {
  const uses = new Map<string, GarmentUse>(garments.map((garment) => [garment.id, { garment, wears: 0 }]))
  for (const entry of entries) {
    for (const id of new Set(entry.garmentIds)) {
      const use = uses.get(id)
      if (!use) continue
      use.wears += 1
      if (!use.lastWorn || entry.at > use.lastWorn) use.lastWorn = entry.at
    }
  }
  return uses
}

/** Garments not worn for a while or never, those waiting longest first; what is put away does not count. */
export function forgottenGarments(garments: Garment[], entries: WearEntry[], now = new Date()): GarmentUse[] {
  const waiting = (use: GarmentUse) => daysBetween(use.lastWorn ?? use.garment.createdAt, now)
  return [...usesOf(garments, entries).values()]
    .filter((use) => use.garment.availability !== 'unavailable' && (!use.lastWorn || waiting(use) >= FORGOTTEN_AFTER_DAYS))
    .sort((a, b) => waiting(b) - waiting(a))
}

function rows(garments: Garment[], uses: Map<string, GarmentUse>, valuesOf: (garment: Garment) => string[]) {
  const found = new Map<string, StatRow>()
  for (const garment of garments) {
    for (const label of new Set(valuesOf(garment))) {
      const row = found.get(label) ?? { label, count: 0, wears: 0 }
      row.count += 1
      row.wears += uses.get(garment.id)?.wears ?? 0
      found.set(label, row)
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || b.wears - a.wears || a.label.localeCompare(b.label, 'es'))
}

/** The statistics of the last `days` days, or of everything; cost per wearing always counts every wearing. */
export function wardrobeStats(garments: Garment[], entries: WearEntry[], days?: number, now = new Date()): WardrobeStats {
  const inPeriod = days === undefined ? entries : entries.filter((entry) => {
    const age = daysBetween(entry.at, now)
    return age < days
  })
  const uses = usesOf(garments, inPeriod)
  const all = usesOf(garments, entries)
  const worn = [...uses.values()].filter((use) => use.wears > 0)
  const priced = [...all.values()].flatMap((use) => {
    const price = use.garment.price
    return price && price > 0 ? [{ ...use, price, perWear: price / Math.max(use.wears, 1) }] : []
  })
  const pricedWorn = priced.filter((use) => use.wears > 0)
  const wearsOfPriced = pricedWorn.reduce((sum, use) => sum + use.wears, 0)
  return {
    wears: inPeriod.length,
    daysLogged: new Set(inPeriod.map((entry) => entry.day)).size,
    usedGarments: worn.length,
    mostWorn: worn.sort((a, b) => b.wears - a.wears || (b.lastWorn ?? '').localeCompare(a.lastWorn ?? '')).slice(0, 5),
    forgotten: forgottenGarments(garments, entries, now),
    colors: rows(garments, uses, (garment) => garment.colors).slice(0, MAX_ROWS),
    brands: rows(garments, uses, (garment) => (garment.brand?.trim() ? [garment.brand.trim()] : [])).slice(0, MAX_ROWS),
    categories: rows(garments, uses, (garment) => [garment.category]),
    cost: {
      priced: priced.length,
      total: priced.reduce((sum, use) => sum + use.price, 0),
      perWear: wearsOfPriced ? pricedWorn.reduce((sum, use) => sum + use.price, 0) / wearsOfPriced : undefined,
      garments: priced.sort((a, b) => a.perWear - b.perWear)
    }
  }
}

/** What the wardrobe lacks for making outfits. A garment without the data counts as suiting, as in the generator. */
export function wardrobeGaps(garments: Garment[], now = new Date()): WardrobeGap[] {
  if (!garments.length) return []
  const usable = garments.filter((garment) => garment.availability !== 'unavailable')
  const count = (role: Garment['role']) => usable.filter((garment) => garment.role === role).length
  const formal = (garment: Garment) => !garment.dressLevels.length || garment.dressLevels.includes('Formal')
  const season = seasonOfDate(now)
  const inSeason = (garment: Garment) => !garment.seasons.length || garment.seasons.includes(season)
  const gaps: WardrobeGap[] = []
  const tops = count('Top')
  const bottoms = count('Bottom')
  const onePieces = count('Una pieza')
  if (!onePieces && (!tops || !bottoms)) gaps.push({ title: tops ? 'Falta una parte de abajo' : 'Falta una parte de arriba', detail: 'Sin ella no se puede crear ningún outfit.' })
  else if (tops >= 3 && bottoms && tops >= bottoms * 3) gaps.push({ title: 'Pocas partes de abajo', detail: `Tienes ${tops} de arriba para ${bottoms} de abajo: una más multiplica las combinaciones.` })
  else if (bottoms >= 3 && tops && bottoms >= tops * 3) gaps.push({ title: 'Pocas partes de arriba', detail: `Tienes ${bottoms} de abajo para ${tops} de arriba: una más multiplica las combinaciones.` })
  const shoes = count('Calzado')
  if (!shoes) gaps.push({ title: 'Sin calzado', detail: 'Los outfits saldrán sin zapatos hasta que añadas alguno.' })
  else if (shoes === 1) gaps.push({ title: 'Solo un calzado', detail: 'Todos los outfits llevarán los mismos zapatos.' })
  if (!count('Capa')) gaps.push({ title: 'Sin abrigo ni chaqueta', detail: 'Hará falta alguna capa para los días de frío.' })
  const base = usable.filter((garment) => garment.role === 'Top' || garment.role === 'Bottom' || garment.role === 'Una pieza')
  const formalBase = base.filter(formal)
  if (base.length && !formalBase.some((garment) => garment.role === 'Una pieza') && (!formalBase.some((garment) => garment.role === 'Top') || !formalBase.some((garment) => garment.role === 'Bottom'))) {
    gaps.push({ title: 'Nada para un plan formal', detail: 'No hay una parte de arriba y una de abajo marcadas como formales.' })
  }
  const seasonBase = base.filter(inSeason)
  if (base.length >= 4 && seasonBase.length < 2) gaps.push({ title: `Poco para ${season.toLocaleLowerCase('es')}`, detail: 'Pocas prendas de arriba o de abajo son de esta temporada.' })
  return gaps
}
