import { describe, expect, it } from 'vitest'
import { cleanMask, exposureGain, OUT_HEIGHT, OUT_WIDTH, placement, straightenAngle } from './recompose'

/** A filled rectangle (w × h) turned by `degrees` (clockwise on screen, y down) about the centre of a size × size mask. */
function turnedRectangle(size: number, w: number, h: number, degrees: number): Uint8Array {
  const mask = new Uint8Array(size * size)
  const angle = (degrees * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Back to the rectangle's own axes.
      const dx = x - size / 2
      const dy = y - size / 2
      const u = dx * cos + dy * sin
      const v = -dx * sin + dy * cos
      if (Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2) mask[y * size + x] = 1
    }
  }
  return mask
}

describe('recomposed garment picture', () => {
  it('takes stray specks out of the cut-out and keeps the garment', () => {
    const width = 60
    const height = 60
    const alpha = new Uint8Array(width * height)
    for (let y = 10; y < 50; y += 1) for (let x = 10; x < 50; x += 1) alpha[y * width + x] = 255
    alpha[2 * width + 2] = 255
    alpha[57 * width + 57] = 200
    const mask = cleanMask(alpha, width, height)
    expect(mask[2 * width + 2]).toBe(0)
    expect(mask[57 * width + 57]).toBe(0)
    expect(mask[30 * width + 30]).toBe(1)
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(40 * 40)
  })

  it('turns a garment photographed a little askew, and leaves alone one upright, round or very turned', () => {
    // A pair of trousers (tall) turned 12° clockwise must be turned back 12°.
    expect(straightenAngle(turnedRectangle(200, 50, 140, 12), 200)).toBeCloseTo(12, 0)
    expect(straightenAngle(turnedRectangle(200, 50, 140, -8), 200)).toBeCloseTo(-8, 0)
    // Lying flat (wider than tall) counts as straight too.
    expect(straightenAngle(turnedRectangle(200, 140, 50, 10), 200)).toBeCloseTo(10, 0)
    expect(straightenAngle(turnedRectangle(200, 50, 140, 0), 200)).toBe(0)
    expect(straightenAngle(turnedRectangle(200, 50, 140, 2), 200)).toBe(0)
    expect(straightenAngle(turnedRectangle(200, 50, 140, 40), 200)).toBe(0)
    // A square (a T-shirt with its sleeves out is nearly one) has no direction to straighten.
    expect(straightenAngle(turnedRectangle(200, 100, 100, 15), 200)).toBe(0)
  })

  it('lifts a photo that is dark all over a little, and not one with a bright part', () => {
    expect(exposureGain(Array.from({ length: 100 }, (_, i) => 60 + i))).toBeCloseTo(1.25)
    expect(exposureGain(Array.from({ length: 100 }, (_, i) => 100 + i))).toBeCloseTo(235 / 198, 2)
    // A black jacket on a lit bed: the bed is bright, so the photo is left as it is.
    expect(exposureGain([...Array.from({ length: 95 }, () => 30), 230, 230, 230, 230, 230])).toBe(1)
    expect(exposureGain([])).toBe(1)
  })

  it('sizes each kind of garment the same way, centred', () => {
    const shirt = placement('Parte superior', 400, 300)
    const sameShirtSmaller = placement('Parte superior', 200, 150)
    expect(shirt.width).toBeCloseTo(sameShirtSmaller.width)
    expect(shirt.x + shirt.width / 2).toBeCloseTo(OUT_WIDTH / 2)
    // A belt is drawn smaller than a coat of the same shape.
    expect(placement('Accesorio', 300, 300).height).toBeLessThan(placement('Abrigo', 300, 300).height)
    expect(placement('Abrigo', 300, 300).height).toBeLessThanOrEqual(OUT_HEIGHT * 0.8 + 1e-9)
  })
})
