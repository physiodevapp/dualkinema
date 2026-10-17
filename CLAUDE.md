# CLAUDE.md — dualkinema

Guía para Claude Code al trabajar en este repositorio.

## Qué es
**dualkinema** es una web app standalone para análisis cinemático diferido a partir de vídeo, siguiendo marcadores colocados sobre la persona (gomets de colores o bolitas reflectantes). Admite una o dos vistas sincronizadas (frontal y lateral) y, en fases avanzadas, reconstrucción 3D. Uso clínico, docente y de investigación en fisioterapia.

Es un proyecto independiente de PhysiQ, aunque comparte autor, sistema de diseño y parte del conocimiento de **physiq-kinematics** (medición en directo sin marcadores, integrada en el hub de PhysiQ). Ver "Código de partida" más abajo.

## Usuario y entorno
- El usuario (Edu, fisioterapeuta y desarrollador web) trabaja **solo desde un móvil Android** con pantalla y teclado externos. No tiene entorno de desarrollo local.
- Toda prueba se hace en **Chrome para Android** sobre una versión desplegada. Cada cambio que deba probarse tiene que quedar desplegado y con la URL indicada.
- La interfaz debe funcionar bien con táctil a ancho de móvil y también en pantalla externa.

## Modelo recomendado por tipo de tarea

Antes de empezar cada tarea:
1. Clasifícala según la tabla.
2. Compara con el modelo con el que estás funcionando.
3. **Si no coincide, no empieces.** Indica el tipo de tarea y el modelo recomendado, y espera a que el usuario cambie de modelo con `/model` o confirme que quiere seguir con el actual.
4. Si coincide, empieza sin preguntar.

Si una tarea mezcla tipos, usa el modelo de la parte más exigente.

| Tipo de tarea | Modelo |
|---|---|
| Arquitectura, modelo de datos, plan de una fase | Opus 5.5 (o Fable 5.1) |
| Revisión de código heredado de physiq-kinematics antes de incorporarlo | Opus 5.5 (o Fable 5.1) |
| Algoritmo de seguimiento de marcadores | Opus 5.5 (o Fable 5.1) |
| Cálculo numérico: filtros, derivadas, ángulos, calibración | Opus 5.5 (o Fable 5.1) |
| Sincronización de relojes, alineación por audio, DLT/3D, corrección de lente | Opus 5.5 (o Fable 5.1) |
| Depurar un fallo que no se resuelve en un intento | Opus 5.5 (o Fable 5.1) |
| Revisión del código al cerrar cada fase | Opus 5.5 (o Fable 5.1) |
| Interfaz, estilos, maquetación | Sonnet 5.5 |
| Exportación (CSV, imágenes), ajustes menores, textos | Sonnet 5.5 |
| Correcciones pequeñas y bien localizadas, documentación | Sonnet 5.5 |

## Restricciones no negociables
- **Todo el procesamiento ocurre en el navegador.** Los vídeos y datos de pacientes nunca salen del dispositivo (RGPD). Nada de subir vídeos a servidores ni APIs externas.
- El único backend permitido es para **emparejar móviles** (señalización en tiempo real: Supabase Realtime o WebRTC). Por ese canal solo viajan mensajes de control y marcas de tiempo, nunca vídeo ni datos clínicos.
- Cargar librerías o binarios WASM desde una CDN está permitido (no envía datos), pero valora alojarlos en el propio sitio si se busca funcionamiento sin conexión.
- Solo recursos gratuitos.

## Stack
- **Vite + React + TypeScript**. React solo para la interfaz.
- **Núcleo de procesamiento en módulos TypeScript puros, sin dependencias de React ni del DOM** (`src/core/`): seguimiento, calibración, filtros, ángulos, sincronización, DLT. Debe poder probarse de forma aislada y reutilizarse en otros proyectos (por ejemplo, importarlo algún día desde physiq-kinematics).
- **Web Workers** para el trabajo pesado por frame (seguimiento sobre píxeles), no para cálculos triviales.
- Vídeo leído con **WebCodecs + Mediabunny** (demultiplexado MP4/MOV, tiempo real de cada frame, también el audio para la fase 3). Nunca `<video>.currentTime` como fuente de tiempos (decisión D3 de la fase 1).
- Seguimiento de marcadores en **TypeScript puro** dentro de `src/core/seguimiento`, ejecutado en un worker. OpenCV.js no se usa en la fase 1 (8–10 MB que no aportan para umbralizar color en una ventana); queda para calibración de cámara y corrección de lente, cargado de forma diferida (decisión D5).
- Vídeo (paso 3 de la fase 1): `src/core/tiempo/tablaFrames.ts` (tabla de pts ordenados, frame visible en un instante, fps medio y detección de fps variable; puro, con tests) y `src/media/video.ts` (`VideoAbierto`: abre el archivo con Mediabunny leyendo a trozos del dispositivo, construye la tabla de frames con los pts de los paquetes sin decodificar, aplica la rotación del archivo y devuelve el frame i exacto; avanzar de uno en uno reutiliza el decodificador, saltar o retroceder decodifica desde el fotograma clave anterior). `src/media` se carga con `import()` al abrir el primer vídeo, para que la portada no descargue Mediabunny. El visor (`src/ui/Visor.tsx`) pinta con «el último gana»: si llegan peticiones mientras decodifica, salta a la más reciente.
- Seguimiento (paso 4 de la fase 1): núcleo en `src/core/seguimiento/` (color, manchas, seguidor y varios marcadores; probado con imágenes sintéticas de `sintetico.ts`), worker en `src/workers/seguimiento.worker.ts` con su protocolo en `protocolo.ts`, interfaz en `src/ui/Visor.tsx` y `src/ui/visor/`. Reglas que no deben romperse: un marcador perdido tiene posición NaN y calidad 0 (nunca se inventa ni se interpola), dos marcadores en la misma mancha quedan los dos sin posición, y lo marcado a mano no se sobrescribe al seguir. Un solo umbral decide qué posición es utilizable para el análisis (`CALIDAD_MINIMA`, 0,5): lo usan el ángulo, la franja, la gráfica y el recuento de huecos (`core/seguimiento/huecos.ts`); el seguidor acepta desde 0,3 (`CALIDAD_PERDIDO`) solo para no perder la continuidad, y esas detecciones cuentan como «dudosas» en el resumen. Detalle en `docs/plan-fase-1.md`, §6.
- Gráficas con **uPlot** (paso 5 de la fase 1): `src/ui/visor/GraficaAngulo.tsx`, con la lógica pura en `src/core/graficas/rango.ts` (rango del eje Y, resumen) y `indiceMasCercano` en `core/tiempo/tablaFrames.ts`. Reglas: eje X en segundos de vídeo, un hueco corta la línea (nunca se une ni se rellena), el cursor es el frame actual y tocar la gráfica salta al frame más cercano. El visor (`Visor.tsx`, y con él uPlot) se carga con `lazy()` al abrir un vídeo, así que la portada no lo descarga. Nota para las pruebas en este entorno: uPlot falla al cargarse si `navigator.language` no es una etiqueta válida (el Chromium de la nube usa `en-US@posix`); las pruebas con Playwright deben abrir la página con `locale: 'es-ES'`.
- Cómo grabar y colocar los gomets (verdes o azules; los rojos se confunden con la piel): `docs/grabacion.md`.
- MediaPipe Tasks Vision (PoseLandmarker) como modo opcional sin marcadores.
- Vitest para el núcleo: todo cálculo numérico lleva tests con casos de valor conocido.
- Frontera del núcleo vigilada en dos sitios: `tsconfig.core.json` compila `src/core` sin la librería DOM ni tipos de Node, y ESLint (`no-restricted-imports`) impide que importe React o algo de `ui/`, `media/` o `workers/`.
- Comandos: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. La CI (`.github/workflows/ci.yml`) los ejecuta en cada PR y en `main`.
- Persistencia local en IndexedDB, con esquema propio de dualkinema (no el de PhysiQ).
- Estas decisiones pueden revisarse en la fase 1 si hay buenos motivos; si cambian, actualiza este archivo.

## Despliegue
- **Cloudflare Workers con archivos estáticos** (Workers Builds conectado al repositorio, sin secretos en el repo), para producción y previsualizaciones. Decisión D2 de la fase 1, ajustada: Cloudflare Pages aparece como «legacy» en el panel, así que se usa su sustituto. Sin código de servidor: solo los archivos de `dist/`.
  - Configuración en `wrangler.jsonc` (nombre `dualkinema`, `assets.directory: ./dist`, modo SPA, bloque `previews: {}`, que `wrangler preview` exige aunque vaya vacío). En Cloudflare: comando de build `npm run build`; despliegue `npx wrangler deploy`; previsualización `npx wrangler preview`; *Enable Preview Builds* activado. Base de Vite `/`.
  - Direcciones públicas activadas a mano en el panel (*dualkinema → Domains → Worker URL*: interruptores **Production** y **Preview**). Sin ellas el build sale bien pero el PR dice «No Preview URL».
  - Producción: `main` → `https://dualkinema.edu-gamboa-rodriguez.workers.dev`.
  - Previsualización de cada rama: `https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`, con la rama en minúsculas y los caracteres que no sean letras ni números cambiados por `-` (p. ej. `feat/visor` → `feat-visor-dualkinema.edu-gamboa-rodriguez.workers.dev`). Cloudflare la publica también como comentario en el PR. Indica siempre esta URL al terminar una tarea.
  - La app muestra al pie la rama y el commit con que se construyó (`WORKERS_CI_BRANCH`, `WORKERS_CI_COMMIT_SHA`), para comprobar que la previsualización abierta es la última.
  - Cabeceras en `public/_headers` (Workers las aplica a los archivos estáticos; permitirá COOP/COEP si algún día hace falta `SharedArrayBuffer`).
  - Desde el entorno en la nube de Claude Code, `*.workers.dev` puede no ser accesible: la comprobación en el navegador la hace el usuario.

## Convenciones de Git (las mismas que en los demás repos del usuario)
- Todo cambio en una rama `feat/<descripción>` o `fix/<descripción>` (o la rama `claude/…` que asigne una sesión de Claude Code en la nube) y se fusiona mediante PR. **Nunca hacer push directo a `main`.** (Única excepción: el commit inicial que creó `main`, autorizado por el usuario).
- Formato de commit:
  ```
  git commit -m "título corto en imperativo" -m "descripción si hace falta"
  ```
  Título de unas 72 letras como máximo; cuerpo solo cuando aporte contexto.
- **No añadir líneas de coautoría** en los commits.
- Commits pequeños y descriptivos.

## Sistema de diseño (familia PhysiQ)
- Fuentes: Outfit (texto), DM Serif Display (marca y títulos), DM Mono (etiquetas y valores numéricos).
- Iconos: `@heroicons/react/24/outline`, nunca sólidos.
- Bordes: `rounded-2xl` en paneles, `rounded-md` en botones.
- Modo oscuro por defecto.
- Color de acento de dualkinema: ámbar **`#f2a65a`** (decisión D6), distinto del `#5dadec` de physiq-kinematics y de los colores habituales de gomet. Tokens de color en `@theme` de `src/styles.css` (`fondo`, `panel`, `borde`, `texto`, `texto-2`, `acento`); usar esos, no colores sueltos.

## Modelo de datos (pensado para 3D desde el principio)
- Una **sesión** contiene una o más **vistas** (vídeos) con su desfase temporal respecto a la referencia.
- Un **modelo de marcadores** define qué marcadores existen (identificador, nombre anatómico, color esperado) y qué **articulaciones** se calculan a partir de ellos. Es configurable, no está fijado en el código.
- Cada **marcador** tiene un identificador común a todas las vistas.
- Cada vista guarda, por marcador, una trayectoria 2D: lista de `{t (s), x, y (px), calidad, editadoManual}`.
- Todo cálculo trabaja con **tiempo en segundos** (tiempo del vídeo), no con número de frame ni con `Date.now()`: los móviles graban con fps variable.
- La calibración (escala 2D, DLT o parámetros de lente) se guarda por vista.
- El cálculo de ángulos no depende del origen de los puntos: debe aceptar igual marcadores seguidos que puntos de MediaPipe.
- Implementación (`src/core`): tipos en `modelo/tipos.ts`; ángulo con signo, normalización y desenrollado en `geometria/angulo.ts`; paso de imagen al marco canónico de la vista en `geometria/canonico.ts` (único sitio donde se cambia de convención); definición declarativa, cálculo y catálogo de articulaciones en `articulaciones/`. La convención de cada articulación (segmentos en sentido distal, `signo`, `cero`) está comentada en `articulaciones/catalogo.ts` y fijada por `catalogo.test.ts`: cualquier cambio de convención debe cambiar ese test a propósito. Detalle en `docs/plan-fase-1.md`, §7.

## Código de partida: physiq-kinematics

Repo: `physiodevapp/physiq-kinematics`. Contiene piezas útiles, pero **no se copian tal cual**. Este proyecto es la ocasión de revisar la arquitectura y el análisis. Cada vez que una fase necesite una pieza de allí:

1. Lee el código original y entiende qué resuelve.
2. Evalúa si su diseño sirve para un análisis diferido, con marcadores, varias vistas y 3D futuro, o si responde a supuestos del modo en directo.
3. Propón al usuario qué se conserva, qué se rediseña y por qué, **antes de escribir la versión nueva**.
4. Escribe la versión nueva en el núcleo, con tests.

Piezas reutilizables y puntos ya detectados para revisar:

- **Cálculo de ángulos** (`public/workers/jointWorker.js`, `utils/joint.ts`, `utils/pose.ts`):
  - La convención clínica de cada ángulo está repartida en banderas `invert`, cambios de signo según orientación y articulación (p. ej. la rodilla) y un ajuste de +360° al cruzar la vertical. Debería ser una **definición declarativa por articulación** (segmentos, plano, cero anatómico, sentido positivo) con tests que la fijen.
  - Solo contempla 2D; diseñar la interfaz para que el mismo cálculo admita 3D.
  - Las articulaciones están ligadas a los nombres de puntos de MediaPipe; aquí deben salir del modelo de marcadores.
  - Usa un Web Worker para unas pocas operaciones por frame: en análisis diferido probablemente no compensa.
- **Suavizado**: media móvil de N frames. Depende de los fps, introduce retraso y no es apropiada para derivar velocidades y aceleraciones. Sustituir por un **Butterworth paso bajo de fase cero** (filtrado ida y vuelta) con frecuencia de corte en Hz.
- **Marcas de tiempo**: se generan con `Date.now()` al calcular. Aquí, siempre tiempo del vídeo.
- **Gráfica** (`components/AngleGraph`): pensada para directo (búfer fijo de 300 puntos, eje X por índice, rango Y fijo en grados, colores derivados de un hash del nombre). Reutilizar ideas visuales, pero con eje X en segundos, varias series y vistas, cursor sincronizado con el vídeo y una paleta accesible y estable.
- **Proveedor de MediaPipe** (`providers/PoseDetector.tsx`): reutilizable para el modo sin marcadores, desacoplado del contexto de cámara en directo y aplicado sobre frames de vídeo.
- **Documentación**: en physiq-kinematics el README y el CLAUDE.md siguen hablando de TensorFlow.js aunque el código ya usa MediaPipe Tasks. Aquí, mantener este archivo y el README al día en el mismo PR que el cambio.

Lo que **no** se trae: integración con el hub (`postMessage`, `BroadcastChannel`), el esquema de sesión compartido de PhysiQ en IndexedDB, rutas fijadas como `/physiq/kinematics` ni la interfaz centrada en la cámara en directo.

Si durante el trabajo detectas otras mejoras de arquitectura o de análisis (en el código heredado o en el propio dualkinema), propónlas de forma explícita en el momento en que la fase las toque, en lugar de arrastrar el diseño existente por inercia.

## Plan por fases
1. **Base y prototipo**: estructura del proyecto, despliegue con previsualizaciones, carga de un vídeo, avance frame a frame, marcar 3 gomets, seguimiento por color, ángulo articular con la nueva definición declarativa y gráfica en segundos.
2. **Calibración y cálculos**: escala en metros, Butterworth de fase cero, velocidades y aceleraciones, corrección manual de puntos, exportación CSV.
3. **Dos vistas**: carga de dos vídeos, sincronización por evento visual o por audio, línea de tiempo y cursor comunes, gráficas superpuestas.
4. **Grabación con dos móviles**: emparejamiento por código/QR, sincronización de relojes, inicio programado, pitido de referencia y ajuste fino por audio.
5. **3D**: calibración DLT con objeto de puntos conocidos, reconstrucción 3D y ángulos articulares reales.
6. **Corrección de lente, modo sin marcadores comparativo y validación**.

Trabaja **una fase cada vez**. No adelantes funcionalidad de fases futuras salvo lo necesario para no bloquearlas.

**Estado:** fase 1 **cerrada** (revisión de código, decisiones y limitaciones conocidas en `docs/plan-fase-1.md`, §12). Fase 2: plan en `docs/plan-fase-2.md`, con las decisiones D1–D8 aceptadas; se trabaja paso a paso en el orden de su tabla (cada paso indica el modelo).

## Forma de trabajar
- Al terminar cada tarea probable, indica la URL de previsualización y **qué debe probar el usuario** (lista corta y concreta: qué vídeo grabar, qué tocar, qué debería ver).
- El ajuste de umbrales y la robustez del seguimiento dependen de vídeos reales del usuario: pide ejemplos cuando haga falta en lugar de suponer.
- Al cerrar una fase: revisión de código, actualización de este archivo con lo decidido y lista de limitaciones conocidas.
- Explica las decisiones técnicas brevemente; el usuario sabe programar, pero los conceptos de biomecánica computacional pueden necesitar contexto.
