import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Workers Builds de Cloudflare expone el commit y la rama durante el build; se muestran
// en la app para saber si la previsualización abierta es la última.
const commit = process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ?? 'dev'
const rama = process.env.WORKERS_CI_BRANCH ?? 'local'

// `version.json` con el commit de este build: la app lo vuelve a pedir (sin caché) para saber si ya hay
// una versión más nueva publicada (ver `src/ui/useVersionNueva.ts`).
const versionJson: Plugin = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit, rama }) })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionJson],
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
