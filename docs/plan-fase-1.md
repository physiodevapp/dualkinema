# Plan de la fase 1: base y prototipo

Estado: **decisiones D1–D6 aceptadas por el usuario** (2026-10-17). Pasos 1 (esqueleto) y 2 (núcleo de ángulos) fusionados. En curso: paso 3 (visor frame a frame).

Objetivo de la fase (CLAUDE.md): estructura del proyecto, despliegue con previsualizaciones, carga de un vídeo, avance frame a frame, marcar 3 gomets, seguimiento por color, ángulo articular con la definición declarativa nueva y gráfica en segundos.

Criterio de cierre: en Chrome para Android, con un vídeo grabado con el móvil de una flexión de rodilla con 3 gomets (cadera, rodilla, tobillo), el usuario carga el vídeo, marca los 3 gomets en un frame, lanza el seguimiento, corrige a mano los frames en que falle y ve la curva del ángulo de rodilla en segundos con un cursor que se mueve con el vídeo.

---

## 1. Arranque del repositorio [D1]

El repo está vacío: no existe `main`, así que no hay base contra la que abrir un PR.

- **Propuesta:** un único push directo a `main` con el commit inicial (`CLAUDE.md` + este plan), como excepción de arranque. A partir de ahí, todo por rama y PR.
- Alternativa: subir solo la rama y que crees `main` desde la web de GitHub. Funciona, pero GitHub tomaría la primera rama subida como rama por defecto y habría que cambiarla a mano.

Nombre de ramas: CLAUDE.md pide `feat/…`/`fix/…`; las sesiones de Claude Code en la nube trabajan en ramas `claude/…`. Propongo aceptar ambas y que el PR sea lo que cuenta.

## 2. Despliegue y previsualizaciones [D2]

Ajuste tras aceptar D2: al crear el proyecto, el panel de Cloudflare marca Pages como «legacy workflow», así que se usa su sustituto, **Workers con archivos estáticos + Workers Builds**. Mismo resultado (hosting estático gratuito con previsualización por rama y comentario en el PR), sin código de servidor.

- **Producción:** `main` → `https://dualkinema.edu-gamboa-rodriguez.workers.dev`, base de Vite `/`.
- **Previsualizaciones:** `https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`.
- Configuración en `wrangler.jsonc`. Conexión desde el panel: *Workers & Pages → Create application → Connect GitHub → dualkinema*; build `npm run build`, despliegue `npx wrangler deploy`, previsualización `npx wrangler preview`, *Enable Preview Builds*.
- Cabeceras: `public/_headers` con cabeceras básicas. (Para `SharedArrayBuffer`, que haría falta con OpenCV multihilo o FFmpeg.wasm, se necesitarían COOP/COEP; Workers las permite con el mismo archivo).

## 3. Estructura

```
dualkinema/
├── src/
│   ├── core/                 ← TypeScript puro: sin React, sin DOM, con tests
│   │   ├── model/            tipos de sesión, vista, marcador, trayectoria, modelo de marcadores
│   │   ├── geometry/         vectores 2D/3D, ángulo con signo en un plano
│   │   ├── joints/           definición declarativa de articulaciones y su cálculo
│   │   ├── tracking/         seguimiento de un marcador por color sobre píxeles
│   │   └── time/             tabla de frames, búsqueda por tiempo, interpolación
│   ├── workers/              decodificación + seguimiento (usa core/, sin React)
│   ├── media/                lectura del vídeo (WebCodecs), adaptador al worker
│   ├── ui/                   React: componentes, pantallas, estado de la interfaz
│   └── main.tsx
├── tests/fixtures/           vídeos/frames sintéticos pequeños
├── docs/
└── .github/workflows/        deploy de producción + CI (tsc, vitest, build)
```

Regla: `src/core` no importa nada de fuera de `src/core`. Lo compruebo con una regla de ESLint (`no-restricted-imports`) para que no se rompa sin darnos cuenta.

CI en cada PR: `tsc --noEmit`, `vitest run`, `vite build`. Así un PR roto no llega a tu móvil.

## 4. Lectura del vídeo y avance frame a frame [D3]

Es la pieza en la que más se juega la fase. El `<video>` del navegador no sirve para análisis frame a frame:

- `currentTime` no garantiza caer en un frame concreto, y con fps variable (lo normal en móviles) no hay forma de saber dónde está el frame siguiente.
- No da el tiempo exacto de cada frame mostrado.

**Propuesta: WebCodecs + un demultiplexor**, todo en el navegador (Chrome para Android lo soporta):

1. Se lee el contenedor (MP4 de Android, MOV de iPhone) y se obtiene la **lista de muestras con su marca de tiempo real (pts)**. Esa lista es la *tabla de frames* de la vista: el frame *i* tiene el tiempo `t_i` en segundos. Fps variable resuelto por construcción.
2. Para mostrar un frame se decodifica desde el keyframe anterior hasta él con `VideoDecoder`. Avanzar ±1 frame es inmediato porque el decodificador ya está colocado; saltos grandes cuestan un poco más.
3. El seguimiento recorre el vídeo de forma secuencial en un worker (lo más eficiente para el decodificador) y nunca pasa por el hilo principal.
4. Se respeta la **rotación** del vídeo (los móviles graban en horizontal y guardan la rotación como metadato). Las coordenadas se guardan en la imagen tal como se ve.

Librería para el paso 1: **Mediabunny** (TypeScript, MPL-2.0, sin dependencias, lee MP4/MOV/WebM y también el **audio**, que necesitaremos en la fase 3 para sincronizar por audio). Alternativa más veterana: mp4box.js (solo MP4/MOV, solo demux). Recomiendo Mediabunny.

Plan B si un vídeo concreto no lo decodifica WebCodecs (raro, pero hay códecs HEVC en algunos móviles): aviso claro al usuario. No meto un plan B con `<video>` en la fase 1 porque daría tiempos imprecisos sin que se note.

Memoria en Android: los `VideoFrame` decodificados ocupan mucho; se cierran en cuanto se usan y se guarda como mucho una pequeña caché alrededor del frame actual.

## 5. Modelo de datos (núcleo)

Tal como fija CLAUDE.md, pensado para 3D. Tipos iniciales:

```ts
// Tiempo siempre en segundos de vídeo.
interface Sesion { id; nombre; creada; vistas: Vista[]; modelo: ModeloMarcadores }
interface Vista {
  id; nombre;                       // 'lateral', 'frontal'…
  archivo: { nombre; tamaño; duracion; ancho; alto; rotacion };
  desfase: number;                  // s respecto a la vista de referencia (0 en la fase 1)
  orientacion: OrientacionVista;    // ver §7
  calibracion: Calibracion | null;  // fase 2
  trayectorias: Record<IdMarcador, Muestra2D[]>;
}
interface Muestra2D { t: number; x: number; y: number; calidad: number; editadoManual: boolean }
interface ModeloMarcadores {
  marcadores: { id; nombre; color?: ColorMarcador }[];
  articulaciones: DefinicionArticulacion[];
}
```

Persistencia (IndexedDB) **no entra en la fase 1**: la sesión vive en memoria y el vídeo no se copia. Si recargas, se pierde. Lo dejo para la fase 2 junto con la exportación, salvo que prefieras tenerlo ya **[D4]**.

## 6. Seguimiento por color [D5]

CLAUDE.md prevé OpenCV.js. Para gomets de color en la fase 1 propongo **no cargar OpenCV todavía** y escribir el seguimiento en TypeScript puro dentro de `core/tracking`:

- OpenCV.js pesa ~8–10 MB; para umbralizar color en una ventana pequeña y calcular un centroide no aporta nada y complica los tests.
- En TypeScript puro se prueba con Vitest sobre imágenes sintéticas con el resultado exacto conocido.
- OpenCV sigue siendo la opción para calibración de cámara y corrección de lente (fases 5–6), donde sí ahorra mucho trabajo.

Algoritmo, por marcador y frame:

1. **Aprendizaje del color:** al tocar el gomet en el primer frame, se toma una pequeña zona alrededor y se calcula su color en HSV (tono, saturación, valor) con su dispersión. Así no fijamos "rojo" en el código: vale el gomet que uses con la luz que haya.
2. **Predicción:** posición esperada a partir de las dos anteriores (velocidad constante en tiempo, no en frames, por el fps variable).
3. **Búsqueda:** en una ventana alrededor de la predicción (tamaño proporcional al gomet y a la velocidad), píxeles cuyo color se parece al aprendido → manchas conectadas → se elige la más cercana a la predicción con tamaño parecido al del gomet.
4. **Posición:** centroide ponderado de la mancha (precisión de subpíxel).
5. **Calidad (0–1):** combina parecido de color, tamaño y forma respecto al gomet inicial y distancia a la predicción. Por debajo de un umbral el frame queda marcado como *perdido* y no se inventa la posición.
6. Si se pierde varios frames seguidos, se para y te pide que lo vuelvas a marcar a mano en ese frame; desde ahí sigue.

Corrección manual: en cualquier frame puedes arrastrar un marcador; se guarda con `editadoManual: true` y el seguimiento puede relanzarse desde ahí. (La edición avanzada de trayectorias es de la fase 2; en la fase 1, lo mínimo para que el prototipo sea usable).

Los umbrales iniciales serán una suposición; **necesitaré 2–3 vídeos reales tuyos** (ver §10) para ajustarlos.

Bolitas reflectantes: con luz del flash/linterna se ven como manchas muy brillantes y poco saturadas; el mismo esquema sirve cambiando el criterio de color por brillo. Lo dejo preparado en la interfaz del algoritmo pero no lo ajusto en la fase 1.

## 7. Ángulos: definición declarativa

### Revisión del código de physiq-kinematics

Qué hace (`public/workers/jointWorker.js`, `utils/joint.ts`, `utils/pose.ts`):

- Ángulo con signo entre dos segmentos con `atan2(cross, dot)`. **Se conserva la idea** (es la forma correcta y estable).
- Luego encadena: cambio de signo según orientación de la persona (`front/back/left/right`) y lado, suma de 360° al "cruzar la vertical", bandera `invert` que resta o suma 180°, y negación extra para la rodilla. El resultado depende del orden de esos parches; no hay ningún sitio donde ponga qué es 0° ni hacia dónde es positivo para cada articulación, y no hay tests. **Se rediseña.**
- La orientación se infiere de nariz y orejas (`inferPoseOrientation`). Con marcadores no hay cara; y una inferencia que cambia de un frame a otro cambia el signo del ángulo sin avisar. **Se sustituye** por un dato explícito de la vista.
- Articulaciones atadas a nombres de MediaPipe en un `map` dentro del worker. **Se sustituye** por el modelo de marcadores.
- Media móvil de N frames y `timestamp: Date.now()`. **Se descarta** (suavizado: Butterworth en la fase 2; tiempo: siempre del vídeo).
- Worker para unas pocas operaciones por frame. **Se descarta**: en diferido el ángulo de todo el vídeo se calcula en milisegundos en el hilo principal. El worker se reserva para decodificar y seguir.

### Diseño nuevo (implementado en el paso 2: `src/core/articulaciones`, `src/core/geometria`)

```ts
interface DefinicionArticulacion {
  id: 'rodilla_sagital_der'
  nombre: 'Rodilla derecha (flexo-extensión)'
  plano: 'sagital' | 'frontal' | 'transversal'
  // Los dos segmentos se orientan en sentido distal: alineados = 0°.
  proximal: { desde: 'trocanter_der', hasta: 'epicondilo_femoral_der' }   // muslo
  distal:   { desde: 'epicondilo_femoral_der', hasta: 'maleolo_der' }     // pierna
  signo: -1          // +1 si el sentido positivo es antihorario alrededor del eje del plano
  cero: 0            // valor de signo·θ en la posición anatómica (tobillo: 90)
  positivo: 'flexión'
  negativo: 'hiperextensión'
}
```

Cálculo, igual en 2D y 3D:

```
θ     = anguloConSigno(proximal, distal, n)   // atan2((u×v)·n, u·v) tras proyectar u y v en el plano ⟂ n
valor = signo · θ − cero                      // en (−180°, 180°], y la serie se desenrolla en el tiempo
```

- **Marco canónico** (`geometria/canonico.ts`, único sitio donde se cambia de convención): las coordenadas de imagen (y hacia abajo) se pasan a un marco donde el eje del plano es siempre +z.
  - Sagital: x = hacia delante de la persona, y = arriba (si mira a la izquierda de la imagen, se refleja x).
  - Frontal: x = hacia la izquierda de la persona, y = arriba (si la cámara la ve de espaldas, se refleja x).
  - Así el mismo movimiento da el mismo ángulo grabado desde un lado o desde el otro, sin cambios de signo por orientación dentro del cálculo.
- **Orientación de la vista** explícita: `{ plano: 'sagital', mira: 'izquierda' | 'derecha' }` o `{ plano: 'frontal', ve: 'delante' | 'detras' }`. Se elige al crear la vista; nunca se infiere.
- **3D** (fase 5): los mismos puntos en 3D y `n` = eje del sistema anatómico. Un test comprueba que girar juntos puntos y normal da el mismo valor.
- **Huecos**: marcador ausente o con calidad < 0,5 → NaN en ese instante, nunca 0 ni interpolado.
- **Catálogo** (`articulaciones/catalogo.ts`): cadera, rodilla, tobillo, hombro y codo en sagital y abducción de cadera en frontal, por lado. Signos y ceros comentados en el archivo. El modelo de la fase 1 es `modeloRodilla3(lado)`: trocánter mayor, epicóndilo femoral lateral y maléolo lateral.
- El plano transversal queda declarado pero sin vista 2D que lo mida (necesitaría una cámara cenital); llegará con el 3D.

Tests que fijan la convención (casos de valor conocido): rodilla extendida = 0°, a 90° de flexión = +90°, hiperextensión = negativo; el mismo movimiento grabado mirando a la izquierda y a la derecha da la misma curva; cadera, tobillo (cero = perpendiculares) y codo; punto ausente → sin valor (nunca 0).

En la fase 1 el modelo de marcadores viene **predefinido** (rodilla sagital con 3 marcadores, derecha o izquierda); el editor de modelos llegará cuando haga falta.

## 8. Gráfica

Revisión de `components/AngleGraph` y `KinematicsReview`: búfer fijo de 300 puntos con eje X por índice, eje Y recortado a [0, máx] (la hiperextensión, negativa, desaparece) y colores por hash del nombre (cambian si cambia el identificador y no se garantiza contraste). Se reutiliza el estilo visual (fuentes, cuadrícula discreta).

Nueva: eje X en segundos de vídeo, eje Y automático con margen e incluyendo negativos, varias series, cursor vertical sincronizado con el frame actual (tocar la gráfica lleva el vídeo a ese instante), frames perdidos como huecos (nunca interpolados en silencio), paleta fija accesible (Okabe-Ito) asignada por orden en el modelo.

Librería: **uPlot** (~50 KB, MIT, muy rápida con muchos puntos y táctil). Alternativa: canvas propio como en physiq-kinematics. Recomiendo uPlot por ahorro de trabajo en zoom y escalas.

## 9. Interfaz (mínima, móvil primero)

Una pantalla:

1. Botón *Cargar vídeo* → elegir orientación de la vista (dibujo: persona mirando a izquierda / derecha).
2. Vídeo a lo ancho con barra inferior: frame anterior/siguiente (botones grandes), deslizador, tiempo `0.533 s` y nº de frame en DM Mono.
3. Paso *Marcar*: "Toca la cadera" → "Toca la rodilla" → "Toca el tobillo", con lupa al tocar (el dedo tapa el gomet).
4. *Seguir* → barra de progreso → trayectorias dibujadas sobre el vídeo; frames perdidos señalados en la barra de tiempo.
5. Gráfica debajo del vídeo (en pantalla externa apaisada, a la derecha).

Color de acento **[D6]**: propongo un ámbar `#f2a65a` (se distingue del azul de physiq-kinematics y de los colores típicos de gomet: rojo, verde, azul, amarillo intenso). Alternativa: violeta `#a78bfa`.

## 10. Qué necesito de ti

- Decisiones D1–D6 (resumen al final).
- Conectar Cloudflare (Workers Builds) al repo cuando abra el primer PR.
- **Vídeos de prueba** (cuando el visor frame a frame esté desplegado, no antes): grabados con tu móvil en horizontal, 30 o 60 fps, 5–10 s, persona de perfil haciendo 3–4 flexiones de rodilla en bipedestación o sentado, gomets en trocánter, epicóndilo femoral lateral y maléolo lateral. Uno con buena luz y fondo liso, uno con fondo cargado o ropa de color parecido al gomet. Los uso solo en tu dispositivo a través de la previsualización; si quieres que los use para tests, haría falta subirlos al repo, cosa que **no** propongo por RGPD: en su lugar genero vídeos sintéticos para los tests.

## 11. Orden de trabajo (un PR por paso)

1. **Esqueleto**: Vite + React + TS + Tailwind, ESLint con la frontera de `core/`, Vitest, CI, deploy de producción, `_headers`, README. Página vacía con fuentes y tema. → primera URL de previsualización.
2. **Núcleo de ángulos** (`geometry/`, `joints/`, `model/`) con tests. Sin interfaz.
3. **Visor frame a frame** con WebCodecs: cargar vídeo, tabla de frames, avanzar/retroceder, tiempo exacto. → pruebas en tu móvil con varios vídeos (Android MP4, si puedes también un MOV de iPhone).
4. **Seguimiento por color** (`core/tracking` con tests sintéticos + worker) y marcado de los 3 gomets.
5. **Gráfica y cursor sincronizado**; corrección manual mínima.
6. **Cierre de fase**: revisión de código, CLAUDE.md actualizado con lo decidido, lista de limitaciones conocidas.

Modelos (tabla de CLAUDE.md): pasos 2, 3, 4 y 6 → Opus; paso 5 mixto (la sincronización es poca cosa; Sonnet sirve); paso 1 → Sonnet salvo la configuración de despliegue.

---

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Arranque del repo | Un push inicial a `main` con CLAUDE.md y este plan; después, todo por PR |
| D2 | Hosting | Cloudflare (Workers con archivos estáticos, porque Pages ha pasado a «legacy») para previsualizaciones y producción |
| D3 | Lectura de vídeo | WebCodecs + Mediabunny, sin `<video>` como fuente de tiempos |
| D4 | Persistencia | Fuera de la fase 1 (sesión en memoria) |
| D5 | Seguimiento | TypeScript puro sin OpenCV en la fase 1; OpenCV para calibración más adelante (cambio de stack respecto a CLAUDE.md) |
| D6 | Color de acento | Ámbar `#f2a65a` |
