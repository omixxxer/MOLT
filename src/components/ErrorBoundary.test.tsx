import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Broken(): never {
  throw new Error('pantalla rota')
}

describe('ErrorBoundary', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined) })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows its children when nothing fails', () => {
    render(<ErrorBoundary><p>Armario</p></ErrorBoundary>)
    expect(screen.getByText('Armario')).toBeInTheDocument()
  })

  it('replaces a failed screen with a way out and a report to copy', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ErrorBoundary><Broken /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Tus prendas siguen guardadas')
    expect(screen.getByRole('button', { name: 'Volver a cargar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copiar informe del error' }))
    expect(writeText.mock.calls[0]?.[0]).toContain('pantalla rota')
    expect(await screen.findByRole('status')).toHaveTextContent('Informe copiado')
  })
})
