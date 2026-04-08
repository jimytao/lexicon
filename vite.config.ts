import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // COOP/COEP needed for SharedArrayBuffer (sql.js), but can cause
    // issues inside Tauri's WebView2 — only enable for plain browser dev
    headers: isTauri ? {} : {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
