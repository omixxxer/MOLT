import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { dragCrop, editPhoto, fitAspect, FULL_CROP, isFullCrop, rotatedSize, turn, type Aspect, type Crop, type Handle, type Rotation } from './photoEdit'

interface PhotoEditorProps {
  photo: Blob
  /** The photo turned and cropped; not called when nothing changed. */
  onApply: (edited: Blob) => void
  onCancel: () => void
}

const aspects: Array<{ label: string; value: Aspect }> = [
  { label: 'Libre', value: undefined },
  { label: '4:5', value: 4 / 5 },
  { label: 'Cuadrado', value: 1 }
]

const corners: Handle[] = ['nw', 'ne', 'sw', 'se']
const edges: Handle[] = ['n', 's', 'e', 'w']

/** Side of the preview drawn on screen; the edit itself is made on the full photo. */
const PREVIEW_SIDE = 1000

/**
 * Turning and cropping one photo of the garment before Molt analyses it: a frame dragged by its corners and edges (or
 * moved as a whole, also with the arrow keys; Shift makes it larger or smaller), with the part left out darkened.
 */
export default function PhotoEditor({ photo, onApply, onCancel }: PhotoEditorProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState({ width: 0, height: 0 })
  const firstButton = useRef<HTMLButtonElement>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap>()
  const [failed, setFailed] = useState(false)
  const [rotation, setRotation] = useState<Rotation>(0)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [aspect, setAspect] = useState<Aspect>()
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ handle: Handle; start: Crop; x: number; y: number; pointer: number } | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let opened: ImageBitmap | undefined
    // Inside the promise: where createImageBitmap is missing, the editor says it cannot open the photo.
    void Promise.resolve()
      .then(() => createImageBitmap(photo, { imageOrientation: 'from-image' }))
      .then((image) => { opened = image; if (cancelled) image.close(); else setBitmap(image) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; opened?.close() }
  }, [photo])

  const turned = bitmap ? rotatedSize(bitmap.width, bitmap.height, rotation) : { width: 4, height: 5 }

  // The preview, drawn again when the photo turns.
  useEffect(() => {
    const element = canvas.current
    if (!element || !bitmap) return
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(turned.width, turned.height))
    element.width = Math.max(1, Math.round(turned.width * scale))
    element.height = Math.max(1, Math.round(turned.height * scale))
    const context = element.getContext('2d')
    if (!context) return
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.translate(turned.width / 2, turned.height / 2)
    context.rotate(rotation * Math.PI / 180)
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  }, [bitmap, rotation, turned.width, turned.height])

  // The room the preview has (the area's width and a height limit), to fit the photo whole, landscape or portrait.
  useEffect(() => {
    const element = area.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      // As tall as the window allows, a little less on a phone, where the buttons below need the room.
      const height = window.innerWidth <= 560 ? Math.min(460, window.innerHeight * 0.52) : Math.min(560, window.innerHeight * 0.58)
      setRoom({ width: Math.max(0, element.clientWidth - padding), height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [failed])

  // Escape cancels; caught first, so the form's panel underneath does not close with it.
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    firstButton.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      cancelRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  function rotate(by: 90 | -90) {
    const next = turn(rotation, by)
    setRotation(next)
    // The frame is in fractions of the turned photo: it starts again, keeping the chosen aspect.
    if (bitmap) {
      const size = rotatedSize(bitmap.width, bitmap.height, next)
      setCrop(fitAspect(FULL_CROP, aspect, size.width, size.height))
    }
  }

  function chooseAspect(value: Aspect) {
    setAspect(value)
    setCrop((current) => fitAspect(current, value, turned.width, turned.height))
  }

  function reset() {
    setRotation(0)
    setAspect(undefined)
    setCrop(FULL_CROP)
  }

  function startDrag(handle: Handle, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    drag.current = { handle, start: crop, x: event.clientX, y: event.clientY, pointer: event.pointerId }
  }

  function moveDrag(event: ReactPointerEvent) {
    const current = drag.current
    const box = stage.current?.getBoundingClientRect()
    if (!current || !box || current.pointer !== event.pointerId) return
    setCrop(dragCrop(current.start, current.handle, (event.clientX - current.x) / box.width, (event.clientY - current.y) / box.height, aspect, turned.width, turned.height))
  }

  function endDrag(event: ReactPointerEvent) {
    if (drag.current?.pointer === event.pointerId) drag.current = undefined
  }

  /** Arrows move the frame by 1 % of the photo; with Shift they make it larger or smaller from its bottom right corner. */
  function onFrameKey(event: ReactKeyboardEvent) {
    const step = 0.01
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setCrop((current) => dragCrop(current, event.shiftKey ? 'se' : 'move', move[0], move[1], aspect, turned.width, turned.height))
  }

  async function apply() {
    if (rotation === 0 && isFullCrop(crop)) {
      onCancel()
      return
    }
    setSaving(true)
    try {
      onApply(await editPhoto(photo, rotation, crop))
    } catch (error) {
      console.error('No se pudo editar la foto:', error)
      setFailed(true)
      setSaving(false)
    }
  }

  const percent = (value: number) => `${value * 100}%`
  // The largest size of the photo's shape that fits the room.
  const fit = Math.min(room.width / turned.width, room.height / turned.height)
  const stageSize = room.width > 0 && fit > 0 ? { width: turned.width * fit, height: turned.height * fit } : undefined
  const pixels = bitmap ? `${Math.round(crop.width * turned.width)} × ${Math.round(crop.height * turned.height)} px` : ''

  // Over everything, outside the form's panel (whose scrolling and transforms would hold a fixed layer).
  return createPortal(
    <div className="panel-backdrop photo-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div className="photo-editor" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title">
        <h2 id="photo-editor-title">Editar foto</h2>
        <p className="photo-editor-hint">Arrastra las esquinas para recortar la prenda y dejar fuera lo que sobra. Molt la analizará de nuevo.</p>
        {failed ? (
          <p className="alert" role="alert">No se pudo abrir o editar esta foto.</p>
        ) : (
          <div className="photo-editor-area" ref={area}>
            <div
              className="photo-editor-stage"
              ref={stage}
              style={stageSize ? { width: stageSize.width, height: stageSize.height } : { aspectRatio: `${turned.width} / ${turned.height}` }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <canvas ref={canvas} aria-hidden="true" />
              {/* What is left out, darkened in four bands, so the handles on the photo's edge stay whole. */}
              {bitmap && (
                <>
                  <span className="photo-editor-shade" style={{ left: 0, top: 0, right: 0, height: percent(crop.y) }} aria-hidden="true" />
                  <span className="photo-editor-shade" style={{ left: 0, top: percent(crop.y + crop.height), right: 0, bottom: 0 }} aria-hidden="true" />
                  <span className="photo-editor-shade" style={{ left: 0, top: percent(crop.y), width: percent(crop.x), height: percent(crop.height) }} aria-hidden="true" />
                  <span className="photo-editor-shade" style={{ left: percent(crop.x + crop.width), top: percent(crop.y), right: 0, height: percent(crop.height) }} aria-hidden="true" />
                </>
              )}
              {bitmap && (
                <div
                  className="photo-editor-frame"
                  style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.width), height: percent(crop.height) }}
                  tabIndex={0}
                  role="group"
                  aria-label={`Recorte de ${pixels}. Flechas para moverlo; Mayúsculas y flechas para cambiar su tamaño.`}
                  onPointerDown={(event) => startDrag('move', event)}
                  onKeyDown={onFrameKey}
                >
                  {[...corners, ...(aspect ? [] : edges)].map((handle) => (
                    <span key={handle} className={`photo-editor-handle photo-editor-handle-${handle}`} onPointerDown={(event) => startDrag(handle, event)} aria-hidden="true" />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="photo-editor-tools">
          <div className="photo-editor-group" role="group" aria-label="Girar">
            <button ref={firstButton} type="button" className="photo-stage-pill" onClick={() => rotate(-90)} disabled={!bitmap || saving}>↺ Girar</button>
            <button type="button" className="photo-stage-pill" onClick={() => rotate(90)} disabled={!bitmap || saving}>↻ Girar</button>
          </div>
          <div className="photo-editor-group" role="group" aria-label="Proporción del recorte">
            {aspects.map((option) => (
              <button key={option.label} type="button" className="photo-stage-pill" aria-pressed={aspect === option.value} onClick={() => chooseAspect(option.value)} disabled={!bitmap || saving}>{option.label}</button>
            ))}
          </div>
          <span className="photo-editor-size">{pixels}</span>
        </div>
        <div className="photo-editor-actions">
          <button type="button" className="button button-outline" onClick={reset} disabled={!bitmap || saving || (rotation === 0 && isFullCrop(crop) && !aspect)}>Restablecer</button>
          <span />
          <button type="button" className="button button-outline" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button type="button" className="button button-dark" onClick={() => void apply()} disabled={!bitmap || saving}>{saving ? 'Aplicando…' : 'Aplicar'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
