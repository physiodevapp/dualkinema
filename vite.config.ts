import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Cloudflare Pages expone el commit y la rama durante el build; se muestran
// en la app para saber si la previsualización abierta es la última.
const commit = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? 'dev'
const rama = process.env.CF_PAGES_BRANCH ?? 'local'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT__: JSON.stringify(commit),
    __RAMA__: JSON.stringify(rama),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
