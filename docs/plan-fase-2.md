# Plan de la fase 2: calibración y cálculos

Estado: **decisiones D1–D8 aceptadas por el usuario tal como se proponen** (2026-10-17). Pasos 1 (pruebas e2e), 2 (persistencia), 3 (corrección manual), 4 (Butterworth), 5 (velocidades y cero de referencia) 6 (escala en metros), 7 (exportación CSV) y 8 (parte A: gráfica y trayectoria; parte B: pestañas y barra fija) hechos; siguiente: paso 9 (cierre de fase).

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
- **Visor:** panel «Filtro» con el corte y el ángulo filtrado del frame actual, y la curva filtrada como línea clara sobre la cruda en la gráfica (con su botón desde el paso 8). Mientras se sigue no se refiltra (las trayectorias cambian con cada lote); se rehace al parar. Coste medido: unos 8 ms por marcador con 3600 frames en un ordenador.
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

- **Comprobado en el móvil** (sentadillas reales, 2026-10-18): velocidad angular positiva al bajar y negativa al subir; aceleración positiva al arrancar la bajada y al llegar arriba, y negativa en el tramo central y al cambiar de sentido abajo; el trocánter es el marcador más rápido y el maléolo queda casi quieto. Cero con «Primeros 2 s» de pie: media −4,2° ± 0,2°. Pedidos tras probarlo, ya hechos en este PR: la línea de posición ya no cambia de altura (movía los botones y se perdía la pulsación) y una fila con ángulo, relativo, °/s y °/s² junto a los controles. Hecho en el paso 8 (parte B): barra fija inferior con los controles y esos valores.

## 3. Cero de referencia [D3] — hecho (paso 5)

De pie salió −4,7° porque los gomets no caen sobre los ejes articulares. La práctica habitual es una **toma estática**: tú eliges un tramo quieto (por ejemplo, los primeros 2 s de pie), la app calcula el ángulo medio y lo resta.

- Se muestran el valor **crudo** y el **relativo al estático**, nunca uno en lugar del otro sin decirlo.
- El tramo elegido se guarda con la sesión y sale en el CSV.

**[D3]** ¿Te sirve clínicamente así, o prefieres otra referencia (por ejemplo, un ángulo medido con goniómetro e introducido a mano)? Aceptado así.

**Cómo quedó (paso 5):**
- **Núcleo** en `src/core/articulaciones/cero.ts`: `ceroDeReferencia(serie, tramo)` hace la media del ángulo filtrado de los frames del tramo (extremos incluidos, sin los huecos), desenrollada para que una postura cerca de ±180° no dé 0, y su desviación típica; `relativoAlCero` = normalizar(ángulo − media).
- **Se guarda el tramo, no la media:** `ceros: { [idArticulacion]: { desde, hasta } }` en segundos de vídeo, en cada vista. La media se recalcula si cambia el corte o se corrige un marcador. `{}` sigue siendo «sin cero», así que lo guardado antes vale y el esquema se queda en la versión 2; la validación rechaza un tramo mal formado y uno de una articulación que no está en el modelo (test).
- **Visor (panel «Velocidad y cero»; la curva de velocidad, en la gráfica desde el paso 8):** ángulo sin cero y relativo al estático, velocidad y aceleración angulares y velocidad de cada marcador del frame actual. Tramo con «Primeros 2 s», «Inicio aquí» / «Fin aquí» (el frame actual; si no hay tramo, 2 s hacia delante o hacia atrás) y «Quitar». Muestra el tramo, la media, la desviación típica y los frames, y avisa si la desviación pasa de 2° (no parece quieto).
- **Tests:** media y desviación conocidas, huecos ignorados, cerca de ±180°, tramo sin ángulo, primeros 2 s sin pasar del final, validación del tramo y del esquema. En navegador, con el vídeo sintético: los primeros 2 s dan la media real de esos frames (≈ 45°, con aviso de que no es quieto), el relativo es el sin cero menos la media, «Inicio aquí» / «Fin aquí» dan la media real de su tramo, el tramo se guarda, se recupera tras recargar con la misma media y relativo, y «Quitar» se guarda vacío.

## 4. Escala en metros [D4] — hecho (paso 6)

- **Calibración 2D:** con un objeto de longitud conocida **en el plano del movimiento**, tocas sus dos extremos, introduces la longitud y la app calcula metros por píxel. Sirve una cinta métrica o un palo de 1 m apoyado junto a la pierna, a la misma distancia de la cámara.
- **Avisos que tendrá la app:**
  - Solo vale para lo que está en ese plano: lo que está más cerca o más lejos de la cámara sale con otra escala.
  - Sin corrección de lente (fase 6), los bordes de la imagen tienen algo de distorsión.
- **Dónde se guarda:** con la vista (`Vista.calibracion`, previsto en el modelo de datos desde la fase 1).
- **Los ángulos no necesitan escala.** Las velocidades lineales y las distancias, sí.

**[D4]** ¿Qué objeto tendrías a mano para calibrar? Cinta métrica en el suelo, palo de longitud conocida, regla en la pared…

**Cómo quedó (paso 6):**
- **Núcleo** en `src/core/calibracion/escala.ts`: `EscalaPlano` (`tipo: 'escala-plano'`, `objeto`, extremos `a` y `b` en px de la imagen, `longitudM`, y `t`, el instante del frame en que se marcaron), `metrosPorPx` = longitud / distancia, `crearEscala` (valida: extremos marcados, al menos 20 px entre ellos, de 1 cm a 20 m), `esCalibracion` (validación de lo guardado) y `metrosDesdeCm` (acepta coma o punto). `CalibracionVista` es hoy solo `EscalaPlano`; DLT y lente se añadirán a esa unión.
- **El objeto se elige** (cinta métrica, palo, regla u otro), pero no cambia el cálculo: da una longitud de partida (100, 100, 30 cm o vacía), un consejo de colocación y queda anotado con la escala para el CSV. Lo que sí importa es cuántos píxeles ocupa: **precisión por el marcado** = √2 · 1 px / distancia (un error de ~1 px con la lupa en cada extremo). Un palo de 1 m en 400 px: ±0,35 %; una regla de 30 cm en el mismo vídeo (120 px): ±1,2 %. Por encima del 1 % la app aconseja un objeto más largo o la cámara más cerca. No incluye lo que suele pesar más (objeto fuera del plano o inclinado hacia la cámara), que la app explica con un ejemplo: a 3 m, 10 cm más cerca o más lejos ya son un 3 %.
- **Marcar:** «Calibrar escala» → elegir objeto → tocar un extremo y el otro con la lupa (sin buscar gomet: el extremo queda donde se suelta el dedo) → escribir la longitud en cm → «Guardar escala». Un tercer toque mueve el extremo más cercano. Mientras se calibra, tocar el vídeo no mueve marcadores. La escala guardada se ve en su frame («Ver en el frame N») y se puede rehacer (parte de lo guardado) o quitar.
- **Uso:** `useFiltrado` pasa los m/px a `velocidadMarcador`: la velocidad de cada marcador sale en m/s (2 decimales) con escala y en px/s sin ella. Cambiar la escala no vuelve a filtrar. Los ángulos no la usan.
- **Sesión:** `calibracion` de la vista, que era `null`, ya se rellena; lo guardado antes sigue valiendo y el esquema se queda en la versión 2 (test). Calibrar antes de marcar ya crea la sesión (no se pierde).
- **Entre dos marcadores** (pedido tras ver el paso: medir con cinta la pierna y usarla de escala). Opción «Entre dos marcadores» en el mismo panel: se eligen dos marcadores de la articulación (por defecto rodilla–tobillo; el gomet del trocánter se desliza más) y un tramo (el del cero de referencia, los primeros 2 s o un solo frame), y se escribe la distancia medida con cinta entre los centros de los gomets. `medirEntreMarcadores` (núcleo) promedia la **distancia de cada frame**, no las posiciones: con el segmento girando en el tramo, la distancia entre posiciones medias sale más corta (lo destapó la prueba e2e: 101,8 px en vez de 120 en los primeros 2 s del vídeo sintético, que flexiona la rodilla). Se guarda `entre` (marcadores, tramo, frames y desviación típica de la distancia) con `objeto: 'marcadores'`; `a` y `b` quedan como se midieron (si se corrigen esos marcadores, «Rehacer»). Precisión por el marcado = máx(desviación / √n, √2 · 0,5 px / √n, 0,25 px) / distancia (los frames de un tramo quieto no son independientes: de ahí el mínimo; con pocos frames la desviación no dice nada y con uno es 0, de ahí el término de una detección); la app recuerda que a eso se suma la medida con cinta (5 mm en 40 cm = 1,2 %). Ventaja: la escala queda justo en el plano de los marcadores. Inconvenientes: la medida sobre la piel, que la pierna esté paralela a la cámara en el tramo y que ese segmento ya no se pueda medir con el vídeo.
- **Probado en el móvil** (sentadillas, 2026-10-18): rodilla–tobillo, 40,5 cm = 292,1 px (1,39 mm/px), cero −4,1°. Salió **«en 1 frame (0,00–2,00 s)»**: se calibró tras marcar y antes de seguir, cuando solo el primer frame tenía los dos gomets, y la precisión se mostraba como ±0,1 % (con un frame, la desviación es 0 y solo quedaba el mínimo). Corregido: al calibrar se avisa si solo N de los M frames del tramo tienen los dos marcadores; con la escala guardada, si ahora hay más frames que al guardarla, se ofrece «Rehacer»; y con pocos frames la precisión incluye el error de una detección (con un frame, ±0,6 % sobre 120 px).
- **Rehecha en el móvil** tras la corrección: 59 frames, 292,0 px (1,39 mm/px), ±0,1 %. **Longitud de los segmentos** en las mismas sentadillas: muslo 288,7 px, varía ±5,8 %, máx. −12,7 % (frame 424, t ≈ 14,1 s); pierna 290,3 px, ±4,1 %, máx. −8,9 % (frame 546, t ≈ 18,2 s); unos 220 de 603 frames pasan del 3 % en cada uno. Los máximos caen en el fondo de las sentadillas y los **dos segmentos se acortan a la vez**: el deslizamiento del gomet de la rodilla alargaría uno y acortaría el otro, así que lo más probable es que la rodilla salga hacia la cámara (rodillas hacia fuera). Si todo fuera eso, los dos acortamientos dan lo mismo, unos 18–20 cm de desplazamiento lateral de la rodilla, y la flexión real en el fondo sería del orden de 10° mayor que la medida en 2D. Es la limitación del 2D que resuelven la vista frontal (fase 3) y el 3D (fase 5); el aviso hace su trabajo. Prueba propuesta para separar las dos causas: sentadilla con los pies paralelos y las rodillas en el plano, o una extensión de rodilla sentado. Si la pierna sigue variando más de un 3 %, es deslizamiento del gomet.
- **Longitud de los segmentos** (`src/core/calibracion/segmentos.ts`, `constanciaSegmento`): para cada segmento de la articulación, la mediana de su longitud en la imagen (con lo filtrado), la variación cuadrática media, la mayor (con su frame, al que se puede ir) y cuántos frames se apartan más de un 3 %. Con marcadores rígidos en el plano no cambia; si cambia, en esos frames el segmento sale del plano, los gomets se deslizan o el seguimiento falla, y la escala y los ángulos son menos fiables. Vale con cualquier escala (y en cm si la hay) o sin ella.
- **Tests:** metros por píxel conocidos (3-4-5, vertical y horizontal, orden de los extremos), m/s de un marcador a velocidad conocida, incertidumbre y su aviso, validación y lectura de cm; entre marcadores (medias, desviación, un solo frame, perdidos y fuera del tramo, segmento girando en el tramo, incertidumbre con su mínimo, validación); constancia (rígido girando, acortado al salir del plano con su signo y frame, frames sin extremo); esquema con y sin escala, escalas mal formadas y marcadores ajenos al modelo. En navegador: elegir objeto (longitud de partida), aviso con 50 px, tercer toque que mueve el extremo más cercano, tocar no mueve marcadores, mm por píxel, velocidad del tobillo en m/s frente a la real con la escala (±5 %), ángulo igual, guardado, recuperado tras recargar y «Quitar» (vuelve a px/s y se guarda vacío). Entre dos marcadores: rodilla–tobillo y primeros 2 s por defecto, sin longitud de partida, distancia media real (120 px), precisión mejor que con dos toques, mm por píxel y m/s del tobillo con la escala, guardado y recuperado. Longitud de los segmentos: muslo 130 y pierna 120 px, variación < 1 % y ningún frame fuera.

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

## 7. Exportación CSV [D7] — hecho (paso 7)

Implementado con `;` y coma decimal por defecto y el formato internacional como opción (se recuerda). Columnas por frame: `t_s`, `frame`; por marcador `x_px`, `y_px`, `calidad`, `manual`, `interpolado`, `filtrado_x_px`, `filtrado_y_px`, con escala `filtrado_x_m`, `filtrado_y_m`, y `velocidad_m_s` (o `_px_s`); del ángulo, crudo, filtrado, relativo, velocidad y aceleración. Las posiciones en metros son las filtradas (origen en la esquina de la imagen, y hacia abajo): la escala es solo un factor. La cabecera lleva la calibración completa. Descargar siempre; «Compartir» solo si el navegador puede compartir archivos (Chrome para Android sí). Prueba e2e: filas = frames, crudo frente a la verdad, m/s del tobillo (±5 %) y vacío en el primer frame.

Plan original:

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
| 8 | Gráfica: crudo y filtrado, velocidad; trayectoria completa en el vídeo (ver nota). Hecho: parte A (gráfica y trayectoria) y parte B (pestañas y barra fija) | Sonnet |
| 9 | Cierre de fase: revisión, CLAUDE.md y limitaciones | Opus |

**Nota para el paso 8 (gráfica) — hecho (parte A):** la línea del frame actual tiene que ir en una capa aparte (un canvas o un elemento superpuesto a la gráfica), sin redibujar las curvas. Hoy cada cambio de frame llama a `redraw` de uPlot y redibuja todas las series; con la gráfica llena (cruda, filtrada y, en el paso 5, velocidad) avanzar frame a frame va menos suave. Tocar o arrastrar la gráfica debe seguir funcionando igual.

**Distribución de los paneles en pantalla ancha (paso 8, pedido tras probar el paso 6) — hecho (parte B):** hoy, desde 1024 px (`lg`), el visor tiene dos columnas: vídeo, controles y gráfica a la izquierda, y a la derecha una columna fija de 20rem con «Marcadores», «Filtro», «Escala», «Velocidad y cero» y «Datos del vídeo» uno debajo de otro. Esa columna es mucho más larga que la izquierda y obliga a hacer scroll, perdiendo el vídeo de vista. Alternativas:
- **A. Pestañas por tarea en la columna derecha:** «Marcar» (marcadores, seguimiento, huecos), «Análisis» (filtro, velocidad y cero), «Escala» (escala y longitud de los segmentos) y «Vídeo» (datos). Solo se ve una a la vez y la columna cabe casi sin scroll. Hay que cuidar que lo que avisa (huecos, escala a rehacer) se vea también desde otra pestaña, por ejemplo con un punto en el nombre de la pestaña.
- **B. Columna derecha fija con su propio scroll** (`sticky top-0` y `max-h-dvh overflow-auto`): el vídeo y la gráfica no se mueven al recorrer los paneles. Es el cambio más pequeño, pero no acorta nada.
- **C. Repartir debajo de la gráfica:** en la columna derecha solo «Marcadores» (lo que se usa con el vídeo), y «Filtro», «Escala», «Velocidad y cero» y «Datos» en una rejilla de dos columnas bajo la gráfica. Aprovecha el ancho, que en una pantalla externa sobra (en la captura del paso 6, a 1557 px, quedaba un margen vacío a la derecha).
- **D. Tres columnas desde 1536 px (`2xl`):** marcar a la izquierda, vídeo y gráfica en el centro, análisis a la derecha. Vídeo más estrecho; solo compensa en pantallas muy anchas.

Recomendación: **A + B** (pestañas en una columna fija con su propio scroll), con «Datos del vídeo» plegado por defecto. En el móvil, el orden actual con la barra fija inferior del punto siguiente; las pestañas también podrían servir ahí, pero se decide al hacerlo. Al tocarlo, las pruebas e2e que localizan paneles por `data-testid` tienen que abrir antes su pestaña.

**Longitud de los segmentos en la gráfica (paso 8, tras probar el paso 6) — hecho (parte A):** hoy solo hay un resumen (mediana, variación, máximo). Una curva de la longitud de cada segmento en % frente a su mediana, con el eje en segundos como el ángulo, enseñaría en qué partes del movimiento sale del plano, y si coincide con el fondo de cada repetición.

**Barra fija inferior en el móvil (paso 8, pedido tras probar el paso 5) — hecho (parte B):** los botones de avance, la línea de t / frame / ms / modo de lectura y la fila de ángulo, relativo, °/s y °/s² en una barra fija abajo, para no perderlos de vista al recorrer el movimiento ni al hacer scroll hasta la gráfica. El contenido de la página deja sitio debajo para que la barra no tape el final. En pantalla ancha se queda como está. Altura fija: lo que cambie de texto no puede mover los botones (prueba e2e de 340 a 440 px).

**Trayectoria completa en el vídeo (paso 8, pedido tras probar el paso 4) — hecho (parte A):** hoy solo se dibujan los últimos 20 frames de cada marcador (`ESTELA` en `Visor.tsx`), pensado para vigilar el seguimiento. Para analizar el recorrido (camino de la rodilla en la sentadilla, desviaciones laterales en vista frontal):
- interruptor «Trayectoria completa», para todos los marcadores o eligiendo cuáles; la estela corta sigue como ahora;
- dibujada con las coordenadas **filtradas** (las crudas tiemblan justo donde se quiere ver la forma);
- cortada en los huecos, como la gráfica, y a trazos en lo interpolado;
- preparada una vez (p. ej. un `Path2D` por marcador o una capa propia) y rehecha solo al cambiar las trayectorias o el corte, no en cada frame, para no empeorar el avance frame a frame;
- aviso: es la trayectoria en la imagen; solo equivale al recorrido físico para lo que se mueve en el plano de la cámara, y en metros con la escala del paso 6.

**Cómo quedó (paso 8, parte A: gráfica y trayectoria):**
- **Gráfica** (`src/ui/visor/PanelGrafica.tsx` y `GraficaTiempo.tsx`, que sustituye a `GraficaAngulo.tsx`): paneles de uPlot uno debajo de otro, con el mismo eje X en segundos (los tiempos de todos los frames) y el mismo cursor: ángulo crudo (ámbar, con puntos) y filtrado (línea clara), velocidad angular (°/s, decidido: panel debajo y no un segundo eje, que mezcla ° y °/s) y longitud de los segmentos. Un botón por serie la muestra u oculta y da su valor en el frame actual; un panel sin series a la vista no se dibuja. Los segmentos empiezan ocultos (son una comprobación). Tocar o arrastrar cualquier panel salta al frame más cercano.
- **Núcleo** en `src/core/graficas/series.ts`: `seriePorFrame` (una serie por instantes a un valor por frame, emparejando por `t` exacto) y `partirInterpolado` (línea continua y de trazos; la de trazos lleva el frame medido a cada lado para unirse, nunca a través de un hueco). `rangoY` admite otro alto mínimo (40 °/s en la velocidad, 10 % en los segmentos). Lo interpolado va a trazos también en lo filtrado y en la velocidad (donde el ángulo filtrado sale de algo interpolado).
- **Cursor en una capa aparte:** la línea vertical y el punto son dos elementos dentro de la capa de uPlot, movidos con `transform`; cambiar de frame no llama a `redraw` (la gráfica lleva un contador de redibujados, `data-redibujos`, y una prueba e2e comprueba que avanzar no lo sube; con `redraw` en cada frame falla). Medido en Playwright con 1800 frames (el vídeo `verde` repetido 15 veces), avanzando 300 frames: con la CPU a ×4, la gráfica añadía unos 31 ms por frame (94 frente a 63 ms sin gráfica) y ahora unos 7 ms (70 frente a 63); a ×1, de 5 ms a 2 ms.
- **Longitud de los segmentos:** `constanciaSegmento` devuelve también `relativa` (variación de cada frame frente a la mediana, NaN donde falta un extremo) e `interpolado`. Curva en %, con la banda de ±3 % (`UMBRAL_CONSTANCIA`).
- **Trayectoria completa** (`core/graficas/trayectoria.ts`, `polilineasTrayectoria`, y `src/ui/visor/ControlTrayectoria.tsx`): interruptor en el panel «Marcadores» y un botón por marcador (todos elegidos al encenderla). Con las posiciones filtradas; un frame sin posición corta la línea y lo interpolado va en otra polilínea, a trazos, que comparte el punto de unión. Un `Path2D` por marcador (continuo y a trazos), rehecho solo cuando cambia lo filtrado; en cada frame solo se pinta, debajo de la estela.
- **Fuera de esta parte:** curvas de la aceleración angular, de la velocidad de cada marcador y del ángulo relativo al cero (están en el panel y en el CSV); guardar en la sesión qué series y trayectorias se ven (vuelven a lo de por defecto al reabrir); zoom en la gráfica.
- **Pruebas e2e:** valor de cada serie en varios frames frente a la verdad (crudo y filtrado ±0,5°, velocidad ±3 °/s), «—» sin derivada; interruptores; tocar los paneles de velocidad y de segmentos; cursor en el instante del frame sin redibujar; segmentos a 0 % (±1 %) en todo el vídeo; trayectoria apagada por defecto, encendida en frames que la estela no cubre, por marcador. El corte en los huecos y los trazos de la trayectoria se prueban en el núcleo: en los vídeos sintéticos la vuelta del movimiento (0→90→0°) pasa por los mismos puntos y taparía el hueco.

**Cómo quedó (paso 8, parte B: pestañas y barra fija):**
- **Pestañas, A + B del plan, también en el móvil** (se decidió tras la propuesta: lo que se busca es menos scroll y menos pasos, y en el móvil los paneles quedaban tras la gráfica). «Marcar», «Análisis», «Escala» y «Vídeo» con el reparto de la propuesta; «Longitud de los segmentos» ya vive dentro del panel de escala. «Datos del vídeo» **no** se pliega dentro de su pestaña (el plegado era para acortar la columna y la pestaña ya lo hace; plegado haría falta un toque más).
- **Los paneles siguen montados** cuando su pestaña no se ve (`hidden`): no pierden estado (corte del filtro, borrador de la escala) ni hay que volver a calcular. Contrapartida: en las pruebas, un elemento de otra pestaña no es visible hasta abrirla (`abrirPestana` y `textoDe` en `tests/e2e/utiles.mjs`).
- **Puntos de aviso** (`aviso-pestana-<id>`) solo cuando la pestaña no está abierta, con su motivo en `aria-label`: huecos (Marcar), cero que no parece quieto (Análisis), escala que se puede rehacer (Escala). Sale de las mismas condiciones que ya muestran los paneles; sin cálculo nuevo.
- **Columna fija:** desde `lg`, `sticky top-4` con `max-h` de la ventana y `overflow-y-auto`; la tira de pestañas queda pegada arriba dentro de ella. El vídeo y la gráfica no se mueven al recorrerla. Un pequeño ancho nuevo (22 rem en vez de 20) por las pestañas.
- **Móvil:** el orden es vídeo, deslizador, pestañas (la tira también es `sticky`), panel abierto y gráfica; la barra fija abajo. La barra agrupa línea de posición, valores del frame y botones; altura fija, `pb` de la página igual a su altura medida y `safe-area-inset-bottom` para el gesto de Android. Botones de 48 px (56 desde `lg`) para que la barra ocupe menos.
- **Pruebas e2e:** pestañas (la abierta, qué se ve y qué no, estado que se conserva), puntos de aviso en una pestaña oculta (huecos, cero, escala por rehacer), pestañas entre vídeo y gráfica en el móvil, columna con su propio scroll sin mover el vídeo (1280 px de ancho, ventana baja), barra pegada abajo con scroll que no tapa el final (la gráfica acaba sobre ella), barra que no es una caja en pantalla ancha, y la prueba de 340 a 440 px ahora mide la barra y los botones.
- **Fuera de esta parte:** recordar la pestaña elegida (al reabrir un vídeo vuelve a «Marcar»); abrir una pestaña por sí sola al empezar a calibrar o al seguir; el deslizador de frames dentro de la barra (queda en el flujo para que la barra sea baja).

**Después del paso 8 (pedido tras probar la parte B en el móvil):** el vídeo y la gráfica a la vez, sin scroll.
- **Hecho: vídeo pegado con la gráfica pequeña (móvil).** El vídeo (con tope de 34 dvh, luego 30) y una gráfica baja del ángulo (`MiniGrafica`: crudo fino, filtrado y huecos como en la completa; tocar o arrastrar salta de frame; cursor en capa aparte, sin redibujar) quedan pegados arriba mientras se desplazan las pestañas y los paneles; las pestañas se pegan justo debajo. Por debajo de `lg` solamente; en pantalla ancha no se monta. La velocidad y los segmentos siguen solo en la gráfica completa. Pruebas e2e: vídeo y gráfica no se mueven al desplazarse y no pasan de un 36 % de la ventana, pestañas pegadas debajo, salto de frame desde la gráfica pequeña y cursor, `data-redibujos` sin cambios al cambiar de frame, y nada de esto en 1280 px.
- **Hecho: la gráfica pequeña alterna ángulo, velocidad o las dos normalizadas.** Las dos juntas van cada una dividida por su mayor valor absoluto (el ángulo, de 0 a 1 si no cambia de signo; la velocidad, de −1 a 1), con el eje en «% del máximo» y una nota: sirve para ver si coinciden en el tiempo (la velocidad máxima a mitad de la flexión, el ángulo máximo cuando la velocidad cruza el cero), no para leer valores; esos, en la gráfica completa.
- **Hecho: vistas ampliadas en el móvil** (solo por debajo de `lg`, estado en memoria). «Vídeo grande» (botón en la esquina del vídeo): ocupa la pantalla hasta la barra fija con la tira compacta de los tres marcadores, «Seguir desde aquí» / «Parar» y el último aviso; oculta (sin desmontar) pestañas, deslizador y gráficas. «Solo gráficas» (botón junto a la gráfica pequeña): la completa a todo el espacio, con paneles más altos. La barra fija sigue en las tres; la página de debajo no se desplaza. Capa propia de la página (CSS), no la pantalla completa del navegador. Pruebas e2e: marcar y seguir en el vídeo grande con el ángulo real al volver, ocupación de la pantalla, lo oculto, y en solo gráficas tocar para saltar de frame y volver. **Para después:** girar el móvil en la vista de vídeo grande; la tira compacta no tiene «Quitar la marca a mano» ni el resto de avisos del panel.
- **Corregido tras probarlo en el móvil: la tira de pestañas se soltaba.** Era `sticky` dentro de la columna de herramientas y se iba con ella al acabar sus paneles (sobre todo con una pestaña corta, como «Escala»). En el móvil la columna es ahora `contents` y la tira cuelga de la página, como el vídeo; en pantalla ancha sigue dentro de su columna con scroll propio.
- **Más sitio entre el vídeo y la barra (tras probarlo en el móvil, con un vídeo vertical quedaban menos de 200 px para las herramientas):** barra de 167 a 128 px (línea de posición en una fila, sin «t =» ni «frame» en el móvil; fila de valores más baja; botones de 44 px), vídeo de la vista mixta con tope de 30 dvh en vez de 34 (para marcar está el vídeo grande), tira de pestañas y cabecera de la gráfica pequeña algo más bajas. Unos 85–90 px más en un móvil de 432 × 960.
- **Hecho: «solo gráficas» sin desplazarse.** Las gráficas se reparten el alto de la pantalla (CSS, no alturas por móvil): `GraficaTiempo` con `alto='llenar'` ocupa su contenedor y se ajusta si cambia; ángulo 1,2 partes y velocidad y segmentos 1 cada uno, mínimo 110 px por panel; botones de serie en una sola fila deslizable; sin resumen ni notas en esta vista. Comprobado sin scroll a 390 × 844, 432 × 960 y 768 × 1024, con y sin los segmentos. La vista se activa por ancho (< 1024 px): una tablet en vertical la usa; en horizontal usa el diseño de escritorio, donde falta el paso «columna izquierda a la altura de la ventana».
- **Hecho: deslizador y franja de estado en una sola barra** (tras pedirlo desde el móvil: eran dos filas con el mismo ancho). La franja pasa a ser la pista del deslizador y el tirador (14 × 26 px, ámbar con borde) va encima: 28 px de alto en vez de unos 36, sin perder la información de cada frame (seguido, perdido, a mano, interpolado) y con un tirador más fácil de ver y de coger. No se mete en la barra fija de abajo: sumaría su alto a la barra.
- **Hecho: el vídeo grande lleva también la trayectoria completa y las correcciones.** Botón de trayectoria sobre el vídeo (mismo estado que el del panel «Marcar») y, solo cuando proceden, «Quitar la marca a mano de este frame», «Rellenar N huecos cortos», «Quitar lo interpolado» e «Ir al primer frame con hueco». Quedan fuera el filtro, la escala y la exportación (viven en sus pestañas).
- **Corregido: la franja de estado de los frames salía de un solo color al volver del vídeo grande** (visto en el móvil). `BandaFrames` se dibujaba con el ancho del momento y, oculta, medía 0: un píxel estirado. Ahora no dibuja con ancho 0 y se rehace al mostrarse o cambiar de tamaño; hay prueba de la franja (verde, rojo en el hueco) al volver, comprobada también sin el arreglo.
- **Hecho (escritorio): la columna de herramientas mide lo mismo que la tarjeta de la gráfica** (pedido tras ver capturas en las que cada una acababa a una altura y el scroll salía o no según la pestaña). La rejilla estira la columna a la altura de la fila (vídeo con controles y gráfica, mínimo 34 rem); su contenido va en una caja absoluta con scroll propio, que solo sale si el panel excede esa altura, y la última tarjeta de cada pestaña rellena el resto. La altura es la misma en las cuatro pestañas, con y sin la trayectoria desplegada (prueba a 1280 × 900 y 1920 × 1000). Sustituye al tope `100dvh − 10rem` de abajo.
- **Hecho (escritorio): una sola tarjeta de herramientas que se desplaza por dentro** (pedido tras ver que el scroll de la columna cortaba el contenido en seco, sin esquinas redondeadas abajo). Bajo la tira de pestañas hay una única tarjeta con las esquinas redondeadas siempre, que es la que se desplaza; los paneles de dentro se quedan sin borde ni fondo y se separan con una línea. La tarjeta es `relative` (un elemento absoluto de un panel escapaba al recorte y alargaba la página: lo cazó la prueba de las cuatro pestañas). En el móvil, sin cambios: cada panel sigue siendo su tarjeta.
- **Corregido (escritorio): una pestaña alta alargaba la página.** La columna de herramientas tenía como tope `100dvh − 2rem`, más que el hueco real; con «Marcar» y la trayectoria desplegada la página crecía unos 30 px, aparecía el scroll y el pie bajaba. Ahora el tope es `100dvh − 10rem` (cabecera de 48 px y pie) y la columna se desplaza por dentro; la prueba recorre las cuatro pestañas a 1280 × 900 y 1920 × 1000.
- **Hecho: el deslizador también en el vídeo grande**, bajo los controles de marcado y el aviso. Se mantiene la barra naranja de progreso (solo mientras se sigue y comparte fila con «Parar»: no cuesta alto) y la franja de estado, que se va poniendo verde a medida que se sigue, se ve también en el propio vídeo grande.
- **Corregido: el pie con la rama y el commit quedaba tapado por la barra fija en el móvil.** El hueco para la barra estaba dentro del visor y el pie, que cuelga de `main`, quedaba justo debajo; ahora el hueco es la parte de abajo de la página entera.
- **Hecho: sin la gráfica completa bajo las herramientas (móvil y tablet vertical).** Con la gráfica pequeña y «Solo gráficas» a un toque, la completa debajo era otra pantalla de scroll: ahora la página acaba en el panel de la pestaña abierta. La gráfica completa sigue montada pero oculta (conserva qué series se ven) y no se redibuja con los lotes del seguimiento mientras no se ve (`GraficaTiempo`: datos pendientes hasta que se muestra); «Solo gráficas» vuelve a mostrar el resumen de máximo y mínimo. Vigilado: la oculta se redibuja ≤ 2 veces durante todo el seguimiento y al abrirla tiene la curva pintada (pruebas e2e). En pantalla ancha no cambia.
- **Hecho: tira de pestañas pegada, más limpia (móvil).** Sin borde propio (dos líneas seguidas: la del vídeo y la de la tira), con aire por arriba y un degradado por debajo en vez de un corte seco del texto de las tarjetas. En pantalla ancha conserva su caja con borde.
- **Hecho: tira de pestañas con fondo opaco** de lado a lado y por debajo (tras verlo en el móvil: por las esquinas redondeadas se veían las tarjetas que se desplazan detrás).
- **Hecho: escritorio, la pantalla cabe en la altura de la ventana.** Lo primero que se probó (vídeo, controles y gráfica apilados con el vídeo acotado) no cabía: con un vídeo horizontal sobraban unos 150 px a 1280 × 900, y reducir el vídeo a 145 px lo dejaba inútil. Se pasó a vídeo con controles a la izquierda y gráfica a su lado, en una rejilla de tres columnas (vídeo `1,5fr`, gráfica `1fr`, herramientas 22 rem) y con `main` de 90 rem en el visor (antes 72). Probado sin scroll vertical a 1280 × 900 y 1920 × 1000, con vídeos horizontal y vertical y con los segmentos encendidos. Coste: la gráfica es más estrecha que debajo del vídeo (unos 330 px a 1280), y se pierden las notas bajo ella (irán al glosario).
- **Pendiente, sin fase: glosario / wiki** de parámetros y avisos (ver CLAUDE.md, «Ideas apuntadas»).

**Avance mantenido (observado en el móvil tras el paso 4) — corregido en el PR del paso 4:** manteniendo pulsado avanzar o retroceder, tras unos segundos cada frame tardaba 130–200 ms (al principio, 0–8 ms). Con los ms a la vista y leyendo Mediabunny salieron dos fallos de lectura del vídeo:
- **Hacia delante:** al mantener pulsado, si un frame tardaba más que el intervalo de repetición (70 ms), «el último gana» se saltaba uno y pedía el siguiente; cualquier petición que no fuera exactamente la siguiente volvía al fotograma clave, que tarda más y hace saltarse más frames: el avance quedaba atascado. Ahora, sin fotograma clave entre medias, se sigue decodificando hacia delante.
- **Hacia atrás:** la caché del paso 3 no se llenaba con los frames de paso, porque `CanvasSink.canvases(t)` solo entrega desde t (decodifica los anteriores pero los descarta). Cada paso atrás más allá de lo ya visto volvía al fotograma clave. Ahora se pide desde el fotograma clave (o desde lo que cabe en la caché) y solo uno de cada grupo de imágenes decodifica.
Quedan por medir en el móvil, con el número de ms y el modo (`caché` / `seguido` / `clave`) junto al número de frame: si con esto desaparecen los 130–200 ms y si el redibujado de la gráfica (nota anterior) se nota aparte. El redibujado se quitó en el paso 8 (parte A).

Las pruebas e2e van primero para que cada paso siguiente quede cubierto. La persistencia va antes que los cálculos porque probar los filtros con vídeos reales sin guardar el marcado obliga a repetirlo cada vez.

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Qué se filtra | Las coordenadas de los marcadores; ángulos y derivadas se calculan después |
| D2 | Frecuencia de corte | 6 Hz por defecto, ajustable de 2 a 15 Hz |
| D3 | Cero de referencia | Media de un tramo estático elegido; mostrar crudo y relativo |
| D4 | Objeto de calibración | El que haya: cinta, palo o regla en el plano del movimiento (la app no impone uno; se elige en la app y solo cambia la longitud de partida y los consejos) |
| D5 | Interpolar huecos cortos | Solo a petición, ≤ 0,2 s, siempre marcado como interpolado |
| D6 | Persistencia | IndexedDB sin el vídeo; al reabrir el mismo archivo, recuperar el trabajo |
| D7 | Formato CSV | `;` y coma decimal por defecto; el internacional como opción |
| D8 | Pruebas e2e | En el repo y en la CI |
