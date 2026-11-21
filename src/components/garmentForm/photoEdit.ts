// Basic editing of a garment photo before it is analysed: turned in steps of 90° and cropped to a frame (free, 4:5 like
// the wardrobe cards, or square). The frame is kept as fractions of the turned photo, so the preview and the full
// size photo share it. PhotoEditor.tsx is the screen; this is the geometry and the drawing.

export type Rotation = 0 | 90 | 180 | 270

/** A frame in fractions (0–1) of the turned photo. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/** Width / height of the frame in pixels; undefined for a free frame. */
export type Aspect = number | undefined

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 }

/** The frame cannot be smaller than this share of the photo on either side. */
export const MIN_CROP = 0.08

/** Largest side of the edited photo; it is reduced again to 2048 px when saved. */
const MAX_EDGE = 4096

export function rotatedSize(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

export function turn(rotation: Rotation, by: 90 | -90): Rotation {
  return (((rotation + by) % 360 + 360) % 360) as Rotation
}

export function isFullCrop(crop: Crop): boolean {
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.width >= 0.999 && crop.height >= 0.999
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * The largest frame of `aspect` (pixels, on an image of imageWidth × imageHeight) that fits in the photo, centred on
 * the current frame's centre and moved inside if needed; the frame as it is for a free aspect.
 */
export function fitAspect(crop: Crop, aspect: Aspect, imageWidth: number, imageHeight: number): Crop {
  if (!aspect) return crop
  // In fractions, the frame's width / height must be aspect × imageHeight / imageWidth.
  const ratio = aspect * imageHeight / imageWidth
  let width = Math.min(1, crop.width, crop.height * ratio)
  let height = width / ratio
  if (height > 1) {
    height = 1
    width = ratio
  }
  // Not smaller than the frame allows, keeping the aspect.
  if (width < MIN_CROP || height < MIN_CROP) {
    const grow = Math.max(MIN_CROP / width, MIN_CROP / height)
    width = Math.min(1, width * grow)
    height = Math.min(1, height * grow)
  }
  const centreX = crop.x + crop.width / 2
  const centreY = crop.y + crop.height / 2
  return { x: clamp(centreX - width / 2, 0, 1 - width), y: clamp(centreY - height / 2, 0, 1 - height), width, height }
}

/**
 * The frame after dragging one of its handles (or the whole frame, 'move') by dx, dy (fractions of the photo), kept
 * inside the photo and not smaller than MIN_CROP. With an aspect, the corners keep it and the edges are not used.
 */
export function dragCrop(start: Crop, handle: Handle, dx: number, dy: number, aspect: Aspect, imageWidth: number, imageHeight: number): Crop {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP)
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, 1)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, 1)
  if (!aspect || handle.length !== 2) return { x: left, y: top, width: right - left, height: bottom - top }

  // A corner with an aspect: the width decides, the height follows, from the opposite corner, which stays.
  const ratio = aspect * imageHeight / imageWidth
  const anchorX = handle.includes('w') ? start.x + start.width : start.x
  const anchorY = handle.includes('n') ? start.y + start.height : start.y
  const room = {
    width: handle.includes('w') ? anchorX : 1 - anchorX,
    height: handle.includes('n') ? anchorY : 1 - anchorY
  }
  let width = Math.max(right - left, MIN_CROP)
  width = Math.min(width, room.width, room.height * ratio)
  let height = width / ratio
  if (height < MIN_CROP) {
    height = Math.min(MIN_CROP, room.height)
    width = height * ratio
  }
  return {
    x: handle.includes('w') ? anchorX - width : anchorX,
    y: handle.includes('n') ? anchorY - height : anchorY,
    width,
    height
  }
}

/** The format the edited photo is written in: a product photo with transparency stays transparent. */
function outputType(type: string) {
  return type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg'
}

/** The photo turned and cropped to the frame, at full size (4096 px at most). */
export async function editPhoto(photo: Blob, rotation: Rotation, crop: Crop): Promise<Blob> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  try {
    const turned = rotatedSize(bitmap.width, bitmap.height, rotation)
    const source = {
      x: Math.round(crop.x * turned.width),
      y: Math.round(crop.y * turned.height),
      width: Math.max(1, Math.round(crop.width * turned.width)),
      height: Math.max(1, Math.round(crop.height * turned.height))
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(source.width * scale))
    canvas.height = Math.max(1, Math.round(source.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no permite editar la foto.')
    // The turned photo is drawn so that the frame's corner lands at the canvas's origin.
    context.scale(scale, scale)
    context.translate(-source.x, -source.y)
    context.translate(turned.width / 2, turned.height / 2)
    context.rotate(rotation * Math.PI / 180)
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
    const type = outputType(photo.type)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92))
    if (!blob) throw new Error('No se pudo guardar la foto editada.')
    return blob
  } finally {
    bitmap.close()
  }
}
