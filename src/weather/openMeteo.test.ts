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

// Phase 4: places that do not exist, network errors and forecasts that cover only part of what was asked.

/** The service as it answers: the days between start_date and end_date, both included. */
function answerDates(input: URL) {
  const url = new URL(String(input))
  const dates: string[] = []
  for (let day = new Date(`${url.searchParams.get('start_date')}T12:00:00Z`); day <= new Date(`${url.searchParams.get('end_date')}T12:00:00Z`); day = new Date(day.getTime() + 86_400_000)) {
    dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}

describe('searchPlaces when something goes wrong', () => {
  it('finds nothing for a place that does not exist, as the service answers it', async () => {
    // Open-Meteo leaves out «results» when nothing matches.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ generationtime_ms: 0.4 })))
    expect(await searchPlaces('Ciudadquenoexiste')).toEqual([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ results: [] })))
    expect(await searchPlaces('Ciudadquenoexiste')).toEqual([])
  })

  it('tries again once without network and then says to check the connection', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', offline)
    await expect(searchPlaces('Valencia')).rejects.toMatchObject({ kind: 'offline', message: expect.stringMatching(/conexión/) })
    expect(offline).toHaveBeenCalledTimes(2)
  })

  it('stops without retrying when the search is cancelled', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn((_input: URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const search = searchPlaces('Valencia', controller.signal)
    controller.abort()
    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not blame the connection for an answer it cannot read', async () => {
    const broken = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } })
    vi.stubGlobal('fetch', broken)
    await expect(searchPlaces('Valencia')).rejects.toMatchObject({ kind: 'service' })
  })
})

describe('getForecast with partial answers', () => {
  it('refuses a forecast that does not reach every day asked for', async () => {
    const dates = days(1, 3)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily(dates.slice(0, 2)))))
    await expect(getForecast(valencia, dates[0]!, 3)).rejects.toMatchObject({ kind: 'service', message: expect.stringMatching(/no cubre/) })
  })

  it('refuses a day without temperatures, and reads a day without the optional values', async () => {
    const dates = days(1, 2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily(dates, { temperature_2m_max: [20, null] }))))
    await expect(getForecast(valencia, dates[0]!, 2)).rejects.toMatchObject({ kind: 'service', message: expect.stringMatching(/incompleta/) })

    localStorage.clear()
    const bare = { daily: { time: dates, temperature_2m_max: [20, 22], temperature_2m_min: [10, 12] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(bare)))
    const { days: result } = await getForecast(valencia, dates[0]!, 2)
    expect(result[0]).toEqual(expect.objectContaining({ temperatureCelsius: 16, high: 20, low: 10, rainChance: undefined, windKmh: undefined, conditions: ['condiciones variables'] }))
  })

  it('does not hand over part of a trip as if it were all of it when the service fails', async () => {
    const dates = days(1, 3)
    const now = new Date()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(daily(dates.slice(0, 2)))))
    await getForecast(valencia, dates[0]!, 2, { now })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    // Two of the three days are known, but a plan needs all of them.
    await expect(getForecast(valencia, dates[0]!, 3, { now })).rejects.toMatchObject({ kind: 'offline' })
  })

  it('fails as a whole when one of the past years cannot be read', async () => {
    const now = new Date('2026-11-17T12:00:00')
    // 2025 answers; 2024 fails twice.
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => new URL(String(input)).searchParams.get('start_date')!.startsWith('2025')
      ? ok(daily(answerDates(input)))
      : { ok: false, status: 500 }))
    await expect(getForecast(valencia, '2026-12-17', 1, { now })).rejects.toMatchObject({ kind: 'service' })
  })

  it('averages past years for a trip far ahead across 29 February', async () => {
    // 2028 is a leap year: 28 Feb to 1 Mar is three days, two in the years before.
    const now = new Date('2026-11-17T12:00:00')
    const fetchMock = vi.fn(async (input: URL) => ok(daily(answerDates(input))))
    vi.stubGlobal('fetch', fetchMock)
    const { days: result } = await getForecast(valencia, '2028-02-28', 3, { now })
    expect(result.map((day) => day.date)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(result.every((day) => day.source === 'climate')).toBe(true)

    // And the other way round: from a normal year, a range of past years that includes 29 February.
    localStorage.clear()
    const { days: after } = await getForecast(valencia, '2029-02-27', 4, { now })
    expect(after.map((day) => day.date)).toEqual(['2029-02-27', '2029-02-28', '2029-03-01', '2029-03-02'])
    for (const call of fetchMock.mock.calls.slice(-2)) expect(answerDates(call[0] as URL)).toHaveLength(4)
  })
})
