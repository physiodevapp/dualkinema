# Fase 5: sin marcadores en 2D (con gomets opcionales)

Estado: **plan aceptado** (2026-10-27; D1–D8 aceptadas por el usuario tal como se proponen). En curso: pasos 1 a 4 hechos (ver «Hecho»).

## Cambio de rumbo (27-10-2026)

El primer plan de esta fase era el 3D con un objeto de calibración (DLT con una plomada de bolitas o una varilla en marcas del suelo, y validación con una varita y el goniómetro). El usuario lo descarta: **demasiado material y tiempo** de preparación para el uso que quiere darle. Lo que quiere es algo como las apps de análisis con un solo móvil (tipo Yogger), **sin marcadores**, que acepte gomets como opción y que, con dos móviles, dé profundidad y 3D **sin objetos de calibración**.

El nuevo orden de fases (también en `CLAUDE.md`):

| Fase | Qué | Material nuevo |
|---|---|---|
| **5** | **Sin marcadores en 2D:** el cuerpo detectado en el navegador (MediaPipe) en una vista, con los ángulos de siempre; los gomets, opcionales y comparables | Ninguno |
| **6** | **3D con dos móviles calibrado con la propia persona:** posición de una cámara respecto a la otra a partir de los puntos del cuerpo (y de los gomets, si los hay), la vertical del acelerómetro de cada móvil, la escala de la altura de la persona; asistente de colocación | Ninguno |
| **7** | **Esqueleto completo:** articulaciones restringidas ajustadas frame a frame a los puntos 3D; todas las articulaciones en los tres planos y las dos piernas a la vez | Ninguno |

El objeto de calibración (plomada, damero) queda como **modo preciso opcional** para más adelante, si hace falta para investigación o para validar el 3D calibrado con la persona; no es necesario para usar la app.

**¿Hacen falta gomets en el producto final?** No para el uso normal. Quedan para:
- **validar** (comparar lo que da el modelo con puntos colocados sobre referencias óseas): en esta fase, con vídeos que el usuario ya tiene;
- **más precisión en un punto concreto** (investigación, un caso dudoso, ropa ancha que esconde la rodilla);
- **ayudar a la calibración 3D** (fase 6): un gomet es un punto más preciso que uno estimado por el modelo.

Lo hecho en las fases 1–4 sirve tal cual: vídeo, tiempos, seguimiento de gomets, sincronía, grabación doble, filtros, ángulos (ya aceptan puntos de cualquier origen), gráficas y CSV. Sin marcadores es **otra fuente de puntos** para lo mismo.

---

## 1. Qué modelo y dónde corre [D1, D2]

**D1 — Modelo: MediaPipe Pose Landmarker** (Tasks Vision, Apache 2.0, gratuito; ya previsto en `CLAUDE.md`). Da 33 puntos por persona y frame: en imagen (normalizados), una estimación «3D» centrada en la cadera con una sola cámara (no se usa: su profundidad la supone el modelo), y por punto una **visibilidad** y una **presencia** (0–1). Tres tamaños: *lite*, *full* y *heavy* (más preciso y más lento). Cuál se usa lo decide el paso 1 con datos: precisión frente a los gomets y tiempo en el Pixel 8. Si MediaPipe no da la precisión necesaria, se evalúan otros modelos abiertos que corran en el navegador; no antes.

**D2 — Dónde corre:** dentro del navegador, nunca en un servidor (RGPD). En un **worker** como el del seguimiento (`workers/pose.worker.ts`), decodificando los frames con Mediabunny igual que hoy y llamando al modelo en modo vídeo con el **tiempo del vídeo** de cada frame (`tabla.tiempos`, nunca un reloj), con aceleración por GPU si el worker la admite y, si no, en CPU (a comprobar en el paso 1). Se procesa el vídeo entero una vez, con progreso y «Cancelar», como «Seguir».

**Dónde viven el código y el modelo:** la librería y el WASM, de la CDN (permitido: no envía datos) o alojados en el sitio; el archivo del modelo (unos MB), alojado en el propio sitio si cabe en el límite por archivo de Cloudflare (25 MiB), para no depender de terceros. Se carga solo al pedirlo (`import()`), como el visor: la portada no lo descarga.

## 2. Los puntos del cuerpo como trayectorias [D3]

Cada punto que interesa se guarda como la trayectoria de un **marcador virtual** del modelo de la sesión (`Muestra2D`: t, x, y en px de la imagen tal como se ve, calidad, `editadoManual`), con ids propios (p. ej. `pose_rodilla_der`) para que no se confundan con los gomets. Así **todo lo que ya existe se aplica sin cambios:** huecos (NaN, nunca inventado), `CALIDAD_MINIMA`, filtro por tramos, interpolación de huecos cortos a petición, cero de referencia, gráficas, CSV.

- **Calidad = visibilidad** del modelo; por debajo del umbral, el punto no es utilizable (el umbral se fija en el paso 1 con los vídeos del usuario; `CALIDAD_MINIMA` sigue siendo uno solo).
- **Qué puntos:** hombros, caderas, rodillas, tobillos, talones y puntas de los pies, de los dos lados (12). El resto no se guarda.
- **Corrección a mano:** tocar un punto lo deja a mano, como hoy con un gomet; volver a detectar no lo sobrescribe.
- **Cambios de lado:** de perfil, el modelo a veces intercambia izquierda y derecha unos frames. Se detecta (salto brusco de los dos a la vez que se deshace intercambiándolos) y se corrige o se marca como dudoso; se ve en el paso 1 si pasa con los vídeos del usuario.

## 3. Ángulos sin marcadores [D4]

Los puntos de MediaPipe son **centros articulares aproximados** (lo que aprendió de anotaciones humanas), no referencias óseas: la cadera de MediaPipe no es el trocánter. Por eso las articulaciones sin marcadores son **entradas propias del catálogo**, con su convención fijada por tests, igual que las de los gomets:

- **De perfil (sagital):** cadera (tronco = hombro → cadera; muslo), rodilla (muslo; pierna), tobillo (pierna; talón → punta del pie, con cero 90) y **inclinación del tronco respecto a la vertical** (un ángulo absoluto: segmento frente a la vertical de la imagen; es nuevo, y lo pedía la idea de los protocolos tipo BTS). **Solo la pierna que mira a la cámara:** la otra queda detrás y el modelo supone sus puntos.
- **De frente (frontal):** **las dos rodillas a la vez** (FPPA de cada una: cadera, rodilla y tobillo de MediaPipe), aducción de cadera de cada lado respecto a la línea de las caderas, oblicuidad pélvica e inclinación lateral del tronco. Es una ganancia frente a los gomets: hoy el FPPA es de una sola pierna.
- Un **ángulo sin marcadores no se compara a pelo con uno de gomets:** los puntos son otros y puede haber una diferencia constante de unos grados. Se comparan la forma de la curva, el rango y el valor relativo al cero de referencia.

## 4. Gomets opcionales y comparación [D5]

En una vista pueden convivir gomets y puntos del modelo. Cada articulación dice de qué fuente sale; si hay gomets, por defecto mandan ellos (son más precisos) y la otra fuente se muestra para comparar. Se reutiliza la comparación de la fase 3 (`PanelComparacion`, superpuestas), con «gomets» y «sin marcadores» en lugar de A y B, y un resumen: diferencia media, dispersión y rango de cada uno.

## 5. Interfaz [D6]

- En «Marcar», **«Detectar el cuerpo»** junto a «Seguir»: elige el modelo la primera vez (o el que dé el paso 1), progreso, «Cancelar», y al acabar, el **esqueleto dibujado sobre el vídeo** (líneas entre los puntos, con los dudosos aparte y lo interpolado en azul, como hoy).
- Al abrir un vídeo nuevo, la app pregunta si se analiza **con gomets o sin marcadores** (se puede añadir lo otro después).
- La franja de calidad, la gráfica, la fila de valores y el CSV funcionan igual. El CSV dice la fuente de cada columna y el modelo usado.
- Glosario: «Sin marcadores», «Visibilidad del punto», «Centro articular frente a referencia ósea», «Inclinación del tronco».

## 6. Persistencia [D7]

**Esquema 5:** la vista guarda qué modelo detectó sus puntos (nombre, tamaño, versión, fecha) para poder repetir el análisis, y sus trayectorias van como las de los gomets (empaquetadas). Migración 4 → 5 (vacía) con su test. Rellenar los nuevos ids en el modelo no cambia lo guardado de los gomets.

## 7. Pruebas y validación [D8]

- **Núcleo:** paso de los puntos del modelo a px (con las rotaciones del vídeo), calidad, cambios de lado, ángulos del catálogo sin marcadores (casos de valor conocido: rodilla recta 0°, 90°, tronco vertical 0°), y la comparación de dos fuentes.
- **e2e:** el modelo necesita una persona de verdad en el vídeo, y los vídeos sintéticos de las e2e son manchas de colores. Propuesta: las e2e del visor prueban el camino con los resultados del worker simulados (los mensajes de su protocolo), y una prueba aparte pasa el modelo de verdad por un vídeo corto de licencia libre (a buscar en el paso 3) si el Chromium de la nube lo ejecuta en CPU en un tiempo razonable.
- **Validación real (con lo que ya hay, sin grabar nada nuevo):** los vídeos de sentadilla del usuario ya seguidos con gomets, de perfil y de frente. Luego, si hace falta, algún vídeo nuevo con ropa normal y con ropa ancha.

---

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Experimento de MediaPipe** (detalle abajo): detrás de `?pose`, «Detectar el cuerpo (experimental)» en el visor; esqueleto sobre el vídeo y, si la sesión tiene gomets, la flexión de la rodilla de las dos fuentes superpuestas, con un informe para copiar. Sin guardar nada | Opus |
| 2 | **Núcleo:** puntos del modelo como trayectorias, calidad, cambios de lado, catálogo sin marcadores (sagital, frontal bilateral, tronco absoluto) con sus tests, comparación de dos fuentes | Opus |
| 3a | **Visor, detectar y ver:** «Detectar el cuerpo» de verdad (worker, progreso, parar), esqueleto, elegir con gomets o sin marcadores al abrir, corrección a mano, esquema 5, el modelo *full* alojado. e2e | Opus |
| 3b | **Visor, varias articulaciones:** articulación elegida por vista (rodilla, cadera, tobillo, tronco), fuente por articulación, comparación con los gomets (directa y relativa al cero, con el informe), CSV con todas, glosario. e2e | Opus (maquetación fina en un PR de Sonnet si hace falta) |
| 4 | **Vista de frente sin marcadores:** las dos rodillas y la cadera de cada lado, oblicuidad pélvica; con dos vistas (perfil y frente sincronizadas), cada una con su fuente | Opus |
| 5 | **Validación con el usuario** y ajustes: umbral de visibilidad, modelo por defecto, filtro, cambios de lado; `docs/grabacion.md` (cómo grabar sin marcadores: ropa, luz, fondo, distancia) | Opus |
| 6 | Cierre: revisión de código, documentación y limitaciones | Opus |

### Paso 1 en detalle: el experimento

Objetivo: saber, con vídeos reales del usuario y antes de construir nada más, **cuánto se aparta MediaPipe de los gomets y cuánto tarda en el Pixel 8**.

- Solo con `?pose` en la dirección (como `?laboratorio`): en la pestaña «Marcar», un botón «Detectar el cuerpo (experimental)» con el tamaño del modelo a elegir (*lite*, *full*, *heavy*).
- Recorre el vídeo entero en un worker con el tiempo de cada frame, con progreso y «Cancelar».
- Dibuja el esqueleto sobre el vídeo en cada frame.
- Si la vista tiene gomets seguidos (una sesión recuperada), superpone en una gráfica la flexión de la rodilla con gomets y sin marcadores (filtradas igual), y un **informe en texto** para pegármelo:
  - modelo, GPU o CPU, tiempo total y frames por segundo procesados;
  - % de frames con la pierna detectada y visibilidad mediana de cadera, rodilla y tobillo;
  - flexión de rodilla: diferencia media y su dispersión, error cuadrático medio tras quitar la diferencia media, rangos de cada fuente y correlación;
  - frames con cambio de lado.
- No se guarda nada en la sesión ni cambia el esquema; si se cierra, se pierde.

Lo que necesito del usuario para el paso 1: abrir con `?pose` en la previsualización **dos o tres vídeos que ya tengan sesión con gomets** (de perfil, y uno de frente si hay), probar *lite* y *full* (y *heavy* si no tarda demasiado) y pegarme los informes.

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Modelo | MediaPipe Pose Landmarker; el tamaño lo decide el paso 1; otros modelos solo si este no basta |
| D2 | Dónde corre | En un worker del navegador, frame a frame con el tiempo del vídeo; el modelo alojado en el sitio y cargado al pedirlo |
| D3 | Puntos | 12 puntos del cuerpo como trayectorias de marcadores virtuales; calidad = visibilidad; corrección a mano como con los gomets; cambios de lado detectados |
| D4 | Ángulos | Entradas propias del catálogo (centros articulares): de perfil, cadera, rodilla, tobillo y tronco respecto a la vertical, de la pierna que mira a la cámara; de frente, las dos rodillas, cadera y pelvis |
| D5 | Gomets | Opcionales; si hay, mandan, y se comparan con el modelo en la misma gráfica |
| D6 | Interfaz | «Detectar el cuerpo», esqueleto sobre el vídeo, elegir fuente al abrir |
| D7 | Esquema | 5, con el modelo usado en cada vista |
| D8 | Validación | Con los vídeos con gomets que ya tiene el usuario |

## Hecho

**Paso 1 — experimento de MediaPipe** (`?pose`; `core/pose/`, `workers/pose.worker.ts`, `ui/visor/ExperimentoPose.tsx`). Con `?pose` en la dirección, la pestaña «Marcar» lleva una tarjeta «Sin marcadores (experimental)»: modelo (*lite*, *full* por defecto, *heavy*) y procesador (GPU por defecto, o CPU), «Detectar el cuerpo (experimental)» con progreso y «Parar». Sin `?pose` no existe y no se descarga nada.

- **Worker:** decodifica el vídeo con Mediabunny como el del seguimiento, reducido a 960 px de lado mayor (el modelo trabaja a 256 px), y pasa cada frame por Pose Landmarker en modo vídeo con el **tiempo del vídeo** de cada frame (ms desde el primero, siempre creciente). La salida (normalizada) se pasa a px del vídeo tal como se ve, el sistema de las trayectorias de los gomets. Si la GPU no se puede usar (al crear el detector o en el primer frame), sigue en CPU y lo dice.
- **Dónde vive cada cosa:** la librería, `@mediapipe/tasks-vision` 1.1.0; su WASM (variante «module», 13 MB) se aloja en el propio sitio (Vite lo copia de `node_modules` con `?url`) y el worker de módulo lo carga con `import()` (para un segundo intento, GPU → CPU, el cargador se vuelve a poner en `self.ModuleFactory`, que MediaPipe borra tras usarlo). El modelo `.task` se descarga de Google (`storage.googleapis.com/mediapipe-models/…/float16/1/`) al empezar: solo se descarga, no se envía nada. Alojarlo es decisión del paso 3 (el *heavy*, 30 MB, no cabe en el límite por archivo de Cloudflare).
- **Núcleo (`core/pose/`):** `puntos.ts` (los 12 puntos que se guardan —hombros, caderas, rodillas, tobillos, talones y puntas, de los dos lados— con su índice de MediaPipe, el paso a px, las trayectorias como `Muestra2D` con calidad = visibilidad y la rodilla de perfil sin marcadores con la convención de la de los gomets), `cambiosLado.ts` (las dos piernas intercambiadas de un frame al siguiente), `comparar.ts` (sesgo, dispersión, error cuadrático medio con y sin sesgo, rangos y correlación; y el ángulo filtrado por frame con el mismo camino que el visor) e `informe.ts` (el texto para copiar, sin el nombre del archivo). Todo con tests de valor conocido.
- **En pantalla:** el esqueleto sobre el vídeo en cada frame (pierna derecha de la persona en ámbar, izquierda en gris; lo de visibilidad < 0,5, a trazos y tenue), y al acabar, de perfil, la flexión de la rodilla sin marcadores y la de los gomets (si la vista los tiene seguidos) superpuestas en una gráfica que lleva el vídeo al tocarla, y el informe con «Copiar el informe». No se guarda nada.
- **Comprobado en el Chromium de la nube** con la imagen de prueba de MediaPipe (`pose.jpg`, una persona en la playa) convertida en un vídeo de 2 s: persona detectada en los 60 frames, visibilidad ≥ 0,99, el esqueleto cae sobre la persona y cada lado en su pierna; *full* en GPU (emulada por software: 1,3 frames/s) y *lite* en CPU (8,8 frames/s). MediaPipe avisa en la consola «Using NORM_RECT without IMAGE_DIMENSIONS…» con imágenes no cuadradas; el esqueleto sale bien igualmente. En la CI solo se prueba que la tarjeta aparece con `?pose` y no sin él (el modelo de verdad necesitaría descargarse y una persona en el vídeo).

**Primera medida real (27-10-2026; Pixel 8, *full* en GPU; la sentadilla de perfil con gomets del usuario, 642×968, 20,1 s, 603 frames a 30 fps):**
- **Velocidad:** 31,5 frames/s, **más rápido que el propio vídeo** (0,95 × su duración), con 4,0 s de carga del modelo.
- **Detección:** persona en 455 de 603 frames (75 %); los 148 sin nadie son frames enteros (los 12 puntos a la vez). Falta saber dónde caen (¿al principio o al final, fuera de cuadro?).
- **Visibilidad:** la pierna de la cámara, 0,97–1,00; la lejana, rodilla 0,37 (solo un 8 % de frames utilizables) y tobillo 0,60: el modelo sabe que no la ve bien, y el umbral de 0,5 la deja fuera. Sin cambios de lado.
- **Frente a los gomets (455 frames en común):** correlación 1,00; diferencia media **+6,5°** (sin marcadores por encima) con DE 3,5° y ECM sin la diferencia media 3,5°; rango de flexión 95,6° con gomets y 97,7° sin marcadores (+2,1°). De pie, los gomets daban −7,8° (ya se sabía: no caen justo sobre los ejes articulares; en la fase 1 salió −4,7° en otro vídeo) y el modelo +0,6°: buena parte de la diferencia es ese desplazamiento de los gomets al extender, que el cero de referencia quita. **La forma de la curva y el recorrido coinciden**: el modelo sirve para la flexión de la rodilla de perfil en este vídeo.

**El mismo vídeo con *heavy* (GPU):** 17,1 frames/s (1,75 × la duración, casi el doble que *full*); la misma detección (455 frames: los 148 sin nadie no dependen del tamaño del modelo). Es **más prudente con la visibilidad**: la rodilla de la cámara baja a 0,84 de mediana y solo el 56 % de los frames pasa de 0,5, así que hay flexión en 340 frames en vez de 455. En esos 340, correlación 1,00, diferencia media +7,1°, DE y ECM sin la diferencia media 2,5° (frente a 3,5° con *full*), rango 97,3°. No se puede decir que sea más preciso: compara menos frames, y probablemente deja fuera justo los difíciles. **Decisión: *full* por defecto** (más rápido que el vídeo y con más frames útiles); *heavy* queda para elegirlo. El umbral de visibilidad (un solo `CALIDAD_MINIMA`, 0,5) se revisa en el paso 5 con más vídeos: la visibilidad no significa lo mismo en los dos tamaños.

**Y con *lite* (GPU):** apenas más rápido que *full* (34,9 frames/s) pero **detecta a la persona en solo 278 frames (46 %)**, y entre los que pierde están los de pie: la flexión más baja en común es de 11° (con *full*, −7,8° de los gomets). En los 278, ECM sin la diferencia media 6,1° (casi el doble que *full*), rango 84,4° frente a 76,8° de los gomets en esos frames, correlación 0,99. **Descartado:** no ahorra tiempo y pierde la mitad del vídeo. Que la detección cambie con el tamaño (46 % frente a 75 %) indica que los frames sin nadie no son solo de fuera de cuadro: el modelo decide si sigue viendo a la persona, y uno más pequeño la suelta antes.

**Dónde caen los frames sin persona (*full*):** los **148 primeros**, de pie y quieto hasta que empieza la primera sentadilla; desde ahí no la pierde, tampoco al volver a estar de pie. Son justo los del cero de referencia («Primeros 2 s»). **Arreglo: una segunda pasada hacia atrás** (`core/pose/recuperar.ts`, en el worker): cada tramo de frames sin persona seguido de uno con ella se recorre hacia atrás desde ese frame con un detector nuevo, que arranca sabiendo dónde está la persona y la sigue. El decodificador solo va hacia delante: se decodifican bloques de 20 frames (cada uno en su canvas) y se recorren del último al primero; el tiempo que recibe el modelo es lo transcurrido (en modo vídeo tiene que crecer). Solo se sustituyen frames sin nadie. El informe dice cuántos recupera y cuánto tarda («hacia atrás N s»), y el botón, «atrás N %» mientras tanto. Comprobado en la nube con la imagen de prueba con el primer segundo desenfocado (el detector no la encuentra ahí): con un desenfoque moderado recupera los 30 frames y el esqueleto cae sobre la persona; con uno muy fuerte no recupera ninguno (tampoco la ve siguiéndola) y no inventa nada.

**Con el vídeo del usuario (Pixel 8, *full*, GPU):** **persona en los 603 frames**, 148 recuperados hacia atrás en 9,2 s (la pasada hacia delante, 18,8 s). Frente a los gomets en los 603: correlación 1,00, diferencia media +7,5° (más que antes porque ahora entran los frames de pie, donde los gomets dan −7,8° y el modelo +0,6°), DE y ECM sin la diferencia media 3,5°, rango 97,7° frente a 95,6°. La rodilla lejana sigue fuera casi siempre (visibilidad 0,41), como debe. **Paso 1 cerrado:** *full* con la pasada hacia atrás.

**Paso 2 — el núcleo sin marcadores** (`core/pose/`, `core/articulaciones/definicion.ts` y `calculo.ts`). Propuesta aceptada por el usuario el 28-10 con las recomendaciones (signo de la pelvis y del tronco de frente, y los intercambios de perfil sin vuelta clara, dudosos). Todo con tests de valor conocido; la interfaz es del paso 3.

- **Qué se conservó del paso 1:** los 12 puntos y su paso a px (`puntos.ts`), la pasada hacia atrás y el worker (sin cambios), `compararSeries` y `anguloFiltradoPorFrame`, la detección de los cambios de lado y el informe (mientras exista `?pose`). La rodilla de perfil sin marcadores sale de `puntos.ts` y pasa al catálogo.
- **Ángulos absolutos:** `DefinicionArticulacion.proximal` puede ser una `Referencia` (`vertical` = +y, `horizontal` = +x del marco canónico) en lugar de un segmento; el cálculo mide el segmento distal respecto a ella, y el espejo de la vista lo sigue quitando el marco. `marcadoresDeArticulacion` y `segmentosDeArticulacion` sustituyen las cinco copias de «los cuatro marcadores de la articulación» (cálculo, derivadas, modelo de la vista, comparación, dibujo y segmentos del visor). **Pendiente del paso 3:** la validación del esquema solo acepta segmentos; con el esquema 5 tendrá que aceptar la referencia.
- **Catálogo (`pose/catalogo.ts`, fijado por `catalogo.test.ts`):** de perfil, de la pierna de la cámara, rodilla, cadera y tobillo con la convención de los gomets, y el **tronco** (cadera → hombro respecto a la vertical; hacia delante +). De frente, las dos piernas: el **FPPA** como el de los gomets, la **cadera respecto a la pelvis** (la línea de las caderas y el muslo, cero −90: abducción +; no es la `cadera_frontal_*` de los gomets, que va respecto al tronco), la **oblicuidad pélvica** (+ = cadera izquierda más alta) y el **tronco** (del punto medio de las caderas al de los hombros respecto a la vertical; + = hacia la izquierda de la persona). Los tests comprueban cada ángulo con la persona mirando a un lado y a otro, y con la cámara delante y detrás, y que donde hay equivalente de gomets (`equivalenteGomets`: cadera, rodilla y tobillo de perfil y el FPPA) da lo mismo con los mismos puntos. `modeloPose(orientación, lado)` da los marcadores virtuales con su nombre («Rodilla derecha (modelo)») y las articulaciones del plano; `fuenteDe` dice si una articulación sale de gomets o sin marcadores.
- **Puntos medios** (`pose_cadera_medio`, `pose_hombro_medio`): `conPuntosMedios` los calcula frame a frame de los dos lados (peor calidad de los dos; perdido si lo está uno; interpolado si lo es uno). No se guardan ni se editan: una corrección a mano de un lado llega siempre al punto medio. El visor los tendrá que excluir de lo que se marca (`esPuntoMedio`).
- **Piernas intercambiadas (`cambiosLado.ts`):** de frente, cada cadera tiene su lado de la imagen según la orientación (`asignarLadosFrontal`): un frame con las caderas al revés tiene los 12 puntos intercambiados, y se arregla también un modelo que etiquete como si la persona estuviera de frente cuando la cámara está detrás. De perfil (`corregirCambiosDeLado`), un cambio que se deshace en `VUELTA_MAX_S` (0,5 s) como mucho, sin perder a la persona entre medias, se deshace intercambiando los frames de en medio; si tarda más o no vuelve, las piernas de esos frames quedan **dudosas** (`CALIDAD_LADO_DUDOSO`, 0,4: por debajo de `CALIDAD_MINIMA`, con su posición) y lo marcado a mano no se toca. Devuelven copias y los tramos corregidos y dudosos, para que el visor los enseñe. Se aplica sobre la detección **antes** de juntarla con lo que había.
- **Fusión (`fusionarDeteccion`):** volver a detectar no sobrescribe lo marcado a mano; donde la detección no llegó (un recorrido cancelado) se queda lo de antes.
- **Comparación (`compararFuentes`):** la directa (sesgo, dispersión, ECM con y sin sesgo, rangos, correlación) y la **relativa al cero de cada fuente** en el mismo tramo (con `ceroDeReferencia`, el cálculo del cero del visor), que quita la diferencia constante entre los puntos de una y de otra: con el +7,5° de la sentadilla, la relativa compara forma y recorrido.

**Paso 3a — el visor sin marcadores: detectar, guardar y ver** (propuesta aceptada el 28-10 con las recomendaciones: el paso 3 partido en 3a y 3b, y el modelo *full* alojado en el sitio). Hoy cada vista mide una sola articulación (la primera de su modelo); sin marcadores, de perfil hay cuatro: elegir cuál y comparar las fuentes es el 3b.

- **Con gomets o sin marcadores al abrir** (`ElegirOrientacion`, primer vídeo): solo decide por dónde se empieza. El modelo de la sesión lleva siempre lo sin marcadores de perfil (`conPose`, fijado al abrir como `conRodillaFrontal`); cada vista sigue lo suyo (`marcadoresParaVista` con la fuente). Al detectar en una vista con gomets se le añaden los 12 puntos (`usarPose` en `Visor.tsx`) y siguen mandando los gomets (su articulación va primero, D5).
- **«Detectar el cuerpo»** (`useDeteccionPose`, `BotonDetectar`): en «Marcar», con el modelo (*full*, el de por defecto, o *heavy*), y en la tira del vídeo grande (en el móvil en vertical, «Marcar» es el vídeo grande): sin gomets en el sitio de «Seguir», en ámbar; con ellos, debajo. El worker del paso 1 se crea al pedirlo y se cierra al acabar o al parar; progreso «cargando…», «N %» y «atrás N %». Lo detectado aparece mientras recorre el vídeo; al acabar, `corregirLados` y `fusionar` (lo marcado a mano no se toca), y un aviso con los frames con persona, los corregidos y los dudosos. Seguir y detectar no van a la vez (D8).
- **El tiempo de cada frame** es el de la tabla del visor por su índice, no el que manda el worker: lo descubrieron las e2e (con otro `t`, el ángulo, que empareja las trayectorias por instante, salía vacío).
- **Corregir a mano:** los puntos de la articulación se eligen en el selector y se colocan siempre a ojo; los puntos del modelo no se siguen (seguir, sus anclas y «quitar lo seguido después» solo tocan los gomets). Los demás puntos (la pierna lejana) solo se dibujan y no cuentan en la franja.
- **Esqueleto** sobre el vídeo (`dibujarEsqueleto`, ahora con las trayectorias de la vista): pierna derecha en ámbar, izquierda en gris, lo dudoso tenue y a trazos, lo interpolado en azul.
- **Esquema 5:** `deteccion` por vista (modelo, librería y versión, GPU o CPU, fecha, frames con persona, corregidos y dudosos; null si no se ha detectado) y la `Referencia` de los ángulos absolutos en la validación del modelo; migración 4 → 5 con su test.
- **Modelo alojado:** `public/modelos/pose_landmarker_full_float16_1.task` (9 MB, con la versión en el nombre y caché de un año); *heavy* y *lite* siguen viniendo de Google.
- **La navegación se pausa mientras se sigue o se detecta** (a raíz de la primera prueba en el móvil: mover el deslizador mientras trabajaba el worker hacía que la franja se rellenara mal; el visor y el worker compiten por el decodificador por hardware). Deslizador y botones de paso deshabilitados, teclado, gráfica y «ir a…» sin efecto, en todas las vistas; al acabar o parar, vuelve. e2e para el seguimiento (worker frenado) y para la detección (worker falso lento).
- **Retirado el experimento `?pose`** (`ExperimentoPose.tsx`); `informe.ts` queda para el 3b.
- **Comprobado en el Chromium de la nube** con la foto de prueba de MediaPipe hecha vídeo (2 s): el modelo se descarga del propio sitio, persona en los 60 frames, el esqueleto cae sobre la persona y cada lado en su pierna (35 s en GPU emulada por software). **e2e:** el worker se sustituye por uno falso que manda la verdad del vídeo sintético como si fuera una persona (pierna de la cámara en los gomets, la lejana 40 px detrás con visibilidad 0,3; cinco frames con las piernas intercambiadas y cinco sin nadie): la flexión sin marcadores coincide con la verdad (también en los intercambiados, que sin corregir no tendrían ángulo), una corrección a mano sobrevive a volver a detectar, se guarda y se recupera; con gomets, detectar no cambia lo que se marca ni lo que se mide y seguir sigue funcionando; en el móvil, el botón está en el vídeo grande.

**Paso 3b — varias articulaciones, comparación con los gomets y CSV** (lo propuesto al partir el paso 3).

- **La articulación que se mira** (`useVista`: `articulaciones`, las del plano de la vista; `elegirArticulacion`): en «Análisis», `SelectorArticulacion` con una fila por articulación (rodilla, cadera, tobillo, tronco) y, si la elegida está con gomets y sin marcadores, la fuente (por defecto los gomets, D5). Todo sigue a la elegida: gráfica, valores, cero (ya iba por id), segmentos, escala y los puntos que se pueden corregir. Se guarda en la vista (`articulacion`, opcional: no sube el esquema; una app anterior solo pierde lo elegido).
- **Gomets frente a sin marcadores** (`ComparacionFuentes`; `parejaDeFuente` y `compararFuentes` del núcleo): las dos curvas filtradas superpuestas y lo que se apartan, a pelo y relativas al cero de cada una (con el tramo del cero de la que se mira, o el de la otra; sin cero lo dice). «Copiar el informe» (`informe.ts`, reescrito: detección, visibilidad de la pierna de la cámara y las dos comparaciones) es lo que necesito en el paso 5.
- **CSV:** todas las articulaciones del plano de la vista, la que se mira primero (las demás con `anguloExportadoDe`, por el mismo camino que el visor: una sola serie por articulación), cada una con su fuente y su cero en la cabecera y la detección en «# sin marcadores». Con una sola articulación nada cambia (ni el nombre del archivo).
- **Glosario:** «Gomets frente a sin marcadores», «Inclinación del tronco» y «Piernas intercambiadas», cada una con su icono.
- **e2e:** con el worker falso, cadera, tobillo y tronco dan lo que deben con los puntos de la verdad, los puntos que se marcan siguen a la articulación, el CSV lleva las cuatro, y la elegida se guarda y se recupera; en una vista con gomets, la comparación (diferencia casi nula, correlación 1, relativa al cero con «Primeros 2 s») y la fuente.

**Primera medida con el visor (28-10-2026; Pixel 8, *full*, GPU; la misma sentadilla de perfil con gomets, 642×968, 20,1 s, 603 frames), del informe de «Gomets frente a sin marcadores» de la rodilla:**
- **Detección:** persona en los 603 frames, ninguna pierna corregida ni dudosa; visibilidad mediana de la pierna de la cámara de 0,90 (talón) a 1,00 (hombro y cadera), todos los puntos ≥ 0,5 en el 100 % de los frames.
- **A pelo:** diferencia media +7,5° (sin marcadores por encima), DE 3,5°, correlación 1,00; recorrido 95,6° con gomets y 97,2° sin marcadores. Lo mismo que en el paso 1.
- **Relativo al cero, en un valle entre repeticiones (7,75–8,15 s):** diferencia media −1,8°, DE 3,5°; **flexión máxima respecto a estar de pie 94,8° con gomets y 95,2° sin marcadores (0,4° de diferencia)**, mínimo −0,8° y −2,0°. El recorrido coincide; frame a frame quedan unos ±3,5°, sobre todo en la zona intermedia de la bajada y la subida (no en los extremos): puede ser el gomet que se desplaza sobre la piel al flexionar, el centro articular que estima el modelo, o las dos cosas.
- **El cero importa:** con «Primeros 2 s» la relativa daba −3,8°. Al empezar la persona estaba algo más flexionada que entre repeticiones (las dos fuentes lo ven), y en ese tramo, recuperado por la pasada hacia atrás, las curvas se separan algo más (unos 11° frente a unos 8°). El cero va en un tramo quieto y representativo; el aviso de «no parece quieto» ayuda (un tramo de 8 a 12 s, con una repetición dentro, dio ±37,6°).
- **Pendiente para el paso 5:** más vídeos (otra persona, ropa ancha, un gesto rápido) y la vista de frente. Una forma más directa de marcar un tramo corto del cero: hecho después del paso 4, «Aquí ± 0,2 s» (0,4 s centrados en el frame que se ve, `tramoAlrededor`).

**Paso 4 — la vista de frente sin marcadores.**

- **Fuente de la segunda vista:** al añadirla también se elige con gomets o sin marcadores (`ElegirOrientacion` pide la fuente siempre; antes la segunda iba con gomets).
- **Qué mide** una vista de frente sin marcadores (`articulacionesPoseFrontales`, ya en el núcleo desde el paso 2): el FPPA de las dos rodillas (primero la pierna de la referencia), la cadera de cada lado respecto a la pelvis, la oblicuidad pélvica y la inclinación lateral del tronco. `conPose` las añade al modelo de la sesión con los puntos medios (una sesión guardada en el paso 3 las gana al abrirla, sin cambiar lo que tenía).
- **Puntos medios** (el tronco va del medio de las caderas al de los hombros): la vista los sigue (`marcadoresSinMarcadores`), pero el almacén los rehace de los dos lados con cada cambio y al abrir (`recalcularMedios`): una corrección a mano de una cadera llega al medio. No se marcan (con el tronco se corrigen las caderas y los hombros de los dos lados: `puntosDe`) ni se guardan (van vacíos).
- **Lados:** al detectar de frente cada cadera va a su lado de la imagen (`asignarLadosFrontal`), desde un 2 % del alto de separación (de perfil sigue el 5 % del salto).
- «Detectar el cuerpo» ya no es solo de perfil. Con gomets de frente (FPPA) y detección, la comparación del paso 3b vale igual (`rodilla_frontal` tiene su equivalente).
- **Glosario:** «Pelvis y cadera de frente» y la inclinación lateral del tronco en «Inclinación del tronco».
- **e2e:** perfil con gomets y la segunda vista de frente sin marcadores, con un worker falso: la pierna derecha en los gomets del vídeo «frontal», la izquierda en espejo con la cadera 10 px más alta, los hombros ladeados y tres frames con los lados al revés. Las seis medidas coinciden con lo que deben dar (también en los frames corregidos) y la rodilla derecha con el FPPA de la verdad del vídeo.
- **Falta validar con un vídeo real de frente** (paso 5): sobre todo el FPPA, sensible a pocos píxeles, y lo que hace el modelo con la cámara detrás de la persona.

## Riesgos

- **La precisión sin marcadores** puede no bastar para algún ángulo (el tobillo, con pocos píxeles en el pie; el FPPA, sensible a pocos píxeles). Se sabe en el paso 1.
- **Ropa ancha, mala luz, otra persona en la imagen** o una pierna tapando a la otra empeoran el modelo. Se dice en la guía y la app avisa con la visibilidad.
- **Tiempo de proceso en el móvil:** el tamaño *heavy* puede tardar varias veces lo que dura el vídeo. Para análisis diferido es aceptable si se puede cancelar y no bloquea la app.
- **GPU en el worker:** si no funciona en Chrome para Android, va en CPU (más lento). Paso 1.
- **El seguimiento de gomets en el mismo vídeo** sigue igual: el modelo no lo toca.

---

## Fase 6 (anticipo, se planificará al cerrar la 5): 3D con dos móviles sin objeto de calibración

Lo hablado con el usuario el 27-10, para no perderlo:

- **Colocación:** un móvil en cada flanco anterolateral (a ±45° del frente, unos 90° entre ellos), a unos 3 m, el cuerpo entero en las dos imágenes; así ninguna pierna queda tapada para una cámara y se ven las dos. Perfil + frente sigue valiendo, pero en 3D solo sale bien la pierna que mira a la cámara de perfil.
- **Calibración con la persona:** los puntos del cuerpo (y los gomets, si los hay) vistos a la vez por las dos cámaras dan la posición de una respecto a la otra; la lente, del ángulo de visión conocido de cada modelo de móvil (o estimada a la vez); la **vertical, del acelerómetro de cada móvil**, guardado en el MP4 durante la grabación; la **escala, de la altura de la persona**. Unos 10 s al empezar con unos pasos por la zona para que el cálculo sea estable. Después de grabar, la app da el ángulo, la distancia y la altura de cada cámara.
- **Asistente de colocación en la sala, antes de grabar:** la inclinación de cada móvil (acelerómetro, ~1°); el ángulo entre los dos por la brújula (aproximado en interiores); la **distancia entre los dos por el pitido** de ida y vuelta (ya existe; se haría también antes de grabar); si la persona sale entera y a qué distancia está, con el detector sobre la vista previa; con eso, el ángulo entre las cámaras visto desde la persona (cos θ = (d₁² + d₂² − D²) / 2·d₁·d₂) como segunda medida.
- **Altura de cada móvil sobre el suelo** (para apoyarlos en lo que haya a mano en lugar de un trípode): antes de grabar, con la inclinación del acelerómetro y la lente se sabe dónde está el **horizonte** en la imagen; la parte del cuerpo de la persona (de pie, erguida) que cae en esa línea está a la altura de la cámara, y con la altura de la persona se pasa a metros (p. ej. el horizonte en la cadera → ~0,9 m). Después de grabar, la calibración lo da con precisión: el suelo sale de los pies apoyados y la vertical, del acelerómetro. **No hace falta que los dos estén a la misma altura**, solo en un rango razonable (de rodilla a cadera) y quietos.
- **Un móvil que se mueve durante la toma** (apoyado en algo que resbala): el acelerómetro grabado lo detecta y la app avisa de que esa toma no sirve para 3D.
- **Comprobación cruzada:** la distancia entre las cámaras de la calibración frente a la del pitido; si no coinciden, aviso.
- **Planos en 3D sin marcadores** (con puntos que son centros articulares): sagital bien; frontal útil (valgo de las dos rodillas, cadera, pelvis, tronco); transversal solo pelvis, tronco y ángulo de progresión del pie; **la rotación de cadera y de rodilla, no** (un segmento de dos puntos no dice cuánto gira sobre sí mismo): llega con el esqueleto de la fase 7.
- Lo pensado para el plan anterior que se reutiliza: interpolar la vista B a los instantes de la referencia sin cruzar huecos, triangular con el error de reproyección por punto, filtrar en 3D por tramos, la flexión 3D y las proyecciones en los planos de la persona.
- Material: dos móviles a 30 fps y dos apoyos fijos. Nada más.

## Qué necesito del usuario

1. **Aceptar o cambiar D1–D8.**
2. Para el paso 1: dos o tres vídeos con sesión de gomets ya guardada en el móvil (de perfil y, si hay, de frente).
3. Para la fase 6, más adelante: el modelo del segundo móvil (tiene que grabar a 30 fps).
