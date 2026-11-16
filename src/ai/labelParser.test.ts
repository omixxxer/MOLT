import { describe, expect, it } from 'vitest'
import { europeanEquivalent, findComposition, findSize, neighbours } from './labelParser'

const line = (text: string, score = 0.95) => ({ text, score })

describe('size from a label', () => {
  it('reads letter sizes alone or next to a size word', () => {
    expect(findSize([line('M')])?.value).toBe('M')
    expect(findSize([line('Talla: XL')])?.value).toBe('XL')
    expect(findSize([line('SIZE xs')])?.value).toBe('XS')
  })

  it('ignores stray letters and numbers without a size context', () => {
    expect(findSize([line('S', 0.5)])).toBeUndefined()
    expect(findSize([line('MADE IN PORTUGAL')])).toBeUndefined()
    expect(findSize([line('RN 52469'), line('100% COTTON'), line('42')])).toBeUndefined()
  })

  it('reads European numbers and jeans sizes', () => {
    expect(findSize([line('EUR 42')])?.value).toBe('42')
    expect(findSize([line('T. 38')])?.value).toBe('38')
    expect(findSize([line('W32 L34')], 'bottom')?.value).toBe('W32 L34')
    expect(findSize([line('EU 42.5 UK 8 US 9')], 'footwear')?.value).toBe('42,5')
  })

  it('prefers the letter for tops and the number for footwear and bottoms', () => {
    const label = [line('M'), line('EUR 40'), line('US 8')]
    expect(findSize(label, 'top')).toMatchObject({ value: 'M', text: 'M' })
    expect(findSize(label, 'bottom')).toMatchObject({ value: '40', text: 'EUR 40' })
    expect(findSize(label, 'footwear')?.value).toBe('40')
    expect(findSize([line('M')], 'footwear')).toBeUndefined() // a shoe size is a number
  })

  it('reads the system after the number', () => {
    expect(findSize([line('42 EUR')])?.value).toBe('42')
    expect(findSize([line('38,5 EU')], 'footwear')?.value).toBe('38,5')
    expect(findSize([line('100% COTTON 42 D')])).toBeUndefined()
  })

  it('keeps US, UK and MEX sizes as written when there is no European one', () => {
    expect(findSize([line('38 US')], 'top')).toMatchObject({ value: '38 US', european: '48' })
    expect(findSize([line('US 8')], 'top')).toMatchObject({ value: '8 US', european: '38' })
    expect(findSize([line('UK 10')], 'one-piece')).toMatchObject({ value: '10 UK', european: '38' })
    expect(findSize([line('UK 8')], 'footwear')).toMatchObject({ value: '8 UK', european: '42' })
    expect(findSize([line('US 9')], 'footwear')).toEqual({ value: '9 US', text: 'US 9', score: 0.95 }) // men's or women's?
    expect(findSize([line('USA 32')], 'bottom')).toMatchObject({ value: '32 US', european: '42' })
    expect(findSize([line('MEX 28')], 'bottom')?.european).toBeUndefined()
    expect(findSize([line('W32 L34')], 'bottom')?.european).toBe('42')
  })

  it('gives the European equivalent of a stored size', () => {
    expect(europeanEquivalent('38 US', 'top')).toBe('48')
    expect(europeanEquivalent('uk 8', 'footwear')).toBe('42')
    expect(europeanEquivalent('8,5 UK', 'footwear')).toBe('42,5')
    expect(europeanEquivalent('W30 L32', 'bottom')).toBe('40')
    expect(europeanEquivalent('42', 'top')).toBeUndefined()
    expect(europeanEquivalent('M', 'top')).toBeUndefined()
  })

  it('reads letters with marks around them and rounds misread halves', () => {
    expect(findSize([line('-XXL-')])?.value).toBe('XXL')
    expect(findSize([line('(M)')])?.value).toBe('M')
    expect(findSize([line('41.6 EU')], 'footwear')?.value).toBe('41,5')
    expect(findSize([line('7.6. UK')], 'footwear')).toMatchObject({ value: '7,5 UK', european: '41,5' })
  })

  it('reads a size table printed in boxes, following the tilt of the photo', () => {
    // A New Balance style table tilted ~12°: the right column sits 25 px lower than its row's number.
    const tilt = Math.atan2(25, 120)
    const box = (text: string, x: number, y: number, length: number, thickness: number, angle = 0) =>
      ({ text, score: 0.95, bounds: { left: x - length / 2, top: y - thickness / 2, right: x + length / 2, bottom: y + thickness / 2 }, shape: { centerX: x, centerY: y, angle, length, thickness } })
    const table = [
      box('PQHTX4857 XNF', 150, 100, 220, 30, tilt),
      box('8', 96, 196, 30, 34), box('US', 216, 222, 50, 40),
      box('7.6', 110, 245, 70, 40), box('UN', 230, 269, 55, 45),
      box('41.6', 117, 286, 80, 45), box('EU', 227, 310, 45, 38),
      box('26', 103, 320, 35, 32), box('CM', 224, 345, 55, 45)
    ]
    expect(neighbours(table).map((entry) => entry.text)).toEqual(expect.arrayContaining(['8 US', '41.6 EU', '26 CM']))
    expect(neighbours(table).map((entry) => entry.text)).not.toContain('26 EU')
    expect(findSize(table, 'footwear')?.value).toBe('41,5')
  })

  it('joins a system word with the number below it, but not a column of sizes', () => {
    const at = (text: string, left: number, top: number, right: number, bottom: number) => ({ text, score: 0.95, bounds: { left, top, right, bottom } })
    const column = [at('US', 96, 268, 127, 294), at('8', 107, 285, 124, 302), at('UK7', 99, 296, 136, 320), at('EUR 41', 99, 304, 147, 333)]
    const joined = neighbours(column).map((entry) => entry.text)
    expect(joined).toContain('US 8')
    expect(joined.some((text) => text.includes('UK7 EUR'))).toBe(false)
  })

  it('prefers the European size when the label has several', () => {
    expect(findSize([line('US 8'), line('UK 10'), line('42 EUR')], 'top')?.value).toBe('42')
    expect(findSize([line('UK 8 / US 9 / EU 42')], 'footwear')?.value).toBe('42')
  })
})

describe('composition from a label', () => {
  it('reads fibres in either order and translates them', () => {
    expect(findComposition([line('95% COTTON 5% ELASTANE')])?.value).toBe('95 % algodón, 5 % elastano')
    expect(findComposition([line('ALGODÓN 100%')])?.value).toBe('100 % algodón')
    expect(findComposition([line('80 % laine'), line('20% polyamide')])?.value).toBe('80 % lana, 20 % poliamida')
  })

  it('skips the same composition repeated in other languages and a second section', () => {
    const label = [line('100% ALGODÓN'), line('100% COTTON'), line('100% COTON'), line('FORRO 100% POLIESTER')]
    expect(findComposition(label)).toMatchObject({ value: '100 % algodón', text: '100% ALGODÓN' })
  })

  it('needs percentages close to 100 and readable text', () => {
    expect(findComposition([line('50% COTTON')])).toBeUndefined()
    expect(findComposition([line('100% COTTON', 0.4)])).toBeUndefined()
    expect(findComposition([line('100% ORGANIC')])).toBeUndefined()
  })
})
