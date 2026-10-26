# Fase 5: 3D

Estado: **plan propuesto** (2026-10-26), pendiente de que el usuario acepte o cambie las decisiones D1–D11. No se escribe código hasta entonces.

Objetivo de la fase (de `CLAUDE.md`): calibración DLT con un objeto de puntos conocidos, reconstrucción 3D y ángulos articulares reales. Parte de lo que dejaron las fases anteriores:
- **la limitación 1 de la fase 2:** en las sentadillas reales los segmentos se acortan hasta un 13 % en el fondo (la rodilla sale hacia la cámara) y la flexión real es del orden de 10° mayor que la medida en 2D;
- **la de la fase 3:** el FPPA es una proyección, y con la cámara en diagonal o la persona girada una flexión se ve como valgo;
- **lo que ya da la fase 4:** dos vídeos grabados a la vez y sincronizados con el pitido (0,1 ms entre los sonidos de una palmada en la séptima prueba) y el retraso de cada cámara calibrado (Pixel 8: 73 ± 6 ms). Esa sincronía es la que hace posible el 3D con dos móviles.

Caso de uso que guía las decisiones, el mismo que en la fase 4: **el usuario está solo**, con dos móviles en trípode, un metro, cinta de carrocero y lo que haya en casa (un palo de escoba, un goniómetro). Nada que comprar salvo, como mucho, unas bolitas de porexpán.

Criterio de cierre (propuesto; las cifras se revisan con las primeras medidas, paso 6):
- calibrar el espacio con los dos móviles en unos 10 minutos, con un objeto hecho en casa, y ver en la app el error de la calibración en mm;
- grabar una sentadilla con los dos móviles **sin tocar los trípodes** y obtener, sin más pasos que los de hoy (marcar, seguir en cada vista, sincronizar), la flexión de rodilla en 3D, la proyección en los planos sagital y frontal de la persona y la longitud de los segmentos en 3D;
- validación con lo que hay en casa: puntos de la calibración que no se usaron (error ≤ 5 mm), una varita de longitud conocida movida por todo el volumen (error medio ≤ 3 mm, dispersión ≤ 5 mm) y un goniómetro inclinado hacia la cámara (3D a ≤ 3° del ángulo puesto donde el 2D se equivoca más de 10°);
- en la sentadilla, la longitud 3D de muslo y pierna varía ≤ 3 % (en 2D, hasta un 13 %).

Lo que **no** entra: corrección de lente y calibración de intrínsecos con tablero (fase 6), modo sin marcadores (fase 6), más de dos cámaras, ángulos en tres ejes con rotación (ver D7), una vista 3D girable, protocolos tipo BTS (idea apuntada, sin fase).

---

## 1. Dónde van las cámaras y qué marcadores ven las dos [D1, D2]

El punto de partida que obliga a decidir: **para reconstruir un marcador en 3D tienen que verlo las dos cámaras a la vez.** Hoy la vista de perfil sigue trocánter, epicóndilo y maléolo laterales, y la de frente, muslo proximal, centro de la rodilla y centro del tobillo: **no comparten ninguno.** Un gomet plano en la cara lateral, visto desde delante, queda de canto (no se reconoce), y uno sobre la rótula, visto de perfil, igual.

| Alternativa | A favor | En contra |
|---|---|---|
| a. Perfil y frente (90°), como en la fase 4 | La mejor geometría para triangular (el error en profundidad es mínimo a 90°) | Ningún gomet plano lo ven bien las dos; habría que poner marcadores esféricos en sitios raros o duplicar marcadores |
| **b. Perfil y anterolateral** (la segunda cámara a 45–60° de la de perfil, hacia delante, del mismo lado) | Las dos ven los tres gomets laterales de siempre; la de perfil sigue dando el 2D de hoy, así que **se puede comparar 2D y 3D en la misma toma** (útil para validar y para docencia) | Peor geometría que a 90°: a 45° el error en profundidad es ~1,4 veces el de 90°, a 60° ~1,15; un gomet plano visto a 60° se ve con la mitad de ancho |
| c. Las dos oblicuas (anterolateral y posterolateral, 90° entre ellas) | Buena geometría y las dos ven la cara lateral a 45° | Se pierde la vista de perfil puro (el 2D de hoy) y la comparación |

**Recomendación: (b)**, con 45° entre las cámaras para gomets planos y hasta 60° con marcadores esféricos (D2). El paso 6 mide las dos separaciones y la recomendación final va a `docs/grabacion.md`. La vista de perfil sigue siendo la referencia (desfase 0) y la pierna analizada, la que ve ella (regla de `CLAUDE.md`).

**Marcadores [D2].** Mínimo para esta fase, en la cara lateral de la pierna que ve la cámara de perfil: **trocánter mayor, epicóndilo femoral lateral y maléolo lateral** (los de la fase 1). Opcionales con lo mismo: calcáneo y 5.º metatarsiano (tobillo) y acromion (cadera), si las dos cámaras los ven. Gomets planos verdes o azules valen a 45°; para 60° se proponen **bolitas** (porexpán de 2–2,5 cm pintadas, o medias bolas pegadas), que se ven redondas desde cualquier lado. El seguidor ya acepta manchas de forma algo alargada; si con 60° pierde gomets planos, se ajusta en el paso 6 con vídeos reales, no antes.

**Vista oblicua en el modelo.** `OrientacionVista` gana una tercera forma, `{ plano: 'oblicuo', lado: 'anterior' | 'posterior' }` (anterolateral o posterolateral, del lado que ve el perfil). Una vista oblicua **no da ángulos 2D** (no hay un plano anatómico al que proyectar): solo sigue marcadores para el 3D. En una sesión 3D, la vista oblicua sigue los mismos marcadores que la de perfil (`marcadoresParaVista`). La vista de frente de la fase 3 sigue igual para el FPPA 2D.

## 2. Objeto de calibración [D3]

El DLT necesita al menos 6 puntos **no coplanares** de coordenadas conocidas, vistos por cada cámara; con 15–30 bien repartidos por el volumen donde se mueve la pierna el resultado es mucho más estable, y **fuera de ese volumen el DLT extrapola mal**. La calibración vale mientras ninguna cámara se mueva ni cambie de zoom, resolución o enfoque.

| Alternativa | A favor | En contra |
|---|---|---|
| **a. Varilla vertical en posiciones conocidas del suelo** (un palo de escoba o un listón con 4 gomets a alturas medidas, que se coloca de pie en 6 marcas del suelo, una tras otra, con los dos móviles grabando) | Cubre el volumen de la pierna (≈ 80 × 60 × 100 cm) con un solo objeto barato; 4 × 6 = 24 puntos; las marcas del suelo se miden con cinta (o son las juntas de las baldosas) | Hay que ponerla vertical: 1° de inclinación son 17 mm en lo alto de un metro. Con el nivel de burbuja (o la app de nivel de un móvil) apoyado en la varilla, 0,3–0,5° → 5–9 mm arriba. Es el error que más pesa, y la validación lo medirá |
| b. Caja o taburete con gomets en las esquinas | Rígida, esquinas medidas al milímetro, sin nivel | Pequeña frente a la pierna (se extrapola por arriba); el cartón se deforma; 7 esquinas visibles como mucho |
| c. Pared y suelo (gomets en la pared y en el suelo, medidos desde la esquina) | La pared es vertical sin nivel | Limita dónde se pone todo en la habitación; la pierna queda en el borde del volumen |
| d. Varita y escuadra (calibración dinámica, lo de los laboratorios: una «L» en el suelo y una varita con dos marcadores agitada por el volumen) | Muy precisa, sin medir puntos | Necesita los intrínsecos de cada cámara y un ajuste no lineal de todo (*bundle adjustment*): mucho más trabajo; se valora en la fase 6 junto con la lente |

**Recomendación: (a)**, con dos detalles:
- **Las marcas del suelo son gomets**, que se quedan puestos: son puntos de la calibración (altura 0) y, en cada toma posterior, **testigos** de que las cámaras no se han movido (D9).
- **Plantilla en la app:** se escribe el paso de la rejilla (p. ej. 3 × 2 posiciones a 40 y 30 cm, o el tamaño de la baldosa) y las alturas de los gomets de la varilla, y la app genera las coordenadas. Una rejilla que no sea rectangular se escribe punto a punto.

**Sistema de coordenadas del laboratorio:** origen en la marca del suelo elegida como primera, **X hacia donde mira la persona**, **Z hacia arriba** (la varilla), **Y hacia la izquierda de la persona** (sistema a derechas: es el mismo sentido que el `x` canónico de la vista de frente). La persona se coloca mirando a lo largo de X (una línea de cinta en el suelo). Así los planos del laboratorio son los anatómicos de una persona bien colocada (D7).

## 3. Calibración DLT [D4]

| Alternativa | A favor | En contra |
|---|---|---|
| **a. DLT de 11 parámetros por cámara** (Abdel-Aziz y Karara) | Lineal, sin conocer nada de la cámara; se resuelve con mínimos cuadrados; es lo que nombra el plan de fases | No modela la distorsión de la lente (fase 6); sensible a extrapolar fuera del objeto |
| b. Intrínsecos por móvil (tablero, una vez) + posición de cada cámara con PnP | Menos puntos en cada sesión; modela la lente | Necesita un tablero impreso grande o el procedimiento de Zhang y, en la práctica, OpenCV: es la fase 6 |

**Recomendación: (a), en TypeScript puro en el núcleo** (`core/tresd/dlt.ts`), sin OpenCV: son 2N ecuaciones lineales con 11 incógnitas (12 con la escala, resuelto por la descomposición en valores singulares de una matriz 12 × 12) y la **normalización de Hartley** (centrar y escalar puntos de imagen y de objeto antes de resolver; sin ella el sistema queda mal condicionado con píxeles de 0 a 1920 y metros de 0 a 1). Decisión D5 de la fase 1 revisada: OpenCV no hace falta para el DLT; se valora en la fase 6.

La calibración da, por cámara: los 11 parámetros, el **error de reproyección** de cada punto (px) y su media, y para el conjunto, el **error de dejar uno fuera** (*leave-one-out*: calibrar sin un punto, reconstruirlo con las dos cámaras y medir en mm lo que se aparta): es la cifra que se muestra («Error de la calibración: N mm»), porque es lo que se equivocaría con un punto nuevo. Un punto con un error muy por encima de los demás se señala (un gomet mal tocado o mal medido) y se puede quitar.

**Cómo se marcan los puntos:** la calibración es un vídeo doble grabado con la varilla en cada posición (unos segundos en cada una). En cada vista, se va a un frame con la varilla en la posición k y se toca cerca de ella: la app busca en esa franja vertical las manchas del color de los gomets (el detector de manchas del seguimiento) y las asigna por altura; si no encuentra las esperadas, se tocan una a una con la lupa, como en la escala. Las marcas del suelo se tocan una vez. Como el objeto está quieto, **no hace falta sincronía para calibrar**: cada vista elige sus frames.

## 4. Reconstrucción [D5, D6]

**Triangulación [D5]:** por cada instante, las dos posiciones en imagen y los dos DLT dan 4 ecuaciones lineales con 3 incógnitas (X, Y, Z), por mínimos cuadrados. Con cada punto, su **error de reproyección** en cada vista (px): si pasa de un umbral (propuesta: 3 veces el de la calibración, mínimo 3 px), ese punto se marca como dudoso y no se usa, igual que la calidad en 2D. Un marcador sin posición utilizable en **cualquiera** de las dos vistas no tiene posición 3D (NaN, nunca inventada).

**Los frames de las dos cámaras no caen en el mismo instante [D6].** Los móviles no están sincronizados por hardware: entre el frame de A y el de B hay hasta medio frame (17 ms a 30 fps), y a 0,5 m/s eso son 8 mm. Se propone:
- la **rejilla temporal es la de la vista de referencia** (los tiempos de sus frames, ya en el tiempo común);
- las posiciones de B se **interpolan a esos instantes** con un spline cúbico por tramos sobre sus muestras utilizables, en el tiempo común (con el desfase aplicado), **sin extrapolar y sin cruzar un hueco ni un salto en el tiempo** (las mismas reglas que el filtro: `SALTO_MAX_PASOS`); lo que cae fuera de un tramo de B queda sin posición 3D;
- se triangula sin filtrar y **después se filtran las coordenadas 3D** con el Butterworth de la sesión, por tramos (como en 2D: nunca a través de un hueco); ángulos, velocidades y aceleraciones salen de lo filtrado. Es el orden habitual en análisis de movimiento: el error de reproyección se calcula sobre lo medido, no sobre lo suavizado.

Lo interpolado a petición en una vista (huecos cortos) hace interpolado el punto 3D, y se ve igual que hoy (azul, a trazos).

**Presupuesto de error de la sincronía:** con el pitido y las cámaras calibradas, lo que queda es la cota del retraso de la cámara (Pixel ±6 ms) y el obturador de los móviles, que lee la imagen fila a fila (*rolling shutter*: arriba y abajo de la imagen se capturan con unos 10–30 ms de diferencia). A la velocidad de una sentadilla (≤ 0,5 m/s) son ≤ 3–8 mm; en la marcha, con el pie a 3 m/s, serían centímetros: la marcha queda fuera de lo que se valida aquí y se dice.

## 5. Qué ángulos articulares reales [D7]

| Alternativa | A favor | En contra |
|---|---|---|
| **a. Con los 3 marcadores laterales: flexión 3D y proyecciones en los planos de la persona** | Solo los marcadores de siempre, que ven las dos cámaras; resuelve justo lo que falla en 2D (la rodilla sale del plano de la cámara) | No da rotaciones; los planos son los del laboratorio (la persona tiene que estar colocada a lo largo de X) |
| b. Ángulos de la rodilla en tres ejes (Grood y Suntay) con un sistema de cada segmento | Lo que da un laboratorio (flexión, varo-valgo, rotación) | Necesita 3 marcadores por segmento (una varita en el muslo y otra en la pierna, como el modelo convencional de la marcha) y medidas de la persona (anchura de la rodilla y del tobillo); la rotación, incluso en un laboratorio, tiene un error del orden de lo que se mide por el movimiento de la piel |

**Recomendación: (a) en esta fase**, y (b) como propuesta para después si la validación lo permite (cabe en «Protocolos tipo BTS» de las ideas apuntadas). En concreto, para la rodilla:
1. **Flexión de rodilla 3D:** el ángulo real entre muslo (trocánter → epicóndilo) y pierna (epicóndilo → maléolo) en el espacio, con el signo de su proyección en el plano sagital (para distinguir la hiperextensión). No depende de dónde esté la cámara: es lo que en 2D salía hasta 10° corto.
2. **Rodilla en el plano sagital de la persona** (normal = eje Y del laboratorio) y **en el plano frontal** (normal = eje X): el mismo cálculo de hoy (`anguloArticular(def, puntos, normal)` ya acepta puntos 3D y la normal, como previó la fase 1), con las convenciones del catálogo. La frontal con marcadores laterales **no es el FPPA** (otros puntos anatómicos): se llama «Rodilla en el plano frontal (3D)» y su entrada del glosario lo explica.
3. **Longitud de los segmentos en 3D** (en m) y su variación: la prueba de que la reconstrucción es buena (en un sólido rígido, constante; lo que varíe es error o piel).
4. Con los marcadores opcionales, lo mismo para cadera (acromion) y tobillo (calcáneo y 5.º metatarsiano).
5. **Trayectorias, velocidades y aceleraciones en 3D** en m, m/s y m/s² sin la condición de «en el plano»: la escala 2D deja de hacer falta en una sesión 3D.

Las convenciones de signo y cero de los ángulos 3D quedan **fijadas por tests nuevos** junto a `catalogo.test.ts`: un movimiento que ocurre en el plano sagital del laboratorio da en 3D lo mismo que en 2D, la rodilla extendida es 0°, y girar juntos puntos y planos no cambia el valor.

## 6. Interfaz [D8]

- **«Calibrar el espacio 3D»** en la portada y en la pestaña «Vídeo» de una sesión de dos vistas: abre los dos vídeos de la calibración, la plantilla de la varilla, el marcado de cada posición en cada vista, el error («N mm», por punto y en total, con los que destacan) y «Guardar».
- En una sesión con perfil y oblicua y una calibración aplicada: una sección **«3D»** en «Análisis» con los ángulos de §5, la variación de los segmentos en 3D frente a la de 2D, y el **error de reproyección por frame** (en la franja, como hoy la calidad). En la gráfica, las series 3D se suman a las que hay (se eligen igual que las demás); la **comparación 2D / 3D** de la flexión, superpuestas, en el mismo panel que hoy compara vistas.
- **Sin vista 3D girable en esta fase** (pesaría una librería 3D y no da una medida más): una figura pequeña con la pierna proyectada en los planos sagital, frontal y transversal del laboratorio en el instante del cursor, dibujada en un canvas. Se propone una girable después si se echa en falta.
- **CSV:** X, Y, Z de cada marcador (m, sistema del laboratorio), el error de reproyección de cada frame y los ángulos 3D; en la cabecera, la calibración (puntos, error, fecha) y el sistema de coordenadas.
- Glosario: DLT, calibración del espacio, error de reproyección, error de dejar uno fuera, sistema del laboratorio, flexión 3D, plano frontal 3D frente a FPPA, testigos. Cada uno con su icono ⓘ.

## 7. Grabar para el 3D y reutilizar la calibración [D9]

- **Sala:** `vistasCompatibles` admite perfil + oblicua (hoy pide planos distintos, perfil y frente o espaldas). La de perfil sigue siendo la referencia. Nada cambia en el protocolo salvo el valor nuevo de la vista (lectura campo a campo: un móvil con la versión anterior lo ve como «sin vista» y lo dice).
- **Enfoque y zoom fijos:** el DLT supone que la cámara no cambia; el enfoque continuo cambia un poco la distancia focal. El Pixel 8 deja bloquear el enfoque desde Chrome (laboratorio de la fase 4). Propuesta: en la sala, con las vistas para 3D, **bloquear el enfoque** tras encuadrar (y la exposición, opcional) y mantenerlo en todas las tomas; si el segundo móvil no lo permite, se dice.
- **Una calibración para varias tomas:** se graba la calibración y después las tomas sin tocar los trípodes. La calibración se guarda aparte en IndexedDB y, al abrir una pareja de la misma sala (el MP4 lleva un id de sala nuevo, opcional, en `doble`), la app propone la última calibración hecha con esa sala y esa resolución. Siempre se puede elegir otra.
- **Testigos:** los gomets del suelo se ven en cada toma. Al aplicar una calibración, la app los busca cerca de donde estaban en el vídeo de la calibración; si alguno se ha movido más de 2 px en una vista, **avisa de que esa cámara se ha movido** y de que hay que recalibrar (no lo corrige).

## 8. Persistencia y esquema [D10]

- `Vista` gana `dlt` (opcional): los 11 parámetros, el ancho, alto y rotación con que se calibró (una vista con otros no la acepta), el error de reproyección y la huella del vídeo de calibración.
- `Sesion` gana `espacio3d` (opcional): los puntos del objeto, el sistema de coordenadas, el error de dejar uno fuera y la fecha. Lo reconstruido no se guarda: se recalcula, como hoy el ángulo.
- **Esquema 5** con migración 4 → 5 (vacíos) y su test: aunque los campos sean opcionales, una versión anterior de la app al guardar los perdería, y la regla de `CLAUDE.md` es que un registro de una versión más nueva no se abre ni se reescribe.
- Almacén nuevo `calibraciones` en la misma base (subida de versión de IndexedDB con su `onupgradeneeded`).

## 9. Pruebas y validación [D11]

**Núcleo (Vitest), con casos de valor conocido:**
- DLT: dos cámaras virtuales conocidas (posición, orientación, focal) proyectan puntos 3D; la calibración recupera la proyección (reproyección < 0,01 px sin ruido) y reconstruye puntos nuevos a < 0,01 mm; con ruido de 0,5 px, el error crece como predice la geometría (comparar 45°, 60° y 90° entre cámaras); 5 puntos o todos coplanares → error explícito; normalización de Hartley (sin ella el mismo caso falla a escala de píxeles reales).
- Triangulación, error de reproyección, dejar uno fuera.
- Interpolación de B a los tiempos de A: no cruza huecos ni saltos, no extrapola, con 30 y 25 fps.
- Ángulos 3D: movimiento en el plano sagital del laboratorio = 2D; extensión 0°; hiperextensión negativa; rodilla que sale del plano: el 3D da el valor real y la proyección el menor; invariancia a girar todo.

**e2e:** un generador nuevo de escenas sintéticas: puntos 3D de verdad conocida (la varilla en sus posiciones y una pierna en sentadilla) proyectados con dos cámaras virtuales a dos vídeos (con ffmpeg, como los de hoy), con fps distintos y un desfase. La e2e calibra en la app, sigue en las dos vistas, sincroniza y compara la flexión 3D y la longitud de los segmentos con la verdad.

**Validación con los medios del usuario (paso 6), con el Pixel 8 y el segundo móvil:**
1. **Puntos que no se usan:** de los 24 de la varilla, calibrar con la mitad y reconstruir la otra mitad, frente a lo medido con cinta. Objetivo ≤ 5 mm.
2. **Varita de longitud conocida:** un listón con dos gomets a una distancia medida (p. ej. 50 cm, con pie de rey o cinta), movido despacio por todo el volumen y en todas las orientaciones (también hacia las cámaras). La distancia 3D debe ser constante e igual a la medida: media ≤ 3 mm de la real, dispersión ≤ 5 mm. Es la prueba más barata y más dura (prueba todo el volumen, y el movimiento prueba también la sincronía).
3. **Goniómetro:** el goniómetro del usuario con un gomet en cada extremo y otro en el eje, fijado (cinta) a 30, 60, 90, 120 y 150°, en tres orientaciones: en el plano de la cámara de perfil, inclinado 30° y 60° hacia ella. El 3D debe dar el ángulo puesto (≤ 3°) en las tres; el 2D de perfil se irá apartando con la inclinación. Es la demostración clínica de por qué el 3D.
4. **Sentadilla real** con los 3 gomets: variación de la longitud del muslo y la pierna en 3D (objetivo ≤ 3 %) frente a la de 2D, y la flexión 3D frente a la 2D en el fondo (la fase 2 estimó unos 10° de diferencia).
5. Repetir 1–3 con 45° y 60° entre las cámaras, y con gomets planos y bolitas, para dejar en `docs/grabacion.md` la recomendación con datos.

---

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Núcleo del DLT** (`core/tresd/`): calibración con normalización, proyección, triangulación, error de reproyección, dejar uno fuera, plantilla de la varilla (rejilla y alturas → coordenadas), cámaras virtuales sintéticas. Solo núcleo y tests | Opus |
| 2 | **Grabar para el 3D:** vista oblicua (`OrientacionVista`, `vistasCompatibles`, la sala y abrir la pareja), id de sala en los metadatos, enfoque bloqueado en la sala, y `docs/grabacion.md` con cómo hacer la varilla, colocar las cámaras y grabar la calibración y las pruebas de validación. Va pronto para que el usuario pueda grabar datos reales mientras se hace el resto | Opus |
| 3 | **Calibrar el espacio en la app:** pantalla de calibración (plantilla, marcado semiautomático, error por punto y total, quitar puntos), almacén `calibraciones`, esquema 5 y migración, glosario. Con la calibración real del usuario: primer dato del error | Opus |
| 4 | **Núcleo de la reconstrucción:** B a los tiempos de A, triangulación por frame con su error, filtrado 3D por tramos, derivadas, ángulos 3D y proyecciones con sus tests de convención, longitud de los segmentos en 3D | Opus |
| 5 | **3D en el visor:** aplicar una calibración a una sesión (propuesta por la sala, testigos), sección «3D» en «Análisis», series en la gráfica, comparación 2D / 3D, figura de los tres planos, error por frame en la franja, CSV, glosario. Generador de escenas sintéticas y e2e | Opus (la maquetación fina puede ir a Sonnet en un PR aparte) |
| 6 | **Validación con el usuario** (§9) y ajustes: umbral del error de reproyección, separación de las cámaras, gomets o bolitas, seguidor a 60°; `docs/grabacion.md` con los resultados | Opus |
| 7 | Cierre de fase: revisión de código, documentación y limitaciones | Opus |

El paso 2 va antes que la calibración en la app para que los vídeos reales lleguen cuanto antes: el paso 3 ya se prueba con la varilla del usuario, y el 1 se puede comprobar contra esos mismos puntos fuera de la app.

## Resumen de decisiones (propuestas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Cámaras | Perfil (referencia, sigue dando el 2D) y anterolateral a 45–60°; la vista de frente queda para el FPPA 2D |
| D2 | Marcadores | Los 3 laterales de siempre (trocánter, epicóndilo, maléolo), vistos por las dos; opcionales para cadera y tobillo; bolitas si se separan más de 45° |
| D3 | Objeto de calibración | Varilla vertical con 4 gomets en 6 marcas del suelo (24 puntos), comprobada con nivel; las marcas, gomets que se quedan como testigos; plantilla en la app |
| D4 | Calibración | DLT de 11 parámetros por cámara, TypeScript puro, normalización de Hartley; el error que se muestra es el de dejar uno fuera, en mm; sin OpenCV |
| D5 | Triangulación | Mínimos cuadrados con los dos DLT; error de reproyección por punto; por encima del umbral, punto no utilizable |
| D6 | Instantes distintos | Rejilla de la vista de referencia; B interpolada con spline por tramos sin cruzar huecos ni extrapolar; filtrar las coordenadas 3D después de triangular |
| D7 | Ángulos | Flexión de rodilla 3D, proyecciones en los planos sagital y frontal de la persona (planos del laboratorio) y longitud de los segmentos en 3D; sin rotaciones ni Grood y Suntay en esta fase |
| D8 | Interfaz | «Calibrar el espacio 3D», sección «3D» en «Análisis», comparación 2D / 3D, figura de los tres planos (sin vista 3D girable), CSV con X, Y, Z |
| D9 | Grabar y reutilizar | Perfil + oblicua en la sala; enfoque bloqueado; una calibración por sala para varias tomas; testigos que avisan si una cámara se movió |
| D10 | Esquema | Esquema 5 (`Vista.dlt`, `Sesion.espacio3d`) con migración; almacén `calibraciones` |
| D11 | Validación | Puntos fuera de la calibración, varita de longitud conocida, goniómetro inclinado y sentadilla, con objetivos en mm y grados |

## Riesgos

- **El segundo móvil:** para medir en 3D **las dos** cámaras tienen que grabar a 30 fps y con resolución para seguir los gomets. La tablet (10–15 fps) no sirve. Sin un segundo móvil adecuado, la fase se puede hacer entera con vídeos sintéticos, pero no validar.
- **La verticalidad de la varilla** es probablemente el mayor error de la calibración (§2). La validación con la varita lo medirá; si pasa del objetivo, se prueba la pared y el suelo (alternativa c) o se mide también la posición de lo alto de la varilla.
- **El enfoque y la estabilización:** si un móvil no deja bloquear el enfoque, o aplica algún recorte por su cuenta, la calibración no se mantiene entre tomas. Los testigos lo detectan; la solución sería calibrar en la misma toma (la varilla al principio de cada grabación).
- **La lente:** el DLT no corrige la distorsión; la cámara principal de un móvil tiene poca, pero en los bordes de la imagen se nota. Mantener el volumen de medida en el centro de las dos imágenes; si la validación da errores mayores en los bordes, es argumento para la fase 6.
- **Gomets vistos de lado:** a 60° un gomet plano se ve como una elipse estrecha y el seguidor puede perderlo o desplazar su centro (el centro de la mancha visible no es el del gomet). Las bolitas lo evitan; se decide con los vídeos del paso 6.
- **Colocar a la persona:** las proyecciones usan los planos del laboratorio; si la persona está girada respecto a X, la «frontal» mezcla flexión. La flexión 3D no depende de eso. Se dice en la app y en la guía.
- **Rolling shutter y velocidad:** sin efecto apreciable en una sentadilla; en movimientos rápidos, sí (§4).

## Qué necesito del usuario

1. **Aceptar o cambiar D1–D11**, sobre todo:
   - D1 (perfil + anterolateral en vez de perfil + frente);
   - D3 (la varilla vertical: ¿tienes un palo o listón recto de ~1,2 m y un nivel, o usas la app de nivel del móvil?);
   - D7 (qué ángulos: ¿te basta la flexión 3D y las proyecciones, o necesitas ya varo-valgo de verdad con varitas en muslo y pierna?).
2. **El segundo móvil:** modelo, versión de Android y de Chrome. Si no tienes uno que grabe a 30 fps, dímelo: cambia el orden (la validación real esperaría).
3. Tras el paso 2: **grabar con los dos móviles** (unos 20 minutos, la guía estará en `docs/grabacion.md`):
   - la calibración con la varilla en las 6 marcas;
   - sin mover los trípodes: la varita de longitud conocida movida por el volumen (30 s), el goniómetro en las posiciones de §9 y una sentadilla con los 3 gomets;
   - si puedes, lo mismo con la segunda cámara a 60° (y con bolitas, si las tienes).
4. Medidas con cinta: la rejilla del suelo, las alturas de los gomets de la varilla y la distancia entre los gomets de la varita.
