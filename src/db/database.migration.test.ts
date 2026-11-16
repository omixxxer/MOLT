// @vitest-environment node
// Node Blobs: jsdom ones do not survive the structured clone of fake-indexeddb with their contents.
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { WardrobeDatabase } from './database'

const NAME = 'molt-migration-test'

/** The schema of version 7, as installed apps have it: images inside each garment record. */
function openVersion7() {
  const legacy = new Dexie(NAME)
  legacy.version(7).stores({
    garments: 'id, category, name, updatedAt, &code',
    outfits: 'id, createdAt, favorite, kind',
    preferences: 'id',
    trendPacks: 'id, version, publishedAt',
    outfitFeedback: 'id, type, createdAt',
    garmentCodeCounters: 'prefix',
    trips: 'id, startDate'
  })
  return legacy
}

const legacyGarment = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  code: `CSA-00${id}`,
  name: `Camisa ${id}`,
  category: 'Parte superior',
  subcategory: 'Camisa',
  colors: ['Blanco'],
  seasons: ['Primavera'],
  styles: [],
  dressLevels: ['Arreglado'],
  role: 'Top',
  availability: 'laundry',
  image: new Blob([`foto ${id}`], { type: 'image/jpeg' }),
  thumbnail: new Blob([`miniatura ${id}`], { type: 'image/jpeg' }),
  width: 640,
  height: 800,
  confirmedAttributes: ['category'],
  suggestedAttributes: ['colors'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: `2026-01-0${id}T00:00:00.000Z`,
  ...extras
})

afterEach(() => Dexie.delete(NAME))

describe('database version 8', () => {
  it('moves every photo and thumbnail to their own stores and keeps all other data', async () => {
    const legacy = openVersion7()
    await legacy.table('garments').bulkAdd([
      legacyGarment('1', {
        additionalImages: [new Blob(['espalda'], { type: 'image/png' }), new Blob(['detalle'], { type: 'image/webp' })],
        labelImage: new Blob(['etiqueta'], { type: 'image/jpeg' }),
        cutout: new Blob(['recorte'], { type: 'image/png' }),
        price: 30,
        notes: 'Regalo',
        analysis: { modelId: 'vesta', modelVersion: 'v4', analyzedAt: '2026-01-01T00:00:00.000Z' }
      }),
      legacyGarment('2'),
      // A garment from the first versions of the app, saved without thumbnail.
      legacyGarment('3', { thumbnail: undefined })
    ])
    await legacy.table('outfits').add({ id: 'o1', garmentIds: ['1', '2'], occasion: 'Diario', kind: 'manual', score: 80, createdAt: '2026-01-02T00:00:00.000Z', favorite: true })
    await legacy.table('preferences').add({ id: 'current', preferredColors: ['Azul'], preferredStyles: ['Minimalista'], preferredDressLevel: 'Diario', feedbackWeights: { '1': 2 }, updatedAt: '2026-01-03T00:00:00.000Z' })
    await legacy.table('outfitFeedback').add({ id: 'f1', type: 'like', garmentIds: ['1'], outfitId: 'o1', createdAt: '2026-01-04T00:00:00.000Z' })
    await legacy.table('garmentCodeCounters').add({ prefix: 'CSA', last: 7 })
    await legacy.table('trendPacks').add({ id: 't1', version: '1', publishedAt: '2026-01-05', source: 'prueba', categories: [] })
    const trip = { id: 'v1', startDate: '2026-02-01', destination: 'Valencia', packed: ['1'] }
    await legacy.table('trips').add(trip)
    legacy.close()

    const database = new WardrobeDatabase(NAME)
    await database.open()
    expect(database.verno).toBe(8)

    // The garment records keep every field except the images.
    const garments = await database.garments.orderBy('id').toArray()
    expect(garments.map((garment) => garment.id)).toEqual(['1', '2', '3'])
    for (const garment of garments) {
      for (const key of ['image', 'additionalImages', 'labelImage', 'cutout', 'thumbnail']) expect(garment).not.toHaveProperty(key)
    }
    expect(garments[0]).toMatchObject({
      code: 'CSA-001', name: 'Camisa 1', colors: ['Blanco'], dressLevels: ['Arreglado'], availability: 'laundry', notes: 'Regalo', price: 30,
      width: 640, height: 800, confirmedAttributes: ['category'], suggestedAttributes: ['colors'],
      analysis: { modelId: 'vesta' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    })
    // Only the garment that had a cut-out is marked as having one.
    expect(garments.map((garment) => garment.hasCutout)).toEqual([true, undefined, undefined])
    // The unique code index still works after the records are rewritten.
    expect((await database.garments.where('code').equals('CSA-002').first())?.id).toBe('2')

    // Every photo is in garmentPhotos with its contents and type.
    expect(await database.garmentPhotos.count()).toBe(3)
    const first = await database.garmentPhotos.get('1')
    expect(await first?.image.text()).toBe('foto 1')
    expect(first?.image.type).toBe('image/jpeg')
    expect(await Promise.all(first!.additionalImages!.map((photo) => photo.text()))).toEqual(['espalda', 'detalle'])
    expect(first?.additionalImages?.map((photo) => photo.type)).toEqual(['image/png', 'image/webp'])
    expect(await first?.labelImage?.text()).toBe('etiqueta')
    expect(await first?.cutout?.text()).toBe('recorte')
    expect(first?.cutout?.type).toBe('image/png')
    const second = await database.garmentPhotos.get('2')
    expect(await second?.image.text()).toBe('foto 2')
    expect(second).not.toHaveProperty('additionalImages')
    expect(second).not.toHaveProperty('labelImage')
    expect(second).not.toHaveProperty('cutout')

    // Thumbnails are in garmentThumbnails; the garment that had none still has its photo.
    expect((await database.garmentThumbnails.toCollection().primaryKeys()).sort()).toEqual(['1', '2'])
    expect(await (await database.garmentThumbnails.get('2'))?.thumbnail.text()).toBe('miniatura 2')
    expect(await (await database.garmentPhotos.get('3'))?.image.text()).toBe('foto 3')

    // Outfits, preferences, feedback, counters, trend packs and trips are untouched.
    expect(await database.outfits.toArray()).toEqual([
      { id: 'o1', garmentIds: ['1', '2'], occasion: 'Diario', kind: 'manual', score: 80, createdAt: '2026-01-02T00:00:00.000Z', favorite: true }
    ])
    expect(await database.preferences.get('current')).toEqual({ id: 'current', preferredColors: ['Azul'], preferredStyles: ['Minimalista'], preferredDressLevel: 'Diario', feedbackWeights: { '1': 2 }, updatedAt: '2026-01-03T00:00:00.000Z' })
    expect(await database.outfitFeedback.toArray()).toEqual([{ id: 'f1', type: 'like', garmentIds: ['1'], outfitId: 'o1', createdAt: '2026-01-04T00:00:00.000Z' }])
    expect(await database.garmentCodeCounters.toArray()).toEqual([{ prefix: 'CSA', last: 7 }])
    expect(await database.trendPacks.count()).toBe(1)
    expect(await database.table('trips').toArray()).toEqual([trip])
    database.close()
  })

  it('opens an empty wardrobe and a new installation', async () => {
    const legacy = openVersion7()
    await legacy.open()
    legacy.close()
    const upgraded = new WardrobeDatabase(NAME)
    await upgraded.open()
    expect(await upgraded.garments.count()).toBe(0)
    expect(await upgraded.garmentPhotos.count()).toBe(0)
    upgraded.close()
    await Dexie.delete(NAME)

    const fresh = new WardrobeDatabase(NAME)
    await fresh.open()
    expect(fresh.verno).toBe(8)
    expect(await fresh.garmentThumbnails.count()).toBe(0)
    fresh.close()
  })
})
