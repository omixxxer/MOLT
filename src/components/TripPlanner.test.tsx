import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../db/database'
import type { Garment, GarmentRole, Trip } from '../types/domain'
import { dayFromToday } from '../weather/openMeteo'
import TripPlanner from './TripPlanner'

function garment(id: string, role: GarmentRole, change: Partial<Garment> = {}): Garment {
  return {
    id, name: id, category: role === 'Top' ? 'Parte superior' : 'Parte inferior', subcategory: '', colors: [], seasons: [], styles: [], dressLevels: ['Diario'], role,
    image: new Blob(['image']), thumbnail: new Blob(['thumbnail']), width: 100, height: 100, confirmedAttributes: [], suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
}

const wardrobe = () => [garment('camisa', 'Top'), garment('polo', 'Top'), garment('vaqueros', 'Bottom')]

/** The real service answers: a search, then each day's forecast with what `weatherOf` says. */
function stubService(weatherOf: (date: string, index: number) => { high?: number; low?: number; code?: number; chance?: number; mm?: number } = () => ({})) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname.startsWith('geocoding')) {
      return { ok: true, status: 200, json: async () => ({ results: [
        { id: 1, name: 'Valencia', latitude: 39.47, longitude: -0.38, country: 'España', admin1: 'Comunidad Valenciana' },
        { id: 2, name: 'Valencia', latitude: 10.16, longitude: -68, country: 'Venezuela', admin1: 'Carabobo' }
      ] }) }
    }
    const dates: string[] = []
    for (let date = url.searchParams.get('start_date')!; date <= url.searchParams.get('end_date')!; date = dayFromToday(1, new Date(`${date}T12:00:00`))) dates.push(date)
    const values = dates.map(weatherOf)
    return { ok: true, status: 200, json: async () => ({ daily: {
      time: dates,
      temperature_2m_max: values.map((value) => value.high ?? 20),
      temperature_2m_min: values.map((value) => value.low ?? 15),
      precipitation_sum: values.map((value) => value.mm ?? 0),
      precipitation_probability_max: values.map((value) => value.chance ?? 0),
      wind_speed_10m_max: values.map(() => 10),
      uv_index_max: values.map(() => 2),
      weather_code: values.map((value) => value.code ?? 1)
    } }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setup(garments = wardrobe()) {
  const onAvailabilityChange = vi.fn().mockResolvedValue(undefined)
  const view = render(<TripPlanner garments={garments} onAvailabilityChange={onAvailabilityChange} />)
  return { user: userEvent.setup(), onAvailabilityChange, ...view }
}

async function createTrip(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Destino'), 'Valencia')
  await user.click(await screen.findByRole('option', { name: /Venezuela/ }))
  await user.click(screen.getByRole('button', { name: 'Preparar la maleta' }))
  return screen.findByRole('complementary', { name: /Lista de maleta/ })
}

beforeEach(() => localStorage.clear())

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  await database.open()
  await Promise.all([database.trips.clear(), database.outfits.clear(), database.outfitFeedback.clear()])
})

describe('TripPlanner', () => {
  it('plans from the place chosen in the list, not just the first with that name', async () => {
    const fetchMock = stubService()
    const { user } = setup()
    await createTrip(user)
    expect(fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/forecast'))).toContain('latitude=10.16')
    expect(screen.getByRole('heading', { name: 'Valencia' })).toBeInTheDocument()
    expect(screen.getByText('Valencia, Carabobo, Venezuela')).toBeInTheDocument()
  })

  it('takes the most relevant place when none is chosen', async () => {
    const fetchMock = stubService()
    const { user } = setup()
    await user.type(await screen.findByLabelText('Destino'), 'Valencia')
    await user.click(screen.getByRole('button', { name: 'Preparar la maleta' }))
    await screen.findByRole('complementary', { name: /Lista de maleta/ })
    expect(fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/forecast'))).toContain('latitude=39.47')
  })

  it('checks the dates before asking anyone', async () => {
    const fetchMock = stubService()
    const { user } = setup()
    await user.type(await screen.findByLabelText('Destino'), 'V')
    await user.clear(screen.getByLabelText('Último día'))
    await user.type(screen.getByLabelText('Último día'), dayFromToday(30))
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 14 días')
    expect(screen.getByRole('button', { name: 'Preparar la maleta' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the weather and an outfit for each day, and keeps the trip for next time', async () => {
    stubService((_, index) => (index === 1 ? { code: 61, chance: 80, mm: 5 } : {}))
    const { user, unmount } = setup()
    await createTrip(user)
    const days = screen.getByRole('region', { name: 'Qué ponerte cada día' })
    expect(within(days).getAllByRole('article')).toHaveLength(3)
    expect(within(days).getByText(/lluvia 80 % · lluvia/)).toBeInTheDocument()
    expect(screen.getByText(/Lluvia 1 día/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Datos de Open-Meteo' })).toHaveAttribute('href', 'https://open-meteo.com/')
    expect(screen.getByText('Paraguas o chubasquero')).toBeInTheDocument()

    await waitFor(async () => expect(await database.trips.count()).toBe(1))
    unmount()
    setup()
    expect(await screen.findByRole('heading', { name: 'Valencia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Valencia/, pressed: true })).toBeInTheDocument()
  })

  it('ticks garments and extras, adds and removes extras, and remembers it all', async () => {
    stubService()
    const { user, unmount } = setup()
    const list = within(await createTrip(user))
    const total = list.getAllByRole('checkbox').length
    expect(list.getByText(`0 de ${total} en la maleta`)).toBeInTheDocument()
    await user.click(list.getByRole('checkbox', { name: /vaqueros/ }))
    await user.click(list.getByRole('checkbox', { name: 'Neceser' }))
    expect(list.getByText(`2 de ${total} en la maleta`)).toBeInTheDocument()

    await user.type(list.getByLabelText('Añadir a la lista'), 'Entradas')
    await user.click(list.getByRole('button', { name: 'Añadir' }))
    expect(list.getByRole('checkbox', { name: 'Entradas' })).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Quitar Pijama' }))
    expect(list.queryByText('Pijama')).not.toBeInTheDocument()

    await waitFor(async () => expect((await database.trips.toArray())[0]?.packedIds).toContain('vaqueros'))
    unmount()
    setup()
    const again = within(await screen.findByRole('complementary', { name: /Lista de maleta/ }))
    expect(again.getByRole('checkbox', { name: /vaqueros/ })).toBeChecked()
    expect(again.getByRole('checkbox', { name: 'Entradas' })).not.toBeChecked()
  })

  it('changes a day by asking for another option or choosing a piece, and the list follows', async () => {
    stubService()
    const { user } = setup([...wardrobe(), garment('chinos', 'Bottom')])
    await createTrip(user)
    const [first] = within(screen.getByRole('region', { name: 'Qué ponerte cada día' })).getAllByRole('article')
    const shownIn = () => within(first!).getAllByRole('button', { name: /^Cambiar / }).map((button) => button.getAttribute('aria-label')).join()
    const before = shownIn()
    await user.click(within(first!).getByRole('button', { name: 'Otra opción' }))
    expect(shownIn()).not.toBe(before)

    const bottom = /chinos/.test(shownIn()) ? 'chinos' : 'vaqueros'
    const other = bottom === 'chinos' ? 'vaqueros' : 'chinos'
    await user.click(within(first!).getByRole('button', { name: `Cambiar ${bottom}` }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: other }))
    expect(shownIn()).toContain(other)
    expect(within(screen.getByRole('complementary', { name: /Lista de maleta/ })).getByRole('checkbox', { name: new RegExp(other) })).toBeInTheDocument()
  })

  it('warns of what is in the wash only if the plan needs it, and offers to wear today\'s outfit', async () => {
    stubService()
    const { user } = setup()
    await user.type(await screen.findByLabelText('Destino'), 'Valencia')
    await user.clear(screen.getByLabelText('Primer día'))
    await user.type(screen.getByLabelText('Primer día'), dayFromToday(0))
    await user.click(screen.getByRole('button', { name: 'Preparar la maleta' }))
    await screen.findByRole('complementary', { name: /Lista de maleta/ })
    await user.click(screen.getByRole('button', { name: 'Me lo pongo hoy' }))
    expect(await screen.findByRole('button', { name: 'Puesto hoy' })).toBeDisabled()
    expect(await database.outfitFeedback.where('type').equals('worn').count()).toBe(1)
  })

  it('looks at the weather again when reopening an old plan, tells what changed and adjusts on request', async () => {
    const start = dayFromToday(1)
    const trip: Trip = {
      id: 't', place: { name: 'Valencia', latitude: 39.47, longitude: -0.38 }, startDate: start, endDate: start, kind: 'leisure', style: 'balanced',
      days: [{ date: start, occasion: 'Diario', garmentIds: ['camisa', 'vaqueros'], weather: { date: start, temperatureCelsius: 25, high: 27, low: 22, conditions: ['despejado'], source: 'forecast' } }],
      packedIds: [], extras: [], fetchedAt: new Date(Date.now() - 86_400_000).toISOString(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await database.open()
    await database.trips.put(trip)
    stubService(() => ({ high: 14, low: 10, code: 63, chance: 90, mm: 6 }))
    const { user } = setup([...wardrobe(), garment('abrigo', 'Capa')])
    const changes = await screen.findByRole('region', { name: 'Cambios en el tiempo' })
    expect(changes).toHaveTextContent('de 25 a 12 °C, ahora con lluvia')
    await user.click(within(changes).getByRole('button', { name: 'Reajustar outfits' }))
    expect(screen.queryByRole('region', { name: 'Cambios en el tiempo' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Qué ponerte cada día' })).getByRole('button', { name: 'Cambiar abrigo' })).toBeInTheDocument()
  })

  it('deletes a trip after asking', async () => {
    stubService()
    const { user } = setup()
    await createTrip(user)
    await waitFor(async () => expect(await database.trips.count()).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Eliminar el viaje' }))
    await user.click(await screen.findByRole('button', { name: 'Eliminar viaje' }))
    await waitFor(async () => expect(await database.trips.count()).toBe(0))
    expect(await screen.findByLabelText('Destino')).toBeInTheDocument()
  })

  it('says what went wrong when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { user } = setup()
    await user.type(await screen.findByLabelText('Destino'), 'Valencia')
    await user.click(screen.getByRole('button', { name: 'Preparar la maleta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Comprueba tu conexión')
  })
})
