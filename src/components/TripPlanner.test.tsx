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
    width: 100, height: 100, confirmedAttributes: [], suggestedAttributes: [],
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

/** From the list of trips, the trip to that place. */
async function openTrip(user: ReturnType<typeof userEvent.setup>, place = 'Valencia') {
  await user.click(await screen.findByRole('button', { name: new RegExp(`Abrir el viaje a ${place}`) }))
  return screen.findByRole('complementary', { name: /Lista de maleta/ })
}

function storedTrip(change: Partial<Trip> = {}): Trip {
  const start = dayFromToday(1)
  return {
    id: 't', place: { name: 'Valencia', latitude: 39.47, longitude: -0.38 }, startDate: start, endDate: start, kind: 'leisure', style: 'balanced',
    days: [{ date: start, occasion: 'Diario', garmentIds: ['camisa', 'vaqueros'], weather: { date: start, temperatureCelsius: 25, high: 27, low: 22, conditions: ['despejado'], source: 'forecast' } }],
    packedIds: [], extras: [], fetchedAt: new Date().toISOString(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
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
    const again = setup()
    // Back on the list of trips, from which the trip opens.
    expect(await screen.findByRole('heading', { name: 'En curso y próximos' })).toBeInTheDocument()
    await openTrip(again.user)
    expect(screen.getByRole('heading', { name: 'Valencia' })).toBeInTheDocument()
    await again.user.click(screen.getByRole('button', { name: 'Tus viajes' }))
    expect(screen.getByRole('button', { name: /Abrir el viaje a Valencia/ })).toBeInTheDocument()
  })

  it('changes the kind of suitcase of a trip and plans the days again', async () => {
    stubService()
    const { user } = setup()
    await createTrip(user)
    expect(screen.getByRole('button', { name: /equilibrada/i, pressed: true })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ligera/i }))
    expect(await screen.findByText(/Maleta ligera: outfits elegidos de nuevo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ligera/i, pressed: true })).toBeInTheDocument()
    await waitFor(async () => expect((await database.trips.toArray())[0]?.style).toBe('light'))
  })

  it('looks for a photo of the destination on opening, with a small credit, and keeps the drawing without one', async () => {
    const service = stubService()
    const weather = service.getMockImplementation()!
    let photos = [{ title: 'Archivo:Bandera.svg', type: 'image' }, { title: 'Archivo:Plaza_de_Valencia.jpg', type: 'image' }]
    service.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/media-list/')) return new Response(JSON.stringify({ items: photos }))
      if (url.searchParams.get('gsrsearch')) return new Response(JSON.stringify({ query: { pages: {} } }))
      if (url.hostname === 'es.wikipedia.org') {
        return new Response(JSON.stringify({ query: { pages: { '-1': { imageinfo: [{
          thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/p/pl/Plaza_de_Valencia.jpg/1280px-Plaza_de_Valencia.jpg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Plaza_de_Valencia.jpg',
          extmetadata: { Artist: { value: 'Ana Silva' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }
        }] } } } }))
      }
      if (url.hostname === 'upload.wikimedia.org') return new Response(new Blob(['jpeg'], { type: 'image/jpeg' }))
      return weather(input)
    })
    const { user, unmount } = setup()
    await createTrip(user)
    // No button: the photo comes on its own, credited in a corner; nothing else is asked of Wikipedia.
    expect(await screen.findByRole('link', { name: '© Ana Silva' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Plaza_de_Valencia.jpg')
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Foto real|Volver al dibujo/ })).not.toBeInTheDocument()
    await waitFor(async () => expect((await database.trips.toArray())[0]?.cover?.author).toBe('Ana Silva'))
    for (const [input] of service.mock.calls) if (String(input).includes('wikipedia.org/')) expect(String(input)).not.toMatch(/start_date|garment/)

    // Another trip, to a place without a free photo: the drawing stays, and it is not asked again on reopening.
    unmount()
    await database.trips.clear()
    photos = [{ title: 'Archivo:Bandera.svg', type: 'image' }]
    const again = setup()
    await createTrip(again.user)
    await waitFor(async () => expect((await database.trips.toArray())[0]?.coverCheckedAt).toBeDefined())
    expect(document.querySelector('.trip-scene')).not.toBeNull()
    expect(screen.queryByRole('link', { name: /©/ })).not.toBeInTheDocument()
    again.unmount()
    const asked = service.mock.calls.length
    const last = setup()
    await openTrip(last.user)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(service.mock.calls.slice(asked).some(([input]) => String(input).includes('wikipedia'))).toBe(false)
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
    // Adding and removing is done in «Editar la maleta».
    expect(list.queryByLabelText('Añadir a la lista')).not.toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Editar la maleta' }))

    await user.type(list.getByLabelText('Añadir a la lista'), 'Entradas')
    await user.click(list.getByRole('button', { name: 'Añadir' }))
    expect(list.getByRole('checkbox', { name: 'Entradas' })).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Quitar Pijama' }))
    expect(list.queryByText('Pijama')).not.toBeInTheDocument()

    await waitFor(async () => expect((await database.trips.toArray())[0]?.packedIds).toContain('vaqueros'))
    unmount()
    const reopened = setup()
    const again = within(await openTrip(reopened.user))
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

  it('looks at the weather again on its own when reopening an old plan, adjusts the outfits and can undo it', async () => {
    await database.open()
    await database.trips.put(storedTrip({ fetchedAt: new Date(Date.now() - 86_400_000).toISOString() }))
    stubService(() => ({ high: 14, low: 10, code: 63, chance: 90, mm: 6 }))
    const { user } = setup([...wardrobe(), garment('abrigo', 'Capa')])
    await openTrip(user)
    const changes = await screen.findByRole('region', { name: 'Cambios en el tiempo' })
    expect(changes).toHaveTextContent('de 25 a 12 °C, ahora con lluvia')
    // No button to press: the outfits follow the new weather on their own.
    expect(screen.queryByRole('button', { name: /Actualizar tiempo|Reajustar outfits/ })).not.toBeInTheDocument()
    const days = () => within(screen.getByRole('region', { name: 'Qué ponerte cada día' }))
    await waitFor(() => expect(days().getByRole('button', { name: 'Cambiar abrigo' })).toBeInTheDocument())
    expect(changes).toHaveTextContent('Outfits reajustados al nuevo tiempo.')

    await user.click(within(changes).getByRole('button', { name: 'Deshacer' }))
    expect(days().queryByRole('button', { name: 'Cambiar abrigo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cambios en el tiempo' })).not.toBeInTheDocument()
    await waitFor(async () => expect((await database.trips.get('t'))?.days[0]?.weather.high).toBe(14))
  })

  it('does not ask for the weather again when the forecast is recent, and says when it was looked at', async () => {
    await database.open()
    await database.trips.put(storedTrip())
    // The same weather as the stored forecast.
    const fetchMock = stubService(() => ({ high: 27, low: 22 }))
    const { user } = setup()
    await openTrip(user)
    expect(screen.getByText(/Actualizado ahora mismo; se actualiza solo/)).toBeInTheDocument()
    const forecasts = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/forecast')).length
    expect(forecasts()).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Consultar el tiempo ahora' }))
    expect(await screen.findByText('El tiempo no ha cambiado.')).toBeInTheDocument()
    expect(forecasts()).toBe(1)
  })

  it('lists the trips coming up and the past ones, and opens each', async () => {
    await database.open()
    const past = dayFromToday(-10)
    const day = storedTrip().days[0]!
    await database.trips.bulkPut([
      storedTrip(),
      storedTrip({ id: 'p', place: { name: 'Lisboa', latitude: 38.7, longitude: -9.1 }, startDate: past, endDate: past, days: [{ ...day, date: past, weather: { ...day.weather, date: past } }] })
    ])
    stubService()
    const { user } = setup()
    const coming = await screen.findByRole('region', { name: 'En curso y próximos' })
    expect(within(coming).getByRole('button', { name: /Valencia/ })).toHaveTextContent('Empieza mañana')
    expect(within(coming).getByRole('button', { name: /Valencia/ })).toHaveTextContent('0 de 2 en la maleta')
    expect(within(screen.getByRole('region', { name: 'Pasados' })).getByRole('button', { name: /Lisboa/ })).toHaveTextContent('Terminado')
    await openTrip(user, 'Lisboa')
    expect(screen.getByRole('heading', { name: 'Lisboa' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tus viajes' }))
    await user.click(screen.getByRole('button', { name: 'Nuevo viaje' }))
    expect(screen.getByLabelText('Destino')).toBeInTheDocument()
  })

  it('adds garments «por si acaso» and notes while editing the suitcase, and keeps them', async () => {
    await database.open()
    await database.trips.put(storedTrip())
    stubService()
    const { user, unmount } = setup()
    const list = within(await openTrip(user))
    expect(list.queryByRole('checkbox', { name: /polo/ })).not.toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Editar la maleta' }))
    await user.click(list.getByRole('button', { name: 'Añadir prendas del armario' }))
    const picker = within(screen.getByRole('dialog', { name: 'Añadir prendas a la maleta' }))
    // What the outfits already take is not offered again.
    expect(picker.queryByRole('button', { name: /camisa/ })).not.toBeInTheDocument()
    await user.click(picker.getByRole('button', { name: /polo/ }))
    expect(picker.getByRole('button', { name: /polo/, pressed: true })).toBeInTheDocument()
    await user.click(picker.getByRole('button', { name: 'Listo' }))
    expect(list.getByRole('checkbox', { name: /polo.*Por si acaso/ })).toBeInTheDocument()

    await user.type(list.getByLabelText('Notas del viaje'), 'Tren a las 9:15')
    await user.click(list.getByRole('button', { name: 'Listo' }))
    expect(list.getByText('Tren a las 9:15')).toBeInTheDocument()
    await waitFor(async () => expect(await database.trips.get('t')).toMatchObject({ extraGarmentIds: ['polo'], notes: 'Tren a las 9:15' }))

    unmount()
    const again = setup()
    const reopened = within(await openTrip(again.user))
    expect(reopened.getByRole('checkbox', { name: /polo/ })).toBeInTheDocument()
    await again.user.click(reopened.getByRole('button', { name: 'Editar la maleta' }))
    await again.user.click(reopened.getByRole('button', { name: /Quitar polo de la maleta/ }))
    expect(reopened.queryByRole('checkbox', { name: /polo/ })).not.toBeInTheDocument()
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
