import { blobBytes } from '../ml/zip'

// When a photo was taken, from its EXIF data (DateTimeOriginal), to tell photos of one garment taken seconds apart
// from the next garment. Only JPEG carries it reliably; other formats, or photos without it, give undefined.

const TAG_EXIF_POINTER = 0x8769
const TAG_DATE_TIME_ORIGINAL = 0x9003
const TAG_SUB_SEC_ORIGINAL = 0x9291
/** EXIF sits in the first segments of a JPEG; reading this much is enough. */
const HEAD_BYTES = 128 * 1024

/** "2026:10:31 12:34:56" (camera local time, no zone) as milliseconds; only differences between photos matter. */
function parseExifDate(text: string, subSeconds?: string): number | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[]
  const time = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!)
  const fraction = subSeconds && /^\d+/.test(subSeconds) ? Number(`0.${subSeconds.trim()}`) * 1000 : 0
  return Number.isFinite(time) && year! > 1990 ? time + fraction : undefined
}

/** The capture time in a JPEG's bytes, or undefined. Exported for tests. */
export function exifCaptureTime(bytes: ArrayBuffer): number | undefined {
  const view = new DataView(bytes)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined
  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    const length = view.getUint16(offset + 2)
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return undefined
    // APP1 with "Exif\0\0", then a TIFF header.
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return tiffCaptureTime(view, offset + 10, Math.min(view.byteLength, offset + 2 + length))
    }
    offset += 2 + length
  }
  return undefined
}

function tiffCaptureTime(view: DataView, start: number, end: number): number | undefined {
  if (start + 8 > end) return undefined
  const little = view.getUint16(start) === 0x4949
  const u16 = (at: number) => view.getUint16(at, little)
  const u32 = (at: number) => view.getUint32(at, little)
  const entries = (directory: number) => {
    const found = new Map<number, { type: number; count: number; value: number }>()
    if (directory + 2 > end) return found
    const count = u16(directory)
    for (let index = 0; index < count; index += 1) {
      const entry = directory + 2 + index * 12
      if (entry + 12 > end) break
      found.set(u16(entry), { type: u16(entry + 2), count: u32(entry + 4), value: entry + 8 })
    }
    return found
  }
  const ascii = (entry: { type: number; count: number; value: number } | undefined) => {
    if (!entry || entry.type !== 2) return undefined
    const at = entry.count > 4 ? start + u32(entry.value) : entry.value
    if (at + entry.count > end) return undefined
    let text = ''
    for (let index = 0; index < entry.count; index += 1) {
      const code = view.getUint8(at + index)
      if (!code) break
      text += String.fromCharCode(code)
    }
    return text
  }

  const main = entries(start + u32(start + 4))
  const pointer = main.get(TAG_EXIF_POINTER)
  if (!pointer) return undefined
  const exif = entries(start + u32(pointer.value))
  const date = ascii(exif.get(TAG_DATE_TIME_ORIGINAL))
  return date ? parseExifDate(date, ascii(exif.get(TAG_SUB_SEC_ORIGINAL))) : undefined
}

export async function captureTime(photo: Blob): Promise<number | undefined> {
  if (photo.type && photo.type !== 'image/jpeg') return undefined
  try {
    const bytes = await blobBytes(photo.slice(0, HEAD_BYTES))
    return exifCaptureTime(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  } catch {
    return undefined
  }
}
