import { describe, expect, it } from 'vitest'
import type { Garment, GarmentRole, TripDay } from '../types/domain'
import type { DailyWeather } from '../weather/openMeteo'
import { defaultExtras, forecastChanges, nextOutfitForDay, packingGroups, planDays, summarizeWeather } from './packingPlan'

function garment(id: string, role: GarmentRole, change: Partial<Garment> = {}): Garment {
  return {
    id, name: id, category: 'Parte superior', subcategory: '', colors: ['Azul marino'], seasons: [], styles: [], dressLevels: ['Diario'], role,
    width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
}

function weather(date: string, change: Partial<DailyWeather> = {}): DailyWeather {
  return { date, temperatureCelsius: 18, high: 21, low: 15, conditions: ['despejado'], source: 'forecast', ...change }
}

function tripDays(count: number, change: Partial<DailyWeather> = {}): TripDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = `2026-11-${String(index + 10).padStart(2, '0')}`
    return { date, weather: weather(date, change), occasion: 'Diario', garmentIds: [] }
  })
}

const wardrobe = () => [
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => garment(`top-${id}`, 'Top')),
  ...['a', 'b', 'c', 'd', 'e'].map((id) => garment(`bottom-${id}`, 'Bottom')),
  ...['a', 'b', 'c', 'd'].map((id) => garment(`shoe-${id}`, 'Calzado')),
  ...['a', 'b', 'c'].map((id) => garment(`coat-${id}`, 'Capa'))
]

function distinct(plan: TripDay[]) {
  return new Set(plan.flatMap((day) => day.garmentIds)).size
}

describe('planDays', () => {
  it('gives every day an outfit and a lighter style packs fewer garments', () => {
    const light = planDays(wardrobe(), tripDays(7), 'light')
    const balanced = planDays(wardrobe(), tripDays(7), 'balanced')
    const roomy = planDays(wardrobe(), tripDays(7), 'roomy')
    for (const plan of [light, balanced, roomy]) expect(plan.every((day) => day.garmentIds.length >= 2)).toBe(true)
    expect(distinct(light)).toBeLessThan(distinct(balanced))
    expect(distinct(balanced)).toBeLessThan(distinct(roomy))
  })

  it('shares shoes and bottoms across the trip instead of a new one each day', () => {
    const plan = planDays(wardrobe(), tripDays(7), 'balanced')
    const garments = wardrobe()
    const groups = packingGroups(garments, plan)
    const count = (role: GarmentRole) => groups.find((group) => group.role === role)?.items.length ?? 0
    expect(count('Calzado')).toBeLessThanOrEqual(2)
    expect(count('Bottom')).toBeLessThanOrEqual(3)
    expect(count('Top')).toBeGreaterThanOrEqual(3)
  })

  it('does not repeat a top two days in a row when there are others', () => {
    const plan = planDays(wardrobe(), tripDays(4), 'balanced')
    const topOf = (day: TripDay) => day.garmentIds.find((id) => id.startsWith('top-'))
    for (let index = 1; index < plan.length; index += 1) expect(topOf(plan[index]!)).not.toBe(topOf(plan[index - 1]!))
  })

  it('still dresses for each day: a coat on the cold day, not on the hot one', () => {
    const days = tripDays(2)
    days[0]!.weather = weather(days[0]!.date, { temperatureCelsius: 2, high: 5, low: -1, conditions: ['nieve'] })
    days[1]!.weather = weather(days[1]!.date, { temperatureCelsius: 30, high: 33, low: 26 })
    const plan = planDays(wardrobe(), days, 'balanced')
    expect(plan[0]!.garmentIds.some((id) => id.startsWith('coat-'))).toBe(true)
    expect(plan[1]!.garmentIds.some((id) => id.startsWith('coat-'))).toBe(false)
  })

  it('takes a coat for a day that starts cold even if the afternoon is warm', () => {
    const days = tripDays(1, { temperatureCelsius: 19, high: 24, low: 9 })
    expect(planDays(wardrobe(), days, 'balanced')[0]!.garmentIds.some((id) => id.startsWith('coat-'))).toBe(true)
  })

  it('leaves alone the days the user has changed, and packs around them', () => {
    const days = tripDays(3)
    days[1] = { ...days[1]!, garmentIds: ['top-g', 'bottom-e'], edited: true }
    const plan = planDays(wardrobe(), days, 'light')
    expect(plan[1]!.garmentIds).toEqual(['top-g', 'bottom-e'])
    expect(plan[0]!.garmentIds).toContain('bottom-e')
  })

  it('leaves out what is in the wash, and a day without options stays empty', () => {
    const garments = wardrobe().map((item) => (item.id.startsWith('top-') && item.id !== 'top-a' ? { ...item, availability: 'laundry' as const } : item))
    expect(planDays(garments, tripDays(2), 'roomy').every((day) => day.garmentIds.includes('top-a'))).toBe(true)
    expect(planDays([garment('solo', 'Top')], tripDays(1), 'balanced')[0]!.garmentIds).toEqual([])
  })

  it('stays quick for a long trip with a large wardrobe', () => {
    const large = Array.from({ length: 150 }, (_, index) => garment(`g${index}`, (['Top', 'Top', 'Bottom', 'Calzado', 'Capa', 'Accesorio'] as const)[index % 6]!))
    const started = performance.now()
    planDays(large, tripDays(14), 'balanced')
    expect(performance.now() - started).toBeLessThan(4000)
  })
})

describe('nextOutfitForDay', () => {
  it('offers something not seen yet, and nothing when all have been seen', () => {
    const garments = [garment('t1', 'Top'), garment('t2', 'Top'), garment('b1', 'Bottom')]
    const plan = planDays(garments, tripDays(1), 'balanced')
    const seen = new Set([[...plan[0]!.garmentIds].sort().join('|')])
    const next = nextOutfitForDay(garments, plan, 0, 'balanced', seen)
    expect(next?.garments.map((item) => item.id).sort().join('|')).not.toBe([...seen][0])
    seen.add(next!.garments.map((item) => item.id).sort().join('|'))
    expect(nextOutfitForDay(garments, plan, 0, 'balanced', seen)).toBeUndefined()
  })
})

describe('packingGroups', () => {
  it('lists each garment once with its days, by type, and drops what no longer exists', () => {
    const groups = packingGroups([garment('t', 'Top'), garment('b', 'Bottom')], [
      { date: '2026-11-10', weather: weather('2026-11-10'), occasion: 'Diario', garmentIds: ['t', 'b'] },
      { date: '2026-11-11', weather: weather('2026-11-11'), occasion: 'Diario', garmentIds: ['t', 'gone'] }
    ])
    expect(groups.map((group) => [group.role, group.items.map((item) => [item.garment.id, item.days])])).toEqual([['Top', [['t', 2]]], ['Bottom', [['b', 1]]]])
  })
})

describe('weather of the trip', () => {
  it('sums up the trip and gives only the advice that applies', () => {
    const summary = summarizeWeather([
      weather('2026-11-10', { low: 2, high: 9, conditions: ['lluvia', 'viento'] }),
      weather('2026-11-11', { low: 3, high: 11, conditions: ['nuboso'], source: 'climate' })
    ])
    expect(summary).toEqual(expect.objectContaining({ low: 2, high: 11, rainDays: 1, windyDays: 1, snowDays: 0, climateDays: 1 }))
    expect(summary.advice.join()).toMatch(/Lluvia 1 día/)
    expect(summary.advice.join()).toMatch(/Frío, hasta 2 °C/)
    expect(summary.advice.join()).not.toMatch(/Calor/)
  })

  it('suggests what the weather and the kind of trip call for', () => {
    const labels = (days: DailyWeather[], kind: string) => defaultExtras(days, kind).map((extra) => extra.label)
    const mild = labels([weather('2026-11-10'), weather('2026-11-11')], 'leisure')
    expect(mild).toEqual(expect.arrayContaining(['Cargador del móvil', 'Ropa interior × 3']))
    expect(mild).not.toContain('Paraguas o chubasquero')
    expect(labels([weather('2026-11-10', { conditions: ['lluvia'] })], 'leisure')).toContain('Paraguas o chubasquero')
    expect(labels([weather('2026-11-10', { uvIndex: 8 })], 'beach')).toEqual(expect.arrayContaining(['Protector solar', 'Bañador']))
  })

  it('notices only changes worth acting on', () => {
    const before = [weather('2026-11-10'), weather('2026-11-11'), weather('2026-11-12')]
    const after = [
      weather('2026-11-10', { temperatureCelsius: 19 }),
      weather('2026-11-11', { temperatureCelsius: 12 }),
      weather('2026-11-12', { conditions: ['lluvia'] })
    ]
    expect(forecastChanges(before, after)).toEqual([
      { date: '2026-11-11', text: 'de 18 a 12 °C' },
      { date: '2026-11-12', text: 'ahora con lluvia' }
    ])
  })
})

// Phase 4: trips of every length, small and incomplete wardrobes, extreme weather and dates beyond the forecast.

const isBase = (ids: string[], garments: Garment[]) => {
  const roles = ids.map((id) => garments.find((item) => item.id === id)?.role)
  return roles.includes('Una pieza') ? !roles.includes('Top') && !roles.includes('Bottom') : roles.includes('Top') && roles.includes('Bottom')
}

describe('validation of the trip planner', () => {
  const small = () => [garment('t1', 'Top'), garment('t2', 'Top'), garment('b1', 'Bottom'), garment('b2', 'Bottom'), garment('s1', 'Calzado')]

  it('plans trips of 1 to 14 days, an outfit every day, with every packing style', () => {
    for (let length = 1; length <= 14; length += 1) {
      for (const style of ['light', 'balanced', 'roomy'] as const) {
        const days = tripDays(length)
        const plan = planDays(small(), days, style)
        const label = `${length} days, ${style}`
        expect(plan.map((day) => day.date), label).toEqual(days.map((day) => day.date))
        for (const day of plan) expect(isBase(day.garmentIds, small()), `${label}: ${day.date}`).toBe(true)
        // Never more than the wardrobe has, and no garment twice in a day.
        for (const day of plan) expect(new Set(day.garmentIds).size, label).toBe(day.garmentIds.length)
        expect(distinct(plan), label).toBeLessThanOrEqual(5)
      }
    }
  })

  it('repeats the only possible outfit every day rather than leaving days empty', () => {
    const plan = planDays([garment('top', 'Top'), garment('bottom', 'Bottom')], tripDays(14), 'roomy')
    expect(plan.every((day) => [...day.garmentIds].sort().join() === 'bottom,top')).toBe(true)
  })

  it('plans with garments that have no attributes, and with a dress as the only base', () => {
    const bare = (id: string, role: GarmentRole) => garment(id, role, { colors: [], seasons: [], styles: [], dressLevels: [] })
    expect(planDays([bare('t', 'Top'), bare('b', 'Bottom'), bare('s', 'Calzado')], tripDays(3), 'balanced').every((day) => day.garmentIds.length === 3)).toBe(true)
    expect(planDays([garment('dress', 'Una pieza')], tripDays(2), 'balanced').map((day) => day.garmentIds)).toEqual([['dress'], ['dress']])
  })

  it('leaves every day empty when everything is in the wash', () => {
    const washed = wardrobe().map((item) => ({ ...item, availability: 'laundry' as const }))
    expect(planDays(washed, tripDays(5), 'balanced').every((day) => day.garmentIds.length === 0)).toBe(true)
  })

  it('dresses for each day of a trip with extreme temperatures, and says so in the summary', () => {
    const garments = [
      garment('tank', 'Top', { subcategory: 'Camiseta de tirantes' }), garment('jumper', 'Top', { subcategory: 'Jersey' }),
      garment('shorts', 'Bottom', { subcategory: 'Pantalón corto' }), garment('jeans', 'Bottom', { subcategory: 'Vaqueros' }),
      garment('down', 'Capa', { subcategory: 'Plumífero' }), garment('boots', 'Calzado', { subcategory: 'Botas' })
    ]
    const days = tripDays(4).map((day, index) => ({
      ...day,
      weather: index % 2
        ? weather(day.date, { temperatureCelsius: 42, high: 45, low: 35 })
        : weather(day.date, { temperatureCelsius: -15, high: -10, low: -20, conditions: ['nieve'] })
    }))
    const plan = planDays(garments, days, 'balanced')
    for (const [index, day] of plan.entries()) {
      if (index % 2) {
        expect(day.garmentIds).toEqual(expect.arrayContaining(['tank', 'shorts']))
        expect(day.garmentIds).not.toContain('down')
      } else {
        expect(day.garmentIds).toEqual(expect.arrayContaining(['jumper', 'jeans', 'down']))
      }
    }
    const summary = summarizeWeather(days.map((day) => day.weather))
    expect(summary).toEqual(expect.objectContaining({ low: -20, high: 45, snowDays: 2 }))
    expect(summary.advice.join(' ')).toMatch(/Frío, hasta -20 °C.*Calor, hasta 45 °C/)
  })

  it('plans the days beyond the forecast with what past years were like', () => {
    // Averages of past years: no weather code, no chance of rain, only «suele estar seco» or «lluvia probable».
    const days = tripDays(3).map((day, index) => ({
      ...day,
      weather: weather(day.date, { temperatureCelsius: 6, high: 9, low: 2, source: 'climate', code: undefined, rainChance: undefined, conditions: [index ? 'lluvia probable' : 'suele estar seco'] })
    }))
    const plan = planDays(wardrobe(), days, 'balanced')
    expect(plan.every((day) => day.garmentIds.some((id) => id.startsWith('coat-')))).toBe(true)
    const summary = summarizeWeather(days.map((day) => day.weather))
    expect(summary).toEqual(expect.objectContaining({ climateDays: 3, rainDays: 2 }))
    expect(defaultExtras(days.map((day) => day.weather), 'leisure').map((extra) => extra.label)).toContain('Paraguas o chubasquero')
  })

  it('keeps a day the user made even if one of its garments has since been deleted', () => {
    const days = tripDays(3)
    days[1] = { ...days[1]!, garmentIds: ['top-a', 'deleted'], edited: true }
    const plan = planDays(wardrobe(), days, 'balanced')
    expect(plan[1]!.garmentIds).toEqual(['top-a', 'deleted'])
    expect(plan[0]!.garmentIds.length).toBeGreaterThan(0)
    expect(packingGroups(wardrobe(), plan).flatMap((group) => group.items.map((item) => item.garment.id))).not.toContain('deleted')
  })

  it('plans 14 days with a history of feedback and wear in reasonable time', () => {
    const garments = Array.from({ length: 120 }, (_, index) => garment(`g${index}`, (['Top', 'Top', 'Bottom', 'Calzado', 'Capa', 'Accesorio'] as const)[index % 6]!, { subcategory: ['Camiseta', 'Vaqueros', 'Jersey', 'Zapatillas', 'Abrigo', 'Bufanda'][index % 6]! }))
    const now = new Date('2026-11-09T12:00:00Z')
    const feedback = Array.from({ length: 300 }, (_, index) => ({
      id: `f${index}`, type: (['like', 'dislike', 'saved', 'worn'] as const)[index % 4]!, garmentIds: [`g${index % 120}`, `g${(index * 7) % 120}`], createdAt: new Date(now.getTime() - index * 28_800_000).toISOString()
    }))
    const wear = Array.from({ length: 200 }, (_, index) => ({ garmentIds: [`g${index % 120}`, `g${(index * 5) % 120}`], at: new Date(now.getTime() - index * 86_400_000).toISOString() }))
    const started = performance.now()
    const plan = planDays(garments, tripDays(14), 'balanced', { now, feedback, wear })
    expect(plan.every((day) => day.garmentIds.length >= 2)).toBe(true)
    // It took 27-29 s before the history was summed up once per search; about 1-2 s after, on the development machine.
    expect(performance.now() - started).toBeLessThan(8000)
  })
})
