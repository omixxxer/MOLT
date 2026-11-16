import { describe, expect, it } from 'vitest'
import { captureTime, exifCaptureTime } from './photoTime'

/** A JPEG with only SOI and an APP1 EXIF segment (little-endian TIFF): DateTimeOriginal and SubSecTimeOriginal. */
function jpegWithExif(date: string, subSeconds?: string): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(80))
  let at = 0
  const u16 = (value: number) => { tiff.setUint16(at, value, true); at += 2 }
  const u32 = (value: number) => { tiff.setUint32(at, value, true); at += 4 }
  u16(0x4949); u16(42); u32(8)
  // IFD0: the pointer to the EXIF directory.
  u16(1); u16(0x8769); u16(4); u32(1); u32(26); u32(0)
  // EXIF directory at 26: the date (20 bytes at 56) and, inline, the fraction of a second.
  u16(subSeconds ? 2 : 1)
  u16(0x9003); u16(2); u32(20); u32(56)
  if (subSeconds) {
    u16(0x9291); u16(2); u32(subSeconds.length + 1)
    for (let index = 0; index < 4; index += 1) tiff.setUint8(at + index, subSeconds.charCodeAt(index) || 0)
    at += 4
  }
  u32(0)
  for (let index = 0; index < date.length; index += 1) tiff.setUint8(56 + index, date.charCodeAt(index))
  const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...new Uint8Array(tiff.buffer)])
  const length = payload.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...payload, 0xff, 0xd9])
}

describe('capture time', () => {
  it('reads DateTimeOriginal with its fraction of a second', () => {
    const first = exifCaptureTime(jpegWithExif('2026:10:31 12:00:05', '250').buffer as ArrayBuffer)
    const second = exifCaptureTime(jpegWithExif('2026:10:31 12:00:35').buffer as ArrayBuffer)
    expect(second! - first!).toBe(29750)
  })

  it('gives nothing for photos without EXIF or that are not JPEG', async () => {
    expect(exifCaptureTime(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeUndefined()
    expect(exifCaptureTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined()
    expect(await captureTime(new Blob([new Uint8Array(jpegWithExif('2026:10:31 12:00:05'))], { type: 'image/png' }))).toBeUndefined()
    expect(await captureTime(new Blob([new Uint8Array(jpegWithExif('2026:10:31 12:00:05'))], { type: 'image/jpeg' }))).toBeTypeOf('number')
  })
})
