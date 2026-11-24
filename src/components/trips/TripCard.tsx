import { useEffect, useMemo, useState } from 'react'
import { packingGroups, tripDates } from '../../trips/packingPlan'
import { coverImage } from '../../trips/destinationPhoto'
import { sceneFor } from '../../trips/tripScene'
import type { Garment, Trip } from '../../types/domain'
import { useObjectUrl } from '../useObjectUrl'
import TripScene from './TripScene'

interface TripCardProps {
  trip: Trip
  garments: Garment[]
  today: string
  onOpen: () => void
}

const DAY_MS = 86_400_000

/** «Empieza mañana», «En curso · día 2 de 5», «Terminó el 3 dic»: where the trip stands today. */
export function tripWhen(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string) {
  const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / DAY_MS)
  if (trip.endDate < today) return 'Terminado'
  if (trip.startDate > today) {
    const left = days(today, trip.startDate)
    return left === 1 ? 'Empieza mañana' : `Empieza en ${left} días`
  }
  const total = days(trip.startDate, trip.endDate) + 1
  return total === 1 ? 'Es hoy' : `En curso · día ${days(trip.startDate, today) + 1} de ${total}`
}

/** A trip on the list of trips: its photo or drawing, where and when, and how much is already packed. */
export default function TripCard({ trip, garments, today, onOpen }: TripCardProps) {
  const scene = useMemo(() => sceneFor(trip), [trip])
  const groups = useMemo(() => packingGroups(garments, trip.days, trip.extraGarmentIds), [garments, trip.days, trip.extraGarmentIds])
  const items = groups.flatMap((group) => group.items)
  const total = items.length + trip.extras.length
  const packed = items.filter(({ garment }) => trip.packedIds.includes(garment.id)).length + trip.extras.filter((extra) => extra.packed).length
  const [cover, setCover] = useState<Blob>()
  const coverUrl = useObjectUrl(cover)

  // Only the photo already chosen for the trip, from the browser's cache when it is there; nothing new is looked for.
  useEffect(() => {
    let current = true
    if (trip.cover) coverImage(trip.cover).then((blob) => { if (current) setCover(blob) }).catch(() => undefined)
    return () => { current = false }
  }, [trip.cover?.imageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const finished = trip.endDate < today
  return (
    <li className="trip-card" data-finished={finished ? '' : undefined}>
      <button type="button" className="trip-card-button" onClick={onOpen} aria-label={`Abrir el viaje a ${trip.place.name}, ${tripDates(trip)}`}>
        <span className="trip-card-art" aria-hidden="true">
          {coverUrl ? <img src={coverUrl} alt="" /> : <TripScene scene={scene} />}
        </span>
        <span className="trip-card-text">
          <span className="trip-card-when">{tripWhen(trip, today)}</span>
          <strong>{trip.place.name}</strong>
          <span>{tripDates(trip)} · {trip.days.length} {trip.days.length === 1 ? 'día' : 'días'}</span>
          {!finished && total > 0 && (
            <span className="trip-card-progress">
              <span className="batch-dock-bar"><span style={{ width: `${(packed / total) * 100}%` }} /></span>
              <small>{packed === total ? 'Todo en la maleta' : `${packed} de ${total} en la maleta`}</small>
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
