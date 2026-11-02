import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClothingAnalysisSuggestion } from '../ai/clothingAnalyzer'
import { database } from '../db/database'
import type { GarmentCategory } from '../types/domain'
import BatchImport from './BatchImport'
import { clearBatch, getBatch } from './batchImport/batchQueue'

// Each test photo is a File whose name says what the "model" sees: category|subcategory|colour|seconds|confidence.
function suggestion(file: Blob): ClothingAnalysisSuggestion {
  const [category, subcategory, color, , confidence] = (file as File).name.split('|')
  return {
    category: category as GarmentCategory,
    subcategory: subcategory!,
    colors: [color!],
    alternatives: [],
    confidenceByAttribute: { category: Number(confidence ?? 0.95), subcategory: 0.9 },
    unknownAttributes: [],
    modelId: 'vesta/dinov2-small-heads',
    modelVersion: 'heads-test',
    calibrated: true,
    segmentations: [{ classes: [], grid: 16, probabilities: new Float32Array(0) }],
    textByPhoto: [[]],
    analyzedAt: '2026-11-02T12:00:00.000Z'
  }
}

vi.mock('../ai/clothingAnalyzer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ai/clothingAnalyzer')>(),
  analyzeGarmentImage: vi.fn(async (file: Blob) => suggestion(file))
}))
vi.mock('../ai/cutout', () => ({
  cutOutGarments: vi.fn(async () => [{ image: new Blob(['cutout']), width: 10, height: 10, coverage: 0.4, region: { classId: 'garment', patches: [], confidence: 1 } }]),
  cutoutColors: vi.fn(async () => [])
}))
vi.mock('../ai/photoTime', () => ({
  captureTime: vi.fn(async (file: File) => {
    const seconds = file.name.split('|')[3]
    return seconds ? Date.UTC(2026, 10, 2, 12, 0, Number(seconds)) : undefined
  })
}))
vi.mock('../db/imageProcessing', () => ({
  reducePhoto: async (photo: Blob) => photo,
  createThumbnail: async () => ({ thumbnail: new Blob(['thumbnail']), width: 120, height: 180 })
}))

const photo = (name: string) => new File(['photo'], name, { type: 'image/jpeg' })

async function start(files: File[]) {
  const user = userEvent.setup()
  const onDone = vi.fn()
  render(<BatchImport onDone={onDone} />)
  await user.upload(screen.getByLabelText('Seleccionar fotos de varias prendas'), files)
  await waitFor(() => expect(getBatch().photos.length).toBe(files.length))
  await waitFor(() => expect(getBatch().running).toBe(false))
  return { user, onDone }
}

afterEach(async () => {
  clearBatch()
  await database.garments.clear()
})

describe('adding many garments', () => {
  it('starts by explaining the steps, and takes photos dropped on it', async () => {
    const { container } = render(<BatchImport onDone={vi.fn()} />)
    expect(screen.getByText('Elige todas las fotos de una vez')).toBeInTheDocument()
    expect(screen.getByText('Revisa y guarda')).toBeInTheDocument()

    fireEvent.drop(container.querySelector('.batch-import')!, { dataTransfer: { files: [photo('Calzado|Zapatillas|Gris|0'), new File(['x'], 'notas.txt', { type: 'text/plain' })], types: ['Files'] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('1 archivo no se ha añadido')
    await waitFor(() => expect(getBatch().garments).toHaveLength(1))
    await waitFor(() => expect(getBatch().running).toBe(false))
  })

  it('shows only the doubtful garments on request and saves the chosen ones from the dock', async () => {
    const { user, onDone } = await start([
      photo('Parte superior|Camiseta|Blanco|0'),
      photo('Abrigo|Chaqueta|Azul|100|0.4'),
      photo('Calzado|Zapatillas|Gris|200')
    ])
    expect(await screen.findByText('3 prendas listas')).toBeInTheDocument()
    expect(screen.getByText('1 por revisar; el resto parece correcto')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Por revisar (1)' }))
    expect(screen.getAllByLabelText('Tipo de prenda')).toHaveLength(1)
    expect(screen.getByLabelText('Tipo de prenda')).toHaveValue('Chaqueta')
    expect(screen.getByText('Comprueba el tipo')).toBeInTheDocument()

    // Correcting it clears the warning and the count, but the card stays while it is being typed in.
    await user.type(screen.getByLabelText('Tipo de prenda'), ' vaquera')
    expect(screen.getByLabelText('Tipo de prenda')).toHaveValue('Chaqueta vaquera')
    expect(screen.queryByText('Comprueba el tipo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Por revisar (0)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todas (3)' }))
    await user.click(screen.getByRole('button', { name: 'Por revisar (0)' }))
    expect(screen.getByText('Nada dudoso: puedes guardar.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todas (3)' }))
    await user.click(screen.getByRole('checkbox', { name: 'Añadir Zapatillas al armario' }))
    await user.click(screen.getByRole('button', { name: 'Guardar 2 prendas' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(2))
    expect((await database.garments.toArray()).map((garment) => garment.subcategory).sort()).toEqual(['Camiseta', 'Chaqueta vaquera'])
  })

  it('offers the actions of a photo when its thumbnail is touched', async () => {
    const { user } = await start([photo('Parte superior|Camiseta|Blanco|0'), photo('Parte superior|Camiseta|Blanco|8')])
    expect(screen.queryByRole('button', { name: 'Es otra prenda' })).not.toBeInTheDocument()
    const main = getBatch().garments[0]!.photoIds[0]
    await user.click(screen.getByRole('button', { name: 'Otra foto de la prenda' }))
    await user.click(screen.getByRole('button', { name: 'Hacer principal' }))
    expect(getBatch().garments[0]!.photoIds[1]).toBe(main)
    await waitFor(() => expect(getBatch().running).toBe(false))
    await user.click(screen.getByRole('button', { name: 'Otra foto de la prenda' }))
    await user.click(screen.getByRole('button', { name: 'Es otra prenda' }))
    expect(getBatch().garments).toHaveLength(2)
    await waitFor(() => expect(getBatch().running).toBe(false))
  })

  it('can keep the background and fix the colours of a garment', async () => {
    const { user, onDone } = await start([photo('Calzado|Zapatillas|Gris|0')])
    await user.click(await screen.findByRole('button', { name: 'Ver con fondo' }))
    await user.click(screen.getByRole('button', { name: 'Gris' }))
    const palette = screen.getByRole('group', { name: 'Paleta de colores' })
    await user.click(within(palette).getByRole('button', { name: 'Rojo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar 1 prenda' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1))
    const [saved] = await database.garments.toArray()
    expect(saved?.cutout).toBeUndefined()
    expect(saved?.colors).toEqual(['Gris', 'Rojo'])
  })

  it('asks in the dock before discarding the analysis', async () => {
    const { user } = await start([photo('Calzado|Zapatillas|Gris|0')])
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByText('¿Descartar 1 foto?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(getBatch().photos).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(getBatch().photos).toHaveLength(0)
    expect(screen.getByText('Elige todas las fotos de una vez')).toBeInTheDocument()
  })
})
