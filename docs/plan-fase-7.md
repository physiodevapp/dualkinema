# Fase 7: todas las articulaciones en los tres planos (esqueleto ajustado)

Estado: **cerrada** (08-11-2026; ver «Cierre de la fase 7»). Plan propuesto el 08-11-2026, con las decisiones D1–D10 escritas y seguido con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md` (el usuario las revisa cuando quiera). Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

## Qué se quiere

Con dos móviles calibrados (fase 6), los ángulos 3D salen de puntos sueltos: con dos puntos por segmento no hay rotación axial (la rotación de cadera y de rodilla no se calcula), la pelvis solo da oblicuidad y rotación, y un punto que ve una sola cámara no tiene 3D. La fase 7 ajusta **un esqueleto con articulaciones restringidas** (pelvis libre, cadera esférica, rodilla bisagra, tobillo de dos ejes, tronco esférico sobre la pelvis) a lo que ven las dos cámaras en cada frame, como hace OpenCap con OpenSim, pero todo en el navegador. Lo que la articulación no deja hacer (una rodilla que se dobla de lado) no aparece; lo que no se ve directamente (la rotación del muslo) se **infiere** de cómo se mueven los segmentos unidos.

## Idea en una página

1. **Modelo**: cadena cinemática de miembro inferior y tronco con 21 grados de libertad (D1), con las longitudes de cada segmento escaladas a la persona con lo que da la propia toma (D2).
2. **Ajuste** frame a frame (cinemática inversa, D3) **directamente sobre lo que ve cada cámara** (los puntos 2D de las dos vistas reproyectados), no sobre los puntos 3D triangulados: así cuenta también lo que ve una sola cámara y el ruido de cada vista pesa lo que debe. Levenberg–Marquardt con arranque en el frame anterior, pesos por calidad y límites articulares suaves.
3. **Ángulos** con el sistema de coordenadas articulares (Grood y Suntay; recomendaciones de la ISB): cadera en tres ejes, rodilla, tobillo, pelvis respecto al laboratorio y tronco respecto a la pelvis (D5), cada uno con un **indicador de confianza** donde el ajuste no lo determina bien (D4).
4. **Interfaz**: en el panel 3D, la fuente «Esqueleto» junto a «Puntos»; el monigote dibuja el esqueleto ajustado; el CSV lleva los ángulos del esqueleto (D8).

## Decisiones

**D1 — Modelo de 21 grados de libertad.** Pelvis: 6 (posición y orientación). Cada cadera: 3 (flexión, abducción, rotación). Cada rodilla: 1 (flexión; la rodilla real tiene algo de rotación y desplazamiento, pero no se ven con estos puntos). Cada tobillo: 2 (flexión dorsal-plantar y una inclinación que recoge la subastragalina y la rotación del pie respecto a la pierna). Tronco sobre la pelvis: 3. Puntos del modelo: centros de cadera, rodilla y tobillo, talón y punta de cada pie, y hombros (con el ancho de hombros); con gomets, además, sus posiciones en el segmento (D9).

**D2 — Longitudes de la propia toma.** Muslo, pierna, pie, ancho de caderas, alto y ancho del tronco: la mediana de su longitud 3D en los frames buenos (los puntos triangulados de la fase 6, con error de reproyección bajo), simétricas (media de los dos lados, salvo que difieran más de un 5 %, que se avisa). Sin escala, en las unidades de la calibración (los ángulos no la necesitan). Alternativa descartada: proporciones de Winter por la estatura (dan la forma media, no la de esta persona).

**D3 — Cinemática inversa sobre las dos vistas.** Por frame, minimizar Σ w·‖proyección del punto del modelo − punto 2D detectado‖² en las dos cámaras, con w = calidad del punto (y 0 sin él), pérdida de Huber (3 px) para lo mal detectado, más términos suaves: límites articulares (penalización fuera del rango fisiológico), y una atracción débil a la postura del frame anterior (continuidad, que se apaga si el frame anterior falta). Levenberg–Marquardt con jacobiano numérico por bloques (21 incógnitas, ~48 residuos: unos milisegundos por frame en un worker). Arranque del primer frame con la pelvis puesta por los tres puntos (caderas y punto medio de hombros) y el resto por geometría. Después, los ángulos se filtran con el filtro de la sesión por tramos (como en 2D: nunca a través de un hueco; un frame sin ajuste es un hueco).

**D4 — Lo que el ajuste no determina se dice.** La rotación de la cadera solo se ve cuando la rodilla está doblada (con la pierna recta, girar el muslo no mueve ningún punto): con la rodilla por debajo de ~20° de flexión, la rotación de cadera se marca como poco fiable (se pinta tenue y va aparte en el CSV) y el ajuste la mantiene cerca de la del frame anterior. La anteversión de la pelvis no se separa de la flexión del tronco con estos puntos: el tronco queda referido a la pelvis con la anteversión fija en la de la postura de pie (se dice).

**D5 — Ángulos con el sistema de coordenadas articulares (ISB).** Cadera: flexión-extensión, abducción-aducción, rotación interna-externa del muslo respecto a la pelvis (Grood y Suntay). Rodilla: flexión. Tobillo: flexión dorsal-plantar e inversión-eversión aproximada. Pelvis respecto al laboratorio: oblicuidad y rotación (y la anteversión fija, D4). Tronco respecto a la pelvis: flexión, inclinación lateral y rotación. Signos como en 2D donde hay equivalente (flexión +, valgo +…), fijados por `catalogoEsqueleto.test.ts`.

**D6 — Persona sintética con rotaciones.** La de la fase 6 solo mueve las piernas en su plano. Se amplía con rotación y abducción de cadera, inclinación lateral de la pelvis y rotación del tronco con ángulos de verdad conocidos, proyectada en las dos cámaras virtuales, con ruido de 2 px, puntos mal detectados y puntos que ve una sola cámara. Es la verdad de todos los tests de la fase.

**D7 — Mismo ruido, mejor ángulo.** El criterio de que el esqueleto merece la pena: con la persona sintética y ruido, los ángulos sagitales y frontales del esqueleto deben salir al menos tan bien como los de los puntos de la fase 6, y la rotación de cadera, dentro de ±5° con la rodilla doblada. Si no, se ajusta D3 antes de seguir.

**D8 — Interfaz.** En el panel 3D, un selector de fuente «Puntos» / «Esqueleto» (por defecto el esqueleto cuando está ajustado); «Ajustar el esqueleto» con progreso y «Cancelar» en un worker; las articulaciones del esqueleto en el selector, con su confianza; el monigote dibuja los segmentos del esqueleto (y, en tenue, los puntos detectados); el CSV lleva los ángulos del esqueleto con la columna de confianza. Glosario: «Esqueleto ajustado», «Sistema de coordenadas articulares», «Por qué la rotación de cadera solo con la rodilla doblada».

**D9 — Gomets como puntos del modelo.** Si una vista tiene gomets (mitad del muslo, centro de la rodilla, centro del tobillo), entran en el ajuste como puntos del segmento con su peso (más que los del modelo sin marcadores: son el mismo punto para las dos cámaras). No hace falta llevarlos.

**D10 — Persistencia.** Se guarda en la sesión lo que hace falta para rehacer el ajuste (las longitudes de los segmentos y los ajustes del ajuste), no el resultado: se rehace al abrir en un worker (segundos). Esquema 7 con su migración vacía.

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Núcleo del esqueleto** (`core/esqueleto/`): modelo de 21 GDL, cinemática directa, ángulos con el sistema de coordenadas articulares; la persona sintética con rotaciones. Tests de valor conocido | Opus |
| 2 | **Longitudes** de la toma y su simetría; **cinemática inversa** sobre las dos vistas con límites y continuidad. Tests: verdad recuperada con ruido, oclusiones y puntos de una sola cámara (D7) | Opus |
| 3 | **Integración**: worker, «Ajustar el esqueleto», fuente en el panel 3D, monigote, CSV, glosario, esquema 7. e2e con la persona sintética | Opus |
| 4 | Cierre: revisión de código, documentación y limitaciones | Opus |

## Hecho

**Pasos 1 a 3 (08-11):**

- `core/esqueleto/modelo.ts`: los 21 grados de libertad y la cinemática directa (`puntosDePostura`), con los giros de cada articulación en la secuencia del sistema de coordenadas articulares: los ángulos clínicos son los propios parámetros. `modelo.test.ts` fija cada signo (flexión, abducción y rotación interna de las dos caderas, rodilla, tobillo, progresión del pie, oblicuidad y rumbo de la pelvis, tronco) y comprueba que **la persona sintética de la fase 6 es exactamente una postura del esqueleto** (mismas convenciones en los dos núcleos).
- `core/esqueleto/sintetico.ts` (D6): la persona sintética con rotación y abducción de cadera, oblicuidad, progresión de los pies y rotación e inclinación del tronco, generada con el propio esqueleto.
- `core/esqueleto/ajuste.ts`: las medidas de la toma (`medidasDeLaToma`, con la asimetría de cada segmento) y la cinemática inversa sobre las dos vistas (`ajustarFrame`: Levenberg–Marquardt con jacobiano numérico, Huber a 3 px, límites articulares, continuidad con el frame anterior, la anteversión fija y la rotación de cadera sujeta con la rodilla por debajo de 20°). Con la persona sintética, sin ruido sale la postura de verdad; con 2 px de ruido, frame a frame y sin filtrar, los sagitales y frontales con un error cuadrático medio por debajo de 1,6° y la rotación de cadera por debajo de 3° con la rodilla doblada más de 35°; una rodilla que una cámara no ve sigue saliendo (cuenta lo que ve la otra). Converge despacio con el jacobiano numérico (hasta 150 iteraciones, unos 20–30 ms por frame).
- `core/esqueleto/sesion.ts`: toda la toma (`ajustarSesion`, con B en el instante común sin cruzar huecos, arrancando de nuevo tras un hueco), del marco del laboratorio al de la calibración (`deMarco`, el contrario de `enMarco`), las articulaciones del esqueleto (`ARTICULACIONES_ESQUELETO`) y su serie filtrada por tramos (`serieEsqueleto`, con `fiable` para la rotación de cadera). Test de la cadena entera con la persona sintética con rotaciones: calibrar con la propia persona, triangular, ajustar y filtrar da las rodillas y las caderas a menos de 2,5° y la rotación de cadera a menos de 4° con la rodilla doblada.
- Interfaz: el worker `workers/esqueleto.worker.ts`; en el panel 3D, la fuente «Puntos» / «Esqueleto», «Ajustar el esqueleto» con progreso y «Parar», el resumen (frames ajustados, error mediano, la longitud del muslo y un aviso si las piernas miden distinto), las articulaciones del esqueleto en el selector, lo poco fiable tenue y a trazos en la gráfica y dicho junto al valor, el monigote con el esqueleto ajustado y el CSV con sus columnas (y `_fiable` para la rotación de cadera). Glosario: «Esqueleto ajustado» (con por qué la rotación de cadera solo con la rodilla doblada). e2e con la persona sintética de la fase 6.
- **D10 cambia:** el ajuste no se guarda ni se rehace solo al abrir (tardaría decenas de segundos con unos minutos de vídeo): se pide con el botón. Sin esquema 7.
- **Pendiente:** los gomets como puntos del modelo (D9) y los ceros de los ángulos del esqueleto guardados con la sesión.

## Cierre de la fase 7 (paso 4, 08-11-2026)

### Revisión de código

Una lectura independiente de lo que añade la fase 7 (`git diff 4c4265d..`), con cada hallazgo comprobado antes de arreglarlo.

**Corregido:**

1. **Un segmento que no se veía recibía ángulos inventados.** El ajuste solo rechazaba un frame con menos de 6 puntos en total; un grado de libertad sin sus puntos a la vista se quedaba en el valor de partida (0 tras un hueco, o el del frame anterior por la continuidad) y salía como un ángulo de verdad, en la gráfica y en el CSV (comprobado: la pierna izquierda oculta en las dos vistas daba rodilla y cadera izquierdas a 0° con error de reproyección 0). Ahora cada frame guarda en cuántas vistas se vio cada punto y un ángulo solo tiene valor si todos sus puntos se ven al menos en una y alguno en las dos (`necesita` de cada articulación); si no, NaN. Test nuevo.
2. **La anteversión estaba fija en 0, no «sujeta a lo anterior»** como decía el comentario: es lo que se quiere (gira alrededor de la línea de las caderas, no se ve), pero quiere decir que la flexión de la cadera y la del tronco son en la práctica respecto a la vertical. Dicho en el código, el glosario y aquí.
3. **Cambiar el corte del filtro tiraba un ajuste** que puede costar minutos (el ajuste dependía del objeto de los puntos ya filtrados). Ahora depende de los puntos sin filtrar; los ángulos se vuelven a filtrar con el corte nuevo.
4. **La pérdida de Huber no era la de Huber** (por encima del umbral el coste era H·n en lugar de 2·H·n − H²: la pendiente saltaba a la mitad). Corregida.
5. El comentario del modelo decía que todas las articulaciones siguen la secuencia flexión–abducción–rotación: el tobillo gira primero alrededor de la pierna. Corregido el comentario.
6. Con la fuente «Esqueleto», un frame sin ajuste dejaba el monigote vacío: ahora enseña los puntos triangulados.

**Revisado sin fallos:** los signos del modelo (Rodrigues a derechas: pelvis, caderas de los dos lados, rodilla, tobillo, tronco), que cadera y tronco son Y–X–Z intrínsecos (como Grood y Suntay), `deMarco` como inversa exacta de `enMarco` (numéricamente, con y sin escala ni marco), el rumbo de arranque, las unidades del previo de continuidad, el bucle de Levenberg–Marquardt, el reinicio tras un hueco y el filtrado por tramos sin cruzar huecos, el ciclo de vida del worker y las columnas del CSV.

### Limitaciones conocidas

1. **Probado solo con datos sintéticos** (el acuerdo del proyecto): la validación con la toma de dos móviles queda para el final.
2. **La anteversión de la pelvis no se mide** (fija en 0) y la rotación de cadera solo con la rodilla doblada (por debajo de 20°, sujeta a la anterior y marcada como poco fiable).
3. **Converge despacio** (jacobiano numérico, hasta 150 iteraciones: 20–30 ms por frame): unos minutos de vídeo son decenas de segundos en el worker. Un jacobiano analítico lo aceleraría.
4. **El ajuste no se guarda** con la sesión (se pide con el botón al abrirla) ni sus ceros; los gomets todavía no entran como puntos del modelo (D9).
5. **Las medidas de la persona** salen de la mediana de los puntos 3D de la toma: si el detector pone la cadera desplazada desde un lado, el muslo medido lo arrastra.

## Riesgos

- **El ruido real de MediaPipe** (≈ 3,5° frame a frame en 2D) con el esqueleto: el ajuste lo reparte entre las articulaciones y la continuidad lo suaviza, pero un punto mal detectado de forma sistemática (la cadera) desplaza la pelvis entera. Se mira con la validación final.
- **La rotación de la cadera** depende de que la rodilla esté doblada y bien vista; con la pierna recta no hay información (D4).
- **El tiempo de cálculo** en el móvil: 21 incógnitas por frame son pocas; con LM y jacobiano numérico, unos ms por frame (5 min de vídeo, unos 30 s). En un worker, con progreso.

## Qué necesito del usuario

1. Revisar D1–D10 cuando quiera (se sigue con lo propuesto).
2. Al final del proyecto, la toma de dos móviles (la B1 simplificada) para validar todo.
