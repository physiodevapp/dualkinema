# Fase 2: calibración y cálculos

Estado: **fase 2 cerrada** (pasos 1–9). Decisiones D1–D8 aceptadas por el usuario (2026-10-17). Este documento recoge cómo quedó cada pieza y por qué; las reglas que no deben romperse están resumidas en `CLAUDE.md`. Revisión de código, pruebas con vídeos reales y limitaciones conocidas en §12.

Objetivo de la fase: escala en metros, Butterworth de fase cero, velocidades y aceleraciones, corrección manual de puntos y exportación CSV. Además, lo que la fase 1 dejó pendiente: persistencia, retroceder rápido, cero de referencia y pruebas en navegador en el repositorio (limitaciones 1, 5, 7 y 12 de `docs/plan-fase-1.md`, §12).

Criterio de cierre: con un vídeo real de sentadillas, la persona puede:
- marcar y corregir a mano donde haga falta;
- ver el ángulo de rodilla filtrado y su velocidad angular, con el cero en la postura de pie;
- calibrar la escala con un objeto de longitud conocida y ver la velocidad del tobillo en m/s;
- exportar todo a CSV;
- recargar la página sin perder el trabajo.

---

## 1. Filtrado: Butterworth paso bajo de fase cero [D1, D2] (paso 4)

Por qué: el seguimiento tiene ruido de unas décimas de píxel por frame, y al derivar ese ruido se multiplica por los fps (velocidad) o por su cuadrado (aceleración). La media móvil de physiq-kinematics no sirve: depende de los fps, retrasa la señal y deforma los picos.

- **Qué se filtra [D1]:** las coordenadas de cada marcador (x e y por separado); ángulos y derivadas se calculan después con lo filtrado. Es el procedimiento estándar con marcadores (Winter, *Biomechanics and Motor Control of Human Movement*), y las velocidades lineales necesitan las coordenadas filtradas de todos modos.
- **Filtro:** Butterworth de 2.º orden ida y vuelta (fase cero, equivalente a 4.º orden). Corrección de Winter (C = 0,802) aplicada sobre la frecuencia ya deformada por la transformación bilineal, `K = tan(π·fc/fs) / C`: a cortes bajos es la fórmula del libro y cerca de Nyquist solo así cae el −3 dB exactamente en el corte (test de 2 a 12 Hz a 30 fps).
- **Corte [D2]:** 6 Hz por defecto, de 2 a 15 Hz en pasos de 0,5; limitado a 0,4·fps (12 Hz a 30 fps), y la app lo dice. El análisis de residuos de Winter queda como mejora posible.
- **Tramos:** frames consecutivos con posición utilizable (calidad ≥ 0,5; lo marcado a mano y lo interpolado entran y conservan su marca). Nunca se filtra a través de un hueco. Tramo corto: menos de `MUESTRAS_MINIMAS` (10), más de 3 veces la longitud del filtro (la regla de scipy); se filtra igual, queda marcado y no se deriva.
- **fps variable:** cada tramo se remuestrea con spline cúbico natural a una rejilla uniforme de paso lo más cercano posible a 1/`fpsMediano`, que empieza y acaba justo en sus extremos (sin extrapolar); se filtra y se vuelve a los tiempos reales con otro spline. Con frames ya equiespaciados el resultado es el del filtro solo. No inventa datos: reparte en el tiempo lo medido.
- **Arranque:** cada pasada empieza en estado estacionario con su primer valor; los extremos se rellenan por reflexión impar (2·x₀ − x[k]) con un periodo del corte (al menos 9 muestras, nunca más de lo que el tramo permite). Una constante pasa exacta y una recta con un error de milésimas de píxel.
- **Código:** `src/core/filtros/` (`butterworth.ts`, `spline.ts`, `tramos.ts`); `fpsMediano` en `core/tiempo/tablaFrames.ts`. Sesión: `filtro: { corteHz } | null` (null = 6 Hz). Visor: `useFiltrado.ts` (no refiltra mientras se sigue: las trayectorias cambian con cada lote; se rehace al parar) y `PanelFiltro.tsx`. Coste: unos 8 ms por marcador con 3600 frames en un ordenador.
- **Tests:** −3 dB en el corte (teórico y medido), seno de 1 Hz con ruido sin desfase (< 0,1°), constante y recta, fps variable frente a equiespaciado, huecos (un salto de 200 px al otro lado no se nota), tramos cortos, marcas conservadas, ajustes. En navegador: ángulo filtrado frente al real con fps variable, sin valor dentro de un hueco y correcto a sus lados, corte guardado y recuperado.

## 2. Velocidades y aceleraciones (paso 5)

- **Cálculo:** diferencias centrales sobre la rejilla uniforme filtrada de cada tramo (`TrayectoriaFiltrada.rejillas`, de `filtrarTramoConRejilla`): v = (x[k+1] − x[k−1]) / 2h y a = (x[k+1] − 2x[k] + x[k−1]) / h², exactas con una parábola. Vuelta a los tiempos reales con spline por los nodos con derivada, sin extrapolar.
- **Sin derivada (NaN, nunca 0):** el primer y el último frame de cada tramo (con fps variable, a veces también el segundo o el penúltimo) y los tramos cortos.
- **Velocidad y aceleración angulares** (°/s, °/s²): un tramo del ángulo es la intersección de los tramos no cortos de sus marcadores; en una rejilla propia se evalúa la posición filtrada de cada marcador, se calcula el ángulo, se desenrolla y se deriva.
- **Velocidad lineal** de cada marcador: vx, vy y módulo; `velocidadMarcador(f, metrosPorPx)` da px/s sin escala y m/s con ella (la unidad va con el valor). Eje y hacia abajo, como la imagen.
- **Ruido:** la segunda derivada multiplica el ruido por (2πf)². En el vídeo sintético (ruido ≈ 0,05°), la aceleración oscila ±20 °/s² a 6 Hz y ±4 °/s² a 3 Hz; la velocidad, menos de 1 °/s a 6 Hz. El panel lo dice: si la aceleración salta, bajar el corte.
- **Código:** `src/core/filtros/derivadas.ts`.
- **Tests:** parábola exacta en la rejilla y con fps variable; seno de 1 Hz (< 1 % del pico); giro con huecos, tramo corto y perdidos; flexión de rodilla 0→90→0° con fps variable (±1 °/s, ±3 °/s²), con hueco y con tramo corto. Una derivada rota a propósito la detectan 6 tests. En navegador: velocidad angular frente a la real (±3 °/s), aceleración a 3 Hz (±10 °/s²), «—» en el primer y el último frame, velocidad del tobillo (±5 %).

## 3. Cero de referencia [D3] (paso 5)

De pie salió −4,7° porque los gomets no caen sobre los ejes articulares. Se usa una **toma estática**: se elige un tramo quieto (p. ej. los primeros 2 s de pie), la app calcula el ángulo medio y lo resta.

- **Núcleo** (`src/core/articulaciones/cero.ts`): `ceroDeReferencia(serie, tramo)` hace la media del ángulo filtrado del tramo (extremos incluidos, sin huecos), desenrollada para que una postura cerca de ±180° no dé 0, y su desviación típica; `relativoAlCero` = normalizar(ángulo − media).
- **Se guarda el tramo, no la media:** `ceros: { [idArticulacion]: { desde, hasta } }` en segundos, en cada vista; la media se recalcula si cambia el corte o se corrige un marcador. `{}` = sin cero.
- **Siempre se muestran** el ángulo sin cero y el relativo, nunca uno en lugar del otro; con la desviación típica del tramo y un aviso por encima de 2° (`DESVIACION_AVISO`: no parece quieto).
- **Visor** (`PanelCinematica.tsx`, pestaña «Análisis»): «Primeros 2 s», «Inicio aquí» / «Fin aquí», «Quitar».
- **Tests:** media y desviación conocidas, huecos ignorados, cerca de ±180°, tramo sin ángulo, validación del esquema. En navegador: media real de los primeros 2 s, relativo = sin cero − media, guardado y recuperado, «Quitar».

## 4. Escala en metros [D4] (paso 6)

- **Dos toques** (`src/core/calibracion/escala.ts`): un objeto de longitud conocida en el plano del movimiento; `EscalaPlano` (objeto, extremos `a`/`b` en px, `longitudM`, `t` del frame), `metrosPorPx` = longitud / distancia, `crearEscala` (al menos 20 px, de 1 cm a 20 m), `esCalibracion` (validación de lo guardado). El objeto (cinta, palo, regla u otro) no cambia el cálculo: da la longitud de partida, el consejo y queda anotado [D4].
- **Precisión por el marcado** = √2 · 1 px / distancia; por encima del 1 % se aconseja un objeto más largo o la cámara más cerca. No incluye lo que suele pesar más (objeto fuera del plano), que la app explica: a 3 m, 10 cm más cerca o más lejos ya son un 3 %. Sin corrección de lente (fase 6), los bordes de la imagen tienen algo de distorsión.
- **Entre dos marcadores** (`objeto: 'marcadores'` con `entre`): dos marcadores de la articulación (por defecto rodilla–tobillo), un tramo (el del cero, los primeros 2 s o un frame) y la distancia medida con cinta entre los centros de los gomets. `medirEntreMarcadores` promedia la **distancia de cada frame**: la distancia entre posiciones medias se acorta si el segmento gira (101,8 px en vez de 120 en el vídeo sintético). Precisión = máx(desviación/√n, √2·0,5 px/√n, 0,25 px)/distancia, sin contar la cinta. Se avisa si en el tramo hay frames sin los dos marcadores, y se ofrece «Rehacer» si ahora hay más que al guardar.
- **Longitud de los segmentos** (`core/calibracion/segmentos.ts`, `constanciaSegmento`): mediana, variación, máximo (con su frame) y frames que se apartan más de un 3 %, con lo filtrado; `relativa` por frame para la gráfica (banda de ±3 %). Si cambia, el segmento sale del plano, los gomets se deslizan o el seguimiento falla.
- **Uso:** `useFiltrado` recibe `metrosPorPx`; los ángulos no lo usan. Mientras se calibra con dos toques, tocar el vídeo coloca extremos (sin buscar gomet; el tercero mueve el más cercano) y no mueve marcadores. Se guarda en `calibracion` de la vista.
- **Tests:** m/px conocidos, m/s a velocidad conocida, incertidumbre y su aviso, entre marcadores (medias, un solo frame, segmento girando), constancia (rígido, acortado al salir del plano), esquema. En navegador: objeto y longitud de partida, aviso con 50 px, tercer toque, mm/px, m/s del tobillo (±5 %), guardado, recuperado y «Quitar»; entre marcadores (120 px reales); segmentos a 0 % ± 1 %.

## 5. Corrección manual, huecos cortos y caché de frames [D5] (paso 3)

- **Corregir:** se elige el marcador y se arrastra con la **lupa**; al soltar se ajusta al centro del gomet. Si no se reconoce un gomet (tapado, movido), «Colocarlo aquí a ojo», sin ajuste. Una marca a mano se puede quitar. Arrastrar sin elegir antes no se hace: el vídeo tendría que bloquear el desplazamiento de la página.
- **Lupa** (`src/ui/visor/lupa.ts`, `LienzoVideo.tsx`): 160 px, abarca un 7,5 % del lado menor del vídeo (40 px como mínimo y al menos 2× lo que ya se ve); el gomet se busca en medio campo de la lupa (`aprenderMarcador(…, { radioSemilla })`): si se ve en la lupa, se encuentra; con dos, el más cercano al dedo. Mientras se arrastra, un anillo marca el gomet al que irá el marcador; sin anillo, la cruz sale roja. Las anclas y el inicio del seguimiento usan el radio por defecto, pequeño. Antes el gomet se buscaba a unos 13 px del vídeo del dedo: 3–4 px de pantalla en un vídeo 1080.
- **Anclas:** «Seguir desde aquí» manda al worker las marcas a mano posteriores; `SeguidorMultiple.procesar(t, leer, anclas)` toma esa posición como cierta y vuelve a aprender el gomet (`estadoEnAncla`). Marcado a ojo: conserva el color aprendido antes. La velocidad previa solo se mantiene si el ancla cae a menos de dos radios de lo previsto (si no, lo seguido antes estaba mal y su velocidad también). Lo seguido después del frame de partida se quita al pulsar, y se devuelve si el seguimiento no arranca (paso 9).
- **Huecos cortos [D5]** (`core/seguimiento/interpolar.ts`): botón «Rellenar N huecos cortos», solo entre dos posiciones fiables y de 0,2 s (`HUECO_MAX_S`) como mucho, nunca en los extremos. Hermite cúbico en el tiempo real con la pendiente de cada lado por la parábola de tres posiciones (exacto a velocidad constante; 0,31 px con un giro de 1 Hz y 628 px/s; con dos puntos daba 1,4 px). Lo rellenado lleva `interpolado: true`, calidad 1 para que el análisis lo use, y se ve en azul en la franja (`--color-interpolado`), a trazos en la gráfica y en un círculo a trazos sobre el vídeo. «Quitar lo interpolado» lo devuelve a huecos (como perdidos). El esquema pasó a la versión 2.
- **Caché de frames** (`src/media/cacheFrames.ts`) y **plan de lectura** (`planLectura.ts`): `VideoAbierto` guarda los últimos frames decodificados, unos 160 MB (`capacidadCache`: de 8 a 120 frames; 45 a 720p, 20 a 1080p). Al abrir apunta los fotogramas clave; al retroceder pide a Mediabunny desde el clave (o desde lo que cabe en la caché), así que los frames de paso quedan en la caché y los siguientes pasos atrás no decodifican. Funciona porque el `CanvasSink` del visor no usa `poolSize`.

## 6. Persistencia en IndexedDB [D6] (paso 2)

- **Qué se guarda,** solo, sin pedirlo: marcado y trayectorias, orientación, modelo de marcadores, filtro, ceros y escala. **El vídeo no** [D6]: la sesión se asocia a una huella del archivo y al reabrirlo se ofrece recuperar.
- **Núcleo** (`src/core/persistencia/`): `huella.ts` (nombre, tamaño, duración en ms y número de frames; se busca por `claveHuella`, **sin el nombre**, porque el selector de fotos de Android entrega el mismo vídeo como «1000012345.mp4»; si solo cambia el nombre se ofrece avisando), `trayectorias.ts` (por marcador, arrays tipados con solo los frames con muestra, exactos en Float64; perdido = NaN con calidad 0, distinto de «sin muestra») y `esquema.ts` (`ESQUEMA_ACTUAL` = 2; `prepararGuardado`, `leerCabecera` / `leerDatos` que migran y validan; la migración 1 → 2 añadió `interpolado` y `resumen.interpolados`, con test).
- **Base** `dualkinema` (`src/persistencia/almacen.ts`) con dos almacenes: `sesiones` (cabecera ligera, índice `porClave`) y `trayectorias` (se leen solo al recuperar). Uno de una versión más nueva no se abre ni se reescribe (sale en la lista para poder borrarlo).
- **Cuándo** (`src/ui/visor/useGuardado.ts`): 1 s tras el último cambio, 3 s como mucho mientras sigue, y en el acto al ocultar la página o cerrar el visor. No crea sesión hasta que hay algo marcado o una escala; una vez creada, quitarlo todo también se guarda (paso 9). La transacción se crea en el mismo manejador, con la base ya abierta: creada unas microtareas después, Chromium la perdía al recargar (lo cazó una e2e). Se pide almacenamiento persistente (`navigator.storage.persist()`).
- **Recuperar:** al abrir un vídeo con trabajo guardado («Recuperar el trabajo» o «Empezar de cero») o desde «Continuar» en la lista de la portada (solo acepta el vídeo de esa sesión); «Borrar» con confirmación. Se usa la cabecera recién leída (paso 9).

## 7. Exportación CSV [D7] (paso 7)

- **Núcleo** `src/core/exportacion/csv.ts` (`construirCsv`, `angulosPorFrame`, `nombreArchivoCsv`) y `src/ui/visor/PanelExportar.tsx` (descargar siempre; «Compartir» con el menú de Android si el navegador puede compartir archivos). Todo en el dispositivo.
- **Una fila por frame:** `t_s`, `frame`; por marcador `x_px`, `y_px`, `calidad`, `manual`, `interpolado`, `filtrado_x_px`, `filtrado_y_px`, con escala `filtrado_x_m`, `filtrado_y_m`, y `velocidad_m_s` (o `_px_s`); del ángulo, crudo, filtrado, relativo, velocidad y aceleración. Las posiciones en metros son las filtradas (origen en la esquina, y hacia abajo).
- **Cabecera** de líneas `# clave;valor`: archivo, fps, vista, filtro pedido y aplicado, articulación, cero, y la escala completa (objeto, longitud, mm/px, incertidumbre, origen y extremos).
- **Reglas:** celda vacía = sin valor, nunca 0; sin escala no hay columnas en metros. Formato [D7] `es` (`;`, coma decimal, BOM para Excel; por defecto) o `internacional` (`,`, punto, sin BOM); se recuerda en `localStorage`.

## 8. Pruebas en navegador [D8] (paso 1)

`tests/e2e/` (con su `LEEME.md`) y el trabajo `e2e` de la CI, en paralelo a `comprobar`:
- Vídeos sintéticos generados con Node + ffmpeg (VP9) con verdad conocida; el de «frame exacto» codifica el número de frame en bloques. La CI los guarda en caché por la huella de `videos.mjs` (paso 9): generarlos lleva unos 4 min.
- 92 pruebas al cierre (20 al empezar la fase); se localizan los elementos por rol, texto o `data-testid`.
- Roturas hechas a propósito (signo de la rodilla, gráfica que salta 5 frames, no guardar al ocultar, no enviar anclas, caché desplazada en uno, lupa sin radio de búsqueda) son detectadas.
- Fallo real encontrado al escribirlas: el error de marcado salía encima del vídeo y el siguiente toque caía en él. Ahora sale debajo.
- Límite: el Chromium de Playwright no decodifica H.264/HEVC; los vídeos de móvil reales se prueban a mano.

## 9. Interfaz del visor (paso 8)

**Gráfica** (`PanelGrafica.tsx`, `GraficaTiempo.tsx`; núcleo en `core/graficas/`):
- Paneles de uPlot uno debajo de otro con el mismo eje X (segundos de vídeo, un valor por frame) y cursor: ángulo crudo (ámbar, con puntos) y filtrado (línea clara), velocidad angular en °/s (panel aparte, no un segundo eje que mezcle ° y °/s) y longitud de los segmentos en %. Un botón por serie la muestra u oculta y da su valor en el frame actual (`serie-<id>`, `valor-serie-<id>`); un panel sin series no se dibuja; los segmentos empiezan ocultos.
- Un hueco corta la línea; lo interpolado va a trazos en una serie aparte (también en lo filtrado y la velocidad): `seriePorFrame` y `partirInterpolado`. `rangoY` con alto mínimo (40 °/s en la velocidad, 10 % en los segmentos).
- **Cursor en una capa aparte** (dos elementos movidos con `transform`): cambiar de frame no llama a `redraw` (`data-redibujos` y una e2e lo vigilan). Medido con 1800 frames y la CPU a ×4: la gráfica pasó de 31 a 7 ms por frame.
- Tocar o arrastrar cualquier panel salta al frame más cercano (`indiceMasCercano`).

**Trayectoria completa sobre el vídeo** (`core/graficas/trayectoria.ts`, `ControlTrayectoria.tsx`): interruptor y marcadores elegidos en la pestaña «Marcar»; posiciones filtradas, cortada en los huecos, lo interpolado a trazos; un `Path2D` por marcador rehecho solo cuando cambia lo filtrado. La estela corta (`ESTELA`, 20 frames, por detrás en el sentido del recorrido) sigue. Es la trayectoria en la imagen: solo equivale al recorrido físico en el plano de la cámara.

**Pestañas** (`Pestanas.tsx`), en el escritorio y en el móvil: «Marcar» (marcadores, seguimiento, huecos, trayectoria), «Análisis» (filtro, velocidad y cero, exportar), «Escala» (escala y longitud de los segmentos) y «Vídeo» (datos del vídeo). Los paneles ocultos siguen montados (`hidden`): no pierden estado. Un punto en una pestaña no abierta avisa (`aviso-pestana-<id>`, motivo en `aria-label`): huecos (Marcar), cero con desviación alta (Análisis), escala entre marcadores que se puede rehacer (Escala).

**Escritorio (desde `lg`, 1024 px): la pantalla cabe en la altura de la ventana.** Rejilla de tres columnas: vídeo con sus controles (`1,5fr`), gráfica completa (`1fr`, paneles que se reparten el alto con `alto='llenar'`, botones de serie en una fila deslizable, sin notas) y herramientas (22 rem); `main` de 90 rem en el visor. El vídeo tiene un tope de alto (`max(14rem, 100dvh − 25rem)`). La columna de herramientas (`columna-herramientas`) mide lo mismo que la fila del vídeo y la gráfica (mínimo 34 rem): su contenido va en una caja absoluta con la tira de pestañas y **una sola tarjeta** (`panel-herramientas`, `relative`) que se desplaza por dentro; los paneles de dentro pierden su caja y se separan con una línea. Probado sin scroll a 1280 × 900 y 1920 × 1000, con vídeo horizontal y vertical y los segmentos encendidos. Coste: la gráfica es más estrecha (unos 330 px a 1280) y sin las notas de debajo.

**Móvil y tablet en vertical (por debajo de `lg`):**
- **Vídeo pegado con su gráfica** (`visor-fijo`, `sticky top-0`; la columna izquierda es `contents` para que el `sticky` dure toda la página): vídeo con tope de 30 dvh y `MiniGrafica` (ángulo, velocidad o las dos normalizadas a «% del máximo», solo para ver si coinciden en el tiempo). La tira de pestañas se pega justo debajo (`--alto-fijo`) durante todo el desplazamiento, sin borde propio, con fondo opaco y un degradado por debajo. La gráfica completa no va debajo (era otra pantalla de scroll): solo en «Solo gráficas»; sigue montada pero oculta y no se redibuja con cada lote mientras no se ve (`pendientes`).
- **Barra fija inferior** (`barra-fija`): línea de posición en una fila, fila de valores (ángulo, relativo, °/s, °/s²) y botones de 44 px, en unos 128 px a 432 px de ancho; la página deja debajo su altura medida (`--alto-barra` en la raíz y `padding-bottom` de `main`, para que el pie no quede tapado) y el `safe-area` de Android. **Nada en la barra cambia de altura** (prueba e2e de 340 a 440 px). Desde `lg` es `contents`.
- **Vistas ampliadas** (estado `vista` en memoria): `video` (vídeo grande hasta la barra, con la tira compacta de marcadores, «Seguir» / «Parar», el último aviso, la trayectoria (`trayectoria-compacta`), el deslizador y, solo cuando hacen falta, «Quitar la marca a mano», «Rellenar N huecos cortos», «Quitar lo interpolado» e «Ir al primer frame con hueco» (`extras-compactos`)) y `graficas` (`vista-graficas`, la gráfica completa sin desplazarse: los paneles se reparten el alto, mínimo 110 px por panel). Botones `ampliar-video` / `reducir-video` y `ampliar-graficas` / `reducir-graficas`. El error de un toque va dentro del vídeo grande. La capa de marcado mide siempre lo mismo que el lienzo (`LienzoVideo`, `llenar`: un tope calculado, no alturas porcentuales, que estiraban la capa y deformaban las coordenadas).
- **Progreso del seguimiento** (paso 9, tras probarlo en el móvil): sin barra naranja aparte; el avance se ve en la franja de estado del deslizador, que se va poniendo verde, y «Parar» lleva el porcentaje (`progreso-seguimiento`, ancho fijo). Vale para el vídeo grande, la vista mixta y el escritorio.
- **Deslizador de frames:** una sola barra de 28 px (`deslizador-frames`; tirador de 14 px) cuya pista es la franja de estado (`BandaFrames`: seguido, perdido, a mano, interpolado), que se dibuja con el ancho que tenga y se rehace al cambiar de tamaño (oculta mide 0).

## 10. Lectura del vídeo al avanzar y retroceder (pasos 3 y 4)

Manteniendo pulsado, tras unos segundos cada frame tardaba 130–200 ms. Dos fallos:
- **Hacia delante:** si un frame tardaba más que la repetición (70 ms), «el último gana» se saltaba uno, y cualquier petición que no fuera la siguiente volvía al fotograma clave. Ahora, sin fotograma clave entre medias, se sigue decodificando hacia delante.
- **Hacia atrás:** `CanvasSink.canvases(t)` solo entrega desde t, así que la caché no se llenaba con los frames de paso. Ahora se pide desde el clave (o lo que cabe en la caché).

Junto al número de frame se ven los ms y cómo salió (`caché`, `seguido`, `clave`; `data-testid="lectura"`).

---

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | Pruebas e2e en el repo y en la CI | Sonnet |
| 2 | Persistencia en IndexedDB | Opus |
| 3 | Corrección manual con anclas, huecos cortos y caché para retroceder | Opus |
| 4 | Butterworth de fase cero, remuestreo y tramos | Opus |
| 5 | Velocidades y aceleraciones, y cero de referencia | Opus |
| 6 | Escala en metros | Opus |
| 7 | Exportación CSV | Sonnet |
| 8 | Gráfica y trayectoria (parte A); pestañas, barra fija y distribución (parte B) | Sonnet |
| 9 | Cierre de fase: revisión, documentación y limitaciones | Opus |

## Resumen de decisiones (aceptadas)

| | Decisión | Resultado |
|---|---|---|
| D1 | Qué se filtra | Las coordenadas de los marcadores; ángulos y derivadas, después |
| D2 | Frecuencia de corte | 6 Hz por defecto, de 2 a 15 Hz |
| D3 | Cero de referencia | Media de un tramo estático elegido; se muestran sin cero y relativo |
| D4 | Objeto de calibración | El que haya, en el plano del movimiento; también entre dos marcadores medidos con cinta |
| D5 | Interpolar huecos cortos | Solo a petición, ≤ 0,2 s, siempre marcado |
| D6 | Persistencia | IndexedDB sin el vídeo; al reabrir el mismo archivo, recuperar |
| D7 | Formato CSV | `;` y coma decimal por defecto; el internacional como opción |
| D8 | Pruebas e2e | En el repo y en la CI |

## 11. Propuesta: partir `Visor.tsx` sin cambiar el comportamiento (no hecho)

`src/ui/Visor.tsx` tiene unas 1.500 líneas: navegación por frames, worker de seguimiento, marcado, escala, filtrado, guardado, distribución del móvil y del escritorio y el JSX de todo. Funciona y está cubierto por las e2e, pero cada cambio obliga a leerlo entero y React reconcilia todo el árbol en cada frame (ningún panel usa `memo`). Propuesta en pasos pequeños, **un PR cada uno o dos**, cada uno sin cambiar nada visible:

Reglas para todos los pasos: se conservan todos los `data-testid`, el orden del DOM y las clases; los envoltorios `max-lg:contents` / `lg:contents` no admiten cajas nuevas (los componentes nuevos devuelven fragmentos); cada paso pasa `lint`, `typecheck`, `test`, `build` y `test:e2e`.

| Paso | Qué sale de `Visor.tsx` | Riesgo | Coste | Lo protegen (e2e) | Modelo |
|---|---|---|---|---|---|
| 0 | Ayudas sueltas: `visor/formato.ts` (`fmt`, `grados`, `valorEn`, `hora`, motivos de hueco), `visor/capa.ts` (`lectorDeCanvas`, `dibujarSegmentoEscala`), `BotonPaso` y `TextoGuardado` | nulo | 30 min | todas | Sonnet |
| 1 | Componentes sin estado que hoy están **dos veces** (tira compacta del vídeo grande y panel «Marcar»): `SelectorMarcadores`, `BotonSeguir`, `AccionesHuecos`; y `ErrorToque`, `DeslizadorFrames`, `ResumenGrafica`, `DatosVideo` | bajo | 1–2 h | marcado, lupa, corrección manual, huecos cortos, vistas ampliadas, deslizador | Sonnet |
| 2 | Funciones puras: `dibujarCapa` (estela, marcadores, escala), `caminosTrayectoria` y `datosCsv` (este a `core/exportacion`, con tests de Vitest) | bajo | 1 h | estela, trayectoria, escala, CSV | Sonnet |
| 3 | `useVistaMovil`: vista (`mixta`/`video`/`graficas`), ancho `lg`, alturas medidas (`--alto-barra`, `--alto-fijo`), bloqueo del scroll | medio (distribución) | 1 h | barra fija 340–440 px, pestañas en el móvil, vídeo pegado, vistas ampliadas, escritorio sin scroll | Sonnet |
| 4 | `useNavegacionFrames(video)`: lienzo, pedido / mostrado / deseado, «el último gana», ms y modo de lectura, sentido, teclado | medio (asíncrono: se mueve tal cual) | 1 h | frame exacto con fps variable, teclado, mantener pulsado, caché al retroceder, avanzar saltando | Opus |
| 5 | `useTrayectorias`: la ref, `version` y mutadores que suben la versión por dentro (`poner`, `quitar`, `aplicarLote`, `borrarDespuesDe`, `rellenarCortos`, `quitarInterpolados`); estados de frame, huecos cortos | medio | 1–2 h | huecos cortos, corrección manual, gomet tapado, persistencia | Opus |
| 6 | `useAnalisis`: ajustes del filtro, ceros, serie, filtrado, cero, constancia de segmentos y series de la gráfica. Es el sitio para que la fila de valores y la gráfica lean **la misma** serie (hoy el ángulo crudo y el filtrado se calculan por dos caminos) | medio | 1–2 h | ángulo y filtrado frente a la verdad, velocidad, cero, segmentos, CSV | Opus |
| 7 | `useEscala`: calibración, borrador, toques en los extremos, medida entre marcadores y su «Rehacer» | medio | 1 h | los tres bloques de escala y el CSV con escala | Opus |
| 8 | `useSeguimiento` (worker creado una vez, mensajes, devolver lo quitado si no arranca) y `useMarcado` (marcador elegido, error del toque, colocar, previsualizar, quitar) | medio-alto (worker y cierres) | 2–3 h | seguimiento verde y rojo, gomet tapado, anclas, «no arranca», persistencia a medio marcar, vistas ampliadas | Opus |
| 9 | Componentes grandes: `PanelMarcar`, `PanelAnalisis`, `BarraPosicion` (altura fija); después, `memo` en los paneles con props estables | alto (distribución) | 2 h | barra fija, pestañas, columna de herramientas, escritorio sin scroll, barras de desplazamiento | Sonnet |

Total: unos 2–3 días repartidos. Orden recomendado: 0–2 primero (quitan la duplicación sin tocar estado), luego 4, 5 y 8, que son los que más se tocarán en la fase 3 (dos vídeos = dos navegaciones, dos juegos de trayectorias y un seguimiento por vista). **Recomendación: hacerlo al empezar la fase 3, antes de duplicar nada por la segunda vista**, no como tarea suelta.

Antes del paso 8 conviene añadir las e2e que hoy faltan: «Parar» a mitad (lotes y aviso), seguir de nuevo desde un frame intermedio de un vídeo ya seguido, y que la gráfica pequeña conserve su modo.

## 12. Cierre de la fase 2

### Revisión de código (paso 9)

Revisado todo `src/` (unas 8.200 líneas más 2.500 de tests unitarios) y `tests/e2e/`: núcleo (filtrado, derivadas, cero, escala, segmentos, huecos cortos, CSV, persistencia), worker, protocolo y lectura del vídeo, e interfaz (`Visor.tsx`, `src/ui/visor/`, `App.tsx`). Se ha buscado sobre todo lo que puede dar un resultado equivocado sin avisar; cada hallazgo se ha comprobado con una entrada concreta.

**Corregido en el PR de cierre** (cada uno con su prueba, comprobada fallando sin el arreglo):

1. **«Seguir desde aquí» perdía lo seguido si el seguimiento no arrancaba (grave).** Al pulsar se quitaba lo seguido desde ese frame hasta el final y, si el worker no reconocía un gomet en el frame de partida (p. ej. marcado a ojo con el gomet tapado; el seguidor exige forma de gomet para empezar, pero no para seguir), solo salía «No reconozco…»: la franja quedaba vacía, la gráfica cortada y el guardado automático lo hacía permanente en 1 s. Ahora lo quitado se guarda aparte hasta que llega el primer lote y se devuelve si llega `fin 'inicio'`, un error o «Parar» antes de nada. Prueba e2e con el vídeo del gomet tapado.
2. **Un worker que no carga dejaba el visor en «siguiendo» para siempre.** Pasa, por ejemplo, si se publica una versión nueva con la app abierta (el archivo del worker anterior ya no existe) o si Android cierra el worker: no llegaba ningún mensaje, «Parar» no hacía nada y no se podía marcar. Ahora `onerror` para el seguimiento, devuelve lo quitado y lo avisa.
3. **«Colocarlo aquí a ojo» marcaba el frame del toque, no el que se veía.** El error de un toque seguía abierto al cambiar de frame (y durante el seguimiento), y su botón ponía la marca a mano en el frame anterior, con sus coordenadas; durante el seguimiento, además, esa marca no llegaba al worker como ancla. Ahora el error se quita al cambiar de frame y al seguir. Prueba e2e.
4. **Quitar lo único que había no se guardaba.** En una sesión ya guardada que solo tenía una escala o una marca a mano, quitarla no llegaba a escribirse (la regla «no crear sesión vacía» también se aplicaba a las ya creadas) y al recuperar volvía. Ahora, una vez creada la sesión, quitarlo todo se guarda. Prueba e2e.
5. **Recuperar mezclaba la cabecera de la lista con los datos recién leídos.** Con dos pestañas, la escala, el cero o el filtro podían ser los de antes y las trayectorias las nuevas. Ahora se usa la cabecera recién leída; y si se cambia de vídeo mientras se lee, la recuperación se descarta (abría el visor con el vídeo anterior ya cerrado).
6. **Las flechas sobre el deslizador del corte cambiaban de frame,** no el corte: con teclado no se podía ajustar. Prueba e2e.
7. **El worker casaba cada frame con su índice sin el margen de redondeo que usa el visor** (`video.ts`) y mandaba su propio `t`. Con un tiempo un pelo por debajo del de la tabla, la muestra del frame k caía en k−1. Hoy no se ha visto con vídeos reales (Mediabunny da el mismo tiempo que el paquete), pero la gráfica empareja por `t` exacto. Ahora los dos usan `indiceDeFrame` (núcleo, con test) y el worker manda el `t` de la tabla.
8. Accesibilidad: el error del toque se anuncia (`role="alert"`) y el deslizador de frames dice «frame N de M, t s» (`aria-valuetext`).

**Encontrado, decidido y corregido después del PR de cierre** (cambiaban cálculos o datos; el usuario eligió hacer A, B y D antes de la fase 3):

- **A. El ángulo de la gráfica, del resumen, del cero y de la columna «crudo» del CSV podía quedar desplazado 360° respecto a la fila de valores y las columnas «filtrado» y «relativo».** La serie se desenrollaba desde el primer frame (`serieAngular`) y el valor del frame se recalculaba aparte, normalizado a (−180°, 180°]: con un hombro de 185° a 0°, la gráfica marcaba de −175° a −360° y la fila de −175° a 0°. No afectaba a la rodilla. **Hecho:** `centrarVueltas` (`geometria/angulo.ts`) resta a la serie desenrollada el múltiplo de 360° que deja el centro de su recorrido ((mín + máx)/2) en [−180°, 180°] (centrar por la mediana movía también una serie que ya estaba bien, como 170° → 190°); la fila, los paneles y las columnas del CSV leen esa misma serie (desaparece `anguloEn`, el segundo camino), y la media del cero queda en la misma vuelta que la serie: el relativo es la resta directa, de modo que un hombro a 185° con el cero en −2° da 187°, no −173°. Tests: serie de 185° a 0°, serie de 170° a 190° sin tocar, huecos, cero y relativo más allá de 180°.
- **B. Con fps constantes, el segundo o el penúltimo frame de un tramo se quedaban a veces sin velocidad** (10–30 % de los tramos según la escala de tiempos del archivo): un nodo de la rejilla salía un pelo por encima del tiempo real del frame y la comparación exacta lo dejaba fuera. Nunca salía un 0 ni un valor falso, solo celdas vacías de más. **Hecho:** margen de una millonésima del paso en `aTiemposReales`, evaluando el spline dentro de sus nodos (sin extrapolar). Test con tiempos de escala 90000 (29,97 fps), 15360 y k/30, en 600 tramos de 10 a 61 frames: sin el arreglo faltan 95–216 valores, con él ninguno. Con fps variable sigue pudiendo faltar el segundo o el penúltimo frame (si caen fuera de los nodos interiores), como estaba previsto.
- **D. Una escala entre marcadores podía quedar desfasada sin aviso:** «Rehacer» solo se ofrecía si había más frames que al guardarla. **Hecho:** `escalaDesfasada` (`calibracion/escala.ts`) compara la escala guardada con la misma medida hecha con lo seguido ahora y avisa (texto en el panel y punto en la pestaña «Escala») si ya no están los dos marcadores en el tramo, si cambió el número de frames (en cualquier sentido) o si la distancia media cambió más de `UMBRAL_DESFASE` (0,1 %; marcadores corregidos en el tramo). Lo interpolado ya no cuenta para la medida (no mide la distancia real): una escala guardada antes con frames interpolados en el tramo saldrá como desfasada y se ofrecerá rehacerla. Tests del núcleo y prueba e2e (tobillo movido a ojo en un frame del tramo: 120,0 → 120,4 px, aviso).

**Encontrado y pendiente de decisión** (cambian cálculos o datos; no se han tocado):

- **C. Un salto de tiempo dentro de un tramo se cruza con el spline.** Si el móvil se salta 0,5 s de frames y en ellos hay posición a los dos lados, el filtro y la derivada lo tratan como un tramo continuo. Propuesta: cortar el tramo si dos frames seguidos se separan más de, p. ej., 2,5 veces el paso.
- **E. «Quitar lo interpolado» no devuelve lo que había:** un frame sin muestra vuelve como «perdido» (calidad 0 en el CSV en vez de vacío) y una detección dudosa (0,3–0,5) se pierde. Propuesta: guardar lo que había antes de rellenar, o al menos devolver «sin muestra».
- **F. Calibrar con dos toques admite un extremo en cada frame:** si el objeto se mueve, la longitud en px no corresponde a ningún frame. Propuesta: guardar el frame de cada extremo y empezar de nuevo si se toca en otro.
- **G. Mientras se sigue, lo filtrado se queda en lo de antes sin indicarlo** (no se refiltra con cada lote): la fila de valores y el panel «Análisis» muestran la pasada anterior mientras el ángulo crudo ya es el nuevo. Propuesta: «—» o «filtrado en pausa» mientras se sigue.

**Revisado sin fallos:** Butterworth (estado inicial, Winter, reflexión con tramos de 2 a 9 muestras, límite de 0,4·fs), rejilla y spline (extremos exactos, sin extrapolar), frontera de tramo corto (9, 10, 11), intersección de tramos para las derivadas angulares, cero con tramo fuera de rango, interpolación con fps variable (error < 1e-14 con una parábola), CSV (sin exponentes, −0 limpio, comillas y separadores escapados), empaquetado Float64 y migración 1 → 2 frente a lo que guardaba la v1 real, cancelación a mitad de lote, orden de los mensajes del worker, frames anteriores al inicio, anclas fuera de rango, liberación de worker, observers, uPlot, temporizadores y URL del CSV.

**Pruebas:** 92 e2e (antes 88) y un test unitario más. Huecos de cobertura que quedan: el worker no tiene tests propios (su conversión de tiempos ya está en el núcleo); `almacen.ts` y `useGuardado` solo se prueban en navegador; faltan e2e de «Parar» a mitad, de seguir de nuevo desde un frame intermedio y de lo que se ve mientras se sigue; `trayectorias.ts` solo se prueba a través de `esquema.test.ts`.

**Tiempo de la suite e2e:** unos 7 min en la nube, de los que ~4 son ffmpeg generando los vídeos VP9 (la suite con los vídeos hechos tarda ~2 min 45 s). La CI ahora los guarda en caché por la huella de `videos.mjs` y no instala ffmpeg si los tiene. Paralelizar las pruebas (partir `e2e.test.mjs` por áreas y lanzar 2–4 procesos) bajaría otro minuto o dos, a cambio de varios navegadores a la vez en una máquina de 4 núcleos; no compensa hasta que la suite crezca.

### Qué se ha comprobado con vídeos reales

Vídeos del usuario (H.264 desde un Android, Chrome para Android), sentadillas de perfil con gomets verdes, 603 frames:

- **Seguimiento:** sin huecos, como en la fase 1.
- **Velocidad y aceleración** (2026-10-18): velocidad angular positiva al bajar y negativa al subir; aceleración positiva al arrancar la bajada y al llegar arriba, negativa en el tramo central y al cambiar de sentido abajo; el trocánter es el marcador más rápido y el maléolo queda casi quieto.
- **Cero de referencia:** «Primeros 2 s» de pie: −4,2° ± 0,2°.
- **Escala entre rodilla y tobillo** (40,5 cm medidos con cinta): 292,0 px en 59 frames, 1,39 mm/px, ±0,1 %. La primera vez salió «en 1 frame» porque se calibró antes de seguir; de ahí el aviso de frames que faltan y el «Rehacer».
- **Longitud de los segmentos:** muslo 288,7 px, varía ±5,8 % (máx. −12,7 % en t ≈ 14,1 s); pierna 290,3 px, ±4,1 % (máx. −8,9 % en t ≈ 18,2 s); unos 220 de 603 frames pasan del 3 %. Los máximos caen en el fondo de las sentadillas y **los dos segmentos se acortan a la vez**: lo más probable es que la rodilla salga hacia la cámara (rodillas hacia fuera), no que se deslice el gomet (que alargaría uno y acortaría el otro). Si todo fuera eso, son unos 18–20 cm de desplazamiento lateral y la flexión real en el fondo sería del orden de 10° mayor que la medida en 2D. Es la limitación del 2D que resuelven la vista frontal (fase 3) y el 3D (fase 5). Prueba propuesta para separar las causas: sentadilla con las rodillas en el plano, o una extensión de rodilla sentado.
- **Interfaz en el móvil:** barra fija, pestañas pegadas, vídeo grande y solo gráficas, probados a lo largo del paso 8 (ver §9).
- **Pendiente con los vídeos del cierre:** <!-- completar con los vídeos que dé el usuario: avance mantenido (ms por frame con caché, seguido y clave), CSV abierto en Excel, recuperar tras recargar, pantalla externa. -->

### Limitaciones conocidas

**Cálculo y datos** (ver también C, E, F y G de la revisión, pendientes de decisión):

1. **2D en un plano.** Los ángulos y la escala solo valen para lo que se mueve en el plano de la cámara. En las sentadillas reales los segmentos se acortan hasta un 13 % en el fondo (rodilla hacia la cámara): ahí la flexión real es del orden de 10° mayor que la medida. Lo resuelven la vista frontal (fase 3) y el 3D (fase 5); la app lo avisa con la longitud de los segmentos.
2. **Un solo modelo:** rodilla sagital con 3 gomets. No hay editor de modelos ni vista frontal en la interfaz (el núcleo ya la tiene, con tests).
3. **Sin corrección de lente** (fase 6): los bordes de la imagen tienen algo de distorsión, que afecta a la escala y a los ángulos lejos del centro.
4. **Un solo corte para todo.** La aceleración es muy sensible al ruido (±20 °/s² a 6 Hz en el vídeo sintético); no hay un corte propio para las derivadas ni el análisis de residuos de Winter.
5. **No se puede empezar a seguir desde un frame con un gomet marcado a ojo:** el seguidor necesita reconocer el gomet en el frame de partida. Desde el paso 9 no se pierde nada (se avisa y se devuelve lo que había), pero hay que empezar en otro frame.
6. **Dos sesiones del mismo vídeo son independientes,** y dos pestañas abiertas sobre la misma sesión se sobrescriben: gana la última que guarda, sin aviso.

**Interfaz:**

7. **Vídeo grande en el móvil, solo en vertical.** No hay una versión pensada para girar el móvil a horizontal: girado, se usa el diseño del móvil (o el de escritorio si el ancho llega a 1024 px) sin aprovechar el ancho para el vídeo.
8. **Las notas de la gráfica completa ya no se ven en ningún sitio** (huecos sin línea, interpolado a trazos, corte del filtro, qué significa salirse de la banda de los segmentos): en el escritorio y en «Solo gráficas» la gráfica va ampliada y sin notas, y en el móvil no se muestra de otra forma. Irán al glosario.
9. **No se guarda en la sesión** la pestaña abierta, las series de la gráfica que se ven, la trayectoria completa ni el modo de la gráfica pequeña (que además vuelve a «Ángulo» al salir de una vista ampliada, porque se desmonta). Al reabrir, todo vuelve a lo de por defecto.
10. **Faltan en la gráfica** la aceleración angular, la velocidad de cada marcador y el ángulo relativo al cero (están en el panel y en el CSV); no hay zoom.
11. **Al mantener pulsado, la gráfica y la fila de valores pueden ir un frame desfasadas** (la gráfica sigue el frame pedido y la fila el dibujado); al soltar coinciden.
12. **Accesibilidad básica, no completa:** las pestañas no se recorren con flechas, al abrir una vista ampliada el foco no pasa a ella y lo que queda debajo sigue alcanzable con el tabulador.

**Pruebas y dispositivos:**

13. **Tablet en horizontal:** usa el diseño de escritorio y solo se ha probado con Chromium emulado, no en dispositivos reales. Lo mismo la tablet en vertical (diseño del móvil).
14. **Sin pruebas automáticas con H.264 ni HEVC reales** (el Chromium de Playwright no los trae): solo en el móvil del usuario. Pocos vídeos reales: un usuario, un Android, ningún iPhone.
15. **Vídeo vertical en el escritorio:** probado con el vídeo sintético girado, no con uno real.
16. **Rendimiento con 4K o vídeos largos sin medir** en el móvil (memoria de la caché y tiempo de seguimiento).

**Despliegue:**

17. **Una previsualización vieja quedó en la caché del móvil (resuelto: ver «aviso de versión nueva» al final).** No son las cabeceras: Cloudflare ya sirve `index.html` con `Cache-Control: public, max-age=0, must-revalidate` y su `ETag`, así que el navegador lo vuelve a pedir cada vez que carga la página (los archivos de `/assets/` llevan un hash en el nombre y pueden ser `immutable`). Lo más probable es que Chrome para Android no recargue la pestaña al volver a ella (la conserva en memoria o en la caché de ida y vuelta), y que la app abierta siga siendo la anterior hasta recargar a mano. Por eso no se cambia `public/_headers`. Propuesta para la fase 3 o un paso suelto (Sonnet): al volver a la página (`visibilitychange`, `pageshow` con `persisted`), pedir `index.html` sin caché, compararlo con el commit con que se construyó la app (el del pie) y, si hay versión nueva, ofrecer «Hay una versión nueva: recargar». El paso 9 ya evita lo peor de una versión nueva con la app abierta: si el worker ya no carga, se avisa y no se pierde nada.

### Pendientes y propuestas

- **Decidir C, E, F y G de la revisión** (cálculo y datos). A, B y D ya están hechos.
- **Glosario o wiki dentro de la app** (parámetros y avisos, con enlaces desde cada aviso o valor; todo local). Recomendación: **un paso propio al principio de la fase 3** (Sonnet), porque la fase 3 añade conceptos que también hay que explicar (desfase entre vistas, sincronización por evento o por audio) y así se recuperan las notas de la gráfica (limitación 8). Alternativa: fase 6, junto a la validación, pero entonces la limitación 8 se arrastra tres fases.
- **Partir `Visor.tsx`** (§11) al empezar la fase 3, antes de duplicar nada para la segunda vista.
- **Vídeo grande en horizontal en el móvil** y **recordar pestaña y series en la sesión** (limitaciones 7 y 9): pasos de interfaz (Sonnet), cuando el usuario los necesite.

### Después del cierre: app instalable

Pedido tras probar el paso 8 en el móvil: ganar la altura de la barra del navegador. `public/manifest.webmanifest` (`display: standalone`, colores del tema, iconos de 192 y 512 px y uno maskable, generados del motivo de `favicon.svg`) enlazado desde `index.html`. Chrome para Android lo ofrece en su menú («Instalar aplicación»). Se abre sin la barra de direcciones (unos 56 px más) y la barra de estado de Android se mantiene (`fullscreen` se descartó: se pierden la hora y la batería).
- **Sin service worker, a propósito:** serviría para usarla sin conexión, pero es lo que deja versiones viejas en caché (limitación 17). Sin él, la app instalada carga siempre la última versión: se instala una vez y se actualiza con cada fusión en `main`. Si cambia el manifiesto (nombre, iconos, colores), Chrome actualiza el acceso por su cuenta.
- **Instalar solo producción:** cada previsualización (`<rama>-dualkinema…`) es otro sitio para Chrome, con su propio acceso y su propio almacén de sesiones. Una previsualización instalada deja de servir al borrarse la rama. La app instalada de producción comparte el almacenamiento con Chrome en esa misma dirección.
- **Prueba e2e:** el manifiesto está enlazado, es válido (`standalone`, `start_url`, nombre, iconos de 192 y 512 y uno maskable) y cada icono se sirve como PNG con el tamaño que declara. Lo que no se puede probar ahí: que Chrome ofrezca instalar, que se abra sin barra y cómo recorta Android el icono maskable (a comprobar en el móvil).

### Después del cierre: aviso de versión nueva

Resuelve la limitación 17 (una versión vieja que se queda abierta): instalada, la app no tiene barra de direcciones ni botón de recargar, y Android la conserva en las recientes con la versión con la que se abrió. Cada build escribe `version.json` (`{commit, rama}`, con el mismo commit que muestra el pie; plugin de `vite.config.ts`), servido con `Cache-Control: no-cache`. `useVersionNueva` (`src/ui/`) lo pide con `cache: 'no-store'` al abrir, al volver a la app (`visibilitychange`, `pageshow`) y cada 10 min mientras se ve; si el commit publicado es otro, un aviso encima de la cabecera («Hay una versión nueva» y «Recargar»; en el visor añade que hay que volver a abrir el vídeo, el trabajo ya se ha guardado solo). No recarga por su cuenta: podría interrumpir un seguimiento. Un fallo (sin conexión, servidor de desarrollo que devuelve la página) no avisa de nada. Sigue sin haber service worker. Pruebas: `versionApp.test.ts` (lectura de lo publicado y comparación) y tres e2e (igual no avisa; otro commit avisa, «Recargar» recarga y al volver a la app aparece sin recargar; un `version.json` que no es una versión no avisa). Lo que no se prueba ahí: el comportamiento real de Android al volver desde las recientes.

### Después del cierre: el vídeo se oculta al bajar (móvil)

Pedido tras medir lo fijo en un móvil (390 × 844 con scroll: vídeo con minigráfica 327 px = 39 %, pestañas 40, barra 128; quedaban 344 px, el 41 %, para las tarjetas). Se ocultan solo el vídeo con su gráfica; la barra de abajo no (su altura fija y su relleno de página están protegidos), y las pestañas suben a lo más alto.
- **Cuándo** (`ocultarAlBajar.ts`, máquina de estados pura con tests): al bajar 32 px seguidos con las tarjetas ya subidas bajo la tira de pestañas (si no, lo que hay entre el vídeo y las tarjetas —el hueco del vídeo y el deslizador— dejaría un hueco vacío); vuelve al subir 24 px, por encima de 60 px de scroll, al cambiar de frame o de pestaña, y mientras se calibra tocando el vídeo. Un botón «Vídeo» bajo la tira lo trae y lo **ancla** hasta volver al principio (si no, seguir bajando lo ocultaría otra vez).
- **Cómo** (`useOcultarAlBajar.ts`): lo primero que se probó, ocultarlo con `translateY` manteniendo su hueco en el flujo, no ganaba sitio (las pestañas quedaban a 215 px con un hueco vacío encima). Oculto, el vídeo sale del flujo (`fixed`, `invisible`, `inert`; sigue montado con su tamaño, así que ni se desmonta ni mide 0) y la página se acorta, lo que haría saltar el contenido unos 340 px: el hook mide cuánto se movió el borde de arriba de las tarjetas y desplaza la página otro tanto antes de pintar (si el navegador ya compensó por su cuenta con el anclaje de scroll, la diferencia es 0). El salto propio no cuenta como bajar o subir.
- **Lo que consigue, y lo que no:** solo hay efecto con tarjetas más largas que el sitio libre. Medido a 390 × 844: «Análisis» (1100 px de tarjetas) pasa de 350 a unos 680 px visibles (del 41 al 80 % de la pantalla); «Marcar», «Escala» y «Vídeo» son cortas (de 270 a 460 px) y a 844 px de alto no tienen scroll suficiente, así que no se ocultan ni hace falta (a 700 px de alto, «Escala» sí llega). No se oculta en las vistas ampliadas ni en pantalla ancha.
- **Pruebas e2e:** el vídeo sigue pegado hasta donde las tarjetas aún no subieron; se oculta, las pestañas suben a y = 0, las tarjetas quedan donde estaban (±3 px; sin la compensación saltaban 380 px) y quedan ≥ 70 % de la pantalla; vuelve al subir sin saltos, al cambiar de frame y de pestaña, y con el botón (anclado); no se oculta calibrando. Las pruebas que tocan el vídeo tras desplazarse pasan por `cajaVideo`, que lo trae con su botón como haría la persona.

### Después del cierre: el cambio suave del vídeo que se oculta

Pedido tras ver las capturas en el móvil: al ocultarse o volver, el vídeo desaparecía y las pestañas saltaban de golpe. Ahora (`useOcultarAlBajar.ts`, `Visor.tsx`, `Pestanas.tsx`):
- **El vídeo** se desvanece (200 ms, `opacity` y `visibility` con transición: la visibilidad cambia al final del fundido) en vez de desaparecer, y vuelve con un fundido.
- **La tira de pestañas** se desliza (FLIP): antes del cambio se anota dónde está, tras el cambio y la compensación del scroll se mide dónde queda y se anima con `element.animate` desde la diferencia. Las tarjetas no se mueven (ya se compensaba el scroll), así que lo único que se desliza son las pestañas. Con `prefers-reduced-motion`, sin animación.
- **El botón de mostrar el vídeo**, que flotaba sobre el contenido y tapaba texto de las tarjetas (se vio en una captura: «…y en px/s»), pasa a ser una celda de un icono (una cámara) a la derecha de las pestañas, fuera de la lista de pestañas (no es una pestaña) y con su sitio reservado: las pestañas son un 10 % más estrechas y no cambian de ancho al ocultar el vídeo.
- **Pruebas e2e:** mientras dura el cambio hay animaciones en la tira y en el vídeo, al ocultar y al volver (sin la animación de las pestañas, la prueba falla); `esperarVideoAsentado` espera a que no quede ninguna antes de medir cajas.

### Después del cierre: aviso de las marcas a mano posteriores

Visto en el móvil: tras unas pruebas con marcas a mano desplazadas, al volver a marcar los tres gomets y seguir, casi toda la franja salió en rojo; recargando el vídeo salía bien. Las marcas a mano son **anclas**: al seguir, el seguimiento las toma como ciertas y continúa desde ellas, así que una marca de prueba (o puesta «a ojo» lejos del gomet) que se queda en otro frame hace perder el gomet desde ahí. No es un fallo del algoritmo (así está pensado), sino una trampa de uso sin señal visible. Ahora, antes de seguir, aparece «Hay marcas a mano más adelante (frames 25, 57…)» con el botón «Quitar las marcas a mano posteriores» (`framesConMarcaManual` y `quitarMarcasManuales` en `core/seguimiento/manuales.ts`, con tests; en el panel «Marcar» y, más corto, en el vídeo grande). Quitarlas deja esos frames sin posición (no restaura lo que se había seguido): hay que volver a seguir. Queda como posible mejora del algoritmo (de Opus): que una ancla a ojo muy lejos de lo esperado amplíe la búsqueda unos frames en vez de dar el gomet por perdido.

### Después del cierre: «Colocar a ojo» como interruptor

Pedido tras ver que, con el gomet tapado o movido, colocar un marcador exigía tocar fuera de todo gomet, esperar el mensaje rojo y pulsar «Colocarlo aquí a ojo» (y en el vídeo grande el mensaje quedaba fuera de pantalla). Ahora hay un interruptor «Colocar a ojo» (`role="switch"`, `data-testid="colocar-a-ojo"`) en la tira del vídeo grande y en el panel «Marcar» (mismo estado): con él activo, cada toque deja el marcador **justo donde se suelta el dedo**, como «a mano», sin buscar el gomet y sin anillo en la lupa (la cruz sale neutra, como al calibrar); el rótulo sobre el vídeo dice «Toca: Maléolo · a ojo». Apagado, todo como antes (el marcador se pega al gomet o sale el aviso). Se queda como esté hasta que se cambie. Prueba e2e en el vídeo grande con el gomet tapado: el toque queda a mano sin error, un toque 40 px más abajo no se ajusta al gomet, y apagado vuelve el aviso (falla si se quita la función).

### Después del cierre: quitar la marca a mano sin elegir el marcador

Visto en el móvil: al volver a un frame con una marca a mano, el marcador salía «a mano» pero el botón «Quitar la marca a mano de este frame» no aparecía hasta tocar su ficha (el botón dependía del marcador elegido, y tras colocar los tres no queda ninguno elegido). Ahora hay un botón por cada marcador con marca a mano en el frame actual, «Quitar la marca a mano: Maléolo» (con el color del marcador; `data-testid="quitar-manual-<id>"`), en el panel «Marcar» y en las acciones extra del vídeo grande, sin elegir nada antes. Quitarla deja ese frame sin posición (no restaura lo seguido): para eso, «Seguir desde aquí». Pruebas e2e: sin elegir el marcador sale el botón (también en el vídeo grande) y funciona aunque el elegido sea otro.

### Después del cierre: el aviso de error del vídeo grande, corto y a la vista

Visto en el móvil (captura del vídeo grande tras tocar fuera de un gomet): el aviso quedaba **el último**, tras los marcadores, «Seguir desde aquí», el último aviso y el deslizador, y había que desplazarse para verlo; además era largo (motivo, detalle técnico y una explicación del modo «a ojo»). Causa: el elemento llevaba `max-lg:order-2` (para la vista mixta, donde va entre el vídeo y las pestañas) y en el vídeo grande, que es una columna flex sin más `order`, eso lo mandaba al final. Ahora, en el vídeo grande (`Visor.tsx`, `nodoError`): va **justo debajo del vídeo**, con una frase corta («Aquí no veo un gomet suelto.»), los botones «Colocarlo aquí a ojo» y «Cerrar» a la vista y el motivo completo, el detalle técnico y la explicación plegados en «Por qué». La vista mixta no cambia. Prueba e2e: el aviso es corto, está entre el vídeo y los marcadores, no queda tapado por la barra de abajo y el detalle va plegado (falla con el orden antiguo).

