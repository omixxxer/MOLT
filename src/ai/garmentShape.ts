import type { GarmentCategory } from '../types/domain'

/**
 * Shorts told apart by their shape. The classifier often calls denim shorts «Vaqueros» (it learnt the fabric better
 * than the length), and «Vaqueros» are worn in winter. A cut-out is cropped to the garment, so its proportions say
 * how long it is: long trousers are two or three times as tall as they are wide, laid flat or worn; shorts about as
 * tall as wide. Below `SHORTS_MAX_RATIO`, a long bottom is «Pantalón corto». Measured on a real wardrobe: denim
 * shorts 1.12, shorts 0.88; long trousers 1.5 to 2.6, but wide ones laid flat with the legs apart as low as 1.33, so
 * the line is kept below that (long bermudas may stay «Vaqueros»: better than calling long trousers shorts).
 */
export const SHORTS_MAX_RATIO = 1.2
export const SHORTS_LABEL = 'Pantalón corto'
/** The bottoms that are long; a skirt or tights are left alone. */
const LONG_BOTTOMS = new Set(['Pantalón', 'Vaqueros', 'Pantalón de chándal', 'Leggings'])

/** The subcategory the shape says, when it says another: «Pantalón corto» for a short cut-out of long trousers. */
export function subcategoryFromShape(category: GarmentCategory | string, subcategory: string, width: number | undefined, height: number | undefined): string | undefined {
  if (category !== 'Parte inferior' || !LONG_BOTTOMS.has(subcategory) || !width || !height) return undefined
  return height / width < SHORTS_MAX_RATIO ? SHORTS_LABEL : undefined
}
