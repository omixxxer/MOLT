import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClothingAnalysisSuggestion } from '../../ai/clothingAnalyzer'
import { database } from '../../db/database'
import type { GarmentCategory } from '../../types/domain'
import {
  addPhotos,
  clearBatch,
  garmentSize,
  getBatch,
  mergeWithPrevious,
  savable,
  saveBatch,
  splitPhoto,
  toggleLabel
} from './batchQueue'

// Each test photo is a File whose name says what the "model" sees: category|subcategory|colour|seconds|text.
function suggestion(file: Blob): ClothingAnalysisSuggestion {
  const [category, subcategory, color, , text] = (file as File).name.split('|')
  return {
    category: category as GarmentCategory,
    subcategory: subcategory!,
    colors: [color!],
    alternatives: [],
    confidenceByAttribute: { category: 0.9 },
    unknownAttributes: [],
    modelId: 'molt/dinov2-small-heads',
    modelVersion: 'heads-test',
    calibrated: true,
    segmentations: [{ classes: [], grid: 16, probabilities: new Float32Array(0) }],
    textByPhoto: [text ? text.split(';').map((line) => ({ text: line, score: 0.95 })) : []],
    analyzedAt: '2026-10-31T12:00:00.000Z'
  }
}

vi.mock('../../ai/clothingAnalyzer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../ai/clothingAnalyzer')>(),
  analyzeGarmentImage: vi.fn(async (file: Blob) => suggestion(file))
}))
vi.mock('../../ai/cutout', () => ({
  cutOutGarments: vi.fn(async () => [{ image: new Blob(['cutout']), width: 10, height: 10, coverage: 0.4, region: { classId: 1, patches: [], confidence: 1 } }]),
  cutoutColors: vi.fn(async () => [{ color: 'Negro', share: 0.9 }])
}))
vi.mock('../../ai/photoTime', () => ({
  captureTime: vi.fn(async (file: File) => {
    const seconds = file.name.split('|')[3]
    return seconds ? Date.UTC(2026, 9, 31, 12, 0, Number(seconds)) : undefined
  })
}))
vi.mock('../../db/imageProcessing', () => ({
  reducePhoto: async (photo: Blob) => photo,
  createThumbnail: async () => ({ thumbnail: new Blob(['thumbnail']), width: 120, height: 180 })
}))

const photo = (name: string) => new File(['photo'], name, { type: 'image/jpeg' })

async function analysed() {
  await vi.waitFor(() => expect(getBatch().running).toBe(false))
}

afterEach(async () => {
  clearBatch()
  await database.garments.clear()
})

describe('many garments at once', () => {
  it('groups the photos of each garment with its label as they are analysed, and cuts out the main photo', async () => {
    await addPhotos([
      photo('Parte superior|Sudadera con capucha|Negro|0'),
      photo('Parte superior|Sudadera con capucha|Negro|10'),
      photo('Parte superior|Camiseta|Blanco|15|95% COTTON 5% ELASTANE;MADE IN PORTUGAL;M'),
      photo('Parte inferior|Vaqueros|Azul|120')
    ])
    await analysed()
    const { garments } = getBatch()
    expect(garments.map((garment) => [garment.photoIds.length, garment.labelIds.length])).toEqual([[2, 1], [1, 0]])
    expect(garments.every((garment) => garment.cutoutStatus === 'done' && garment.cutout)).toBe(true)
    // Colours measured on the cut-out replace those of the coarse map.
    expect(garments[1]!.colors).toEqual(['Negro'])
    expect(garmentSize(garments[0]!)?.value).toBe('M')
  })

  it('lets the review fix the grouping', async () => {
    await addPhotos([
      photo('Parte superior|Camiseta|Blanco|0'),
      photo('Parte superior|Camiseta|Blanco|8|MADE IN SPAIN;100% ALGODON;L'),
      photo('Parte superior|Camiseta|Rojo|12')
    ])
    await analysed()
    expect(getBatch().garments.map((garment) => garment.photoIds.length)).toEqual([1, 1])

    const [first, second] = getBatch().garments
    mergeWithPrevious(second!.id)
    expect(getBatch().garments).toHaveLength(1)
    const merged = getBatch().garments[0]!
    expect(merged.photoIds).toHaveLength(2)

    // The red photo goes back to a garment of its own; the label turns out to be a photo.
    splitPhoto(merged.id, merged.photoIds[1]!)
    await analysed()
    expect(getBatch().garments.map((garment) => garment.photoIds.length)).toEqual([1, 1])
    toggleLabel(first!.id, first!.labelIds[0]!)
    expect(getBatch().garments[0]).toMatchObject({ labelIds: [] })
    expect(getBatch().garments[0]!.photoIds).toHaveLength(2)
  })

  it('saves the chosen garments with their photos, label, cut-out and what the label says', async () => {
    await addPhotos([
      photo('Parte superior|Camiseta|Blanco|0'),
      photo('Parte superior|Camiseta|Blanco|5|NIKE;MADE IN VIETNAM;95% COTTON 5% ELASTANE;XL'),
      photo('Calzado|Zapatillas|Gris|200')
    ])
    await analysed()
    expect(savable(getBatch())).toHaveLength(2)

    const progress = vi.fn()
    expect(await saveBatch(progress)).toBe(2)
    expect(progress).toHaveBeenLastCalledWith(2)
    const saved = await database.garments.orderBy('category').toArray()
    expect(saved.map((garment) => garment.code)).toEqual(['ZAP-001', 'CAM-001'])
    expect(saved[1]).toMatchObject({
      category: 'Parte superior',
      subcategory: 'Camiseta',
      brand: 'Nike',
      size: 'XL',
      composition: '95 % algodón, 5 % elastano',
      colors: ['Negro']
    })
    expect(saved[1]!.labelImage).toBeDefined()
    expect(saved[1]!.cutout).toBeDefined()
    expect(saved[1]!.analysis?.sourcesByAttribute).toMatchObject({ size: 'paddle-ocr', brand: 'paddle-ocr' })
  })
})
