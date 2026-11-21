import { borderCoverage } from './segmentation'

// A second pass of SlimSAM over a cut-out that kept bits of what was around the garment (a patterned bedspread, the
// floor): asked again with points well inside the part that looks like the garment, points just outside the cut-out
// and points on the pieces with the colours around it. The new outline only takes pixels out, and only when it keeps
// the garment and what it takes out is mostly those pieces (prototype, unused by the app; measured in
// bench/recut.html). Asked to replace the cut-out instead, its outlines were always coarser than the first one.
// Pure functions here; cutout.ts runs SlimSAM.

const BINS = 6

const bin = (data: Uint8ClampedArray, i: number) =>
  Math.min(BINS - 1, Math.floor(data[i * 4]! / (256 / BINS))) * BINS * BINS
  + Math.min(BINS - 1, Math.floor(data[i * 4 + 1]! / (256 / BINS))) * BINS
  + Math.min(BINS - 1, Math.floor(data[i * 4 + 2]! / (256 / BINS)))

function histogram(data: Uint8ClampedArray, members: (i: number) => boolean, count: number) {
  const bins = new Float32Array(BINS ** 3)
  let total = 0
  for (let i = 0; i < count; i += 1) {
    if (!members(i)) continue
    bins[bin(data, i)]! += 1
    total += 1
  }
  for (let b = 0; b < bins.length; b += 1) bins[b] = bins[b]! / Math.max(1, total)
  return bins
}

/**
 * Colour model of the photo: how common each colour is right around the cut-out (a ring of 1–6 % of the image's
 * side outside it: the bedspread it lies on; the photo's border is often a wall or the floor instead) and inside the
 * garment (`core`). A colour is the backdrop's when it is much commoner around than on the garment. `alsoBackdrop`
 * adds pixels known to be backdrop (those of the cut-out the segmentation map does not call garment).
 */
export function backdropColours(data: Uint8ClampedArray, mask: Uint8Array, core: Uint8Array, width: number, height: number, alsoBackdrop?: Uint8Array) {
  const outside = distanceInside(Uint8Array.from(mask, (value) => (value ? 0 : 1)), width, height)
  const side = Math.min(width, height)
  const around = (i: number) => (outside[i]! >= 1 && outside[i]! <= Math.max(3, side * 0.06)) || alsoBackdrop?.[i] === 1
  const backdrop = histogram(data, around, width * height)
  const garment = histogram(data, (i) => core[i] === 1, width * height)
  return (r: number, g: number, b: number) => {
    const index = Math.min(BINS - 1, Math.floor(r / (256 / BINS))) * BINS * BINS + Math.min(BINS - 1, Math.floor(g / (256 / BINS))) * BINS + Math.min(BINS - 1, Math.floor(b / (256 / BINS)))
    return backdrop[index]! > 1.5 * garment[index]! && backdrop[index]! > 0.002
  }
}

/** Distance of each pixel of the mask to the nearest pixel outside it (or the image's edge); 0 outside. */
export function distanceInside(mask: Uint8Array, width: number, height: number): Float32Array {
  const distance = new Float32Array(width * height)
  for (let i = 0; i < distance.length; i += 1) distance[i] = mask[i] ? 1e9 : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : distance[y * width + x]!)
  const diagonal = Math.SQRT2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (!distance[i]) continue
      distance[i] = Math.min(distance[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + diagonal, at(x + 1, y - 1) + diagonal)
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x
      if (!distance[i]) continue
      distance[i] = Math.min(distance[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + diagonal, at(x - 1, y + 1) + diagonal)
    }
  }
  return distance
}

/** Up to `count` pixels of the pool, the first given and then always the farthest from those chosen. */
function spread(pool: number[], first: number, count: number, width: number, minimum: number): number[] {
  if (!pool.length) return []
  const chosen = [first]
  const nearest = new Float32Array(pool.length).fill(Infinity)
  while (chosen.length < count) {
    const last = chosen[chosen.length - 1]!
    const lx = last % width
    const ly = (last - lx) / width
    let best = -1
    let bestDistance = -1
    for (let k = 0; k < pool.length; k += 1) {
      const x = pool[k]! % width
      const y = (pool[k]! - x) / width
      nearest[k] = Math.min(nearest[k]!, Math.hypot(x - lx, y - ly))
      if (nearest[k]! > bestDistance) {
        bestDistance = nearest[k]!
        best = pool[k]!
      }
    }
    if (bestDistance < minimum) break
    chosen.push(best)
  }
  return chosen
}

/** Connected pieces of a mask (4-neighbours), as lists of pixels. */
function pieces(mask: Uint8Array, width: number, height: number): number[][] {
  const seen = new Uint8Array(mask.length)
  const found: number[][] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    const members = [start]
    seen[start] = 1
    for (let index = 0; index < members.length; index += 1) {
      const i = members[index]!
      const x = i % width
      const y = (i - x) / width
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1
          members.push(next)
        }
      }
    }
    found.push(members)
  }
  return found
}

export interface RefineView {
  /** The cut-out (1 inside). */
  mask: Uint8Array
  /** Pixels of the cut-out with the backdrop's colour, in pieces large enough to matter. */
  suspicious: Uint8Array
  /** What looks like the garment: the cut-out without the suspicious pieces. */
  trusted: Uint8Array
}

/**
 * Where the segmentation map (16 × 16 patches) sees the garment, at the mask's size: its patches (`region`) and the
 * patches whose four neighbours are garment too (`interior`). A bedspread that fills a large part of the cut-out
 * weighs in the colours of the cut-out's inside, but the map often calls those patches background.
 */
export interface MapHint {
  region: Uint8Array
  interior: Uint8Array
}

/** With the map, the garment's colours are read where it and the cut-out agree; at least this share of the cut-out. */
const MIN_MAP_CORE = 0.05

/** Suspicious pieces smaller than this share of the cut-out are noise (a shadow in a fold). */
const MIN_SUSPICIOUS_PIECE = 0.005
/** With less than this share of the cut-out suspicious there is nothing to refine. */
export const MIN_SUSPICIOUS = 0.02

/**
 * Where the cut-out shows the backdrop's colours. `data` is the photo at the mask's size (RGBA). The garment's
 * colours are read from the inside of the cut-out (a band of 3 % of the image's side taken off its edge), where a
 * strip of bedspread along it weighs least; with `map`, only where the segmentation map sees the inside of the
 * garment, and what the map leaves out of the cut-out counts as backdrop.
 */
export function refineView(data: Uint8ClampedArray, mask: Uint8Array, width: number, height: number, map?: MapHint): RefineView {
  const inside = distanceInside(mask, width, height)
  const band = Math.max(2, Math.min(width, height) * 0.03)
  let core = Uint8Array.from(inside, (value, i) => (value >= band && (!map || map.interior[i]) ? 1 : 0))
  // Too little of the map's interior in the cut-out to tell the garment's colours: as without the map.
  if (map && core.reduce((sum, value) => sum + value, 0) < mask.reduce((sum, value) => sum + value, 0) * MIN_MAP_CORE) {
    return refineView(data, mask, width, height)
  }
  if (!core.some(Boolean)) core = mask
  const alsoBackdrop = map ? Uint8Array.from(mask, (value, i) => (value && !map.region[i] ? 1 : 0)) : undefined
  const isBackdrop = backdropColours(data, mask, core, width, height, alsoBackdrop)
  const raw = Uint8Array.from(mask, (value, i) => (value && isBackdrop(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) ? 1 : 0))
  const area = mask.reduce((sum, value) => sum + value, 0)
  const suspicious = new Uint8Array(mask.length)
  for (const piece of pieces(raw, width, height)) if (piece.length >= area * MIN_SUSPICIOUS_PIECE) for (const i of piece) suspicious[i] = 1
  const trusted = Uint8Array.from(mask, (value, i) => (value && !suspicious[i] ? 1 : 0))
  return { mask, suspicious, trusted }
}

export interface RefinePrompt {
  /** Points in the mask's pixels. */
  points: Array<[number, number]>
  labels: number[]
}

/**
 * Points for SlimSAM: up to 6 well inside what looks like the garment, up to 10 a little outside the cut-out, one
 * in each of the 4 largest suspicious pieces and the image's corners (when outside the cut-out).
 */
export function refinePrompt(view: RefineView, width: number, height: number): RefinePrompt | undefined {
  const side = Math.min(width, height)
  const deep = distanceInside(view.trusted, width, height)
  let deepest = -1
  for (let i = 0; i < deep.length; i += 1) if (deepest < 0 || deep[i]! > deep[deepest]!) deepest = i
  if (deepest < 0 || deep[deepest]! < 2) return undefined
  const positivePool: number[] = []
  for (let i = 0; i < deep.length; i += 1) if (deep[i]! >= deep[deepest]! * 0.5) positivePool.push(i)
  const positives = spread(positivePool, deepest, 6, width, side * 0.15)

  const outside = distanceInside(Uint8Array.from(view.mask, (value) => (value ? 0 : 1)), width, height)
  const ringPool: number[] = []
  for (let i = 0; i < outside.length; i += 1) if (outside[i]! >= side * 0.02 && outside[i]! <= side * 0.04) ringPool.push(i)
  const negatives = ringPool.length ? spread(ringPool, ringPool[0]!, 10, width, side * 0.1) : []

  const area = view.mask.reduce((sum, value) => sum + value, 0)
  const leaks = pieces(view.suspicious, width, height).filter((piece) => piece.length >= area * 0.01).sort((a, b) => b.length - a.length).slice(0, 4)
  for (const piece of leaks) {
    const own = new Uint8Array(view.mask.length)
    for (const i of piece) own[i] = 1
    const depth = distanceInside(own, width, height)
    negatives.push(piece.reduce((best, i) => (depth[i]! > depth[best]! ? i : best), piece[0]!))
  }
  const corners = [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]]
    .map(([x, y]) => Math.round(y! * (height - 1)) * width + Math.round(x! * (width - 1)))
    .filter((i) => !view.mask[i])
  const all = [...positives, ...negatives, ...corners]
  return {
    points: all.map((i) => [i % width + 0.5, Math.floor(i / width) + 0.5]),
    labels: [...positives.map(() => 1), ...negatives.map(() => 0), ...corners.map(() => 0)]
  }
}

/** The new outline must keep this share of what looked like the garment. */
const MIN_TRUSTED_KEPT = 0.9
/** It must take out at least this share of the suspicious pieces… */
const MIN_LEAK_REMOVED = 0.3
/** …and what it takes out must be at least this much suspicious. */
const MIN_REMOVED_SUSPICIOUS = 0.5

/**
 * The candidate used only to take pixels out of the cut-out (never to add): among those that keep most of what
 * looks like the garment and are not the background, the one whose cut takes out the most suspicious pixels net of
 * the others, when what it takes out is mostly suspicious and a good part of them. Undefined when none does.
 */
export function chooseRefined(candidates: Uint8Array[], view: RefineView, width: number, height: number): number | undefined {
  const trusted = view.trusted.reduce((sum, value) => sum + value, 0)
  const suspicious = view.suspicious.reduce((sum, value) => sum + value, 0)
  if (!trusted || !suspicious) return undefined
  let best: number | undefined
  let bestScore = 0
  for (const [index, candidate] of candidates.entries()) {
    let kept = 0
    let removed = 0
    let removedSuspicious = 0
    for (let i = 0; i < candidate.length; i += 1) {
      if (!view.mask[i]) continue
      if (candidate[i]) {
        if (view.trusted[i]) kept += 1
        continue
      }
      removed += 1
      if (view.suspicious[i]) removedSuspicious += 1
    }
    if (kept / trusted < MIN_TRUSTED_KEPT || borderCoverage(candidate, width, height) > 0.4) continue
    if (removedSuspicious < suspicious * MIN_LEAK_REMOVED || removedSuspicious < removed * MIN_REMOVED_SUSPICIOUS) continue
    const score = removedSuspicious - (removed - removedSuspicious)
    if (score > bestScore) {
      bestScore = score
      best = index
    }
  }
  return best
}
