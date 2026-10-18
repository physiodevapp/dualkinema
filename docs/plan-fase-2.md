# Plan de la fase 2: calibración y cálculos

Estado: **decisiones D1–D8 aceptadas por el usuario tal como se proponen** (2026-10-17). Pasos 1 (pruebas e2e), 2 (persistencia), 3 (corrección manual), 4 (Butterworth) y 5 (velocidades y cero de referencia) hechos; siguiente: paso 6 (escala en metros).

Objetivo de la fase (CLAUDE.md): escala en metros, Butterworth de fase cero, velocidades y aceleraciones, corrección manual de puntos y exportación CSV. Además, lo que la fase 1 dejó pendiente y conviene resolver antes de calcular: persistencia (D4 de la fase 1), retroceder rápido, cero de referencia y pruebas en navegador en el repositorio (limitaciones 1, 5, 7 y 12 de `docs/plan-fase-1.md`, §12).

Criterio de cierre: con un vídeo real de sentadillas, la persona puede:
- marcar y corregir a mano donde haga falta;
- ver el ángulo de rodilla filtrado y su velocidad angular, con el cero en la postura de pie;
- calibrar la escala con un objeto de longitud conocida y ver la velocidad del tobillo en m/s;
- exportar todo a CSV;
- recargar la página sin perder el trabajo.

---

## 1. Filtrado: Butterworth paso bajo de fase cero [D1, D2] — hecho (paso 4)

Por qué hace falta: el seguimiento tiene ruido de unas décimas de píxel por frame, y al derivar (velocidad, aceleración) ese ruido se multiplica por los fps al cuadrado. La media móvil de physiq-kinematics no sirve aquí: depende de los fps, retrasa la señal y deforma los picos.

**Propuesta:**

- **Qué se filtra.** Se filtran las **coordenadas de cada marcador** (x e y por separado) y después se calculan ángulos y derivadas a partir de ellas. Es el procedimiento estándar en biomecánica con marcadores (Winter, *Biomechanics and Motor Control of Human Movement*). Filtrar el ángulo directamente también sería posible, pero las velocidades lineales de los marcadores necesitan sus coordenadas filtradas de todos modos. **[D1]**
- **Cómo se filtra.**
  - Butterworth de 2.º orden aplicado ida y vuelta: fase cero, sin retraso, equivalente a 4.º orden.
  - Al pasar dos veces, la frecuencia de corte efectiva baja. Se corrige con el factor de Winter (0,802 para dos pasadas), para que el corte que eliges sea el corte real.
- **Frecuencia de corte.** **6 Hz** por defecto, ajustable de 2 a 15 Hz. 6 Hz es el valor habitual para marcadores en movimientos lentos o moderados (marcha, sentadilla). Más adelante se puede añadir el análisis de residuos de Winter, que propone un corte para cada vídeo. **[D2]**
- **fps variable.** Un Butterworth necesita muestras equiespaciadas, y los móviles no las dan.
  - Cada tramo sin huecos se remuestrea a una frecuencia constante (la mediana de los fps del vídeo) por interpolación cúbica.
  - Se filtra a esa frecuencia y se vuelve a los tiempos reales de cada frame.
  - Esto no inventa datos: solo reparte en el tiempo lo que ya está medido.
- **Huecos.**
  - Nunca se filtra a través de un hueco: cada tramo se filtra por separado.
  - Los extremos se rellenan por reflexión, que es lo estándar para que los bordes no se deformen.
  - Un tramo demasiado corto para filtrarlo bien (unas 3 veces la longitud del filtro) se marca y no se usa para derivadas.
- **Se muestran las dos curvas, cruda y filtrada,** para ver qué hace el filtro.

**Tests:** señales de valor conocido (seno de 1 Hz con ruido blanco).
- La señal filtrada debe quedar cerca del seno y sin desfase.
- La respuesta en frecuencia a 6 Hz debe ser −3 dB.
- Con fps variable y con huecos, el resultado debe coincidir con filtrar la señal equiespaciada.

**Cómo quedó (paso 4):**
- **Núcleo** en `src/core/filtros/`: `butterworth.ts` (coeficientes, ida y vuelta, ganancia), `spline.ts` (spline cúbico natural, espaciado desigual) y `tramos.ts` (tramos, remuestreo y ajustes). Mediana de los fps: `fpsMediano` en `core/tiempo/tablaFrames.ts`.
- **Corrección de Winter** (C = 0,802) aplicada sobre la frecuencia ya deformada por la transformación bilineal, `K = tan(π·fc/fs) / C`. A cortes bajos es lo mismo que la fórmula del libro (corregir antes de deformar); cerca de Nyquist solo así cae el −3 dB exactamente en el corte. Un test lo comprueba de 2 a 12 Hz a 30 fps.
- **Arranque:** cada pasada empieza en estado estacionario con su primer valor y los extremos se rellenan por reflexión impar (2·x₀ − x[k]), con un periodo del corte de relleno (al menos 9 muestras, nunca más de lo que el tramo permite). Una constante pasa exacta y una recta con un error de milésimas de píxel.
- **Remuestreo:** cada tramo va a una rejilla uniforme de paso lo más cercano posible a 1/fps mediano que empieza y acaba justo en sus extremos (sin extrapolar), con spline cúbico natural; se filtra y se vuelve con otro spline a los tiempos reales. Con frames ya equiespaciados el resultado es el del filtro solo.
- **Tramos:** frames consecutivos con posición utilizable (calidad ≥ 0,5; lo marcado a mano y lo interpolado entran y conservan su marca). Tramo corto: menos de 10 muestras (más de 3 veces la longitud del filtro, la regla de scipy). Se filtra igual, queda marcado y el paso 5 no lo derivará.
- **Corte:** 6 Hz por defecto, de 2 a 15 Hz en pasos de 0,5. Si los fps no lo permiten se limita a 0,4·fps (12 Hz a 30 fps) y la app lo dice.
- **Sesión:** `filtro: { corteHz } | null` (null = 6 Hz). Lo guardado antes sigue valiendo, así que el esquema se queda en la versión 2.
- **Visor (provisional hasta el paso 8):** panel «Filtro» con el corte y el ángulo filtrado del frame actual, y la curva filtrada como línea clara sobre la cruda en la gráfica. Mientras se sigue no se refiltra (las trayectorias cambian con cada lote); se rehace al parar. Coste medido: unos 8 ms por marcador con 3600 frames en un ordenador.
- **Tests:** −3 dB en el corte (teórico y medido sobre un seno), seno de 1 Hz con ruido (sin desfase: fase del componente de 1 Hz < 0,1°), constante y recta, fps variable frente a equiespaciado y frente a la salida exacta del filtro, huecos (un salto de 200 px al otro lado no se nota), tramos cortos, marcas conservadas y validación de los ajustes. En navegador: ángulo filtrado frente al real con fps variable, sin valor dentro de un hueco y correcto a sus lados, y el corte se guarda y se recupera.

## 2. Velocidades y aceleraciones — hecho (paso 5)

- **Cálculo:** diferencias centrales sobre la señal filtrada y equiespaciada, y vuelta a los tiempos reales.
  - **Velocidad angular** en °/s; **aceleración angular** en °/s².
  - **Velocidad lineal** de cada marcador en px/s, o en m/s con escala.
- **Sin datos fiables:** en los bordes de cada tramo y en los tramos cortos, no hay derivada (hueco, nunca 0).
- **Tests:** derivada de un seno y de una parábola, con valor conocido.

**Cómo quedó (paso 5):**
- **Núcleo** en `src/core/filtros/derivadas.ts`. El filtrado del paso 4 ahora conserva la rejilla uniforme filtrada de cada tramo (`rejillas` en `TrayectoriaFiltrada`, de `filtrarTramoConRejilla`), y se deriva ahí: v = (x[k+1] − x[k−1]) / 2h y a = (x[k+1] − 2x[k] + x[k−1]) / h², con error del orden de h² (exactas con una parábola). Se vuelve a los tiempos reales con spline cúbico por los nodos con derivada, sin extrapolar.
- **Sin derivada (NaN, nunca 0):** el primer y el último nodo no tienen vecinos a los dos lados, así que el primer y el último frame de cada tramo quedan sin valor; con fps variable, a veces también el segundo o el penúltimo (si caen fuera de los nodos interiores). Los tramos cortos no se derivan.
- **Velocidad angular y aceleración angular:** un tramo del ángulo son frames en los que todos sus marcadores están en tramos no cortos. En una rejilla de ese tramo se evalúa la posición filtrada de cada marcador (spline por su rejilla: si los tramos coinciden, son los mismos valores), se calcula el ángulo, se desenrolla y se deriva.
- **Velocidad lineal** de cada marcador: vx, vy y módulo en px/s (y hacia abajo, como la imagen). `velocidadMarcador(f, metrosPorPx)` ya acepta la escala: con ella devuelve m/s y la unidad va con el valor, así que el paso 6 solo tiene que pasar los m/px.
- **Ruido:** la segunda derivada multiplica el ruido por (2πf)². En el vídeo sintético (ruido de seguimiento ≈ 0,05°), la aceleración oscila unos ±20 °/s² a 6 Hz y ±4 °/s² a 3 Hz; la velocidad, menos de 1 °/s a 6 Hz. El panel lo dice: si la aceleración salta, bajar el corte. Un corte propio para las derivadas (o el análisis de residuos de Winter) queda como posible mejora.
- **Tests:** diferencias centrales exactas con una parábola en la rejilla y con fps variable en los tiempos reales; seno de 1 Hz (< 1 % del pico); giro de 1 Hz con huecos, tramo corto y perdidos (rapidez real, sin valor en bordes, huecos y tramos cortos, nunca 0; componentes con su signo; m/s con escala); flexión de rodilla 0→90→0° con fps variable (±1 °/s, ±3 °/s²), con un hueco del tobillo y con un tramo corto de la cadera. Una derivada rota a propósito (diferencia hacia delante) la detectan 6 tests. En navegador: velocidad angular frente a la derivada real del vídeo (±3 °/s, también tras los huecos de fps), aceleración a 3 Hz (±10 °/s²), «—» en el primer y el último frame, y la velocidad del tobillo (±5 %) con cadera y rodilla quietas.

- **Comprobado en el móvil** (sentadillas reales, 2026-10-18): velocidad angular positiva al bajar y negativa al subir; aceleración positiva al arrancar la bajada y al llegar arriba, y negativa en el tramo central y al cambiar de sentido abajo; el trocánter es el marcador más rápido y el maléolo queda casi quieto. Cero con «Primeros 2 s» de pie: media −4,2° ± 0,2°. Pedidos tras probarlo, ya hechos en este PR: la línea de posición ya no cambia de altura (movía los botones y se perdía la pulsación) y una fila con ángulo, relativo, °/s y °/s² junto a los controles. Pendiente para el paso 8 (decidido): barra fija inferior con los controles y esos valores.

## 3. Cero de referencia [D3] — hecho (paso 5)

De pie salió −4,7° porque los gomets no caen sobre los ejes articulares. La práctica habitual es una **toma estática**: tú eliges un tramo quieto (por ejemplo, los primeros 2 s de pie), la app calcula el ángulo medio y lo resta.

- Se muestran el valor **crudo** y el **relativo al estático**, nunca uno en lugar del otro sin decirlo.
- El tramo elegido se guarda con la sesión y sale en el CSV.

**[D3]** ¿Te sirve clínicamente así, o prefieres otra referencia (por ejemplo, un ángulo medido con goniómetro e introducido a mano)? Aceptado así.

**Cómo quedó (paso 5):**
- **Núcleo** en `src/core/articulaciones/cero.ts`: `ceroDeReferencia(serie, tramo)` hace la media del ángulo filtrado de los frames del tramo (extremos incluidos, sin los huecos), desenrollada para que una postura cerca de ±180° no dé 0, y su desviación típica; `relativoAlCero` = normalizar(ángulo − media).
- **Se guarda el tramo, no la media:** `ceros: { [idArticulacion]: { desde, hasta } }` en segundos de vídeo, en cada vista. La media se recalcula si cambia el corte o se corrige un marcador. `{}` sigue siendo «sin cero», así que lo guardado antes vale y el esquema se queda en la versión 2; la validación rechaza un tramo mal formado y uno de una articulación que no está en el modelo (test).
- **Visor (provisional, panel «Velocidad y cero»):** ángulo sin cero y relativo al estático, velocidad y aceleración angulares y velocidad de cada marcador del frame actual. Tramo con «Primeros 2 s», «Inicio aquí» / «Fin aquí» (el frame actual; si no hay tramo, 2 s hacia delante o hacia atrás) y «Quitar». Muestra el tramo, la media, la desviación típica y los frames, y avisa si la desviación pasa de 2° (no parece quieto).
- **Tests:** media y desviación conocidas, huecos ignorados, cerca de ±180°, tramo sin ángulo, primeros 2 s sin pasar del final, validación del tramo y del esquema. En navegador, con el vídeo sintético: los primeros 2 s dan la media real de esos frames (≈ 45°, con aviso de que no es quieto), el relativo es el sin cero menos la media, «Inicio aquí» / «Fin aquí» dan la media real de su tramo, el tramo se guarda, se recupera tras recargar con la misma media y relativo, y «Quitar» se guarda vacío.

## 4. Escala en metros [D4]

- **Calibración 2D:** con un objeto de longitud conocida **en el plano del movimiento**, tocas sus dos extremos, introduces la longitud y la app calcula metros por píxel. Sirve una cinta métrica o un palo de 1 m apoyado junto a la pierna, a la misma distancia de la cámara.
- **Avisos que tendrá la app:**
  - Solo vale para lo que está en ese plano: lo que está más cerca o más lejos de la cámara sale con otra escala.
  - Sin corrección de lente (fase 6), los bordes de la imagen tienen algo de distorsión.
- **Dónde se guarda:** con la vista (`Vista.calibracion`, previsto en el modelo de datos desde la fase 1).
- **Los ángulos no necesitan escala.** Las velocidades lineales y las distancias, sí.

**[D4]** ¿Qué objeto tendrías a mano para calibrar? Cinta métrica en el suelo, palo de longitud conocida, regla en la pared…

## 5. Corrección manual de puntos [D5] — hecho (paso 3)

Lo de la fase 1 se queda corto (limitación 8). **Propuesta:**

- **Arrastrar un marcador** en cualquier frame, con lupa, y soltar en su sitio. Queda `editadoManual`.
- **Las posiciones marcadas a mano son anclas.**
  - Al seguir y llegar a un frame con ancla, el seguidor usa esa posición y vuelve a aprender el gomet ahí, en lugar de su estimación.
  - Así una corrección arregla también lo que viene después.
- **Rellenar un hueco a mano,** frame a frame. Opcionalmente, interpolar huecos cortos **solo si tú lo pides**, marcando esos frames como interpolados en la franja, la gráfica y el CSV.
- **Retroceder rápido:** caché de los últimos frames decodificados (limitación 7). Su tamaño se ajusta a la resolución del vídeo para no agotar la memoria del móvil.

**[D5]** Interpolar huecos cortos a petición, marcado como interpolado: ¿sí o no? Mi recomendación: sí, con un máximo de unos 0,2 s y siempre visible como tal. Aceptado.

**Cómo quedó (paso 3):**
- **Corregir:** se elige el marcador y se arrastra con la lupa; al soltar, se ajusta al centro del gomet. Si ahí no se reconoce un gomet (tapado, movido), se ofrece «Colocarlo aquí a ojo», sin ajuste. Una marca a mano se puede quitar. Arrastrar un marcador sin elegirlo antes no se ha hecho: el vídeo tendría que bloquear el desplazamiento de la página con el dedo encima.
- **Lupa** (pedido tras probarlo en el móvil: costaba fijar el centro del gomet): el problema no era solo el aumento. El gomet se buscaba a unos 13 px del vídeo del dedo, que en un vídeo 1080 en un móvil son 3–4 px de pantalla. Ahora:
  - la lupa mide 160 px y abarca un 7,5 % del lado menor del vídeo (un gomet de 25 px pasa de unos 20 a unos 49 px en la lupa);
  - el gomet se busca en todo lo que se ve en la lupa, y si hay dos, va al más cercano al dedo;
  - mientras se arrastra, un anillo marca el gomet al que irá el marcador, y sin anillo la cruz sale roja.
- **Anclas:** «Seguir desde aquí» envía al seguidor las marcas a mano posteriores. En cada una toma la posición como cierta y vuelve a aprender el gomet: color y tamaño, o solo la posición si se marcó a ojo. La velocidad previa solo se conserva si el ancla cae a menos de dos radios de lo previsto: si cae más lejos, lo seguido antes estaba mal y su velocidad también. Lo destapó la prueba unitaria del salto: con la velocidad del error, el seguidor se perdía justo después del ancla. Tras una corrección con datos detrás, el visor recuerda que se puede rehacer desde ahí.
- **Huecos cortos:** botón «Rellenar N huecos cortos», solo si los hay: entre dos posiciones fiables, ≤ 0,2 s entre ellas, nunca en los extremos.
  - Método: cúbico de Hermite en el tiempo real de cada frame, con la pendiente de cada lado estimada con la parábola por tres posiciones (segundo orden, espaciado desigual). Exacto a velocidad constante; 0,31 px de error con un giro de 1 Hz y 100 px de radio (628 px/s). La pendiente con dos puntos daba 1,4 px.
  - Marcado: `interpolado` en la muestra, azul en la franja, trazo discontinuo en la gráfica, círculo a trazos en el vídeo y recuento en el resumen y en la lista de sesiones. «Quitar lo interpolado» los devuelve a huecos (como perdidos: se pierde la diferencia con una detección dudosa).
  - El esquema guardado pasa a la versión 2, con migración de la 1 (nada interpolado).
- **Retroceder rápido:** caché de los últimos frames decodificados, de unos 160 MB (45 frames a 720p, 20 a 1080p, 8 a 4K, 120 como mucho). Al retroceder se decodifica desde el fotograma clave anterior, como antes, pero los frames de paso quedan en la caché y los siguientes pasos atrás no decodifican.

## 6. Persistencia (IndexedDB) [D6] — hecho (paso 2)

- **Se guarda automáticamente:**
  - marcado y trayectorias;
  - orientación, calibración y cero de referencia;
  - ajustes del filtro.
- **Esquema propio de dualkinema** (no el de PhysiQ), con versión, para poder cambiarlo.
- **El vídeo no se guarda,** porque puede pesar cientos de MB. La sesión se asocia a una huella del archivo (nombre, tamaño, duración y número de frames). Al volver a abrir el mismo vídeo, la app ofrece recuperar el trabajo.
- **Lista de sesiones guardadas,** con opción de borrarlas. Todo se queda en el dispositivo.

**[D6]** ¿De acuerdo con no guardar el vídeo y pedirlo al reabrir? Aceptado.

**Cómo quedó (paso 2):**
- **Qué se guarda ya:** marcado y trayectorias, orientación de la vista y el modelo de marcadores completo (marcadores y definición de la articulación). Los huecos para filtro, calibración y cero de referencia están en el esquema, vacíos (`filtro: null`, `calibracion: null`, `ceros: {}`): los pasos 4–6 los rellenan sin cambiar de versión mientras lo vacío siga siendo válido.
- **Versión:** cada registro lleva `esquema` (hoy 1). Al leer, se migra paso a paso con `MIGRACIONES_*` y se valida; uno de una versión más nueva no se abre ni se reescribe (sale en la lista para poder borrarlo).
- **Dos almacenes:** `sesiones` (cabecera: lo que muestra la lista y monta el visor) y `trayectorias` (arrays tipados por marcador, solo los frames con muestra, exactos). La lista no lee las trayectorias de todas.
- **Huella:** nombre, tamaño, duración (ms) y número de frames. Se busca sin el nombre: el selector de fotos de Android entrega el mismo vídeo como «1000012345.mp4» y el gestor de archivos con su nombre real. Si solo cambia el nombre, se ofrece recuperar avisando de ello.
- **Cuándo se guarda:** 1 s después del último cambio (como mucho cada 3 s mientras sigue) y en el acto al ocultar la página (cambiar de app, apagar la pantalla, recargar) o cambiar de vídeo. No se crea sesión hasta que hay algo marcado. Se pide al navegador almacenamiento persistente (`navigator.storage.persist()`) para que no lo borre con poco espacio.
- **Fallo encontrado con la prueba e2e:** el guardado al recargar no llegaba a escribirse porque la transacción se creaba unas microtareas después del aviso de la página, y Chromium la descartaba. Ahora se crea en el mismo manejador (la base ya está abierta desde que se buscaron las sesiones del vídeo) y se cierra con `commit()`; sin cola propia, porque IndexedDB ya ejecuta en orden las transacciones de escritura sobre los mismos almacenes.
- **Recuperar:** al abrir un vídeo con trabajo guardado, «Recuperar el trabajo» (sin volver a preguntar la orientación) o «Empezar de cero» (lo guardado se queda). En la portada, la lista de sesiones con «Continuar» (abre el selector y solo acepta el vídeo de esa sesión) y «Borrar» con confirmación.
- **Limitación:** con dos sesiones del mismo vídeo, cada una es independiente (no se fusionan).

## 7. Exportación CSV [D7]

- **Una fila por frame:**
  - tiempo (s) y número de frame;
  - por marcador: x e y en px, x e y en m si hay escala, calidad y si está editado a mano o interpolado;
  - ángulo crudo, filtrado y relativo al estático;
  - velocidad y aceleración angulares;
  - velocidad lineal de cada marcador.
- **Cabecera con los metadatos:** archivo, fps, orientación, filtro (corte), calibración y tramo estático.
- **Sin valor = celda vacía,** nunca 0.
- **Se genera en el dispositivo y se descarga o se comparte** con el menú de compartir de Android. No pasa por ningún servidor.

**[D7]** ¿Formato para Excel en español (separador `;` y coma decimal) o el internacional (`,` y punto)? Propongo el de Excel en español por defecto y el otro como opción.

## 8. Pruebas en navegador en el repositorio [D8] — hecho (paso 1)

`tests/e2e/` (con su `LEEME.md`) y un trabajo `e2e` en la CI, en paralelo a `comprobar`:
- Generador de vídeos sintéticos con Node + ffmpeg. El de «frame exacto» codifica el número de frame en bloques blancos y negros, así que no depende de ninguna fuente del sistema.
- 20 pruebas: frame exacto con fps variable y fotogramas clave, teclado, marcado, seguimiento con gomets verdes y rojos (ángulo medido frente al real, tolerancia 0,5°), gráfica, huecos, escritorio y consola sin errores.
- Dos roturas hechas a propósito (signo de la rodilla invertido; la gráfica salta 5 frames de más) son detectadas.
- Se localizan los elementos por rol, texto o `data-testid`.
- **Fallo real encontrado al escribirlas:** el mensaje de error de marcado salía superpuesto al vídeo y en un móvil tapaba casi toda la imagen; el siguiente toque, aunque fuera sobre el gomet, caía en el mensaje en vez de marcar. Ahora sale debajo del vídeo y una prueba comprueba que no se solapen.
- Límite: el Chromium de Playwright no decodifica H.264/HEVC, así que los vídeos de móvil reales siguen probándose a mano.

---

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo (tabla de CLAUDE.md) |
|---|---|---|
| 1 | Pruebas e2e en el repo y en la CI | Sonnet |
| 2 | Persistencia en IndexedDB (modelo de datos de la sesión) | Opus |
| 3 | Corrección manual con anclas, relleno de huecos y caché para retroceder | Opus |
| 4 | Butterworth de fase cero, remuestreo y tramos, con tests | Opus |
| 5 | Velocidades y aceleraciones, y cero de referencia | Opus |
| 6 | Calibración de escala en metros | Opus |
| 7 | Exportación CSV | Sonnet |
| 8 | Gráfica: crudo y filtrado, velocidad; trayectoria completa en el vídeo (ver nota) | Sonnet |
| 9 | Cierre de fase: revisión, CLAUDE.md y limitaciones | Opus |

**Nota para el paso 8 (gráfica):** la línea del frame actual tiene que ir en una capa aparte (un canvas o un elemento superpuesto a la gráfica), sin redibujar las curvas. Hoy cada cambio de frame llama a `redraw` de uPlot y redibuja todas las series; con la gráfica llena (cruda, filtrada y, en el paso 5, velocidad) avanzar frame a frame va menos suave. Tocar o arrastrar la gráfica debe seguir funcionando igual.

**Barra fija inferior en el móvil (paso 8, pedido tras probar el paso 5):** los botones de avance, la línea de t / frame / ms / modo de lectura y la fila de ángulo, relativo, °/s y °/s² en una barra fija abajo, para no perderlos de vista al recorrer el movimiento ni al hacer scroll hasta la gráfica. El contenido de la página deja sitio debajo para que la barra no tape el final. En pantalla ancha se queda como está. Altura fija: lo que cambie de texto no puede mover los botones (prueba e2e de 340 a 440 px).

**Trayectoria completa en el vídeo (paso 8, pedido tras probar el paso 4):** hoy solo se dibujan los últimos 20 frames de cada marcador (`ESTELA` en `Visor.tsx`), pensado para vigilar el seguimiento. Para analizar el recorrido (camino de la rodilla en la sentadilla, desviaciones laterales en vista frontal):
- interruptor «Trayectoria completa», para todos los marcadores o eligiendo cuáles; la estela corta sigue como ahora;
- dibujada con las coordenadas **filtradas** (las crudas tiemblan justo donde se quiere ver la forma);
- cortada en los huecos, como la gráfica, y a trazos en lo interpolado;
- preparada una vez (p. ej. un `Path2D` por marcador o una capa propia) y rehecha solo al cambiar las trayectorias o el corte, no en cada frame, para no empeorar el avance frame a frame;
- aviso: es la trayectoria en la imagen; solo equivale al recorrido físico para lo que se mueve en el plano de la cámara, y en metros con la escala del paso 6.

**Avance mantenido (observado en el móvil tras el paso 4) — corregido en el PR del paso 4:** manteniendo pulsado avanzar o retroceder, tras unos segundos cada frame tardaba 130–200 ms (al principio, 0–8 ms). Con los ms a la vista y leyendo Mediabunny salieron dos fallos de lectura del vídeo:
- **Hacia delante:** al mantener pulsado, si un frame tardaba más que el intervalo de repetición (70 ms), «el último gana» se saltaba uno y pedía el siguiente; cualquier petición que no fuera exactamente la siguiente volvía al fotograma clave, que tarda más y hace saltarse más frames: el avance quedaba atascado. Ahora, sin fotograma clave entre medias, se sigue decodificando hacia delante.
- **Hacia atrás:** la caché del paso 3 no se llenaba con los frames de paso, porque `CanvasSink.canvases(t)` solo entrega desde t (decodifica los anteriores pero los descarta). Cada paso atrás más allá de lo ya visto volvía al fotograma clave. Ahora se pide desde el fotograma clave (o desde lo que cabe en la caché) y solo uno de cada grupo de imágenes decodifica.
Quedan por medir en el móvil, con el número de ms y el modo (`caché` / `seguido` / `clave`) junto al número de frame: si con esto desaparecen los 130–200 ms y si el redibujado de la gráfica (nota anterior) se nota aparte.

Las pruebas e2e van primero para que cada paso siguiente quede cubierto. La persistencia va antes que los cálculos porque probar los filtros con vídeos reales sin guardar el marcado obliga a repetirlo cada vez.

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Qué se filtra | Las coordenadas de los marcadores; ángulos y derivadas se calculan después |
| D2 | Frecuencia de corte | 6 Hz por defecto, ajustable de 2 a 15 Hz |
| D3 | Cero de referencia | Media de un tramo estático elegido; mostrar crudo y relativo |
| D4 | Objeto de calibración | El que haya: cinta, palo o regla en el plano del movimiento (la app no impone uno) |
| D5 | Interpolar huecos cortos | Solo a petición, ≤ 0,2 s, siempre marcado como interpolado |
| D6 | Persistencia | IndexedDB sin el vídeo; al reabrir el mismo archivo, recuperar el trabajo |
| D7 | Formato CSV | `;` y coma decimal por defecto; el internacional como opción |
| D8 | Pruebas e2e | En el repo y en la CI |
