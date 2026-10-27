# Fase 5: sin marcadores en 2D (con gomets opcionales)

Estado: **plan propuesto** (2026-10-27), pendiente de aceptar. No se escribe código hasta entonces.

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
| 3 | **Visor:** «Detectar el cuerpo» de verdad (worker, progreso, cancelar), esqueleto, elegir con gomets o sin marcadores al abrir, fuente por articulación, comparación, CSV, glosario, esquema 5. e2e | Opus (maquetación fina en un PR de Sonnet si hace falta) |
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

## Resumen de decisiones (propuestas)

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
