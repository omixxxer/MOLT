import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayFromToday, getForecast, isRainy, peekForecast, placeLabel, searchPlaces, WeatherError, type Place } from './openMeteo'

const valencia: Place = { name: 'Valencia', region: 'Comunidad Valenciana', country: 'España', latitude: 39.47, longitude: -0.38 }

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function daily(time: string[], change: Record<string, unknown[]> = {}) {
  return {
    daily: {
      time,
      temperature_2m_max: time.map(() => 20),
      temperature_2m_min: time.map(() => 10),
      apparent_temperature_max: time.map(() => 19),
      apparent_temperature_min: time.map(() => 9),
      precipitation_sum: time.map(() => 0),
      precipitation_probability_max: time.map(() => 0),
      wind_speed_10m_max: time.map(() => 10),
      uv_index_max: time.map(() => 3),
      weather_code: time.map(() => 1),
      ...change
    }
  }
}

function days(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => dayFromToday(from + index))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('searchPlaces', () => {
  it('returns every place with that name, so the user can tell them apart', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ results: [
      { id: 1, name: 'Valencia', latitude: 39.47, longitude: -0.38, country: 'España', admin1: 'Comunidad Valenciana' },
      { id: 2, name: 'Valencia', latitude: 10.16, longitude: -68, country: 'Venezuela', admin1: 'Carabobo' }
    ] }))
    vi.stubGlobal('fetch', fetchMock)
    const found = await searchPlaces(' Valencia ')
    expect(found.map(placeLabel)).toEqual(['Valencia, Comunidad Valenciana, España', 'Valencia, Carabobo, Venezuela'])
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('name=Valencia')
  })

  it('does not ask for a name too short to mean anything', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchPlaces('V')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getForecast', () => {
  it('dresses for how the day feels and reads the range, rain, wind and sun', async () => {
    const [first] = days(1, 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily([first!], { precipitation_probability_max: [70], precipitation_sum: [4], weather_code: [61], wind_speed_10m_max: [45], uv_index_max: [7] }))))
    const { days: [day], stale } = await getForecast(valencia, first!, 1)
    expect(stale).toBe(false)
    expect(day).toEqual(expect.objectContaining({ date: first, temperatureCelsius: 15, high: 20, low: 10, rainChance: 70, windKmh: 45, uvIndex: 7, source: 'forecast' }))
    expect(day?.conditions).toEqual(['lluvia', 'viento'])
    expect(isRainy(day!)).toBe(true)
  })

  it('does not call a day rainy for a code of rain with a low chance and almost no water', async () => {
    const [first] = days(1, 1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily([first!], { precipitation_probability_max: [12], precipitation_sum: [0.1], weather_code: [61] }))))
    const { days: [day] } = await getForecast(valencia, first!, 1)
    expect(day?.conditions).toEqual(['nuboso'])
    expect(isRainy(day!)).toBe(false)
  })

  it('warns of likely rain even when the code does not say it, and keeps snow as snow', async () => {
    const dates = days(1, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily(dates, { precipitation_probability_max: [60, 10], weather_code: [3, 73] }))))
    const { days: result } = await getForecast(valencia, dates[0]!, 2)
    expect(result[0]?.conditions).toEqual(['nuboso', 'lluvia probable'])
    expect(result[1]?.conditions).toEqual(['nieve'])
  })

  it('uses past years for dates beyond the forecast, and both when a trip spans the limit', async () => {
    const dates = days(14, 4)
    const fetchMock = vi.fn(async (input: URL) => {
      const url = new URL(String(input))
      if (url.hostname.startsWith('archive')) {
        const year = url.searchParams.get('start_date')!.slice(0, 4)
        expect(url.searchParams.get('start_date')!.slice(5)).toBe(dates[2]!.slice(5))
        return ok(daily([`${year}-a`, `${year}-b`], { temperature_2m_max: [30, 30], temperature_2m_min: [20, 20], apparent_temperature_max: [30, 30], apparent_temperature_min: [20, 20], precipitation_sum: [4, 0], wind_speed_10m_max: [10, 10], precipitation_probability_max: [null, null], uv_index_max: [null, null], weather_code: [null, null] }))
      }
      return ok(daily(dates.slice(0, 2)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { days: result } = await getForecast(valencia, dates[0]!, 4)
    expect(result.map((day) => day.source)).toEqual(['forecast', 'forecast', 'climate', 'climate'])
    expect(result.map((day) => day.date)).toEqual(dates)
    expect(result[2]).toEqual(expect.objectContaining({ high: 30, low: 20, temperatureCelsius: 26 }))
    expect(result[2]?.conditions).toEqual(['lluvia probable'])
    expect(result[3]?.conditions).toEqual(['suele estar seco'])
    expect(fetchMock).toHaveBeenCalledTimes(3) // The forecast and two past years.
  })

  it('reuses a recent answer, and asks again when forced or after three hours', async () => {
    const [first] = days(1, 1)
    const fetchMock = vi.fn().mockResolvedValue(ok(daily([first!])))
    vi.stubGlobal('fetch', fetchMock)
    const now = new Date()
    await getForecast(valencia, first!, 1, { now })
    await getForecast(valencia, first!, 1, { now })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(peekForecast(valencia, first!, now)).toEqual(expect.objectContaining({ date: first }))
    await getForecast(valencia, first!, 1, { now, force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const later = new Date(now.getTime() + 4 * 3_600_000)
    expect(peekForecast(valencia, first!, later)).toBeUndefined()
    await getForecast(valencia, first!, 1, { now: later })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('replaces past years with the forecast when the date comes within reach', async () => {
    const date = dayFromToday(20)
    const now = new Date()
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const start = new URL(String(input)).searchParams.get('start_date')!
      return ok(daily([start]))
    }))
    expect((await getForecast(valencia, date, 1, { now })).days[0]?.source).toBe('climate')
    const closer = new Date(now.getTime() + 10 * 86_400_000)
    expect(peekForecast(valencia, date, closer)).toBeUndefined()
    expect((await getForecast(valencia, date, 1, { now: closer })).days[0]?.source).toBe('forecast')
  })

  it('gives the last known days when the service cannot be reached, marked as such', async () => {
    const [first] = days(1, 1)
    const now = new Date()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok(daily([first!]))).mockRejectedValue(new TypeError('Failed to fetch')))
    await getForecast(valencia, first!, 1, { now })
    const { days: [day], stale } = await getForecast(valencia, first!, 1, { now, force: true })
    expect(stale).toBe(true)
    expect(day?.date).toBe(first)
  })

  it('tries again once, and says what is wrong in the user\'s terms', async () => {
    const [first] = days(1, 1)
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', offline)
    await expect(getForecast(valencia, first!, 1)).rejects.toMatchObject({ kind: 'offline' })
    expect(offline).toHaveBeenCalledTimes(2)

    const flaky = vi.fn().mockResolvedValueOnce({ ok: false, status: 502 }).mockResolvedValue(ok(daily([first!])))
    vi.stubGlobal('fetch', flaky)
    expect((await getForecast(valencia, first!, 1)).days).toHaveLength(1)

    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(getForecast(valencia, first!, 1)).rejects.toBeInstanceOf(WeatherError)
  })

  it('rejects dates that make no sense without asking anyone', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getForecast(valencia, dayFromToday(-1), 1)).rejects.toMatchObject({ kind: 'range' })
    await expect(getForecast(valencia, dayFromToday(1), 15)).rejects.toThrow('entre 1 y 14 días')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
