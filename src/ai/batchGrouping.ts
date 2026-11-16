import { findComposition, findSize } from './labelParser'
import type { TextLine } from './textReader'

// Many photos at once: which ones show the same garment (front, back, a detail) and which one is its label.
// Measured on the user's photos, whole-photo similarity cannot tell garments apart (two hoodies shot the same way
// score 0.95, two photos of one garment 0.22), so the signals are when the photo was taken, the garment type and
// its colour, and the text a label has. Mistakes are fixed in the review with «Unir» and «Separar».

/** Photos of one garment are taken a few seconds apart; changing garment takes longer. */
export const SAME_GARMENT_SECONDS = 40

const LABEL_WORDS = /MADE IN|HECHO EN|FABRI[CQ]|COTTON|ALGOD|POLYEST|POLIEST|VISCOS|ELAST|WASH|LAVAR|LAVADO|SIZE|TALLA|TAILLE|RN ?\d|CA ?\d|%/

/**
 * A close-up of a label: its composition can be read, or there are label words (made in, wash, size…) with more
 * text or a size. The amount of text alone says nothing: a printed sweatshirt can carry eight lines of it.
 */
export function isLabelPhoto(lines: TextLine[]): boolean {
  const confident = lines.filter((line) => line.score >= 0.7 && line.text.trim().length >= 2)
  if (findComposition(lines)) return true
  const labelLike = confident.filter((line) => LABEL_WORDS.test(line.text.toLocaleUpperCase('es'))).length
  return labelLike >= 1 && (confident.length >= 3 || Boolean(findSize(lines)))
}

export interface PhotoFacts {
  id: string
  category: string
  colors: string[]
  /** Capture time in milliseconds (EXIF), when the photo has it. */
  time?: number
  label: boolean
}

export interface PhotoGroup {
  /** Garment photos, the first is the main one. */
  photoIds: string[]
  /** Label photos; the first is kept as the garment's label photo, all are read. */
  labelIds: string[]
  category: string
  colors: string[]
  /** Time of the last photo added, to compare with the next. */
  lastTime?: number
}

function closeInTime(group: PhotoGroup, photo: PhotoFacts): boolean {
  return group.lastTime !== undefined && photo.time !== undefined && Math.abs(photo.time - group.lastTime) <= SAME_GARMENT_SECONDS * 1000
}

/** Another photo of the last garment: taken just after it, same type and sharing one of its main colours. */
export function continuesGroup(group: PhotoGroup, photo: PhotoFacts): boolean {
  if (!group.photoIds.length || !closeInTime(group, photo) || group.category !== photo.category) return false
  const main = group.colors.slice(0, 2)
  return photo.colors.slice(0, 2).some((color) => main.includes(color))
}

/**
 * Adds a photo, in the order they were chosen, to the groups so far (a new array; groups are not changed in place).
 * A label goes with the garment before it when taken right after (or when the photos have no time), else it waits
 * for the next garment.
 */
export function addPhoto(groups: PhotoGroup[], photo: PhotoFacts): PhotoGroup[] {
  const last = groups.at(-1)
  const time = photo.time ?? last?.lastTime
  if (photo.label) {
    if (last && (last.photoIds.length === 0 || photo.time === undefined || last.lastTime === undefined || closeInTime(last, photo))) {
      return [...groups.slice(0, -1), { ...last, labelIds: [...last.labelIds, photo.id], ...(time !== undefined ? { lastTime: time } : {}) }]
    }
    return [...groups, { photoIds: [], labelIds: [photo.id], category: '', colors: [], ...(photo.time !== undefined ? { lastTime: photo.time } : {}) }]
  }
  // A label taken first is waiting for its garment.
  if (last && !last.photoIds.length) {
    return [...groups.slice(0, -1), { ...last, photoIds: [photo.id], category: photo.category, colors: photo.colors, ...(time !== undefined ? { lastTime: time } : {}) }]
  }
  if (last && continuesGroup(last, photo)) {
    return [...groups.slice(0, -1), { ...last, photoIds: [...last.photoIds, photo.id], ...(photo.time !== undefined ? { lastTime: photo.time } : {}) }]
  }
  return [...groups, { photoIds: [photo.id], labelIds: [], category: photo.category, colors: photo.colors, ...(photo.time !== undefined ? { lastTime: photo.time } : {}) }]
}
