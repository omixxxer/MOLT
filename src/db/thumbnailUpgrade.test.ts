// @vitest-environment node
// Node Blobs: jsdom ones do not survive the structured clone of fake-indexeddb with their contents.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GarmentWithPhotos } from '../types/domain'
import { database } from './database'
import { garmentRepository } from './garmentRepository'
import { upgradeCutoutThumbnails } from './thumbnailUpgrade'

vi.mock('./imageProcessing', () => ({
  createThumbnail: vi.fn(async (blob: Blob, options?: { transparent?: boolean }) => ({
    thumbnail: new Blob([`thumbnail of ${await blob.text()}`], { type: options?.transparent ? 'image/webp' : 'image/jpeg' }),
    width: 100,
    height: 125
  }))
}))

const garment = (id: string, thumbnailType: string, cutout?: string): GarmentWithPhotos => ({
  id,
  name: id,
  category: 'Parte superior',
  subcategory: 'Camiseta',
  colors: ['Blanco'],
  seasons: ['Verano'],
  styles: [],
  dressLevels: ['Diario'],
  role: 'Top',
  image: new Blob([`photo ${id}`], { type: 'image/jpeg' }),
  ...(cutout ? { cutout: new Blob([cutout], { type: 'image/webp' }) } : {}),
  thumbnail: new Blob([`old thumbnail ${id}`], { type: thumbnailType }),
  width: 640,
  height: 800,
  confirmedAttributes: [],
  suggestedAttributes: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
})

afterEach(async () => {
  await database.garments.clear()
  await database.garmentPhotos.clear()
  await database.garmentThumbnails.clear()
})

describe('upgradeCutoutThumbnails', () => {
  it('remakes only the JPEG thumbnails of cut-outs, with transparency, without touching the garment', async () => {
    await garmentRepository.create(garment('white-tee', 'image/jpeg', 'cutout of a white tee'))
    await garmentRepository.create(garment('already-new', 'image/webp', 'cutout already done'))
    await garmentRepository.create(garment('with-background', 'image/jpeg'))
    const garments = await garmentRepository.list()

    expect(await upgradeCutoutThumbnails(garments)).toBe(1)

    const thumbnails = await garmentRepository.thumbnails(['white-tee', 'already-new', 'with-background'])
    expect(thumbnails.get('white-tee')!.type).toBe('image/webp')
    expect(await thumbnails.get('white-tee')!.text()).toBe('thumbnail of cutout of a white tee')
    expect(await thumbnails.get('already-new')!.text()).toBe('old thumbnail already-new')
    expect(await thumbnails.get('with-background')!.text()).toBe('old thumbnail with-background')
    expect((await garmentRepository.get('white-tee'))!.updatedAt).toBe('2026-11-01T00:00:00.000Z')
    // A second run finds nothing left to do.
    expect(await upgradeCutoutThumbnails(await garmentRepository.list())).toBe(0)
  })
})
