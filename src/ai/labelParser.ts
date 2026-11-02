import type { TextLine } from './textReader'

/** Size and composition read from a care label. Every match keeps the text it came from, to show it. */
export interface LabelValue {
  value: string
  text: string
  score: number
  /** For a US, UK or MEX size (or jeans), the approximate European size from a standard table, e.g. "48". */
  european?: string
}

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL']
// Words that announce a size on labels (Spanish, English, French, Italian, German…).
const SIZE_WORDS = '(?:TALLA|TALLE|SIZE|TAILLE|TAGLIA|TG|GR|GROSSE|GRÖSSE|TAM|T)'
// European size systems. After the number only the unambiguous ones count ("42 EUR"; "40 D" could be anything).
const EUROPEAN = '(?:EUR|EU|ES|E|FR|F|IT|I|DE|D)'
const EUROPEAN_AFTER = '(?:EUR|EU|FR|IT|DE)'
// Other systems: kept as written ("38 US"), since the same number means different sizes by garment.
const FOREIGN = '(US|USA|UK|GB|MEX|MX)'
// Sizes go in halves; the OCR often reads "41.5" as "41.6", so one decimal is taken and rounded to the half.
const NUMBER = '(\\d{1,2}(?:[.,]\\d)?)'
const SYSTEM_WORD = /^(?:US|USA|UK|GB|EU|EUR|FR|IT|DE|MEX|MX|CM|JP|BR|CN)$/
const NUMBER_ONLY = /^\d{1,2}(?:[.,]\d)?\.?$/

/** A size number read on a label, rounded to the half (41.6 → 41.5). */
function sizeNumber(text: string): number {
  return Math.round(Number(text.replace(',', '.')) * 2) / 2
}

// UK shoe sizes to European ones (unisex, the usual table). US shoe sizes depend on men's or women's: none.
const UK_SHOES: Record<string, number> = { 3: 36, 3.5: 36, 4: 37, 4.5: 37.5, 5: 38, 5.5: 38.5, 6: 39, 6.5: 40, 7: 41, 7.5: 41.5, 8: 42, 8.5: 42.5, 9: 43, 9.5: 44, 10: 44.5, 11: 46, 12: 47, 13: 48 }

const decimal = (value: number) => String(value).replace('.', ',')

/**
 * The approximate European size of a US, UK or MEX size, only where a standard table is clear: shoes in UK
 * sizes; women's US 0–20 (EU = US + 30) and UK 4–24 (EU = UK + 28); men's chest 30–56 for tops (EU = + 10);
 * waist 26–44 for bottoms (EU = + 10, as W32 = 42).
 */
export function europeanSize(system: string, size: number, category?: string): number | undefined {
  const uk = system === 'UK' || system === 'GB'
  const us = system === 'US' || system === 'USA'
  if (category === 'footwear') return uk ? UK_SHOES[size] : undefined
  if (!Number.isInteger(size)) return undefined
  if (category === 'bottom' && inRange(size, 26, 44)) return size + 10
  if (category !== 'bottom' && inRange(size, 30, 56)) return size + 10
  if (us && size % 2 === 0 && inRange(size, 0, 20)) return size + 30
  if (uk && size % 2 === 0 && inRange(size, 4, 24)) return size + 28
  return undefined
}

/** The approximate European size of a stored size such as "38 US", "8 UK" or "W32 L34", to show next to it. */
export function europeanEquivalent(size: string, category?: string): string | undefined {
  const text = upper(size)
  const jeans = /^W\s?(\d{2})\b/.exec(text)
  if (jeans) return String(Number(jeans[1]) + 10)
  const foreign = new RegExp(`^${NUMBER}\\s?(US|UK)$`).exec(text) ?? new RegExp(`^(US|UK)\\s?${NUMBER}$`).exec(text)
  if (!foreign) return undefined
  const [amount, system] = /\d/.test(foreign[1]!) ? [foreign[1]!, foreign[2]!] : [foreign[2]!, foreign[1]!]
  const european = europeanSize(system, sizeNumber(amount), category)
  return european === undefined ? undefined : decimal(european)
}

function upper(text: string): string {
  return text.toLocaleUpperCase('es').normalize('NFD').replace(/\p{Mn}/gu, '').replace(/\s+/g, ' ').trim()
}

function inRange(value: number, low: number, high: number) {
  return value >= low && value <= high
}

/** A line's place on the label, in a frame turned with the label: u along its rows, v down its columns. */
interface Placed {
  line: TextLine
  u: number
  v: number
  /** Half its size along u and along v. */
  halfU: number
  halfV: number
}

/** The label's tilt: the median direction of its longer lines (a photo is rarely taken straight). */
function labelAngle(lines: TextLine[]): number {
  const angles = lines
    .filter((line) => line.shape && line.text.trim().length >= 3 && line.shape.length >= 2 * line.shape.thickness)
    .map((line) => Math.atan(Math.tan(line.shape!.angle))) // the same direction read either way
    .sort((a, b) => a - b)
  return angles.length ? angles[Math.floor(angles.length / 2)]! : 0
}

function place(line: TextLine, angle: number): Placed {
  const shape = line.shape ?? {
    centerX: (line.bounds!.left + line.bounds!.right) / 2,
    centerY: (line.bounds!.top + line.bounds!.bottom) / 2,
    angle: 0,
    length: line.bounds!.right - line.bounds!.left,
    thickness: line.bounds!.bottom - line.bounds!.top
  }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const turn = shape.angle - angle
  return {
    line,
    u: shape.centerX * cos + shape.centerY * sin,
    v: -shape.centerX * sin + shape.centerY * cos,
    halfU: (Math.abs(Math.cos(turn)) * shape.length + Math.abs(Math.sin(turn)) * shape.thickness) / 2,
    halfV: (Math.abs(Math.sin(turn)) * shape.length + Math.abs(Math.cos(turn)) * shape.thickness) / 2
  }
}

/**
 * Size tables print each value in its own box ("8 | US", "41.5 | EU") or a system over its number ("US" above
 * "8"); the reader returns them as separate lines. This joins boxes on the same row of the label (following its
 * tilt), left to right, and a system word with the number just below it, as extra lines. Lines without a
 * position are left out.
 */
export function neighbours(lines: TextLine[]): TextLine[] {
  const angle = labelAngle(lines)
  const placed = lines.filter((line) => line.bounds && line.score >= 0.5).map((line) => place(line, angle))
  const join = (parts: Placed[]): TextLine => ({
    text: parts.map((part) => part.line.text).join(' '),
    score: Math.min(...parts.map((part) => part.line.score))
  })

  const rows: Placed[][] = []
  for (const item of [...placed].sort((a, b) => (a.u - a.halfU) - (b.u - b.halfU))) {
    const row = rows.find((candidate) => {
      const last = candidate.at(-1)!
      const small = Math.min(last.halfV, item.halfV)
      const large = Math.max(last.halfV, item.halfV)
      const gap = (item.u - item.halfU) - (last.u + last.halfU)
      return Math.abs(item.v - last.v) < small && large < 2.2 * small && gap > -0.6 * large && gap < 6 * large
    })
    if (row) row.push(item)
    else rows.push([item])
  }
  const joined = rows.filter((row) => row.length > 1).map(join)

  for (const system of placed) {
    if (!SYSTEM_WORD.test(upper(system.line.text))) continue
    const below = placed
      .filter((item) => NUMBER_ONLY.test(upper(item.line.text))
        && item.v - system.v > 0.4 * system.halfV && item.v - system.v < 4 * system.halfV
        && Math.abs(item.u - system.u) < Math.max(item.halfU, system.halfU))
      .sort((a, b) => a.v - b.v)[0]
    if (below) joined.push(join([system, below]))
  }
  return joined
}

/**
 * The size on a label. A bare letter only counts when it is the whole line and confidently read (OCR often
 * returns stray single letters); numbers need a size system or a size word next to them (before or after), so
 * references, percentages or prices are not taken for sizes. The European size wins; a US, UK or MEX one is kept
 * as written ("38 US") with its approximate European size. Footwear and bottoms prefer the number, other garments
 * the letter.
 */
export function findSize(lines: TextLine[], category?: string): LabelValue | undefined {
  const found: Array<LabelValue & { kind: 'letter' | 'number' | 'jeans' | 'foreign' }> = []
  for (const line of [...lines, ...neighbours(lines)]) {
    if (line.score < 0.6) continue
    const text = upper(line.text)
    const jeans = /\bW\s?(\d{2})\s?[/ ]?\s?L\s?(\d{2})\b/.exec(text)
    if (jeans && inRange(Number(jeans[1]), 24, 46) && inRange(Number(jeans[2]), 26, 38)) {
      found.push({ kind: 'jeans', value: `W${jeans[1]} L${jeans[2]}`, text: line.text, score: line.score, european: String(Number(jeans[1]) + 10) })
    }
    const number = new RegExp(`(?:^|[^A-Z])(?:${EUROPEAN}|${SIZE_WORDS})\\s?[.:]?\\s?(\\d{2}(?:[.,]\\d)?)(?!\\d|\\s?%)`).exec(text)
      ?? new RegExp(`(?:^|[^\\d.,])(\\d{2}(?:[.,]\\d)?)\\.?\\s?${EUROPEAN_AFTER}(?![A-Z])`).exec(text)
    if (number && inRange(sizeNumber(number[1]!), 30, 60)) {
      found.push({ kind: 'number', value: decimal(sizeNumber(number[1]!)), text: line.text, score: line.score })
    }
    const foreign = new RegExp(`(?:^|[^A-Z])${FOREIGN}\\s?[.:]?\\s?${NUMBER}(?![\\d%])`).exec(text)
    const after = foreign ? undefined : new RegExp(`(?:^|[^\\d.,])${NUMBER}\\.?\\s?${FOREIGN}(?![A-Z])`).exec(text)
    const system = foreign?.[1] ?? after?.[2]
    const amount = foreign?.[2] ?? after?.[1]
    if (system && amount && inRange(sizeNumber(amount), 0, 60)) {
      const name = system === 'USA' ? 'US' : system === 'GB' ? 'UK' : system === 'MX' ? 'MEX' : system
      const european = name === 'MEX' ? undefined : europeanSize(name, sizeNumber(amount), category)
      found.push({
        kind: 'foreign',
        value: `${decimal(sizeNumber(amount))} ${name}`,
        text: line.text,
        score: line.score,
        ...(european === undefined ? {} : { european: decimal(european) })
      })
    }
    // A letter alone may come with marks around it ("-XXL-", "(M)").
    const bare = text.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    const named = new RegExp(`(?:^|[^A-Z])${SIZE_WORDS}\\s?[.:]?\\s?(${LETTER_SIZES.join('|')})(?![A-Z0-9])`).exec(text)
    const letter = named?.[1] ?? (LETTER_SIZES.includes(bare) ? bare : undefined)
    const needed = named ? 0.6 : bare.length === 1 ? 0.85 : 0.7
    if (letter && line.score >= needed) found.push({ kind: 'letter', value: letter, text: line.text, score: line.score })
  }
  const order = category === 'footwear'
    ? ['number', 'foreign']
    : category === 'bottom' ? ['jeans', 'number', 'letter', 'foreign'] : ['letter', 'number', 'jeans', 'foreign']
  for (const kind of order) {
    const best = found.filter((entry) => entry.kind === kind).sort((left, right) => right.score - left.score)[0]
    if (best) return { value: best.value, text: best.text, score: best.score, ...(best.european ? { european: best.european } : {}) }
  }
  return undefined
}

// Fibre names in the languages labels usually repeat them in, to the Spanish name shown in the app.
const FIBRES: Array<[string, string[]]> = [
  ['algodón', ['ALGODON', 'COTTON', 'COTON', 'COTONE', 'BAUMWOLLE', 'ALGODAO', 'KATOEN']],
  ['poliéster', ['POLIESTER', 'POLYESTER', 'POLIESTERE']],
  ['elastano', ['ELASTANO', 'ELASTANE', 'ELASTHANNE', 'ELASTHAN', 'SPANDEX', 'LYCRA']],
  ['poliamida', ['POLIAMIDA', 'POLYAMIDE', 'POLIAMMIDE', 'POLYAMID', 'NYLON', 'NAILON']],
  ['viscosa', ['VISCOSA', 'VISCOSE', 'RAYON', 'VISKOSE']],
  ['lana', ['LANA', 'WOOL', 'LAINE', 'WOLLE', 'LA']],
  ['lino', ['LINO', 'LINEN', 'LIN', 'LEINEN']],
  ['seda', ['SEDA', 'SILK', 'SOIE', 'SETA', 'SEIDE']],
  ['acrílico', ['ACRILICO', 'ACRYLIC', 'ACRYLIQUE', 'ACRYL']],
  ['cachemira', ['CACHEMIRA', 'CASHMERE', 'CACHEMIRE', 'CASHMIRE', 'KASCHMIR']],
  ['lyocell', ['LYOCELL', 'TENCEL']],
  ['modal', ['MODAL']],
  ['poliuretano', ['POLIURETANO', 'POLYURETHANE', 'POLYURETHANNE']],
  ['piel', ['PIEL', 'LEATHER', 'CUIR', 'CUOIO', 'LEDER', 'CUERO']],
  ['plumón', ['PLUMON', 'DOWN', 'DUVET']],
  ['pluma', ['PLUMA', 'FEATHER', 'PLUME', 'FEDER']],
  ['alpaca', ['ALPACA', 'ALPAGA']],
  ['mohair', ['MOHAIR']],
  ['polipropileno', ['POLIPROPILENO', 'POLYPROPYLENE']],
  ['metalizada', ['METALIZADA', 'METALLIC', 'METALLISEE']]
]
const fibreByWord = new Map(FIBRES.flatMap(([name, words]) => words.map((word): [string, string] => [word, name])))

/**
 * The composition on a label, e.g. "95 % algodón, 5 % elastano". Percentages next to a known fibre are read in
 * order ("95% COTTON" or "ALGODÓN 95%"); a fibre repeated in another language is skipped, and reading stops once
 * the percentages add up to 100, so the lining of a second section is not mixed in.
 */
export function findComposition(lines: TextLine[]): LabelValue | undefined {
  const parts: Array<[number, string]> = []
  const sources: TextLine[] = []
  let total = 0
  for (const line of lines) {
    if (line.score < 0.6 || total >= 100) continue
    const text = upper(line.text).replace(/[^A-Z0-9% ]/g, ' ')
    const pattern = /(\d{1,3})\s?%\s?([A-Z]{2,})|([A-Z]{2,})\s?(\d{1,3})\s?%/g
    let used = false
    for (const match of text.matchAll(pattern)) {
      const percent = Number(match[1] ?? match[4])
      const fibre = fibreByWord.get(match[2] ?? match[3]!)
      if (!fibre || !inRange(percent, 1, 100) || parts.some(([, known]) => known === fibre)) continue
      if (total + percent > 100) break
      parts.push([percent, fibre])
      total += percent
      used = true
      if (total >= 100) break
    }
    if (used) sources.push(line)
  }
  if (!parts.length || total < 95) return undefined
  return {
    value: parts.map(([percent, fibre]) => `${percent} % ${fibre}`).join(', '),
    text: sources.map((line) => line.text).join(' · '),
    score: Math.min(...sources.map((line) => line.score))
  }
}
