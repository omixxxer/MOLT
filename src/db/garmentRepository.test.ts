// @vitest-environment node
// Node Blobs: jsdom ones do not survive the structured clone of fake-indexeddb with their contents.
import { afterEach, describe, expect, it } from 'vitest'
import { database } from './database'
import { garmentRepository, repairInlinePhotos } from './garmentRepository'
import type { GarmentWithPhotos } from '../types/domain'

const makeGarment = (id: string): GarmentWithPhotos => ({
  id,
  name: 'Camisa blanca',
  category: 'Parte superior',
  subcategory: 'Camisa',
  colors: ['Blanco'],
  seasons: ['Primavera'],
  styles: ['Minimalista'],
  dressLevels: ['Arreglado'],
  role: 'Top',
  image: new Blob([`image ${id}`], { type: 'image/png' }),
  thumbnail: new Blob([`thumbnail ${id}`], { type: 'image/jpeg' }),
  width: 640,
  height: 800,
  confirmedAttributes: ['category', 'colors'],
  suggestedAttributes: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

const hasBlob = (record: object | undefined) => Object.values(record ?? {}).some((value) => value instanceof Blob || Array.isArray(value) && value.some((entry) => entry instanceof Blob))

afterEach(async () => {
  await database.garments.clear()
  await database.garmentPhotos.clear()
  await database.garmentThumbnails.clear()
  await database.garmentCodeCounters.clear()
})

describe('garmentRepository', () => {
  it('creates, reads, updates and deletes a garment in IndexedDB', async () => {
    const garment = makeGarment('garment-1')
    await garmentRepository.create(garment)

    expect(await garmentRepository.get(garment.id)).toMatchObject({ name: 'Camisa blanca' })
    expect(await garmentRepository.count()).toBe(1)

    await garmentRepository.update({ ...garment, name: 'Camisa de lino' })
    expect(await garmentRepository.get(garment.id)).toMatchObject({ name: 'Camisa de lino' })

    await garmentRepository.remove(garment.id)
    expect(await garmentRepository.get(garment.id)).toBeUndefined()
    expect(await garmentRepository.count()).toBe(0)
    // Photos and thumbnail go with the garment.
    expect(await database.garmentPhotos.count()).toBe(0)
    expect(await database.garmentThumbnails.count()).toBe(0)
  })

  it('gives each new garment a code by type that survives edits and deletions of others', async () => {
    const hoodie = (id: string): GarmentWithPhotos => ({ ...makeGarment(id), subcategory: 'Sudadera con capucha', name: 'Sudadera gris' })
    await garmentRepository.create(hoodie('h1'))
    await garmentRepository.create(hoodie('h2'))
    await garmentRepository.create(makeGarment('shirt'))
    await garmentRepository.create({ ...makeGarment('unknown'), subcategory: 'Kimono' })
    expect((await garmentRepository.get('h1'))?.code).toBe('SDC-001')
    expect((await garmentRepository.get('h2'))?.code).toBe('SDC-002')
    expect((await garmentRepository.get('shirt'))?.code).toBe('CSA-001')
    expect((await garmentRepository.get('unknown'))?.code).toBe('SUP-001') // falls back to the category

    // The form sends edits without the code and may change the type: the code stays.
    await garmentRepository.update({ ...hoodie('h1'), subcategory: 'Jersey' })
    expect((await garmentRepository.get('h1'))?.code).toBe('SDC-001')
    // The code of a deleted garment is never given to another one.
    await garmentRepository.remove('h2')
    await garmentRepository.create(hoodie('h3'))
    expect((await garmentRepository.get('h3'))?.code).toBe('SDC-003')
    // An id already in the wardrobe is never overwritten by a new garment.
    await expect(garmentRepository.create(hoodie('h3'))).rejects.toThrow()
  })

  it('lists the wardrobe without reading any image and reads images only when asked', async () => {
    const label = new Blob(['label'], { type: 'image/webp' })
    await garmentRepository.create({ ...makeGarment('a'), additionalImages: [new Blob(['back'], { type: 'image/png' })], labelImage: label })
    await garmentRepository.create(makeGarment('b'))

    const list = await garmentRepository.list()
    expect(list).toHaveLength(2)
    expect(list.some(hasBlob)).toBe(false)
    expect(hasBlob(await garmentRepository.get('a'))).toBe(false)
    for (const key of ['image', 'additionalImages', 'labelImage', 'cutout', 'thumbnail']) expect(list[0]).not.toHaveProperty(key)

    // Thumbnails only for the garments asked for (the ones the gallery shows).
    const thumbnails = await garmentRepository.thumbnails(['b', 'missing'])
    expect([...thumbnails.keys()]).toEqual(['b'])
    expect(await thumbnails.get('b')?.text()).toBe('thumbnail b')

    const photos = await garmentRepository.photos('a')
    expect(await photos?.image.text()).toBe('image a')
    expect(await photos?.additionalImages?.[0]?.text()).toBe('back')
    expect(await photos?.labelImage?.text()).toBe('label')
    expect(photos).not.toHaveProperty('garmentId')
    const whole = await garmentRepository.withPhotos('a')
    expect(whole).toMatchObject({ id: 'a', code: 'CSA-001' })
    expect(await whole?.thumbnail.text()).toBe('thumbnail a')
    expect(await garmentRepository.withPhotos('missing')).toBeUndefined()
  })

  it('keeps the stored photos when only the data changes and replaces them when the photos change', async () => {
    await garmentRepository.create({ ...makeGarment('a'), labelImage: new Blob(['label']), cutout: new Blob(['cutout']) })
    const [listed] = await garmentRepository.list()
    expect(listed?.hasCutout).toBe(true)

    // A change of availability sends the data alone.
    await garmentRepository.update({ ...listed!, availability: 'laundry' })
    expect(await garmentRepository.get('a')).toMatchObject({ availability: 'laundry', code: 'CSA-001' })
    expect(await (await garmentRepository.photos('a'))?.image.text()).toBe('image a')
    expect(await (await garmentRepository.thumbnails(['a'])).get('a')?.text()).toBe('thumbnail a')

    // The form sends the garment with its photos: removed ones (here the label) do not stay behind.
    await garmentRepository.update({ ...makeGarment('a'), image: new Blob(['new image']), thumbnail: new Blob(['new thumbnail']) })
    const photos = await garmentRepository.photos('a')
    expect(await photos?.image.text()).toBe('new image')
    expect(photos?.labelImage).toBeUndefined()
    expect(photos?.cutout).toBeUndefined()
    expect((await garmentRepository.get('a'))?.hasCutout).toBeUndefined()
    expect(await (await garmentRepository.thumbnails(['a'])).get('a')?.text()).toBe('new thumbnail')
    expect(hasBlob(await garmentRepository.get('a'))).toBe(false)
  })

  it('uses the photo as thumbnail for a garment that has none', async () => {
    await garmentRepository.create(makeGarment('old'))
    await database.garmentThumbnails.delete('old')
    expect(await (await garmentRepository.thumbnails(['old'])).get('old')?.text()).toBe('image old')
    expect(await (await garmentRepository.withPhotos('old'))?.thumbnail.text()).toBe('image old')
  })

  it('persists analysis provenance, confidence and local corrections with the garment', async () => {
    const garment = {
      ...makeGarment('garment-analysis'),
      analysis: {
        modelId: 'wargoninnovation/wargon-clothing-classifier',
        modelVersion: 'model-revision',
        analyzedAt: '2026-10-20T11:00:00.000Z',
        suggestions: {
          category: 'Parte superior' as const,
          subcategory: 'Camiseta',
          colors: ['Rojo']
        },
        confidenceByAttribute: { category: 0.42, subcategory: 0.42, colors: 0.8 },
        sourcesByAttribute: {
          category: 'wargon-vit' as const,
          subcategory: 'wargon-vit' as const,
          colors: 'local-pixels' as const
        },
        unknownAttributes: ['pattern', 'sleeveType', 'neckline'],
        correctedAttributes: ['colors']
      }
    }
    await garmentRepository.create(garment)

    expect(await garmentRepository.get(garment.id)).toMatchObject({
      analysis: {
        modelId: 'wargoninnovation/wargon-clothing-classifier',
        confidenceByAttribute: { category: 0.42, subcategory: 0.42, colors: 0.8 },
        sourcesByAttribute: { category: 'wargon-vit', subcategory: 'wargon-vit', colors: 'local-pixels' },
        correctedAttributes: ['colors'],
        unknownAttributes: ['pattern', 'sleeveType', 'neckline']
      }
    })
  })

  it('repairs garments saved with their images inside by an older version of the app still open', async () => {
    // A tab with the previous version, left open across the update, writes the whole garment as it used to.
    await garmentRepository.create(makeGarment('edited'))
    const inline = (id: string, extras: object = {}) => ({
      ...makeGarment(id), code: `CSA-0${id.length}`, image: new Blob([`old app ${id}`]), thumbnail: new Blob([`old thumb ${id}`]),
      cutout: new Blob([`old cutout ${id}`], { type: 'image/png' }), ...extras
    })
    await database.garments.put(inline('edited', { name: 'Editada en la pestaña antigua' }))
    await database.garments.put(inline('added', { additionalImages: [new Blob(['back'])] }))

    // The wardrobe list moves them to their stores, and the newer images win over the ones stored before.
    const list = await garmentRepository.list()
    expect(list.some(hasBlob)).toBe(false)
    expect(list.find((garment) => garment.id === 'edited')).toMatchObject({ name: 'Editada en la pestaña antigua', hasCutout: true })
    expect(await (await garmentRepository.photos('edited'))?.image.text()).toBe('old app edited')
    expect(await (await garmentRepository.photos('added'))?.additionalImages?.[0]?.text()).toBe('back')
    expect(await (await garmentRepository.thumbnails(['added'])).get('added')?.text()).toBe('old thumb added')
    expect(await repairInlinePhotos()).toBe(0)

    // Reading one garment repairs it too, without the list (an export, or the detail of a garment just written).
    await database.garments.put(inline('late'))
    expect(await (await garmentRepository.withPhotos('late'))?.cutout?.text()).toBe('old cutout late')
    expect(hasBlob(await garmentRepository.get('late'))).toBe(false)
    await database.garments.put(inline('thumb-only'))
    expect(await (await garmentRepository.thumbnails(['thumb-only'])).get('thumb-only')?.text()).toBe('old thumb thumb-only')
  })
})
