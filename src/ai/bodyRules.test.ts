import { describe, expect, it } from 'vitest'
import { bodyClass, cleanAlpha, footPatches, footPrompt, mergeByClass, PART, type BodyMap, type Landmark } from './bodyRules'
import type { Region } from './segmentation'

/** A standing person: shoulders at 25 %, hips at 50 %, knees at 72 %, ankles at 92 % of the height. */
function standing(visibility = 0.9): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.1, visibility }))
  const set = (index: number, x: number, y: number) => { points[index] = { x, y, visibility } }
  set(11, 0.4, 0.25); set(12, 0.6, 0.25)
  set(23, 0.45, 0.5); set(24, 0.55, 0.5)
  set(25, 0.45, 0.72); set(26, 0.55, 0.72)
  set(27, 0.45, 0.92); set(28, 0.55, 0.92)
  set(29, 0.44, 0.95); set(30, 0.56, 0.95)
  set(31, 0.4, 0.97); set(32, 0.6, 0.97)
  return points
}

/** A mask of the rows between two heights (fractions). */
function band(from: number, to: number, width = 20, height = 100): Uint8Array {
  return Uint8Array.from({ length: width * height }, (_, i) => {
    const y = (Math.floor(i / width) + 0.5) / height
    return y >= from && y < to ? 1 : 0
  })
}

describe('body rules', () => {
  it('names a one-piece region by where it sits on the body', () => {
    const pose = standing()
    expect(bodyClass('one-piece', band(0.25, 0.48), 20, 100, pose)).toBe('top')
    expect(bodyClass('one-piece', band(0.52, 0.9), 20, 100, pose)).toBe('bottom')
    expect(bodyClass('one-piece', band(0.25, 0.7), 20, 100, pose)).toBe('one-piece')
  })

  it('corrects a top below the hips, a bottom above them and footwear above the knees', () => {
    const pose = standing()
    expect(bodyClass('top', band(0.55, 0.9), 20, 100, pose)).toBe('bottom')
    expect(bodyClass('bottom', band(0.26, 0.45), 20, 100, pose)).toBe('top')
    expect(bodyClass('footwear', band(0.55, 0.65), 20, 100, pose)).toBe('bottom')
    expect(bodyClass('footwear', band(0.9, 0.99), 20, 100, pose)).toBe('footwear')
    expect(bodyClass('outerwear', band(0.25, 0.45), 20, 100, pose)).toBe('outerwear')
  })

  it('keeps the class when the hips are not in view', () => {
    expect(bodyClass('one-piece', band(0.25, 0.48), 20, 100, standing(0.2))).toBe('one-piece')
  })

  it('asks for the shoes at the heels and toes, and not at the shin', () => {
    const prompt = footPrompt(standing(), 200, 400)!
    expect(prompt.labels).toEqual([1, 1, 1, 0, 1, 1, 1, 0])
    expect(prompt.points[0]).toEqual([0.44 * 200, 0.95 * 400])
    expect(prompt.points[3]![1]).toBeCloseTo((0.92 + 0.72) / 2 * 400)
    expect(footPrompt(standing(0.1), 200, 400)).toBeUndefined()
    expect(footPatches(standing(), 16, 200, 400).length).toBeGreaterThan(0)
  })

  it('merges the pieces of a garment but keeps accessories apart', () => {
    const regions: Region[] = [
      { classId: 'bottom', patches: [1, 2, 3], confidence: 0.9 },
      { classId: 'bottom', patches: [10], confidence: 0.5 },
      { classId: 'accessory', patches: [20], confidence: 0.8 },
      { classId: 'accessory', patches: [30], confidence: 0.8 }
    ]
    const merged = mergeByClass(regions)
    expect(merged.map((region) => region.classId)).toEqual(['bottom', 'accessory', 'accessory'])
    expect(merged[0]!.patches).toEqual([1, 2, 3, 10])
    expect(merged[0]!.confidence).toBeCloseTo(0.8)
  })

  it('takes skin and hair out of a cut-out, and the background only when asked', () => {
    // Body parts 2 × 2: hair, clothes / background, body skin.
    const body: BodyMap = { width: 2, height: 2, parts: Uint8Array.from([PART.hair, PART.clothes, PART.background, PART.bodySkin]) }
    const alpha = new Uint8ClampedArray(16).fill(255)
    expect(cleanAlpha(alpha, 4, 4, body, false)).toBe(8)
    expect([...alpha.slice(0, 4)]).toEqual([0, 0, 255, 255])
    expect(cleanAlpha(alpha, 4, 4, body, true)).toBe(4)
    expect(alpha.reduce((sum, value) => sum + (value ? 1 : 0), 0)).toBe(4)
  })
})
