import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { colorSwatch } from '../ai/colors'
import { taxonomy } from '../ml/taxonomy'

const colorOptions = taxonomy.attributes.colors.values.map((value) => value.label)

interface ColorPaletteProps {
  values: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

/** The colours as swatches to tap: quicker than typing a name, and a garment can have several. */
export default function ColorPalette({ values, onChange, disabled }: ColorPaletteProps) {
  return (
    <div className="color-palette" role="group" aria-label="Paleta de colores">
      {colorOptions.map((color) => {
        const chosen = values.includes(color)
        return (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={color}
            aria-pressed={chosen}
            style={{ background: colorSwatch(color) }}
            disabled={disabled}
            onClick={() => onChange(chosen ? values.filter((value) => value !== color) : [...values, color])}
          >
            {chosen && <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2.6} />}
          </button>
        )
      })}
    </div>
  )
}
