import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LookImport from './LookImport'

// A look in which nothing is found: the model maps the photo, but no garment comes out of it.
vi.mock('../ai/clothingAnalyzer', () => ({ analyzeGarmentImage: vi.fn(async () => ({ segmentations: [{}] })) }))
vi.mock('../ai/cutout', () => ({ cutOutGarments: vi.fn(async () => []), cutoutColors: vi.fn(async () => []) }))
vi.mock('../ai/body', () => ({ readBody: vi.fn(async () => undefined) }))

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

  it('lets the look photo be turned or cropped, to analyse it again, once it has been analysed', async () => {
    const user = userEvent.setup()
    render(<LookImport onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Editar la foto del look: recortar o girar' })).not.toBeInTheDocument()
    await user.upload(screen.getByLabelText('Seleccionar foto de cuerpo entero'), new File(['look'], 'look.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('heading', { name: 'No hemos encontrado prendas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar la foto del look: recortar o girar' }))
    expect(screen.getByRole('dialog', { name: 'Editar foto' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
