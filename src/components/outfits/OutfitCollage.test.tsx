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

  it('gives every accessory a place of its own however many there are, the later ones over the earlier', () => {
    const jewellery = ['pendientes-1', 'pendientes-2', 'pendientes-3', 'reloj', 'pulsera', 'collar', 'anillo'].map((id) => garment(id, 'Joya'))
    const { container } = render(<OutfitCollage garments={[...look, ...jewellery]} />)
    const pieces = [...container.querySelectorAll<HTMLElement>('.outfit-collage-piece')]
    expect(pieces).toHaveLength(13)
    expect(new Set(pieces.map((piece) => `${piece.style.left},${piece.style.top}`)).size).toBe(13)
    for (const piece of pieces) {
      expect(parseFloat(piece.style.left) + parseFloat(piece.style.width)).toBeLessThanOrEqual(100)
      expect(parseFloat(piece.style.top) + parseFloat(piece.style.height)).toBeLessThanOrEqual(100)
    }
  })

  it('puts the T-shirt under the top behind it, showing below its hem', () => {
    const tee = { ...garment('camiseta', 'Top'), subcategory: 'Camiseta' }
    const jumper = { ...garment('jersey', 'Top'), subcategory: 'Jersey' }
    const { container } = render(<OutfitCollage garments={[tee, jumper, garment('falda', 'Bottom')]} />)
    const [under, over] = [...container.querySelectorAll<HTMLElement>('.outfit-collage-piece')]
    expect(Number(under!.style.zIndex)).toBeLessThan(Number(over!.style.zIndex))
    expect(parseFloat(under!.style.left)).toBeGreaterThan(parseFloat(over!.style.left))
    expect(parseFloat(under!.style.top)).toBeGreaterThan(parseFloat(over!.style.top))
  })

  it('makes each garment a button when it can be changed', async () => {
    const onSelect = vi.fn()
    render(<OutfitCollage garments={look} onSelect={onSelect} label={(item) => `Elegir ${item.name}`} />)
    await userEvent.click(screen.getByRole('button', { name: 'Elegir falda' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'falda' }))
  })
})
