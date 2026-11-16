import { describe, expect, it } from 'vitest'
import { colorName, garmentColors } from './colors'

function image(width: number, height: number, colorAt: (x: number, y: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y)
      data.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height } as ImageData
}

describe('garment colours', () => {
  it('names colours the old rules could not', () => {
    expect(colorName(240, 160, 190)).toBe('Rosa')
    expect(colorName(30, 40, 85)).toBe('Azul marino')
    expect(colorName(235, 205, 55)).toBe('Amarillo')
    expect(colorName(210, 35, 30)).toBe('Rojo')
    expect(colorName(20, 20, 22)).toBe('Negro')
  })

  it('measures only the garment pixels when there is a mask', () => {
    // A navy garment with white stripes (a third of it) on a red wall: the wall must not count.
    const photo = image(30, 30, (x, y) => (x < 6 || x >= 24 ? [190, 30, 40] : y % 3 === 0 ? [245, 245, 240] : [30, 40, 80]))
    const mask = new Uint8Array(30 * 30).map((_, i) => (i % 30 >= 6 && i % 30 < 24 ? 1 : 0))
    const colors = garmentColors(photo, mask)
    expect(colors.map((entry) => entry.color)).toEqual(['Azul marino', 'Blanco'])
    expect(colors[0]!.share).toBeCloseTo(2 / 3)
  })

  it('falls back to the border heuristic without a usable mask', () => {
    const photo = image(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [236, 152, 180] : [250, 250, 250]))
    expect(garmentColors(photo).map((entry) => entry.color)).toEqual(['Rosa'])
    expect(garmentColors(photo, new Uint8Array(40 * 40)).map((entry) => entry.color)).toEqual(['Rosa'])
  })
})
