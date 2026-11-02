import Dexie, { type EntityTable } from 'dexie'
import type { DressLevel, Garment, LegacyFormality, Outfit, OutfitFeedback, TrendPack, Trip, UserPreferences } from '../types/domain'
import { assignMissingCodes, codeCounters } from './garmentCodes'

const levelOfFormality: Record<LegacyFormality, DressLevel> = { Casual: 'Diario', 'Smart casual': 'Arreglado', Formal: 'Formal' }
const occasionOfFormality: Record<string, string> = { Casual: 'Diario', 'Smart casual': 'Arreglado' }

const DATABASE_NAME = 'molt-wardrobe'
const LEGACY_DATABASE_NAME = 'vesta-wardrobe'

export class WardrobeDatabase extends Dexie {
  garments!: EntityTable<Garment, 'id'>
  outfits!: EntityTable<Outfit, 'id'>
  preferences!: EntityTable<UserPreferences, 'id'>
  trendPacks!: EntityTable<TrendPack, 'id'>
  outfitFeedback!: EntityTable<OutfitFeedback, 'id'>
  /** Highest number given per code prefix, so a deleted garment's code is never given to another one. */
  garmentCodeCounters!: EntityTable<{ prefix: string; last: number }, 'prefix'>
  trips!: EntityTable<Trip, 'id'>

  /** `legacyName`: a database from before the app was renamed, whose contents are brought here on opening. */
  constructor(name = DATABASE_NAME, legacyName?: string) {
    super(name)
    this.version(1).stores({
      garments: 'id, category, name, updatedAt',
      outfits: 'id, createdAt, favorite',
      preferences: 'id',
      trendPacks: 'id, version, publishedAt'
    })
    this.version(2)
      .stores({
        garments: 'id, category, name, updatedAt',
        outfits: 'id, createdAt, favorite',
        preferences: 'id',
        trendPacks: 'id, version, publishedAt'
      })
      .upgrade(async (transaction) => {
        await transaction.table('garments').toCollection().modify((garment: Partial<Garment>) => {
          garment.width ??= 0
          garment.height ??= 0
        })
      })
    this.version(3).stores({
      garments: 'id, category, name, updatedAt',
      outfits: 'id, createdAt, favorite',
      preferences: 'id',
      trendPacks: 'id, version, publishedAt',
      outfitFeedback: 'id, type, createdAt'
    })
    this.version(4).stores({
      garments: 'id, category, name, updatedAt',
      outfits: 'id, createdAt, favorite, kind',
      preferences: 'id',
      trendPacks: 'id, version, publishedAt',
      outfitFeedback: 'id, type, createdAt'
    })
    this.version(5)
      .stores({
        garments: 'id, category, name, updatedAt, &code',
        outfits: 'id, createdAt, favorite, kind',
        preferences: 'id',
        trendPacks: 'id, version, publishedAt',
        outfitFeedback: 'id, type, createdAt',
        garmentCodeCounters: 'prefix'
      })
      .upgrade(async (transaction) => {
        // Two streaming passes, so the photos of every garment are not held in memory at once.
        const table = transaction.table('garments')
        const summaries: Array<Pick<Garment, 'id' | 'category' | 'subcategory' | 'createdAt'> & { code?: string }> = []
        await table.each((garment: Garment) => {
          summaries.push({ id: garment.id, category: garment.category, subcategory: garment.subcategory, createdAt: garment.createdAt, code: garment.code })
        })
        const codes = assignMissingCodes(summaries)
        await table.toCollection().modify((garment: Garment) => {
          const code = codes.get(garment.id)
          if (code) garment.code = code
        })
        await transaction.table('garmentCodeCounters').bulkPut(codeCounters(codes.values()))
      })
    // The single formality (Casual / Smart casual / Formal) becomes a list of dress levels.
    this.version(6)
      .stores({
        garments: 'id, category, name, updatedAt, &code',
        outfits: 'id, createdAt, favorite, kind',
        preferences: 'id',
        trendPacks: 'id, version, publishedAt',
        outfitFeedback: 'id, type, createdAt',
        garmentCodeCounters: 'prefix'
      })
      .upgrade(async (transaction) => {
        await transaction.table('garments').toCollection().modify((garment: Garment & { formality?: LegacyFormality }) => {
          const level = garment.formality && levelOfFormality[garment.formality]
          garment.dressLevels ??= level ? [level] : []
          delete garment.formality
        })
        await transaction.table('preferences').toCollection().modify((preferences: UserPreferences & { preferredFormality?: LegacyFormality }) => {
          const level = preferences.preferredFormality && levelOfFormality[preferences.preferredFormality]
          if (level) preferences.preferredDressLevel = level
          delete preferences.preferredFormality
        })
        await transaction.table('outfits').toCollection().modify((outfit: Outfit) => {
          outfit.occasion = occasionOfFormality[outfit.occasion] ?? outfit.occasion
        })
      })
    this.version(7).stores({ trips: 'id, startDate' })
    if (legacyName) this.on('ready', () => moveLegacyDatabase(this, legacyName))
  }
}

/**
 * Brings the wardrobe over from the old database. Everything is copied in one transaction, so a failure leaves nothing
 * half done and the old one intact; the app then reports it could not open, rather than showing an empty wardrobe. The
 * old database is deleted on a later launch, once the copy has been there and working.
 */
async function moveLegacyDatabase(target: WardrobeDatabase, legacyName: string) {
  if (!await Dexie.exists(legacyName)) return
  const hasData = async (database: WardrobeDatabase) => (await Promise.all(database.tables.map((table) => table.count()))).some(Boolean)
  // Opened with the same schema, so an old version goes through its upgrades first.
  const legacy = new WardrobeDatabase(legacyName)
  try {
    await legacy.open()
    if (await hasData(target) || !await hasData(legacy)) {
      legacy.close()
      // Not waited for: another tab still using it must not keep this one from opening.
      void Dexie.delete(legacyName).catch(() => undefined)
      return
    }
    const contents = await Promise.all(legacy.tables.map(async (table) => ({ name: table.name, rows: await table.toArray() })))
    await target.transaction('rw', target.tables, async () => {
      for (const { name, rows } of contents) await target.table(name).bulkPut(rows)
    })
    for (const { name, rows } of contents) {
      if (await target.table(name).count() !== rows.length) throw new Error(`La copia de ${name} no está completa.`)
    }
  } finally {
    legacy.close()
  }
}

export const database = new WardrobeDatabase(DATABASE_NAME, LEGACY_DATABASE_NAME)
