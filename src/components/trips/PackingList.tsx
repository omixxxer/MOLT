import { useState, type FormEvent } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PackingGroup } from '../../trips/packingPlan'
import type { Trip } from '../../types/domain'
import GarmentPhoto from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'

interface PackingListProps {
  trip: Trip
  groups: PackingGroup[]
  onChange: (change: Partial<Trip>) => void
}

/** The list to tick while packing: each garment once, and the rest of the suitcase. */
export default function PackingList({ trip, groups, onChange }: PackingListProps) {
  const [newItem, setNewItem] = useState('')
  const items = groups.flatMap((group) => group.items)
  const total = items.length + trip.extras.length
  const packed = items.filter(({ garment }) => trip.packedIds.includes(garment.id)).length + trip.extras.filter((extra) => extra.packed).length

  function addExtra(event: FormEvent) {
    event.preventDefault()
    const label = newItem.trim()
    if (!label) return
    onChange({ extras: [...trip.extras, { id: crypto.randomUUID(), label, packed: false }] })
    setNewItem('')
  }

  return (
    <aside className="packing" aria-labelledby="packing-list-title">
      <h2 id="packing-list-title" className="trip-heading">Lista de maleta <span className="packing-count">{items.length} {items.length === 1 ? 'prenda' : 'prendas'}</span></h2>
      <div className="packing-progress" role="status">
        <div className="batch-dock-bar"><span style={{ width: `${total ? (packed / total) * 100 : 0}%` }} /></div>
        <p>{total > 0 && packed === total ? '¡Todo en la maleta!' : `${packed} de ${total} en la maleta`}</p>
      </div>

      <div className="packing-list">
        {groups.map((group) => (
          <section key={group.role} aria-label={group.title}>
            <h3>{group.title}</h3>
            {group.items.map(({ garment, days }) => {
              const isPacked = trip.packedIds.includes(garment.id)
              return (
                <label className="packing-item" key={garment.id} {...(isPacked ? { 'data-packed': '' } : {})}>
                  <input type="checkbox" checked={isPacked} onChange={(event) => onChange({ packedIds: event.target.checked ? [...trip.packedIds, garment.id] : trip.packedIds.filter((id) => id !== garment.id) })} />
                  <GarmentPhoto image={garment.thumbnail ?? garment.image} alt="" />
                  <span>
                    {garmentLabel(garment)}
                    <small>{days === 1 ? '1 día' : `${days} días`}{garment.availability === 'laundry' && ' · está en la lavadora'}{garment.availability === 'unavailable' && ' · está guardada'}</small>
                  </span>
                </label>
              )
            })}
          </section>
        ))}

        <section aria-label="Además">
          <h3>Además</h3>
          {trip.extras.map((extra) => (
            <div className="packing-item packing-extra" key={extra.id} {...(extra.packed ? { 'data-packed': '' } : {})}>
              <label>
                <input type="checkbox" checked={extra.packed} onChange={(event) => onChange({ extras: trip.extras.map((item) => (item.id === extra.id ? { ...item, packed: event.target.checked } : item)) })} />
                <span>{extra.label}</span>
              </label>
              <button type="button" onClick={() => onChange({ extras: trip.extras.filter((item) => item.id !== extra.id) })} aria-label={`Quitar ${extra.label}`}><HugeiconsIcon icon={Cancel01Icon} size={13} /></button>
            </div>
          ))}
          <form className="packing-add" onSubmit={addExtra}>
            <label className="visually-hidden" htmlFor={`packing-new-${trip.id}`}>Añadir a la lista</label>
            <input id={`packing-new-${trip.id}`} value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Añadir algo más" maxLength={60} />
            <button type="submit" className="button button-outline" disabled={!newItem.trim()}>Añadir</button>
          </form>
        </section>
      </div>
    </aside>
  )
}
