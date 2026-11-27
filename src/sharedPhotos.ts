// «Compartir → Molt»: with the app installed, another app (the gallery, a shop's app, the browser) can share photos
// to it. The system sends them to SHARE_ACTION (manifest share_target, vite.config.ts); the service worker (src/sw.ts)
// keeps them in a cache and opens the app with ?compartido=N; the app takes them from there (takeSharedPhotos) and
// opens «Una prenda» or «Varias prendas» with them, marked as from the internet.

export const SHARE_ACTION = '/compartir'
/** The form field the photos come in (manifest share_target params.files). */
export const SHARE_FIELD = 'fotos'
export const SHARE_CACHE = 'molt-shared-photos'
export const SHARED_PARAM = 'compartido'
export const SHARE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** In the service worker: keeps the shared photos (only images, of the types Molt takes) and says how many. */
export async function keepSharedPhotos(data: FormData): Promise<number> {
  const files = data.getAll(SHARE_FIELD).filter((value): value is File => value instanceof File && SHARE_TYPES.includes(value.type))
  const cache = await caches.open(SHARE_CACHE)
  for (const old of await cache.keys()) await cache.delete(old)
  await Promise.all(files.map((file, index) => cache.put(`${SHARE_ACTION}/${index}`, new Response(file, {
    headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name || `compartida-${index}`) }
  }))))
  return files.length
}

/** In the app: the photos shared to it, once (the cache is emptied), in the order they came. */
export async function takeSharedPhotos(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  const cache = await caches.open(SHARE_CACHE)
  const requests = [...await cache.keys()].sort((a, b) => Number(a.url.split('/').pop()) - Number(b.url.split('/').pop()))
  const files: File[] = []
  for (const request of requests) {
    const response = await cache.match(request)
    if (!response) continue
    const blob = await response.blob()
    const name = decodeURIComponent(response.headers.get('X-File-Name') ?? 'compartida')
    files.push(new File([blob], name, { type: blob.type || response.headers.get('Content-Type') || 'image/jpeg', lastModified: Date.now() }))
  }
  await caches.delete(SHARE_CACHE)
  return files
}
