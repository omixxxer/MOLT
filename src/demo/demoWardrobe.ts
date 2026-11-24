import { database } from '../db/database'
import { garmentRepository, garmentTables } from '../db/garmentRepository'
import { createOutfitFeedback, createOutfitRecord, generateOutfitCandidates, seasonOfDate, type OutfitContext } from '../outfits/outfitGenerator'
import { outfitName } from '../outfits/outfitNames'
import { defaultExtras, planDays } from '../trips/packingPlan'
import type { Garment, GarmentCategory, Outfit, OutfitFeedback, Season, Trip, TripDay } from '../types/domain'
import { localDay } from '../stats/wardrobeStats'
import type { DailyWeather } from '../weather/openMeteo'
import { clearDemoFlag, deleteDemoDatabase, DEMO_DATABASE_NAME, isDemo, requestAfterDemo, type AfterDemo } from './demoMode'

/**
 * The example garments: real photos from the Clothing Dataset (Alexey Grigorev, CC0 1.0, see THIRD_PARTY_NOTICES),
 * cut out beforehand with Molt's own cut-out (eight from its test split, four from its training split). They are in public/demo/ and only downloaded, from Molt's own site,
 * when the example is started: they carry nothing of the user's.
 */
interface DemoPiece {
  /** Its files: public/demo/<file>.jpg (the photo) and .webp (the cut-out). */
  file: string
  name: string
  category: GarmentCategory
  subcategory: string
  role: Garment['role']
  colors: string[]
  /** The cut-out's size. */
  width: number
  height: number
  seasons?: Season[]
  styles?: string[]
  dressLevels: Garment['dressLevels']
  price?: number
}

const PIECES: DemoPiece[] = [
  { file: 'camiseta', name: 'Camiseta celeste', category: 'Parte superior', subcategory: 'Camiseta', role: 'Top', colors: ['Azul', 'Blanco'], width: 400, height: 448, seasons: ['Primavera', 'Verano'], styles: ['Básico'], dressLevels: ['Deportivo', 'Diario'], price: 12 },
  { file: 'camisa', name: 'Camisa gris de manga corta', category: 'Parte superior', subcategory: 'Camisa', role: 'Top', colors: ['Gris'], width: 389, height: 468, seasons: ['Primavera', 'Verano'], styles: ['Clásico'], dressLevels: ['Diario', 'Arreglado'], price: 35 },
  { file: 'jersey-gris', name: 'Jersey gris de cuello alto', category: 'Parte superior', subcategory: 'Jersey', role: 'Top', colors: ['Gris'], width: 397, height: 328, seasons: ['Otoño', 'Invierno'], styles: ['Básico'], dressLevels: ['Diario', 'Arreglado'], price: 40 },
  { file: 'jersey-negro', name: 'Jersey negro de cuello alto', category: 'Parte superior', subcategory: 'Jersey', role: 'Top', colors: ['Negro'], width: 399, height: 397, seasons: ['Otoño', 'Invierno'], styles: ['Clásico'], dressLevels: ['Diario', 'Arreglado', 'Formal'], price: 45 },
  { file: 'vaqueros', name: 'Vaqueros oscuros', category: 'Parte inferior', subcategory: 'Vaqueros', role: 'Bottom', colors: ['Azul marino'], width: 339, height: 486, dressLevels: ['Diario', 'Arreglado'], price: 50 },
  { file: 'pantalon', name: 'Pantalón caqui', category: 'Parte inferior', subcategory: 'Pantalón', role: 'Bottom', colors: ['Verde'], width: 333, height: 611, styles: ['Clásico'], dressLevels: ['Diario', 'Arreglado'], price: 45 },
  { file: 'falda-azul', name: 'Falda azul marino', category: 'Parte inferior', subcategory: 'Falda', role: 'Bottom', colors: ['Azul marino'], width: 376, height: 297, dressLevels: ['Diario', 'Arreglado', 'Formal'], price: 30 },
  { file: 'vestido', name: 'Vestido verde bordado', category: 'Vestido / mono', subcategory: 'Vestido', role: 'Una pieza', colors: ['Verde', 'Naranja'], width: 343, height: 387, seasons: ['Primavera', 'Verano'], dressLevels: ['Diario', 'Arreglado'], price: 55 },
  { file: 'chaqueta-negra', name: 'Chaqueta negra', category: 'Abrigo', subcategory: 'Chaqueta', role: 'Capa', colors: ['Negro'], width: 396, height: 286, seasons: ['Primavera', 'Otoño'], dressLevels: ['Diario', 'Arreglado'], price: 60 },
  { file: 'abrigo-rojo', name: 'Abrigo rojo', category: 'Abrigo', subcategory: 'Abrigo', role: 'Capa', colors: ['Rojo'], width: 400, height: 489, seasons: ['Otoño', 'Invierno'], styles: ['Clásico'], dressLevels: ['Diario', 'Arreglado', 'Formal'], price: 90 },
  { file: 'zapatos-blancos', name: 'Zapatos blancos', category: 'Calzado', subcategory: 'Zapatos', role: 'Calzado', colors: ['Blanco'], width: 335, height: 505, seasons: ['Primavera', 'Verano'], dressLevels: ['Diario', 'Arreglado'], price: 70 },
  { file: 'botas-grises', name: 'Botas altas grises', category: 'Calzado', subcategory: 'Botas', role: 'Calzado', colors: ['Gris'], width: 200, height: 448, seasons: ['Otoño', 'Invierno'], dressLevels: ['Diario', 'Arreglado'], price: 80 }
]

export type DemoPhotoLoader = (path: string) => Promise<Blob>

/** The example's files, from Molt's own site. */
export const loadDemoPhoto: DemoPhotoLoader = async (path) => {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status}).`)
  return response.blob()
}

/** The example garments, as the wardrobe stores them: the photo, and the cut-out as cut-out and thumbnail. */
export async function demoGarments(now = new Date(), load: DemoPhotoLoader = loadDemoPhoto) {
  const at = now.toISOString()
  return Promise.all(PIECES.map(async ({ file, seasons = [], styles = [], ...piece }) => {
    const [image, cutout] = await Promise.all([load(`/demo/${file}.jpg`), load(`/demo/${file}.webp`)])
    return {
      ...piece, id: `demo-${file}`, seasons, styles, notes: 'Prenda del armario de ejemplo. Foto: Clothing Dataset (CC0).',
      hasCutout: true, confirmedAttributes: [], suggestedAttributes: [],
      createdAt: at, updatedAt: at, image, cutout, thumbnail: cutout
    }
  }))
}

/** A sample forecast for the example trip: made up here, nothing is asked to the weather service. */
function sampleWeather(date: string, index: number): DailyWeather {
  const temperatures = [17, 15, 14, 16]
  const temperatureCelsius = temperatures[index % temperatures.length]!
  const rainy = index === 1
  return {
    date, temperatureCelsius, high: temperatureCelsius + 4, low: temperatureCelsius - 5,
    rainChance: rainy ? 70 : 10, rainMm: rainy ? 4 : 0, windKmh: 12, code: rainy ? 61 : 2, conditions: rainy ? ['lluvia débil'] : ['intervalos nubosos'], source: 'forecast'
  }
}

/** A weekend in Lisbon, two weeks from now, with its days already planned with the example garments. */
export function demoTrip(garments: Garment[], now = new Date()): Trip {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)
  const dates = [0, 1, 2].map((offset) => localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)))
  const days: TripDay[] = dates.map((date, index) => ({ date, weather: sampleWeather(date, index), occasion: 'Diario', garmentIds: [] }))
  const at = now.toISOString()
  return {
    id: 'demo-viaje',
    place: { name: 'Lisboa', region: 'Lisboa', country: 'Portugal', latitude: 38.72, longitude: -9.14 },
    // Marked as already looked at, so no photo is asked to Wikipedia and the forecast is not asked again.
    coverCheckedAt: at,
    fetchedAt: at,
    startDate: dates[0]!,
    endDate: dates.at(-1)!,
    kind: 'leisure',
    style: 'balanced',
    days: planDays(garments, days, 'balanced'),
    packedIds: [],
    extras: defaultExtras(days.map((day) => day.weather), 'leisure'),
    notes: 'Viaje de ejemplo: cambia las prendas de cada día o marca lo que ya está en la maleta.',
    createdAt: at,
    updatedAt: at
  }
}

/**
 * A few outfits saved from the example garments, so «Mis outfits» and the calendar have something to show: one per
 * plan, the first two worn on the last two days (not today, so «Me lo pongo hoy» can still be tried).
 */
export function demoOutfits(garments: Garment[], now = new Date()): { outfits: Outfit[]; feedback: OutfitFeedback[] } {
  const outfits: Outfit[] = []
  const used = new Set<string>()
  for (const occasion of ['Diario', 'Arreglado', 'Formal']) {
    const context: OutfitContext = { occasion, season: seasonOfDate(now) }
    const candidate = generateOutfitCandidates(garments, context, { seed: `demo-${occasion}`, limit: 6 })
      .find((option) => !option.garments.some((garment) => used.has(garment.id) && garment.role !== 'Calzado'))
    if (!candidate) continue
    candidate.garments.forEach((garment) => used.add(garment.id))
    outfits.push({ ...createOutfitRecord(candidate, context, now.toISOString()), kind: 'manual', name: outfitName(candidate.garments, { occasion, date: now }), favorite: occasion === 'Arreglado' })
  }
  const feedback = outfits.slice(0, 2).map((outfit, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1 - index, 12)
    outfit.wornAt = day.toISOString()
    return createOutfitFeedback('worn', outfit.garmentIds, outfit.id, day.toISOString())
  })
  return { outfits, feedback }
}

let seeding: Promise<void> | undefined

/** Fills the example database the first time it is opened (once, however many times it is asked). Never the real one. */
export function seedDemo(now = new Date(), load: DemoPhotoLoader = loadDemoPhoto) {
  seeding ??= fill(now, load).catch((error: unknown) => {
    seeding = undefined
    throw error
  })
  return seeding
}

async function fill(now: Date, load: DemoPhotoLoader) {
  if (!isDemo() || database.name !== DEMO_DATABASE_NAME) return
  if (await database.garments.count()) return
  // The photos first: a transaction cannot wait for downloads.
  const garments = await demoGarments(now, load)
  await database.transaction('rw', [...garmentTables(), database.garmentCodeCounters, database.trips, database.outfits, database.outfitFeedback], async () => {
    if (await database.garments.count()) return
    for (const garment of garments) await garmentRepository.create(garment)
    const stored = await database.garments.toArray()
    await database.trips.put(demoTrip(stored, now))
    const { outfits, feedback } = demoOutfits(stored, now)
    await database.outfits.bulkPut(outfits)
    await database.outfitFeedback.bulkPut(feedback)
  })
}

/**
 * Ends the example: closes and deletes its database (only that one), and loads the real wardrobe again; `then`, a
 * screen to open there (adding garments, from the tour's last step).
 */
export async function leaveDemo(reload = () => window.location.reload(), then?: AfterDemo) {
  clearDemoFlag()
  if (then) requestAfterDemo(then)
  if (database.name === DEMO_DATABASE_NAME) {
    database.close()
    await deleteDemoDatabase()
  }
  reload()
}
