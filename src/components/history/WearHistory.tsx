import { useCallback, useEffect, useState } from 'react'
import type { WearEntry } from '../../stats/wardrobeStats'
import { loadWearHistory } from '../../stats/wearLog'
import type { Garment, Outfit } from '../../types/domain'
import WardrobeStatsView from './WardrobeStatsView'
import WearCalendar from './WearCalendar'

interface WearHistoryProps {
  garments: Garment[]
  onAddGarments: () => void
  onCreateOutfit: () => void
  onOpenGarment: (garment: Garment) => void
}

/** The calendar of what was worn and the statistics that come from it. */
export default function WearHistory({ garments, onAddGarments, onCreateOutfit, onOpenGarment }: WearHistoryProps) {
  const [view, setView] = useState<'calendar' | 'stats'>('calendar')
  const [history, setHistory] = useState<{ outfits: Outfit[]; entries: WearEntry[] }>()
  const [error, setError] = useState('')

  const reload = useCallback(async () => setHistory(await loadWearHistory()), [])

  useEffect(() => {
    reload().catch(() => setError('No se pudo abrir tu historial.'))
  }, [reload])

  return (
    <section className="feature-screen" aria-labelledby="history-title">
      <div className="outfit-heading">
        <h1 id="history-title">Historial<span>.</span></h1>
        {garments.length > 0 && (
          <div className="outfit-tabs" role="tablist" aria-label="Secciones del historial">
            <button type="button" role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}>Calendario</button>
            <button type="button" role="tab" aria-selected={view === 'stats'} onClick={() => setView('stats')}>Estadísticas</button>
          </div>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {garments.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark" aria-hidden="true">✳</div>
          <h2>Primero, tu armario.</h2>
          <p>Aquí verás lo que llevas cada día y cuánto usas cada prenda.</p>
          <button className="button button-dark" type="button" onClick={onAddGarments}>Añadir prendas</button>
        </section>
      ) : history && (view === 'calendar'
        ? <WearCalendar garments={garments} outfits={history.outfits} entries={history.entries} onChanged={reload} onCreateOutfit={onCreateOutfit} />
        : <WardrobeStatsView garments={garments} entries={history.entries} onOpenGarment={onOpenGarment} />)}
    </section>
  )
}
