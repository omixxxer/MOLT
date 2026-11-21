// @vitest-environment node
// Node Blobs: jsdom ones do not survive the structured clone of fake-indexeddb with their contents.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { database } from '../db/database'
import { garmentRepository } from '../db/garmentRepository'
import type { GarmentWithPhotos } from '../types/domain'
import type { LookOptions } from './cutout'
import { recutCandidates, recutWardrobe, undoRecut } from './recutWardrobe'

const read = (blob: Blob) => blob.text()

// The photo's text says what the new cut-out does: "bedspread" (the second pass takes bits out), "model" (a person
// is taken out) or nothing (today's plain cut-out).
vi.mock('./clothingAnalyzer', () => ({
  analyzeGarmentImage: vi.fn(async () => ({ segmentations: [{ classes: [], grid: 16, probabilities: new Float32Array(0) }] }))
}))
vi.mock('./cutout', () => ({
  cutOutGarments: vi.fn(async (photo: Blob, _map: unknown, _mode: string, look: LookOptions) => {
    const text = await read(photo)
    if (text.includes('bedspread')) look.onRefine?.({ outcome: 'replaced' })
    if (text.includes('model')) look.onPerson?.({ person: true, skinInGarment: 0.02 })
    return [{ image: new Blob([`new cutout of ${text}`]), width: 10, height: 10, coverage: 0.4, region: { classId: 'garment', patches: [], confidence: 1 }, place: { x: 0, y: 0, width: 1, height: 1 } }]
  })
}))
vi.mock('../db/imageProcessing', () => ({
  createThumbnail: async (blob: Blob) => ({ thumbnail: new Blob([`thumbnail of ${await read(blob)}`]), width: 100, height: 125 })
}))

const garment = (id: string, photo: string, cutout?: string): GarmentWithPhotos => ({
  id,
  name: id,
  category: 'Parte superior',
  subcategory: 'Sudadera',
  colors: ['Negro'],
  seasons: ['Invierno'],
  styles: [],
  dressLevels: ['Diario'],
  role: 'Top',
  image: new Blob([photo], { type: 'image/jpeg' }),
  ...(cutout ? { cutout: new Blob([cutout], { type: 'image/webp' }) } : {}),
  thumbnail: new Blob([`old thumbnail ${id}`], { type: 'image/jpeg' }),
  width: 640,
  height: 800,
  confirmedAttributes: ['category'],
  suggestedAttributes: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
})

afterEach(async () => {
  await database.garments.clear()
  await database.garmentPhotos.clear()
  await database.garmentThumbnails.clear()
})

describe('recutWardrobe', () => {
  it('saves only the cut-outs the new way improves, and undoes them', async () => {
    await garmentRepository.create(garment('on-bed', 'hoodie on a bedspread', 'old cut with bedspread'))
    await garmentRepository.create(garment('worn', 'jumper worn by a model', 'old cut with the model'))
    await garmentRepository.create(garment('plain', 'jeans on the floor', 'old cut, fine'))
    await garmentRepository.create(garment('kept-background', 'shirt with its background'))
    const garments = await garmentRepository.list()
    expect(recutCandidates(garments).map((entry) => entry.id).sort()).toEqual(['on-bed', 'plain', 'worn'])

    const progress: Array<[number, number]> = []
    const result = await recutWardrobe(garments, (done, total) => progress.push([done, total]))

    expect(result.checked).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.changed.map((entry) => entry.id).sort()).toEqual(['on-bed', 'worn'])
    expect(progress.at(-1)).toEqual([3, 3])
    const onBed = await garmentRepository.withPhotos('on-bed')
    expect(await read(onBed!.cutout!)).toBe('new cutout of hoodie on a bedspread')
    expect(await read(onBed!.thumbnail)).toBe('thumbnail of new cutout of hoodie on a bedspread')
    expect(onBed).toMatchObject({ width: 100, height: 125 })
    // Today's plain cut-out is not saved over the stored one, and a garment without cut-out is not touched.
    expect(await read((await garmentRepository.withPhotos('plain'))!.cutout!)).toBe('old cut, fine')
    expect((await garmentRepository.withPhotos('kept-background'))!.cutout).toBeUndefined()

    await undoRecut(result.changed)
    const restored = await garmentRepository.withPhotos('on-bed')
    expect(await read(restored!.cutout!)).toBe('old cut with bedspread')
    expect(await read(restored!.thumbnail)).toBe('old thumbnail on-bed')
    expect(restored).toMatchObject({ width: 640, height: 800 })
    expect(await read((await garmentRepository.withPhotos('worn'))!.cutout!)).toBe('old cut with the model')
  })
})
