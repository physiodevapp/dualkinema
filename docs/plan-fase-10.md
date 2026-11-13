# Fase 10: cervical (orientación de la cabeza)

Estado: **en marcha** (plan del 13-11-2026, pedido por el usuario el 13-11: «rotaciones cervicales a rango completo»; propuesta de usar el modelo de cara de orbicula). Decisiones D1–D10 escritas y seguidas con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md`. Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

## Qué se quiere

Medir la movilidad cervical en sus tres planos (rotación, flexo-extensión e inclinación lateral) **a rango completo**. Con el modelo de cuerpo (fase 8) solo hay dos puntos de la cabeza (las orejas): en 2D no hay rotación, y en 3D la rotación se pierde hacia los 45–60°, cuando cada oreja queda de cara a una sola cámara y el modelo se inventa la otra. **Face Landmarker** (MediaPipe, el mismo paquete que ya usa la app; 478 puntos de la cara, el que usa orbicula para los párpados) da en cada frame la orientación de la cabeza respecto a la cámara con la cara entera.

## Decisiones

**D1 — Nada sale del dispositivo, tampoco el registro de uso de MediaPipe.** `@mediapipe/tasks-vision` intenta mandar un registro de uso a `https://odml.pa.googleapis.com/v1/log` (comprobado en la 1.1.0: la dirección está en `vision_bundle`; orbicula lo bloquea). No son imágenes ni datos del paciente, pero choca con la regla de que solo viaja lo del relé. Dos barreras, como en orbicula: (1) en el código, una **barrera de red** puesta antes de cargar MediaPipe en cada worker que lo usa (`fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` a otro origen se bloquean, salvo una lista blanca: el modelo *heavy* de `storage.googleapis.com`), con lo bloqueado contado; (2) en `public/_headers`, una **CSP** con `connect-src` limitado al propio sitio, el relé de salas, el modelo *heavy* y lo que use la app. Va en el paso 1, antes de todo lo demás.

**D2 — Dos caminos según la toma.**
- **De cuerpo entero (marcha, sentadilla…), con dos móviles:** la cabeza respecto al tronco con el modelo de cuerpo, **la línea de las orejas respecto a la de los hombros vista desde arriba** (como la rotación del tronco respecto a la pelvis). En esos gestos la cabeza gira poco (±10–15°) y las dos orejas se ven; se marca poco fiable si alguna oreja no tiene 3D. Face Landmarker no sirve ahí: a 3–4 m la cara ocupa unas decenas de píxeles.
- **De cerca, el modo «Cervical»:** sentado, con la cabeza y los hombros en el encuadre, a 0,6–1,5 m; Face Landmarker en cada vídeo.

**D3 — La orientación de la cabeza sale de la matriz de Face Landmarker** (`outputFacialTransformationMatrixes`: el giro y la posición de la cara canónica en el marco de la cámara), no de puntos sueltos: usa toda la malla y ya resuelve la perspectiva. El núcleo la pasa a una matriz de giro (`core/cervical/`) y no depende de MediaPipe (los tests usan giros sintéticos).

**D4 — Ángulos cervicales como secuencia de giros respecto a la posición neutra.** El cero es la orientación media de la cabeza en un tramo quieto elegido (como el cero de siempre: «Primeros 2 s», «Aquí ± 0,2 s»…); cada frame se expresa respecto a él (R₀ᵀ·R) y se descompone en **rotación** (alrededor del eje vertical de la cabeza), **flexo-extensión** y **inclinación lateral**, en ese orden (el habitual en cervical: el más grande primero). Convenciones fijadas por tests: rotación a la izquierda +, flexión +, inclinación a la izquierda + (como el tronco de frente). Sin cero no hay ángulos cervicales (respecto a la cámara no son clínicos): se pone solo con los primeros 2 s al detectar, y se puede cambiar.

**D5 — Cabeza respecto al tronco.** Lo que da la matriz es la cabeza respecto a la cámara: con la persona **sentada, con la espalda apoyada**, el tronco apenas se mueve y vale como cervical. De frente, los hombros no dicen cuánto gira el tronco (solo se ve su anchura aparente), así que no se descuenta: se pide en la guía de la toma y se dice en el glosario. (Con dos móviles de cuerpo entero, la cabeza respecto al tronco en 3D sí descuenta los hombros: D2.)

**D6 — Un móvil o dos.** Con uno, delante: hasta unos ±60° de giro (más allá la cara sale de perfil y el detector la pierde: queda sin valor, nunca se inventa). **Con dos, delante en diagonal (a unos ±45° del frente), el rango completo:** al girar hacia un móvil, ese la ve cada vez más de frente. Las dos orientaciones se pasan a un marco común con **el giro entre los dos móviles, sacado de la propia cara** (la misma cabeza vista desde los dos a la vez: R₁₂ = R_A·R_Bᵀ, promediado en los frames que ven los dos), sin calibrar con el cuerpo entero (de cerca no se ven las piernas). En cada frame manda el móvil que ve la cara más de frente; donde los dos la ven bien, la media.

**D7 — Calidad.** Cada frame lleva una calidad: si hay cara, lo de frente que se ve (1 de frente, 0 de perfil, desde la propia matriz) y si el modelo la sigue sin saltos. Por debajo del umbral, sin valor. Se filtra como todo (Butterworth por tramos, nunca a través de un hueco).

**D8 — Lo que se da.** Las tres curvas en el tiempo, el valor en el cursor, **el rango a cada lado** (máximo a la izquierda y a la derecha de cada plano en la toma o en un tramo) con **su asimetría**, y el CSV. Glosario: «Cervical: orientación de la cabeza»; la cabeza respecto al tronco en 3D va en «Ángulos en 3D» y la barrera de red en «Dónde se guardan los datos».

**D9 — Persistencia.** La detección de la cara (la matriz de giro y la calidad por frame, en arrays tipados) se guarda con la vista, opcional y sin subir el esquema; el cero, como los demás. Lo ilegible se descarta.

**D10 — Verdad conocida.** Tests del núcleo con giros sintéticos de valor conocido (cada plano por separado y combinados, con ruido), la fusión de dos cámaras con su giro relativo conocido y la cabeza respecto al tronco. e2e con un worker de cara falso (como el sin marcadores) que manda matrices de verdad. El modelo de verdad, con una foto, como en la fase 5. **Pendiente de validar con vídeos**: los extremos del recorrido frente a un goniómetro o un inclinómetro, y la distancia máxima a la que el detector sigue la cara.

## Orden de trabajo (un PR por paso)

| Paso | Contenido |
|---|---|
| 1 | La barrera de red (D1); la cabeza respecto al tronco en 3D con el modelo de cuerpo (D2); el núcleo cervical (`core/cervical/`: de matriz a ángulos respecto al cero, calidad, cabeza respecto al tronco, giro entre dos cámaras y fusión) con tests |
| 2 | El worker de la cara (Face Landmarker, modelo alojado en el sitio) y el modo «Cervical» con un móvil: detectar, curvas, cero, rangos y asimetría, CSV, glosario, guardado; e2e |
| 3 | Dos móviles: el giro entre ellos desde la cara y la fusión; e2e |
| 4 | Cierre: revisión y limitaciones |

## Hecho

**Paso 1 (13-11):**
- **Barrera de red** (`src/privacidad/`): `instalarBarreraRed` cambia `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` y `EventSource` por versiones que solo dejan el propio sitio, `data:`, `blob:` y el modelo *heavy*; se importa lo primero en los workers de MediaPipe y de RTMPose (`instalar.ts`). Comprobado con el modelo de verdad en Chromium: MediaPipe intenta llamar a `odml.pa.googleapis.com`, la barrera lo bloquea (aviso en la consola, solo el host) y la detección sigue igual. **CSP** `connect-src` en `public/_headers` (y en `vite.config.ts`, con el relé local de las e2e).
- **Cabeza respecto al tronco en 3D** (`3d_cabeza_transversal` en `angulos3d.ts`): la línea de las orejas respecto a la de los hombros, vista desde arriba; test con giros de 0 a 85°.
- **Núcleo cervical** (`core/cervical/orientacion.ts`): de la matriz de Face Landmarker (por columnas, sin escala ni traslación) al giro, los ángulos cervicales respecto al neutro (rotación → flexo-extensión → inclinación, convenciones fijadas por los tests), lo de frente que se ve la cara, el giro medio (cuaterniones), el giro entre dos cámaras sacado de la cara y la fusión. Test: dos cámaras a ±45° que ven la cara hasta 60° cada una cubren juntas de −100° a +100°.
- **Pendiente de validar con vídeos (y con una foto en el paso 2):** que los ejes de la cara canónica de Face Landmarker sean los supuestos (x a la izquierda de la persona, y arriba, z hacia delante) y que su matriz venga por columnas: si no, cambian los signos, y lo dirá la e2e con el modelo de verdad.
