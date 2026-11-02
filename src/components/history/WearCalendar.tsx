import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft01Icon, ArrowRight01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { localDay, type WearEntry } from '../../stats/wardrobeStats'
import { logWear, removeWear } from '../../stats/wearLog'
import type { Garment, Outfit } from '../../types/domain'
import GarmentPhoto from '../GarmentPhoto'
import OutfitBoard, { garmentLabel } from '../OutfitBoard'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const ROLE_ORDER: Garment['role'][] = ['Una pieza', 'Top', 'Capa', 'Bottom', 'Calzado', 'Accesorio']
const monthFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

function parseDay(day: string) {
  return new Date(`${day}T12:00:00`)
}

/** The days of a month with the empty places before the first one, in weeks starting on Monday. */
function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const blanks = (first.getDay() + 6) % 7
  return [
    ...Array.from({ length: blanks }, () => undefined),
    ...Array.from({ length: days }, (_, index) => localDay(new Date(year, month, index + 1)))
  ]
}

interface WearCalendarProps {
  garments: Garment[]
  outfits: Outfit[]
  entries: WearEntry[]
  onChanged: () => Promise<void>
  onCreateOutfit: () => void
}

/** What was worn each day: a month to look through, and any day to fill in or correct. */
export default function WearCalendar({ garments, outfits, entries, onChanged, onCreateOutfit }: WearCalendarProps) {
  const today = localDay()
  const [shown, setShown] = useState(() => {
    const date = new Date()
    return { year: date.getFullYear(), month: date.getMonth() }
  })
  const [selected, setSelected] = useState(today)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState('')
  const byDay = useMemo(() => {
    const days = new Map<string, WearEntry[]>()
    for (const entry of entries) days.set(entry.day, [...(days.get(entry.day) ?? []), entry])
    return days
  }, [entries])
  const garmentsOf = (ids: string[]) => ids.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment))

  useEffect(() => setChoosing(false), [selected])

  const cells = monthCells(shown.year, shown.month)
  const prefix = `${shown.year}-${String(shown.month + 1).padStart(2, '0')}-`
  const loggedThisMonth = [...byDay.keys()].filter((day) => day.startsWith(prefix)).length
  const daysSoFar = cells.filter((day) => day && day <= today).length
  const isCurrentMonth = today.startsWith(prefix)
  const dayEntries = byDay.get(selected) ?? []
  const worn = new Set(dayEntries.map((entry) => [...entry.garmentIds].sort().join('|')))
  // Each saved or worn outfit once, those of the same garments counting as one; not those already on this day.
  const choices = [...new Map(outfits
    .filter((outfit) => outfit.favorite || outfit.kind === 'manual' || outfit.wornAt)
    .map((outfit) => [[...outfit.garmentIds].sort().join('|'), outfit])).entries()]
    .filter(([key, outfit]) => !worn.has(key) && garmentsOf(outfit.garmentIds).length > 0)
    .map(([, outfit]) => outfit)

  function move(step: number) {
    const date = new Date(shown.year, shown.month + step, 1)
    setShown({ year: date.getFullYear(), month: date.getMonth() })
    setSelected(step > 0 && localDay(date).slice(0, 7) === today.slice(0, 7) ? today : localDay(date))
  }

  async function run(action: () => Promise<void>) {
    setError('')
    try {
      await action()
      await onChanged()
      setChoosing(false)
    } catch {
      setError('No se pudo guardar el cambio en este dispositivo.')
    }
  }

  return (
    <div className="calendar-layout">
      <section className="calendar" aria-label="Calendario">
        <header className="calendar-header">
          <button type="button" className="icon-button" onClick={() => move(-1)} aria-label="Mes anterior"><HugeiconsIcon icon={ArrowLeft01Icon} size={16} /></button>
          <div>
            <h2 aria-live="polite">{monthFormat.format(new Date(shown.year, shown.month, 1))}</h2>
            <p>{loggedThisMonth} de {daysSoFar} días apuntados</p>
          </div>
          <button type="button" className="icon-button" onClick={() => move(1)} disabled={isCurrentMonth} aria-label="Mes siguiente"><HugeiconsIcon icon={ArrowRight01Icon} size={16} /></button>
        </header>
        <div className="calendar-grid" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day} className="calendar-weekday">{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} />
            const list = byDay.get(day) ?? []
            const dayGarments = list[0] ? garmentsOf(list[0].garmentIds) : []
            const cover = [...dayGarments].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))[0]
            const label = `${dayFormat.format(parseDay(day))}${list.length ? `: ${list.length === 1 ? 'un outfit' : `${list.length} outfits`}` : ''}`
            return (
              <button
                key={day}
                type="button"
                className={`calendar-day${list.length ? ' worn' : ''}${day === today ? ' today' : ''}`}
                aria-label={label}
                aria-pressed={day === selected}
                disabled={day > today}
                onClick={() => setSelected(day)}
              >
                <span className="calendar-number">{Number(day.slice(-2))}</span>
                {cover && <GarmentPhoto image={cover.thumbnail ?? cover.image} alt="" />}
                {list.length > 1 && <span className="calendar-more">+{list.length - 1}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="calendar-detail" aria-label="Día seleccionado">
        <h2>{selected === today ? 'Hoy' : dayFormat.format(parseDay(selected))}</h2>
        {error && <p className="form-error" role="alert">{error}</p>}
        {dayEntries.map((entry) => {
          const dayGarments = garmentsOf(entry.garmentIds)
          const name = outfits.find((outfit) => outfit.id === entry.outfitId)?.name
          return (
            <article key={entry.key} className="calendar-entry">
              {name && <h3>{name}</h3>}
              {dayGarments.length > 0 ? <OutfitBoard garments={dayGarments} /> : <p className="outfit-explanation">Estas prendas ya no están en el armario.</p>}
              <button type="button" className="studio-link" onClick={() => void run(() => removeWear(entry))}>
                <HugeiconsIcon icon={Delete02Icon} size={13} />Quitar de este día
              </button>
            </article>
          )
        })}
        {!dayEntries.length && <p className="calendar-empty">{selected === today ? 'Aún no has apuntado nada hoy.' : 'No hay nada apuntado este día.'}</p>}

        <div className="calendar-actions">
          {choices.length > 0 && <button type="button" className="button button-outline" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>Apuntar un outfit guardado</button>}
          {selected === today && <button type="button" className="button button-dark" onClick={onCreateOutfit}>Crear el de hoy</button>}
        </div>
        {!choices.length && selected !== today && <p className="calendar-empty">Cuando tengas outfits guardados podrás apuntarlos en cualquier día.</p>}
        {choosing && (
          <ul className="calendar-choices">
            {choices.map((outfit) => {
              const items = garmentsOf(outfit.garmentIds)
              return (
                <li key={outfit.id}>
                  <button type="button" aria-label={`Apuntar ${outfit.name || items.map(garmentLabel).join(', ')}`} onClick={() => void run(() => logWear(outfit, selected))}>
                    <span className="calendar-strip">{items.slice(0, 4).map((garment) => <GarmentPhoto key={garment.id} image={garment.thumbnail ?? garment.image} alt="" />)}</span>
                    <span>{outfit.name || outfit.occasion}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
