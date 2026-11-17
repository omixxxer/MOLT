// Measures the first read of the wardrobe before and after photos left the garment records (database version 8).
// Runs in a browser against a database of its own; see storage.html.
import Dexie from 'dexie'
import { WardrobeDatabase } from '../src/db/database'

const PHOTO_BYTES = 300 * 1024 // a 12 MP photo reduced to 2048 px, as the README describes
const THUMBNAIL_BYTES = 40 * 1024
const GALLERY = 40 // garments the gallery shows first
const RUNS = 7

export interface StorageMeasure {
  /** Time to read the list the wardrobe screen needs, in ms: first read after opening, and median of the next ones. */
  listFirstMs: number
  listMedianMs: number
  /** Bytes of the Blobs the list returns (photos and thumbnails the screen now holds a reference to). */
  blobBytesInList: number
  blobsInList: number
  /** Time to read the bytes of the 40 thumbnails the gallery shows, in ms (median). */
  thumbnailsMedianMs: number
  /** Time to read every byte the list references, in ms: what a browser pays if it loads Blobs with the record. */
  readAllBlobsMs: number
  /**
   * Growth of the JS heap from just before the list is read to just after, in MB (median). Chromium only, and
   * approximate: the collector may run in between, and Blob contents are kept outside the JS heap.
   */
  heapGrowthMb: number | null
}

export interface StorageResult {
  garments: number
  photoBytes: number
  thumbnailBytes: number
  seedMs: number
  before: StorageMeasure
  migrationMs: number
  migrated: { garments: number; photos: number; thumbnails: number; photoBytesOk: boolean }
  after: StorageMeasure
  userAgent: string
}

const heapBytes = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
const round = (value: number) => Math.round(value * 10) / 10

function blobsOf(record: object): Blob[] {
  return Object.values(record).flatMap((value) => value instanceof Blob ? [value] : Array.isArray(value) ? value.filter((entry) => entry instanceof Blob) : [])
}

function randomBlob(bytes: number, type: string): Blob {
  const chunks: Uint8Array[] = []
  for (let left = bytes; left > 0; left -= 65536) chunks.push(crypto.getRandomValues(new Uint8Array(Math.min(left, 65536))))
  return new Blob(chunks as BlobPart[], { type })
}

function openVersion7(name: string) {
  const legacy = new Dexie(name)
  legacy.version(7).stores({
    garments: 'id, category, name, updatedAt, &code',
    outfits: 'id, createdAt, favorite, kind',
    preferences: 'id',
    trendPacks: 'id, version, publishedAt',
    outfitFeedback: 'id, type, createdAt',
    garmentCodeCounters: 'prefix',
    trips: 'id, startDate'
  })
  return legacy
}

async function seed(name: string, count: number) {
  const legacy = openVersion7(name)
  const categories = ['Parte superior', 'Parte inferior', 'Abrigo', 'Calzado']
  for (let start = 0; start < count; start += 25) {
    const batch = Array.from({ length: Math.min(25, count - start) }, (_, offset) => {
      const index = start + offset
      return {
        id: crypto.randomUUID(),
        code: `BEN-${String(index + 1).padStart(4, '0')}`,
        name: `Prenda ${index + 1}`,
        category: categories[index % categories.length],
        subcategory: 'Camiseta',
        colors: ['Blanco', 'Azul'],
        pattern: 'Liso',
        brand: 'Marca',
        seasons: ['Primavera', 'Verano'],
        styles: ['Minimalista'],
        dressLevels: ['Diario'],
        role: 'Top',
        image: randomBlob(PHOTO_BYTES, 'image/jpeg'),
        thumbnail: randomBlob(THUMBNAIL_BYTES, 'image/jpeg'),
        width: 480,
        height: 640,
        confirmedAttributes: ['category', 'colors'],
        suggestedAttributes: ['category', 'subcategory', 'colors'],
        createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60000).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 0, 1) + index * 60000).toISOString()
      }
    })
    await legacy.table('garments').bulkAdd(batch)
  }
  legacy.close()
}

/** The wardrobe screen's first read: the list, then the thumbnails of the first 40 garments. */
async function measure(
  open: () => Dexie,
  thumbnails: (database: Dexie, list: Array<{ id: string }>) => Promise<Blob[]>
): Promise<StorageMeasure> {
  const listTimes: number[] = []
  const thumbnailTimes: number[] = []
  let blobBytesInList = 0
  let blobsInList = 0
  const heapGrowth: number[] = []
  let readAllBlobsMs = 0
  for (let run = 0; run < RUNS; run += 1) {
    // A new connection each time, as when the app starts.
    const database = open()
    await database.open()
    const heapStart = heapBytes()
    const start = performance.now()
    const list = await database.table('garments').orderBy('updatedAt').reverse().toArray()
    listTimes.push(performance.now() - start)
    const heapEnd = heapBytes()
    if (heapStart !== undefined && heapEnd !== undefined) heapGrowth.push((heapEnd - heapStart) / 1024 / 1024)

    const thumbnailStart = performance.now()
    const shown = await thumbnails(database, list.slice(0, GALLERY))
    await Promise.all(shown.map((thumbnail) => thumbnail.arrayBuffer()))
    thumbnailTimes.push(performance.now() - thumbnailStart)

    if (run === 0) {
      const blobs = list.flatMap(blobsOf)
      blobsInList = blobs.length
      blobBytesInList = blobs.reduce((sum, blob) => sum + blob.size, 0)
      const readStart = performance.now()
      for (const blob of blobs) await blob.arrayBuffer()
      readAllBlobsMs = performance.now() - readStart
    }
    database.close()
  }
  return {
    listFirstMs: round(listTimes[0]!),
    listMedianMs: round(median(listTimes.slice(1))),
    blobBytesInList,
    blobsInList,
    thumbnailsMedianMs: round(median(thumbnailTimes.slice(1))),
    readAllBlobsMs: round(readAllBlobsMs),
    heapGrowthMb: heapGrowth.length ? Math.round(median(heapGrowth) * 100) / 100 : null
  }
}

export async function runStorageBench(count: number, report: (message: string) => void = () => undefined): Promise<StorageResult> {
  const name = `molt-bench-${count}`
  await Dexie.delete(name)
  report(`Creando ${count} prendas en la versión 7…`)
  const seedStart = performance.now()
  await seed(name, count)
  const seedMs = performance.now() - seedStart

  report('Midiendo la lectura con las imágenes dentro de cada prenda…')
  const before = await measure(
    () => openVersion7(name),
    async (_database, list) => (list as Array<{ id: string; thumbnail: Blob }>).map((garment) => garment.thumbnail)
  )

  report('Migrando a la versión actual…')
  const migrationStart = performance.now()
  const upgraded = new WardrobeDatabase(name)
  await upgraded.open()
  const migrationMs = performance.now() - migrationStart
  const photos = await upgraded.garmentPhotos.count()
  const sampleKeys = (await upgraded.garmentPhotos.toCollection().primaryKeys()).filter((_, index) => index % 50 === 0)
  const sample = await upgraded.garmentPhotos.bulkGet(sampleKeys)
  const migrated = {
    garments: await upgraded.garments.count(),
    photos,
    thumbnails: await upgraded.garmentThumbnails.count(),
    photoBytesOk: sample.every((entry) => entry?.image.size === PHOTO_BYTES)
  }
  upgraded.close()

  report('Midiendo la lectura con las imágenes en almacenes propios…')
  const after = await measure(
    () => new WardrobeDatabase(name),
    async (database, list) => {
      const stored = await (database as WardrobeDatabase).garmentThumbnails.bulkGet(list.map((garment) => garment.id))
      return stored.flatMap((entry) => entry ? [entry.thumbnail] : [])
    }
  )
  await Dexie.delete(name)
  return {
    garments: count,
    photoBytes: PHOTO_BYTES,
    thumbnailBytes: THUMBNAIL_BYTES,
    seedMs: round(seedMs),
    before,
    migrationMs: round(migrationMs),
    migrated,
    after,
    userAgent: navigator.userAgent
  }
}

declare global {
  interface Window {
    runStorageBench: typeof runStorageBench
    storageBenchResults: Record<number, StorageResult | { error: string }>
  }
}

window.runStorageBench = runStorageBench
window.storageBenchResults = {}

const status = document.querySelector('#status')
const output = document.querySelector('#output')
/** Starts a run without waiting for it; the result appears in the page and in window.storageBenchResults. */
function start(count: number) {
  void runStorageBench(count, (message) => { if (status) status.textContent = message })
    .then((result) => { window.storageBenchResults[count] = result })
    .catch((error: unknown) => { window.storageBenchResults[count] = { error: String(error) } })
    .finally(() => {
      if (status) status.textContent = `Terminado: ${count} prendas.`
      if (output) output.textContent = JSON.stringify(window.storageBenchResults, null, 2)
    })
}
document.querySelectorAll<HTMLButtonElement>('button[data-size]').forEach((button) => {
  button.addEventListener('click', () => start(Number(button.dataset.size)))
})
