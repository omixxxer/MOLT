import { describe, expect, it } from 'vitest'
import { ctcDecode, detectTextBoxes, mergeLines, textArea } from './textReader'

const settings = { threshold: 0.3, boxThreshold: 0.6, unclipRatio: 1.5 }

function map(width: number, height: number, regions: Array<[number, number, number, number, number]>) {
  const probabilities = new Float32Array(width * height)
  for (const [left, top, right, bottom, value] of regions) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) probabilities[y * width + x] = value
    }
  }
  return probabilities
}

describe('text detection post-processing', () => {
  it('turns confident regions into boxes grown around the word core', () => {
    const boxes = detectTextBoxes(map(40, 20, [[10, 5, 30, 10, 0.9]]), 40, 20, settings)
    expect(boxes).toHaveLength(1)
    const [box] = boxes
    // A 20×5 core grows by 20·5·1.5 / (2·25) = 3 px on every side.
    expect(box).toMatchObject({ left: 7, top: 2, right: 33, bottom: 13 })
    expect(box!.score).toBeCloseTo(0.9)
  })

  it('drops faint regions and specks', () => {
    const probabilities = map(40, 20, [[2, 2, 12, 8, 0.4], [20, 10, 22, 12, 0.95]])
    expect(detectTextBoxes(probabilities, 40, 20, settings)).toEqual([])
  })

  it('keeps separate words apart', () => {
    const probabilities = map(60, 20, [[2, 5, 20, 10, 0.9], [30, 5, 55, 10, 0.8]])
    expect(detectTextBoxes(probabilities, 60, 20, settings)).toHaveLength(2)
  })

  it('follows tilted text along its direction', () => {
    // A 4 px thick line from (10, 10) down to (50, 50): 45°, about 57 px long.
    const probabilities = new Float32Array(60 * 60)
    for (let step = 0; step <= 40; step += 1) {
      for (let across = -2; across < 2; across += 1) probabilities[(10 + step) * 60 + 10 + step + across] = 0.9
    }
    const [box] = detectTextBoxes(probabilities, 60, 60, settings)
    expect(box!.angle).toBeCloseTo(Math.PI / 4, 1)
    expect(box!.centerX).toBeCloseTo(29.5, 0)
    expect(box!.centerY).toBeCloseTo(30, 0)
    expect(box!.length).toBeGreaterThan(55)
    expect(box!.thickness).toBeLessThan(15)
  })

  it('leaves a letter upright', () => {
    const [box] = detectTextBoxes(map(30, 30, [[10, 8, 16, 18, 0.9]]), 30, 30, settings)
    expect(box!.angle).toBe(0)
  })
})

describe('second look at the label', () => {
  const line = (text: string, left: number, top: number, right: number, bottom: number, score = 0.9) => ({ text, score, bounds: { left, top, right, bottom } })

  it('takes the area with text, grown by half its size', () => {
    expect(textArea([line('M', 100, 100, 120, 140), line('100% COTTON', 90, 150, 170, 170)], 1000, 800))
      .toEqual({ left: 50, top: 60, right: 210, bottom: 210 })
    expect(textArea([line('x', 0, 0, 10, 10, 0.2)], 100, 100)).toBeUndefined()
  })

  it('keeps the more confident reading of a line read twice and adds the new ones', () => {
    const merged = mergeLines([line('EUR4l', 10, 10, 60, 30, 0.6)], [line('EUR 41', 12, 11, 61, 31, 0.9), line('UK 7', 10, 40, 50, 60)])
    expect(merged.map((entry) => entry.text)).toEqual(['EUR 41', 'UK 7'])
  })
})

describe('CTC decoding', () => {
  it('merges repeats, drops blanks and averages the confidence', () => {
    const characters = ['N', 'I', 'K', 'E']
    // Steps: N N blank I K K E (class 0 is the blank, class i is characters[i - 1]).
    const best = [1, 1, 0, 2, 3, 3, 4]
    const logits = best.flatMap((winner) => [0, 1, 2, 3, 4].map((index) => (index === winner ? 0.9 : 0.025)))
    const decoded = ctcDecode(logits, best.length, 5, characters)
    expect(decoded.text).toBe('NIKE')
    expect(decoded.score).toBeCloseTo(0.9)
  })

  it('keeps a doubled letter separated by a blank', () => {
    const best = [1, 0, 1]
    const logits = best.flatMap((winner) => [0, 1].map((index) => (index === winner ? 1 : 0)))
    expect(ctcDecode(logits, best.length, 2, ['O']).text).toBe('OO')
  })
})
