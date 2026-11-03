import { useMemo, useState } from 'react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { colorSwatch } from '../../ai/colors'
import { daysBetween, wardrobeGaps, wardrobeStats, type GarmentUse, type StatRow, type WearEntry } from '../../stats/wardrobeStats'
import type { Garment } from '../../types/domain'
import GarmentPhoto from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'

const PERIODS: Array<[number | undefined, string]> = [[30, '30 días'], [90, '3 meses'], [365, 'Un año'], [undefined, 'Todo']]
const money = new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

function times(count: number) {
  return count === 1 ? '1 vez' : `${count} veces`
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return <div className="stat-tile"><strong>{value}</strong><span>{label}</span></div>
}

/** A single measure in one ink, always with its number beside the bar. */
function BarRow({ label, value, ratio, swatch }: { label: string; value: string; ratio: number; swatch?: string }) {
  return (
    <li className="stat-row">
      <span className="stat-row-label">{swatch && <i style={{ background: swatch }} aria-hidden="true" />}{label}</span>
      <span className="stat-row-value">{value}</span>
      <span className="stat-bar" aria-hidden="true"><span style={{ width: `${Math.max(ratio * 100, 2)}%` }} /></span>
    </li>
  )
}

function GarmentRow({ use, note, onOpen }: { use: GarmentUse; note: string; onOpen: (garment: Garment) => void }) {
  return (
    <li>
      <button type="button" className="stat-garment" onClick={() => onOpen(use.garment)}>
        <span className="garment-tile"><GarmentPhoto image={use.garment.thumbnail ?? use.garment.image} alt="" /></span>
        <span>{garmentLabel(use.garment)}<small>{note}</small></span>
      </button>
    </li>
  )
}

function shareRows(rows: StatRow[], swatches?: boolean) {
  const largest = Math.max(1, ...rows.map((row) => row.count))
  return rows.map((row) => (
    <BarRow key={row.label} label={row.label} value={`${row.count} ${row.count === 1 ? 'prenda' : 'prendas'} · ${times(row.wears)}`} ratio={row.count / largest} swatch={swatches ? colorSwatch(row.label) : undefined} />
  ))
}

interface WardrobeStatsViewProps {
  garments: Garment[]
  entries: WearEntry[]
  onOpenGarment: (garment: Garment) => void
}

/** How the wardrobe is really used: what is worn, what waits, what it costs and what it lacks. */
export default function WardrobeStatsView({ garments, entries, onOpenGarment }: WardrobeStatsViewProps) {
  const [days, setDays] = useState<number | undefined>(30)
  const stats = useMemo(() => wardrobeStats(garments, entries, days), [garments, entries, days])
  const gaps = useMemo(() => wardrobeGaps(garments), [garments])
  const now = new Date()
  const { cost } = stats
  const sinceLabel = (use: GarmentUse) => use.lastWorn ? `Hace ${daysBetween(use.lastWorn, now)} días` : 'Aún sin llevar'
  const bestValue = cost.garments.slice(0, 3)
  const toAmortize = cost.garments.slice(3).reverse().slice(0, 3)

  return (
    <div className="stats">
      <div className="choice-row" role="group" aria-label="Periodo">
        {PERIODS.map(([value, label]) => (
          <button key={label} type="button" className={`choice-chip ${days === value ? 'selected' : ''}`} aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>
        ))}
      </div>

      <div className="stat-tiles">
        <Tile value={stats.daysLogged} label={stats.daysLogged === 1 ? 'día apuntado' : 'días apuntados'} />
        <Tile value={`${stats.usedGarments} de ${garments.length}`} label="prendas usadas" />
        <Tile value={garments.length ? `${Math.round(stats.usedGarments / garments.length * 100)} %` : '—'} label="del armario en uso" />
        <Tile value={cost.perWear === undefined ? '—' : money.format(cost.perWear)} label="de coste por puesta" />
      </div>
      {!stats.wears && <p className="calendar-empty">Nada apuntado en este periodo. Marca «Me lo pongo hoy» en Outfits, o apunta días en el calendario.</p>}

      <div className="stat-sections">
        {stats.mostWorn.length > 0 && (
          <section className="stat-section">
            <h2>Lo que más llevas</h2>
            <ul className="stat-list">
              {stats.mostWorn.map((use) => <BarRow key={use.garment.id} label={garmentLabel(use.garment)} value={times(use.wears)} ratio={use.wears / stats.mostWorn[0]!.wears} />)}
            </ul>
          </section>
        )}

        {stats.forgotten.length > 0 && (
          <section className="stat-section">
            <h2>Te esperan en el armario <small>{stats.forgotten.length}</small></h2>
            <ul className="stat-garments">
              {stats.forgotten.slice(0, 6).map((use) => <GarmentRow key={use.garment.id} use={use} note={sinceLabel(use)} onOpen={onOpenGarment} />)}
            </ul>
          </section>
        )}

        {gaps.length > 0 && (
          <section className="stat-section">
            <h2>Te falta</h2>
            <ul className="stat-gaps">
              {gaps.map((gap) => <li key={gap.title}><HugeiconsIcon icon={Alert02Icon} size={14} /><span><strong>{gap.title}</strong>{gap.detail}</span></li>)}
            </ul>
          </section>
        )}

        <section className="stat-section">
          <h2>Coste por puesta</h2>
          {cost.priced === 0 ? (
            <p className="calendar-empty">Añade el precio al editar una prenda y verás cuánto te sale cada vez que la llevas. Es opcional.</p>
          ) : (
            <>
              <p className="stat-note">{money.format(cost.total)} en {cost.priced} {cost.priced === 1 ? 'prenda' : 'prendas'} con precio, de {garments.length}. Una prenda sin estrenar cuenta como una puesta.</p>
              <h3>Mejor amortizadas</h3>
              <ul className="stat-garments">
                {bestValue.map((use) => <GarmentRow key={use.garment.id} use={use} note={`${money.format(use.perWear)} · ${times(use.wears)}`} onOpen={onOpenGarment} />)}
              </ul>
              {toAmortize.length > 0 && (
                <>
                  <h3>Por amortizar</h3>
                  <ul className="stat-garments">
                    {toAmortize.map((use) => <GarmentRow key={use.garment.id} use={use} note={`${money.format(use.perWear)} · ${times(use.wears)}`} onOpen={onOpenGarment} />)}
                  </ul>
                </>
              )}
            </>
          )}
        </section>

        <section className="stat-section">
          <h2>Por categoría</h2>
          <ul className="stat-list">{shareRows(stats.categories)}</ul>
        </section>

        {stats.colors.length > 0 && (
          <section className="stat-section">
            <h2>Colores</h2>
            <ul className="stat-list">{shareRows(stats.colors, true)}</ul>
          </section>
        )}

        {stats.brands.length > 0 && (
          <section className="stat-section">
            <h2>Marcas</h2>
            <ul className="stat-list">{shareRows(stats.brands)}</ul>
          </section>
        )}
      </div>
    </div>
  )
}
