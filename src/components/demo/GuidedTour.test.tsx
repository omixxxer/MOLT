import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GuidedTour, { TOUR_STEPS } from './GuidedTour'

function tour() {
  const props = { onNavigate: vi.fn(), onStart: vi.fn(), onClose: vi.fn() }
  render(<GuidedTour {...props} />)
  return { user: userEvent.setup(), ...props }
}

describe('guided tour', () => {
  it('opens the screen of each step, forwards and back, and ends leading to one’s own garments', async () => {
    const { user, onNavigate, onStart } = tour()
    expect(screen.getByRole('dialog', { name: 'Tu armario, con fotos' })).toBeInTheDocument()
    expect(onNavigate).toHaveBeenLastCalledWith('wardrobe')

    await user.click(screen.getByRole('button', { name: /Siguiente/ }))
    expect(screen.getByRole('dialog', { name: 'Outfits con tu ropa' })).toBeInTheDocument()
    expect(onNavigate).toHaveBeenLastCalledWith('outfits')
    await user.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(onNavigate).toHaveBeenLastCalledWith('wardrobe')

    for (let step = 1; step < TOUR_STEPS.length; step += 1) await user.keyboard('{ArrowRight}')
    expect(screen.getByText(`${TOUR_STEPS.length} de ${TOUR_STEPS.length}`)).toBeInTheDocument()
    expect(TOUR_STEPS.map((step) => step.page)).toEqual(expect.arrayContaining(['wardrobe', 'outfits', 'home', 'history', 'packing']))
    await user.click(screen.getByRole('button', { name: 'Añadir mis prendas' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('keeps the focus in the card and gives it back on closing', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const props = { onNavigate: vi.fn(), onStart: vi.fn(), onClose: vi.fn() }
    const { unmount } = render(<GuidedTour {...props} />)
    const user = userEvent.setup()
    const dialog = screen.getByRole('dialog')
    for (let press = 0; press < 5; press += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('can be skipped from the first step, closed at any one, and closed with Escape', async () => {
    const { user, onClose } = tour()
    await user.click(screen.getByRole('button', { name: 'Saltar' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar el recorrido' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
