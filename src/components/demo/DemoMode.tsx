import { useState } from 'react'
import { PlayCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { isDemo, startDemo } from '../../demo/demoMode'

/** One name, and one icon, wherever the tour is offered. */
export const TOUR_LABEL = 'Ver un recorrido (1 min)'

interface DemoButtonProps {
  className?: string
}

/**
 * «Ver cómo funciona»: a guided tour over an example wardrobe kept apart from the real one, to see Molt before adding
 * clothes. In the example itself the banner offers the tour again.
 */
export function DemoButton({ className = 'button button-outline' }: DemoButtonProps) {
  const [error, setError] = useState('')
  const [preparing, setPreparing] = useState(false)
  if (isDemo()) return null
  return (
    <>
      <button
        type="button"
        className={`${className} tour-button`}
        disabled={preparing}
        onClick={() => {
          setPreparing(true)
          // A frame first, so «Preparando el ejemplo…» is seen before the app loads again.
          requestAnimationFrame(() => {
            if (startDemo(undefined, { tour: true })) return
            setPreparing(false)
            setError('Este navegador no permite abrir el ejemplo aparte de tu armario.')
          })
        }}
      >
        <HugeiconsIcon icon={PlayCircleIcon} size={16} aria-hidden="true" />
        {preparing ? 'Preparando el ejemplo…' : TOUR_LABEL}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  )
}

interface DemoBannerProps {
  onLeave: () => void
  leaving: boolean
  /** Starts the tour again; none while it is open. */
  onTour?: () => void
}

/** Always on screen in the example: what it is, that the real wardrobe is untouched, and the way out. */
export function DemoBanner({ onLeave, leaving, onTour }: DemoBannerProps) {
  return (
    <div className="demo-banner" role="region" aria-label="Armario de ejemplo">
      <p><strong>Armario de ejemplo.</strong> <span>Prendas de muestra con fotos reales y un viaje de ejemplo. Tu armario real no se abre ni se cambia.</span></p>
      <div className="demo-banner-actions">
        {onTour && <button type="button" className="button button-outline tour-button" onClick={onTour}><HugeiconsIcon icon={PlayCircleIcon} size={16} aria-hidden="true" />Repetir el recorrido</button>}
        <button type="button" className="button button-dark" onClick={onLeave} disabled={leaving}>{leaving ? 'Saliendo…' : 'Salir del ejemplo'}</button>
      </div>
    </div>
  )
}

interface DemoAddNoticeProps {
  onLeave: () => void
}

/** Adding garments in the example would lose them on leaving it: they are added to the real wardrobe instead. */
export function DemoAddNotice({ onLeave }: DemoAddNoticeProps) {
  return (
    <section className="empty-state">
      <div className="empty-mark" aria-hidden="true">✳</div>
      <h2>En el ejemplo no se añaden prendas.</h2>
      <p>Lo que añadieras aquí se borraría al salir. Sal del ejemplo para empezar tu armario con tus fotos.</p>
      <button className="button button-dark" type="button" onClick={onLeave}>Salir y añadir las mías</button>
    </section>
  )
}
