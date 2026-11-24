import { describe, expect, it } from 'vitest'
import type { Garment, GarmentRole } from '../types/domain'
import { mainColour, outfitName, outfitNames } from './outfitNames'

function garment(id: string, role: GarmentRole, colors: string[], styles: string[] = []): Garment {
  return {
    id, name: `${id} ${colors.join(' ')}`, category: 'Parte superior', subcategory: id, colors, seasons: [], styles, dressLevels: ['Diario'], role,
    width: 100, height: 100, confirmedAttributes: [], suggestedAttributes: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const black = [garment('chaqueta', 'Capa', ['Negro']), garment('body', 'Top', ['Negro']), garment('falda', 'Bottom', ['Negro']), garment('botas', 'Calzado', ['Negro'])]
const november = new Date('2026-11-24T12:00:00')

describe('outfit names', () => {
  it('names the outfit by its colour, plan and season, never by listing its garments', () => {
    const names = outfitNames(black, { occasion: 'Arreglado', date: november })
    expect(names).toContain('Cena en negro')
    expect(names).toContain('Total black')
    expect(names).toContain('Cena de otoño')
    for (const name of names) {
      expect(name).not.toMatch(/chaqueta|body|falda|botas/i)
      expect(name.length).toBeLessThanOrEqual(40)
    }
  })

  it('gives the same outfit the same first name, and another one on asking again', () => {
    const first = outfitName(black, { occasion: 'Arreglado', date: november })
    expect(outfitName([...black].reverse(), { occasion: 'Arreglado', date: november })).toBe(first)
    const others = [1, 2, 3].map((variant) => outfitName(black, { occasion: 'Arreglado', date: november }, variant))
    expect(new Set([first, ...others]).size).toBe(4)
  })

  it('starts with the weather when it rains', () => {
    expect(outfitName(black, { occasion: 'Diario', date: november, weatherConditions: ['lluvia'] })).toMatch(/lluvia/i)
  })

  it('takes a colour over the neutrals when they tie, and the aesthetic when the garments have one', () => {
    const mixed = [garment('camisa', 'Top', ['Blanco'], ['Minimalista']), garment('pantalón', 'Bottom', ['Verde'], ['Minimalista'])]
    expect(mainColour(mixed)).toBe('Verde')
    const names = outfitNames(mixed, { occasion: 'Diario', date: november })
    expect(names).toContain('Paseo en verde')
    expect(names).toContain('Minimal de otoño')
    expect(names).toContain('Verde bosque de otoño')
  })

  it('still has a name with no colours or plan it knows', () => {
    expect(outfitName([garment('x', 'Top', [])], { occasion: 'Otra cosa', date: november })).toBeTruthy()
  })
})
