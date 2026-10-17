# dualkinema

Análisis cinemático diferido a partir de vídeo, siguiendo marcadores colocados sobre la persona (gomets de colores o bolitas reflectantes). Una o dos vistas sincronizadas y, más adelante, reconstrucción 3D. Uso clínico, docente y de investigación en fisioterapia.

**Todo el procesamiento ocurre en el navegador**: los vídeos y los datos nunca salen del dispositivo.

Estado: fase 1 (base y prototipo) en curso. Plan en [`docs/plan-fase-1.md`](docs/plan-fase-1.md). Cómo grabar y colocar los gomets: [`docs/grabacion.md`](docs/grabacion.md).

## Desarrollo

Vite + React + TypeScript + Tailwind v4. Node 22.

```
npm ci
npm run dev        # servidor local
npm test           # Vitest (núcleo)
npm run lint
npm run typecheck
npm run build      # genera dist/
```

`src/core/` es el núcleo de cálculo: TypeScript puro, sin React ni DOM, con tests. ESLint y `tsconfig.core.json` impiden que dependa del resto de la app.

## Despliegue

Cloudflare Workers con archivos estáticos (`wrangler.jsonc`), conectado al repositorio con Workers Builds: `main` → https://dualkinema.edu-gamboa-rodriguez.workers.dev, y cada rama tiene su previsualización en `https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`. GitHub Actions solo comprueba (lint, tipos, tests y build) en cada PR.
