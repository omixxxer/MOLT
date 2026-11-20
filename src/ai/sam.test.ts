import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SamRequest } from './sam.worker'

vi.mock('./onnxRuntime', () => ({
  fetchModelFile: vi.fn(async () => new ArrayBuffer(8)),
  loadOrt: vi.fn(async () => { throw new Error('the shared runtime should not be used') })
}))

/** Answers like sam.worker.ts, without models; `failNext` makes the next decoding fail. */
class FakeWorker {
  static created: FakeWorker[] = []
  static failNext = false
  terminated = false
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { preventDefault(): void }) => void) | null = null

  constructor() {
    FakeWorker.created.push(this)
  }

  postMessage(request: SamRequest) {
    queueMicrotask(() => {
      if (this.terminated) return
      if (request.kind === 'decode' && FakeWorker.failNext) {
        FakeWorker.failNext = false
        this.onmessage?.({ data: { id: request.id, error: 'boom' } })
        return
      }
      const result = request.kind === 'decode'
        ? { scores: new Float32Array([0.9, 0.5, 0.1]), masks: new Float32Array(3 * 256 * 256) }
        : null
      this.onmessage?.({ data: { id: request.id, result } })
    })
  }

  terminate() {
    this.terminated = true
  }
}

const encoded = {
  width: 10,
  height: 10,
  scale: 1,
  embeddings: { data: new Float32Array(4), dims: [1, 4] },
  positions: { data: new Float32Array(4), dims: [1, 4] }
}
const prompt = { points: [[5, 5]] as Array<[number, number]>, labels: [1] }

async function loadSam() {
  vi.resetModules()
  return import('./sam')
}

describe('SlimSAM in a worker of its own', () => {
  beforeEach(() => {
    FakeWorker.created = []
    FakeWorker.failNext = false
    vi.stubGlobal('Worker', FakeWorker)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps one worker during a cut-out and ends it a while after the last one', async () => {
    const { outline, withSam, SAM_IDLE_MS } = await loadSam()
    const outlines = await withSam(async () => [await outline(encoded, prompt), await outline(encoded, prompt)])
    expect(outlines[0]).toHaveLength(3)
    expect(outlines[0]![0]!.score).toBeCloseTo(0.9)
    expect(FakeWorker.created).toHaveLength(1)
    expect(FakeWorker.created[0]!.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(SAM_IDLE_MS)
    expect(FakeWorker.created[0]!.terminated).toBe(true)
  })

  it('reuses the worker for a cut-out that starts before it is ended, and starts a new one after', async () => {
    const { outline, withSam, SAM_IDLE_MS } = await loadSam()
    await withSam(() => outline(encoded, prompt))
    await vi.advanceTimersByTimeAsync(SAM_IDLE_MS / 2)
    await withSam(() => outline(encoded, prompt))
    expect(FakeWorker.created).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(SAM_IDLE_MS / 2)
    expect(FakeWorker.created[0]!.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(SAM_IDLE_MS / 2)
    expect(FakeWorker.created[0]!.terminated).toBe(true)
    await withSam(() => outline(encoded, prompt), 0)
    expect(FakeWorker.created).toHaveLength(2)
    expect(FakeWorker.created[1]!.terminated).toBe(true)
  })

  it('ends a worker that fails, and the next cut-out gets a new one', async () => {
    const { outline, withSam } = await loadSam()
    FakeWorker.failNext = true
    await expect(withSam(() => outline(encoded, prompt))).rejects.toThrow('boom')
    expect(FakeWorker.created[0]!.terminated).toBe(true)
    await withSam(() => outline(encoded, prompt))
    expect(FakeWorker.created).toHaveLength(2)
  })

})
