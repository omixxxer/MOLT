import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Garment } from '../../types/domain'
import OutfitBoard from '../OutfitBoard'

/** «Diario: camisa y vaqueros»: the plan and the main pieces, to tell outfits apart in «Mis outfits». */
export function suggestedOutfitName(garments: Garment[], occasion: string) {
  const piece = (role: Garment['role']) => garments.find((garment) => garment.role === role)
  const main = [piece('Una pieza') ?? piece('Top'), piece('Una pieza') ? undefined : piece('Bottom')]
    .filter((garment): garment is Garment => Boolean(garment))
    .map((garment) => (garment.subcategory || garment.name || garment.category).toLocaleLowerCase('es'))
  return main.length ? `${occasion}: ${main.join(' y ')}`.slice(0, 60) : occasion
}

interface SaveOutfitDialogProps {
  garments: Garment[]
  occasion: string
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

/** Saving an outfit: how it looks, a name to find it again (one is proposed), and where it goes. */
export default function SaveOutfitDialog({ garments, occasion, onSave, onClose }: SaveOutfitDialogProps) {
  const [name, setName] = useState(() => suggestedOutfitName(garments, occasion))
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    input.current?.select()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSave(name.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="picker save-outfit" role="dialog" aria-modal="true" aria-labelledby="save-outfit-title" onSubmit={(event) => void submit(event)}>
        <header className="picker-header">
          <h2 id="save-outfit-title">Guardar outfit</h2>
          <button className="close-button" type="button" onClick={onClose} aria-label="Cerrar"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
        </header>
        <div className="save-outfit-preview"><OutfitBoard garments={garments} /></div>
        <label className="form-field">Nombre
          <input ref={input} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={occasion} />
        </label>
        <p className="picker-note">Lo tendrás en «Mis outfits», para ponértelo otro día o cambiarlo.</p>
        <footer className="save-outfit-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar en Mis outfits'}</button>
        </footer>
      </form>
    </div>
  )
}
