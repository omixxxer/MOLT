// SlimSAM in a WebAssembly runtime of its own (see sam.ts): its encoder grows the runtime's memory to ~1.6 GB,
// which WebAssembly never gives back, so it runs here and the page ends this worker when the cut-outs are done.
// Only the models' inputs and outputs travel; the photo is prepared in the page.
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'

export interface Plain {
  data: Float32Array
  dims: readonly number[]
}

export type SamRequest =
  | { id: number; kind: 'load'; encoder: ArrayBuffer; decoder: ArrayBuffer }
  | { id: number; kind: 'encode'; pixels: Float32Array; size: number }
  | { id: number; kind: 'decode'; points: Float32Array; labels: BigInt64Array; embeddings: Plain; positions: Plain }

export type SamResult =
  | { embeddings: Plain; positions: Plain }
  | { scores: Float32Array; masks: Float32Array }
  | null

export interface SamResponse {
  id: number
  result?: SamResult
  error?: string
}

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl }
// Already off the main thread: no proxy worker inside this one. Threads as in the page (onnxRuntime.ts).
ort.env.wasm.proxy = false
if (import.meta.env.DEV) ort.env.wasm.numThreads = 1
ort.env.logLevel = 'error'

let sessions: { encoder: ort.InferenceSession; decoder: ort.InferenceSession } | undefined

const scope = self as unknown as { onmessage: ((event: MessageEvent<SamRequest>) => void) | null; postMessage: (message: SamResponse, transfer?: Transferable[]) => void }

const plain = (tensor: ort.Tensor | undefined): Plain => {
  if (!tensor) throw new Error('El modelo de recorte no devolvió la imagen codificada.')
  return { data: tensor.data as Float32Array, dims: tensor.dims }
}

async function handle(request: SamRequest): Promise<[SamResult, Transferable[]]> {
  if (request.kind === 'load') {
    const [encoder, decoder] = await Promise.all([request.encoder, request.decoder].map((model) =>
      ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] })))
    sessions = { encoder: encoder!, decoder: decoder! }
    return [null, []]
  }
  if (!sessions) throw new Error('El modelo de recorte no está cargado.')
  if (request.kind === 'encode') {
    const output = await sessions.encoder.run({ pixel_values: new ort.Tensor('float32', request.pixels, [1, 3, request.size, request.size]) })
    const embeddings = plain(output.image_embeddings)
    const positions = plain(output.image_positional_embeddings)
    return [{ embeddings, positions }, [embeddings.data.buffer, positions.data.buffer]]
  }
  const count = request.labels.length
  const output = await sessions.decoder.run({
    input_points: new ort.Tensor('float32', request.points, [1, 1, count, 2]),
    input_labels: new ort.Tensor('int64', request.labels, [1, 1, count]),
    image_embeddings: new ort.Tensor('float32', request.embeddings.data, request.embeddings.dims),
    image_positional_embeddings: new ort.Tensor('float32', request.positions.data, request.positions.dims)
  })
  const scores = output.iou_scores!.data as Float32Array
  const masks = output.pred_masks!.data as Float32Array
  return [{ scores, masks }, [scores.buffer, masks.buffer]]
}

scope.onmessage = (event) => {
  handle(event.data).then(
    ([result, transfer]) => scope.postMessage({ id: event.data.id, result }, transfer),
    (error: unknown) => scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) })
  )
}
