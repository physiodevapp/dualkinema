# Fase 6: 3D con dos móviles calibrado con la propia persona

Estado: **cerrada** (08-11-2026; ver «Cierre de la fase 6»). Plan propuesto el 01-11-2026, con las decisiones D1–D10 escritas y seguido con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md` (el usuario las revisa cuando quiera). Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**; la única toma que se pide antes es la **B1** (ver «La toma B1»).

Parte del anticipo escrito al final de `docs/plan-fase-5.md` (lo hablado el 27-10) y lo concreta.

## Qué se quiere

Dos móviles grabando a la vez (la grabación doble de la fase 4, con la sincronía del pitido) y, sin ningún objeto de calibración, **los puntos del cuerpo en 3D** y los ángulos en los planos de la persona, **de las dos piernas a la vez**. La calibración sale de la propia persona: los puntos que ven las dos cámaras a la vez, la vertical del acelerómetro de cada móvil y, para los metros, la estatura.

Material: dos móviles que graben a 30 fps y dos apoyos fijos (un trípode, una estantería, una silla). Nada más.

## Idea en una página

1. **Al grabar**, cada móvil guarda en su MP4 la **gravedad vista por su cámara** (acelerómetro) y si se ha movido durante la toma.
2. **Al abrir la pareja**, la app ya tiene la sincronía (fase 4) y detecta el cuerpo en las dos vistas (fase 5).
3. **Calibración:** con los puntos de las dos vistas en los mismos instantes, se busca dónde está una cámara respecto a la otra. Como cada una conoce su vertical, la rotación entre ellas solo tiene un grado libre (el giro alrededor de la vertical) y el problema es pequeño y estable. Se refina todo junto (rotación, traslación, focal de cada cámara y los puntos) minimizando lo que se aparta cada punto reproyectado de donde lo marcó el modelo (error de reproyección, en px).
4. **Escala:** los ángulos **no la necesitan** (un 3D a escala desconocida da los mismos ángulos). Para los metros (velocidades, alturas, distancias), la estatura de la persona; la distancia entre los móviles por el pitido sirve de comprobación.
5. **Triangulación** frame a frame (la vista B interpolada a los instantes de la A, sin cruzar huecos), filtro por tramos en 3D como en 2D, y **ángulos en los planos de la persona** (marco de la pelvis con la vertical de la gravedad).
6. **Antes de grabar**, un asistente en la sala: inclinación de cada móvil, la persona entera en las dos imágenes, distancia entre móviles por el pitido, altura de cada cámara.

---

## 1. Qué se graba de los sensores [D1]

**D1 — El acelerómetro (y el giróscopo) en el MP4, resumidos.** Durante la grabación (y la cuenta atrás), `devicemotion` (Chrome para Android lo da sin permiso en un contexto seguro, a unos 60 Hz, con `timeStamp` en el reloj de la página) da `accelerationIncludingGravity` y `rotationRate`. No se guardan las muestras sueltas: se guarda, por **ventanas de 1 s**, la media de la aceleración con gravedad (m/s², ejes del aparato), su desviación típica y el giro máximo (°/s); y una vez, la **orientación de la pantalla** al empezar (`screen.orientation.angle`: de ella depende cómo se pasan los ejes del aparato a los de la imagen). Opcional, y solo para el asistente: el rumbo de la brújula (`deviceorientationabsolute`), que en interiores puede desviarse decenas de grados.

- **Dónde va:** en el JSON de dualkinema del comentario del MP4 (`sensores`, opcional: no cambia la versión del formato). Mediabunny no deja cambiar los metadatos tras empezar, pero sin `fastStart` el bloque `moov` (donde van) se escribe al cerrar con el objeto que se le dio: se rellena ese objeto antes de `finalize()`. Depende de cómo funciona Mediabunny por dentro, así que lo vigila una e2e que graba, cierra y vuelve a leer los sensores del archivo. Si un día deja de funcionar, la alternativa es una pista de subtítulos WebVTT con una entrada por segundo. 5 min a una ventana por segundo son unos 20 KB.
- **Núcleo** (`core/sensores/`): de los ejes del aparato a los de la cámara trasera según la orientación de la pantalla (x a la derecha de la imagen, y hacia abajo, z hacia donde mira la cámara), la **vertical de la cámara** (dirección de la gravedad en ese marco, de las ventanas quietas), la **inclinación** (cabeceo y alabeo, en °) y si el móvil **se ha movido** (una ventana con desviación o giro por encima de un umbral, o la vertical que cambia más de 1° entre el principio y el final). Con tests de valor conocido (móvil vertical, tumbado, girado 90°, inclinado 10°).
- **Precisión esperada:** la gravedad media de 1 s quieto da la vertical a unos 0,5–1° (pendiente de validar con vídeos: el acelerómetro de cada móvil puede tener un sesgo de calibración de fábrica).

## 2. Cómo se colocan los móviles [D2]

**D2 — Un móvil en cada flanco anterolateral** (a unos ±45° del frente de la persona, unos 90° entre ellos), a unos 3 m, de rodilla a cadera de alto, con el cuerpo entero en las dos imágenes. Así ninguna pierna queda tapada para las dos cámaras. Perfil + frente sigue valiendo para 3D, pero la pierna lejana de la cámara de perfil solo la ve bien una cámara.

- **En la sala**, una opción nueva «Para 3D»: cada móvil dice en qué flanco está (a la derecha o a la izquierda de la persona, por delante). `vistasCompatibles` acepta dos flancos distintos. En el visor, cada vista oblicua se abre con la orientación de perfil más parecida (la persona mira hacia el lado de la imagen contrario al flanco) y un aviso de que **sus ángulos 2D no valen** (el plano del movimiento no es el de la imagen): sus valores son los 3D.
- **Las vistas de siempre siguen igual:** el 3D se ofrece en cualquier pareja de vídeos sincronizada con sensores, también perfil + frente.

## 3. Modelo de cámara [D3]

**D3 — Cámara estenopeica con el punto principal en el centro de la imagen, sin distorsión, y la focal desconocida con una estimación previa.** Los móviles graban vídeo con estabilización y recorte, así que la focal del vídeo no es la de la ficha del móvil. La focal se estima en la calibración (§4) con un valor de partida y un peso suave: un campo de visión horizontal de unos 65° sobre el lado largo (f ≈ 0,78 · lado largo en px). La distorsión de la cámara principal de un móvil en vídeo es pequeña (ya la corrige el móvil); se apunta como limitación y se puede añadir un k₁ a la calibración si los residuos lo piden (pendiente de validar con vídeos).

- **Por qué no una calibración de lente aparte:** pediría un objeto (un damero), que es justo lo que se descartó. Si la focal resulta mal determinada con la persona, se ofrecerá **calibrar la focal una vez por móvil** con algo de tamaño conocido que hay en cualquier sitio (una hoja A4 en el suelo): queda como alternativa, no se construye antes de verlo con la B1.
- **Obturador rodante:** se ignora (con movimientos de clínica, el desplazamiento entre la primera y la última fila es de pocos px). Limitación.

## 4. Calibración con la persona [D4]

**D4 — Pose relativa con la vertical conocida, RANSAC y ajuste de haces.**

1. **Correspondencias:** los 12 puntos del modelo (y los gomets que estén en las dos vistas) en los instantes en que las dos vistas los tienen con calidad ≥ `CALIDAD_MINIMA`, la vista B interpolada al instante de la A (§5). Se usan los de un **tramo de calibración** (por defecto, toda la toma; se puede acotar a los ~10 s del principio con unos pasos por la zona, que es lo que se recomienda grabar). Se toma una muestra repartida en el tiempo y en la imagen (unos cientos de instantes), para que no manden los frames quietos.
2. **Arranque:** con la vertical de cada cámara, las dos se giran a un marco con z vertical; la rotación que falta es solo un ángulo alrededor de la vertical (ψ), y la traslación, una dirección (2 grados libres). Tres correspondencias bastan (solver mínimo de tres puntos con la vertical conocida); con RANSAC sobre muchas se descartan los puntos mal detectados. Alternativa sin acelerómetro (vídeos sin sensores): matriz esencial de cinco puntos con RANSAC y la vertical estimada después con la dirección media de tobillo → hombro de pie (peor; se avisa).
3. **Ajuste de haces** (Levenberg–Marquardt en TypeScript puro, con el jacobiano escaso por bloques): ψ, la dirección de la traslación, la focal de cada cámara, una corrección pequeña de la vertical de cada una (con su peso: la del acelerómetro no es perfecta) y los puntos 3D. Pérdida robusta (Huber, 3 px) para lo que el modelo detecta mal.
4. **Resultado:** el ángulo entre las cámaras visto desde la persona, la distancia entre ellas, la altura de cada una sobre el suelo, la focal de cada una y el **error de reproyección** mediano (px) total y **por punto del cuerpo**. El error por punto es la comprobación de la B1: si una cámara pone la cadera en otro sitio que la otra (MediaPipe estima centros articulares, no referencias óseas), ese punto tendrá un residuo sistemático.

**Escala [D5].** Lo calibrado está a escala desconocida. **D5 — los metros, de la estatura** (la escribe el usuario, como la escala 2D): de pie, la distancia vertical media entre tobillo y hombro es ≈ 0,779 · estatura (proporciones de Drillis y Contini recogidas por Winter: hombro 0,818 H, tobillo 0,039 H); con unos 2–3 % de error por la variación entre personas. **La distancia entre los móviles por el pitido** (fase 4) se compara con la que da la calibración y, si no casan (más de medio metro; era un 10 %, ver «Primera toma real»), se avisa. Si el usuario midió con cinta la distancia entre los móviles, puede escribirla y manda ella. Sin escala, todo lo angular funciona y lo que va en metros no se muestra (como en 2D).

**El suelo:** la vertical (la del acelerómetro, refinada) y los talones y puntas de los pies cuando están quietos y abajo dan el plano del suelo; con él, la altura de cada cámara y el origen del marco del laboratorio.

## 5. Sincronía y triangulación [D6]

**D6 — La vista B se interpola a los instantes de la A, sin cruzar huecos; triangulación lineal y refinada.**

- El desfase es el de la sincronía de la sesión (pitido, reloj o el que se haya aplicado). Para cada instante de la vista de referencia, cada punto de B se interpola entre los dos frames de B que lo rodean **si los dos son utilizables y no hay un salto en el tiempo entre ellos** (`SALTO_MAX_PASOS`); si no, NaN. Interpolación lineal (a 30 fps, el error frente a una spline es de décimas de px con los movimientos de clínica); se compara con la spline del filtro en los tests.
- La precisión del pitido (±1 ms con los dos móviles calibrados) hace despreciable el error por sincronía; con el reloj (±40–50 ms) el 3D se degrada en los movimientos rápidos: se avisa, como ya se avisa con el método.
- **Triangulación** de cada punto en cada instante: lineal (DLT homogénea) y un par de iteraciones de Gauss–Newton sobre la reproyección; su **calidad** sale del error de reproyección de ese punto (en px) y de la peor calidad 2D de las dos vistas. Un punto que solo ve una cámara **no se triangula** (NaN): nunca se inventa.
- **Filtrado en 3D** con lo de siempre: Butterworth de fase cero por tramos, por coordenada, con el corte de la sesión; nada a través de un hueco.

## 6. Ángulos en 3D [D7]

**D7 — Marco de la persona a partir de la pelvis y la vertical; catálogo 3D con su convención fijada por tests.**

- **Marco del laboratorio:** z hacia arriba (gravedad), origen en el suelo bajo el punto medio de las caderas al empezar, x hacia delante de la persona (perpendicular a la línea de las caderas en el plano horizontal, al principio de la toma).
- **Marco de la pelvis, en cada instante:** el eje mediolateral es la línea de las caderas (izquierda → derecha), el vertical es la gravedad quitándole lo que tenga del mediolateral, y el anteroposterior el producto de los dos. Con centros articulares (dos puntos por segmento) no hay rotación axial de muslo ni de pierna: **la rotación de cadera y de rodilla no se calcula** (llega con el esqueleto de la fase 7).
- **Qué se mide (de las dos piernas):**
  - **Sagital:** flexión de la rodilla (ángulo 3D entre muslo y pierna, con el signo de la flexión en el plano sagital de la pelvis), flexión de la cadera (muslo respecto al tronco, proyectado en el sagital de la pelvis), tobillo (pierna y pie, cero 90), inclinación del tronco hacia delante (respecto a la vertical).
  - **Frontal:** valgo / varo de rodilla en 3D (el FPPA calculado en el plano frontal de la pelvis, no en el de la imagen: ya no depende de dónde esté la cámara), aducción / abducción de cadera respecto a la pelvis, **oblicuidad pélvica** (línea de las caderas respecto a la horizontal) e inclinación lateral del tronco.
  - **Transversal:** **rotación de la pelvis** (la línea de las caderas alrededor de la vertical, respecto al principio), rotación del tronco respecto a la pelvis (línea de los hombros frente a la de las caderas) y **ángulo de progresión del pie** (talón → punta frente a la dirección de avance).
- Las convenciones (signo, cero) siguen las de los ángulos 2D donde hay equivalente, para que la misma persona dé lo mismo en 2D de perfil y en 3D sagital; lo fija `catalogo3d.test.ts` con figuras 3D de ángulo conocido, con la persona mirando a cualquier lado.
- **El cero de referencia, el CSV y las gráficas funcionan igual**: una articulación 3D es otra serie del ángulo de la sesión (una sola serie por articulación, desenrollada y centrada como las de 2D).

## 7. Interfaz [D8]

**D8 — El 3D es una vista más de la sesión, que aparece cuando hay dos vistas sincronizadas.**

- En la pestaña «Vídeo», con dos vistas sincronizadas, **«Calibrar en 3D»**: pide detectar el cuerpo en las dos (si falta), la estatura (opcional) y el tramo de calibración; trabaja en un worker (`workers/calibracion3d.worker.ts`) con progreso y «Cancelar». Al acabar, el resultado (§4) con sus avisos: residuo alto, un móvil que se movió, pitido y calibración que no casan, focal fuera de lo razonable.
- **Visor 3D:** en «Análisis», un monigote 3D sobre una rejilla del suelo, dibujado en un `<canvas>` 2D propio con proyección ortográfica y giro con el dedo (sin librería 3D: son 14 puntos y unas líneas). El cursor común lo mueve; las cámaras se dibujan como dos pirámides en su sitio.
- **Selector de articulación** con las 3D (agrupadas por plano y por pierna) y la gráfica, los valores, el cero y el CSV de siempre. Comparación 2D frente a 3D de la misma articulación (perfil sagital frente a 3D sagital) con `ComparacionFuentes`: es lo que dice cuánto se gana.
- **Glosario:** «3D calibrado con la persona», «Error de reproyección», «Vertical del acelerómetro», «Escala por la estatura», «Marco de la pelvis», «Por qué no hay rotación de cadera».

## 8. Asistente de colocación [D9]

**D9 — En la sala, antes de grabar, con lo que ya hay:**

- **Inclinación** de cada móvil en directo (acelerómetro): la cámara debería mirar casi horizontal (±10°) y sin alabeo; se avisa fuera de eso.
- **La persona entera en las dos imágenes:** el detector de la fase 5 (*lite*, unas veces por segundo) sobre la vista previa, con el esqueleto dibujado y un aviso si se corta la cabeza o los pies.
- **Distancia entre los móviles por el pitido**, ahora también antes de grabar (botón «Medir la distancia»: la misma secuencia de ida y vuelta, sin grabar vídeo).
- **Altura de cada cámara:** con su inclinación y la focal de partida se sabe dónde cae el horizonte en la imagen; la parte del cuerpo de la persona (de pie) en esa línea está a la altura de la cámara («la cámara está a la altura de la cadera, ~0,9 m» con la estatura).
- **Ángulo entre los dos móviles:** por la brújula (aproximado: se dice) y, si hay distancias a la persona (de la estatura y la imagen) y entre los móviles, por el coseno: cos θ = (d₁² + d₂² − D²) / (2 d₁ d₂).
- Al parar, la revisión de la grabación doble dice si un móvil **se movió** durante la toma (entonces esa toma no vale para 3D, sí para 2D).

## 9. Persistencia [D10]

**D10 — Esquema 6:** la sesión guarda la **calibración 3D** (`calibracion3d`: tramo usado, focal y pose de cada cámara, la vertical, la escala y de dónde sale, el error de reproyección y la fecha) y la estatura. Los puntos 3D **no se guardan**: se recalculan al abrir desde las trayectorias 2D (que ya se guardan) y la calibración, en menos de un segundo. Así, corregir un punto 2D a mano cambia su 3D sin más. Cada vista guarda sus sensores (el resumen leído del MP4) para no depender de volver a leer el archivo. Migración 5 → 6 (vacía) con su test.

---

## Pruebas: una persona sintética

Como manda el acuerdo, la verdad se comprueba con **datos sintéticos de verdad conocida**:

- **Núcleo:** una persona sintética (`core/tresd/sintetico.ts`): los 12 puntos en 3D con proporciones de Winter y una sentadilla, una marcha en el sitio y unos pasos (ángulos conocidos de cada articulación en cada instante), proyectada en dos cámaras virtuales de pose, focal y altura conocidas (flancos a ±45°, perfil + frente, cámaras a distinta altura, una inclinada 10°), con ruido en px equivalente a lo medido en la fase 5 (≈ 3,5° frame a frame en la rodilla de perfil: unos 2–3 px a 1080p y 3 m), algún frame sin persona y algún punto mal detectado. Con los sensores simulados (la gravedad en cada cámara, con 0,5° de sesgo). Tests: el solver de tres puntos con la vertical, RANSAC con un 20 % de puntos malos, el ajuste de haces (focal dentro de un 2–3 %, ángulo entre cámaras dentro de 1°, residuo del orden del ruido), la triangulación, la escala por la estatura, y cada ángulo 3D frente a su verdad (tolerancias por articulación).
- **e2e:** dos vídeos sintéticos (ffmpeg, como hoy) con metadatos de grabación doble y sensores, y el worker de detección falso mandando la proyección de la persona sintética en cada vista. «Calibrar en 3D», el monigote, una articulación 3D frente a la verdad, el CSV, guardar y recuperar. Una e2e de la grabación con `devicemotion` falso: los sensores llegan al MP4 y se leen.
- **Validación con vídeos:** al final del proyecto. Pendiente de validar con vídeos: la vertical del acelerómetro de cada móvil, la focal estimada frente a la real, el error por punto entre flancos (B1), la escala por la estatura frente a la cinta, los ángulos 3D frente a un goniómetro.

## La toma B1

**Cambio del 08-11-2026 (decisión del usuario):** la toma B1 resultó demasiado laboriosa (sitio, gomets planos que se pierden, dos grabaciones; además, las dos primeras se grabaron con el mismo móvil y no valen). Se completa el proyecto **sin pedir nada hasta el final**: la B1 pasa a la validación final, simplificada (una grabación de unos 40 s a 720p con los dos móviles en «Para 3D», sin gomets; apuntar solo la estatura y la distancia entre los móviles). El riesgo de que el detector no marque el mismo punto desde los dos flancos se ataca mientras tanto con datos sintéticos (ruido y sesgo por punto según el flanco) y probando **RTMPose** como alternativa a MediaPipe (ver «RTMPose»). La guía de la portada se queda tal cual.

Lo que decía el plan: antes de construir el 3D sobre la calibración, comprobar con **una toma real** que MediaPipe marca el mismo punto desde los dos flancos (el riesgo principal). Se graba **después del paso 1** (para que lleve el acelerómetro) y se mira con el paso 3 (el informe de la calibración, por punto del cuerpo).

**Cómo grabarla:** «Grabar con dos móviles», opción «Para 3D»; un móvil en cada flanco por delante de la persona, a 90° entre ellos (±45° del frente), a unos 3 m de ella y a ~1 m de alto, apoyados y quietos, con la persona entera en las dos imágenes. Seguido, en una sola grabación o en varias: 10 s de pie y unos pasos por la zona; sentadilla ×3; sentadilla a una pierna ×3 con cada pierna; marcha en el sitio 10 s. **Apuntar con cinta:** la distancia entre los dos móviles, la de cada uno a la persona, la altura de cada lente sobre el suelo, el ángulo entre ellos (si se puede) y la estatura.

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Sensores al grabar** (`core/sensores/`, `media/sensores.ts`): acelerómetro y giróscopo resumidos por segundo en el MP4 (también en «Grabar con este móvil»), la vertical y la inclinación de la cámara, si se movió (aviso al parar); la opción «Para 3D» de la sala (dos flancos). e2e con `devicemotion` falso. **Después: grabar la B1** | Opus |
| 2 | **Núcleo 3D** (`core/tresd/`): cámara, proyección, solver de tres puntos con la vertical, matriz esencial (sin sensores), RANSAC, ajuste de haces, triangulación, escala por la estatura, suelo; la persona sintética y las dos cámaras virtuales. Tests de valor conocido | Opus |
| 3 | **Calibrar en 3D** en el visor (worker, estatura, tramo) con el resultado y un **informe para copiar** (error por punto del cuerpo, ángulo, distancias y alturas, focales, pitido frente a calibración). **Se mira la B1 con él**; esquema 6 | Opus |
| 4 | **Ángulos 3D:** interpolación de B, triangulación y filtrado de la sesión, marco de la pelvis, catálogo 3D con sus tests, selector, gráficas, cero, CSV, comparación 2D frente a 3D, glosario. e2e | Opus |
| 5 | **Monigote 3D** en «Análisis» con el cursor común y las cámaras | Opus |
| 6 | **Asistente de colocación** en la sala (inclinación, persona entera, distancia por el pitido, altura de las cámaras, ángulo) | Opus |
| 7 | Cierre: revisión de código, documentación y limitaciones | Opus |

Si la B1 dice que MediaPipe no marca el mismo punto desde los dos flancos (residuos sistemáticos de varios cm en algún punto), se decide entonces: quitar ese punto de la calibración (los tobillos y los pies son los más fiables por estar en el suelo), darle menos peso, o recomendar gomets en esos puntos para calibrar (§«¿Hacen falta gomets?» de la fase 5).

## Resumen de decisiones (propuestas; se sigue con ellas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Sensores | Acelerómetro y giróscopo por ventanas de 1 s en el JSON del MP4, escrito al cerrar; la vertical y si el móvil se movió, en el núcleo |
| D2 | Colocación | Un móvil en cada flanco anterolateral (90° entre ellos), ~3 m, de rodilla a cadera de alto; «Para 3D» en la sala; perfil + frente también vale |
| D3 | Cámara | Estenopeica, punto principal centrado, sin distorsión, focal estimada con un previo de 65° de campo horizontal |
| D4 | Calibración | Vertical del acelerómetro + solver de tres puntos con RANSAC + ajuste de haces robusto; sin sensores, matriz esencial |
| D5 | Escala | Ángulos sin escala; metros por la estatura; el pitido (o la cinta) comprueba |
| D6 | Sincronía y triangulación | B interpolada a los instantes de A sin cruzar huecos; DLT + Gauss–Newton; un punto de una sola cámara no se triangula; filtro por tramos en 3D |
| D7 | Ángulos 3D | Marco de la pelvis con la gravedad; sagital, frontal y transversal de las dos piernas, sin rotación de cadera ni de rodilla; catálogo 3D fijado por tests |
| D8 | Interfaz | «Calibrar en 3D» en «Vídeo», monigote en canvas propio, articulaciones 3D en el selector, comparación 2D frente a 3D |
| D9 | Asistente | Inclinación, persona entera, distancia por el pitido, altura de las cámaras y ángulo, antes de grabar |
| D10 | Esquema | 6: la calibración 3D y la estatura en la sesión, los sensores en cada vista; los puntos 3D se recalculan |

## Hecho

**Paso 1 — sensores al grabar** (`core/sensores/`, `media/sensores.ts`, `ui/RevisionSensores.tsx`).

- **Al grabar** (con un móvil y en la grabación doble; no al calibrar la cámara), `RegistroSensores` escucha `devicemotion` desde que se prepara la grabadora (en la doble, 1,5 s antes del inicio) y `AcumuladorSensores` lo resume por ventanas de 1 s contadas desde el tiempo 0 del vídeo (lo que llega antes de saberlo se guarda y se coloca al arrancar): media de la aceleración con gravedad, desviación típica de su módulo y giro máximo. Se guarda desde 5 s antes del tiempo 0, y el giro de la pantalla al empezar (y si giró después).
- **En el MP4:** `sensores` en el JSON de dualkinema (opcional; el formato sigue en 1). Se escribe al cerrar: el objeto de etiquetas que se le dio a Mediabunny se completa antes de `finalize()` (sin `fastStart`, el `moov` se escribe entonces). Lo vigila la e2e.
- **Núcleo:** `aEjesCamara` (de los ejes del aparato a los de la cámara trasera según el giro de la pantalla), `verticalCamara` (la gravedad hacia abajo en ejes de la cámara, de las ventanas quietas de la grabación), `inclinacion` (cabeceo: + mirando hacia abajo; alabeo: + con la gravedad hacia la derecha de la imagen) y `movimiento` (sacudidas o giro por encima de 0,15 m/s² o 3 °/s, la vertical que cambia más de 1° entre los primeros y los últimos 3 s, o la pantalla que gira; lo de la cuenta atrás no cuenta). Con tests de valor conocido: de pie, 10° hacia abajo, 5° de alabeo, en horizontal, la cuenta atrás, una sacudida, un resbalón de 2°.
- **Al parar** (en «Grabar con este móvil» y en el resultado de la grabación doble): «Cámara mirando hacia abajo 10,0° · girada 0,0°» y, si se movió, el aviso de que la toma vale para 2D pero no para el 3D. Glosario: «Sensores al grabar».
- **Para 3D en la sala:** dos móviles de perfil mirando a lados distintos (uno en cada flanco) son ahora una pareja válida (`vistasCompatibles`, `enFlancos`), con un aviso de cómo colocarlos; al abrir la pareja, la referencia es la de la persona mirando a la derecha. No cambia el protocolo. **Pendiente (paso 3 o 4):** en el visor, la vista B de una pareja de flancos sigue la pierna de la referencia, que en su imagen es la lejana; sus ángulos 2D no valen (lo que vale es el 3D).
- **e2e:** grabar con un acelerómetro falso (10° hacia abajo y una sacudida a mitad): la inclinación sale de lo grabado y se avisa de la sacudida; en la sala, dos perfiles opuestos valen y dos iguales no.
- **Pendiente de validar con vídeos:** que la imagen del vídeo siga al giro de la pantalla en los móviles del usuario (con el giro automático bloqueado, la pantalla no gira pero la cámara podría), el sesgo del acelerómetro de cada móvil y los umbrales de «se ha movido».

**Paso 2 — núcleo 3D** (`core/tresd/`), con tests de valor conocido sobre la persona sintética:

- `camara.ts`: cámara estenopeica (punto principal centrado, focal en px), proyección, centro, giros (Rodrigues) y `camaraMirando` para las cámaras virtuales; la focal previa (65° sobre el lado largo).
- `triangular.ts`: DLT homogénea con dos o más cámaras y Gauss–Newton sobre la reproyección; un punto que solo ve una cámara, o que queda detrás de alguna, no se triangula (NaN). Con 2 px de ruido y los móviles en los flancos a 3 m, el punto queda a menos de 1 cm.
- `calibrar.ts` (`calibrarDosCamaras`): la nivelación de cada cámara por su gravedad, el arranque por barrido del giro ψ alrededor de la vertical (de grado en grado y afinado a 0,01°, con la dirección de B del autovector menor de la restricción epipolar y el coste mediano), el sentido de la dirección por los puntos delante de las dos cámaras, y el ajuste de haces (Levenberg–Marquardt con el complemento de Schur, Huber a 3 px, previos de 1° en la vertical y 15 % en la focal). Da el error de reproyección mediano, por correspondencia y **por punto del cuerpo** (lo que mira la B1). Sin sensores supone el móvil en vertical sin inclinar (se dice: `sinVertical`); la matriz esencial para vídeos sin sensores queda para cuando haga falta.
- `escala.ts`: metros por la estatura (el percentil 90 de la altura tobillo → hombro = 0,779·H), comparación con la distancia entre los móviles (aviso por encima de medio metro) y la altura del suelo (percentil 5 de talones y puntas).
- `sintetico.ts`: la persona sintética (12 puntos con las proporciones de Winter; 6 s de pasos por la zona, dos sentadillas y marcha en el sitio) y un ruido gaussiano reproducible.
- `algebra.ts`: resolver un sistema, inversa 3×3 y el autovector menor (Jacobi).

**Lo que dice la persona sintética (importante para la B1):** con los datos exactos y la focal de cada móvil conocida, todo sale exacto (ángulo entre cámaras a 0,005°). Pero **la focal está mal determinada con la persona sola**: moviéndose en un metro a 3 m de las cámaras, cambiar las dos focales un 2 % (y con ellas el ángulo entre cámaras ~1°) apenas cambia la reproyección (centésimas de px). Con 2 px de ruido, un 5 % de puntos malos y la focal previa de B un 8 % errada: ángulo entre cámaras a ~1,1°, focales a ~2 %, longitudes (en unidades de la distancia entre cámaras) a ~3 %. Con la focal de cada móvil conocida, el ángulo baja a menos de 0,5°. Los **ángulos articulares** sufren poco por esto (la deformación es casi una escala), pero las longitudes sí: si la B1 lo confirma, conviene **fijar la focal de cada móvil una vez** (la hoja A4 de §3, o leerla de la ficha de vídeo del modelo) y guardarla en el móvil, como el retraso de la cámara. Se decide con la B1.

**Guía de la toma B1** (pedida por el usuario el 07-11; `ui/tomaB1/`, `ui/useInclinacion.ts`): en la portada, «Guía de la toma B1 (3D)», siete pasos con casillas: material (y los **gomets, opcionales pero recomendados**: seis por delante, mitad del muslo, centro de la rótula y centro del tobillo de cada pierna; son el mismo punto para las dos cámaras y separan el error de la calibración del de MediaPipe; en el lado de fuera solo los vería una cámara), antes de empezar, colocación (dibujo desde arriba y la **inclinación de este móvil en directo**, con el mismo paso a ejes de la cámara que al grabar), emparejar (con un botón a la sala), las dos grabaciones con lo que hay que hacer en cada una y lo que mirar al parar, las medidas con cinta (con aviso si un valor parece mal escrito y el ángulo entre los móviles por el teorema del coseno) y después (compartir y copiar las medidas). Lo marcado y lo medido se recuerda en el móvil (`dualkinema.tomaB1`), así que se puede ir a la sala y volver. Nada obliga a empezar de cero: se salta a cualquier paso desde la barra, «Rehacer este paso» desmarca solo el paso, «Repetir esta grabación» solo esa grabación (con «Parar los dos» en la sala) y «Empezar de nuevo (otra toma)» lo borra todo con un segundo toque. Glosario: «Toma B1 (prueba del 3D)». e2e: recorrerla, la inclinación con un acelerómetro falso, las medidas y volver tras recargar. **Guía por voz** (pedida por el usuario el 07-11; `core/grabacion/guionVoz.ts`, `sala/voz.ts`): en la sala, «Guía por voz» elige el guion de la grabación 1 o 2 de la toma B1 (y pone su duración, 60 s); **solo el móvil que la programa habla** (el otro no sabe del guion: no cambia el protocolo), con `speechSynthesis` en castellano, cada frase a su hora desde el inicio, **después de los pitidos de ida y vuelta** (`EMPIEZA_S`, a ~3,5 s) para no taparlos, y solo mientras graba esa grabación; al tocar «Grabar» dice «Guía por voz preparada» (el navegador solo deja hablar tras un toque, y así se comprueba que se oye) y al parar o cancelar se calla. Al acabar una grabación guiada, el móvil que la programó ofrece «Siguiente: grabación 2 de la toma B1», que la deja elegida con su duración. Tests de los guiones (orden, separación, después de los pitidos, cada gesto) y e2e (habla solo el que programa, la primera frase a su hora, calla al parar). **Pendiente de validar con vídeos:** que la voz del sistema no tape nada de lo que se oye en la toma y que los tiempos de cada gesto le vengan bien a la persona.

**Paso 3, «Calibrar en 3D» en el visor (08-11):** `core/tresd/correspondencias.ts` (los 12 puntos de las dos vistas en los instantes de A: B en el instante común, interpolada entre sus dos frames vecinos solo si los dos son utilizables y no hay salto en el tiempo; como mucho 400 instantes repartidos, con al menos 4 puntos cada uno; tramo opcional), `core/tresd/calibracion3d.ts` (`calibrar3D`: el ajuste de haces del paso 2, la escala por la estatura o por la distancia con cinta, que manda, y el suelo; lo que se guarda, `Calibracion3D`; `resumir3D`: el ángulo entre los móviles visto desde donde se cruzan sus ejes ópticos, la distancia, la altura de cada uno sobre el suelo, el campo de visión y los avisos —error alto, un punto que casa mucho peor que el resto, sin acelerómetro, móvil movido, campo de visión fuera de 40–90°, pitido que no casa en más de medio metro, sin sincronizar o por el reloj—; `informe3D`, sin nada del archivo), el worker `workers/calibracion3d.worker.ts` y la tarjeta `ui/visor/Calibrar3D.tsx` en «Vídeo» con dos vistas (instantes con las dos vistas, estatura, distancia con cinta, «solo los primeros 10 s», calcular con «Cancelar», el resultado con el error por punto, los avisos, «Copiar el informe» y «Quitar la calibración»). Los sensores de cada vista llegan con la grabación doble (y se guardan) o, si faltan, se leen del MP4 al calibrar. **Esquema 6** (D10): la sesión guarda `calibracion3d` y `estatura`, y cada vista `sensores`; migración 5 → 6 con su test. Glosario: «3D calibrado con la persona», «Error de reproyección», «Escala por la estatura». e2e: la persona sintética proyectada en dos móviles virtuales (`tests/e2e/persona3d.ts`, empaquetado con esbuild) mandada por el detector falso a cada vista; calibra en el navegador con la estatura y da el ángulo (90°), la distancia y las alturas de los móviles virtuales, el informe y el guardado.

**Lo que dice el paso 3 sobre la comprobación de la B1 (importante):** con dos cámaras, un desvío sistemático del detector en un punto **a lo largo de la línea epipolar** (casi horizontal con los dos móviles a la misma altura) **no se ve en el error de reproyección**: el punto 3D se va más cerca o más lejos y lo absorbe (test: la cadera desplazada 25 px en horizontal en B deja su error por punto por debajo de 1 px; desplazada en vertical, sale la peor y con aviso). Así que «error por punto bajo» no prueba que el detector marque el mismo sitio desde los dos lados; solo lo prueba en la dirección perpendicular. La otra mitad la dirá la **constancia de las longitudes de los segmentos en 3D** (muslo, pierna, anchura de caderas) a lo largo de la toma, que llega con el paso 4: si la cadera de un lado se estima en otro sitio según el ángulo de vista, el muslo cambiará de longitud al girar la persona.

**Paso 4, los ángulos en 3D (08-11):** `core/tresd/puntos3d.ts` (`triangularSesion`: cada punto en cada frame de A con B en el instante común, sin cruzar huecos; sin 3D si solo lo ve una vista o si su error de reproyección pasa del 1 % del lado largo, `ERROR_PUNTO_MAX`; en metros con la escala y con el suelo en z = 0; `aLaboratorio`: x hacia delante de la persona en el primer instante con las dos caderas y el origen bajo su punto medio; `filtrar3D`: el Butterworth de la sesión por tramos, las tres coordenadas), `core/tresd/angulos3d.ts` (`ARTICULACIONES_3D` y `serieAngular3D`) y `core/exportacion/csv3d.ts`. **Decisión de diseño:** los sagitales y frontales no se reescriben: son los de 2D sin marcadores (`core/pose/catalogo.ts`, con su signo y sus tests) calculados sobre una **vista virtual** ortográfica en el plano de la pelvis de cada instante (marco con la vertical de la gravedad y el eje de lado a lado de la línea de las caderas en horizontal: así la oblicuidad de la pelvis no sale siempre 0, como saldría con el eje vertical «gravedad menos lo que tenga de mediolateral» de D7); de perfil a la derecha para la pierna derecha y a la izquierda para la izquierda, de frente desde delante, con los puntos medios rehechos en 3D. La misma persona da lo mismo en 2D de perfil y en 3D sagital cuando el movimiento va en el plano; la flexión de la rodilla es la del plano sagital de la pelvis (no el ángulo 3D entre muslo y pierna: con la cadera muy abducida o rotada difieren). Los transversales, aquí: rotación de la pelvis respecto al principio (+ a la izquierda), del tronco respecto a la pelvis y progresión de cada pie (+ punta hacia fuera). Tests con la persona sintética: todos los ángulos frente a su verdad (exactos con los puntos de verdad; a través de las dos cámaras calibradas, la sentadilla a menos de 1,5°), signos de la oblicuidad, el pie hacia fuera y el tronco ladeado, y que un punto de una sola cámara no se triangula. **Interfaz:** `ui/visor/Panel3D.tsx` en «Análisis» con la sesión calibrada: el selector agrupado por plano, el valor en el cursor común, la gráfica en el tiempo común (tocarla mueve el cursor), el cero (primeros 2 s o «Aquí ± 0,2 s», con el relativo junto al valor) y el CSV con todos los ángulos 3D y las coordenadas de los 12 puntos. Los puntos 3D se recalculan al cambiar las trayectorias 2D, la sincronía o el filtro. Glosario: «Ángulos en 3D y marco de la pelvis» (con por qué no hay rotación de cadera). e2e: tras calibrar con la persona sintética, la flexión de las dos rodillas y la del tronco en 3D frente a la verdad a menos de 2,5° en tres frames, el cero y el CSV. **Pendiente:** el cero de los ángulos 3D no se guarda todavía con la sesión, la comparación 2D frente a 3D de la misma articulación y la constancia de los segmentos en 3D (la otra mitad de la comprobación de la B1).

**Paso 5, el monigote 3D (08-11):** `core/tresd/vista3d.ts` (proyección ortográfica desde un azimut y una elevación, encuadre de toda la toma de una vez para que el monigote no cambie de tamaño, la pirámide de cada cámara) y `ui/visor/Monigote3D.tsx` arriba del panel de los ángulos 3D: un `<canvas>` 2D sin librería 3D con la rejilla del suelo (50 cm con escala), las dos cámaras en su sitio (llevadas al marco de la escena con `enMarco`: escala, suelo y marco del laboratorio), la sombra del esqueleto en el suelo y el esqueleto del frame del cursor común ordenado por profundidad (pierna derecha en ámbar, izquierda en gris); se gira arrastrando (el lienzo lleva `touch-action: none`, como el asa: si no, el arrastre desplazaría la página) y un botón lo devuelve a la vista de partida. Tests de la proyección y la pirámide; en la e2e, píxeles ámbar dibujados y el giro al arrastrar.

**Zoom del monigote (08-11, a petición del usuario):** se pellizca con dos dedos o se usa la rueda del ratón (un dedo sigue girando). De partida, el encuadre de la persona en toda la toma (antes era el de la escena, con las cámaras y el suelo, y la persona quedaba pequeña); lo más lejos, ese encuadre de la escena; lo más cerca, la altura del cuerpo (percentil 90 de lo que ocupa en vertical en cada frame) dos veces el alto del recuadro (`ZOOM_MAX_CUERPOS`). Entre la escena y la persona el centro pasa de uno a otro; más allá de la persona, el centro va hacia la pelvis del frame (del todo desde 1,5 veces, `SEGUIR_DESDE`), para que acercarse no saque el cuerpo del recuadro al moverse (`encuadreConZoom`, `escalaMaxima` en `core/tresd/vista3d.ts`, con tests). El botón de la esquina devuelve el giro y el zoom. En la e2e, la rueda con sus dos topes y el botón.

**Paso 6, el asistente de colocación (08-11), en parte:** `core/grabacion/colocacion.ts` (`revisarInclinacion`: bien si la cámara mira a menos de 10° de la horizontal y la imagen está girada menos de 3°, y qué hacer si no; a medio grado para mandarla) y, en la sala, la inclinación de este móvil en directo y la del otro (nuevo campo opcional `estado.inclinacion`: el protocolo sigue en la versión 1, un móvil anterior lo ignora y su falta es «no se sabe»), con su aviso; glosario «Colocar los móviles». e2e con un acelerómetro falso en un móvil: los dos ven su inclinación y el consejo. **La persona entera en las dos imágenes (08-11, pedido por el usuario: coloca los móviles y luego se pone en la escena, sin poder mirar las pantallas):** «Comprobar que se me ve entero (por voz)» en la sala (`core/grabacion/encuadre.ts`, `ui/useEncuadre.ts`, `workers/encuadre.worker.ts`): MediaPipe *full* sobre la vista previa reducida a 480 px cada 0,6 s en un worker; la cabeza, los pies y los dos lados dentro de la imagen con un 3 % de margen, y un resultado vale cuando se repite dos veces. Basta con activarlo en un móvil: lo pide al otro (`estado.pideEncuadre`) y cada uno manda su resultado (`estado.encuadre`, opcionales). El que lo activa lo dice en voz alta al cambiar y, mientras algo falle, cada 10 s («En este móvil se te ve entero; en el otro móvil no se te ven los pies.», «Se te ve entero en los dos móviles.»); se para al grabar. Glosario «Comprobar el encuadre». e2e con el detector falso en los dos móviles. **Pendiente de validar con vídeos:** el margen y que el detector no confunda a otra persona o un objeto. **Queda para después:** medir la distancia por el pitido antes de grabar, la altura de cada cámara por el horizonte y el ángulo entre los móviles (la guía de la B1 ya lo calcula por el coseno con las distancias de cinta).

**Pendiente para el paso 3:** seguir los gomets de delante en las dos vistas de una pareja en flancos (hoy cada vista de perfil sigue los gomets laterales de la pierna de la referencia) para usarlos en la calibración y como verdad.

## Cierre de la fase 6 (paso 7, 08-11-2026)

### Revisión de código

Revisado todo lo que añade la fase 6 desde la guía por voz (`git diff c5df271..`): núcleo 3D (correspondencias, calibración, puntos y ángulos 3D, vista del monigote, CSV 3D), esquema 6, colocación, protocolo, RTMPose y su worker, el worker de la calibración y la interfaz (`Calibrar3D`, `Panel3D`, `Monigote3D` y lo que los conecta). Una lectura independiente del código, con cada hallazgo comprobado antes de arreglarlo.

**Corregido:**

1. **Una estatura mal escrita dejaba la sesión sin poder abrirse:** «3», «350» o «1755» se guardaban como 3, 3,5 o 17,55 m y la lectura rechazaba la cabecera entera. Ahora la estatura se lee en cm o en m y solo vale de 1 a 2,5 m (si no, se dice y no se calcula: `estaturaEnMetros`), y `prepararGuardado` no guarda una fuera de lo que se lee.
2. **Una calibración degenerada** (nada triangulable, el ajuste divergió) se guardaba con el error NaN y tampoco dejaba abrir la sesión. Ahora `calibrar3D` solo devuelve una calibración que pasa su propia validación; si no, «no converge» con qué revisar.
3. **El consejo para enderezar el móvil iba al revés** (en la sala y en la guía de la B1): con la gravedad inclinada hacia la derecha de la imagen el móvil está girado en sentido horario y se endereza en el contrario. Test cambiado a propósito.
4. **La rejilla del suelo del monigote** se medía con todos los puntos de la toma: un punto mal triangulado muy lejos la disparaba a miles de líneas por frame. Ahora sale del percentil 98 de la persona y de las cámaras, con 40 líneas por lado como mucho.
5. **La calibración no se enteraba de un cambio de sincronía** (las correspondencias dependen del desfase): ahora guarda el desfase de cada vista y, si cambia, «La sincronía ha cambiado desde la calibración: vuelve a calibrar».
6. En la CI, la suite e2e entera tiene el límite de `--test-timeout` (era de 10 min y, con RTMPose en la CPU de la CI, no cabía): sube a 30 min, y el vídeo de RTMPose pasa a medio segundo. Las pruebas que leen IndexedDB sondean a mano (con una función `async`, `waitForFunction` no esperaba).

**Revisado sin fallos:** los signos de las vistas virtuales y de los transversales (rumbo = z × (der − izq), perfil a la derecha y a la izquierda, frente desde delante, todo contra `aCanonico`); el instante de B (t_A + desfase_A − desfase_B) y que nunca se interpola a través de un hueco o un salto; el filtro 3D por tramos; las columnas y celdas vacías del CSV 3D; la proyección del monigote y la pirámide de cada cámara; la migración 5 → 6 y su validación; el campo opcional del protocolo; el preprocesado de RTMPose (relleno, recorte, SimCC, índices de Halpe26); que el 3D no se rehace con cada lote mientras se sigue o se detecta.

### Limitaciones conocidas

1. **Todo el 3D está probado solo con datos sintéticos** (por acuerdo con el usuario): la vertical del acelerómetro de cada móvil, la focal estimada, el error por punto entre flancos, la escala por la estatura y los ángulos 3D frente a un goniómetro quedan **pendientes de validar con vídeos** (la B1 simplificada, al final del proyecto).
2. **La focal sale mal determinada con la persona sola** si se mueve poco (ver el paso 2): afecta poco a los ángulos y más a las longitudes. Si la B1 lo confirma, fijar la focal de cada móvil una vez.
3. **Un desvío del detector a lo largo de la línea epipolar no se ve en el error de reproyección** (paso 3): el error por punto solo comprueba la mitad; la otra mitad, la constancia de los segmentos en 3D, no está todavía en la interfaz.
4. **Los ceros de los ángulos 3D no se guardan** con la sesión (se pierden al recargar o al añadir una vista), ni hay comparación 2D frente a 3D de la misma articulación.
5. **Los sensores leídos del MP4 al calibrar** (un vídeo abierto con «Cargar vídeo») no se guardan con la vista: se vuelven a leer en cada calibración.
6. **El tronco sagital en 3D** usa la cadera y el hombro derechos (como el 2D de perfil de la pierna derecha): sin un punto de ese lado no hay valor aunque estén los del otro.
7. **La triangulación de toda la toma va en el hilo principal** (en el panel 3D): con 5 min de vídeo puede tardar alrededor de un segundo cada vez que cambian las trayectorias.
8. **El asistente de colocación está a medias** (paso 6): falta la persona entera en las dos imágenes, la distancia por el pitido antes de grabar, la altura de cada cámara y el ángulo entre los móviles.
9. **RTMPose es un experimento** (`?rtmpose`): sin probar en el móvil (velocidad con WebGPU en el worker, umbral de calidad) ni frente a MediaPipe con vídeos de dos flancos.
10. **La rotación de cadera y de rodilla y la anteversión de la pelvis no se calculan** (dos puntos por segmento): es la fase 7.

## Primera toma real (08-11-2026)

El usuario grabó la toma simplificada con dos móviles distintos: en vertical, a 1 m de alto los dos, 1,91 m entre ellos (cinta) y la persona a 2,15 m de cada uno (ángulo real ≈ 52,7°), 60 s con la guía por voz, sin gomets; persona de 1,68 m. Antes, dos arreglos de esa misma sesión: los dos móviles de perfil pitaban a la vez (PR #102) y la comprobación por voz del encuadre (PR #101).

| | Calibración | Medido |
|---|---|---|
| Sincronía | pitido, −13 ms | — |
| Error de reproyección mediano | 2,96 px (51 % bajo 3 px) | — |
| Error por punto | hombros 1,1–1,3 px, cadera derecha 1,6, cadera izquierda 2,8; el peor, talón y tobillo izquierdos ~5,7 | — |
| Ángulo entre móviles | 51,8° | ≈ 52,7° |
| Focal (campo sobre el lado largo) | 1801 y 1812 px (56,1° y 55,8°) | — |
| Corrección de la vertical del acelerómetro | 1,36° y 0,98° | — |
| Altura de las cámaras (escala por la cinta) | 1,07 y 0,99 m | 1,00 y 1,00 m |
| Distancia entre móviles por la estatura (sin cinta) | 1,94 m | 1,91 m |
| Distancia por el pitido | 1,68 m | 1,91 m |
| Muslo del esqueleto (escala por la cinta) | 39 cm (1786 de 1788 frames, error mediano 6,5 px) | ~41 cm por Winter con 1,68 m |

**Lo que dice:** lo angular (el ángulo entre las cámaras, la vertical, la focal de los dos móviles por separado casi igual) sale muy bien; lo que va en metros, a un ~5 % y unos cm (el suelo por los pies del detector). **La cadera, el riesgo principal, casa entre flancos** en la dirección que se puede comprobar (ver el paso 3: la otra mitad, la constancia de los segmentos). La escala por la estatura y la cinta coinciden a un 1,6 %. **La distancia por el pitido no sirve para comprobar la escala** (1 ms de latencia de salida mal declarada son 34 cm): el aviso pasa de un 10 % a medio metro. El muslo del esqueleto sale un 5 % corto: MediaPipe pone la cadera algo baja o son las proporciones de la persona; con una sola toma no se separa.

## RTMPose (experimento, `?rtmpose`)

**Por qué:** MediaPipe Pose estima centros articulares con un modelo pensado para el móvil en directo; la cadera, sobre todo, cambia con el punto de vista. RTMPose (OpenMMLab, Apache 2.0) es «de arriba abajo»: un detector de personas (RTMDet-nano) da la caja y RTMPose busca 26 puntos (Halpe26: cuerpo y pies, con talón y dedo gordo) en un recorte de 192 × 256. En las comparativas públicas es más preciso que MediaPipe en COCO y Halpe, y sigue siendo ligero. RTMW (133 puntos, cuerpo entero con manos y cara) no compensa aquí: más pesado y los puntos de más no se usan.

**Cómo quedó (PR del 08-11):** `core/pose/rtmpose.ts` (con tests: escala del detector, cajas, elegir la persona de frame en frame por solape con la anterior, recorte agrandado un 25 % a 3:4, decodificación SimCC, de Halpe26 a los 12 puntos de la app, tensor CHW en RGB o BGR) y `workers/rtmpose.worker.ts`, con el **mismo protocolo** que el de MediaPipe: el visor no distingue uno de otro. ONNX Runtime Web 1.23.2 (variante sin el cargador empaquetado, `ort.webgpu.min.mjs`, con el WASM «jsep» copiado por Vite con `?url`: la empaquetada fallaba dentro del worker de Vite), WebGPU si el navegador lo da en el worker y si no WASM en CPU con un hilo (sin COOP/COEP no hay hilos). Los modelos se alojan en el sitio (`public/modelos/`, con el hash del original en el nombre): detector 4 MB, RTMPose-s 23 MB y RTMPose-m 56 MB **en tres trozos de 20 MB** por el límite de 25 MiB por archivo de Cloudflare (se juntan en el worker). Los servidores de OpenMMLab no dan CORS, así que no se pueden bajar desde la app. Solo con `?rtmpose`, en el selector del modelo de «Marcar»: «RTMPose-s (experimental, 27 MB)» y «RTMPose-m (experimental, 60 MB)». La detección guarda la librería (`onnxruntime-web 1.23.2`) en lugar de la versión de MediaPipe. Sin cambio de esquema (el tamaño del modelo admite los dos valores nuevos).

**Prueba:** una e2e con una foto real de una persona (Pexels, licencia libre; `tests/e2e/fixtures/persona.jpg`) hecha vídeo de medio segundo: RTMPose-s en el navegador pone hombros, caderas, rodillas, tobillos y talones a menos de 6 px de lo que da el mismo modelo en Python (onnxruntime de escritorio, el preprocesado de MMPose), con calidad > 0,4. En Python, sobre la CPU de la nube, RTMPose-s tarda ~15 ms por persona y -m ~45 ms (más el detector, ~10 ms).

**Pendiente de validar con vídeos:** la velocidad en el móvil (WebGPU en el worker de Chrome Android) y que el umbral común de calidad (`CALIDAD_MINIMA`, 0,5) le sirva a su puntuación (no es una probabilidad); y lo importante: si marca el mismo punto desde los dos flancos mejor que MediaPipe (se mira con la B1 final). Si resulta mejor, se quita `?rtmpose` y pasa a ser una opción normal para el 3D.

## Riesgos

- **MediaPipe no marca el mismo punto desde dos flancos** (sobre todo la cadera, que se estima tras la ropa y cambia con el punto de vista). Es el riesgo principal: lo mira la B1 en el paso 3.
- **La focal mal determinada** con la persona sola si se mueve poco o siempre a la misma distancia. Por eso los pasos por la zona al principio; si no basta, la hoja A4 (§3).
- **El acelerómetro** con sesgo de fábrica de más de 1°: el ajuste de haces corrige la vertical con un peso; si es mucho, un paso de «poner el móvil en una superficie horizontal» para medirlo una vez.
- **El móvil se mueve** durante la toma (apoyo inestable): se detecta y se avisa; la toma vale para 2D.
- **El tiempo de cálculo** en el móvil: el ajuste de haces con unos cientos de instantes y 12 puntos son unos miles de incógnitas, resueltas por bloques (las de las cámaras son pocas): segundos. En un worker.
- **Que Mediabunny cambie** cómo escribe los metadatos: lo vigila la e2e (y queda la pista de subtítulos).

## Qué necesito del usuario

1. Revisar D1–D10 cuando quiera (se sigue con lo propuesto).
2. **Al final del proyecto** (cambio del 08-11): la B1 simplificada y mirar su informe con «Calibrar en 3D», con MediaPipe y con RTMPose.
