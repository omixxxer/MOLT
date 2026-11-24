// @vitest-environment node
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { subcategoryFromShape } from '../ai/garmentShape'
import type { Garment } from '../types/domain'
import { WardrobeDatabase } from './database'
import { upgradeGarmentToV6 } from './garmentUpgrades'

function garment(change: Partial<Garment>): Garment {
  return {
    id: 'g', name: 'Prenda', category: 'Parte inferior', subcategory: 'Vaqueros', colors: ['Azul'], seasons: ['Primavera', 'Verano', 'Otoño', 'Invierno'],
    styles: [], dressLevels: ['Diario'], role: 'Bottom', width: 600, height: 560, hasCutout: true,
    confirmedAttributes: [], suggestedAttributes: ['subcategory', 'seasons'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
}

describe('shorts by the shape of the cut-out', () => {
  it('calls short long trousers «Pantalón corto», and leaves long ones, skirts and other garments alone', () => {
    expect(subcategoryFromShape('Parte inferior', 'Vaqueros', 600, 560)).toBe('Pantalón corto')
    expect(subcategoryFromShape('Parte inferior', 'Vaqueros', 377, 423)).toBe('Pantalón corto')
    expect(subcategoryFromShape('Parte inferior', 'Vaqueros', 300, 900)).toBeUndefined()
    // Wide trousers laid flat with the legs apart: long, though not much taller than wide.
    expect(subcategoryFromShape('Parte inferior', 'Vaqueros', 576, 768)).toBeUndefined()
    expect(subcategoryFromShape('Parte inferior', 'Falda', 600, 500)).toBeUndefined()
    expect(subcategoryFromShape('Parte superior', 'Camiseta', 600, 560)).toBeUndefined()
    expect(subcategoryFromShape('Parte inferior', 'Vaqueros', 0, 0)).toBeUndefined()
  })
})

describe('garments brought up to taxonomy v6', () => {
  it('moves the jewellery out of the accessories, and leaves the rest of the accessories', () => {
    expect(upgradeGarmentToV6(garment({ category: 'Accesorio', subcategory: 'Reloj', role: 'Accesorio' }))).toMatchObject({ category: 'Joyería', role: 'Joya', subcategory: 'Reloj' })
    expect(upgradeGarmentToV6(garment({ category: 'Accesorio', subcategory: 'Pendientes', role: 'Accesorio' }))).toMatchObject({ category: 'Joyería', role: 'Joya' })
    expect(upgradeGarmentToV6(garment({ category: 'Accesorio', subcategory: 'Bolso', role: 'Accesorio' }))).toBeUndefined()
  })

  it('turns short «Vaqueros» into «Pantalón corto» for summer, unless the user chose the type', () => {
    expect(upgradeGarmentToV6(garment({}))).toMatchObject({ subcategory: 'Pantalón corto', seasons: ['Primavera', 'Verano'] })
    expect(upgradeGarmentToV6(garment({ confirmedAttributes: ['subcategory'] }))).toBeUndefined()
    // Seasons chosen by hand stay.
    expect(upgradeGarmentToV6(garment({ confirmedAttributes: ['seasons'] }))).toMatchObject({ subcategory: 'Pantalón corto', seasons: ['Primavera', 'Verano', 'Otoño', 'Invierno'] })
    // Long jeans, or a garment with no cut-out (its photo's proportions say nothing), stay as they are.
    expect(upgradeGarmentToV6(garment({ width: 300, height: 900 }))).toBeUndefined()
    expect(upgradeGarmentToV6(garment({ hasCutout: false }))).toBeUndefined()
  })
})

describe('database version 9', () => {
  const NAME = 'molt-v9-test'
  afterEach(async () => { await Dexie.delete(NAME) })

  it('upgrades the garments saved in version 8', async () => {
    const legacy = new Dexie(NAME)
    legacy.version(8).stores({
      garments: 'id, category, name, updatedAt, &code', outfits: 'id, createdAt, favorite, kind', preferences: 'id', trendPacks: 'id, version, publishedAt',
      outfitFeedback: 'id, type, createdAt', garmentCodeCounters: 'prefix', trips: 'id, startDate', garmentPhotos: 'garmentId', garmentThumbnails: 'garmentId'
    })
    await legacy.open()
    await legacy.table('garments').bulkPut([
      garment({ id: 'reloj', code: 'REL-001', category: 'Accesorio', subcategory: 'Reloj', role: 'Accesorio' }),
      garment({ id: 'short', code: 'VAQ-001' }),
      garment({ id: 'largo', code: 'VAQ-002', width: 300, height: 900 })
    ])
    legacy.close()

    const database = new WardrobeDatabase(NAME)
    await database.open()
    expect(database.verno).toBe(9)
    expect(await database.garments.get('reloj')).toMatchObject({ category: 'Joyería', role: 'Joya', code: 'REL-001' })
    expect(await database.garments.get('short')).toMatchObject({ subcategory: 'Pantalón corto', code: 'VAQ-001' })
    expect(await database.garments.get('largo')).toMatchObject({ subcategory: 'Vaqueros' })
    database.close()
  })
})
