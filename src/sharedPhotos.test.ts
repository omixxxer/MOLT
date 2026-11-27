import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepSharedPhotos, SHARE_FIELD, takeSharedPhotos } from './sharedPhotos'

// A minimal Cache Storage, as the service worker and the page share it.
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    return {
      put: async (url: string, response: Response) => { store.set(new URL(url, 'https://molt.test').href, response) },
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      match: async (request: Request) => store.get(request.url)?.clone(),
      delete: async (request: Request) => store.delete(request.url)
    }
  }
  return { open, delete: async (name: string) => stores.delete(name) }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('photos shared to Molt', () => {
  it('keeps only the images the service worker receives, and the app takes them once, in order', async () => {
    vi.stubGlobal('caches', fakeCaches())
    const data = new FormData()
    data.append(SHARE_FIELD, new File(['a'], 'camisa.jpg', { type: 'image/jpeg' }))
    data.append(SHARE_FIELD, new File(['pdf'], 'ticket.pdf', { type: 'application/pdf' }))
    data.append(SHARE_FIELD, new File(['bb'], 'detalle.png', { type: 'image/png' }))
    expect(await keepSharedPhotos(data)).toBe(2)
    const taken = await takeSharedPhotos()
    expect(taken.map((file) => [file.name, file.type])).toEqual([['camisa.jpg', 'image/jpeg'], ['detalle.png', 'image/png']])
    expect(await takeSharedPhotos()).toEqual([])
  })
})
