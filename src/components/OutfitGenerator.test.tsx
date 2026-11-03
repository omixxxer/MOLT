import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '../db/database'
import type { Garment } from '../types/domain'
import OutfitGenerator from './OutfitGenerator'

function makeGarment(id: string, role: Garment['role'], change: Partial<Garment> = {}): Garment {
  return {
    id,
    name: id,
    category: role === 'Top' ? 'Parte superior' : 'Parte inferior',
    subcategory: '',
    colors: ['Azul'],
    seasons: [],
    styles: [],
    dressLevels: ['Diario'],
    role,
    image: new Blob(['photo'], { type: 'image/png' }),
    thumbnail: new Blob(['thumbnail'], { type: 'image/png' }),
    width: 100,
    height: 100,
    confirmedAttributes: [],
    suggestedAttributes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...change
  }
}

const wardrobe = () => [
  makeGarment('camisa', 'Top'),
  makeGarment('polo', 'Top'),
  makeGarment('vaqueros', 'Bottom'),
  makeGarment('chinos', 'Bottom'),
  makeGarment('zapatillas', 'Calzado')
]

function setup(garments = wardrobe(), extra: Partial<Parameters<typeof OutfitGenerator>[0]> = {}) {
  const onAvailabilityChange = vi.fn().mockResolvedValue(undefined)
  render(<OutfitGenerator garments={garments} onAvailabilityChange={onAvailabilityChange} {...extra} />)
  return { user: userEvent.setup(), onAvailabilityChange }
}

/** The garments on the board, read from the photos of its pieces. */
function onBoard() {
  return within(screen.getByRole('region', { name: 'Outfit' })).queryAllByRole('img').map((image) => image.getAttribute('alt'))
}

async function boardReady() {
  await waitFor(() => expect(onBoard().length).toBeGreaterThan(1))
}

beforeEach(() => localStorage.clear())

afterEach(async () => {
  await database.open()
  await Promise.all([database.outfits.clear(), database.preferences.clear(), database.outfitFeedback.clear()])
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('OutfitGenerator', () => {
  it('asks for the wardrobe first when it is empty', async () => {
    const onAddGarments = vi.fn()
    const { user } = setup([], { onAddGarments })
    await user.click(await screen.findByRole('button', { name: 'Añadir prendas' }))
    expect(onAddGarments).toHaveBeenCalled()
    expect(screen.queryByRole('tab', { name: 'Mis outfits' })).not.toBeInTheDocument()
  })

  it('opens with an outfit already made, with shoes, and says why', async () => {
    setup()
    await boardReady()
    const shown = onBoard()
    expect(shown).toContain('zapatillas')
    expect(shown.some((name) => name === 'camisa' || name === 'polo')).toBe(true)
    expect(shown.some((name) => name === 'vaqueros' || name === 'chinos')).toBe(true)
    expect(screen.getByText(/encaje/i)).toBeInTheDocument()
  })

  it('keeps a fixed piece when asking for another combination', async () => {
    const { user } = setup()
    await boardReady()
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: `Fijar ${top}` }))
    expect(screen.getByRole('button', { name: `Soltar ${top}` })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Otra con lo fijado' }))
    expect(onBoard()).toContain(top)
  })

  it('changes one piece without touching the others', async () => {
    const { user } = setup()
    await boardReady()
    const before = onBoard()
    const top = before.find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: `Cambiar ${top}` }))
    const after = onBoard()
    expect(after).not.toContain(top)
    expect(after.filter((name) => name !== 'camisa' && name !== 'polo')).toEqual(before.filter((name) => name !== top))
  })

  it('chooses a garment by hand, which stays fixed, and sends others to the wash from the picker', async () => {
    const { user, onAvailabilityChange } = setup()
    await boardReady()
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    const other = top === 'camisa' ? 'polo' : 'camisa'
    await user.click(screen.getByRole('button', { name: new RegExp(`^Elegir parte de arriba: ahora, ${top}`) }))
    const picker = screen.getByRole('dialog', { name: 'Elige parte de arriba' })
    await user.click(within(picker).getByRole('button', { name: `Marcar ${other} como en la lavadora` }))
    expect(onAvailabilityChange).toHaveBeenCalledWith(expect.objectContaining({ id: other, availability: 'laundry' }))
    await user.click(within(picker).getByRole('button', { name: other }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onBoard()).toContain(other)
    expect(screen.getByRole('button', { name: `Soltar ${other}` })).toBeInTheDocument()
  })

  it('brings back a garment from the wash in the picker', async () => {
    const garments = [...wardrobe(), makeGarment('lavada', 'Top', { availability: 'laundry' })]
    const { user, onAvailabilityChange } = setup(garments)
    await boardReady()
    expect(onBoard()).not.toContain('lavada')
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: new RegExp(`^Elegir parte de arriba: ahora, ${top}`) }))
    await user.click(screen.getByRole('button', { name: 'Marcar lavada como disponible' }))
    expect(onAvailabilityChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'lavada', availability: 'available' }))
  })

  it('saves and wears the same outfit as a single record, with feedback', async () => {
    const { user } = setup()
    await boardReady()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('button', { name: 'Guardado' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Me lo pongo hoy' }))
    expect(await screen.findByRole('button', { name: 'Puesto hoy' })).toBeDisabled()

    const outfits = await database.outfits.toArray()
    expect(outfits).toHaveLength(1)
    expect(outfits[0]).toEqual(expect.objectContaining({ favorite: true, wornAt: expect.any(String) }))
    expect((await database.outfitFeedback.toArray()).map((event) => event.type).sort()).toEqual(['saved', 'worn'])
  })

  it('does not propose a discarded combination again', async () => {
    const { user } = setup()
    await boardReady()
    const discarded = [...onBoard()].sort().join()
    await user.click(screen.getByRole('button', { name: 'No me convence' }))
    await screen.findByText(/no volveremos a proponer/)
    expect([...onBoard()].sort().join()).not.toBe(discarded)
    expect(await database.outfitFeedback.toArray()).toEqual([expect.objectContaining({ type: 'dislike' })])
  })

  it('starts empty and completes the outfit around what was chosen', async () => {
    const { user } = setup()
    await boardReady()
    await user.click(screen.getByRole('button', { name: 'Empezar de cero' }))
    expect(within(screen.getByRole('region', { name: 'Outfit' })).queryAllByRole('img')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Elegir parte de abajo' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'chinos' }))
    expect(onBoard()).toEqual(['chinos'])
    await user.click(screen.getByRole('button', { name: 'Completar el outfit' }))
    const shown = onBoard()
    expect(shown).toContain('chinos')
    expect(shown.some((name) => name === 'camisa' || name === 'polo')).toBe(true)
  })

  it('starts around the garment it comes from', async () => {
    setup(wardrobe(), { startGarmentId: { id: 'polo', nonce: 1 } })
    await boardReady()
    expect(onBoard()).toContain('polo')
    expect(screen.getByRole('button', { name: 'Soltar polo' })).toBeInTheDocument()
  })

  it('tells what is missing when no outfit can be made', async () => {
    setup([makeGarment('camisa', 'Top')])
    expect(await screen.findByRole('status')).toHaveTextContent(/una de abajo/)
  })

  it('keeps the board while looking at the saved outfits, which can be renamed, opened and deleted', async () => {
    const { user } = setup()
    await boardReady()
    const shown = onBoard()
    await user.click(screen.getByRole('tab', { name: 'Mis outfits' }))
    expect(await screen.findByText('Aún no hay outfits.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Crear' }))
    expect(onBoard()).toEqual(shown)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('button', { name: 'Guardado' })
    await user.click(screen.getByRole('tab', { name: 'Mis outfits' }))
    const name = await screen.findByRole('textbox', { name: 'Nombre del outfit' })
    await user.clear(name)
    await user.type(name, 'Oficina')
    await user.tab()
    await waitFor(async () => expect((await database.outfits.toArray())[0]?.name).toBe('Oficina'))

    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(onBoard().sort()).toEqual([...shown].sort())

    await user.click(screen.getByRole('tab', { name: 'Mis outfits' }))
    await user.click(await screen.findByRole('button', { name: 'Eliminar Oficina' }))
    await user.click(await screen.findByRole('button', { name: 'Eliminar outfit' }))
    await waitFor(async () => expect(await database.outfits.count()).toBe(0))
  })

  it('remembers preferences as they are chosen', async () => {
    const { user } = setup()
    await boardReady()
    await user.selectOptions(screen.getByLabelText('Estilo preferido'), 'Formal')
    await waitFor(async () => expect((await database.preferences.get('current'))?.preferredDressLevel).toBe('Formal'))
  })
})
