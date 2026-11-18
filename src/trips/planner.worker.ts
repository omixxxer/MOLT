// Plans trips off the main thread: a 14-day trip takes about a second on a laptop and several on a slow phone, and
// the screen must keep responding meanwhile. Only data travels (garments without photos, the days, the history).
import { nextOutfitForDay, planDays } from './packingPlan'
import type { PlannerRequest, PlannerResponse } from './plannerClient'

const scope = self as unknown as { onmessage: ((event: MessageEvent<PlannerRequest>) => void) | null; postMessage: (message: PlannerResponse) => void }

scope.onmessage = (event) => {
  const request = event.data
  try {
    const result = request.kind === 'plan'
      ? planDays(request.garments, request.days, request.style, request.options)
      : nextOutfitForDay(request.garments, request.days, request.index, request.style, request.seen, request.options)?.garments.map((garment) => garment.id)
    scope.postMessage({ id: request.id, result })
  } catch (error) {
    scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
}
