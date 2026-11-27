import { useState } from 'react'
import { Tick02Icon, TShirtIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { database } from '../../db/database'
import { createOutfitFeedback } from '../../outfits/outfitGenerator'
import type { Garment, Outfit } from '../../types/domain'
import { askConfirm } from '../confirmDialog'
import { FlipCard } from './reactBitsOutfits'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import OutfitCollage from './OutfitCollage'
import type { OutfitData } from './outfitData'

type Filter = 'all' | 'favorites' | 'worn'

/** The card turns on any press: a button on its back keeps its own pointer and keys, so it acts instead. */
const keepPress = {
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation()
}

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
  /** To the studio, to make a new outfit. */
  onCreate: () => void
}

/** The outfits the user keeps or has worn: to wear again, change, rename or delete. */
export default function SavedOutfits({ garments, data, onChanged, onOpen, onCreate }: SavedOutfitsProps) {
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
        <p>Crea uno: Molt te propone el de hoy según la ocasión y el tiempo, y lo cambias pieza a pieza. Los que guardes o te pongas aparecerán aquí.</p>
        <button className="button button-dark" type="button" onClick={onCreate}>Crear outfit</button>
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
          const missing = outfit.garmentIds.length - outfitGarments.length
          const wornToday = Boolean(outfit.wornAt) && sameDay(new Date(outfit.wornAt!), new Date())
          return (
            <article className="saved-card" key={outfit.id}>
              {/* React Bits' FlipCard is the card itself: the collage in front; touched (or dragged sideways) it turns to
                  show its garments, with «Cambiar» and «Eliminar». Under it, the name, when it was worn and what to do today. */}
              <FlipCard
                className="saved-flip"
                ariaLabel={`${title}: dar la vuelta para ver sus prendas`}
                background="#FFFFFF"
                color="#2D2838"
                radius={16}
                tiltMax={7}
                glareOpacity={0.14}
                hoverScale={1.015}
                shadowColor="#2D2838"
                shadowOpacity={0.18}
                front={(
                  <div className="saved-art">
                    {outfitGarments.length > 0 && <OutfitCollage garments={outfitGarments} />}
                    <span className="saved-tags">
                      <span className="saved-origin" data-kind={outfit.kind}>{outfit.kind === 'manual' ? 'Creado por ti' : 'Idea de Molt'}</span>
                      {missing > 0 && <span className="saved-missing" title="Algunas prendas de este outfit ya no están en el armario">{missing === 1 ? 'Falta 1 prenda' : `Faltan ${missing} prendas`}</span>}
                    </span>
                  </div>
                )}
                back={(
                  <div className="saved-back">
                    <p className="saved-back-title">{title}</p>
                    <ul className="saved-back-list">
                      {outfitGarments.map((garment) => (
                        <li key={garment.id}>
                          <span className="garment-tile"><GarmentThumbnail garment={garment} alt="" /></span>
                          <span>{garmentLabel(garment)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="saved-back-actions">
                      <button type="button" className="button button-dark" {...keepPress} onClick={(event) => { event.stopPropagation(); onOpen(outfit) }} aria-label={`Cambiar ${title}`}>
                        Cambiar
                      </button>
                      <button type="button" className="saved-remove" {...keepPress} onClick={(event) => { event.stopPropagation(); void remove(outfit) }} aria-label={`Eliminar ${title}`}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              />
              {/* Name and when, with «Me lo pongo hoy» as a small button beside them. */}
              <div className="saved-foot">
                <div className="saved-foot-text">
                  <input className="saved-name" aria-label="Nombre del outfit" defaultValue={title} key={title} onBlur={(event) => rename(outfit, event.target.value === outfit.occasion ? '' : event.target.value)} maxLength={60} />
                  <p className="saved-meta">
                    {outfit.occasion} · {outfit.wornAt ? `puesto ${daysAgo(outfit.wornAt)}${count > 1 ? ` · ${count} veces` : ''}` : `guardado ${daysAgo(outfit.createdAt)}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="saved-wear"
                  onClick={() => void wear(outfit)}
                  disabled={wornToday}
                  aria-label={wornToday ? 'Puesto hoy' : 'Me lo pongo hoy'}
                  title={wornToday ? 'Puesto hoy' : 'Me lo pongo hoy'}
                >
                  <HugeiconsIcon icon={wornToday ? Tick02Icon : TShirtIcon} size={16} />
                  <span>Hoy</span>
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {!shown.length && <p className="batch-none">Nada en este filtro todavía.</p>}
    </section>
  )
}
