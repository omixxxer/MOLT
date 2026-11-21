import { describe, expect, it } from 'vitest'
import { dragCrop, fitAspect, FULL_CROP, isFullCrop, MIN_CROP, rotatedSize, turn } from './photoEdit'

describe('photo editing', () => {
  it('turns in steps of 90° and swaps the sides', () => {
    expect(turn(0, -90)).toBe(270)
    expect(turn(270, 90)).toBe(0)
    expect(rotatedSize(4000, 3000, 90)).toEqual({ width: 3000, height: 4000 })
    expect(rotatedSize(4000, 3000, 180)).toEqual({ width: 4000, height: 3000 })
  })

  it('fits the largest 4:5 frame in a landscape photo, centred', () => {
    // 4000 × 3000 photo: a 4:5 frame is 2400 × 3000 px, 0.6 of the width and the whole height.
    const crop = fitAspect(FULL_CROP, 4 / 5, 4000, 3000)
    expect(crop.width).toBeCloseTo(0.6)
    expect(crop.height).toBeCloseTo(1)
    expect(crop.x).toBeCloseTo(0.2)
    expect(crop.y).toBeCloseTo(0)
    expect(fitAspect(crop, undefined, 4000, 3000)).toBe(crop)
  })

  it('moves the frame inside the photo and resizes it by its edges and corners', () => {
    const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }
    expect(dragCrop(start, 'move', 0.6, -0.5, undefined, 100, 100)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 })
    const wider = dragCrop(start, 'e', 0.1, 0, undefined, 100, 100)
    expect(wider.width).toBeCloseTo(0.6)
    expect(wider.x).toBeCloseTo(0.2)
    const fromTopLeft = dragCrop(start, 'nw', -0.1, -0.1, undefined, 100, 100)
    expect(fromTopLeft.x).toBeCloseTo(0.1)
    expect(fromTopLeft.width).toBeCloseTo(0.6)
    // Never smaller than MIN_CROP, never out of the photo.
    expect(dragCrop(start, 'w', 1, 0, undefined, 100, 100).width).toBeCloseTo(MIN_CROP)
    expect(dragCrop(start, 'se', 5, 5, undefined, 100, 100)).toMatchObject({ width: 0.8, height: 0.8 })
  })

  it('keeps the aspect from the opposite corner, which stays where it was', () => {
    // A square photo and a square frame: dragging the bottom right corner right keeps it square.
    const start = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }
    const crop = dragCrop(start, 'se', 0.2, 0, 1, 1000, 1000)
    expect(crop.x).toBeCloseTo(0.1)
    expect(crop.y).toBeCloseTo(0.1)
    expect(crop.width).toBeCloseTo(0.6)
    expect(crop.height).toBeCloseTo(0.6)
    // Up to the photo's edge only.
    const largest = dragCrop(start, 'se', 5, 5, 1, 1000, 1000)
    expect(largest.width).toBeCloseTo(0.9)
    expect(largest.height).toBeCloseTo(0.9)
  })

  it('knows a frame that leaves the photo as it is', () => {
    expect(isFullCrop(FULL_CROP)).toBe(true)
    expect(isFullCrop({ x: 0, y: 0, width: 1, height: 0.9 })).toBe(false)
  })
})
