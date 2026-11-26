import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SuggestInput } from './fields'

const options = ['Camiseta', 'Camisa', 'Jersey', 'Sudadera']

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <SuggestInput id="sub" value={value} onChange={setValue} options={options} />
}

const shown = () => screen.queryAllByRole('option').map((option) => option.textContent)

describe('SuggestInput', () => {
  it('shows every option when it opens on a value already chosen', async () => {
    render(<Field initial="Camiseta" />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(shown()).toEqual(options)
  })

  it('narrows the list as one types and lets another option be chosen', async () => {
    render(<Field initial="Camiseta" />)
    const input = screen.getByRole('combobox')
    await userEvent.clear(input)
    await userEvent.type(input, 'cami')
    expect(shown()).toEqual(['Camiseta', 'Camisa'])
    await userEvent.click(screen.getByRole('option', { name: 'Camisa' }))
    expect(input).toHaveValue('Camisa')
    expect(shown()).toEqual([])
  })

  it('picks with the arrows and Enter, starting from the current value', async () => {
    render(<Field initial="Camisa" />)
    const input = screen.getByRole('combobox')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(input).toHaveValue('Jersey')
  })

  it('keeps free text that is not in the list', async () => {
    render(<Field initial="" />)
    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'Kimono')
    expect(shown()).toEqual([])
    expect(input).toHaveValue('Kimono')
  })
})
