# Fase 8: extremidad superior y cabeza sin marcadores

Estado: **cerrada** (13-11-2026; ver «Cierre de la fase 8»). Plan del 13-11-2026, pedido por el usuario el 10-11 y el 13-11: «Extremidad superior y cabeza sin marcadores»). Las decisiones D1–D9 están escritas y se siguen con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md` (el usuario las revisa cuando quiera). Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

## Qué se quiere

Los dos modelos sin marcadores ya ven los brazos y la cabeza (MediaPipe da 33 puntos; RTMPose Halpe26, 26), pero la app solo guarda 12 (hombros, caderas, rodillas, tobillos, talones y puntas). Guardar **codos, muñecas y orejas** abre el hombro y el codo (en 2D, con sus límites, y en 3D con dos móviles), la postura de la cabeza, y prepara el centro de masas (ver «Ideas apuntadas» en `CLAUDE.md`), que sin brazos ni cabeza deja más de la mitad de la masa como un bloque.

## Decisiones

**D1 — Seis puntos más: codo, muñeca y oreja de cada lado.** Con los dos modelos: MediaPipe 13/14 (codos), 15/16 (muñecas), 7/8 (orejas); Halpe26 7/8, 9/10 y 3/4. La oreja (y no la nariz ni el «cuello» de Halpe26) porque los dos modelos la tienen, tiene lado (como todos los demás puntos: nada cambia en cómo se guardan, se intercambian o se corrigen) y da las dos medidas habituales de la cabeza: de perfil, la oreja respecto al hombro (cabeza adelantada, como el ángulo craneovertebral pero con el hombro del modelo en lugar de C7) y de frente, la línea de las orejas (inclinación lateral). Las manos (dedos) no: los dos modelos las dan mal a cuerpo entero.

**D2 — Los puntos nuevos van al final.** `PUNTOS_POSE` pasa de 12 a 18, con los 12 de siempre primero y en el mismo orden: lo que manda el worker por frame (`[x, y, visibilidad]` por punto) solo crece por el final. Las trayectorias se guardan por id, así que una sesión de antes se abre igual (sin los puntos nuevos hasta que se vuelve a detectar) y **no sube el esquema**. Una vista sin marcadores guardada con los 12 gana los 6 al abrirla (su lista de marcadores se completa), para que una detección nueva los guarde.

**D3 — Calibrar en 3D y el esqueleto siguen con los 12 de siempre.** La calibración con la persona (fase 6) y el ajuste del esqueleto (fase 7) se validaron con esos puntos; muñecas y codos se mueven deprisa y los modelos los dan peor (se ocultan detrás del cuerpo de perfil). `PUNTOS_TRONCO_PIERNAS` es la lista fija que usan los dos. Los puntos nuevos sí se triangulan para los ángulos 3D (paso 3).

**D4 — Ángulos 2D de perfil (el lado de la cámara), como los de los gomets.** El catálogo de gomets ya tenía el hombro y el codo de perfil (`hombro_sagital_*`, `codo_sagital_*`, con acromion, epicóndilo y estiloides): los sin marcadores son los mismos con los puntos del modelo (`comoLaDeGomets`) y su equivalente para compararlos (`equivalenteGomets`). Hombro: tronco (hombro → cadera) y brazo (hombro → codo); flexión (brazo hacia delante) +. Codo: brazo y antebrazo (codo → muñeca); flexión +. **Cabeza**: del hombro a la oreja respecto a la vertical, como el tronco: hacia delante +, de pie con la cabeza erguida cerca de 0° (unos grados hacia delante según la persona: se mira relativo al cero). Fijados por `pose/catalogo.test.ts`.

**D5 — Ángulos 2D de frente.** **Hombro** de cada lado (abducción-aducción): el tronco del mismo lado (hombro → cadera) y el brazo; 0° con el brazo colgando, abducción (el codo hacia fuera) +, con el mismo signo por lado que la cadera de los gomets (izquierda +1, derecha −1). **Cabeza** (inclinación lateral): la línea de las orejas (derecha → izquierda) respecto a la horizontal; hacia la izquierda de la persona (la oreja izquierda más baja) +, como el tronco de frente. El codo de frente no se mide: su flexión sale del plano en cuanto el brazo no cuelga.

**D6 — Lo que el 2D no puede.** El hombro es la articulación que más sale del plano: la flexión de perfil solo vale con el brazo moviéndose hacia delante (una abducción se ve como flexión pequeña), y la abducción de frente solo con el brazo de lado. El codo de perfil, igual: con el brazo girado, la flexión se acorta. Se dice en el glosario («Hombro y codo en 2D») y en las limitaciones. En 3D (paso 3) el codo es el ángulo real entre brazo y antebrazo y el hombro, la elevación del brazo respecto al tronco.

**D7 — Intercambios de lado.** Los puntos nuevos se intercambian con los demás (de frente, todo el cuerpo según las caderas; de perfil, lo que intercambie `corregirCambiosDeLado`, que ya movía los hombros con las piernas). No pasan a dudosos (eso es de las piernas que se cruzan). **Pendiente de validar con vídeos** que de perfil los brazos no se intercambien solos.

**D8 — Interfaz.** Nada nuevo que tocar: las articulaciones nuevas salen en el selector («Hombro», «Codo», «Cabeza»), en la gráfica, en el CSV (todas las del plano) y en el 3D. El esqueleto sobre el vídeo dibuja los brazos y la cabeza (hombro–codo–muñeca y hombro–oreja); se marcan a ojo los puntos de la articulación que se mira, como los demás. Glosario: «Hombro y codo en 2D» y «Cabeza (postura)», con sus iconos.

**D9 — Verdad conocida.** Tests del catálogo con posturas de valor conocido (brazo a 90° de flexión, codo a 90°, cabeza 15° adelante, abducción de 90°, inclinación de 10°) de perfil a los dos lados y de frente desde delante y desde detrás. En las e2e, el worker falso manda los brazos y las orejas de una postura conocida y se comprueba el valor del codo en la gráfica.

## Orden de trabajo (un PR por paso)

| Paso | Contenido |
|---|---|
| 1 | Núcleo: los 6 puntos (MediaPipe y Halpe26), catálogo 2D de perfil y de frente con tests, los 12 fijos para calibrar y el esqueleto, el esqueleto dibujado con brazos y cabeza, las vistas guardadas completadas, glosario, e2e |
| 2 | 3D: los puntos nuevos triangulados; el codo como ángulo 3D entre brazo y antebrazo, la elevación del brazo y las proyecciones del catálogo; el monigote con brazos y cabeza |
| 3 | Cierre: revisión de código y limitaciones |

Más adelante (sin paso asignado): brazos en el esqueleto de la fase 7 (hombro esférico y codo bisagra) y el centro de masas.

## Hecho

**Paso 1 (13-11):** `core/pose/puntos.ts` guarda 18 puntos (los 12 de siempre primero; codos, muñecas y orejas detrás, con sus índices de MediaPipe y de Halpe26) y `PUNTOS_TRONCO_PIERNAS`, los 12 con los que se calibra y se ajusta el esqueleto. `core/pose/catalogo.ts`: de perfil, hombro y codo como los de los gomets (con su equivalente para compararlos) y la cabeza; de frente, el hombro de cada lado y la cabeza; `completarPuntosPose` para las vistas guardadas con los 12. El esqueleto sobre el vídeo dibuja brazos y cabeza. Glosario «Hombro, codo y cabeza sin marcadores». e2e: el worker falso manda brazos y orejas y se comprueban el hombro, el codo y la cabeza de perfil y de frente.

**Paso 2 (13-11):** se triangulan los 18 puntos (`IDS_3D`); el hombro (flexión y abducción) y la cabeza salen en las vistas virtuales de la pelvis, como los demás; el codo y la elevación del brazo, como ángulos reales entre segmentos (grupo «Entre segmentos» del selector 3D), con tests de posturas de verdad conocida (`angulos3d.test.ts`). El esqueleto recibe solo los 12 del tronco y las piernas, y su huella se calcula con ellos (un esqueleto guardado antes sigue valiendo). El monigote dibuja brazos y cabeza.

## Cierre de la fase 8 (paso 3, 13-11-2026)

**Revisión de código.** Los puntos nuevos van detrás de los de siempre en todo lo que viaja por posición (el protocolo de los workers, `FramePose`), y por id en lo guardado: nada de antes cambia de sitio. Lo que dependía de la lista de puntos (`intercambiar`, el dibujo, `marcadoresSinMarcadores`) los toma solos; lo que no debe (calibrar en 3D, el esqueleto y su huella) usa `PUNTOS_TRONCO_PIERNAS` explícitamente. Las tablas por parte (`NOMBRE_PARTE`, `NOMBRE_PUNTO`, los índices) son `Record<ParteCuerpo, …>`: el compilador obliga a completarlas. La persona 3D de las e2e no tiene brazos: sus puntos van sin ver (calidad 0), y la e2e comprueba que el codo 3D sale «—», nunca 0.

**Limitaciones conocidas.**
1. **Hombro en 2D**: sale del plano de la cámara en cuanto el brazo no se mueve en él (de perfil, una abducción parece una flexión pequeña; de frente, al revés). Se dice en el glosario; la medida buena es la 3D.
2. **Codo en 3D sin signo**: el ángulo entre brazo y antebrazo va de 0 a 180°; una hiperextensión sale como una flexión pequeña.
3. **Cabeza por la oreja**: el ángulo de la cabeza usa el hombro y la oreja del modelo, no C7 y el trago: se compara relativo al cero, no con valores de la literatura.
4. **Brazos fuera del esqueleto** de la fase 7 (no hay hombro esférico ni codo bisagra) y del centro de masas (ver «Ideas apuntadas»).
5. **Pendiente de validar con vídeos**: la visibilidad real de codos y muñecas (de perfil, el brazo lejano queda detrás del cuerpo), que los brazos no se intercambien solos de perfil, y la oreja de RTMPose frente a la de MediaPipe.
