import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LabelPhotoSlot from './LabelPhotoSlot'

const props = {
  photo: new Blob(['label'], { type: 'image/jpeg' }),
  reading: false,
  read: true,
  findings: [],
  error: '',
  disabled: false,
  onSelect: vi.fn(),
  onRead: vi.fn(),
  onRemove: vi.fn()
}

describe('LabelPhotoSlot', () => {
  it('opens the editor from the pencil on the label photo and changes nothing on Cancelar', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<LabelPhotoSlot {...props} onEdit={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Editar la foto de la etiqueta: recortar o girar' }))
    expect(screen.getByRole('dialog', { name: 'Editar foto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does not offer to edit while the label is being read', () => {
    render(<LabelPhotoSlot {...props} reading onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Editar la foto de la etiqueta: recortar o girar' })).toBeDisabled()
  })
})
