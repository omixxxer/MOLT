import type { ImageSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import { fetchModelFile } from './onnxRuntime'
import type { BodyMap } from './bodyRules'

// The person in a full-body photo, with MediaPipe (Google, Apache-2.0; models from Google's model cards, also
// Apache-2.0, see public/models/mediapipe/NOTICE.md): the pose (33 points: shoulders, hips, knees, ankles, heels,
// toes…) and what each pixel is (background, hair, skin, clothes, accessories). Everything is served from this
// origin and runs in the browser. Used by «Desde un look» to name and cut out the garments (bodyRules.ts).

const POSE_MODEL = '/models/mediapipe/pose_landmarker_full.task?v=1'
const PARTS_MODEL = '/models/mediapipe/selfie_multiclass_256x256.tflite?v=1'
/** Longest side the photo is read at; both models work at 256 px inside. */
const SIDE = 1024

let tasks: Promise<{ pose: PoseLandmarker; parts: ImageSegmenter }> | undefined

function loadTasks() {
  tasks ??= (async () => {
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
    const [poseModel, partsModel] = await Promise.all([fetchModelFile(POSE_MODEL), fetchModelFile(PARTS_MODEL)])
    const pose = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(poseModel), delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1
    })
    const parts = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(partsModel), delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false
    })
    return { pose, parts }
  })().catch((error: unknown) => {
    tasks = undefined
    throw error
  })
  return tasks
}

/** Pose and body parts of the person in the photo; the pose is left out when no person is found. */
export async function readBody(photo: Blob): Promise<BodyMap> {
  const { pose, parts } = await loadTasks()
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const [person] = pose.detect(canvas).landmarks
    const result = parts.segment(canvas)
    const mask = result.categoryMask
    if (!mask) throw new Error('MediaPipe no devolvió la máscara de partes.')
    const body: BodyMap = {
      width: mask.width,
      height: mask.height,
      parts: mask.getAsUint8Array().slice(),
      ...(person ? { landmarks: person.map(({ x, y, visibility }) => ({ x, y, visibility: visibility ?? 0 })) } : {})
    }
    result.close()
    return body
  } finally {
    bitmap.close()
  }
}
