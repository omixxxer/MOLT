import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Cancel01Icon, DiceIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { outfitName } from '../../outfits/outfitNames'
import type { Garment } from '../../types/domain'
import OutfitCollage from './OutfitCollage'

interface SaveOutfitDialogProps {
  garments: Garment[]
  /** The plan and the weather, which the proposed names come from. */
  context: { occasion: string; temperatureCelsius?: number; weatherConditions?: string[] }
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

/**
 * Saving an outfit: the collage it will have in «Mis outfits», and a name to find it again. One is proposed from its
 * colour, plan and season («Cena en negro»), and «Otro nombre» gives another.
 */
export default function SaveOutfitDialog({ garments, context, onSave, onClose }: SaveOutfitDialogProps) {
  const [variant, setVariant] = useState(0)
  const [name, setName] = useState(() => outfitName(garments, context))
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

  function another() {
    const next = variant + 1
    setVariant(next)
    setName(outfitName(garments, context, next))
    input.current?.focus()
  }

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
        <div className="save-outfit-body">
          <OutfitCollage garments={garments} className="save-outfit-collage" />
          <div className="save-outfit-fields">
            <label className="form-field" htmlFor="save-outfit-name">Nombre</label>
            <div className="save-outfit-name">
              <input id="save-outfit-name" ref={input} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={context.occasion} />
              <button type="button" className="icon-button" onClick={another} aria-label="Otro nombre" title="Otro nombre"><HugeiconsIcon icon={DiceIcon} size={17} /></button>
            </div>
            <p className="picker-note">Lo tendrás en «Mis outfits» con este collage, para ponértelo otro día o cambiarlo.</p>
          </div>
        </div>
        <footer className="save-outfit-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar en Mis outfits'}</button>
        </footer>
      </form>
    </div>
  )
}
