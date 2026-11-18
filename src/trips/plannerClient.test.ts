// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Garment, GarmentRole, TripDay } from '../types/domain'
import { nextOutfitForDay, planDays } from './packingPlan'
import type { PlannerRequest, PlannerResponse } from './plannerClient'

function garment(id: string, role: GarmentRole): Garment {
  return {
    id, name: id, category: 'Parte superior', subcategory: '', colors: ['Azul'], seasons: [], styles: [], dressLevels: ['Diario'], role,
    width: 1, height: 1, confirmedAttributes: [], suggestedAttributes: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const wardrobe = [garment('t1', 'Top'), garment('t2', 'Top'), garment('b1', 'Bottom'), garment('s1', 'Calzado')]
const days: TripDay[] = ['2026-12-01', '2026-12-02', '2026-12-03'].map((date) => ({
  date, occasion: 'Diario', garmentIds: [], weather: { date, temperatureCelsius: 15, high: 18, low: 11, conditions: ['nuboso'], source: 'forecast' }
}))

/** A worker that answers like planner.worker.ts, later and in its own order, as a real one may. */
class FakeWorker {
  static created = 0
  onmessage: ((event: MessageEvent<PlannerResponse>) => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null
  constructor() { FakeWorker.created += 1 }
  postMessage(request: PlannerRequest) {
    const cloned = structuredClone(request)
    const result = cloned.kind === 'plan'
      ? planDays(cloned.garments, cloned.days, cloned.style, cloned.options)
      : nextOutfitForDay(cloned.garments, cloned.days, cloned.index, cloned.style, cloned.seen, cloned.options)?.garments.map((item) => item.id)
    setTimeout(() => this.onmessage?.({ data: { id: cloned.id, result } } as MessageEvent<PlannerResponse>), cloned.kind === 'plan' ? 20 : 5)
  }
  terminate() {}
}

/** A worker whose script cannot load. */
class BrokenWorker extends FakeWorker {
  override postMessage() {
    setTimeout(() => this.onerror?.({ preventDefault() {} }), 5)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeWorker.created = 0
})

describe('trip planner client', () => {
  it('plans in the worker and gives each caller its own answer, whatever order they come back in', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { nextOutfitInBackground, planDaysInBackground } = await import('./plannerClient')
    const [plan, next] = await Promise.all([
      planDaysInBackground(wardrobe, days, 'balanced'),
      nextOutfitInBackground(wardrobe, days, 0, 'balanced', new Set())
    ])
    expect(plan).toEqual(planDays(wardrobe, days, 'balanced'))
    expect(next).toEqual(nextOutfitForDay(wardrobe, days, 0, 'balanced', new Set())?.garments.map((item) => item.id))
    // One worker for every request.
    expect(FakeWorker.created).toBe(1)
  })

  it('plans here when there are no workers, with the same result', async () => {
    vi.stubGlobal('Worker', undefined)
    const { planDaysInBackground } = await import('./plannerClient')
    expect(await planDaysInBackground(wardrobe, days, 'light')).toEqual(planDays(wardrobe, days, 'light'))
  })

  it('falls back to planning here when the worker cannot start, and does not try it again', async () => {
    vi.stubGlobal('Worker', BrokenWorker)
    const { nextOutfitInBackground, planDaysInBackground } = await import('./plannerClient')
    expect(await planDaysInBackground(wardrobe, days, 'roomy')).toEqual(planDays(wardrobe, days, 'roomy'))
    const seen = new Set([[...planDays(wardrobe, days, 'roomy')[0]!.garmentIds].sort().join('|')])
    expect(await nextOutfitInBackground(wardrobe, days, 0, 'roomy', seen)).toEqual(nextOutfitForDay(wardrobe, days, 0, 'roomy', seen)?.garments.map((item) => item.id))
    expect(FakeWorker.created).toBe(1)
  })
})
