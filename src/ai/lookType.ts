import { taxonomy } from '../ml/taxonomy'
import type { GarmentCategory } from '../types/domain'
import type { ClothingAnalysisSuggestion } from './clothingAnalyzer'

const categoryLabel = new Map(taxonomy.categories.map((entry) => [entry.id as string, entry.label as GarmentCategory]))

/**
 * The type of a garment cut out of a full-body photo. The category is the one of the region it was cut from (named
 * with the person's pose, bodyRules.bodyClass): measured on 50 looks it was right 66 % of the time, recognising the
 * cut-out alone 57 % (a coat or a top alone, without the body, looks like an accessory). The subcategory is the
 * classifier's best within that category, or none.
 */
export function lookType(regionClassId: string, suggestion: Pick<ClothingAnalysisSuggestion, 'category' | 'subcategory' | 'alternatives'>): { category: GarmentCategory; subcategory: string } {
  const category = categoryLabel.get(regionClassId)
  if (!category || category === suggestion.category) return { category: suggestion.category, subcategory: suggestion.subcategory }
  const within = suggestion.alternatives.find((entry) => entry.category === category)
  return { category, subcategory: within?.subcategory ?? '' }
}
