import { describe, expect, it } from 'vitest'
import { lookType } from './lookType'

const suggestion = {
  category: 'Accesorio' as const,
  subcategory: 'Bufanda',
  alternatives: [
    { category: 'Parte superior' as const, subcategory: 'Camisa', score: 0.2 },
    { category: 'Abrigo' as const, subcategory: 'Chaqueta', score: 0.1 }
  ]
}

describe('look garment type', () => {
  it('takes the category of the region and the best subcategory within it', () => {
    expect(lookType('outerwear', suggestion)).toEqual({ category: 'Abrigo', subcategory: 'Chaqueta' })
    expect(lookType('top', suggestion)).toEqual({ category: 'Parte superior', subcategory: 'Camisa' })
  })

  it('leaves the subcategory empty when the classifier has none in that category', () => {
    expect(lookType('footwear', suggestion)).toEqual({ category: 'Calzado', subcategory: '' })
  })

  it('keeps the classifier when it agrees, or when the region has no category', () => {
    expect(lookType('accessory', suggestion)).toEqual({ category: 'Accesorio', subcategory: 'Bufanda' })
    expect(lookType('garment', suggestion)).toEqual({ category: 'Accesorio', subcategory: 'Bufanda' })
  })
})
