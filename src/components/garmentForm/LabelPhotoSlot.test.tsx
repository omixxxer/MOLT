import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LabelPhotoSlot from './LabelPhotoSlot'

const label = (text: string) => new Blob([text], { type: 'image/jpeg' })
const props = {
  photos: [label('front')],
  max: 3,
  reading: false,
  read: true,
  findings: [],
  error: '',
  disabled: false,
  onSelect: vi.fn(),
  onRead: vi.fn(),
  onEdit: vi.fn(),
  onRemove: vi.fn()
}

describe('LabelPhotoSlot', () => {
  it('opens the editor from the pencil on a label photo and changes nothing on Cancelar', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<LabelPhotoSlot {...props} onEdit={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Editar la foto 1 de la etiqueta: recortar o girar' }))
    expect(screen.getByRole('dialog', { name: 'Editar foto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('does not offer to edit while the label is being read', () => {
    render(<LabelPhotoSlot {...props} reading />)
    expect(screen.getByRole('button', { name: 'Editar la foto 1 de la etiqueta: recortar o girar' })).toBeDisabled()
  })

  it('chooses several label photos from the gallery at once', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<LabelPhotoSlot {...props} photos={[]} read={false} onSelect={onSelect} />)
    const front = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    const back = new File(['back'], 'back.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Seleccionar fotos de la etiqueta'), [front, back])
    expect(onSelect).toHaveBeenCalledWith([front, back])
  })

  it('shows each label photo with its own remove, and offers another only while there is room', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const { rerender } = render(<LabelPhotoSlot {...props} photos={[label('front'), label('back!')]} onRemove={onRemove} />)
    expect(screen.getByLabelText('Añadir otra foto de la etiqueta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quitar la foto 2 de la etiqueta' }))
    expect(onRemove).toHaveBeenCalledWith(1)
    rerender(<LabelPhotoSlot {...props} photos={[label('a'), label('bb'), label('ccc')]} />)
    expect(screen.queryByLabelText('Añadir otra foto de la etiqueta')).not.toBeInTheDocument()
  })
})
