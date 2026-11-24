import { describe, expect, it } from 'vitest'
import { colorName, colorSwatch } from '../ai/colors'
import { compatibleTaxonomy, splitCategories } from '../ai/clothingAnalyzer'
import { suggestUsage } from '../ai/usageRules'
import { codePrefix } from '../db/garmentCodes'
import { matchLabel, taxonomy, TAXONOMY_VERSION } from './taxonomy'
import modelDescription from '../../public/models/vesta/vesta-model.json'

// Taxonomy v5 added necklaces, bracelets and earrings, and gold and silver as colours; v6 took them, the watch and a
// new ring out of the accessories into «Joyería». Chosen by hand for now: the model (trained on v5) does not predict
// them, and the app shares its «accessory» out between both categories (clothingAnalyzer.splitCategories).
describe('jewellery (taxonomy v6)', () => {
  it('reads the new accessories from free text, with their synonyms and plurals', () => {
    expect(matchLabel('subcategory', 'Collar dorado')).toBe('collar')
    expect(matchLabel('subcategory', 'Colgante de plata')).toBe('collar')
    expect(matchLabel('subcategory', 'Gargantillas')).toBe('collar')
    expect(matchLabel('subcategory', 'Pulsera de cuero')).toBe('pulsera')
    expect(matchLabel('subcategory', 'Brazalete')).toBe('pulsera')
    expect(matchLabel('subcategory', 'Pendientes de aro')).toBe('pendientes')
    expect(matchLabel('subcategory', 'pendiente')).toBe('pendientes')
    expect(matchLabel('subcategory', 'Aros')).toBe('pendientes')
    expect(matchLabel('subcategory', 'Sortija')).toBe('anillo')
    expect(taxonomy.subcategories.filter((entry) => entry.category === 'jewellery').map((entry) => entry.id)).toEqual(['reloj', 'collar', 'pulsera', 'pendientes', 'anillo'])
    expect(taxonomy.categories.find((entry) => entry.id === 'jewellery')).toMatchObject({ label: 'Joyería', role: 'Joya' })
  })

  it('gives them codes of their own and every dress level, in every season', () => {
    expect(codePrefix({ category: 'Joyería', subcategory: 'Collar' })).toBe('COL')
    expect(codePrefix({ category: 'Joyería', subcategory: 'Pulsera' })).toBe('PUL')
    expect(codePrefix({ category: 'Joyería', subcategory: 'Pendientes' })).toBe('PEN')
    expect(codePrefix({ category: 'Joyería', subcategory: 'Anillo' })).toBe('ANI')
    expect(codePrefix({ category: 'Joyería', subcategory: '' })).toBe('JOY')
    const codes = taxonomy.subcategories.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const subcategory of ['Collar', 'Pulsera', 'Pendientes', 'Anillo', 'Reloj']) {
      expect(suggestUsage({ category: 'Joyería', subcategory })).toMatchObject({
        seasons: ['Primavera', 'Verano', 'Otoño', 'Invierno'],
        dressLevels: ['Diario', 'Arreglado', 'Formal']
      })
    }
  })

  it('has gold and silver to choose, never named from the pixels', () => {
    expect(matchLabel('colors', 'plata')).toBe('plateado')
    expect(matchLabel('colors', 'Dorada')).toBe('dorado')
    expect(matchLabel('colors', 'mostaza')).toBe('amarillo')
    expect(colorSwatch('Dorado')).toContain('gradient')
    expect(colorSwatch('Plateado')).toContain('gradient')
    // A golden yellow and a grey pixel stay yellow and grey.
    expect(colorName(212, 175, 55)).toBe('Amarillo')
    expect(colorName(150, 150, 150)).toBe('Gris')
  })

  it('reads the model trained on v5, which has no jewellery category', () => {
    expect(TAXONOMY_VERSION).toBe(6)
    expect(compatibleTaxonomy(modelDescription.taxonomyVersion)).toBe(true)
    expect(compatibleTaxonomy(4)).toBe(false)
  })

  it('shares the accessories of the model out between accessories and jewellery, by how likely a watch is', () => {
    const split = splitCategories({ top: 0.1, accessory: 0.9 }, { reloj: 0.6, bolso: 0.2, camiseta: 0.2 })
    expect(split.jewellery).toBeCloseTo(0.9 * 0.75)
    expect(split.accessory).toBeCloseTo(0.9 * 0.25)
    expect(split.top).toBe(0.1)
    // A model that has the category is left as it is.
    expect(splitCategories({ jewellery: 0.5, accessory: 0.5 }, { reloj: 1 })).toEqual({ jewellery: 0.5, accessory: 0.5 })
  })
})
