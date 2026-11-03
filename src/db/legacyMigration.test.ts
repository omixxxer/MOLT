import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Garment, Outfit } from '../types/domain'
import { WardrobeDatabase } from './database'
import { moveLegacyCaches, moveLegacyStorage } from './legacyStorage'

const LEGACY = 'legacy-test'
const TARGET = 'target-test'

function garment(id: string): Garment {
  return {
    id, code: `SUD-${id}`, name: id, category: 'Parte superior', subcategory: '', colors: [], seasons: [], styles: [], dressLevels: [], role: 'Top',
    image: new Blob(['photo']), thumbnail: new Blob(['thumb']), width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const outfit: Outfit = { id: 'o', garmentIds: ['a', 'b'], occasion: 'Diario', score: 80, createdAt: '2026-01-01T00:00:00.000Z', favorite: true }

async function seedLegacy() {
  const legacy = new WardrobeDatabase(LEGACY)
  await legacy.open()
  await legacy.garments.bulkAdd([garment('a'), garment('b')])
  await legacy.outfits.add(outfit)
  await legacy.outfitFeedback.add({ id: 'f', type: 'worn', garmentIds: ['a', 'b'], createdAt: '2026-01-01T00:00:00.000Z' })
  await legacy.garmentCodeCounters.add({ prefix: 'SUD', last: 2 })
  await legacy.preferences.add({ id: 'current', preferredColors: ['Azul'], preferredStyles: [], feedbackWeights: {}, updatedAt: '' })
  legacy.close()
}

async function open() {
  const database = new WardrobeDatabase(TARGET, LEGACY)
  await database.open()
  return database
}

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  await Dexie.delete(LEGACY)
  await Dexie.delete(TARGET)
})

describe('moving the wardrobe from the old database', () => {
  it('brings everything over, and queries made right away wait for it', async () => {
    await seedLegacy()
    const database = new WardrobeDatabase(TARGET, LEGACY)
    // Not opened by hand: the first query opens it, as in the app.
    expect((await database.garments.toArray()).map((item) => item.code).sort()).toEqual(['SUD-a', 'SUD-b'])
    expect(await database.outfits.get('o')).toEqual(outfit)
    expect(await database.outfitFeedback.count()).toBe(1)
    expect((await database.preferences.get('current'))?.preferredColors).toEqual(['Azul'])
    expect((await database.garmentCodeCounters.get('SUD'))?.last).toBe(2)
    database.close()
  })

  it('keeps the old database until a later launch, then removes it without touching the copy', async () => {
    await seedLegacy()
    let database = await open()
    database.close()
    expect(await Dexie.exists(LEGACY)).toBe(true)

    database = await open()
    await vi.waitFor(async () => expect(await Dexie.exists(LEGACY)).toBe(false))
    expect(await database.garments.count()).toBe(2)
    database.close()
  })

  it('never overwrites what is already in the new one', async () => {
    await seedLegacy()
    const first = new WardrobeDatabase(TARGET)
    await first.open()
    await first.garments.add({ ...garment('a'), name: 'más reciente' })
    first.close()

    const database = await open()
    expect((await database.garments.toArray()).map((item) => item.name)).toEqual(['más reciente'])
    database.close()
  })

  it('leaves the old one intact and fails visibly if the copy cannot be made', async () => {
    await seedLegacy()
    const database = new WardrobeDatabase(TARGET, LEGACY)
    const bulkPut = vi.spyOn(database.Table.prototype, 'bulkPut').mockRejectedValue(new Error('Sin espacio'))
    await expect(database.open()).rejects.toThrow('Sin espacio')
    expect(bulkPut).toHaveBeenCalled()
    database.close()

    const legacy = new WardrobeDatabase(LEGACY)
    expect(await legacy.garments.count()).toBe(2)
    legacy.close()
    const again = await open()
    expect(await again.garments.count()).toBe(2)
    again.close()
  })

  it('does nothing when there is no old database', async () => {
    const database = await open()
    expect(await database.garments.count()).toBe(0)
    expect(await Dexie.exists(LEGACY)).toBe(false)
    database.close()
  })
})

describe('moving the settings on the device', () => {
  it('brings over what is in use, drops what is obsolete, and a newer value wins', () => {
    localStorage.setItem('vesta-drive', 'old drive')
    localStorage.setItem('vesta-place', 'old place')
    localStorage.setItem('molt-place', 'new place')
    localStorage.setItem('vesta-trip', 'obsolete')
    localStorage.setItem('other', 'not ours')
    moveLegacyStorage()
    expect(localStorage.getItem('molt-drive')).toBe('old drive')
    expect(localStorage.getItem('molt-place')).toBe('new place')
    expect(localStorage.getItem('vesta-drive')).toBeNull()
    expect(localStorage.getItem('vesta-place')).toBeNull()
    expect(localStorage.getItem('vesta-trip')).toBeNull()
    expect(localStorage.getItem('other')).toBe('not ours')
  })

  it('moves the caches of downloaded files, and only ours', async () => {
    const stores = new Map<string, Map<string, string>>([['vesta-model', new Map([['/a.onnx', 'bytes']])], ['workbox-precache', new Map([['/index.html', 'html']])]])
    const open = async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>()
      stores.set(name, store)
      return {
        keys: async () => [...store.keys()],
        match: async (key: string) => store.get(key),
        put: async (key: string, value: string) => { store.set(key, value) }
      }
    }
    vi.stubGlobal('caches', { keys: async () => [...stores.keys()], open, delete: async (name: string) => stores.delete(name) })
    await moveLegacyCaches()
    expect([...stores.keys()].sort()).toEqual(['molt-model', 'workbox-precache'])
    expect(stores.get('molt-model')?.get('/a.onnx')).toBe('bytes')
  })
})
