import Dexie from 'dexie'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WardrobeDatabase } from '../db/database'
import { generateOutfitCandidates } from '../outfits/outfitGenerator'

const REAL = 'molt-wardrobe'

// Tests run from the project's folder; jsdom's URL is not one node's fs understands.
const onDisk = (path: string) => join(process.cwd(), 'public', path)

/** The example's photos, read from public/: a missing file fails the test. */
const requested: string[] = []
async function fromDisk(path: string) {
  requested.push(path)
  const file = onDisk(path)
  return new Blob([readFileSync(file)], { type: path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' })
}

/** The app as loaded in a tab marked for the example: the modules read the mark when they load. */
async function loadInDemo() {
  vi.resetModules()
  sessionStorage.setItem('molt-demo', '1')
  const [{ database }, demo, weather, photos] = await Promise.all([
    import('../db/database'),
    import('./demoWardrobe'),
    import('../weather/openMeteo'),
    import('../trips/destinationPhoto')
  ])
  return { database, ...demo, weather, photos }
}

beforeEach(async () => {
  // A real wardrobe with one garment, which the example must never touch.
  const real = new WardrobeDatabase(REAL)
  await real.garments.put({
    id: 'mia', name: 'Mi camisa', category: 'Parte superior', subcategory: 'Camisa', colors: [], seasons: [], styles: [], dressLevels: [], role: 'Top',
    width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  })
  real.close()
})

afterEach(async () => {
  sessionStorage.clear()
  vi.restoreAllMocks()
  await Dexie.delete(REAL)
  await Dexie.delete('molt-wardrobe-demo')
})

describe('example wardrobe', () => {
  it('opens a database of its own, filled once with garments that make outfits and a planned trip', async () => {
    const { database, seedDemo } = await loadInDemo()
    expect(database.name).toBe('molt-wardrobe-demo')
    await Promise.all([seedDemo(undefined, fromDisk), seedDemo(undefined, fromDisk)])
    const garments = await database.garments.toArray()
    expect(garments).toHaveLength(12)
    expect(requested.every((path) => existsSync(onDisk(path)))).toBe(true)
    // jsdom's Blobs do not survive IndexedDB, so the photos are checked where they are read: a photo and a cut-out each.
    expect(new Set(requested)).toEqual(new Set(garments.flatMap(({ id }) => [`/demo/${id.slice(5)}.jpg`, `/demo/${id.slice(5)}.webp`])))
    expect(await database.garmentPhotos.count()).toBe(12)
    expect(await database.garments.get('mia')).toBeUndefined()
    expect(generateOutfitCandidates(garments, { occasion: 'Diario' }).length).toBeGreaterThan(0)
    // Something for «Mis outfits» and the calendar, but today still free for «Me lo pongo hoy».
    expect(await database.outfits.count()).toBeGreaterThanOrEqual(2)
    const worn = await database.outfitFeedback.toArray()
    expect(worn).toHaveLength(2)
    expect(worn.every((event) => new Date(event.createdAt).toDateString() !== new Date().toDateString())).toBe(true)
    const [trip] = await database.trips.toArray()
    expect(trip?.days.every((day) => day.garmentIds.length > 0)).toBe(true)
    database.close()
  })

  it('leaving deletes only the example, and the real wardrobe stays as it was', async () => {
    const { database, seedDemo, leaveDemo } = await loadInDemo()
    await seedDemo(undefined, fromDisk)
    const reload = vi.fn()
    await leaveDemo(reload)
    expect(reload).toHaveBeenCalled()
    expect(sessionStorage.getItem('molt-demo')).toBeNull()
    expect(await Dexie.exists('molt-wardrobe-demo')).toBe(false)
    expect(database.name).not.toBe(REAL)
    const real = new WardrobeDatabase(REAL)
    expect((await real.garments.toArray()).map((garment) => garment.id)).toEqual(['mia'])
    real.close()
  })

  it('starts each new example fresh, deleting one left behind by a closed tab', async () => {
    const { database, seedDemo } = await loadInDemo()
    await seedDemo(undefined, fromDisk)
    database.close()
    sessionStorage.clear()
    vi.resetModules()
    const { startDemo } = await import('./demoMode')
    const reload = vi.fn()
    expect(startDemo(reload, { tour: true })).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(await Dexie.exists('molt-wardrobe-demo')).toBe(false)
    expect(sessionStorage.getItem('molt-tour')).toBe('1')
  })

  it('asks nothing to the weather service or Wikipedia', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const { weather, photos } = await loadInDemo()
    await expect(weather.searchPlaces('Lisboa')).rejects.toThrow(/ejemplo/)
    expect(await photos.findDestinationPhoto({ name: 'Lisboa', latitude: 38.7, longitude: -9.1 })).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })
})
