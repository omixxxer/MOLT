import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Cross-origin isolation lets ONNX Runtime use several threads (SharedArrayBuffer): without it every model runs
// on one core. Everything the app loads is its own; Google sign-in reports back through a same-origin channel, so
// it does not need the popup's opener. Hosting must send the same headers (public/_headers).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  // Pre-bundled, ONNX Runtime's thread workers never start in the dev server; served as published, they do.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [
    react(),
    VitePWA({
      // Own service worker (src/sw.ts): it must add the isolation headers to what it serves from its caches.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        // MediaPipe's WebAssembly loader is cached when first used (src/sw.ts); local test photos never ship.
        globIgnores: ['**/vision_wasm_internal-*.js', 'test-photos/**', 'bench/**']
      },
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-48.png', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Molt — Armario virtual',
        short_name: 'Molt',
        description: 'Tu armario virtual, guardado en tu dispositivo.',
        theme_color: '#F8F6FB',
        background_color: '#F8F6FB',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        lang: 'es'
      }
    })
  ],
  // MOLT_BENCH=1 also builds the measurement pages of bench/ (never in the published build), so they can run with
  // several threads in npm run preview, as the app does in production.
  ...(process.env.MOLT_BENCH ? { build: { rollupOptions: { input: { main: 'index.html', classifier: 'bench/classifier.html', colors: 'bench/colors.html', look: 'bench/look.html', recut: 'bench/recut.html', storage: 'bench/storage.html' } } } } : {})
})
