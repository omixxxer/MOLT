import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createOutfitRecord, generateOutfitCandidates, outfitKey, seasonOfDate, type OutfitContext } from '../../outfits/outfitGenerator'
import { forgottenGarments, localDay, missingForOutfits, wardrobeGaps, wardrobeStats } from '../../stats/wardrobeStats'
import { loadWearHistory, logWear } from '../../stats/wearLog'
import type { Garment } from '../../types/domain'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import OutfitCollage from '../outfits/OutfitCollage'
import { outfitName } from '../../outfits/outfitNames'
import { emptyOutfitData, loadOutfitData, type OutfitData } from '../outfits/outfitData'
import { weatherContext } from '../../weather/openMeteo'
import { useDayForecast } from '../../weather/useDayForecast'
import WeatherBar from '../weather/WeatherBar'
import FirstSteps, { type FirstStep } from './FirstSteps'
import Welcome, { type AddWay } from './Welcome'
import { isDemo } from '../../demo/demoMode'
import { DemoButton } from '../demo/DemoMode'

/** «Primeros pasos» hidden by hand (a convenience of this browser only: without storage it is offered again). */
const FIRST_STEPS_KEY = 'molt-first-steps-hidden'
const dateFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

function greeting(hour: number) {
  return hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'
}

function firstStepsHidden() {
  try {
    return localStorage.getItem(FIRST_STEPS_KEY) === '1'
  } catch {
    return false
  }
}

interface HomeScreenProps {
  garments: Garment[]
  loading: boolean
  onNavigate: (page: 'batch' | 'outfits' | 'history' | 'packing' | 'wardrobe' | AddWay) => void
  onOpenGarment: (garment: Garment) => void
}

/**
 * Where the app opens. Empty, a welcome with the one first step (adding garments); then «Primeros pasos» until the
 * first outfit is worn; and always today's outfit and how the wardrobe is being used. While starting out, a guided
 * tour over an example wardrobe.
 */
export default function HomeScreen({ garments, loading, onNavigate, onOpenGarment }: HomeScreenProps) {
  const [data, setData] = useState<OutfitData>(emptyOutfitData)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadWearHistory>>>()
  const [stepsHidden, setStepsHidden] = useState(firstStepsHidden)
  const [error, setError] = useState('')
  const forecast = useDayForecast()
  const now = useMemo(() => new Date(), [])
  const empty = !loading && garments.length === 0

  const reload = useCallback(async () => {
    const [outfitData, wearHistory] = await Promise.all([loadOutfitData(), loadWearHistory()])
    setData(outfitData)
    setHistory(wearHistory)
  }, [])

  useEffect(() => {
    reload().catch(() => setError('No se pudo abrir tu historial.'))
  }, [reload])

  const today = localDay(now)
  const entries = useMemo(() => history?.entries ?? [], [history])
  const wornToday = entries.find((entry) => entry.day === today)
  // The same proposal Outfits opens with, as long as the plan there has not changed.
  const proposal = useMemo(() => {
    if (!history || wornToday || !garments.length) return undefined
    const context: OutfitContext = { occasion: 'Diario', season: seasonOfDate(now), ...weatherContext(forecast.day) }
    const [candidate] = generateOutfitCandidates(garments, context, { preferences: data.preferences, feedback: data.feedback, wear: data.wear, seed: today, limit: 1 })
    return candidate && { candidate, context }
  }, [data, forecast.day, garments, history, now, today, wornToday])
  const todaysGarments = wornToday
    ? wornToday.garmentIds.map((id) => garments.find((garment) => garment.id === id)).filter((garment): garment is Garment => Boolean(garment))
    : proposal?.candidate.garments ?? []
  const todaysName = useMemo(() => {
    if (!todaysGarments.length) return ''
    const saved = wornToday?.outfitId ? data.outfits.find((outfit) => outfit.id === wornToday.outfitId)?.name : undefined
    return saved || outfitName(todaysGarments, { occasion: proposal?.context.occasion ?? 'Diario', date: now })
  }, [data.outfits, now, proposal, todaysGarments, wornToday])
  const month = useMemo(() => wardrobeStats(garments, entries, 30, now), [garments, entries, now])
  const forgotten = useMemo(() => entries.length ? forgottenGarments(garments, entries, now).slice(0, 4) : [], [garments, entries, now])
  const gap = useMemo(() => wardrobeGaps(garments, now)[0], [garments, now])
  const missing = useMemo(() => missingForOutfits(garments), [garments])

  async function wearProposal() {
    if (!proposal) return
    setError('')
    try {
      const key = outfitKey(proposal.candidate.garments)
      const known = data.outfits.find((outfit) => [...outfit.garmentIds].sort().join('|') === key)
      await logWear(known ?? createOutfitRecord(proposal.candidate, proposal.context))
      await reload()
    } catch {
      setError('No se pudo guardar el outfit en este dispositivo.')
    }
  }

  function hideFirstSteps() {
    setStepsHidden(true)
    try {
      localStorage.setItem(FIRST_STEPS_KEY, '1')
    } catch {
      // Without storage the steps are simply offered again next time.
    }
  }

  const count = garments.length
  const firstSteps: FirstStep[] = [
    {
      title: 'Añade ropa para tu primer outfit',
      detail: missing
        ? `Tienes ${count} ${count === 1 ? 'prenda' : 'prendas'}. Falta ${missing} para que Molt pueda combinar.`
        : 'Ya puedes combinar.',
      done: !missing,
      action: { label: 'Añadir prendas', run: () => onNavigate('batch') }
    },
    {
      title: 'Crea tu primer outfit',
      detail: 'En Outfits, «Crear outfit» te propone ideas con tu ropa: elige una, ajústala a tu gusto y guárdala.',
      done: data.outfits.length > 0 || entries.length > 0,
      action: { label: 'Crear outfit', run: () => onNavigate('outfits') }
    },
    {
      title: 'Apunta lo que llevas hoy',
      detail: 'Con «Me lo pongo hoy» el outfit pasa al calendario, y Molt aprende de lo que eliges para proponerte mejor.',
      done: entries.length > 0,
      action: proposal
        ? { label: 'Me lo pongo hoy', run: () => void wearProposal() }
        : { label: 'Ir a Outfits', run: () => onNavigate('outfits') }
    }
  ]
  const stepsPending = firstSteps.some((step) => !step.done)
  // Seen unfinished on this visit: finishing them here shows the last tick and a word of congratulation.
  const sawPending = useRef(false)
  if (history && !empty && stepsPending) sawPending.current = true
  const firstStepsVisible = !isDemo() && !empty && Boolean(history) && !stepsHidden && (stepsPending || sawPending.current)

  return (
    <section className="feature-screen home" aria-labelledby="home-title">
      <div className="home-heading">
        <div>
          <h1 id="home-title">{empty ? 'Te damos la bienvenida' : greeting(now.getHours())}<span>.</span></h1>
          <p className="page-intro">{empty ? 'Molt crea outfits con tu propia ropa. Empieza por lo que ya tienes en el armario.' : dateFormat.format(now)}</p>
        </div>
        {/* While someone is starting out; afterwards the tour is in Armario → Datos, and in the example, its banner. */}
        {!empty && !isDemo() && Boolean(history) && stepsPending && <DemoButton />}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {empty && <Welcome onAdd={onNavigate} />}
      {firstStepsVisible && <FirstSteps steps={firstSteps} onHide={hideFirstSteps} footer={!firstSteps[1]!.done && <><span>¿Quieres ver antes cómo queda?</span><DemoButton className="studio-link" /></>} />}

      {garments.length > 0 && <WeatherBar forecast={forecast} />}
      {garments.length > 0 && history && (
        <div className="home-layout">
          <section className="home-today" aria-label="Hoy">
            <h2>{wornToday ? 'Hoy llevas' : 'Para hoy'}</h2>
            {todaysGarments.length > 0 ? (
              <>
                <div className="home-today-look">
                  <OutfitCollage garments={todaysGarments} />
                  <div className="home-today-info">
                    <p className="home-today-name">{todaysName}</p>
                    <ul>
                      {todaysGarments.map((garment) => (
                        <li key={garment.id}><button type="button" className="studio-link" onClick={() => onOpenGarment(garment)}>{garmentLabel(garment)}</button></li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="outfit-actions">
                  {!wornToday && <button type="button" className="button button-dark" onClick={() => void wearProposal()}>Me lo pongo hoy</button>}
                  <button type="button" className="button button-outline" onClick={() => onNavigate('outfits')}>{wornToday ? 'Crear otro' : 'Ver y ajustar'}</button>
                </div>
              </>
            ) : history && (
              <>
                <p className="calendar-empty">{missing
                  ? `Aún no se puede crear un outfit: falta ${missing}, o un vestido.`
                  : 'Hoy no sale ninguna propuesta con lo que hay disponible. Prueba en Outfits con otra ocasión.'}</p>
                <button type="button" className="button button-dark" onClick={() => onNavigate('batch')}>Añadir prendas</button>
              </>
            )}
          </section>

          <aside className="home-side">
            <button type="button" className="home-stats" onClick={() => onNavigate('history')} aria-label={`Ver el historial: ${month.daysLogged} ${month.daysLogged === 1 ? 'día apuntado' : 'días apuntados'} y ${month.usedGarments} de ${garments.length} prendas usadas en 30 días`}>
              <span className="home-stats-title">Últimos 30 días</span>
              <span className="stat-tile"><strong>{month.daysLogged}</strong><span>{month.daysLogged === 1 ? 'día apuntado' : 'días apuntados'}</span></span>
              <span className="stat-tile"><strong>{month.usedGarments} de {garments.length}</strong><span>prendas usadas</span></span>
            </button>

            {forgotten.length > 0 && (
              <section className="home-forgotten">
                <h2>Te esperan en el armario</h2>
                <ul>
                  {forgotten.map(({ garment }) => (
                    <li key={garment.id}>
                      <button type="button" className="garment-tile" onClick={() => onOpenGarment(garment)} aria-label={garmentLabel(garment)} title={garmentLabel(garment)}>
                        <GarmentThumbnail garment={garment} alt="" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {gap && (
              <section className="home-gap">
                <h2>Te falta</h2>
                <p><strong>{gap.title}.</strong> {gap.detail}</p>
              </section>
            )}

            <div className="home-links">
              <button type="button" className="button button-outline" onClick={() => onNavigate('batch')}>Añadir prendas</button>
              <button type="button" className="button button-outline" onClick={() => onNavigate('packing')}>Preparar una maleta</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
