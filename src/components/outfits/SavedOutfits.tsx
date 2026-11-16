import { useState } from 'react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { database } from '../../db/database'
import { createOutfitFeedback } from '../../outfits/outfitGenerator'
import type { Garment, Outfit } from '../../types/domain'
import { askConfirm } from '../confirmDialog'
import OutfitBoard from '../OutfitBoard'
import type { OutfitData } from './outfitData'

type Filter = 'all' | 'favorites' | 'worn'

const FILTERS: Array<[Filter, string]> = [['all', 'Todos'], ['favorites', 'Guardados'], ['worn', 'Usados']]

function sameDay(date: Date, other: Date) {
  return date.toDateString() === other.toDateString()
}

/** «Hoy», «ayer», «hace 3 días»… */
function daysAgo(iso: string) {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000)
  if (sameDay(new Date(iso), new Date())) return 'hoy'
  if (days <= 1) return 'ayer'
  return days < 30 ? `hace ${days} días` : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso))
}

interface SavedOutfitsProps {
  garments: Garment[]
  data: OutfitData
  onChanged: () => Promise<void>
  /** Opens the outfit in the studio, to change it. */
  onOpen: (outfit: Outfit) => void
}

/** The outfits the user keeps or has worn: to wear again, change, rename or delete. */
export default function SavedOutfits({ garments, data, onChanged, onOpen }: SavedOutfitsProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState('')
  const kept = data.outfits.filter((outfit) => outfit.favorite || outfit.kind === 'manual' || outfit.wornAt)
  const shown = kept
    .filter((outfit) => filter === 'all' || (filter === 'worn' ? outfit.wornAt : outfit.favorite || outfit.kind === 'manual'))
    .sort((a, b) => (b.wornAt ?? b.createdAt).localeCompare(a.wornAt ?? a.createdAt))
  const wearings = (outfit: Outfit) => data.feedback.filter((event) => event.type === 'worn' && event.outfitId === outfit.id).length || (outfit.wornAt ? 1 : 0)

  async function run(action: () => Promise<unknown>, message: string) {
    setError('')
    try {
      await action()
      await onChanged()
    } catch {
      setError(message)
    }
  }

  function wear(outfit: Outfit) {
    const at = new Date().toISOString()
    return run(() => database.transaction('rw', database.outfits, database.outfitFeedback, async () => {
      await database.outfits.put({ ...outfit, wornAt: at })
      await database.outfitFeedback.add(createOutfitFeedback('worn', outfit.garmentIds, outfit.id, at))
    }), 'No se pudo guardar esta acción en el historial local.')
  }

  function rename(outfit: Outfit, name: string) {
    const trimmed = name.trim()
    if (trimmed === (outfit.name ?? '')) return
    void run(() => database.outfits.put({ ...outfit, name: trimmed || undefined }), 'No se pudo cambiar el nombre.')
  }

  async function remove(outfit: Outfit) {
    if (!await askConfirm('¿Eliminar este outfit? Las prendas siguen en tu armario.', 'Eliminar outfit')) return
    void run(() => database.outfits.delete(outfit.id), 'No se pudo eliminar el outfit.')
  }

  if (!kept.length) {
    return (
      <section className="empty-state">
        <div className="empty-mark" aria-hidden="true">♡</div>
        <h2>Aún no hay outfits.</h2>
        <p>Guarda los que te gusten o marca «Me lo pongo hoy», y aquí tendrás tu historial.</p>
      </section>
    )
  }

  return (
    <section className="saved-outfits" aria-label="Mis outfits">
      <div className="choice-row" role="group" aria-label="Qué outfits mostrar">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" className={`choice-chip ${filter === value ? 'selected' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="saved-grid">
        {shown.map((outfit) => {
          const outfitGarments = outfit.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment))
          const count = wearings(outfit)
          const title = outfit.name || outfit.occasion
          return (
            <article className="outfit-card" key={outfit.id}>
              <input className="saved-name" aria-label="Nombre del outfit" defaultValue={title} key={title} onBlur={(event) => rename(outfit, event.target.value === outfit.occasion ? '' : event.target.value)} maxLength={60} />
              {outfitGarments.length > 0 && <OutfitBoard garments={outfitGarments} />}
              {outfitGarments.length < outfit.garmentIds.length && <p className="outfit-explanation">Algunas prendas de este outfit ya no están en el armario.</p>}
              <p className="outfit-explanation">
                {outfit.wornAt ? `Puesto ${daysAgo(outfit.wornAt)}${count > 1 ? ` · ${count} veces` : ''}` : `Guardado ${daysAgo(outfit.createdAt)}`}
              </p>
              <div className="outfit-actions">
                <button type="button" className="button button-dark" onClick={() => void wear(outfit)} disabled={Boolean(outfit.wornAt) && sameDay(new Date(outfit.wornAt!), new Date())}>
                  {outfit.wornAt && sameDay(new Date(outfit.wornAt), new Date()) ? 'Puesto hoy' : 'Me lo pongo hoy'}
                </button>
                <button type="button" className="button button-outline" onClick={() => onOpen(outfit)}>Cambiar</button>
                <button type="button" className="icon-button outfit-remove" onClick={() => void remove(outfit)} aria-label={`Eliminar ${title}`} title="Eliminar"><HugeiconsIcon icon={Delete02Icon} size={16} /></button>
              </div>
            </article>
          )
        })}
      </div>
      {!shown.length && <p className="batch-none">Nada en este filtro todavía.</p>}
    </section>
  )
}
