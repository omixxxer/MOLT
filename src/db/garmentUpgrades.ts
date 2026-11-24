import { subcategoryFromShape } from '../ai/garmentShape'
import { suggestUsage } from '../ai/usageRules'
import { taxonomy } from '../ml/taxonomy'
import type { Garment } from '../types/domain'

/** The subcategories that moved from «Accesorio» to «Joyería» in taxonomy v6. */
const JEWELLERY = new Set(taxonomy.subcategories.filter((entry) => entry.category === 'jewellery').map((entry) => entry.label))

/**
 * A garment saved before taxonomy v6, brought up to it (database version 9, and backups made before it):
 * - a watch, necklace, bracelet or earrings saved as «Accesorio» goes to «Joyería»;
 * - long trousers whose cut-out is short (denim shorts the classifier called «Vaqueros») become «Pantalón corto», with
 *   the seasons that go with it, unless the user chose the type (or the seasons) by hand.
 * Returns the garment changed, or undefined when nothing changes.
 */
export function upgradeGarmentToV6<T extends Garment>(garment: T): T | undefined {
  let changed: T | undefined
  if (garment.category === 'Accesorio' && JEWELLERY.has(garment.subcategory)) {
    changed = { ...garment, category: 'Joyería', role: 'Joya' }
  }
  const current = changed ?? garment
  // A garment in a backup carries its cut-out itself; one in the database says it has one.
  const hasCutout = current.hasCutout || Boolean((current as { cutout?: Blob }).cutout)
  const shorts = hasCutout && !current.confirmedAttributes.includes('subcategory')
    ? subcategoryFromShape(current.category, current.subcategory, current.width, current.height)
    : undefined
  if (shorts) {
    const seasonsByHand = current.confirmedAttributes.includes('seasons')
    changed = {
      ...current,
      subcategory: shorts,
      ...(seasonsByHand ? {} : { seasons: suggestUsage({ category: current.category, subcategory: shorts }).seasons })
    }
  }
  return changed
}
