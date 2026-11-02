import { describe, expect, it } from 'vitest'
import { bestMatch, garmentRegions, patchCenter, patchLabels, promptFor, regionMask, type SegmentationMap } from './segmentation'

const classes = ['background', 'top', 'bottom', 'one-piece', 'outerwear', 'footwear', 'accessory']

/** A 16 × 16 map from a function giving each patch's class. */
function map(classOf: (row: number, col: number) => number): SegmentationMap {
  const probabilities = new Float32Array(16 * 16 * classes.length)
  for (let patch = 0; patch < 256; patch += 1) {
    const klass = classOf(Math.floor(patch / 16), patch % 16)
    for (let k = 0; k < classes.length; k += 1) probabilities[patch * classes.length + k] = k === klass ? 0.8 : 0.2 / 6
  }
  return { classes, grid: 16, probabilities }
}

describe('segmentation regions', () => {
  // A tall photo (448 × 896) fills columns 4..11 of the letterboxed grid; the rest is padding.
  const outfit = map((row, col) => (col < 4 || col > 11 ? 3 : row >= 2 && row < 7 ? 1 : row >= 7 && row < 13 ? 2 : row >= 14 ? 5 : 0))

  it('ignores the padding and finds each garment', () => {
    expect(patchCenter(0, 16, 448, 896)).toBeUndefined() // padding column
    expect(patchCenter(16 * 2 + 8, 16, 448, 896)).toEqual([252, 140]) // (8 * 14 + 7 - 56) / 0.25, (2 * 14 + 7) / 0.25
    const labels = patchLabels(outfit, 448, 896)
    expect(labels[0]).toBe(0) // padding counts as background, whatever the map says
    expect(garmentRegions(outfit, 448, 896, false).map((region) => [region.classId, region.patches.length]))
      .toEqual([['bottom', 48], ['top', 40], ['footwear', 16]])
    const [single] = garmentRegions(outfit, 448, 896, true)
    expect(single).toMatchObject({ classId: 'garment' })
    expect(single!.patches).toHaveLength(88) // top and bottom touch; the shoes are apart, one row below
  })

  it('places points on the garment and just outside it', () => {
    const top = garmentRegions(outfit, 448, 896, false).find((region) => region.classId === 'top')!
    const prompt = promptFor(top, 16, 448, 896)
    expect(prompt.labels).toEqual([1, 1, 1, 1, 0, 0, 0])
    const labels = patchLabels(outfit, 448, 896)
    const classAt = ([x, y]: [number, number]) => {
      const col = Math.floor((x * 0.25 + 56) / 14)
      const row = Math.floor((y * 0.25) / 14)
      return labels[row * 16 + col]
    }
    expect(prompt.points.slice(0, 4).every((point) => classAt(point) === 1)).toBe(true)
    expect(prompt.points.slice(4).every((point) => classAt(point) !== 1)).toBe(true)
  })

  it('draws a region mask and picks the candidate that matches it', () => {
    const top = garmentRegions(outfit, 448, 896, false).find((region) => region.classId === 'top')!
    const mask = regionMask(top, 16, 448, 896, 8, 16, 0)
    // 8 × 16 mask of the photo: the top covers rows 2..6 of 16.
    expect(Array.from(mask.slice(8, 16))).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(mask.slice(16, 24))).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
    const whole = new Uint8Array(mask.length).fill(1)
    expect(bestMatch([whole, mask, new Uint8Array(mask.length)], mask)).toBe(1)
  })
})
