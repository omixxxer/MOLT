// Where the garments are, from the coarse map the classifier's segmentation head gives (16 × 16 patches of the
// 224 letterboxed photo), and how to ask SlimSAM for their exact outline: a few points on the garment and a few
// just outside it. Pure functions over arrays, so they can be tested without models.

export interface SegmentationMap {
  classes: string[]
  grid: number
  /** Softmax per patch, row by row: grid * grid * classes. */
  probabilities: Float32Array
}

export interface Region {
  /** Taxonomy category id (top, bottom…), or 'garment' for every non-background patch together. */
  classId: string
  patches: number[]
  /** Mean probability of the region's class over its patches. */
  confidence: number
}

export interface Prompt {
  /** Image pixel coordinates. */
  points: Array<[number, number]>
  /** 1 on the garment, 0 outside it. */
  labels: number[]
}

const INPUT = 224

export function letterbox(width: number, height: number) {
  const scale = INPUT / Math.max(width, height)
  return { scale, offsetX: Math.floor((INPUT - Math.round(width * scale)) / 2), offsetY: Math.floor((INPUT - Math.round(height * scale)) / 2) }
}

/** Centre of a patch in image pixels, or undefined when it falls on the letterbox padding. */
export function patchCenter(patch: number, grid: number, width: number, height: number): [number, number] | undefined {
  const size = INPUT / grid
  const { scale, offsetX, offsetY } = letterbox(width, height)
  const x = ((patch % grid) * size + size / 2 - offsetX) / scale
  const y = (Math.floor(patch / grid) * size + size / 2 - offsetY) / scale
  return x >= 0 && y >= 0 && x < width && y < height ? [x, y] : undefined
}

/** The most likely class of each patch; patches on the padding count as background (index 0). */
export function patchLabels(map: SegmentationMap, width: number, height: number): Int32Array {
  const count = map.grid * map.grid
  const labels = new Int32Array(count)
  for (let patch = 0; patch < count; patch += 1) {
    if (!patchCenter(patch, map.grid, width, height)) continue
    let best = 0
    for (let klass = 1; klass < map.classes.length; klass += 1) {
      if (map.probabilities[patch * map.classes.length + klass]! > map.probabilities[patch * map.classes.length + best]!) best = klass
    }
    labels[patch] = best
  }
  return labels
}

function components(member: (patch: number) => boolean, grid: number): number[][] {
  const seen = new Uint8Array(grid * grid)
  const found: number[][] = []
  for (let start = 0; start < grid * grid; start += 1) {
    if (seen[start] || !member(start)) continue
    const stack = [start]
    const patches: number[] = []
    seen[start] = 1
    while (stack.length) {
      const patch = stack.pop()!
      patches.push(patch)
      const row = Math.floor(patch / grid)
      const col = patch % grid
      for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]] as const) {
        const next = r * grid + c
        if (r >= 0 && c >= 0 && r < grid && c < grid && !seen[next] && member(next)) {
          seen[next] = 1
          stack.push(next)
        }
      }
    }
    found.push(patches.sort((a, b) => a - b))
  }
  return found
}

/**
 * Garment regions, largest first. Single garment photos use merged = true: every non-background patch of the
 * biggest connected area is one garment (a hoodie can mix «top» and «outerwear» patches). Full-body photos use
 * one region per class and connected area.
 */
export function garmentRegions(map: SegmentationMap, width: number, height: number, merged: boolean, minPatches = 2): Region[] {
  const labels = patchLabels(map, width, height)
  const confidence = (patches: number[], klass: (patch: number) => number) =>
    patches.reduce((sum, patch) => sum + map.probabilities[patch * map.classes.length + klass(patch)]!, 0) / patches.length
  if (merged) {
    const [largest] = components((patch) => labels[patch]! > 0, map.grid).sort((a, b) => b.length - a.length)
    return largest && largest.length >= minPatches
      ? [{ classId: 'garment', patches: largest, confidence: confidence(largest, (patch) => labels[patch]!) }]
      : []
  }
  const regions: Region[] = []
  for (let klass = 1; klass < map.classes.length; klass += 1) {
    for (const patches of components((patch) => labels[patch] === klass, map.grid)) {
      if (patches.length >= minPatches) regions.push({ classId: map.classes[klass]!, patches, confidence: confidence(patches, () => klass) })
    }
  }
  return regions.sort((a, b) => b.patches.length - a.patches.length)
}

/**
 * Points for SlimSAM: up to four spread over the region (the patch nearest its centre, then always the farthest
 * from those chosen) and up to three outside it but close (head, arms, the next garment), at least 3 patches apart.
 * With `corners`, the photo's corners are also marked as background (a single garment photo's corners are almost
 * always background, and without them SlimSAM may return the whole picture).
 */
export function promptFor(region: Region, grid: number, width: number, height: number, corners = false): Prompt {
  const inside = new Set(region.patches)
  const row = (patch: number) => Math.floor(patch / grid)
  const col = (patch: number) => patch % grid
  const distance = (a: number, b: number) => (row(a) - row(b)) ** 2 + (col(a) - col(b)) ** 2
  const centreRow = region.patches.reduce((sum, patch) => sum + row(patch), 0) / region.patches.length
  const centreCol = region.patches.reduce((sum, patch) => sum + col(patch), 0) / region.patches.length
  const toCentre = (patch: number) => (row(patch) - centreRow) ** 2 + (col(patch) - centreCol) ** 2

  const positives = [region.patches.reduce((best, patch) => toCentre(patch) < toCentre(best) ? patch : best)]
  while (positives.length < Math.min(4, region.patches.length)) {
    positives.push(region.patches.reduce((best, patch) =>
      Math.min(...positives.map((chosen) => distance(patch, chosen))) > Math.min(...positives.map((chosen) => distance(best, chosen))) ? patch : best))
  }
  const negatives: number[] = []
  const outside = Array.from({ length: grid * grid }, (_, patch) => patch)
    .filter((patch) => !inside.has(patch) && patchCenter(patch, grid, width, height))
    .sort((a, b) => toCentre(a) - toCentre(b))
  for (const patch of outside) {
    if (negatives.every((chosen) => distance(patch, chosen) >= 9)) negatives.push(patch)
    if (negatives.length === 3) break
  }
  const points = [...positives, ...negatives].map((patch) => patchCenter(patch, grid, width, height)!)
  const cornerPoints: Array<[number, number]> = corners
    ? [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]].map(([x, y]) => [x! * width, y! * height])
    : []
  return {
    points: [...points, ...cornerPoints],
    labels: [...positives.map(() => 1), ...negatives.map(() => 0), ...cornerPoints.map(() => 0)]
  }
}

/**
 * The region as a mask of width × height (true inside), grown by `grow` patches so the exact outline from SlimSAM
 * is kept whole while anything far from the region is dropped.
 */
export function regionMask(region: Region, grid: number, imageWidth: number, imageHeight: number, width: number, height: number, grow = 1): Uint8Array {
  const inside = new Uint8Array(grid * grid)
  const member = new Set(region.patches)
  const reach = Math.abs(grow)
  for (const patch of region.patches) {
    const r = Math.floor(patch / grid)
    const c = patch % grid
    // A negative grow keeps only the patches whose neighbours (that far) are all in the region: its interior.
    let interior = true
    for (let dr = -reach; dr <= reach; dr += 1) {
      for (let dc = -reach; dc <= reach; dc += 1) {
        const neighbour = (r + dr) * grid + c + dc
        if (r + dr < 0 || c + dc < 0 || r + dr >= grid || c + dc >= grid) { interior = false; continue }
        if (grow > 0) inside[neighbour] = 1
        else if (!member.has(neighbour)) interior = false
      }
    }
    if (grow <= 0 && interior) inside[patch] = 1
  }
  const { scale, offsetX, offsetY } = letterbox(imageWidth, imageHeight)
  const patchSize = INPUT / grid
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(grid - 1, Math.floor(((y + 0.5) * imageHeight / height * scale + offsetY) / patchSize))
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(grid - 1, Math.floor(((x + 0.5) * imageWidth / width * scale + offsetX) / patchSize))
      mask[y * width + x] = inside[row * grid + col]!
    }
  }
  return mask
}

/** Share of the mask's border pixels (width × height) that are inside it. */
export function borderCoverage(mask: Uint8Array, width: number, height: number): number {
  let inside = 0
  let total = 0
  for (let x = 0; x < width; x += 1) {
    inside += mask[x]! + mask[(height - 1) * width + x]!
    total += 2
  }
  for (let y = 1; y < height - 1; y += 1) {
    inside += mask[y * width]! + mask[y * width + width - 1]!
    total += 2
  }
  return inside / total
}

/**
 * Index of the candidate mask that overlaps the coarse region best (SlimSAM's own score favours the whole person).
 * With the mask size, a candidate covering most of the photo's border is background and only chosen if all are.
 */
export function bestMatch(candidates: Uint8Array[], coarse: Uint8Array, width?: number, height?: number): number {
  let best = 0
  let bestIou = -1
  const background = candidates.map((candidate) => width !== undefined && height !== undefined && borderCoverage(candidate, width, height) > 0.4)
  const allBackground = background.every(Boolean)
  candidates.forEach((candidate, index) => {
    if (background[index] && !allBackground) return
    let intersection = 0
    let union = 0
    for (let i = 0; i < coarse.length; i += 1) {
      if (candidate[i] && coarse[i]) intersection += 1
      if (candidate[i] || coarse[i]) union += 1
    }
    const iou = union ? intersection / union : 0
    if (iou > bestIou) {
      best = index
      bestIou = iou
    }
  })
  return best
}
