import { describe, expect, it } from 'vitest'
import { categoryOfSubcategory, subcategoryOptions } from './taxonomy'

describe('subcategory options', () => {
  it('offer «Chaqueta» under «Parte superior» too, and keep it under «Abrigo»', () => {
    expect(subcategoryOptions('top')).toContain('Chaqueta')
    expect(subcategoryOptions('top').at(-1)).toBe('Chaqueta')
    expect(subcategoryOptions('outerwear')).toContain('Chaqueta')
    // For the model it is still a coat.
    expect(categoryOfSubcategory('chaqueta')).toBe('outerwear')
    expect(subcategoryOptions(undefined)).toEqual([])
  })
})
