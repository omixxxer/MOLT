import { useState, type FormEvent } from 'react'
import { Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PackingGroup } from '../../trips/packingPlan'
import type { Garment, Trip } from '../../types/domain'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import SuitcasePicker from './SuitcasePicker'

interface PackingListProps {
  trip: Trip
  groups: PackingGroup[]
  /** The whole wardrobe, to add garments to the suitcase by hand. */
  garments: Garment[]
  /** «Editar la maleta», opened from the pencil in the trip's header. */
  editing: boolean
  onChange: (change: Partial<Trip>) => void
}

function wornText(days: number) {
  if (days === 0) return 'Por si acaso'
  return days === 1 ? '1 día' : `${days} días`
}

/**
 * The list to tick while packing: each garment once, and the rest of the suitcase, with the trip's notes, which can be
 * written at any time. While editing (the pencil in the header), garments are added by hand («por si acaso») and the
 * things that are not clothes added or taken out.
 */
export default function PackingList({ trip, groups, garments, editing, onChange }: PackingListProps) {
  const [picking, setPicking] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [notes, setNotes] = useState(trip.notes ?? '')
  const items = groups.flatMap((group) => group.items)
  const total = items.length + trip.extras.length
  const packed = items.filter(({ garment }) => trip.packedIds.includes(garment.id)).length + trip.extras.filter((extra) => extra.packed).length
  const added = trip.extraGarmentIds ?? []

  function addExtra(event: FormEvent) {
    event.preventDefault()
    const label = newItem.trim()
    if (!label) return
    onChange({ extras: [...trip.extras, { id: crypto.randomUUID(), label, packed: false }] })
    setNewItem('')
  }

  function saveNotes() {
    if (notes.trim() === (trip.notes ?? '').trim()) return
    onChange({ notes: notes.trim() || undefined })
  }

  function toggleGarment(garment: Garment) {
    const next = added.includes(garment.id) ? added.filter((id) => id !== garment.id) : [...added, garment.id]
    onChange({ extraGarmentIds: next, ...(next.includes(garment.id) ? {} : { packedIds: trip.packedIds.filter((id) => id !== garment.id) }) })
  }

  return (
    <aside className="packing" aria-labelledby="packing-list-title" data-editing={editing ? '' : undefined}>
      <h2 id="packing-list-title" className="trip-heading">Lista de maleta <span className="packing-count">{items.length} {items.length === 1 ? 'prenda' : 'prendas'}</span></h2>
      <div className="packing-progress" role="status">
        <div className="batch-dock-bar"><span style={{ width: `${total ? (packed / total) * 100 : 0}%` }} /></div>
        <p>{total > 0 && packed === total ? '¡Todo en la maleta!' : `${packed} de ${total} en la maleta`}</p>
      </div>

      <div className="packing-list">
        {editing && (
          <button type="button" className="button button-outline packing-add-garments" onClick={() => setPicking(true)}>
            <HugeiconsIcon icon={Add01Icon} size={15} />Añadir prendas del armario
          </button>
        )}
        {groups.map((group) => (
          <section key={group.role} aria-label={group.title}>
            <h3>{group.title}</h3>
            {group.items.map(({ garment, days }) => {
              const isPacked = trip.packedIds.includes(garment.id)
              const byHand = days === 0
              return (
                <div className="packing-item packing-garment" key={garment.id} {...(isPacked ? { 'data-packed': '' } : {})}>
                  <label>
                    <input type="checkbox" checked={isPacked} onChange={(event) => onChange({ packedIds: event.target.checked ? [...trip.packedIds, garment.id] : trip.packedIds.filter((id) => id !== garment.id) })} />
                    <GarmentThumbnail garment={garment} alt="" />
                    <span>
                      {garmentLabel(garment)}
                      <small>{wornText(days)}{garment.availability === 'laundry' && ' · está en la lavadora'}{garment.availability === 'unavailable' && ' · está guardada'}</small>
                    </span>
                  </label>
                  {editing && byHand && (
                    <button type="button" onClick={() => toggleGarment(garment)} aria-label={`Quitar ${garmentLabel(garment)} de la maleta`}><HugeiconsIcon icon={Cancel01Icon} size={13} /></button>
                  )}
                </div>
              )
            })}
          </section>
        ))}
        {editing && items.some(({ days }) => days > 0) && (
          <p className="packing-hint">Las prendas de los outfits se cambian en «Qué ponerte», día a día.</p>
        )}

        <section aria-label="Además">
          <h3>Además</h3>
          {trip.extras.map((extra) => (
            <div className="packing-item packing-extra" key={extra.id} {...(extra.packed ? { 'data-packed': '' } : {})}>
              <label>
                <input type="checkbox" checked={extra.packed} onChange={(event) => onChange({ extras: trip.extras.map((item) => (item.id === extra.id ? { ...item, packed: event.target.checked } : item)) })} />
                <span>{extra.label}</span>
              </label>
              {editing && <button type="button" onClick={() => onChange({ extras: trip.extras.filter((item) => item.id !== extra.id) })} aria-label={`Quitar ${extra.label}`}><HugeiconsIcon icon={Cancel01Icon} size={13} /></button>}
            </div>
          ))}
          {editing && (
            <form className="packing-add" onSubmit={addExtra}>
              <label className="visually-hidden" htmlFor={`packing-new-${trip.id}`}>Añadir a la lista</label>
              <input id={`packing-new-${trip.id}`} value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Cargador, documentación…" maxLength={60} />
              <button type="submit" className="button button-outline" disabled={!newItem.trim()}>Añadir</button>
            </form>
          )}
        </section>

        <section className="packing-notes" aria-label="Notas">
          <h3><label htmlFor={`packing-notes-${trip.id}`}>Notas del viaje</label></h3>
          <textarea id={`packing-notes-${trip.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={saveNotes} placeholder="Reservas, horarios, qué no olvidar…" rows={3} maxLength={1000} />
        </section>
      </div>
      {picking && (
        <SuitcasePicker
          garments={garments}
          inPlan={new Set(items.filter(({ days }) => days > 0).map(({ garment }) => garment.id))}
          added={added}
          onToggle={toggleGarment}
          onClose={() => setPicking(false)}
        />
      )}
    </aside>
  )
}
