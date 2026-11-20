import type { Trip } from '../types/domain'
import { summarizeWeather } from './packingPlan'

// The picture behind a trip's header, drawn on the device (TripScene.tsx): the kind of place from the kind of
// trip, the sky from its weather, and the rest (skyline, peaks, the time of day) from the destination's name, so
// two trips never look the same and the same trip always does. Nothing is fetched.

export type Landscape = 'coast' | 'mountain' | 'snow' | 'city' | 'country'
export type Sky = 'sun' | 'cloud' | 'rain' | 'snow'

export interface Scene {
  landscape: Landscape
  sky: Sky
  /** 0 dawn, 1 day, 2 dusk. */
  light: 0 | 1 | 2
  /** A number from the destination, for the shapes. */
  seed: number
}

/** A stable 32-bit number from a text (FNV-1a). */
export function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** A repeatable sequence of numbers in [0, 1) from a seed (mulberry32). */
export function sequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function sceneFor(trip: Pick<Trip, 'kind' | 'days' | 'place'>): Scene {
  const summary = summarizeWeather(trip.days.map((day) => day.weather))
  const seed = hashText(`${trip.place.name}|${trip.place.country ?? ''}`)
  const landscape: Landscape = trip.kind === 'beach'
    ? 'coast'
    : trip.kind === 'snow' || (summary.snowDays > 0 && summary.high <= 4)
      ? 'snow'
      : trip.kind === 'sport'
        ? 'mountain'
        : trip.kind === 'leisure' ? (seed % 3 === 0 ? 'country' : 'city') : 'city'
  const sky: Sky = summary.snowDays > 0
    ? 'snow'
    : summary.rainDays * 2 >= trip.days.length
      ? 'rain'
      : summary.rainDays > 0 ? 'cloud' : 'sun'
  return { landscape, sky, light: (seed % 3) as 0 | 1 | 2, seed }
}
