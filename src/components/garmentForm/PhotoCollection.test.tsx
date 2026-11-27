import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PhotoCollection from './PhotoCollection'

const props = {
  max: 4,
  disabled: false,
  onAdd: vi.fn(),
  cuttingOut: false,
  canToggleCutout: false,
  onToggleCutout: vi.fn(),
  onIntakeError: vi.fn()
}

describe('PhotoCollection', () => {
  it('opens the editor for the photo in view and leaves the photos as they were on Cancelar or Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PhotoCollection {...props} photos={[new Blob(['main'], { type: 'image/jpeg' }), new Blob(['back'], { type: 'image/jpeg' })]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Editar foto 1: recortar o girar' }))
    expect(screen.getByRole('dialog', { name: 'Editar foto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar foto 2' }))
    await user.click(screen.getByRole('button', { name: 'Editar foto 2: recortar o girar' }))
    expect(screen.getByRole('dialog', { name: 'Editar foto' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
