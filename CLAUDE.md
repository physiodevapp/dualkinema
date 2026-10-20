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

## Stack y mapa del código
- **Vite + React + TypeScript + Tailwind v4**, Node 22. React solo para la interfaz.
- **Núcleo de procesamiento en `src/core/`: TypeScript puro, sin React ni DOM**, con tests de Vitest. Debe poder probarse aislado y reutilizarse (por ejemplo, desde physiq-kinematics). Frontera vigilada en dos sitios: `tsconfig.core.json` lo compila sin la librería DOM ni tipos de Node, y ESLint (`no-restricted-imports`) le impide importar React o algo de `ui/`, `media/` o `workers/`.
- **Vídeo con WebCodecs + Mediabunny** (`src/media/`: `video.ts`, `cacheFrames.ts`, `planLectura.ts`), nunca `<video>.currentTime` como fuente de tiempos (D3 de la fase 1). `src/media` y el visor (con uPlot) se cargan con `import()` / `lazy()` al abrir el primer vídeo: la portada no los descarga.
- **Web Workers** para el trabajo pesado por frame (seguimiento sobre píxeles: `src/workers/seguimiento.worker.ts`, protocolo en `protocolo.ts`), no para cálculos triviales.
- **Seguimiento en TypeScript puro** (`core/seguimiento`). OpenCV.js no se usa (D5 de la fase 1); queda para calibración de cámara y lente, cargado de forma diferida.
- **Gráficas con uPlot** (`ui/visor/GraficaTiempo.tsx`, `PanelGrafica.tsx`, `MiniGrafica.tsx`; lógica pura en `core/graficas`).
- **MediaPipe Tasks Vision** (PoseLandmarker) como modo opcional sin marcadores (fase 6).

| Carpeta de `src/core` | Qué contiene |
|---|---|
| `modelo/` | tipos: sesión, vista, modelo de marcadores, `Muestra2D` |
| `geometria/` | ángulo con signo, normalización y desenrollado (`angulo.ts`); paso al marco canónico de la vista (`canonico.ts`, único sitio donde se cambia de convención) |
| `articulaciones/` | definición declarativa, cálculo, catálogo (convenciones fijadas por `catalogo.test.ts`) y cero de referencia (`cero.ts`) |
| `tiempo/` | tabla de frames: pts ordenados, frame visible en un instante, `indiceDeFrame`, fps mediano |
| `seguimiento/` | color, manchas, seguidor, varios marcadores con anclas, huecos, interpolación de huecos cortos, imágenes sintéticas |
| `filtros/` | Butterworth, spline, tramos y remuestreo, derivadas |
| `calibracion/` | escala en metros (dos toques o entre marcadores), constancia de los segmentos |
| `graficas/` | rango del eje Y, series por frame, trayectoria |
| `exportacion/` | CSV |
| `persistencia/` | huella del archivo, trayectorias empaquetadas, esquema con versión y migraciones |

Interfaz: `src/ui/App.tsx` (portada, apertura, recuperar), `src/ui/Visor.tsx` (estado del visor; ver la propuesta para partirlo en `docs/plan-fase-2.md`) y sus piezas en `src/ui/visor/`. IndexedDB en `src/persistencia/almacen.ts`.

El detalle de cómo quedó cada pieza (y por qué) está en `docs/plan-fase-1.md` y `docs/plan-fase-2.md`. Léelo antes de tocar una pieza.

## Reglas que no deben romperse

**Tiempo y frames**
- Todo cálculo usa el tiempo del vídeo en segundos (`tabla.tiempos`), nunca el número de frame ni `Date.now()`: los móviles graban con fps variable. El índice del frame que entrega el decodificador se busca con `indiceDeFrame` (margen de redondeo), igual en el visor y en el worker.
- La caché de frames funciona porque el `CanvasSink` del visor no usa `poolSize` (un canvas nuevo por frame): no añadírselo.

**Seguimiento y marcado** (fase 1 §6, fase 2 §5)
- Un marcador perdido tiene posición NaN y calidad 0: el seguidor nunca inventa ni interpola. Dos marcadores en la misma mancha quedan los dos sin posición.
- Lo marcado a mano no se sobrescribe al seguir y es un **ancla**: «Seguir desde aquí» se lo manda al worker, que toma esa posición como cierta y vuelve a aprender el gomet.
- «Seguir desde aquí» quita lo seguido después (no lo marcado a mano), pero si el seguimiento no llega a arrancar (gomet no reconocido, error del worker) lo devuelve.
- Un solo umbral decide qué posición es utilizable para el análisis: `CALIDAD_MINIMA` (0,5). Lo usan ángulo, franja, gráfica, filtrado y recuento de huecos. El seguidor acepta desde `CALIDAD_PERDIDO` (0,3) solo para no perder la continuidad; esas detecciones son «dudosas».
- Huecos cortos: solo a petición, entre dos posiciones fiables y de `HUECO_MAX_S` (0,2 s) como mucho; lo rellenado lleva `interpolado: true`, se ve siempre distinto (azul, a trazos) y se puede quitar.

**Cálculo** (fase 2 §1–4)
- Se filtran las coordenadas (Butterworth de 2.º orden ida y vuelta, corrección de Winter sobre la frecuencia ya deformada por la bilineal); ángulos y derivadas salen de lo filtrado. Corte de 6 Hz por defecto, de 2 a 15 Hz, limitado a 0,4·fps.
- **Nunca se filtra ni se deriva a través de un hueco**: cada tramo de frames con posición utilizable va por separado, remuestreado con spline a una rejilla uniforme sin extrapolar; extremos por reflexión impar. Un tramo de menos de `MUESTRAS_MINIMAS` (10) se filtra pero queda `corto` y no se deriva.
- Sin valor = NaN (celda vacía, «—», línea cortada), **nunca 0**: bordes de cada tramo en las derivadas, tramos cortos, huecos.
- Cero de referencia: se guarda el **tramo** y la media se recalcula; siempre se muestran el ángulo sin cero y el relativo, nunca uno en lugar del otro sin decirlo.
- Escala: `metrosPorPx` por vista; entre dos marcadores se promedia la distancia de cada frame (nunca la distancia entre posiciones medias). Los ángulos no usan la escala; sin escala no hay nada en metros.
- La convención clínica de cada articulación está en `articulaciones/catalogo.ts` y la fija `catalogo.test.ts`: cambiarla exige cambiar ese test a propósito.

**Persistencia** (fase 2 §6)
- El vídeo nunca se guarda. Cada registro lleva `esquema` (`ESQUEMA_ACTUAL`, hoy 2); uno de una versión más nueva no se abre ni se reescribe. Rellenar un hueco ya previsto (vacío válido) no sube la versión; un cambio que deje de admitir lo guardado sí, con su migración y su test.
- La huella se busca sin el nombre (`claveHuella`): Android da al mismo vídeo otro nombre según desde dónde se elija.
- No se crea sesión hasta que hay algo marcado o una escala; una vez creada, quitarlo todo también se guarda. La transacción de guardado se crea de forma síncrona con la base ya abierta (si no, Chromium la pierde al recargar).

**Interfaz** (fase 2 §9)
- Gráfica: eje X en segundos de vídeo, un hueco corta la línea, lo interpolado va a trazos en una serie aparte, y **el cursor va en una capa aparte**: cambiar de frame no llama a `redraw` (lo vigila `data-redibujos`).
- Lo que está en la barra fija del móvil (línea de posición, fila de valores, botones) **no puede cambiar de altura**, o los botones se mueven y se pierde la pulsación mantenida (prueba e2e de 340 a 440 px).
- Los paneles de las pestañas ocultas siguen montados (`hidden`): no pierden estado.
- La capa de marcado mide siempre lo mismo que el lienzo (si no, se deforman las coordenadas de los toques).
- En el escritorio (desde `lg`, 1024 px) la pantalla cabe en la altura de la ventana; por debajo de `lg` va el diseño del móvil (también una tablet en vertical).
- Se pinta «el último gana»: si llegan peticiones de frame mientras se decodifica, se salta a la más reciente.

**Pruebas**
- Todo cálculo numérico lleva tests con casos de valor conocido.
- **Toda tarea que toque el visor, el seguimiento, el worker o la gráfica ejecuta `npm run build && npm run test:e2e` antes de abrir el PR** (`tests/e2e/`, leer su `LEEME.md`): Playwright + Chromium con vídeos sintéticos generados con ffmpeg y verdad conocida. Un resultado se compara con la verdad del vídeo, no con un valor «que sale». Los elementos se localizan por rol, texto o `data-testid`, nunca por clases. Un elemento de otra pestaña existe pero no es visible hasta abrirla.
- uPlot falla si `navigator.language` no es una etiqueta válida (el Chromium de la nube usa `en-US@posix`): Playwright abre la página con `locale: 'es-ES'`.
- H.264 y HEVC reales no se pueden probar ahí (el Chromium de Playwright no los trae): se prueban en el móvil del usuario.
- Comandos: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. La CI (`.github/workflows/ci.yml`) ejecuta los cuatro primeros (`comprobar`) y las e2e (`e2e`, con los vídeos en caché) en cada PR y en `main`.

Otros documentos: cómo grabar y colocar los gomets (verdes o azules; los rojos se confunden con la piel) en `docs/grabacion.md`.

Estas decisiones pueden revisarse si hay buenos motivos; si cambian, actualiza este archivo.

## Despliegue
- **Cloudflare Workers con archivos estáticos** (Workers Builds conectado al repositorio, sin secretos en el repo), para producción y previsualizaciones. Decisión D2 de la fase 1, ajustada: Cloudflare Pages aparece como «legacy» en el panel, así que se usa su sustituto. Sin código de servidor: solo los archivos de `dist/`.
  - Configuración en `wrangler.jsonc` (nombre `dualkinema`, `assets.directory: ./dist`, modo SPA, bloque `previews: {}`, que `wrangler preview` exige aunque vaya vacío). En Cloudflare: comando de build `npm run build`; despliegue `npx wrangler deploy`; previsualización `npx wrangler preview`; *Enable Preview Builds* activado. Base de Vite `/`.
  - Direcciones públicas activadas a mano en el panel (*dualkinema → Domains → Worker URL*: interruptores **Production** y **Preview**). Sin ellas el build sale bien pero el PR dice «No Preview URL».
  - Producción: `main` → `https://dualkinema.edu-gamboa-rodriguez.workers.dev`.
  - Previsualización de cada rama: `https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`, con la rama en minúsculas y los caracteres que no sean letras ni números cambiados por `-` (p. ej. `feat/visor` → `feat-visor-dualkinema.edu-gamboa-rodriguez.workers.dev`). Cloudflare la publica también como comentario en el PR. Indica siempre esta URL al terminar una tarea.
  - La app muestra al pie la rama y el commit con que se construyó (`WORKERS_CI_BRANCH`, `WORKERS_CI_COMMIT_SHA`), para comprobar que la previsualización abierta es la última.
  - **App instalable** (`public/manifest.webmanifest`, `display: standalone`, iconos PNG de 192 y 512 px y uno maskable): instalada desde Chrome se abre sin su barra de direcciones. **Sin service worker, a propósito:** no hay copia guardada que se quede vieja (limitación 17 de la fase 2), así que la app instalada carga siempre la última versión y no hay que reinstalar tras cada cambio. Se instala **solo producción**: cada previsualización es otro sitio para Chrome (otro acceso y otro almacén). Los iconos se generan del motivo de `favicon.svg`.
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
- Modo oscuro por defecto (`color-scheme: dark`), con barras de desplazamiento finas del color del tema (`scrollbar-width` y `scrollbar-color` en `styles.css`).
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

**Estado:** fases 1 y 2 **cerradas**. Lo decidido, cómo quedó cada pieza, la revisión de código y las limitaciones conocidas están en `docs/plan-fase-1.md` (§12) y `docs/plan-fase-2.md` (§12). Siguiente: fase 3 (dos vistas), con su plan por escribir en `docs/plan-fase-3.md`.

## Ideas apuntadas (sin fase asignada)
- **Glosario / wiki dentro de la app:** explicación de cada parámetro (ángulo sin cero y relativo, filtro y corte, velocidad y aceleración, calidad, interpolado, longitud de los segmentos, precisión de la escala…) y de los avisos de la app, con enlaces desde el propio aviso o valor. Todo local, sin servidor. Para después de cerrar la fase 2 (candidata: fase 6 o un paso propio).

## Forma de trabajar
- Al terminar cada tarea probable, indica la URL de previsualización y **qué debe probar el usuario** (lista corta y concreta: qué vídeo grabar, qué tocar, qué debería ver).
- El ajuste de umbrales y la robustez del seguimiento dependen de vídeos reales del usuario: pide ejemplos cuando haga falta en lugar de suponer.
- Al cerrar una fase: revisión de código, actualización de este archivo con lo decidido y lista de limitaciones conocidas.
- Explica las decisiones técnicas brevemente; el usuario sabe programar, pero los conceptos de biomecánica computacional pueden necesitar contexto.
