import { describe, expect, it } from 'vitest'
import type { TripDay } from '../types/domain'
import { hashText, sceneFor, sequence } from './tripScene'

function days(conditions: string[][], high = 20): TripDay[] {
  return conditions.map((list, index) => {
    const date = `2026-12-0${index + 1}`
    return { date, occasion: 'Diario', garmentIds: [], weather: { date, temperatureCelsius: high - 4, high, low: high - 8, conditions: list, source: 'forecast' } }
  })
}

const place = { name: 'Lisboa', country: 'Portugal', latitude: 38.7, longitude: -9.1 }

describe('trip scene', () => {
  it('draws the kind of place of the trip and its weather', () => {
    expect(sceneFor({ kind: 'beach', days: days([['soleado'], ['soleado']]), place })).toMatchObject({ landscape: 'coast', sky: 'sun' })
    expect(sceneFor({ kind: 'snow', days: days([['nieve']], -2), place })).toMatchObject({ landscape: 'snow', sky: 'snow' })
    expect(sceneFor({ kind: 'sport', days: days([['lluvia'], ['lluvia'], ['soleado']]), place })).toMatchObject({ landscape: 'mountain', sky: 'rain' })
    expect(sceneFor({ kind: 'work', days: days([['lluvia'], ['soleado'], ['soleado']]), place })).toMatchObject({ landscape: 'city', sky: 'cloud' })
  })

  it('looks the same for the same destination and different for another', () => {
    const trip = { kind: 'leisure', days: days([['soleado']]), place }
    expect(sceneFor(trip)).toEqual(sceneFor(trip))
    expect(hashText('Lisboa|Portugal')).not.toBe(hashText('Oporto|Portugal'))
    const a = sequence(1)
    const b = sequence(1)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(sequence(2)()).not.toBe(sequence(1)())
  })
})
