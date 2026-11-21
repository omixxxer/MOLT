import { describe, expect, it } from 'vitest'
import { chooseRefined, distanceInside, refinePrompt, refineView } from './refine'

// A red garment (20..59 × 20..59) on a blue and yellow striped bedspread; the cut-out also took a strip of the
// bedspread on its right (60..71 × 30..49).
const W = 80
const H = 80
const garment = (x: number, y: number) => x >= 20 && x < 60 && y >= 20 && y < 60
const strip = (x: number, y: number) => x >= 60 && x < 72 && y >= 30 && y < 50

function photo() {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4
      const colour = garment(x, y) ? [200, 30, 30] : Math.floor(x / 4) % 2 ? [30, 40, 200] : [230, 220, 40]
      data.set([...colour, 255], i)
    }
  }
  return data
}

const maskOf = (inside: (x: number, y: number) => boolean) => Uint8Array.from({ length: W * H }, (_, i) => (inside(i % W, Math.floor(i / W)) ? 1 : 0))

describe('refine', () => {
  it('measures the distance to the outside', () => {
    const distance = distanceInside(maskOf(garment), W, H)
    expect(distance[0]).toBe(0)
    expect(distance[40 * W + 40]).toBeCloseTo(20, 0)
    expect(distance[20 * W + 40]).toBe(1)
  })

  it('finds the strip of bedspread and keeps the garment', () => {
    const view = refineView(photo(), maskOf((x, y) => garment(x, y) || strip(x, y)), W, H)
    let inStrip = 0
    let inGarment = 0
    for (let i = 0; i < view.suspicious.length; i += 1) {
      if (!view.suspicious[i]) continue
      if (strip(i % W, Math.floor(i / W))) inStrip += 1
      if (garment(i % W, Math.floor(i / W))) inGarment += 1
    }
    expect(inStrip).toBe(12 * 20)
    expect(inGarment).toBe(0)
  })

  it('asks inside the garment and on the strip', () => {
    const view = refineView(photo(), maskOf((x, y) => garment(x, y) || strip(x, y)), W, H)
    const prompt = refinePrompt(view, W, H)!
    const positives = prompt.points.filter((_, k) => prompt.labels[k] === 1)
    const negatives = prompt.points.filter((_, k) => prompt.labels[k] === 0)
    expect(positives.length).toBeGreaterThan(0)
    expect(positives.every(([x, y]) => garment(Math.floor(x), Math.floor(y)))).toBe(true)
    expect(negatives.some(([x, y]) => strip(Math.floor(x), Math.floor(y)))).toBe(true)
    expect(negatives.every(([x, y]) => !garment(Math.floor(x), Math.floor(y)))).toBe(true)
  })

  it('with the segmentation map, finds a bedspread that fills much of the cut-out', () => {
    // A small garment (30..49) and a cut-out that took most of the bedspread around it (4..75): the bedspread's
    // colours are most of the cut-out's inside, so without the map they pass for the garment's.
    const small = (x: number, y: number) => x >= 30 && x < 50 && y >= 30 && y < 50
    const data = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i += 1) {
      const x = i % W
      data.set([...(small(x, Math.floor(i / W)) ? [200, 30, 30] : Math.floor(x / 4) % 2 ? [30, 40, 200] : [230, 220, 40]), 255], i * 4)
    }
    const mask = maskOf((x, y) => x >= 4 && x < 76 && y >= 4 && y < 76)
    const share = (view: ReturnType<typeof refineView>) => {
      let inBand = 0
      let inGarment = 0
      for (let i = 0; i < view.suspicious.length; i += 1) {
        if (!view.suspicious[i]) continue
        if (small(i % W, Math.floor(i / W))) inGarment += 1
        else inBand += 1
      }
      return { inBand: inBand / (72 * 72 - 20 * 20), inGarment }
    }
    // The map's patches are coarser than the garment: a little larger.
    const map = { region: maskOf((x, y) => x >= 25 && x < 55 && y >= 25 && y < 55), interior: maskOf((x, y) => x >= 30 && x < 50 && y >= 30 && y < 50) }
    const without = share(refineView(data, mask, W, H))
    const withMap = share(refineView(data, mask, W, H, map))
    expect(without.inBand).toBeLessThan(0.5)
    expect(withMap.inBand).toBeGreaterThan(0.9)
    expect(withMap.inGarment).toBe(0)
  })

  it('keeps the outline without the strip, and none that loses the garment or does no better', () => {
    const view = refineView(photo(), maskOf((x, y) => garment(x, y) || strip(x, y)), W, H)
    const same = maskOf((x, y) => garment(x, y) || strip(x, y))
    const clean = maskOf(garment)
    const half = maskOf((x, y) => garment(x, y) && x < 40)
    expect(chooseRefined([same, half, clean], view, W, H)).toBe(2)
    expect(chooseRefined([same, half], view, W, H)).toBeUndefined()
  })
})
