import { describe, expect, it } from 'vitest'
import { addPhoto, isLabelPhoto, type PhotoFacts, type PhotoGroup } from './batchGrouping'

const line = (text: string, score = 0.95) => ({ text, score })
const at = (seconds: number) => Date.UTC(2026, 9, 31, 12, 0, seconds)
const photo = (id: string, category: string, colors: string[], seconds?: number, label = false): PhotoFacts =>
  ({ id, category, colors, label, ...(seconds !== undefined ? { time: at(seconds) } : {}) })
const group = (photos: PhotoFacts[]) => photos.reduce<PhotoGroup[]>(addPhoto, [])
const summary = (groups: PhotoGroup[]) => groups.map((entry) => [...entry.photoIds, ...entry.labelIds.map((id) => `${id}(etiqueta)`)].join('+'))

describe('label photos', () => {
  it('recognises labels by their text', () => {
    expect(isLabelPhoto([line('95% COTTON 5% ELASTANE')])).toBe(true)
    expect(isLabelPhoto([line('ESSENTIALS'), line('FEAR OF GOD'), line('Made in Vietnam'), line('M')])).toBe(true)
    expect(isLabelPhoto([line('EUR 41'), line('MADE IN CHINA')])).toBe(true)
  })

  it('does not take a printed slogan or stray letters for a label', () => {
    expect(isLabelPhoto([line('ESSENTIALS')])).toBe(false)
    expect(isLabelPhoto([line('JUST DO IT'), line('NIKE')])).toBe(false)
    expect(isLabelPhoto([line('O', 0.3), line('.COTO', 0.5)])).toBe(false)
    // The back print of one of the user's hoodies.
    const print = ['Eternal Echoes', 'The Language of Lost Souls', 'Charleton, November 1991', 'A LOVE BEYOND THE GRAVE', 'HIDDEN MANUSCRIPTS', 'No. 22/50']
    expect(isLabelPhoto(print.map((text) => line(text)))).toBe(false)
  })
})

describe('grouping photos into garments', () => {
  it('joins photos of one garment taken seconds apart and starts a new garment for the next', () => {
    const groups = group([
      photo('front', 'top', ['Negro'], 0),
      photo('back', 'top', ['Negro', 'Gris'], 12),
      photo('jeans', 'bottom', ['Azul'], 30),
      photo('jeans-back', 'bottom', ['Azul'], 41),
      photo('shirt', 'top', ['Blanco'], 120)
    ])
    expect(summary(groups)).toEqual(['front+back', 'jeans+jeans-back', 'shirt'])
  })

  it('keeps apart garments shot in a row when the type or colour changes, or too much time passed', () => {
    expect(summary(group([photo('black', 'top', ['Negro'], 0), photo('burgundy', 'top', ['Rojo'], 10)]))).toEqual(['black', 'burgundy'])
    expect(summary(group([photo('tee', 'top', ['Negro'], 0), photo('trousers', 'bottom', ['Negro'], 10)]))).toEqual(['tee', 'trousers'])
    expect(summary(group([photo('a', 'top', ['Negro'], 0), photo('b', 'top', ['Negro'], 90)]))).toEqual(['a', 'b'])
  })

  it('without capture times every photo is a garment', () => {
    expect(summary(group([photo('a', 'top', ['Negro']), photo('b', 'top', ['Negro'])]))).toEqual(['a', 'b'])
  })

  it('puts a label with the garment before it, or with the next one when it was taken first', () => {
    expect(summary(group([photo('tee', 'top', ['Negro'], 0), photo('label', '', [], 8, true), photo('jeans', 'bottom', ['Azul'], 60)])))
      .toEqual(['tee+label(etiqueta)', 'jeans'])
    expect(summary(group([photo('tee', 'top', ['Negro'], 0), photo('label', '', [], 200, true), photo('jeans', 'bottom', ['Azul'], 205)])))
      .toEqual(['tee', 'jeans+label(etiqueta)'])
    expect(summary(group([photo('label', '', [], undefined, true), photo('tee', 'top', ['Negro'])]))).toEqual(['tee+label(etiqueta)'])
  })

  it('a photo after a label still continues that garment', () => {
    expect(summary(group([photo('front', 'top', ['Negro'], 0), photo('label', '', [], 5, true), photo('back', 'top', ['Negro'], 15)])))
      .toEqual(['front+back+label(etiqueta)'])
  })
})
