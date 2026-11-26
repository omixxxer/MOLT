import { describe, expect, it } from 'vitest'
import { createSuggestedGarmentName, fixNameAgreement } from './garmentName'

describe('proposed garment names', () => {
  it('make the colours agree with the garment in gender and number', () => {
    expect(createSuggestedGarmentName('Sudadera', ['Rojo'], '')).toBe('Sudadera roja')
    expect(createSuggestedGarmentName('Sudadera con capucha', ['Negro', 'Blanco'], 'Pull&Bear')).toBe('Sudadera con capucha negra y blanca · Pull&Bear')
    expect(createSuggestedGarmentName('Camiseta de manga larga', ['Amarillo'], '')).toBe('Camiseta de manga larga amarilla')
    expect(createSuggestedGarmentName('Zapatillas', ['Blanco', 'Gris'], '')).toBe('Zapatillas blancas y grises')
    expect(createSuggestedGarmentName('Vaqueros', ['Azul'], '')).toBe('Vaqueros azules')
    expect(createSuggestedGarmentName('Zapatos', ['Marrón'], '')).toBe('Zapatos marrones')
    expect(createSuggestedGarmentName('Pendientes', ['Dorado'], '')).toBe('Pendientes dorados')
    expect(createSuggestedGarmentName('Bufanda / pañuelo', ['Morado'], '')).toBe('Bufanda / pañuelo morada')
    expect(createSuggestedGarmentName('Jersey', ['Negro'], '')).toBe('Jersey negro')
  })

  it('leave invariable colours as they are', () => {
    expect(createSuggestedGarmentName('Falda', ['Naranja'], '')).toBe('Falda naranja')
    expect(createSuggestedGarmentName('Botas', ['Rosa', 'Beige'], '')).toBe('Botas rosa y beige')
    expect(createSuggestedGarmentName('Camisetas', ['Azul marino'], '')).toBe('Camisetas azul marino')
    expect(createSuggestedGarmentName('Camiseta', ['Gris claro'], '')).toBe('Camiseta gris claro')
    expect(createSuggestedGarmentName('Pantalón', ['Multicolor'], '')).toBe('Pantalón multicolor')
  })

  it('follow the garment word for types typed by the user', () => {
    expect(createSuggestedGarmentName('Gabardina', ['Negro'], '')).toBe('Gabardina negra')
    expect(createSuggestedGarmentName('Mallas', ['Negro'], '')).toBe('Mallas negras')
    expect(createSuggestedGarmentName('Pijama', ['Blanco'], '')).toBe('Pijama blanco')
  })
})

describe('fixing names saved before', () => {
  it('changes only the grammar of names that end in colours', () => {
    expect(fixNameAgreement('Sudadera blanco · Pull&Bear')).toBe('Sudadera blanca · Pull&Bear')
    expect(fixNameAgreement('Vaqueros gris y azul')).toBe('Vaqueros grises y azules')
    expect(fixNameAgreement('Camiseta gris clara')).toBe('Camiseta gris claro')
    expect(fixNameAgreement('Botas beige y marrón')).toBe('Botas beige y marrones')
  })

  it('leaves names that already agree or are not shaped like a proposed one', () => {
    expect(fixNameAgreement('Camiseta blanca · Zara')).toBeUndefined()
    expect(fixNameAgreement('Pantalón morado y gris claro')).toBeUndefined()
    expect(fixNameAgreement('Top de entrenamiento')).toBeUndefined()
    expect(fixNameAgreement('Sudadera')).toBeUndefined()
    expect(fixNameAgreement('Negro')).toBeUndefined()
  })
})
