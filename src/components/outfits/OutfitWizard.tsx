import { useMemo, useRef, useState } from 'react'
import { ArrowLeft01Icon, PaintBrush01Icon, ShirtIcon, SparklesIcon, SquareIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  explainNoOutfits,
  fitLabel,
  generateOutfitCandidates,
  outfitKey,
  seasonOfDate,
  type OutfitCandidate,
  type OutfitContext,
  type OutfitGenerationOptions,
  type OutfitTemplate
} from '../../outfits/outfitGenerator'
import { outfitName } from '../../outfits/outfitNames'
import { localDay } from '../../stats/wardrobeStats'
import { garmentCategories, type Garment, type Outfit } from '../../types/domain'
import { weatherContext } from '../../weather/openMeteo'
import { useDayForecast } from '../../weather/useDayForecast'
import { GarmentThumbnail } from '../GarmentPhoto'
import { garmentLabel } from '../OutfitBoard'
import type { OutfitData } from './outfitData'
import OutfitCollage from './OutfitCollage'
import OutfitStudio, { type StudioStart } from './OutfitStudio'

export const OCCASIONS: OutfitTemplate[] = ['Diario', 'Arreglado', 'Formal', 'Deportivo', 'Frío y capas', 'Calor y pocas capas']

type Step = 'start' | 'ideas' | 'adjust'

/** How the outfit is begun, chosen in the first step. */
export type WizardStart =
  | { mode: 'surprise' }
  | { mode: 'style'; occasion: OutfitTemplate; aesthetic: string }
  | { mode: 'garment'; garmentId: string }
  | { mode: 'empty' }

interface OutfitWizardProps {
  garments: Garment[]
  data: OutfitData
  manualTemperature: string
  /** A garment to start from (its detail in the wardrobe): straight to the ideas around it. */
  startGarmentId?: string
  /** A saved outfit to change («Cambiar»): straight to the last step. */
  editing?: Outfit
  onChanged: () => Promise<void>
  onAvailabilityChange: (garment: Garment) => Promise<void>
  onShowSaved: () => void
  /** Leaves the outfit being changed for a new one. */
  onCreateNew: () => void
}

const STEPS: Array<[Step, string]> = [['start', 'Empezar'], ['ideas', 'Ideas'], ['adjust', 'Ajustar']]

/**
 * Making an outfit in three steps: how to begin (Molt's choice, a plan and an aesthetic, a garment, or nothing), the
 * ideas Molt proposes for it as collages, best first, and the studio to change and save the one chosen.
 */
export default function OutfitWizard({ garments, data, manualTemperature, startGarmentId, editing, onChanged, onAvailabilityChange, onShowSaved, onCreateNew }: OutfitWizardProps) {
  const [step, setStep] = useState<Step>(editing ? 'adjust' : startGarmentId ? 'ideas' : 'start')
  const [begin, setBegin] = useState<WizardStart>(startGarmentId ? { mode: 'garment', garmentId: startGarmentId } : { mode: 'surprise' })
  const [open, setOpen] = useState<'style' | 'garment'>()
  const [occasion, setOccasion] = useState<OutfitTemplate>('Diario')
  const [aesthetic, setAesthetic] = useState('')
  const [category, setCategory] = useState('')
  const [studioStart, setStudioStart] = useState<StudioStart | undefined>(editing && { garmentIds: editing.garmentIds, nonce: 1, lock: true })
  const [extra, setExtra] = useState<OutfitCandidate[]>([])
  const shown = useRef(new Set<string>())
  const forecast = useDayForecast()
  const aesthetics = [...new Set(garments.flatMap((garment) => garment.styles).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const startGarment = begin.mode === 'garment' ? garments.find((garment) => garment.id === begin.garmentId) : undefined

  const planned = begin.mode === 'style' ? begin.occasion : 'Diario'
  const context = useMemo<OutfitContext>(() => {
    const manual = manualTemperature === '' ? undefined : Number(manualTemperature)
    return {
      occasion: planned,
      desiredStyle: begin.mode === 'style' && begin.aesthetic ? begin.aesthetic : undefined,
      ...(manual === undefined ? weatherContext(forecast.day) : { temperatureCelsius: manual }),
      season: seasonOfDate(new Date()),
      includeGarmentIds: startGarment ? [startGarment.id] : []
    }
  }, [planned, begin, manualTemperature, forecast.day, startGarment])

  const options = useMemo<OutfitGenerationOptions>(() => ({ preferences: data.preferences, feedback: data.feedback, wear: data.wear, seed: localDay() }), [data.preferences, data.feedback, data.wear])
  // The outfits already in «Mis outfits» are not proposed as new ideas, unless nothing else can be made.
  const savedKeys = useMemo(() => new Set(data.outfits.filter((outfit) => outfit.favorite || outfit.kind === 'manual').map((outfit) => [...outfit.garmentIds].sort().join('|'))), [data.outfits])
  const ideas = useMemo(() => {
    if (step === 'start' || begin.mode === 'empty') return []
    const found = generateOutfitCandidates(garments, context, { ...options, skip: savedKeys })
    return found.length ? found : generateOutfitCandidates(garments, context, options)
  }, [step, begin, garments, context, options, savedKeys])
  const allIdeas = [...ideas, ...extra.filter((look) => !ideas.some((idea) => outfitKey(idea.garments) === outfitKey(look.garments)))]
  // A name for each idea, none repeated on the list, and none sounding like the one before («… de otoño» twice).
  const names = useMemo(() => {
    const used = new Set<string>()
    let lastEnding = ''
    return allIdeas.map((look) => {
      let name = outfitName(look.garments, context)
      for (let variant = 1; variant < 12 && (used.has(name) || (lastEnding && name.endsWith(lastEnding))); variant += 1) name = outfitName(look.garments, context, variant)
      used.add(name)
      lastEnding = / de \S+$/.exec(name)?.[0] ?? ''
      return name
    })
  }, [allIdeas, context]) // eslint-disable-line react-hooks/exhaustive-deps

  function go(next: WizardStart) {
    setBegin(next)
    setExtra([])
    shown.current.clear()
    if (next.mode === 'empty') {
      setStudioStart({ garmentIds: [], nonce: Date.now(), empty: true })
      setStep('adjust')
    } else {
      setStep('ideas')
    }
    document.getElementById('outfits-title')?.scrollIntoView?.({ block: 'start' })
  }

  function moreIdeas() {
    for (const look of allIdeas) shown.current.add(outfitKey(look.garments))
    for (const key of savedKeys) shown.current.add(key)
    const found = generateOutfitCandidates(garments, context, { ...options, skip: shown.current })
    setExtra((list) => [...list, ...found])
  }

  function choose(look: OutfitCandidate, name: string) {
    setStudioStart({ garmentIds: look.garments.map((garment) => garment.id), nonce: Date.now(), lockIds: startGarment ? [startGarment.id] : [], name })
    setStep('adjust')
    document.getElementById('outfits-title')?.scrollIntoView?.({ block: 'start' })
  }

  const reached: Record<Step, boolean> = { start: true, ideas: begin.mode !== 'empty' && !editing, adjust: Boolean(studioStart) }
  const summary = begin.mode === 'style'
    ? [begin.occasion, begin.aesthetic].filter(Boolean).join(' · ')
    : begin.mode === 'garment' ? `Con ${startGarment ? garmentLabel(startGarment) : 'tu prenda'}` : 'Elegidas por Molt para hoy'

  return (
    <div className="wizard">
      {!editing && (
        <ol className="wizard-steps" aria-label="Pasos">
          {STEPS.map(([id, label], index) => (
            <li key={id} data-state={step === id ? 'current' : STEPS.findIndex(([other]) => other === step) > index ? 'done' : 'pending'}>
              <button type="button" onClick={() => setStep(id)} disabled={!reached[id] || step === id} aria-current={step === id ? 'step' : undefined}>
                <span className="wizard-step-mark">{STEPS.findIndex(([other]) => other === step) > index ? <HugeiconsIcon icon={Tick02Icon} size={12} /> : index + 1}</span>{label}
              </button>
            </li>
          ))}
        </ol>
      )}

      {step === 'start' && (
        <section className="wizard-start" aria-labelledby="wizard-start-title">
          <h2 id="wizard-start-title" className="wizard-title">¿Cómo quieres empezar?</h2>
          <div className="wizard-options">
            <button type="button" className="wizard-option wizard-option-main" onClick={() => go({ mode: 'surprise' })}>
              <HugeiconsIcon icon={SparklesIcon} size={22} />
              <strong>Sorpréndeme</strong>
              <span>Molt te propone outfits para hoy, con el tiempo y lo que llevas últimamente.</span>
            </button>
            <button type="button" className="wizard-option" aria-expanded={open === 'style'} onClick={() => setOpen(open === 'style' ? undefined : 'style')}>
              <HugeiconsIcon icon={PaintBrush01Icon} size={22} />
              <strong>Por estilo</strong>
              <span>Elige el plan y, si quieres, una estética.</span>
            </button>
            <button type="button" className="wizard-option" aria-expanded={open === 'garment'} onClick={() => setOpen(open === 'garment' ? undefined : 'garment')}>
              <HugeiconsIcon icon={ShirtIcon} size={22} />
              <strong>Desde una prenda</strong>
              <span>Elige una prenda y Molt monta los outfits alrededor.</span>
            </button>
            <button type="button" className="wizard-option" onClick={() => go({ mode: 'empty' })}>
              <HugeiconsIcon icon={SquareIcon} size={22} />
              <strong>Desde cero</strong>
              <span>Elige tú cada prenda, una a una.</span>
            </button>
          </div>

          {open === 'style' && (
            <section className="wizard-panel" aria-label="Por estilo">
              <h3>¿Para qué es?</h3>
              <div className="choice-row" role="group" aria-label="Plan">
                {OCCASIONS.map((item) => (
                  <button key={item} type="button" className={`choice-chip ${occasion === item ? 'selected' : ''}`} aria-pressed={occasion === item} onClick={() => setOccasion(item)}>{item}</button>
                ))}
              </div>
              {aesthetics.length > 0 && (
                <>
                  <h3>Estética</h3>
                  <div className="choice-row" role="group" aria-label="Estética">
                    <button type="button" className={`choice-chip ${aesthetic ? '' : 'selected'}`} aria-pressed={!aesthetic} onClick={() => setAesthetic('')}>Cualquiera</button>
                    {aesthetics.map((item) => (
                      <button key={item} type="button" className={`choice-chip ${aesthetic === item ? 'selected' : ''}`} aria-pressed={aesthetic === item} onClick={() => setAesthetic(item)}>{item}</button>
                    ))}
                  </div>
                </>
              )}
              <button type="button" className="button button-dark" onClick={() => go({ mode: 'style', occasion, aesthetic })}>Ver ideas</button>
            </section>
          )}

          {open === 'garment' && (
            <section className="wizard-panel" aria-label="Desde una prenda">
              <div className="choice-row" role="group" aria-label="Tipo de prenda">
                <button type="button" className={`choice-chip ${category ? '' : 'selected'}`} aria-pressed={!category} onClick={() => setCategory('')}>Todas</button>
                {garmentCategories.filter((value) => garments.some((garment) => garment.category === value)).map((value) => (
                  <button key={value} type="button" className={`choice-chip ${category === value ? 'selected' : ''}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>
                ))}
              </div>
              <ul className="wizard-garments">
                {garments.filter((garment) => (!category || garment.category === category) && garment.availability !== 'laundry' && garment.availability !== 'unavailable').map((garment) => (
                  <li key={garment.id}>
                    <button type="button" className="picker-option" onClick={() => go({ mode: 'garment', garmentId: garment.id })} aria-label={`Empezar con ${garmentLabel(garment)}`}>
                      <span className="garment-tile"><GarmentThumbnail garment={garment} alt="" /></span>
                      <span className="picker-name">{garmentLabel(garment)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      {step === 'ideas' && (
        <section className="wizard-ideas" aria-labelledby="wizard-ideas-title">
          <div className="wizard-ideas-head">
            <div>
              <h2 id="wizard-ideas-title" className="wizard-title">Ideas para ti</h2>
              <p className="wizard-summary">{summary}. Elige una para ajustarla y guardarla.</p>
            </div>
            <button type="button" className="trip-back" onClick={() => setStep('start')}><HugeiconsIcon icon={ArrowLeft01Icon} size={16} />Cambiar cómo empezar</button>
          </div>
          {allIdeas.length === 0
            ? <p className="outfit-notice" role="status">{explainNoOutfits(garments, context)}</p>
            : (
                <ul className="wizard-idea-grid">
                  {allIdeas.map((look, index) => {
                    const name = names[index]!
                    return (
                      <li key={outfitKey(look.garments)} style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
                        <button type="button" className="wizard-idea" onClick={() => choose(look, name)} aria-label={`${name}: ${look.garments.map(garmentLabel).join(', ')}`}>
                          <OutfitCollage garments={look.garments} />
                          <span className="wizard-idea-text">
                            <strong>{name}</strong>
                            <small>{fitLabel(look.score)}{index === 0 && ' · la que mejor encaja'}</small>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
          {allIdeas.length > 0 && <button type="button" className="button button-outline wizard-more" onClick={moreIdeas}>Ver más ideas</button>}
        </section>
      )}

      {step === 'adjust' && studioStart && (
        <OutfitStudio
          key={studioStart.nonce}
          garments={garments}
          data={data}
          start={studioStart}
          initialOccasion={editing ? (OCCASIONS.find((item) => item === editing.occasion) ?? 'Diario') : planned}
          desiredStyle={begin.mode === 'style' ? begin.aesthetic : ''}
          manualTemperature={manualTemperature}
          onChanged={onChanged}
          onAvailabilityChange={onAvailabilityChange}
          onShowSaved={onShowSaved}
          editing={editing}
          onCreateNew={onCreateNew}
        />
      )}
    </div>
  )
}
