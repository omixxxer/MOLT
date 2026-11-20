import { createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useObjectUrl } from '../useObjectUrl'
import { mergeInto, movePhoto } from './batchQueue'

// Regrouping the review by dragging, with the pointer (mouse, pen or finger): a whole card onto another joins the
// two garments; one photo onto another card moves it there, onto a card's label strip makes it that garment's
// label, and onto «Nueva prenda» makes it a garment of its own. A mouse starts dragging after a few pixels; a
// finger after holding still for a moment, so scrolling the list still works. The buttons on each card do the same
// without dragging (and with the keyboard).

export type DragItem =
  | { kind: 'garment'; garmentId: string; image: Blob }
  | { kind: 'photo'; garmentId: string; photoId: string; image: Blob }

export interface DropTarget { garmentId?: string; zone: 'card' | 'label' | 'new' }

interface DragState { item: DragItem; x: number; y: number; over?: DropTarget }

interface CardDrag {
  dragging?: DragState
  /** Props for whatever starts a drag (a card's photo, a thumbnail). */
  handle: (item: DragItem, disabled?: boolean) => { onPointerDown: (event: ReactPointerEvent) => void; onDragStart: (event: DragEvent) => void }
}

const Context = createContext<CardDrag>({ handle: () => ({ onPointerDown: () => undefined, onDragStart: () => undefined }) })
export const useCardDrag = () => useContext(Context)

/** Mouse: pixels before a press becomes a drag. Finger: how long to hold still, and how far it may wander. */
const MOUSE_SLOP = 6
const HOLD_MS = 350
const TOUCH_SLOP = 10

/** Where the pointer is: the closest drop zone under it (data-drop-label, data-drop-garment or data-drop-new). */
export function targetAt(x: number, y: number): DropTarget | undefined {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-label], [data-drop-garment], [data-drop-new]')
  if (!element) return undefined
  if (element.hasAttribute('data-drop-new')) return { zone: 'new' }
  const garmentId = element.dataset.dropLabel ?? element.dataset.dropGarment
  return garmentId ? { garmentId, zone: element.hasAttribute('data-drop-label') ? 'label' : 'card' } : undefined
}

/** What a drop does; nothing when it lands where it came from or nowhere. */
export function dropItem(item: DragItem, target: DropTarget | undefined) {
  if (!target) return
  if (item.kind === 'garment') {
    if (target.garmentId && target.garmentId !== item.garmentId) mergeInto(item.garmentId, target.garmentId)
    return
  }
  if (target.zone === 'new') movePhoto(item.garmentId, item.photoId, 'new', 'photo')
  else if (target.garmentId) movePhoto(item.garmentId, item.photoId, target.garmentId, target.zone === 'label' ? 'label' : 'photo')
}

export function CardDragProvider({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState<DragState>()
  /** Ends the drag in progress (also when the screen goes away mid-drag). */
  const cleanup = useRef<(() => void) | undefined>(undefined)

  useEffect(() => () => cleanup.current?.(), [])

  const handle = useCallback((item: DragItem, disabled = false) => ({
    // The browser's own image dragging would take over the mouse.
    onDragStart: (event: DragEvent) => event.preventDefault(),
    onPointerDown: (event: ReactPointerEvent) => {
      if (disabled || event.button !== 0 || cleanup.current) return
      const pointerId = event.pointerId
      const touch = event.pointerType !== 'mouse'
      const startX = event.clientX
      const startY = event.clientY
      let active = false
      let holdTimer: ReturnType<typeof setTimeout> | undefined
      const begin = (x: number, y: number) => {
        active = true
        clearTimeout(holdTimer)
        setDragging({ item, x, y, over: targetAt(x, y) })
        if (touch) navigator.vibrate?.(15)
      }
      if (touch) holdTimer = setTimeout(() => begin(startX, startY), HOLD_MS)
      const move = (moved: PointerEvent) => {
        if (moved.pointerId !== pointerId) return
        const distance = Math.hypot(moved.clientX - startX, moved.clientY - startY)
        if (!active) {
          if (touch) {
            // The finger moved before the hold: it is scrolling, not dragging.
            if (distance > TOUCH_SLOP) end()
            return
          }
          if (distance < MOUSE_SLOP) return
          begin(moved.clientX, moved.clientY)
        }
        setDragging({ item, x: moved.clientX, y: moved.clientY, over: targetAt(moved.clientX, moved.clientY) })
      }
      // While a finger drags, the page must not scroll under it.
      const blockScroll = (touchMove: TouchEvent) => { if (active) touchMove.preventDefault() }
      // The click that ends a drag must not also press the button under the pointer.
      const swallowClick = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault() }
      const up = (released: PointerEvent) => {
        if (released.pointerId !== pointerId) return
        if (active) {
          dropItem(item, targetAt(released.clientX, released.clientY))
          window.addEventListener('click', swallowClick, { capture: true, once: true })
          setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0)
        }
        end()
      }
      const cancel = (cancelled: PointerEvent) => { if (cancelled.pointerId === pointerId) end() }
      const key = (pressed: KeyboardEvent) => { if (pressed.key === 'Escape') end() }
      function end() {
        clearTimeout(holdTimer)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('touchmove', blockScroll)
        window.removeEventListener('keydown', key)
        window.removeEventListener('contextmenu', noMenu)
        cleanup.current = undefined
        setDragging(undefined)
      }
      // A long press would otherwise open the browser's menu for the image.
      const noMenu = (menu: Event) => { if (touch) menu.preventDefault() }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      window.addEventListener('touchmove', blockScroll, { passive: false })
      window.addEventListener('keydown', key)
      window.addEventListener('contextmenu', noMenu)
      cleanup.current = end
    }
  }), [])

  return (
    <Context.Provider value={{ dragging, handle }}>
      {children}
      {dragging && <DragGhost state={dragging} />}
    </Context.Provider>
  )
}

function DragGhost({ state }: { state: DragState }) {
  const url = useObjectUrl(state.item.image)
  const what = state.item.kind === 'garment' ? 'la prenda' : 'la foto'
  const hint = !state.over
    ? `Suelta sobre otra prenda para mover ${what}`
    : state.over.zone === 'new'
      ? 'Soltar: será una prenda nueva'
      : state.over.garmentId === state.item.garmentId
        ? state.over.zone === 'label' && state.item.kind === 'photo' ? 'Soltar: será su etiqueta' : 'Es la misma prenda'
        : state.over.zone === 'label' && state.item.kind === 'photo' ? 'Soltar: será la etiqueta de esa prenda' : 'Soltar: se unirá a esa prenda'
  return (
    <div className="card-drag-ghost" style={{ transform: `translate(${state.x}px, ${state.y}px)` }} aria-hidden="true">
      {url && <img src={url} alt="" />}
      <span>{hint}</span>
    </div>
  )
}
