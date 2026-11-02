import { database } from '../db/database'
import { createOutfitFeedback } from '../outfits/outfitGenerator'
import type { Outfit } from '../types/domain'
import { localDay, wearEntries, type WearEntry } from './wardrobeStats'

/** The whole history: unlike what teaches the generator, it is not limited to the latest events. */
export async function loadWearHistory() {
  await database.open()
  const [outfits, feedback] = await Promise.all([
    database.outfits.toArray(),
    database.outfitFeedback.where('type').equals('worn').toArray()
  ])
  return { outfits, entries: wearEntries(outfits, feedback) }
}

/** Records an outfit as worn on a day, today unless told otherwise; an earlier day keeps the outfit's latest date. */
export async function logWear(outfit: Outfit, day = localDay()) {
  const at = day === localDay() ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString()
  const wornAt = outfit.wornAt && outfit.wornAt > at ? outfit.wornAt : at
  await database.transaction('rw', database.outfits, database.outfitFeedback, async () => {
    await database.outfits.put({ ...outfit, wornAt })
    await database.outfitFeedback.add(createOutfitFeedback('worn', outfit.garmentIds, outfit.id, at))
  })
}

/** Takes a day out of the history, and each outfit with these garments goes back to its previous wearing. */
export async function removeWear(entry: WearEntry) {
  const sameGarments = (ids: string[]) => [...ids].sort().join('|') === [...entry.garmentIds].sort().join('|')
  await database.transaction('rw', database.outfits, database.outfitFeedback, async () => {
    const events = await database.outfitFeedback.where('type').equals('worn').toArray()
    const matching = events.filter((event) => sameGarments(event.garmentIds))
    await database.outfitFeedback.bulkDelete(matching.filter((event) => localDay(new Date(event.createdAt)) === entry.day).map((event) => event.id))
    const earlier = matching.filter((event) => localDay(new Date(event.createdAt)) !== entry.day).map((event) => event.createdAt).sort().at(-1)
    const outfits = (await database.outfits.toArray()).filter((outfit) => sameGarments(outfit.garmentIds) && outfit.wornAt && localDay(new Date(outfit.wornAt)) === entry.day)
    await database.outfits.bulkPut(outfits.map((outfit) => ({ ...outfit, wornAt: earlier })))
  })
}
