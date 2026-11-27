import { useCallback, useEffect, useState } from 'react'
import { DemoButton } from './demo/DemoMode'
import { Add01Icon, ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { database } from '../db/database'
import type { Garment, Trip } from '../types/domain'
import { dayFromToday } from '../weather/openMeteo'
import { emptyOutfitData, loadOutfitData, type OutfitData } from './outfits/outfitData'
import TripCard from './trips/TripCard'
import TripForm from './trips/TripForm'
import TripView from './trips/TripView'
import StarButton from './StarButton'

interface TripPlannerProps {
  garments: Garment[]
  onAvailabilityChange: (garment: Garment) => Promise<void>
  /** To the screen for adding garments, offered while the wardrobe is empty. */
  onAddGarments?: () => void
}

/**
 * Your trips: a list of them first (the ones under way or coming up, then the past ones), from which each opens, and
 * «Nuevo viaje». With no trips yet, the form for the first one.
 */
export default function TripPlanner({ garments, onAvailabilityChange, onAddGarments }: TripPlannerProps) {
  const [trips, setTrips] = useState<Trip[]>()
  /** undefined: the list of trips. */
  const [openId, setOpenId] = useState<string | 'new'>()
  const [data, setData] = useState<OutfitData>(emptyOutfitData)
  const [error, setError] = useState('')
  const today = dayFromToday(0)

  const reloadData = useCallback(async () => setData(await loadOutfitData()), [])

  useEffect(() => {
    let active = true
    Promise.all([database.trips.orderBy('startDate').toArray(), loadOutfitData()])
      .then(([stored, outfitData]) => {
        if (!active) return
        setTrips(stored)
        setData(outfitData)
        if (!stored.length) setOpenId('new')
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
      setOpenId(remaining.length ? undefined : 'new')
    } catch {
      setError('No se pudo eliminar el viaje.')
    }
  }

  function show(id: string | 'new' | undefined) {
    setOpenId(id)
    document.getElementById('trip-title')?.scrollIntoView?.({ block: 'start' })
  }

  const open = trips?.find((trip) => trip.id === openId)
  const coming = (trips ?? []).filter((trip) => trip.endDate >= today)
  const past = (trips ?? []).filter((trip) => trip.endDate < today).reverse()
  const back = trips && trips.length > 0 && openId !== undefined && (
    <button type="button" className="trip-back" onClick={() => show(undefined)}>
      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />Tus viajes
    </button>
  )

  return (
    <section className="feature-screen trip-planner" aria-labelledby="trip-title">
      <div className="trip-planner-head">
        <h1 id="trip-title">Maleta<span>.</span></h1>
        {trips && trips.length > 0 && openId === undefined && garments.length > 0 && (
          <StarButton onClick={() => show('new')}>
            <HugeiconsIcon icon={Add01Icon} size={15} />Nuevo viaje
          </StarButton>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!garments.length ? (
        <section className="empty-state">
          <div className="empty-mark" aria-hidden="true">▣</div>
          <h2>Primero, tu armario.</h2>
          <p>La maleta se prepara con tus propias prendas. Añádelas y vuelve aquí.</p>
          {onAddGarments && <button className="button button-dark" type="button" onClick={onAddGarments}>Añadir prendas</button>}
          <DemoButton className="studio-link" />
        </section>
      ) : trips && <>
        {back}
        {openId === undefined && (
          <div className="trip-home">
            {coming.length > 0 && (
              <section aria-labelledby="trips-coming">
                <h2 id="trips-coming" className="trip-home-title">En curso y próximos</h2>
                <ul className="trip-cards">
                  {coming.map((trip) => <TripCard key={trip.id} trip={trip} garments={garments} today={today} onOpen={() => show(trip.id)} />)}
                </ul>
              </section>
            )}
            {coming.length === 0 && (
              <section className="trip-home-empty">
                <p>No tienes ningún viaje por delante.</p>
                <button type="button" className="button button-dark" onClick={() => show('new')}><HugeiconsIcon icon={Add01Icon} size={15} />Preparar un viaje</button>
              </section>
            )}
            {past.length > 0 && (
              <section aria-labelledby="trips-past">
                <h2 id="trips-past" className="trip-home-title">Pasados</h2>
                <ul className="trip-cards trip-cards-past">
                  {past.map((trip) => <TripCard key={trip.id} trip={trip} garments={garments} today={today} onOpen={() => show(trip.id)} />)}
                </ul>
              </section>
            )}
          </div>
        )}
        {openId === 'new' && (
          <TripForm garments={garments} data={data} onCreated={async (trip) => { await saveTrip(trip); show(trip.id) }} />
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
