import { categoryIdForLabel } from '../ml/taxonomy'
import type { GarmentCategory } from '../types/domain'
import type { LookOptions } from './cutout'

/**
 * How the app cuts out one garment (the form, «Varias prendas» and «Mejorar los recortes»): today's cut-out, then
 * a second pass of SlimSAM guided by the segmentation map that takes out what has the colours around it (a
 * bedspread), and, when MediaPipe sees a person wearing it, only the garment of its type, without skin and hair.
 * Measured with bench/recut.html on 42 garments (21-11-2026). A product photo on a plain backdrop without a person
 * stays as before.
 */
export function appCutoutOptions(category?: GarmentCategory): LookOptions {
  return { refine: 'map', person: true, clean: 'skin', ...(category ? { focus: segmentationClassOf(categoryIdForLabel(category)) } : {}) }
}

/** The segmentation head's class for a category: jewellery is too small for its grid and is learnt as accessories. */
export function segmentationClassOf(categoryId: string) {
  return categoryId === 'jewellery' ? 'accessory' : categoryId
}
