import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LookImport from './LookImport'

describe('Desde un look', () => {
  it('explains what it does and how to take the photo before one is chosen', () => {
    render(<LookImport onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Una foto, todo tu look' })).toBeInTheDocument()
    expect(screen.getByLabelText('Seleccionar foto de cuerpo entero')).toHaveAttribute('type', 'file')
    expect(screen.getByText('De pies a cabeza, con los zapatos')).toBeInTheDocument()
    expect(screen.getByText(/no sale de tu dispositivo ni se guarda/)).toBeInTheDocument()
  })

  it('rejects a file that is not a photo, without starting the analysis', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<LookImport onDone={vi.fn()} onCancel={vi.fn()} />)
    await user.upload(screen.getByLabelText('Seleccionar foto de cuerpo entero'), new File(['x'], 'notas.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige una foto JPG, PNG o WebP')
    expect(screen.queryByRole('heading', { name: /Analizando/ })).not.toBeInTheDocument()
  })

  it('cancels from the start', async () => {
    const onCancel = vi.fn()
    render(<LookImport onDone={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
