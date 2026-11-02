import { useCallback, useEffect, useMemo, useState } from 'react'
import { createOutfitRecord, generateOutfitCandidates, outfitKey, seasonOfDate, type OutfitContext } from '../../outfits/outfitGenerator'
import { forgottenGarments, localDay, wardrobeGaps, wardrobeStats } from '../../stats/wardrobeStats'
import { loadWearHistory, logWear } from '../../stats/wearLog'
import type { Garment } from '../../types/domain'
import GarmentPhoto from '../GarmentPhoto'
import OutfitBoard, { garmentLabel } from '../OutfitBoard'
import { emptyOutfitData, loadOutfitData, type OutfitData } from '../outfits/outfitData'
import { weatherContext } from '../../weather/openMeteo'
import { useDayForecast } from '../../weather/useDayForecast'
import WeatherBar from '../weather/WeatherBar'
import HowItWorks, { type GuideAction } from './HowItWorks'

const GUIDE_KEY = 'molt-guide-seen'
const dateFormat = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

function greeting(hour: number) {
  return hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'
}

function guideSeen() {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

interface HomeScreenProps {
  garments: Garment[]
  loading: boolean
  onNavigate: (page: GuideAction | 'add') => void
  onOpenGarment: (garment: Garment) => void
}

/** Where the app opens: today's outfit, how the wardrobe is being used, and the guide for those who are starting. */
export default function HomeScreen({ garments, loading, onNavigate, onOpenGarment }: HomeScreenProps) {
  const [data, setData] = useState<OutfitData>(emptyOutfitData)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadWearHistory>>>()
  const [guide, setGuide] = useState<'auto' | 'open' | 'closed'>('auto')
  const [error, setError] = useState('')
  const forecast = useDayForecast()
  const now = useMemo(() => new Date(), [])
  const empty = !loading && garments.length === 0
  const guideVisible = guide === 'open' || (guide === 'auto' && empty && !guideSeen())

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
  const month = useMemo(() => wardrobeStats(garments, entries, 30, now), [garments, entries, now])
  const forgotten = useMemo(() => entries.length ? forgottenGarments(garments, entries, now).slice(0, 4) : [], [garments, entries, now])
  const gap = useMemo(() => wardrobeGaps(garments, now)[0], [garments, now])

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

  function closeGuide() {
    setGuide('closed')
    try {
      localStorage.setItem(GUIDE_KEY, '1')
    } catch {
      // Without storage the guide is simply offered again.
    }
  }

  function guideAction(action: GuideAction) {
    closeGuide()
    onNavigate(action)
  }

  return (
    <section className="feature-screen home" aria-labelledby="home-title">
      <div className="home-heading">
        <div>
          <h1 id="home-title">{empty ? 'Te damos la bienvenida' : greeting(now.getHours())}<span>.</span></h1>
          <p className="page-intro">{empty ? 'Tu armario en el móvil, con outfits hechos con tu propia ropa.' : dateFormat.format(now)}</p>
        </div>
        {!guideVisible && <button type="button" className="button button-outline" onClick={() => setGuide('open')}>Cómo funciona</button>}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {guideVisible && <HowItWorks onClose={closeGuide} onAction={guideAction} />}

      {empty && (
        <div className="home-start">
          <button className="button button-dark" type="button" onClick={() => onNavigate('batch')}>Añadir varias de golpe</button>
          <button className="button button-outline" type="button" onClick={() => onNavigate('add')}>Añadir una prenda</button>
        </div>
      )}

      {garments.length > 0 && <WeatherBar forecast={forecast} />}
      {garments.length > 0 && history && (
        <div className="home-layout">
          <section className="home-today" aria-label="Hoy">
            <h2>{wornToday ? 'Hoy llevas' : 'Para hoy'}</h2>
            {todaysGarments.length > 0 ? (
              <>
                <OutfitBoard garments={todaysGarments} />
                <div className="outfit-actions">
                  {!wornToday && <button type="button" className="button button-dark" onClick={() => void wearProposal()}>Me lo pongo hoy</button>}
                  <button type="button" className="button button-outline" onClick={() => onNavigate('outfits')}>{wornToday ? 'Crear otro' : 'Ver y ajustar'}</button>
                </div>
              </>
            ) : history && (
              <>
                <p className="calendar-empty">Aún no se puede crear un outfit: hace falta al menos una parte de arriba y una de abajo, o un vestido.</p>
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
                        <GarmentPhoto image={garment.thumbnail ?? garment.image} alt="" />
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
