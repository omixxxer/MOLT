import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { addPlugins, cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

// The app's service worker (offline use). Besides precaching the app, it adds the cross-origin isolation headers
// to every response it serves from its caches: without them a cached page or script loses the isolation the
// server gives, and ONNX Runtime can no longer start its threads (its worker is refused).

declare const self: {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
  skipWaiting(): Promise<void>
}

const isolation = {
  handlerWillRespond: async ({ response }: { response: Response }) => {
    if (!response || response.status === 0 || response.type === 'opaque') return response
    const headers = new Headers(response.headers)
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}

void self.skipWaiting()
clientsClaim()

addPlugins([isolation])
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// The app shell for every page, except those that must load themselves: the Google sign-in return page and the
// privacy policy (Google's consent screen links to it).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/oauth\//, /^\/privacidad/] }))

// ONNX Runtime's and MediaPipe's WebAssembly and their loaders, kept once downloaded (not precached: most visits
// never analyse a photo).
registerRoute(
  ({ url }) => /\.(?:wasm|mjs)$/.test(url.pathname) || /\/vision_wasm_internal-[\w-]+\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'molt-inference-runtime',
    plugins: [new ExpirationPlugin({ maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 }), isolation]
  })
)
