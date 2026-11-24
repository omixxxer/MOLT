import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Garment, GarmentRole } from '../../types/domain'
import OutfitCollage from './OutfitCollage'

function garment(id: string, role: GarmentRole): Garment {
  return {
    id, name: id, category: 'Parte superior', subcategory: '', colors: [], seasons: [], styles: [], dressLevels: ['Diario'], role,
    width: 100, height: 100, confirmedAttributes: [], suggestedAttributes: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const look = [garment('chaqueta', 'Capa'), garment('body', 'Top'), garment('falda', 'Bottom'), garment('botas', 'Calzado'), garment('bolso', 'Accesorio'), garment('gafas', 'Accesorio')]

describe('OutfitCollage', () => {
  it('lays every garment out in a place of its own, the coat behind the top', () => {
    const { container } = render(<OutfitCollage garments={look} />)
    expect(screen.getByRole('img', { name: 'chaqueta, body, falda, botas, bolso, gafas' })).toBeInTheDocument()
    const pieces = [...container.querySelectorAll<HTMLElement>('.outfit-collage-piece')]
    expect(pieces).toHaveLength(6)
    const places = pieces.map((piece) => `${piece.style.left},${piece.style.top}`)
    expect(new Set(places).size).toBe(6)
    expect(Number(pieces[0]!.style.zIndex)).toBeLessThan(Number(pieces[1]!.style.zIndex))
  })

  it('makes each garment a button when it can be changed', async () => {
    const onSelect = vi.fn()
    render(<OutfitCollage garments={look} onSelect={onSelect} label={(item) => `Elegir ${item.name}`} />)
    await userEvent.click(screen.getByRole('button', { name: 'Elegir falda' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'falda' }))
  })
})
