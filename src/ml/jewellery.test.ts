import { describe, expect, it } from 'vitest'
import { colorName, colorSwatch } from '../ai/colors'
import { suggestUsage } from '../ai/usageRules'
import { codePrefix } from '../db/garmentCodes'
import { matchLabel, taxonomy, TAXONOMY_VERSION } from './taxonomy'
import modelDescription from '../../public/models/vesta/vesta-model.json'

// Taxonomy v5: necklaces, bracelets and earrings as accessories, and gold and silver as colours. Chosen by hand for
// now: the model was not retrained (it does not predict them), only its description follows the new version.
describe('jewellery (taxonomy v5)', () => {
  it('reads the new accessories from free text, with their synonyms and plurals', () => {
    expect(matchLabel('subcategory', 'Collar dorado')).toBe('collar')
    expect(matchLabel('subcategory', 'Colgante de plata')).toBe('collar')
    expect(matchLabel('subcategory', 'Gargantillas')).toBe('collar')
    expect(matchLabel('subcategory', 'Pulsera de cuero')).toBe('pulsera')
    expect(matchLabel('subcategory', 'Brazalete')).toBe('pulsera')
    expect(matchLabel('subcategory', 'Pendientes de aro')).toBe('pendientes')
    expect(matchLabel('subcategory', 'pendiente')).toBe('pendientes')
    expect(matchLabel('subcategory', 'Aros')).toBe('pendientes')
    expect(taxonomy.subcategories.filter((entry) => ['collar', 'pulsera', 'pendientes'].includes(entry.id)).every((entry) => entry.category === 'accessory')).toBe(true)
  })

  it('gives them codes of their own and every dress level, in every season', () => {
    expect(codePrefix({ category: 'Accesorio', subcategory: 'Collar' })).toBe('COL')
    expect(codePrefix({ category: 'Accesorio', subcategory: 'Pulsera' })).toBe('PUL')
    expect(codePrefix({ category: 'Accesorio', subcategory: 'Pendientes' })).toBe('PEN')
    const codes = taxonomy.subcategories.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const subcategory of ['Collar', 'Pulsera', 'Pendientes']) {
      expect(suggestUsage({ category: 'Accesorio', subcategory })).toMatchObject({
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

  it('keeps the model description on the same taxonomy version as the app', () => {
    expect(TAXONOMY_VERSION).toBe(5)
    expect(modelDescription.taxonomyVersion).toBe(TAXONOMY_VERSION)
  })
})
