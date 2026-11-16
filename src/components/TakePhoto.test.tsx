import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TakePhoto from './TakePhoto'

describe('TakePhoto', () => {
  it('asks for the rear camera and hands back the photo', async () => {
    const onTake = vi.fn()
    render(<TakePhoto label="Hacer foto" ariaLabel="Hacer una foto" onTake={onTake} />)

    const input = screen.getByLabelText('Hacer una foto')
    expect(input).toHaveAttribute('capture', 'environment')

    const photo = new File(['photo'], 'foto.jpg', { type: 'image/jpeg' })
    await userEvent.upload(input, photo)

    expect(onTake).toHaveBeenCalledOnce()
    expect(onTake.mock.calls[0]?.[0]?.[0]).toBe(photo)
  })
})
