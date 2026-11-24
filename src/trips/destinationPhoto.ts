import type { Place } from '../weather/openMeteo'
import { isDemo } from '../demo/demoMode'
import type { TripCover } from '../types/domain'

// A real photo of a trip's destination, looked for when a trip without one is opened: the main image of the place's article on
// the Spanish Wikipedia (its images are on Wikimedia Commons, with a free licence), with its author and licence,
// which must be shown with it. Only the place's name (and country, to tell places apart) goes to Wikipedia. The
// image is kept in the browser's cache, so it is downloaded once and shown offline.

const API = 'https://es.wikipedia.org/w/api.php'
export const COVER_CACHE = 'molt-trip-covers'
/** A width Wikimedia keeps ready-made thumbnails of. */
const WIDTH = 1280

type Fetch = typeof fetch

interface SearchReply { query?: { pages?: Record<string, { title?: string }> } }
interface MediaList { items?: Array<{ title?: string; type: string }> }

/**
 * Not a picture of the place: a town's main image on Wikipedia is often its flag or coat of arms (Zaragoza,
 * Valencia, Benicàssim, tried on 20-11-2026), or a map. Drawings (SVG) are left out too.
 */
const NOT_A_VIEW = /flag|bandera|bandeira|escudo|escut|coat[ _]of[ _]arms|blas[oó]n|wappen|mapa|map[ _.]|locat|situaci[oó]n|logo|seal|sello|icon|\.svg$|\.gif$/i

/** Old pictures (prints, drawings, plans, a date first): only if there is nothing else. */
const OLD = /^\d{3,4}|grabado|litograf|dibujo|plano|retrato|portrait|engraving|postal/i

/** The file name without its namespace («Archivo:», «File:»). */
const fileName = (title: string) => title.replace(/^[^:]+:/, '')

/**
 * The first photograph of the place in its article, in the article's order (the infobox first): the flag, coat of
 * arms and map that often open it are passed over, and old pictures only taken when there is nothing else.
 */
export function placeImage(titles: string[]): string | undefined {
  const photos = titles.map(fileName).filter((name) => /\.jpe?g$/i.test(name) && !NOT_A_VIEW.test(name))
  return photos.find((name) => !OLD.test(name)) ?? photos[0]
}

interface ImageReply {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        thumburl?: string
        url?: string
        descriptionurl?: string
        extmetadata?: Record<string, { value?: string }>
      }>
    }>
  }
}

function apiUrl(params: Record<string, string>): string {
  const url = new URL(API)
  for (const [key, value] of Object.entries({ action: 'query', format: 'json', formatversion: '1', origin: '*', ...params })) url.searchParams.set(key, value)
  return url.toString()
}

/**
 * Wikipedia gives thumbnails on thumb.wikimedia.org, which a page cannot download (no CORS) and which carries
 * tracking parameters; the same file is on upload.wikimedia.org, which can. Measured on 20-11-2026.
 */
export function imageAddress(url: string | undefined): string | undefined {
  if (!url) return undefined
  const address = new URL(url)
  if (address.hostname === 'thumb.wikimedia.org') address.hostname = 'upload.wikimedia.org'
  address.search = ''
  return address.toString()
}

/** Wikipedia's metadata fields are HTML; the credit is shown as text. */
export function plainText(html: string | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/\s+/g, ' ').trim()
}

async function json<T>(url: string, fetcher: Fetch): Promise<T> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Wikipedia respondió ${response.status}.`)
  return response.json() as Promise<T>
}

async function mediaList(title: string, fetcher: Fetch): Promise<string[] | undefined> {
  const response = await fetcher(`https://es.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Wikipedia respondió ${response.status}.`)
  // Some entries (galleries, icons) come without a title.
  return ((await response.json()) as MediaList).items?.flatMap((item) => item.type === 'image' && item.title ? [item.title] : []) ?? []
}

/** A photograph from the place's article: by its exact name first, else from the best search result. */
async function mainImage(place: Place, fetcher: Fetch): Promise<string | undefined> {
  const exact = await mediaList(place.name, fetcher)
  const found = exact && placeImage(exact)
  if (found) return found
  const search = [place.name, place.region, place.country].filter(Boolean).join(' ')
  const reply = await json<SearchReply>(apiUrl({ generator: 'search', gsrsearch: search, gsrlimit: '1' }), fetcher)
  const title = Object.values(reply.query?.pages ?? {})[0]?.title
  return title && title !== place.name ? placeImage(await mediaList(title, fetcher) ?? []) : undefined
}

/** Finds the photo and its credits; undefined when Wikipedia has none for the place. */
export async function findDestinationPhoto(place: Place, fetcher: Fetch = fetch): Promise<TripCover | undefined> {
  // The example wardrobe asks nothing to Wikipedia: its trip shows the drawing made on the device.
  if (isDemo()) return undefined
  const file = await mainImage(place, fetcher)
  if (!file) return undefined
  const reply = await json<ImageReply>(apiUrl({ titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(WIDTH) }), fetcher)
  const info = Object.values(reply.query?.pages ?? {})[0]?.imageinfo?.[0]
  const meta = info?.extmetadata ?? {}
  const imageUrl = imageAddress(info?.thumburl ?? info?.url)
  const license = plainText(meta.LicenseShortName?.value)
  // Free images only, and only with someone to credit.
  if (!imageUrl || !info?.descriptionurl || !license || meta.NonFree?.value === 'true') return undefined
  if (!imageUrl.startsWith('https://upload.wikimedia.org/')) return undefined
  return {
    imageUrl,
    pageUrl: info.descriptionurl,
    title: plainText(meta.ObjectName?.value) || file.replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
    author: plainText(meta.Artist?.value) || plainText(meta.Credit?.value) || 'Autor desconocido',
    license,
    ...(meta.LicenseUrl?.value ? { licenseUrl: plainText(meta.LicenseUrl.value) } : {}),
    fetchedAt: new Date().toISOString()
  }
}

async function openCache(): Promise<Cache | undefined> {
  return typeof caches === 'undefined' ? undefined : caches.open(COVER_CACHE).catch(() => undefined)
}

/** The image, from the cache or downloaded (and kept) once. */
export async function coverImage(cover: TripCover, fetcher: Fetch = fetch): Promise<Blob> {
  if (isDemo()) throw new Error('El armario de ejemplo no descarga fotos de destinos.')
  const cache = await openCache()
  const cached = await cache?.match(cover.imageUrl)
  if (cached) return cached.blob()
  const response = await fetcher(cover.imageUrl, { mode: 'cors' })
  if (!response.ok) throw new Error('No se pudo descargar la foto del destino.')
  const blob = await response.blob()
  await cache?.put(cover.imageUrl, new Response(blob.slice(0), { headers: { 'Content-Type': blob.type } })).catch(() => undefined)
  return blob
}

/** Forgets a trip's photo (when it is removed or the trip deleted). */
export async function forgetCover(cover: TripCover | undefined) {
  if (!cover) return
  await (await openCache())?.delete(cover.imageUrl).catch(() => undefined)
}
