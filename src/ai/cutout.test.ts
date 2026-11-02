import { describe, expect, it } from 'vitest'
import { alphaBox, outlineFound, plainBackgroundAlpha, singleGarmentRegion } from './cutout'
import { regionMask, type SegmentationMap } from './segmentation'

const classes = ['background', 'top', 'bottom', 'one-piece', 'outerwear', 'footwear', 'accessory']

/** A 16 × 16 map of a square photo from a function giving each patch's class. */
function map(classOf: (row: number, col: number) => number): SegmentationMap {
  const probabilities = new Float32Array(16 * 16 * classes.length)
  for (let patch = 0; patch < 256; patch += 1) {
    const klass = classOf(Math.floor(patch / 16), patch % 16)
    for (let k = 0; k < classes.length; k += 1) probabilities[patch * classes.length + k] = k === klass ? 0.8 : 0.2 / 6
  }
  return { classes, grid: 16, probabilities }
}

describe('which region to cut out of a photo of one garment', () => {
  const inBox = (row: number, col: number, top: number, bottom: number) => row >= top && row < bottom && col >= 4 && col < 12

  it('takes every garment area together, even read as several classes', () => {
    // A hoodie whose sleeves the head sees as outerwear; a shoe read as bits of several classes.
    const hoodie = map((row, col) => (inBox(row, col, 3, 13) ? (col === 4 || col === 11 ? 4 : 1) : 0))
    expect(singleGarmentRegion(hoodie, 512, 512)).toMatchObject({ classId: 'garment' })
    expect(singleGarmentRegion(hoodie, 512, 512)!.patches).toHaveLength(10 * 8)
    const shoe = map((row, col) => (inBox(row, col, 6, 10) ? (col < 7 ? 5 : col < 9 ? 2 : 6) : 0))
    expect(singleGarmentRegion(shoe, 512, 512)!.patches).toHaveLength(4 * 8)
  })

  it('does not cut out a close-up', () => {
    expect(singleGarmentRegion(map(() => 1), 512, 512)).toBeUndefined()
  })

  it('shrinks a region mask to its interior', () => {
    const square = { classId: 'top', confidence: 1, patches: Array.from({ length: 16 * 16 }, (_, p) => p).filter((p) => inBox(Math.floor(p / 16), p % 16, 4, 12)) }
    const count = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0)
    expect(count(regionMask(square, 16, 512, 512, 16, 16, 0))).toBe(64)
    expect(count(regionMask(square, 16, 512, 512, 16, 16, -1))).toBe(36)
    expect(count(regionMask(square, 16, 512, 512, 16, 16, 1))).toBe(100)
  })
})

describe('cut-out helpers', () => {
  it('removes a plain backdrop connected to the border, keeping light parts inside the garment', () => {
    // 20 × 20 white backdrop with a 10 × 10 navy garment that has a white logo in the middle.
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < 400; i += 1) {
      const x = i % 20
      const y = Math.floor(i / 20)
      const garment = x >= 5 && x < 15 && y >= 5 && y < 15
      const logo = x >= 9 && x < 11 && y >= 9 && y < 11
      data.set(garment && !logo ? [30, 40, 80, 255] : [245, 245, 242, 255], i * 4)
    }
    const alpha = plainBackgroundAlpha(data, 20, 20)!
    expect(alpha[0]).toBe(0)
    expect(alpha[10 * 20 + 10]).toBe(255) // the logo is not connected to the border
    expect(alpha[5 * 20 + 5]).toBe(140) // soft 1 px edge
    expect(alphaBox(alpha, 20, 20, 128, 0)).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })

  it('keeps a light garment on white whole where the segmentation sees it, and drops specks', () => {
    // 20 × 20: white backdrop, a light grey garment (within the plain tolerance of white) and a grey speck.
    const data = new Uint8ClampedArray(20 * 20 * 4)
    const garment = new Uint8Array(400)
    for (let i = 0; i < 400; i += 1) {
      const x = i % 20
      const y = Math.floor(i / 20)
      const inGarment = x >= 5 && x < 15 && y >= 5 && y < 15
      const speck = x === 1 && y === 18
      garment[i] = inGarment ? 1 : 0
      data.set(inGarment ? [215, 215, 212, 255] : speck ? [120, 120, 120, 255] : [245, 245, 242, 255], i * 4)
    }
    // Without the garment mask the light grey is taken for backdrop; with it, it stays.
    expect(plainBackgroundAlpha(data, 20, 20)![10 * 20 + 10]).toBe(0)
    const alpha = plainBackgroundAlpha(data, 20, 20, 34, { region: garment, interior: garment })!
    expect(alpha[10 * 20 + 10]).toBe(255)
    expect(alphaBox(alpha, 20, 20, 128, 0)).toEqual({ x: 5, y: 5, width: 10, height: 10 })
    expect(alpha[18 * 20 + 1]).toBe(0)
  })

  it('stays as plain as before when the garment is dark: backdrop in shadow inside the coarse region still goes', () => {
    // A navy garment in rows 6..13; the coarse region (rows 4..15) also covers some slightly grey backdrop.
    const data = new Uint8ClampedArray(20 * 20 * 4)
    const garment = new Uint8Array(400)
    for (let i = 0; i < 400; i += 1) {
      const x = i % 20
      const y = Math.floor(i / 20)
      garment[i] = x >= 4 && x < 16 && y >= 4 && y < 16 ? 1 : 0
      const navy = x >= 6 && x < 14 && y >= 6 && y < 14
      data.set(navy ? [30, 40, 80, 255] : y % 2 ? [228, 228, 225, 255] : [245, 245, 242, 255], i * 4)
    }
    const alpha = plainBackgroundAlpha(data, 20, 20, 34, { region: garment, interior: garment })!
    expect(alpha[4 * 20 + 4]).toBe(0) // backdrop inside the coarse region
    expect(alphaBox(alpha, 20, 20, 128, 0)).toEqual({ x: 6, y: 6, width: 8, height: 8 })
  })

  it('does nothing on a busy backdrop', () => {
    const data = new Uint8ClampedArray(20 * 20 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256))
    expect(plainBackgroundAlpha(data, 20, 20)).toBeUndefined()
  })

  it('rejects an outline that is the background or misses the garment', () => {
    const region = new Uint8Array(100).map((_, i) => (i % 10 >= 3 && i % 10 < 7 && i >= 30 && i < 70 ? 1 : 0))
    expect(outlineFound(region, region, 10, 10)).toBe(true)
    expect(outlineFound(new Uint8Array(100).fill(1), region, 10, 10)).toBe(false)
    expect(outlineFound(new Uint8Array(100), region, 10, 10)).toBe(false)
  })
})
