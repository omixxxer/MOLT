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
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}']
      },
      registerType: 'autoUpdate',
      includeAssets: ['wardrobe-icon.svg'],
      manifest: {
        name: 'VESTA — Armario virtual',
        short_name: 'VESTA',
        description: 'Tu armario virtual, guardado en tu dispositivo.',
        theme_color: '#F5F5EF',
        background_color: '#F5F5EF',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/wardrobe-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ],
        lang: 'es'
      }
    })
  ]
})
