import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The "stuck" state lasts until the app reloads, so each test gets a fresh module.
async function load() {
  vi.resetModules()
  return import('./aiTimeout')
}

describe('withAiTimeout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns the result of a step that ends in time', async () => {
    const { withAiTimeout } = await load()
    await expect(withAiTimeout(async () => 'ok', 1000)).resolves.toBe('ok')
  })

  it('passes on the error of a failed step without blocking the next one', async () => {
    const { withAiTimeout } = await load()
    await expect(withAiTimeout(async () => { throw new Error('sin memoria') }, 1000)).rejects.toThrow('sin memoria')
    await expect(withAiTimeout(async () => 'ok', 1000)).resolves.toBe('ok')
  })

  it('gives up on a step that never ends and does not start later ones', async () => {
    const { withAiTimeout, AiTimeoutError } = await load()
    const hung = withAiTimeout(() => new Promise(() => undefined), 1000)
    const check = expect(hung).rejects.toBeInstanceOf(AiTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await check

    const next = vi.fn(async () => 'ok')
    await expect(withAiTimeout(next, 1000)).rejects.toBeInstanceOf(AiTimeoutError)
    expect(next).not.toHaveBeenCalled()
  })
})
