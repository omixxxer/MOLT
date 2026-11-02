import { afterEach, describe, expect, it } from 'vitest'
import { database } from '../db/database'
import { createOutfitFeedback, createOutfitRecord } from '../outfits/outfitGenerator'
import type { Garment, Outfit, OutfitFeedback } from '../types/domain'
import { forgottenGarments, localDay, wardrobeGaps, wardrobeStats, wearEntries } from './wardrobeStats'
import { loadWearHistory, logWear, removeWear } from './wearLog'

const now = new Date('2026-11-02T12:00:00')

function garment(id: string, role: Garment['role'], change: Partial<Garment> = {}): Garment {
  return {
    id, name: id, category: 'Parte superior', subcategory: '', colors: ['Azul'], seasons: [], styles: [], dressLevels: [], role,
    image: new Blob(['i']), thumbnail: new Blob(['t']), width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
}

function worn(ids: string[], at: string, outfitId?: string): OutfitFeedback {
  return createOutfitFeedback('worn', ids, outfitId, new Date(at).toISOString())
}

function outfit(ids: string[], change: Partial<Outfit> = {}): Outfit {
  return { ...createOutfitRecord({ garments: [], score: 80 }, { occasion: 'Diario' }, now.toISOString()), garmentIds: ids, ...change }
}

afterEach(async () => {
  await database.open()
  await Promise.all([database.outfits.clear(), database.outfitFeedback.clear()])
})

describe('wearEntries', () => {
  it('counts an outfit once a day, whether from events or from the date it keeps', () => {
    const entries = wearEntries(
      [outfit(['a', 'b'], { id: 'o', wornAt: new Date('2026-11-01T20:00:00').toISOString() }), outfit(['c', 'd'], { id: 'look', wornAt: new Date('2026-10-20T10:00:00').toISOString() })],
      [worn(['b', 'a'], '2026-11-01T09:00:00', 'o'), worn(['a', 'b'], '2026-11-01T10:00:00', 'o'), worn(['a', 'b'], '2026-10-31T10:00:00', 'o')]
    )
    expect(entries.map((entry) => entry.day)).toEqual(['2026-11-01', '2026-10-31', '2026-10-20'])
  })

  it('keeps the days of an outfit that was deleted from the list', () => {
    expect(wearEntries([], [worn(['a'], '2026-11-01T09:00:00', 'gone')])).toHaveLength(1)
  })
})

describe('wardrobeStats', () => {
  const garments = [
    garment('tee', 'Top', { price: 20, colors: ['Azul', 'Blanco'], brand: 'Uniqlo' }),
    garment('jeans', 'Bottom', { price: 60, category: 'Parte inferior', brand: ' Uniqlo ' }),
    garment('coat', 'Capa', { price: 200, category: 'Abrigo', colors: ['Negro'] }),
    garment('hat', 'Accesorio', { category: 'Accesorio', colors: ['Negro'] })
  ]
  const entries = wearEntries([], [
    worn(['tee', 'jeans'], '2026-11-01T09:00:00'),
    worn(['tee'], '2026-10-30T09:00:00'),
    worn(['coat', 'gone'], '2026-03-01T09:00:00')
  ])

  it('limits wearings to the period and orders the most worn', () => {
    const month = wardrobeStats(garments, entries, 30, now)
    expect(month.wears).toBe(2)
    expect(month.daysLogged).toBe(2)
    expect(month.usedGarments).toBe(2)
    expect(month.mostWorn.map((use) => [use.garment.id, use.wears])).toEqual([['tee', 2], ['jeans', 1]])
    expect(wardrobeStats(garments, entries, undefined, now).usedGarments).toBe(3)
  })

  it('computes the cost per wearing over all time, whatever the period', () => {
    const { cost } = wardrobeStats(garments, entries, 30, now)
    expect(cost.priced).toBe(3)
    expect(cost.total).toBe(280)
    expect(cost.perWear).toBe(70) // 280 € in 4 wearings.
    expect(cost.garments.map((use) => [use.garment.id, use.perWear])).toEqual([['tee', 10], ['jeans', 60], ['coat', 200]])
  })

  it('has no cost per wearing until a priced garment is worn', () => {
    expect(wardrobeStats([garment('tee', 'Top', { price: 20 })], [], undefined, now).cost.perWear).toBeUndefined()
  })

  it('groups colours, brands and categories with their wearings', () => {
    const stats = wardrobeStats(garments, entries, 30, now)
    expect(stats.colors.find((row) => row.label === 'Azul')).toEqual({ label: 'Azul', count: 2, wears: 3 })
    expect(stats.brands).toEqual([{ label: 'Uniqlo', count: 2, wears: 3 }])
    expect(stats.categories.find((row) => row.label === 'Abrigo')).toEqual({ label: 'Abrigo', count: 1, wears: 0 })
  })
})

describe('forgottenGarments', () => {
  it('finds what was not worn for a while or never, but not what is recent or put away', () => {
    const list = forgottenGarments([
      garment('recent', 'Top'),
      garment('old', 'Top'),
      garment('never', 'Top', { createdAt: '2026-10-30T00:00:00.000Z' }),
      garment('stored', 'Top', { availability: 'unavailable' })
    ], wearEntries([], [worn(['recent'], '2026-10-25T10:00:00'), worn(['old'], '2026-08-01T10:00:00')]), now)
    expect(list.map((use) => use.garment.id)).toEqual(['old', 'never'])
  })
})

describe('wardrobeGaps', () => {
  const titles = (garments: Garment[]) => wardrobeGaps(garments, now).map((gap) => gap.title)

  it('says nothing about an empty wardrobe, and what is missing otherwise', () => {
    expect(titles([])).toEqual([])
    expect(titles([garment('tee', 'Top')])).toEqual(expect.arrayContaining(['Falta una parte de abajo', 'Sin calzado', 'Sin abrigo ni chaqueta']))
  })

  it('notices imbalance and a single pair of shoes', () => {
    const list = titles([garment('a', 'Top'), garment('b', 'Top'), garment('c', 'Top'), garment('d', 'Bottom'), garment('e', 'Calzado'), garment('f', 'Capa')])
    expect(list).toEqual(['Pocas partes de abajo', 'Solo un calzado'])
  })

  it('does not treat missing data as a gap, but a wardrobe marked as informal is one', () => {
    const complete = [garment('a', 'Top'), garment('d', 'Bottom'), garment('e', 'Calzado'), garment('e2', 'Calzado'), garment('f', 'Capa')]
    expect(titles(complete)).toEqual([])
    expect(titles(complete.map((item) => ({ ...item, dressLevels: ['Diario' as const] })))).toEqual(['Nada para un plan formal'])
  })
})

describe('wear log', () => {
  it('records a past day without moving the latest date, and takes a day out again', async () => {
    const latest = new Date('2026-11-01T20:00:00').toISOString()
    const record = outfit(['a', 'b'], { id: 'o', wornAt: latest })
    await logWear(record)
    const today = localDay()
    const saved = await database.outfits.get('o')
    await logWear(saved!, '2026-03-10')
    expect((await database.outfits.get('o'))?.wornAt).toBe(saved?.wornAt)

    let { entries } = await loadWearHistory()
    expect(entries.map((entry) => entry.day)).toEqual([today, '2026-03-10'])

    await removeWear(entries[0]!)
    expect((await database.outfits.get('o'))?.wornAt).toBe(new Date('2026-03-10T12:00:00').toISOString())
    ;({ entries } = await loadWearHistory())
    expect(entries.map((entry) => entry.day)).toEqual(['2026-03-10'])

    await removeWear(entries[0]!)
    expect((await database.outfits.get('o'))?.wornAt).toBeUndefined()
    expect(await database.outfitFeedback.count()).toBe(0)
  })
})
