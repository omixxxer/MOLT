import { describe, expect, it } from 'vitest'
import type { Garment, GarmentRole, TripDay } from '../types/domain'
import type { DailyWeather } from '../weather/openMeteo'
import { defaultExtras, forecastChanges, nextOutfitForDay, packingGroups, planDays, summarizeWeather } from './packingPlan'

function garment(id: string, role: GarmentRole, change: Partial<Garment> = {}): Garment {
  return {
    id, name: id, category: 'Parte superior', subcategory: '', colors: ['Azul marino'], seasons: [], styles: [], dressLevels: ['Diario'], role,
    image: new Blob(['i']), thumbnail: new Blob(['t']), width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [],
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
