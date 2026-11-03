import { describe, expect, it } from 'vitest'
import type { Garment, Outfit, OutfitFeedback } from '../types/domain'
import { explainNoOutfits, fitLabel, generateOutfitCandidates, optionsForRole, outfitKey, scoreOutfit, seasonOfDate, withGarment } from './outfitGenerator'

const garment = (id: string, role: Garment['role'], extras: Partial<Garment> = {}): Garment => ({
  id,
  name: id,
  category: role === 'Top' ? 'Parte superior' : role === 'Bottom' ? 'Parte inferior' : role === 'Capa' ? 'Abrigo' : role === 'Calzado' ? 'Calzado' : role === 'Una pieza' ? 'Vestido / mono' : 'Accesorio',
  subcategory: '',
  colors: [],
  seasons: [],
  styles: [],
  dressLevels: ['Diario'],
  role,
  image: new Blob(['photo']),
  thumbnail: new Blob(['thumbnail']),
  width: 100,
  height: 100,
  confirmedAttributes: [],
  suggestedAttributes: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extras
})

const now = new Date('2026-11-02T12:00:00.000Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
const event = (type: OutfitFeedback['type'], garmentIds: string[], days = 1): OutfitFeedback => ({ id: `${type}-${garmentIds}`, type, garmentIds, createdAt: daysAgo(days) })
const basicWardrobe = () => [garment('top', 'Top'), garment('bottom', 'Bottom'), garment('coat', 'Capa'), garment('shoe', 'Calzado')]
const diario = { occasion: 'Diario' }

describe('searching the wardrobe', () => {
  it('builds outfits only from available garments, with what is pinned and without what is excluded', () => {
    const wardrobe = [...basicWardrobe(), garment('laundry-top', 'Top', { availability: 'laundry' })]
    const results = generateOutfitCandidates(wardrobe, { occasion: 'Frío y capas', includeGarmentIds: ['top'], excludeGarmentIds: ['shoe'] })
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      const ids = result.garments.map((item) => item.id)
      expect(ids).toContain('top')
      expect(ids).toContain('coat')
      expect(ids).not.toContain('shoe')
      expect(ids).not.toContain('laundry-top')
    }
  })

  it('needs a base of top and bottom or a one-piece', () => {
    expect(generateOutfitCandidates([garment('shoe', 'Calzado')], diario)).toEqual([])
    expect(generateOutfitCandidates([], diario)).toEqual([])
    expect(generateOutfitCandidates([garment('dress', 'Una pieza'), garment('shoe', 'Calzado')], diario)[0]?.garments.map((item) => item.id)).toEqual(['dress', 'shoe'])
  })

  it('finishes the outfit with shoes when there are any that suit it', () => {
    const wardrobe = [garment('top', 'Top'), garment('bottom', 'Bottom'), garment('trainers', 'Calzado'), garment('heels', 'Calzado', { dressLevels: ['Formal'] })]
    expect(generateOutfitCandidates(wardrobe, diario).every((candidate) => candidate.garments.some((item) => item.role === 'Calzado'))).toBe(true)
    const formal = [garment('top', 'Top', { dressLevels: ['Formal'] }), garment('bottom', 'Bottom', { dressLevels: ['Formal'] }), garment('trainers', 'Calzado')]
    expect(generateOutfitCandidates(formal, { occasion: 'Formal' })[0]?.garments.map((item) => item.id)).toEqual(['top', 'bottom'])
  })

  it('keeps casual garments out of a formal outfit and layers out of a hot one, unless pinned', () => {
    expect(generateOutfitCandidates(basicWardrobe(), { occasion: 'Formal' })).toEqual([])
    const wardrobe = [...basicWardrobe(), garment('coat-2', 'Capa')]
    expect(generateOutfitCandidates(wardrobe, { occasion: 'Calor y pocas capas' }).every((result) => result.garments.every((item) => item.role !== 'Capa'))).toBe(true)
    expect(generateOutfitCandidates(wardrobe, { occasion: 'Calor y pocas capas', includeGarmentIds: ['coat'] })[0]?.garments.map((item) => item.id)).toContain('coat')
    expect(generateOutfitCandidates(wardrobe, { occasion: 'Frío y capas', temperatureCelsius: 30 }).length).toBeGreaterThan(0)
  })

  it('gives outfits that differ from each other', () => {
    const wardrobe = [garment('t1', 'Top'), garment('t2', 'Top'), garment('t3', 'Top'), garment('b1', 'Bottom'), garment('b2', 'Bottom'), garment('b3', 'Bottom'), garment('jacket', 'Capa'), garment('coat', 'Capa')]
    const main = generateOutfitCandidates(wardrobe, diario).slice(0, 3).map((candidate) => candidate.garments.filter((item) => item.role === 'Top' || item.role === 'Bottom').map((item) => item.id))
    expect(new Set(main.flat()).size).toBe(6)
  })

  it('reaches every garment of a large wardrobe when asked again', () => {
    const wardrobe = Array.from({ length: 40 }, (_, index) => [garment(`top-${index}`, 'Top'), garment(`bottom-${index}`, 'Bottom')]).flat()
    const skip = new Set<string>()
    const seen = new Set<string>()
    for (let round = 0; round < 12; round += 1) {
      for (const candidate of generateOutfitCandidates(wardrobe, diario, { skip })) {
        skip.add(outfitKey(candidate.garments))
        candidate.garments.forEach((item) => seen.add(item.id))
      }
    }
    expect(seen.size).toBe(80)
  })

  it('does not propose a discarded combination again, but does propose its garments', () => {
    const wardrobe = [garment('top', 'Top'), garment('bottom', 'Bottom'), garment('other', 'Bottom')]
    const results = generateOutfitCandidates(wardrobe, diario, { feedback: [event('dislike', ['bottom', 'top'])], now })
    expect(results.map((candidate) => outfitKey(candidate.garments))).toEqual(['other|top'])
  })

  it('varies the order from one seed to another', () => {
    const wardrobe = Array.from({ length: 8 }, (_, index) => [garment(`top-${index}`, 'Top'), garment(`bottom-${index}`, 'Bottom')]).flat()
    const first = (seed: string) => outfitKey(generateOutfitCandidates(wardrobe, diario, { seed })[0]!.garments)
    expect(new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(first)).size).toBeGreaterThan(1)
    expect(first('2026-11-02')).toBe(first('2026-11-02'))
  })
})

describe('warmth', () => {
  const tee = garment('tee', 'Top', { subcategory: 'Camiseta' })
  const hoodie = garment('hoodie', 'Top', { subcategory: 'Sudadera con capucha' })
  const shorts = garment('shorts', 'Bottom', { subcategory: 'Pantalón corto' })
  const jeans = garment('jeans', 'Bottom', { subcategory: 'Vaqueros' })
  const coat = garment('coat', 'Capa', { subcategory: 'Abrigo' })
  const thermal = (garments: Garment[], temperatureCelsius: number) => scoreOutfit(garments, { occasion: 'Diario', temperatureCelsius }).scores.thermal

  it('matches what the garments give to what the temperature asks', () => {
    expect(thermal([tee, shorts], 30)).toBeGreaterThan(thermal([hoodie, jeans], 30))
    expect(thermal([hoodie, jeans, coat], 2)).toBeGreaterThan(thermal([hoodie, jeans], 2))
    expect(thermal([hoodie, jeans], 15)).toBeGreaterThan(thermal([hoodie, jeans, coat], 15))
    expect(thermal([hoodie, jeans], 15)).toBeGreaterThan(thermal([tee, shorts], 15))
  })

  it('adds a coat when the cold asks for it and not otherwise', () => {
    const wardrobe = [tee, hoodie, jeans, coat]
    const has = (temperatureCelsius: number) => generateOutfitCandidates(wardrobe, { occasion: 'Diario', temperatureCelsius })[0]!.garments.some((item) => item.id === 'coat')
    expect(has(2)).toBe(true)
    expect(has(20)).toBe(false)
  })

  it('counts warm and cool fibres', () => {
    const wool = garment('wool', 'Top', { subcategory: 'Camiseta', composition: '100 % lana' })
    expect(thermal([wool, jeans], 15)).toBeGreaterThan(thermal([tee, jeans], 15))
  })

  it('warns when nothing fits the weather instead of claiming it does', () => {
    const hot = scoreOutfit([hoodie, jeans], { occasion: 'Diario', temperatureCelsius: 30 })
    expect(hot.warnings.join()).toMatch(/Puede darte calor a 30 °C/)
    expect(hot.explanation.join()).not.toMatch(/30 °C/)
    expect(scoreOutfit([tee, shorts], { occasion: 'Diario', temperatureCelsius: 30 }).explanation.join()).toMatch(/Bien para 30 °C/)
    expect(scoreOutfit([tee, shorts], { occasion: 'Diario', temperatureCelsius: 2 }).warnings.join()).toMatch(/Puede darte frío a 2 °C/)
  })

  it('prepares for rain', () => {
    const raincoat = garment('raincoat', 'Capa', { subcategory: 'Chubasquero' })
    const sandals = garment('sandals', 'Calzado', { subcategory: 'Sandalias' })
    const rainy = { occasion: 'Diario', temperatureCelsius: 18, weatherConditions: ['lluvia'] }
    expect(scoreOutfit([tee, jeans, raincoat], rainy).explanation.join()).toMatch(/lluvia/)
    expect(scoreOutfit([tee, jeans, sandals], rainy).warnings.join()).toMatch(/Calzado abierto/)
    expect(scoreOutfit([tee, jeans, sandals], rainy).scores.thermal).toBeLessThan(scoreOutfit([tee, jeans, sandals], { ...rainy, weatherConditions: [] }).scores.thermal)
  })

  it('keeps garments out of season out, unless there is nothing else or they are pinned', () => {
    const wardrobe = [garment('summer', 'Bottom', { seasons: ['Verano'] }), garment('wool', 'Bottom', { seasons: ['Otoño', 'Invierno'] }), hoodie]
    const ids = (context: Parameters<typeof generateOutfitCandidates>[1]) => generateOutfitCandidates(wardrobe, context).flatMap((candidate) => candidate.garments.map((item) => item.id))
    expect(ids({ occasion: 'Diario', temperatureCelsius: 2 })).not.toContain('summer')
    expect(ids({ occasion: 'Diario', season: 'Invierno' })).not.toContain('summer')
    expect(ids({ occasion: 'Diario', temperatureCelsius: 2, includeGarmentIds: ['summer'] })).toContain('summer')
    expect(ids({ occasion: 'Diario', temperatureCelsius: 30 })).toContain('summer')
    expect(ids({ occasion: 'Diario', temperatureCelsius: 30 })).not.toContain('wool')
    expect(seasonOfDate(new Date(2026, 10, 2))).toBe('Otoño')
    expect(seasonOfDate(new Date(2026, 0, 15))).toBe('Invierno')
  })
})

describe('how the outfit looks', () => {
  const visual = (first: Partial<Garment>, second: Partial<Garment>, third?: Partial<Garment>) =>
    scoreOutfit([garment('top', 'Top', first), garment('bottom', 'Bottom', second), ...(third ? [garment('shoe', 'Calzado', third)] : [])], diario).scores.visualStyle

  it('prefers one accent over neutrals, and clashing accents least', () => {
    const accent = visual({ colors: ['Rojo'] }, { colors: ['Negro'] })
    const neutrals = visual({ colors: ['Blanco'] }, { colors: ['Negro'] })
    const neighbours = visual({ colors: ['Rojo'] }, { colors: ['Naranja'] })
    const clash = visual({ colors: ['Rojo'] }, { colors: ['Verde'] }, { colors: ['Morado'] })
    const off = visual({ colors: ['Amarillo'] }, { colors: ['Morado'] })
    expect(accent).toBeGreaterThan(neutrals)
    expect(neutrals).toBeGreaterThan(off)
    expect(neighbours).toBeGreaterThan(off)
    expect(off).toBeGreaterThan(clash)
  })

  it('finds black with navy duller than black with white', () => {
    expect(visual({ colors: ['Blanco'] }, { colors: ['Negro'] })).toBeGreaterThan(visual({ colors: ['Azul marino'] }, { colors: ['Negro'] }))
  })

  it('compares main colours and rewards one that echoes another garment', () => {
    expect(visual({ colors: ['Rojo', 'Verde'] }, { colors: ['Negro'] })).toBe(visual({ colors: ['Rojo'] }, { colors: ['Negro'] }))
    expect(visual({ colors: ['Rojo', 'Naranja'] }, { colors: ['Naranja'] })).toBeGreaterThan(visual({ colors: ['Rojo'] }, { colors: ['Naranja'] }))
  })

  it('values one print with plain garments over two different prints', () => {
    const pattern = (first: string, second: string) => visual({ pattern: first }, { pattern: second })
    expect(pattern('Rayas', 'Liso')).toBeGreaterThan(pattern('Rayas', 'Rayas'))
    expect(pattern('Rayas', 'Rayas')).toBeGreaterThan(pattern('Rayas', 'Cuadros'))
  })

  it('explains the outfit in words', () => {
    expect(scoreOutfit([garment('top', 'Top', { colors: ['Rojo'], pattern: 'Liso' }), garment('bottom', 'Bottom', { colors: ['Negro'], pattern: 'Rayas' })], diario).explanation)
      .toEqual(expect.arrayContaining(['Encaja con diario', 'Un color protagonista', 'Un solo estampado']))
    expect(fitLabel(90)).toBe('Encaje excelente')
    expect(fitLabel(50)).toBe('Encaje justo')
  })
})

describe('occasion', () => {
  const occasion = (context: string, ...garments: Garment[]) => scoreOutfit(garments, { occasion: context }).scores.occasion

  it('prefers garments whose range of levels reaches the occasion', () => {
    const jeans = garment('jeans', 'Bottom', { dressLevels: ['Diario', 'Arreglado'] })
    const suit = garment('suit', 'Bottom', { dressLevels: ['Arreglado', 'Formal'] })
    const shirt = garment('shirt', 'Top', { dressLevels: ['Diario', 'Arreglado', 'Formal'] })
    expect(occasion('Diario', shirt, jeans)).toBeGreaterThan(occasion('Diario', shirt, suit))
    const formal = generateOutfitCandidates([shirt, jeans, suit], { occasion: 'Formal' })
    expect(formal.every((candidate) => !candidate.garments.some((item) => item.id === 'jeans'))).toBe(true)
  })

  it('notices a piece out of place, and pieces that do not belong together', () => {
    const shirt = garment('shirt', 'Top', { dressLevels: ['Arreglado'] })
    const trousers = garment('trousers', 'Bottom', { dressLevels: ['Arreglado'] })
    const tracksuit = garment('tracksuit', 'Bottom', { dressLevels: ['Deportivo'] })
    const heels = garment('heels', 'Calzado', { dressLevels: ['Formal'] })
    expect(occasion('Arreglado', shirt, trousers)).toBeGreaterThan(occasion('Arreglado', shirt, tracksuit))
    expect(scoreOutfit([tracksuit, shirt, heels], { occasion: 'Diario' }).warnings.join()).toMatch(/estilos muy distintos/)
  })
})

describe('what the user does', () => {
  const pair = [garment('top', 'Top'), garment('bottom', 'Bottom')]

  it('learns from likes and dislikes, forgetting with time', () => {
    const score = (feedback: OutfitFeedback[]) => scoreOutfit(pair, diario, { feedback, now }).scores.preference
    expect(score([event('like', ['top', 'bottom'])])).toBeGreaterThan(score([]))
    expect(score([event('dislike', ['top', 'bottom'])])).toBeLessThan(score([]))
    expect(score([event('like', ['top', 'bottom'], 300)])).toBeLessThan(score([event('like', ['top', 'bottom'], 1)]))
  })

  it('values a pair that went well over its garments separately', () => {
    const score = (feedback: OutfitFeedback[]) => scoreOutfit(pair, diario, { feedback, now }).scores.preference
    expect(score([event('saved', ['top', 'bottom'])])).toBeGreaterThan(score([event('saved', ['top', 'other'])]))
  })

  it('ignores pinning or excluding a garment, which says nothing about liking it', () => {
    const score = (feedback: OutfitFeedback[]) => scoreOutfit(pair, diario, { feedback, now }).scores.preference
    expect(score([event('included', ['top']), event('excluded', ['bottom'])])).toBe(score([]))
  })

  it('applies personal preferences', () => {
    const coloured = [garment('top', 'Top', { colors: ['Azul'] }), garment('bottom', 'Bottom', { colors: ['Negro'] })]
    const preferences = { id: 'current' as const, preferredColors: ['Azul'], preferredStyles: [], feedbackWeights: {}, updatedAt: '' }
    expect(scoreOutfit(coloured, diario, { preferences }).scores.preference).toBeGreaterThan(scoreOutfit(coloured, diario).scores.preference)
  })

  it('rests what was just worn, and says so', () => {
    const rotation = (days: number) => scoreOutfit(pair, diario, { wear: [{ garmentIds: ['top'], at: daysAgo(days) }], now })
    expect(rotation(1).scores.rotation).toBeLessThan(rotation(5).scores.rotation)
    expect(rotation(5).scores.rotation).toBeLessThan(rotation(30).scores.rotation)
    expect(rotation(1).warnings.join()).toMatch(/hace poco/)
    expect(rotation(30).explanation.join()).toMatch(/hace tiempo/)
    expect(scoreOutfit(pair, diario, { wear: [{ garmentIds: ['top', 'bottom'], at: daysAgo(10) }], now }).scores.rotation)
      .toBeLessThan(scoreOutfit(pair, diario, { wear: [{ garmentIds: ['top'], at: daysAgo(10) }, { garmentIds: ['bottom'], at: daysAgo(10) }], now }).scores.rotation)
  })

  it('prefers what has not been worn lately when there is a choice', () => {
    const wardrobe = [garment('worn-top', 'Top'), garment('rested-top', 'Top'), garment('bottom', 'Bottom')]
    const [best] = generateOutfitCandidates(wardrobe, diario, { wear: [{ garmentIds: ['worn-top'], at: daysAgo(1) }], now })
    expect(best!.garments.map((item) => item.id)).toContain('rested-top')
  })

  it('avoids repeating a day of a plan in the making', () => {
    const outfit: Outfit = { id: 'recent', garmentIds: ['top', 'bottom'], occasion: 'Diario', score: 80, createdAt: daysAgo(0), favorite: false }
    expect(scoreOutfit(pair, diario, { recentOutfits: [outfit] }).scores.rotation).toBeLessThan(scoreOutfit(pair, diario).scores.rotation)
  })
})

describe('putting an outfit together piece by piece', () => {
  it('replaces the garment of the same role, and a dress takes the place of top and bottom', () => {
    const top = garment('top', 'Top')
    const bottom = garment('bottom', 'Bottom')
    const shoe = garment('shoe', 'Calzado')
    const dress = garment('dress', 'Una pieza')
    expect(withGarment([top, bottom, shoe], garment('other', 'Top')).map((item) => item.id)).toEqual(['bottom', 'shoe', 'other'])
    expect(withGarment([top, bottom, shoe], dress).map((item) => item.id)).toEqual(['shoe', 'dress'])
    expect(withGarment([dress, shoe], top).map((item) => item.id)).toEqual(['shoe', 'top'])
  })

  it('offers the garments of a slot, the ones that go best first', () => {
    const top = garment('top', 'Top', { colors: ['Rojo'] })
    const black = garment('black', 'Bottom', { colors: ['Negro'] })
    const green = garment('green', 'Bottom', { colors: ['Verde'] })
    const washing = garment('washing', 'Bottom', { colors: ['Negro'], availability: 'laundry' })
    const options = optionsForRole('Bottom', [top, green], [top, black, green, washing], diario)
    expect(options.map((option) => option.garment.id)).toEqual(['black'])
    const fromScratch = optionsForRole('Bottom', [top], [top, green, black], diario)
    expect(fromScratch.map((option) => option.garment.id)).toEqual(['black', 'green'])
  })
})

describe('when there is nothing to propose', () => {
  const wardrobe = [garment('top', 'Top'), garment('bottom', 'Bottom'), garment('coat', 'Capa'), garment('coat-2', 'Capa')]

  it('says what the user can change', () => {
    expect(explainNoOutfits(wardrobe, { occasion: 'Diario', includeGarmentIds: ['coat', 'coat-2'] })).toMatch(/no pueden ir juntas/)
    expect(explainNoOutfits(wardrobe, { occasion: 'Formal' })).toMatch(/«Formal»/)
    expect(explainNoOutfits([garment('top', 'Top')], diario)).toMatch(/una parte de arriba y una de abajo/)
    expect(explainNoOutfits([garment('top', 'Top'), garment('bottom', 'Bottom')], { occasion: 'Frío y capas' })).toMatch(/capa de abrigo/)
  })
})
