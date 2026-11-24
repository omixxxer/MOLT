import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type TourPage = 'home' | 'wardrobe' | 'outfits' | 'history' | 'packing'

interface TourStep {
  page: TourPage
  /** What is pointed at on that screen; none, a card in the middle. */
  target?: string
  title: string
  text: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    page: 'wardrobe', target: '.garment-grid',
    title: 'Tu armario, con fotos',
    text: 'Haces una foto y Molt quita el fondo y reconoce el tipo de prenda y el color, aquí, en tu dispositivo. Tú solo lo revisas.'
  },
  {
    page: 'outfits', target: '.saved-outfits',
    title: 'Outfits con tu ropa',
    text: '«Crear outfit» te propone ideas según el plan y el tiempo. Eliges una, la ajustas y la guardas aquí, en «Mis outfits».'
  },
  {
    page: 'home', target: '.home-today',
    title: 'Qué ponerte hoy',
    text: 'Inicio te propone un outfit cada día. Con «Me lo pongo hoy» pasa al calendario, y Molt aprende de lo que eliges.'
  },
  {
    page: 'history', target: '.calendar',
    title: 'Lo que llevas, día a día',
    text: 'El historial te enseña qué te has puesto, qué prendas usas de verdad y cuáles tienes olvidadas.'
  },
  {
    page: 'packing', target: '.trip-cards',
    title: 'La maleta, hecha',
    text: 'Di a dónde vas y qué días: Molt mira el tiempo, propone un outfit para cada día y te da la lista para ir marcando.'
  },
  {
    page: 'home',
    title: 'Ahora, tu armario',
    text: 'Esto era un ejemplo: se borra al salir y tu armario real no se ha tocado. Empieza con unas pocas fotos de tu ropa.'
  }
]

interface GuidedTourProps {
  onNavigate: (page: TourPage) => void
  /** Leaves the example to add one's own garments. */
  onStart: () => void
  /** Closes the tour and stays in the example. */
  onClose: () => void
}

type Rect = { top: number; left: number; width: number; height: number }

const PADDING = 8
/** Room kept for the example's banner above and the navigation below. */
const TOP_CLEARANCE = 84
const BOTTOM_CLEARANCE = 100
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * A guided tour over the example wardrobe: each step opens a screen, lights up what it is about and tells it in a
 * sentence. It can be skipped at any moment; the last step leads to adding one's own garments.
 */
export default function GuidedTour({ onNavigate, onStart, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect>()
  const card = useRef<HTMLDivElement>(null)
  // Where the focus was before the tour took it (read while rendering, before the card is focused).
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const step = TOUR_STEPS[index]!
  const last = index === TOUR_STEPS.length - 1

  // Each step opens its screen; its target appears when the screen has loaded (the screens load on demand).
  useEffect(() => {
    onNavigate(step.page)
    setRect(undefined)
    if (!step.target) return
    let frame = 0
    let tries = 0
    let scrolled = false
    const measure = () => {
      const element = document.querySelector<HTMLElement>(step.target!)
      if (element) {
        const box = element.getBoundingClientRect()
        if (!scrolled) {
          scrolled = true
          // A tall element (the wardrobe) from where it starts, under the banner; a short one in the middle.
          const top = box.height > window.innerHeight * 0.5
            ? window.scrollY + box.top - TOP_CLEARANCE
            : window.scrollY + box.top - (window.innerHeight - box.height) / 2
          window.scrollTo?.({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' })
        }
        // Only what is on screen is lit up, between the banner and the navigation, and never more than half of it.
        const top = Math.max(box.top, TOP_CLEARANCE)
        // On a phone the card sits at the bottom: what is lit up ends above it.
        const floor = window.innerWidth < 700 ? window.innerHeight - 96 - (card.current?.offsetHeight ?? 240) - 16 : window.innerHeight - BOTTOM_CLEARANCE
        const bottom = Math.min(box.bottom, top + window.innerHeight * 0.5, floor)
        const next = { top, left: box.left, width: box.width, height: Math.max(0, bottom - top) }
        setRect((current) => current && Math.abs(current.top - next.top) < 1 && Math.abs(current.left - next.left) < 1 && Math.abs(current.height - next.height) < 1 && Math.abs(current.width - next.width) < 1
          ? current
          : next)
      } else if (++tries > 180) {
        return
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    card.current?.focus({ preventScroll: true })
  }, [index])

  // A real modal: the app behind cannot be reached (inert) while the tour is open, and the focus goes back to where
  // it was on closing it.
  useEffect(() => {
    const app = document.getElementById('root')
    app?.setAttribute('inert', '')
    const previous = opener.current
    return () => {
      app?.removeAttribute('inert')
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, next))), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') go(index + 1)
      else if (event.key === 'ArrowLeft') go(index - 1)
      else if (event.key === 'Tab') trapFocus(event, card.current)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, index, onClose])

  const spot = rect && { top: rect.top - PADDING, left: rect.left - PADDING, width: rect.width + PADDING * 2, height: rect.height + PADDING * 2 }
  // Beside what is lit up when there is room (below, or above), else at the bottom of the screen.
  const below = spot && window.innerHeight - (spot.top + spot.height) > 230
  const above = spot && !below && spot.top > 260
  const placement = !spot ? 'center' : window.innerWidth < 700 ? 'sheet' : below ? 'below' : above ? 'above' : 'sheet'
  const cardStyle = spot && placement === 'below' ? { top: spot.top + spot.height + 14, left: clampLeft(spot.left) }
    : spot && placement === 'above' ? { bottom: window.innerHeight - spot.top + 14, left: clampLeft(spot.left) }
      : undefined

  return createPortal(
    <div className="tour" data-placement={placement}>
      <div className={spot ? 'tour-spot' : 'tour-spot tour-spot-none'} style={spot ?? undefined} aria-hidden="true" />
      <div className="tour-card" ref={card} style={cardStyle} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabIndex={-1} key={index}>
        <header className="tour-card-head">
          <p className="tour-count">{index + 1} de {TOUR_STEPS.length}</p>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar el recorrido"><HugeiconsIcon icon={Cancel01Icon} size={15} /></button>
        </header>
        <div className="tour-dots" aria-hidden="true">{TOUR_STEPS.map((item, dot) => <span key={item.title} className={dot === index ? 'on' : dot < index ? 'done' : undefined} />)}</div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-text">{step.text}</p>
        <footer className="tour-nav">
          {last ? (
            <>
              <button type="button" className="button button-outline" onClick={onClose}>Seguir mirando</button>
              <button type="button" className="button button-dark" onClick={onStart}>Añadir mis prendas</button>
            </>
          ) : (
            <>
              {index > 0
                ? <button type="button" className="button button-outline" onClick={() => go(index - 1)}><HugeiconsIcon icon={ArrowLeft01Icon} size={15} />Anterior</button>
                : <button type="button" className="studio-link" onClick={onClose}>Saltar</button>}
              <button type="button" className="button button-dark" onClick={() => go(index + 1)}>Siguiente<HugeiconsIcon icon={ArrowRight01Icon} size={15} /></button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}

/** Tab and Shift+Tab go round the card's buttons and never leave it. */
function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const focusable = [...container.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
  if (!focusable.length) return
  // Always handled here, so the browser never takes the focus out of the card.
  event.preventDefault()
  const current = focusable.indexOf(document.activeElement as HTMLElement)
  const next = current === -1
    ? (event.shiftKey ? focusable.length - 1 : 0)
    : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length
  focusable[next]!.focus()
}

function clampLeft(left: number) {
  return Math.max(16, Math.min(left, window.innerWidth - 376))
}
