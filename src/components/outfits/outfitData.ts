import { database } from '../../db/database'
import type { WearEvent } from '../../outfits/outfitGenerator'
import type { Outfit, OutfitFeedback, UserPreferences } from '../../types/domain'

/** What the outfit screens read from the local database: the user's outfits, and what teaches the generator. */
export interface OutfitData {
  outfits: Outfit[]
  feedback: OutfitFeedback[]
  preferences: UserPreferences
  wear: WearEvent[]
}

export const emptyPreferences: UserPreferences = {
  id: 'current',
  preferredColors: [],
  preferredStyles: [],
  feedbackWeights: {},
  updatedAt: ''
}

export const emptyOutfitData: OutfitData = { outfits: [], feedback: [], preferences: emptyPreferences, wear: [] }

export async function loadOutfitData(): Promise<OutfitData> {
  await database.open()
  const [outfits, feedback, preferences] = await Promise.all([
    database.outfits.orderBy('createdAt').reverse().toArray(),
    database.outfitFeedback.orderBy('createdAt').reverse().limit(400).toArray(),
    database.preferences.get('current')
  ])
  // Every wearing is a feedback event; an outfit's wornAt adds the ones recorded without it, such as «Desde un look».
  const logged = feedback.filter((event) => event.type === 'worn').map((event) => ({ garmentIds: event.garmentIds, at: event.createdAt }))
  const stamped = outfits.filter((outfit) => outfit.wornAt).map((outfit) => ({ garmentIds: outfit.garmentIds, at: outfit.wornAt! }))
  return { outfits, feedback, preferences: preferences ?? emptyPreferences, wear: [...logged, ...stamped] }
}
