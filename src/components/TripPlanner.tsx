import { useCallback, useEffect, useState } from 'react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { database } from '../db/database'
import { tripDates } from '../trips/packingPlan'
import type { Garment, Trip } from '../types/domain'
import { dayFromToday } from '../weather/openMeteo'
import { emptyOutfitData, loadOutfitData, type OutfitData } from './outfits/outfitData'
import TripForm from './trips/TripForm'
import TripView from './trips/TripView'

interface TripPlannerProps {
  garments: Garment[]
  onAvailabilityChange: (garment: Garment) => Promise<void>
  /** To the screen for adding garments, offered while the wardrobe is empty. */
  onAddGarments?: () => void
}

/** Your trips: the one under way or coming up opens first, and any can be packed, changed or planned anew. */
export default function TripPlanner({ garments, onAvailabilityChange, onAddGarments }: TripPlannerProps) {
  const [trips, setTrips] = useState<Trip[]>()
  const [openId, setOpenId] = useState<string | 'new'>()
  const [data, setData] = useState<OutfitData>(emptyOutfitData)
  const [error, setError] = useState('')

  const reloadData = useCallback(async () => setData(await loadOutfitData()), [])

  useEffect(() => {
    let active = true
    Promise.all([database.trips.orderBy('startDate').toArray(), loadOutfitData()])
      .then(([stored, outfitData]) => {
        if (!active) return
        const today = dayFromToday(0)
        setTrips(stored)
        setData(outfitData)
        setOpenId((stored.find((trip) => trip.endDate >= today) ?? stored.at(-1))?.id ?? 'new')
      })
      .catch(() => { if (active) setError('No se pudieron abrir tus viajes.') })
    return () => { active = false }
  }, [])

  async function saveTrip(trip: Trip) {
    setTrips((list) => [...(list ?? []).filter((item) => item.id !== trip.id), trip].sort((a, b) => a.startDate.localeCompare(b.startDate)))
    try {
      await database.trips.put(trip)
    } catch {
      setError('No se pudo guardar el viaje en este dispositivo.')
    }
  }

  async function removeTrip(trip: Trip) {
    try {
      await database.trips.delete(trip.id)
      const remaining = (trips ?? []).filter((item) => item.id !== trip.id)
      setTrips(remaining)
      setOpenId(remaining.at(-1)?.id ?? 'new')
    } catch {
      setError('No se pudo eliminar el viaje.')
    }
  }

  const open = trips?.find((trip) => trip.id === openId)

  return (
    <section className="feature-screen trip-planner" aria-labelledby="trip-title">
      <h1 id="trip-title">Maleta<span>.</span></h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!garments.length ? (
        <section className="empty-state">
          <div className="empty-mark" aria-hidden="true">▣</div>
          <h2>Primero, tu armario.</h2>
          <p>La maleta se prepara con tus propias prendas. Añádelas y vuelve aquí.</p>
          {onAddGarments && <button className="button button-dark" type="button" onClick={onAddGarments}>Añadir prendas</button>}
        </section>
      ) : trips && <>
        {trips.length > 0 && (
          <div className="trip-list" role="group" aria-label="Tus viajes">
            {trips.map((trip) => (
              <button key={trip.id} type="button" className="trip-chip" aria-pressed={trip.id === openId} onClick={() => setOpenId(trip.id)}>
                <strong>{trip.place.name}</strong><span>{tripDates(trip)}</span>
              </button>
            ))}
            <button type="button" className="trip-chip trip-chip-new" aria-pressed={openId === 'new'} onClick={() => setOpenId('new')}>
              <HugeiconsIcon icon={Add01Icon} size={15} />Nuevo viaje
            </button>
          </div>
        )}
        {openId === 'new' && (
          <TripForm garments={garments} data={data} onCreated={async (trip) => { await saveTrip(trip); setOpenId(trip.id) }} />
        )}
        {open && (
          <TripView
            key={open.id}
            trip={open}
            garments={garments}
            data={data}
            onChange={saveTrip}
            onDelete={removeTrip}
            onDataChanged={reloadData}
            onAvailabilityChange={onAvailabilityChange}
          />
        )}
      </>}
    </section>
  )
}
