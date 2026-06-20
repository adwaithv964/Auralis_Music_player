import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4173',
        changeOrigin: true,
        // 60 s — allows slow iTunes / MongoDB / YouTube resolver chains to finish
        proxyTimeout: 60000,
        timeout: 60000,
      }
    }
  }
})
