import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../../db/database'
import { createOutfitFeedback } from '../../outfits/outfitGenerator'
import { localDay } from '../../stats/wardrobeStats'
import type { Garment, Outfit } from '../../types/domain'
import HomeScreen from '../home/HomeScreen'
import WearHistory from './WearHistory'

function garment(id: string, role: Garment['role'], change: Partial<Garment> = {}): Garment {
  return {
    id, name: id, category: role === 'Top' ? 'Parte superior' : role === 'Bottom' ? 'Parte inferior' : 'Calzado', subcategory: '', colors: ['Azul'], seasons: [], styles: [], dressLevels: ['Diario'], role,
    width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...change
  }
}

const wardrobe = () => [garment('camisa', 'Top', { price: 30 }), garment('vaqueros', 'Bottom'), garment('botas', 'Calzado'), garment('olvidada', 'Top')]
const dayFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

const saved = (wornAt?: string): Outfit => ({
  id: 'guardado', garmentIds: ['camisa', 'vaqueros'], occasion: 'Diario', name: 'Oficina', score: 80, createdAt: '2026-01-02T00:00:00.000Z', favorite: true, wornAt
})

function setup(garments = wardrobe()) {
  const props = { onAddGarments: vi.fn(), onCreateOutfit: vi.fn(), onOpenGarment: vi.fn() }
  render(<WearHistory garments={garments} {...props} />)
  return { user: userEvent.setup(), ...props }
}

// The screen reads each thumbnail from its own store, by garment id.
beforeEach(async () => {
  await database.garmentThumbnails.bulkPut(['camisa', 'vaqueros', 'botas', 'olvidada'].map((garmentId) => ({ garmentId, thumbnail: new Blob(['t'], { type: 'image/png' }) })))
})

afterEach(async () => {
  await database.open()
  await Promise.all([database.outfits.clear(), database.outfitFeedback.clear(), database.preferences.clear(), database.garmentThumbnails.clear()])
  localStorage.clear()
})

describe('WearHistory', () => {
  it('asks for garments first', async () => {
    const { user, onAddGarments } = setup([])
    await user.click(screen.getByRole('button', { name: 'Añadir prendas' }))
    expect(onAddGarments).toHaveBeenCalled()
  })

  it('shows what was worn today and takes it out of the day', async () => {
    await database.outfits.put(saved(new Date().toISOString()))
    await database.outfitFeedback.add(createOutfitFeedback('worn', ['camisa', 'vaqueros'], 'guardado'))
    const { user } = setup()

    const detail = await screen.findByRole('region', { name: 'Día seleccionado' })
    expect(await within(detail).findByRole('img', { name: 'camisa' })).toBeInTheDocument()
    expect(within(detail).getByRole('heading', { name: 'Oficina' })).toBeInTheDocument()
    expect(screen.getByText('1 de ' + new Date().getDate() + ' días apuntados')).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: 'Quitar de este día' }))
    expect(await within(detail).findByText('Aún no has apuntado nada hoy.')).toBeInTheDocument()
    expect(await database.outfitFeedback.count()).toBe(0)
    expect((await database.outfits.get('guardado'))?.wornAt).toBeUndefined()
  })

  it('records a saved outfit on a past day, and does not allow future days', async () => {
    await database.outfits.put(saved())
    const { user } = setup()
    await screen.findByRole('region', { name: 'Calendario' })

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    const previous = new Date()
    previous.setDate(1)
    previous.setMonth(previous.getMonth() - 1)
    previous.setDate(10)
    previous.setHours(12, 0, 0, 0)
    await user.click(screen.getByRole('button', { name: dayFormat.format(previous) }))
    await user.click(screen.getByRole('button', { name: 'Apuntar un outfit guardado' }))
    await user.click(screen.getByRole('button', { name: 'Apuntar Oficina' }))

    await waitFor(async () => expect(await database.outfitFeedback.count()).toBe(1))
    const [event] = await database.outfitFeedback.toArray()
    expect(localDay(new Date(event!.createdAt))).toBe(localDay(previous))
    expect(await screen.findByRole('button', { name: `${dayFormat.format(previous)}: un outfit` })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('offers to create today\'s outfit', async () => {
    const { user, onCreateOutfit } = setup()
    await user.click(await screen.findByRole('button', { name: 'Crear el de hoy' }))
    expect(onCreateOutfit).toHaveBeenCalled()
  })

  it('shows the statistics of the chosen period, and opens a garment', async () => {
    await database.outfitFeedback.bulkAdd([
      createOutfitFeedback('worn', ['camisa', 'vaqueros'], undefined, new Date().toISOString()),
      createOutfitFeedback('worn', ['botas'], undefined, new Date(Date.now() - 100 * 86_400_000).toISOString())
    ])
    const { user, onOpenGarment } = setup()

    await user.click(await screen.findByRole('tab', { name: 'Estadísticas' }))
    expect(screen.getByText('2 de 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lo que más llevas' })).toBeInTheDocument()
    expect(screen.getByText(/30,00\s€ en 1 prenda con precio/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Todo' }))
    expect(screen.getByText('3 de 4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /olvidada/ }))
    expect(onOpenGarment).toHaveBeenCalledWith(expect.objectContaining({ id: 'olvidada' }))
  })
})

describe('HomeScreen', () => {
  function home() {
    const props = { onNavigate: vi.fn(), onOpenGarment: vi.fn() }
    render(<HomeScreen garments={wardrobe()} loading={false} {...props} />)
    return { user: userEvent.setup(), ...props }
  }

  it('proposes an outfit for today, and wearing it shows it as worn and counts it', async () => {
    const { user, onNavigate } = home()
    await user.click(await screen.findByRole('button', { name: 'Me lo pongo hoy' }))
    expect(await screen.findByRole('heading', { name: 'Hoy llevas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Me lo pongo hoy' })).not.toBeInTheDocument()
    expect(await database.outfits.count()).toBe(1)
    expect(await database.outfitFeedback.count()).toBe(1)
    await user.click(screen.getByRole('button', { name: /Ver el historial: 1 día apuntado/ }))
    expect(onNavigate).toHaveBeenCalledWith('history')
  })

  it('guides the first steps: what is missing, then the first outfit, and ticks them off as they are done', async () => {
    const props = { onNavigate: vi.fn(), onOpenGarment: vi.fn() }
    const { rerender } = render(<HomeScreen garments={[garment('camisa', 'Top')]} loading={false} {...props} />)
    const user = userEvent.setup()
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' })
    expect(within(steps).getByText('0 de 3 hechos')).toBeInTheDocument()
    expect(within(steps).getByText(/Tienes 1 prenda\. Falta una parte de abajo/)).toBeInTheDocument()
    await user.click(within(steps).getByRole('button', { name: 'Añadir prendas' }))
    expect(props.onNavigate).toHaveBeenCalledWith('batch')

    rerender(<HomeScreen garments={wardrobe()} loading={false} {...props} />)
    expect(await within(steps).findByText('1 de 3 hechos')).toBeInTheDocument()
    await user.click(within(steps).getByRole('button', { name: 'Crear outfit' }))
    expect(props.onNavigate).toHaveBeenCalledWith('outfits')

    await user.click(screen.getByRole('button', { name: 'Me lo pongo hoy' }))
    expect(await within(steps).findByText('3 de 3 hechos')).toBeInTheDocument()
    await user.click(within(steps).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
  })

  it('hides the first steps when asked', async () => {
    const { user } = home()
    await user.click(await screen.findByRole('button', { name: 'Ocultar' }))
    expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument()
  })

  it('offers the tour while starting out, and not once the first steps are done', async () => {
    const { user } = home()
    await screen.findByRole('button', { name: 'Me lo pongo hoy' })
    expect(screen.getAllByRole('button', { name: /Ver un recorrido \(1 min\)/ }).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Me lo pongo hoy' })[0]!)
    await screen.findByRole('heading', { name: 'Hoy llevas' })
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('button', { name: /Ver un recorrido/ })).not.toBeInTheDocument()
  })
})
