# dualkinema

Análisis cinemático diferido a partir de vídeo, siguiendo marcadores colocados sobre la persona (gomets de colores o bolitas reflectantes). Una o dos vistas sincronizadas y, más adelante, reconstrucción 3D. Uso clínico, docente y de investigación en fisioterapia.

**Todo el procesamiento ocurre en el navegador**: los vídeos y los datos nunca salen del dispositivo.

Estado: fases 1 (base y prototipo, [`docs/plan-fase-1.md`](docs/plan-fase-1.md)), 2 (calibración y cálculos, [`docs/plan-fase-2.md`](docs/plan-fase-2.md)) y 3 (dos vistas, [`docs/plan-fase-3.md`](docs/plan-fase-3.md)) cerradas; en curso, la fase 4 (grabación con dos móviles, [`docs/plan-fase-4.md`](docs/plan-fase-4.md)): hechos el laboratorio, que mide qué da cada móvil al grabar (`?laboratorio`), la grabación con un móvil dentro de la app, el emparejamiento de dos móviles (código o QR, reloj común), la grabación a la vez con los dos el pitido de referencia de ida y vuelta (con la claqueta para cámaras arrancadas a mano) y abrir la grabación doble con el desfase ya propuesto.

Qué hace hoy, con una vista de perfil y 3 gomets en la pierna (rodilla en el plano sagital) y, si se quiere, otra de frente:
- avance frame a frame con el tiempo real de cada frame (también con fps variable), seguimiento de los gomets por color, corrección a mano con lupa y relleno de huecos cortos solo a petición;
- ángulo de rodilla crudo y filtrado (Butterworth de fase cero), velocidad y aceleración angulares, cero de referencia en un tramo estático;
- escala en metros (con un objeto de longitud conocida o entre dos gomets medidos con cinta), velocidad de cada gomet en m/s y comprobación de la longitud de los segmentos;
- gráficas en segundos y trayectoria sobre el vídeo; exportación a CSV (Excel en español o formato internacional).
- una segunda vista de frente (FPPA de la rodilla: valgo dinámico), sincronizada por un evento visual o por el audio (con la comprobación del evento), con cursor común, las dos medidas en el tiempo común (alineadas o superpuestas) y un CSV por vista con el tiempo común;
- glosario dentro de la app, con un icono junto a cada valor o aviso.

El trabajo se guarda solo en el dispositivo (IndexedDB), sin el vídeo: al volver a abrir el mismo archivo se puede recuperar. Cómo grabar y colocar los gomets: [`docs/grabacion.md`](docs/grabacion.md).

## Desarrollo

Vite + React + TypeScript + Tailwind v4. Node 22.

```
npm ci
npm run dev        # servidor local
npm test           # Vitest (núcleo)
npm run lint
npm run typecheck
npm run build      # genera dist/
npm run test:e2e   # pruebas en navegador (necesita build, ffmpeg y Chromium de Playwright; ver tests/e2e/LEEME.md)
```

`src/core/` es el núcleo de cálculo: TypeScript puro, sin React ni DOM, con tests. ESLint y `tsconfig.core.json` impiden que dependa del resto de la app.

## Instalar en el móvil

Desde Chrome para Android, menú ⋮ → «Instalar aplicación» (o «Añadir a la pantalla de inicio»), sobre la dirección de producción. Se abre sin la barra de direcciones y se actualiza sola al abrirla: no hay que reinstalar con cada versión. Si hay una versión nueva con la app ya abierta, avisa con un botón «Recargar». Las sesiones guardadas se comparten con las del navegador en esa misma dirección.

## Despliegue

Cloudflare Workers con archivos estáticos (`wrangler.jsonc`), conectado al repositorio con Workers Builds: `main` → https://dualkinema.edu-gamboa-rodriguez.workers.dev, y cada rama tiene su previsualización en `https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`. GitHub Actions comprueba cada PR y `main`: lint, tipos, tests, build y las pruebas en navegador.
