import { letterbox, type Prompt, type Region } from './segmentation'

// How the person's pose and body parts (body.ts, MediaPipe) help «Desde un look»: a garment region is named by
// where it sits on the body (above the hips is not trousers), the shoes are asked for at the heels and toes, and
// skin, hair and (for shoes) the floor are taken out of the cut-outs. Pure functions, so they can be tested
// without models.

/** A pose point, as fractions of the photo's width and height, with how sure the model is that it is visible. */
export interface Landmark { x: number; y: number; visibility: number }

export interface BodyMap {
  /** Size of `parts`, which covers the whole photo. */
  width: number
  height: number
  /** What each pixel is (PART), row by row. */
  parts: Uint8Array
  /** The 33 pose points (MediaPipe order), when a person was found. */
  landmarks?: Landmark[]
}

/** Categories of MediaPipe's multiclass selfie segmentation model. */
export const PART = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const

const POINT = { leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26 } as const
const FEET = [
  { heel: 29, toe: 31, ankle: 27, knee: 25 },
  { heel: 30, toe: 32, ankle: 28, knee: 26 }
] as const
/** Points under this visibility are not trusted. */
const VISIBLE = 0.5

const visible = (landmarks: Landmark[], index: number) => (landmarks[index]?.visibility ?? 0) >= VISIBLE ? landmarks[index] : undefined

/** Mean height (fraction of the photo) of the visible points among two, or undefined if neither is visible. */
function level(landmarks: Landmark[], a: number, b: number): number | undefined {
  const points = [visible(landmarks, a), visible(landmarks, b)].filter((point): point is Landmark => !!point)
  return points.length ? points.reduce((sum, point) => sum + point.y, 0) / points.length : undefined
}

/**
 * The region's class, corrected by where it sits on the body (mask: the region at width × height, the photo's
 * proportions). A «one-piece» wholly above the hips is a top and wholly below them, trousers or a skirt; a top
 * below the hips is a bottom and the other way round; «footwear» above the knees is not footwear. Without the hips
 * in view, the class is kept.
 */
export function bodyClass(classId: string, mask: Uint8Array, width: number, height: number, landmarks: Landmark[]): string {
  const hip = level(landmarks, POINT.leftHip, POINT.rightHip)
  if (hip === undefined) return classId
  let total = 0
  let above = 0
  let rows = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      total += 1
      rows += y
      if ((y + 0.5) / height < hip) above += 1
    }
  }
  if (!total) return classId
  const share = above / total
  const middle = (rows / total + 0.5) / height
  const knee = level(landmarks, POINT.leftKnee, POINT.rightKnee)
  if (classId === 'footwear') return knee !== undefined && middle < knee ? (share > 0.5 ? 'top' : 'bottom') : classId
  if (classId === 'one-piece') return share >= 0.85 ? 'top' : share <= 0.15 ? 'bottom' : classId
  if (classId === 'top') return share <= 0.15 ? 'bottom' : classId
  if (classId === 'bottom') return share >= 0.85 ? 'top' : classId
  return classId
}

/**
 * SlimSAM points for the shoes (image pixels): on each visible foot the heel, the toes and the point between them
 * are on the shoe, and the shin (halfway from the ankle to the knee) is not. Undefined when no foot is visible.
 */
export function footPrompt(landmarks: Landmark[], width: number, height: number): Prompt | undefined {
  const points: Array<[number, number]> = []
  const labels: number[] = []
  for (const foot of FEET) {
    const heel = visible(landmarks, foot.heel)
    const toe = visible(landmarks, foot.toe)
    if (!heel || !toe) continue
    points.push([heel.x * width, heel.y * height], [toe.x * width, toe.y * height], [(heel.x + toe.x) / 2 * width, (heel.y + toe.y) / 2 * height])
    labels.push(1, 1, 1)
    const ankle = landmarks[foot.ankle]
    const knee = landmarks[foot.knee]
    if (ankle && knee && (knee.visibility ?? 0) >= VISIBLE) {
      points.push([(ankle.x + knee.x) / 2 * width, (ankle.y + knee.y) / 2 * height])
      labels.push(0)
    }
  }
  return labels.includes(1) ? { points, labels } : undefined
}

/** The coarse-map patches around the feet (the patch of each heel, toe and ankle and those next to it). */
export function footPatches(landmarks: Landmark[], grid: number, width: number, height: number): number[] {
  const { scale, offsetX, offsetY } = letterbox(width, height)
  const size = 224 / grid
  const patches = new Set<number>()
  for (const foot of FEET) {
    for (const index of [foot.heel, foot.toe, foot.ankle]) {
      const point = visible(landmarks, index)
      if (!point) continue
      const col = Math.floor((point.x * width * scale + offsetX) / size)
      const row = Math.floor((point.y * height * scale + offsetY) / size)
      for (let r = row - 1; r <= row + 1; r += 1) {
        for (let c = col - 1; c <= col + 1; c += 1) if (r >= 0 && c >= 0 && r < grid && c < grid) patches.add(r * grid + c)
      }
    }
  }
  return [...patches].sort((a, b) => a - b)
}

/** One region per class (but accessories: a bag and a hat are two), so a garment split in pieces is one cut-out. */
export function mergeByClass<T extends Region>(regions: T[]): T[] {
  const merged = new Map<string, T>()
  const kept: T[] = []
  for (const region of regions) {
    if (region.classId === 'accessory') {
      kept.push(region)
      continue
    }
    const current = merged.get(region.classId)
    if (!current) {
      merged.set(region.classId, { ...region, patches: [...region.patches] })
      continue
    }
    const count = current.patches.length + region.patches.length
    current.confidence = (current.confidence * current.patches.length + region.confidence * region.patches.length) / count
    current.patches = [...current.patches, ...region.patches].sort((a, b) => a - b)
  }
  return [...merged.values(), ...kept].sort((a, b) => b.patches.length - a.patches.length)
}

/**
 * Takes out of a cut-out (alpha, width × height, the photo's proportions) what the body parts say is skin or hair
 * and, with `background`, what is not the person at all. Returns how many opaque pixels were taken out.
 */
export function cleanAlpha(alpha: Uint8ClampedArray, width: number, height: number, body: BodyMap, background: boolean): number {
  let removed = 0
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(body.height - 1, Math.floor((y + 0.5) * body.height / height)) * body.width
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (!alpha[i]) continue
      const part = body.parts[row + Math.min(body.width - 1, Math.floor((x + 0.5) * body.width / width))]!
      if (part === PART.hair || part === PART.bodySkin || part === PART.faceSkin || (background && part === PART.background)) {
        if (alpha[i]! >= 128) removed += 1
        alpha[i] = 0
      }
    }
  }
  return removed
}

/**
 * Takes out of a cut-out what the body parts do not call clothes or accessories, but only what is reached from
 * outside it (a bedspread around a jacket, the floor under trousers): what they miss inside the garment (a dark
 * blazer's lining, a crease) stays, as cutting it opened holes (bench/recut.html, 20-11-2026). Returns how many
 * opaque pixels were taken out.
 */
export function keepClothes(alpha: Uint8ClampedArray, width: number, height: number, body: BodyMap): number {
  const size = width * height
  const notClothes = new Uint8Array(size)
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(body.height - 1, Math.floor((y + 0.5) * body.height / height)) * body.width
    for (let x = 0; x < width; x += 1) {
      const part = body.parts[row + Math.min(body.width - 1, Math.floor((x + 0.5) * body.width / width))]!
      if (part !== PART.clothes && part !== PART.others) notClothes[y * width + x] = 1
    }
  }
  // From everything transparent and the photo's edge, through what is not clothes.
  const reached = new Uint8Array(size)
  const stack: number[] = []
  const open = (i: number) => !reached[i] && (alpha[i]! < 128 || notClothes[i])
  for (let i = 0; i < size; i += 1) {
    const x = i % width
    const y = (i - x) / width
    if ((alpha[i]! < 128 || x === 0 || y === 0 || x === width - 1 || y === height - 1) && open(i)) {
      reached[i] = 1
      stack.push(i)
    }
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % width
    for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
      if (next < 0 || next >= size || !open(next)) continue
      reached[next] = 1
      stack.push(next)
    }
  }
  let removed = 0
  for (let i = 0; i < size; i += 1) {
    if (!alpha[i] || !notClothes[i] || !reached[i]) continue
    if (alpha[i]! >= 128) removed += 1
    alpha[i] = 0
  }
  return removed
}

/** Share of the photo that must be skin (face or body) for the pose to be a person, not a garment's shape. */
const MIN_SKIN = 0.01

/**
 * Someone is in the photo: the pose found a person and the body parts see their skin. A hoodie lying on a bed can
 * look like a torso to the pose alone (tried on 20-11-2026).
 */
export function hasPerson(body: BodyMap | undefined): boolean {
  if (!body?.landmarks) return false
  let skin = 0
  for (const part of body.parts) if (part === PART.bodySkin || part === PART.faceSkin) skin += 1
  return skin >= body.parts.length * MIN_SKIN
}
