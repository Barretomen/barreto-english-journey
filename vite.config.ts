import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repositoryName = env.VITE_REPOSITORY_NAME?.trim()
  const base = repositoryName ? `/${repositoryName.replace(/^\/+|\/+$/g, '')}/` : '/'

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icon.svg'],
        manifest: {
          name: 'English Journey',
          short_name: 'English',
          description: 'Sua jornada progressiva de estudos no Barreto English.',
          theme_color: '#1457d9',
          background_color: '#f3f7fb',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
          ]
        },
        workbox: {
          navigateFallbackDenylist: [/^\/rest\/v1\//, /^\/auth\/v1\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'barreto-fonts',
                expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              urlPattern: /\/rest\/v1\/(lesson_blocks|exercises|exercise_options)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'visited-lessons',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true
    }
  }
})
