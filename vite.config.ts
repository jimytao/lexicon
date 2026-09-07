import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // COOP/COEP give the dev page cross-origin isolation → SharedArrayBuffer
    // (needed by sql.js / Tesseract). Skipped for Tauri (WebView2 quirks; it
    // doesn't need the isolation the same way).
    //
    // COEP is `credentialless`, NOT `require-corp`: still unlocks SharedArrayBuffer
    // in Chromium/Firefox, but loads public cross-origin subresources (the web-search
    // result <img>s from Tavily/Brave) WITHOUT credentials instead of hard-blocking
    // any that don't send `Cross-Origin-Resource-Policy`. This app never needs
    // cookie'd cross-origin resources, so there's no functional loss.
    //
    // Scope of this header: DEV SERVER ONLY. It is not baked into `dist/`, so Tauri,
    // Capacitor (Android + iOS), and any hosted web build are unaffected. If a hosted
    // web deployment ever needs cross-origin isolation, decide its COEP there — and
    // note Safari/WebKit still doesn't support `credentialless` (would fall back to
    // no isolation, i.e. no SharedArrayBuffer).
    headers: isTauri ? {} : {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
