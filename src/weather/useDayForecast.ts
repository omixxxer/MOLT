import { useEffect, useState } from 'react'
import { dayFromToday, getForecast, peekForecast, type DailyWeather, type Place } from './openMeteo'

const PLACE_KEY = 'molt-place'

export function readSavedPlace(): Place | undefined {
  try {
    const stored = localStorage.getItem(PLACE_KEY)
    return stored ? JSON.parse(stored) as Place : undefined
  } catch {
    return undefined
  }
}

function savePlace(place: Place | undefined) {
  try {
    if (place) localStorage.setItem(PLACE_KEY, JSON.stringify(place))
    else localStorage.removeItem(PLACE_KEY)
  } catch {
    // Without storage the city is simply asked again next time.
  }
}

export interface DayForecast {
  place?: Place
  setPlace: (place: Place | undefined) => void
  /** 0 today, 1 tomorrow. */
  offset: 0 | 1
  setOffset: (offset: 0 | 1) => void
  day?: DailyWeather
  loading: boolean
  stale: boolean
  error: string
}

/** The weather of the user's city today or tomorrow, the same for every screen that dresses for it. */
export function useDayForecast(): DayForecast {
  const [place, setPlaceState] = useState(readSavedPlace)
  const [offset, setOffset] = useState<0 | 1>(0)
  const [result, setResult] = useState<{ day?: DailyWeather; stale: boolean; error: string; loading: boolean }>(() => {
    const known = place && peekForecast(place, dayFromToday(0))
    return { day: known, stale: false, error: '', loading: Boolean(place && !known) }
  })

  function setPlace(next: Place | undefined) {
    savePlace(next)
    setPlaceState(next)
  }

  useEffect(() => {
    if (!place) {
      setResult({ stale: false, error: '', loading: false })
      return
    }
    const date = dayFromToday(offset)
    const known = peekForecast(place, date)
    if (known) {
      setResult({ day: known, stale: false, error: '', loading: false })
      return
    }
    const controller = new AbortController()
    setResult((current) => ({ ...current, error: '', loading: true }))
    getForecast(place, date, 1, { signal: controller.signal })
      .then(({ days, stale }) => setResult({ day: days[0], stale, error: '', loading: false }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setResult({ stale: false, error: reason instanceof Error ? reason.message : 'No se pudo consultar el tiempo.', loading: false })
      })
    return () => controller.abort()
  }, [place, offset])

  return { place, setPlace, offset, setOffset, ...result }
}
