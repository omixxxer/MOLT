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
  const view = render(<OutfitGenerator garments={garments} onAvailabilityChange={onAvailabilityChange} {...extra} />)
  return { user: userEvent.setup(), onAvailabilityChange, unmount: view.unmount }
}

/** The ideas Molt proposes in the wizard's second step, best first: each a button named «name: garments». */
async function ideas() {
  const list = await screen.findByRole('region', { name: 'Ideas para ti' })
  return within(list).getAllByRole('button').filter((button) => /: /.test(button.getAttribute('aria-label') ?? ''))
}

/** From the ideas, the best one to the studio. */
async function pickIdea(user: ReturnType<typeof userEvent.setup>, index = 0) {
  await user.click((await ideas())[index]!)
}

/** Outfits opens on «Mis outfits»; «Crear outfit», «Sorpréndeme» and the best idea lead to the studio. */
async function studio(garments = wardrobe(), extra: Partial<Parameters<typeof OutfitGenerator>[0]> = {}) {
  const view = setup(garments, extra)
  await view.user.click((await screen.findAllByRole('button', { name: 'Crear outfit' }))[0]!)
  await view.user.click(screen.getByRole('button', { name: /Sorpréndeme/ }))
  await pickIdea(view.user)
  return view
}

/** The garments on the board, read from the photos of its pieces. */
function onBoard() {
  return within(screen.getByRole('region', { name: 'Outfit' })).queryAllByRole('img').map((image) => image.getAttribute('alt'))
}

async function boardReady() {
  await waitFor(() => expect(onBoard().length).toBeGreaterThan(1))
}

beforeEach(() => localStorage.clear())

// The screen reads each thumbnail from its own store, by garment id.
beforeEach(async () => {
  await database.garmentThumbnails.bulkPut(['camisa', 'polo', 'vaqueros', 'chinos', 'zapatillas', 'lavada'].map((garmentId) => ({ garmentId, thumbnail: new Blob(['t'], { type: 'image/png' }) })))
})

afterEach(async () => {
  await database.open()
  await Promise.all([database.outfits.clear(), database.preferences.clear(), database.outfitFeedback.clear(), database.garmentThumbnails.clear()])
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
    await studio()
    await boardReady()
    const shown = onBoard()
    expect(shown).toContain('zapatillas')
    expect(shown.some((name) => name === 'camisa' || name === 'polo')).toBe(true)
    expect(shown.some((name) => name === 'vaqueros' || name === 'chinos')).toBe(true)
    expect(screen.getByText(/encaje/i)).toBeInTheDocument()
  })

  it('keeps a fixed piece when asking for another combination', async () => {
    const { user } = await studio()
    await boardReady()
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: `Fijar ${top}` }))
    expect(screen.getByRole('button', { name: `Soltar ${top}` })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Otra con lo fijado' }))
    expect(onBoard()).toContain(top)
  })

  it('changes one piece without touching the others', async () => {
    const { user } = await studio()
    await boardReady()
    const before = onBoard()
    const top = before.find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: `Cambiar ${top}` }))
    const after = onBoard()
    expect(after).not.toContain(top)
    expect(after.filter((name) => name !== 'camisa' && name !== 'polo')).toEqual(before.filter((name) => name !== top))
  })

  it('chooses a garment by hand, which stays fixed, and sends others to the wash from the picker', async () => {
    const { user, onAvailabilityChange } = await studio()
    await boardReady()
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    const other = top === 'camisa' ? 'polo' : 'camisa'
    await user.click(screen.getByRole('button', { name: new RegExp(`^Elegir parte de arriba: ahora, ${top}`) }))
    const picker = screen.getByRole('dialog', { name: 'Elige parte de arriba' })
    await user.click(within(picker).getByRole('button', { name: `Marcar ${other} como en la lavadora` }))
    expect(onAvailabilityChange).toHaveBeenCalledWith(expect.objectContaining({ id: other, availability: 'laundry' }))
    await user.click(within(picker).getByRole('button', { name: other }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The garment's thumbnail is read from the database when it reaches the board.
    await waitFor(() => expect(onBoard()).toContain(other))
    expect(screen.getByRole('button', { name: `Soltar ${other}` })).toBeInTheDocument()
  })

  it('brings back a garment from the wash in the picker', async () => {
    const garments = [...wardrobe(), makeGarment('lavada', 'Top', { availability: 'laundry' })]
    const { user, onAvailabilityChange } = await studio(garments)
    await boardReady()
    expect(onBoard()).not.toContain('lavada')
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: new RegExp(`^Elegir parte de arriba: ahora, ${top}`) }))
    await user.click(screen.getByRole('button', { name: 'Marcar lavada como disponible' }))
    expect(onAvailabilityChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'lavada', availability: 'available' }))
  })

  it('saves and wears the same outfit as a single record, with feedback', async () => {
    const { user } = await studio()
    await boardReady()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    // Saving shows the outfit, with a name already proposed.
    const dialog = within(screen.getByRole('dialog', { name: 'Guardar outfit' }))
    // An original name, from the colour, the plan and the season, never the garments' names; «Otro nombre» changes it.
    const nameField = dialog.getByRole('textbox', { name: 'Nombre' }) as HTMLInputElement
    const proposed = nameField.value
    expect(proposed).toBeTruthy()
    expect(proposed).not.toMatch(/camisa|polo|vaqueros|chinos|zapatillas/)
    await user.click(dialog.getByRole('button', { name: 'Otro nombre' }))
    expect(nameField.value).not.toBe(proposed)
    await user.click(dialog.getByRole('button', { name: 'Guardar en Mis outfits' }))
    expect(await screen.findByRole('button', { name: 'Guardado' })).toBeDisabled()
    expect(screen.getByText(/está en Mis outfits/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Me lo pongo hoy' }))
    expect(await screen.findByRole('button', { name: 'Puesto hoy' })).toBeDisabled()

    const outfits = await database.outfits.toArray()
    expect(outfits).toHaveLength(1)
    expect(outfits[0]).toEqual(expect.objectContaining({ favorite: true, wornAt: expect.any(String) }))
    expect((await database.outfitFeedback.toArray()).map((event) => event.type).sort()).toEqual(['saved', 'worn'])
  })

  it('does not propose a discarded combination again', async () => {
    const { user } = await studio()
    await boardReady()
    const discarded = [...onBoard()].sort().join()
    await user.click(screen.getByRole('button', { name: 'No me convence' }))
    await screen.findByText(/no volveremos a proponer/)
    expect([...onBoard()].sort().join()).not.toBe(discarded)
    expect(await database.outfitFeedback.toArray()).toEqual([expect.objectContaining({ type: 'dislike' })])
  })

  it('starts empty and completes the outfit around what was chosen', async () => {
    const { user } = await studio()
    await boardReady()
    await user.click(screen.getByRole('button', { name: 'Empezar de cero' }))
    expect(within(screen.getByRole('region', { name: 'Outfit' })).queryAllByRole('img')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Elegir parte de abajo' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'chinos' }))
    // Each thumbnail is read from the database when its piece appears.
    await waitFor(() => expect(onBoard()).toEqual(['chinos']))
    await user.click(screen.getByRole('button', { name: 'Completar el outfit' }))
    await waitFor(() => expect(onBoard().some((name) => name === 'camisa' || name === 'polo')).toBe(true))
    expect(onBoard()).toContain('chinos')
  })

  it('starts around the garment it comes from: its ideas all have it, and it stays fixed', async () => {
    const { user } = setup(wardrobe(), { startGarmentId: { id: 'polo', nonce: 1 } })
    const found = await ideas()
    expect(found.length).toBeGreaterThan(0)
    for (const idea of found) expect(idea.getAttribute('aria-label')).toMatch(/polo/)
    await pickIdea(user)
    await boardReady()
    expect(onBoard()).toContain('polo')
    expect(screen.getByRole('button', { name: 'Soltar polo' })).toBeInTheDocument()
  })

  it('tells what is missing when no outfit can be made', async () => {
    const { user } = setup([makeGarment('camisa', 'Top')])
    await user.click((await screen.findAllByRole('button', { name: 'Crear outfit' }))[0]!)
    await user.click(screen.getByRole('button', { name: /Sorpréndeme/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(/una de abajo/)
  })

  it('creates in three steps: how to begin, the ideas, and the studio with the one chosen', async () => {
    const { user } = setup()
    await user.click((await screen.findAllByRole('button', { name: 'Crear outfit' }))[0]!)
    expect(screen.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Outfit' })).not.toBeInTheDocument()

    // By style: the plan chosen is the studio's.
    await user.click(screen.getByRole('button', { name: /Por estilo/ }))
    await user.click(within(screen.getByRole('group', { name: 'Plan' })).getByRole('button', { name: 'Arreglado' }))
    await user.click(screen.getByRole('button', { name: 'Ver ideas' }))
    expect(screen.getByText(/^Arreglado\./)).toBeInTheDocument()
    const found = await ideas()
    expect(found.length).toBeGreaterThan(1)
    const [name, garments] = found[1]!.getAttribute('aria-label')!.split(': ')
    await user.click(found[1]!)
    await boardReady()
    expect([...onBoard()].sort().join(', ')).toBe(garments!.split(', ').sort().join(', '))
    expect(screen.getByRole('button', { name: 'Arreglado', pressed: true })).toBeInTheDocument()
    // The idea's name is the one proposed on saving.
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(within(screen.getByRole('dialog', { name: 'Guardar outfit' })).getByRole('textbox', { name: 'Nombre' })).toHaveValue(name)
    await user.keyboard('{Escape}')

    // Back to the first step, from the steps above.
    await user.click(within(screen.getByRole('list', { name: 'Pasos' })).getByRole('button', { name: /Empezar/ }))
    await user.click(screen.getByRole('button', { name: /Desde una prenda/ }))
    await user.click(screen.getByRole('button', { name: 'Empezar con chinos' }))
    for (const idea of await ideas()) expect(idea.getAttribute('aria-label')).toMatch(/chinos/)
    expect(screen.getByText(/^Con chinos/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cambiar cómo empezar' }))
    await user.click(screen.getByRole('button', { name: /Desde cero/ }))
    expect(screen.getByRole('button', { name: 'Elegir parte de abajo' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Outfit' })).queryAllByRole('img')).toHaveLength(0)
  })

  it('shows more ideas on asking, none of them repeated', async () => {
    const { user } = setup()
    await user.click((await screen.findAllByRole('button', { name: 'Crear outfit' }))[0]!)
    await user.click(screen.getByRole('button', { name: /Sorpréndeme/ }))
    const before = (await ideas()).map((idea) => idea.getAttribute('aria-label')!.split(': ')[1])
    await user.click(screen.getByRole('button', { name: 'Ver más ideas' }))
    const after = (await ideas()).map((idea) => idea.getAttribute('aria-label')!.split(': ')[1])
    expect(after.length).toBeGreaterThanOrEqual(before.length)
    expect(new Set(after.map((garments) => garments!.split(', ').sort().join())).size).toBe(after.length)
    const names = (await ideas()).map((idea) => idea.getAttribute('aria-label')!.split(': ')[0])
    expect(new Set(names).size).toBe(names.length)
  })

  it('opens on Mis outfits, with a button to create one', async () => {
    const { user } = setup()
    expect(await screen.findByText('Aún no hay outfits.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Mis outfits/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Outfit' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Crear outfit' })[0]!)
    expect(screen.getByRole('heading', { name: /Crear outfit/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeInTheDocument()
  })

  it('saves an outfit, which can then be renamed, opened and deleted in Mis outfits', async () => {
    const { user } = await studio()
    await boardReady()
    const shown = onBoard()
    await user.click(screen.getByRole('button', { name: 'Mis outfits' }))
    expect(await screen.findByText('Aún no hay outfits.')).toBeInTheDocument()
    // «Crear outfit» starts again; the same plan gives the same best idea.
    await user.click(screen.getAllByRole('button', { name: 'Crear outfit' })[0]!)
    await user.click(screen.getByRole('button', { name: /Sorpréndeme/ }))
    await pickIdea(user)
    await boardReady()
    expect([...onBoard()].sort()).toEqual([...shown].sort())

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    const name = within(screen.getByRole('dialog', { name: 'Guardar outfit' })).getByRole('textbox', { name: 'Nombre' })
    await user.clear(name)
    await user.type(name, 'Oficina{Enter}')
    await screen.findByRole('button', { name: 'Guardado' })
    await user.click(screen.getByRole('button', { name: 'Ver Mis outfits' }))
    const card = (await screen.findByRole('textbox', { name: 'Nombre del outfit' })).closest('article')!
    expect(within(card).getByText('Idea de Molt')).toBeInTheDocument()
    const title = within(card).getByRole('textbox', { name: 'Nombre del outfit' })
    expect(title).toHaveValue('Oficina')
    await user.clear(title)
    // Enter confirms the name, without a line break in it (the field wraps a long name onto more lines).
    await user.type(title, 'Reunión{Enter}')
    expect(title).not.toHaveFocus()
    await waitFor(async () => expect((await database.outfits.toArray())[0]?.name).toBe('Reunión'))
    expect(title).toHaveValue('Reunión')

    // In front only «Me lo pongo hoy»; turned, the card shows its garments, with «Cambiar» and «Eliminar».
    expect(within(card).queryByRole('button', { name: 'Cambiar Reunión' })).not.toBeInTheDocument()
    const flip = await screen.findByRole('button', { name: 'Reunión: dar la vuelta para ver sus prendas' })
    expect(flip).toHaveAttribute('aria-pressed', 'false')
    await user.click(flip)
    expect(flip).toHaveAttribute('aria-pressed', 'true')
    for (const garment of shown) expect(within(flip).getByText(garment!)).toBeInTheDocument()
    await user.click(within(flip).getByRole('button', { name: 'Cambiar Reunión' }))
    await waitFor(() => expect(onBoard().sort()).toEqual([...shown].sort()))

    await user.click(screen.getByRole('button', { name: 'Mis outfits' }))
    await user.click(await screen.findByRole('button', { name: 'Reunión: dar la vuelta para ver sus prendas' }))
    await user.click(await screen.findByRole('button', { name: 'Eliminar Reunión' }))
    await user.click(await screen.findByRole('button', { name: 'Eliminar outfit' }))
    await waitFor(async () => expect(await database.outfits.count()).toBe(0))
  })

  it('changes a saved outfit in place, and «Crear outfit» then starts a new one', async () => {
    const { user } = await studio()
    await boardReady()
    const proposal = [...onBoard()].sort()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Guardar outfit' })).getByRole('button', { name: 'Guardar en Mis outfits' }))
    await screen.findByRole('button', { name: 'Guardado' })
    const [stored] = await database.outfits.toArray()

    // «Cambiar» opens it, says so, and saving changes that same outfit.
    await user.click(screen.getByRole('button', { name: 'Ver Mis outfits' }))
    await user.click(await screen.findByRole('button', { name: /dar la vuelta para ver sus prendas/ }))
    await user.click(await screen.findByRole('button', { name: `Cambiar ${stored!.name}` }))
    expect(screen.getByRole('heading', { name: /Cambiar outfit/ })).toBeInTheDocument()
    expect(screen.getByText(/Cambiando/)).toHaveTextContent(stored!.name!)
    expect(screen.getByRole('button', { name: 'Guardado' })).toBeDisabled()
    await boardReady()
    const top = onBoard().find((name) => name === 'camisa' || name === 'polo')!
    await user.click(screen.getByRole('button', { name: `Cambiar ${top}` }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Cambios guardados/)).toBeInTheDocument()
    const outfits = await database.outfits.toArray()
    expect(outfits).toHaveLength(1)
    expect(outfits[0]).toEqual(expect.objectContaining({ id: stored!.id, name: stored!.name }))
    expect(outfits[0]!.garmentIds).not.toContain(top)

    // Back in «Mis outfits», «Crear outfit» is a new outfit: today's proposal, not the one just changed.
    await user.click(screen.getByRole('button', { name: 'Mis outfits' }))
    await user.click(screen.getAllByRole('button', { name: 'Crear outfit' })[0]!)
    expect(screen.getByRole('heading', { name: /Crear outfit/ })).toBeInTheDocument()
    expect(screen.queryByText(/Cambiando/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sorpréndeme/ }))
    await pickIdea(user)
    await boardReady()
    expect([...onBoard()].sort()).toEqual(proposal)
    // The saved outfit now has other garments, so this proposal is a new one to save.
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('does not propose again, as a new outfit, one already in Mis outfits', async () => {
    const first = await studio()
    await boardReady()
    const saved = [...onBoard()].sort()
    await first.user.click(screen.getByRole('button', { name: 'Guardar' }))
    await first.user.click(within(screen.getByRole('dialog', { name: 'Guardar outfit' })).getByRole('button', { name: 'Guardar en Mis outfits' }))
    await screen.findByRole('button', { name: 'Guardado' })
    first.unmount()

    await studio()
    await boardReady()
    expect([...onBoard()].sort()).not.toEqual(saved)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('still proposes a saved outfit when it is the only one that can be made', async () => {
    const only = [makeGarment('camisa', 'Top'), makeGarment('vaqueros', 'Bottom')]
    await database.outfits.put({ id: 'o', garmentIds: ['camisa', 'vaqueros'], occasion: 'Diario', kind: 'generated', score: 80, createdAt: '2026-11-01T00:00:00.000Z', favorite: true })
    await studio(only)
    await boardReady()
    expect([...onBoard()].sort()).toEqual(['camisa', 'vaqueros'])
    expect(screen.getByRole('button', { name: 'Guardado' })).toBeDisabled()
  })

  it('closes the save dialog without saving', async () => {
    const { user } = await studio()
    await boardReady()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    expect(await database.outfits.count()).toBe(0)
  })

  it('remembers preferences as they are chosen', async () => {
    const { user } = await studio()
    await boardReady()
    await user.selectOptions(screen.getByLabelText('Estilo preferido'), 'Formal')
    await waitFor(async () => expect((await database.preferences.get('current'))?.preferredDressLevel).toBe('Formal'))
  })
})
