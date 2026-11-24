import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'

export interface FirstStep {
  title: string
  detail: string
  done: boolean
  action?: { label: string; run: () => void }
}

interface FirstStepsProps {
  steps: FirstStep[]
  onHide: () => void
  /** Under the steps while they are not finished (the example wardrobe). */
  footer?: ReactNode
}

/** The first steps with Molt, ticked off as they are really done; the next one is the only one open. */
export default function FirstSteps({ steps, onHide, footer }: FirstStepsProps) {
  const done = steps.filter((step) => step.done).length
  const next = steps.findIndex((step) => !step.done)
  const finished = next === -1

  return (
    <section className="first-steps" aria-labelledby="first-steps-title">
      <header className="first-steps-header">
        <div>
          <h2 id="first-steps-title">Primeros pasos</h2>
          <p>{done} de {steps.length} hechos</p>
        </div>
        {!finished && <button type="button" className="studio-link" onClick={onHide}>Ocultar</button>}
      </header>
      <div className="first-steps-bar" role="progressbar" aria-label="Primeros pasos hechos" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title} className={step.done ? 'done' : index === next ? 'current' : undefined} aria-current={index === next ? 'step' : undefined}>
            <span className="first-steps-mark" aria-hidden="true">{step.done ? <HugeiconsIcon icon={Tick02Icon} size={14} /> : index + 1}</span>
            <div>
              <h3>{step.title}{step.done && <span className="visually-hidden"> (hecho)</span>}</h3>
              {index === next && <p>{step.detail}</p>}
              {index === next && step.action && <button type="button" className="button button-dark" onClick={step.action.run}>{step.action.label}</button>}
            </div>
          </li>
        ))}
      </ol>
      {!finished && footer && <div className="first-steps-footer">{footer}</div>}
      {finished && (
        <div className="first-steps-done" role="status">
          <p><strong>¡Listo!</strong> Ya sabes lo básico. Cuanto más apuntes lo que llevas, mejor te conocerá Molt.</p>
          <button type="button" className="button button-dark" onClick={onHide}>Cerrar</button>
        </div>
      )}
    </section>
  )
}
