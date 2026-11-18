import type { OutfitGenerationOptions } from '../outfits/outfitGenerator'
import type { Garment, PackingStyle, TripDay } from '../types/domain'
import { nextOutfitForDay, planDays } from './packingPlan'

// The trip planner in a worker (planner.worker.ts), so planning a long trip never freezes the screen. Where there
// are no workers (tests) or the worker fails to start, it runs here, as before.

export type PlannerRequest =
  | { id: number; kind: 'plan'; garments: Garment[]; days: TripDay[]; style: PackingStyle; options: OutfitGenerationOptions }
  | { id: number; kind: 'next'; garments: Garment[]; days: TripDay[]; index: number; style: PackingStyle; seen: Set<string>; options: OutfitGenerationOptions }

export type PlannerResponse = { id: number; result?: TripDay[] | string[]; error?: string }

/** A request before it gets its id (Omit over each member of the union). */
type Unsent = PlannerRequest extends infer Request ? Request extends unknown ? Omit<Request, 'id'> : never : never

type Pending = { resolve: (value: PlannerResponse['result']) => void; reject: (error: Error) => void }

let worker: Worker | undefined
let broken = false
let nextId = 1
const pending = new Map<number, Pending>()

function startWorker(): Worker | undefined {
  if (broken || typeof Worker === 'undefined') return undefined
  if (worker) return worker
  try {
    worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    broken = true
    return undefined
  }
  worker.onmessage = (event: MessageEvent<PlannerResponse>) => {
    const waiting = pending.get(event.data.id)
    if (!waiting) return
    pending.delete(event.data.id)
    if (event.data.error) waiting.reject(new Error(event.data.error))
    else waiting.resolve(event.data.result)
  }
  // A worker that cannot load (an old browser, a blocked script): everything waiting runs here instead.
  worker.onerror = (event) => {
    event.preventDefault()
    broken = true
    worker?.terminate()
    worker = undefined
    const waiting = [...pending.values()]
    pending.clear()
    for (const entry of waiting) entry.reject(new Error('worker unavailable'))
  }
  return worker
}

function inWorker<T extends PlannerResponse['result']>(request: Unsent, here: () => T): Promise<T> {
  const target = startWorker()
  if (!target) return Promise.resolve().then(here)
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as Pending['resolve'], reject })
    target.postMessage({ ...request, id })
  }).catch((error: Error) => {
    if (error.message === 'worker unavailable') return here()
    throw error
  })
}

/** planDays, off the main thread. */
export function planDaysInBackground(garments: Garment[], days: TripDay[], style: PackingStyle, options: OutfitGenerationOptions = {}): Promise<TripDay[]> {
  return inWorker({ kind: 'plan', garments, days, style, options }, () => planDays(garments, days, style, options))
}

/** The garments (ids) of nextOutfitForDay, off the main thread; undefined when there are no other outfits. */
export function nextOutfitInBackground(garments: Garment[], days: TripDay[], index: number, style: PackingStyle, seen: Set<string>, options: OutfitGenerationOptions = {}): Promise<string[] | undefined> {
  return inWorker({ kind: 'next', garments, days, index, style, seen, options }, () => nextOutfitForDay(garments, days, index, style, seen, options)?.garments.map((garment) => garment.id))
}
