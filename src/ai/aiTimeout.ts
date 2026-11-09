/** One step of the models (loading or one pass): generous, as a modest phone is many times slower than a laptop. */
export const AI_STEP_TIMEOUT = 120_000

export class AiTimeoutError extends Error {
  constructor() {
    super('El análisis está tardando demasiado en este dispositivo. Cierra y vuelve a abrir Molt e inténtalo de nuevo.')
    this.name = 'AiTimeoutError'
  }
}

let stuck = false

/**
 * Stops waiting for a step that never ends, so the screen does not spin forever. ONNX Runtime cannot cancel a run and
 * its worker does one at a time, so after a timeout later steps would only queue behind it: they fail at once until
 * the app is reloaded, instead of a batch of photos waiting two minutes each.
 */
export function withAiTimeout<T>(step: () => Promise<T>, milliseconds = AI_STEP_TIMEOUT): Promise<T> {
  if (stuck) return Promise.reject(new AiTimeoutError())
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      stuck = true
      reject(new AiTimeoutError())
    }, milliseconds)
    step().then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
