# Fase 11: cinética sin plataforma de fuerzas (estudio de viabilidad y plan)

Estado: **plan propuesto el 14-11-2026; pasos 1 a 3 hechos** (núcleo de dinámica inversa, `core/cinetica/`). Decisiones D1–D13 escritas y seguidas con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md` (el usuario las revisa cuando quiera). Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

## Qué se quiere

Añadir **cinética** —fuerza de reacción del suelo, momentos y potencias articulares, centro de masas— a partir de la cinemática que ya hay (sobre todo el esqueleto ajustado a las dos vistas de la fase 7), usando modelos que ya existan, como hace OpenCap, pero con las restricciones de dualkinema: todo en el navegador (nada sale del móvil; la barrera de red de la fase 10), solo recursos gratuitos, Android, 30 fps habituales (60 como mucho), el ruido de MediaPipe y un 3D calibrado con la propia persona.

## Respuesta corta

- **Lo que hace OpenCap no se puede llevar al navegador.** Su cinética sale de simulaciones con músculos que siguen la cinemática (control óptimo con colocación directa) sobre OpenSim, en servidores en la nube; no hay OpenSim compilado a WebAssembly (no se encontró ninguno, oficial ni de la comunidad), y aunque lo hubiera, cada simulación tarda decenas de minutos en un servidor.
- **Sí se puede, y es lo recomendado: dinámica inversa propia** (Newton–Euler) sobre el esqueleto de la fase 7 con las tablas antropométricas de Winter, en TypeScript, sin descargas ni red. Da el **centro de masas**, los **momentos internos netos** de cadera, rodilla y tobillo en el plano sagital y frontal, sus **potencias** y la **fuerza del suelo total** con su centro de presiones, todo por kilo de masa corporal.
- **Con el ruido de nuestra cinemática, la parte dinámica (aceleraciones) es frágil:** derivar dos veces amplifica el ruido. Con ruido de 2° por frame en los ángulos, la fuerza vertical a 6 Hz se va más de un 20 % del peso; hay que filtrar a 2–3 Hz, lo que solo vale para movimientos lentos. La **versión cuasiestática** (sin aceleraciones: los momentos que sostienen la postura) apenas nota el ruido y es la que se recomienda por defecto para sentadillas, levantarse de la silla, zancadas o apoyo monopodal.
- **No se puede dar con fiabilidad:** fuerzas musculares ni de contacto articular (necesitan un modelo musculoesquelético y optimización), momentos en el plano transversal, la fuerza del suelo de cada pie en el doble apoyo (indeterminada con la cinemática sola), ni los picos de impacto de la marcha, la carrera o los saltos (contenido de frecuencia muy por encima de lo que 30 fps y el filtro dejan).
- **Modelos aprendidos:** GaitDynamics (Stanford, licencia MIT, pesos descargables) estima la fuerza del suelo de cada pie en la marcha desde la cinemática con muy buen resultado sobre cinemática de laboratorio; es convertible a ONNX en principio, pero está entrenado con marcadores y solo para andar y correr. Queda como **experimento opcional** de marcha (paso 4), como lo fue RTMPose.

## Qué hace OpenCap para la cinética

Uhlrich y col., «OpenCap: Human movement dynamics from smartphone videos», *PLOS Comput Biol* 2023;19(10):e1011462 ([doi:10.1371/journal.pcbi.1011462](https://doi.org/10.1371/journal.pcbi.1011462)); código con licencia Apache 2.0 (`stanfordnmbl/opencap-core`, `stanfordnmbl/opencap-processing`).

1. Puntos 2D en cada vídeo (dos iPhones o más), sincronía, triangulación, una red LSTM que pasa de los puntos del detector a un juego de marcadores anatómicos, y cinemática inversa sobre un modelo musculoesquelético de OpenSim.
2. **Dinámica:** simulaciones con músculos que siguen la cinemática (control óptimo), con un modelo de contacto pie–suelo (esferas con contacto de Hunt–Crossley): la fuerza del suelo **sale de la simulación**, no se mide. Según el resumen del artículo leído (no verificado en el texto de métodos), modelo de 33 grados de libertad y 80 músculos, CasADi + IPOPT, unos 35 min por sentadilla en un servidor. Todo se procesa **en la nube** («OpenCap leverages cloud computing»).
3. **Error frente a plataforma y laboratorio** (10 personas; andar, sentadilla, levantarse de la silla y salto desde un cajón): cinemática 4,5° de error absoluto medio; fuerza del suelo vertical 11,4 % del peso, anteroposterior 3,5 %, mediolateral 3,8 % (6,2 % de media); momentos articulares 1,22 % del peso × estatura de media (0,75 andando, 0,97 en la sentadilla, 0,68 al levantarse, 2,50 en el salto); momento aductor de la rodilla en la marcha con r² = 0,80; momento extensor de la rodilla al levantarse con r² = 0,65.

Después: **OpenCap Monocular** (Universidad de Utah, preprint de marzo de 2026, `utahmobl/opencap-monocular`): un solo iPhone, cinemática refinada desde WHAM y cinética con simulación y aprendizaje automático; según su resumen, fuerza del suelo en la marcha con un 9,7 % del peso de error absoluto medio. Y un preprint de 2025 que combina las fuerzas de GaitDynamics con la dinámica inversa sobre la cinemática de OpenCap (no se pudo leer entero: solo su resumen).

## Alternativas valoradas

### A. OpenSim en el navegador

No se ha encontrado ningún OpenSim (opensim-core, Simbody, Moco) compilado a WebAssembly. Portarlo sería un proyecto en sí (C++ con dependencias numéricas grandes: Simbody, CasADi, IPOPT), y las simulaciones con músculos que dan la cinética de OpenCap tardan decenas de minutos en un servidor: en un móvil, horas. **Descartada** (D1). La dinámica inversa sola (lo que OpenSim llama *Inverse Dynamics*) no necesita OpenSim: son las ecuaciones de Newton–Euler de una cadena de segmentos, que se escriben aquí en poco código (alternativa C).

### B. Modelos aprendidos de fuerza del suelo

- **GaitDynamics** (Tan y col., Stanford; *Nature Biomedical Engineering* 2026, [doi:10.1038/s41551-025-01565-8](https://doi.org/10.1038/s41551-025-01565-8); preprint en PMC11957236; código `stanfordnmbl/GaitDynamics`, **licencia MIT**, pesos en el repositorio: `GaitDynamicsDiffusion.pt` y `GaitDynamicsRefinement.pt`, PyTorch). Dos transformadores: uno de difusión (rellena cinemática que falta) y otro de refinado que pasa de la cinemática completa a la fuerza. Entrada: ventanas de 1,5 s a 100 Hz con la velocidad de la pelvis y los ángulos del modelo de Rajagopal sin brazos (en rotaciones 6D) y sus velocidades. Salida: fuerza del suelo de cada pie (3 ejes) y centro de presiones. Entrenado con AddBiomechanics (Werling y col., ECCV 2024: 273 personas, más de 70 h de movimiento con plataformas). Error en la fuerza vertical, con cinemática de marcadores: 3,2 % del peso de error absoluto medio (1,1–3,9 % en estudios no vistos; 10,1 % en una persona tras un ictus). **Solo andar y correr** (el artículo dice que no se aplique a otras tareas); no se publica su error con cinemática de vídeo.
  - Pros: libre, pesos públicos, el refinado es una pasada por ventana (sin el muestreo de difusión, que hace falta solo para rellenar), y lo resuelve el doble apoyo que la dinámica inversa no puede.
  - Contras: tamaño del modelo y exportación a ONNX sin comprobar; hay que llevar nuestro esqueleto (21 grados) a las coordenadas de Rajagopal y remuestrear 30 fps a 100 Hz; entrenado con cinemática de marcadores, sin garantía con la nuestra (más ruidosa y sin subastragalina ni lumbar); solo marcha.
- Otros: modelos de regresión y redes con plataformas (Johnson y col., 2018), con sensores inerciales, o con vídeo, sin pesos públicos o con licencias que no permiten su uso: no se valoran.

**Decisión:** experimento opcional de marcha (paso 4, D9), si la exportación sale bien y cabe en el sitio.

### C. Dinámica inversa propia sobre el esqueleto (recomendada)

Las ecuaciones del movimiento de los segmentos con masas e inercias de tablas antropométricas (Winter, Dempster; de Leva, 1996, [doi:10.1016/0021-9290(95)00178-6](https://doi.org/10.1016/0021-9290(95)00178-6)):

- **Fuerza del suelo total** por la segunda ley de Newton del cuerpo entero (F = Σ mᵢ(aᵢ − g)) y su **centro de presiones** por la ecuación de momentos. Es lo que hacen Ren, Jones y Howard (*J Biomech* 2008, [doi:10.1016/j.jbiomech.2008.06.001](https://doi.org/10.1016/j.jbiomech.2008.06.001): buena estimación en el plano sagital, peor en los demás; filtro óptimo a 4,5 Hz; los parámetros de los segmentos pesan mucho), Karatsidis y col. con sensores inerciales (*Sensors* 2017, [doi:10.3390/s17010075](https://doi.org/10.3390/s17010075): fuerza vertical con un 5,3 % de error relativo y 0,99 de correlación andando; frontal y transversal, mucho peor) y Fluit y col. con un modelo musculoesquelético y contacto (*J Biomech* 2014, [doi:10.1016/j.jbiomech.2014.04.030](https://doi.org/10.1016/j.jbiomech.2014.04.030): actividades de la vida diaria).
- **Doble apoyo:** la fuerza de cada pie está indeterminada; esos trabajos la reparten con una suposición (la «transición suave» de Ren) o con optimización.
- **Momentos articulares** de abajo arriba con la fuerza de cada pie.

Pros: en el navegador y en milisegundos, sin modelos ni red, mismo esqueleto y mismo filtro que el resto, cada paso se puede probar con datos de verdad conocida. Contras: todo depende de las aceleraciones (ruido) y del reparto en el doble apoyo; los parámetros de las tablas son de la persona media.

## Lo que da nuestra cinemática: los números de la persona sintética

Las sentadillas de la persona sintética de la fase 7 (una cada 3 s) a 30 fps con ruido blanco frame a frame en cada ángulo del esqueleto y 5 mm en la pelvis, frente a la misma sin ruido (error cuadrático medio; `dinamica.test.ts` fija los de los criterios):

| Ruido por ángulo | Modo y corte | Fuerza vertical (N/kg) | Momento de la rodilla (N·m/kg) | Momento de la cadera |
|---|---|---|---|---|
| 0° | dinámica, 2 Hz | 0,21 | 0,11 | 0,07 |
| 0° | cuasiestática | 0,73 (es el peso: la sentadilla varía ±11 %) | 0,07 | 0,06 |
| 2° | dinámica, 6 Hz | 3,5 (36 % del peso) | 2,6 | 2,0 |
| 2° | dinámica, 3 Hz | 0,82 | 0,87 | 0,49 |
| 2° | dinámica, 2 Hz | 0,32 | 0,41 | 0,24 |
| 2° | cuasiestática | — | 0,18–0,26 | 0,09–0,18 |
| 3,5° | dinámica, 2 Hz | 0,47 | 0,67 | 0,43 |
| 3,5° | cuasiestática | — | 0,39–0,40 | 0,28–0,29 |

El momento de la rodilla en la sentadilla va de 0,1 a 1,2 N·m/kg. Para comparar con la literatura: 1 % del peso × estatura son 0,17 N·m/kg en una persona de 1,75 m. Con 2° de ruido, la cuasiestática da la rodilla con un error del orden de 1–1,5 % del peso × estatura, como OpenCap con dos iPhones; con 3,5° (el ruido medido en 2D en la fase 5, antes del esqueleto), unas 2,3 veces más. El ruido real del esqueleto ajustado no se conoce todavía (la continuidad del ajuste lo suaviza): **pendiente de validar con vídeos**.

## Qué se puede dar y qué no

| Medida | Fiabilidad esperada | Cómo |
|---|---|---|
| Centro de masas (posición, trayectoria, altura en un salto) | Buena (solo posiciones, promedio de muchos puntos) | Tablas de Winter sobre el esqueleto |
| Momentos sagitales de cadera, rodilla y tobillo en movimientos lentos (sentadilla, silla, zancada) | Razonable; mejor para comparar lados, repeticiones o sesiones que en absoluto | Cuasiestática |
| Momento frontal de cadera y rodilla (abductor; KAM) en apoyo monopodal o sentadilla a una pierna | Razonable, más sensible al ancho de caderas y al centro de presiones | Cuasiestática |
| Reparto del peso entre las dos piernas en una postura (asimetría de carga) | Razonable si el centro de masas está bien | Palanca entre los apoyos |
| Fuerza vertical total en movimientos lentos y moderados | Aceptable con corte de 2–3 Hz | Dinámica |
| Potencias articulares | Solo orientativas (usan velocidades angulares) | Dinámica o cuasiestática |
| Fuerza de cada pie en el doble apoyo de la marcha | No (indeterminada) | Solo con un modelo aprendido (D9) |
| Picos de impacto (talón, carrera, saltos) | No (30 fps y el filtro se los comen) | — |
| Momentos transversales, fuerzas musculares, fuerzas de contacto articular | No | Necesitarían OpenSim y simulación |

## Decisiones

**D1 — Sin OpenSim ni simulaciones con músculos.** No hay versión para el navegador y tardarían demasiado; no se dan fuerzas musculares, activaciones ni fuerzas de contacto articular. Si algún día hace falta, sería con un servidor, lo que rompe la restricción de privacidad: no se plantea.

**D2 — Dinámica inversa propia (Newton–Euler) sobre el esqueleto de la fase 7**, en `core/cinetica/`, por kilo de masa corporal (N/kg, N·m/kg, W/kg): no hace falta el peso de la persona para comparar. Con escala en metros (la estatura de la fase 6) o no hay cinética (g necesita metros). Gravedad −z del mundo calibrado (nivelado con el acelerómetro en la fase 6). Cada tramo de frames ajustados por separado (nunca a través de un hueco ni de un salto en el tiempo), con el filtro de la sesión y la misma derivada que el resto (`derivarTramo`); se descartan las primeras y las últimas 0,15 s de cada tramo (`RECORTE_BORDE_S`: la segunda derivada se tuerce en los extremos).

**D3 — Parámetros de Winter (Dempster), con cabeza, brazos y tronco en un bloque (HAT).** Los mismos de las proporciones que ya se usan (`PROPORCIONES`); el esqueleto no tiene brazos. Masa, centro de masas y radio de giro transversal de la tabla; el longitudinal, el 45 % del transversal (de Leva lo da entre el 40 y el 50 % en la pierna). Con la persona de pie, el centro de masas queda al 58 % de la estatura (la referencia habitual es 55–57 %: se avisa en el glosario). Más adelante: de Leva por sexo y los brazos como segmentos con los puntos de la fase 8.

**D4 — Apoyo y reparto entre pies.** Un pie apoya si su talón o su punta están a menos de 5 cm del suelo (`UMBRAL_APOYO_M`; suelo de la calibración o el percentil 5 de los pies). Con un pie, todo a ese pie. Con los dos, **regla de la palanca** a lo largo de la recta entre los apoyos, conservando exactamente la fuerza y el momento totales (lo supuesto es solo el reparto). Sin apoyo y con fuerza vertical por debajo del 20 % del peso, en el aire (los momentos salen de la inercia de las piernas).

**D5 — Dos modos: cuasiestático por defecto y dinámico con corte bajo.** La tabla de arriba: con el ruido de nuestra cinemática, las aceleraciones solo se sostienen filtrando a 2–3 Hz. Por defecto, **cuasiestático** (sin aceleraciones; la fuerza es el peso y el centro de presiones cae bajo el centro de masas); el **dinámico** se ofrece con su propio corte (2 Hz por defecto, de 1 a 4 Hz) y un aviso de que solo vale para movimientos lentos o moderados. El modo y el corte se dicen siempre junto al valor y van en el CSV.

**D6 — Convenios.** Momento **interno neto** (el que hace el segmento proximal sobre el distal), en los ejes del segmento proximal: sagital **+ extensor** en cadera y rodilla y **+ flexor plantar** en el tobillo (el «momento de soporte» de Winter); frontal **+ abductor** en cadera y rodilla (en la rodilla, igual en magnitud al momento aductor externo, KAM); el tobillo sin frontal. Potencia = M · (ω_distal − ω_proximal), + genera. Fijados por `dinamica.test.ts`.

**D7 — Criterios con datos sintéticos** (los tests del paso 1): postura quieta (fuerza = peso, centro de presiones bajo el centro de masas, mitad a cada pie); momentos iguales al cálculo estático hecho de otra forma en una sentadilla y en apoyo monopodal (cadera y rodilla extensoras; abductores en el apoyo); rebote vertical conocido (F_z = g − Aω² sen ωt, a 0,02 N/kg); caída libre con las piernas moviéndose (fuerza nula a 0,05 N/kg); pierna balanceándose en el aire (momento de la cadera igual al de su inercia y su peso, calculado sin la recursión, a un 2 %); huecos (NaN, nunca 0); y con ruido, la cuasiestática a menos de 0,5 N·m/kg en la rodilla con 3,5° y la dinámica a 2 Hz a menos de un 5 % del peso con 2°.

**D8 — Masa opcional.** Todo por kilo; si se escribe la masa (como la estatura, con la sesión), además en N y N·m.

**D9 — GaitDynamics, experimento de marcha (paso 4), condicionado.** Solo si su modelo de refinado se exporta a ONNX, cabe en el sitio (25 MB por archivo en Cloudflare) y la conversión de nuestro esqueleto a sus coordenadas sale razonable con la persona sintética andando. Detrás de `?gaitdynamics`, con ONNX Runtime Web (ya está por RTMPose), el modelo alojado en el sitio (nada sale del móvil: la barrera de red no cambia). Se compara con la dinámica inversa en el apoyo simple, donde las dos deberían coincidir.

**D10 — Interfaz y persistencia.** Una tarjeta «Cinética» en «Ángulos en 3D» con el esqueleto ajustado y escala: modo, gráfica de los momentos (sagital y frontal, dos piernas), el reparto del peso entre los pies, el centro de masas, las potencias y el CSV propio. Se calcula al vuelo del esqueleto guardado (milisegundos): no se guarda el resultado; lo que se mira (modo, corte, masa) va en `tresd` de la cabecera, sin subir el esquema. Glosario: «Cinética estimada», «Momento interno neto», «Cuasiestático y dinámico», «Reparto entre los pies».

**D11 — Se dice qué es.** Es una **estimación sin plataforma**: el panel lo dice siempre, con lo que no se puede (doble apoyo, impactos, transversal) y sin valores en los frames sin apoyo reconocible.

## Opciones diferidas (pregunta del usuario del 14-11)

¿Algún modelo de los citados se puede integrar aunque tarde más? ¿Algo de «lo que no se puede» con un error razonable en clínica?

- **El tiempo no es lo que impide OpenSim:** no existe compilado para el navegador. Habría que portar OpenSim, Simbody, CasADi e IPOPT a WebAssembly (meses, sin garantía de que quepa en la memoria de un móvil) y después cada simulación con músculos tardaría horas en el móvil. Sigue descartado (D1).
- **GaitDynamics sí se puede integrar en diferido** (D9): su inferencia es barata; el trabajo es exportarlo, llevar nuestro esqueleto a sus coordenadas y comprobarlo. Solo marcha y carrera. Es lo único que daría la fuerza de cada pie en el doble apoyo de la marcha.
- **Lo que más mejoraría todo es quitar ruido, y eso sí admite un proceso diferido** (D12): en lugar de ajustar el esqueleto frame a frame, ajustar **toda la toma a la vez** con una penalización de las aceleraciones (como hace OpenCap al seguir la cinemática en su simulación, pero solo cinemática). Puede tardar minutos en el móvil; a cambio, el modo dinámico serviría para movimientos moderados (bajar y subir rápido, un paso) y no solo lentos.
- **Doble apoyo fuera de la marcha (sentadilla, levantarse):** en vez de la palanca, repartir la fuerza buscando el reparto que pide menos esfuerzo a las articulaciones (mínimo de la suma de momentos al cuadrado, con la fuerza y el momento totales fijos), como Fluit y col. (2014) con un modelo de contacto. Es un problema pequeño por frame, posible en el navegador (D13). Error esperable sin comprobar: hay que validarlo (básculas o plataforma).
- **Fuerzas musculares y de contacto en la rodilla:** técnicamente cabría la optimización estática (repartir el momento de cada articulación entre los músculos con los brazos de palanca de un modelo libre, como el de Rajagopal), un problema pequeño por frame. Pero el error, incluso en laboratorio con plataformas, es grande y no se puede comprobar sin prótesis instrumentadas: **no lo considero de uso clínico**; queda como idea apuntada, no como paso.
- **Momentos de rotación (transversales):** se calculan ya (van en el vector del momento), pero son pequeños y dominados por el ruido y por la rotación de cadera mal vista con la rodilla recta: no se enseñan. Se podrían exportar marcados como orientativos.
- **Picos de impacto:** no. Pasan en 10–30 ms y el vídeo da un frame cada 33 ms (17 a 60 fps); ningún cálculo los recupera, y los modelos aprendidos estiman la forma media, no el pico de cada paso.

**D12 — Suavizado de toda la toma, antes del modo dinámico «de verdad».** Un ajuste del esqueleto sobre la toma entera con penalización de la aceleración (o un suavizador de Rauch–Tung–Striebel sobre las posturas), en el worker del esqueleto (hecho en el paso 3, automático: ver «Hecho»). Criterio con la persona sintética: con 2° de ruido, la fuerza vertical dinámica a 4 Hz con menos de un 5 % del peso de error, frente a más del 20 % ahora.

**D13 — Reparto entre pies por mínimo esfuerzo** (opcional, junto a la palanca), con la persona sintética apoyada de forma asimétrica como verdad.

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Núcleo** (`core/cinetica/`): segmentos con su inercia, centro de masas, Newton–Euler, fuerza y centro de presiones totales, reparto entre pies, momentos y potencias, modos cuasiestático y dinámico. Tests de valor conocido (D7) | Opus |
| 2 | **Interfaz**: tarjeta «Cinética estimada» en «Ángulos en 3D» con los dos modos (el dinámico con su corte), momentos de las dos piernas, reparto del peso, centro de masas, picos y asimetría, CSV y glosario. e2e con la persona sintética | Opus |
| 3 | **Suavizado de toda la toma** (D12), diferido en el worker del esqueleto; la masa opcional (D8) | Opus |
| 4 | **GaitDynamics** (D9): exportar, convertir el esqueleto, comparar con la persona sintética andando. Si no sale, se apunta por qué y se deja | Opus |
| 5 | **Reparto por mínimo esfuerzo** (D13) | Opus |
| 6 | Cierre: revisión de código, documentación y limitaciones | Opus |

## Hecho

**Paso 1 (14-11):** `core/cinetica/segmentos.ts` (tabla de Winter con el HAT, `cuerpoDePostura`, `centroDeMasas`, `enMetros`) y `core/cinetica/dinamica.ts` (`velocidadAngular` y `aceleracionAngular` de una orientación, `newtonEuler` de un segmento, `reaccionTotal` del cuerpo entero, `repartir` entre los pies y `cineticaDeLaToma` con los modos `dinamica` y `cuasiestatica`), con `dinamica.test.ts` (D7). Lo que enseñó: la segunda derivada de lo filtrado se tuerce cerca de los extremos de cada tramo (con una caída libre, 5 N/kg de más en el segundo frame), de ahí `RECORTE_BORDE_S`; y con ruido frame a frame, la dinámica solo se sostiene con un corte bajo (D5).

**Paso 2 (14-11):** la tarjeta «Cinética estimada» en «Ángulos en 3D» (`ui/visor/PanelCinetica.tsx`), con el esqueleto ajustado y la escala en metros: «Estimar la cinética», el aviso de lo que no vale, los modos cuasiestático y dinámico (con su filtro de 1 a 4 Hz), la articulación y el plano, el momento de las dos piernas en el cursor y en la gráfica, el peso en cada pie (con la banda 45–55 %), la fuerza vertical y la altura del centro de masas, los picos con su asimetría (`core/cinetica/resumen.ts`) y el CSV (`core/exportacion/csvCinetica.ts`). Se guarda el modo y el corte (`Ajustes3D.cinetica`, sin subir el esquema); el resultado se calcula al vuelo. Glosario: «Cinética estimada», «Cinética: cuasiestático y dinámico» y «Momento articular interno». e2e con la persona sintética.

**Paso 3 (14-11):** el suavizado de toda la toma (D12), `core/esqueleto/suavizado.ts`. Cambios sobre el plan:

- **No es un ajuste nuevo sobre las imágenes ni va a petición:** el ajuste frame a frame ya da, en cada frame, la postura y cuánto la determinan las cámaras (la información JᵀJ de la reproyección, `ResultadoAjuste.informacion`). El suavizado busca la trayectoria de toda la toma que mejor casa con todas esas posturas, cada una pesada por su información y su error de reproyección, con un previo de aceleración pequeña (10 rad/s² en los ángulos, 1 m/s² en la pelvis; aceleración con los tiempos de verdad, fps variable). Es lineal, en banda (cada frame con los dos de cada lado), por ventanas de 240 frames solapadas 30 y sin cruzar huecos: unos milisegundos; va **siempre** al final de «Ajustar el esqueleto» y se guarda con él (`EsqueletoGuardado.suavizadas`, opcional: uno de antes pide volver a ajustar).
- **Lo que enseñó la cadena completa** (la persona sintética a través de las dos cámaras, calibrada y ajustada): el ruido que deja el ajuste del esqueleto es menor que el de mi prueba del paso 1 (ruido blanco en cada ángulo), porque la continuidad del ajuste ya suaviza. Error de la fuerza vertical dinámica a 4 Hz en las sentadillas: 3 px de ruido, 0,32 N/kg sin suavizar; 6 px, 0,67; 10 px, 1,12. Con el suavizado: 0,17 (6 px) y 0,20 (10 px), un 2 % del peso, y apenas sube con el filtro a 6 Hz o sin él. El momento de la rodilla queda a 0,3–0,4 N·m/kg. En la marcha en el sitio (rápida), el ángulo de la rodilla suavizado empeora de 3,6° a 4,4° de error: por eso **los ángulos siguen saliendo del ajuste frame a frame** y lo suavizado solo lo usa la cinética (en los dos modos).
- El filtro del modo dinámico pasa a 4 Hz por defecto (de 1 a 6).
- **La masa (D8):** opcional en la tarjeta (15–250 kg, `AjustesCinetica.masa`); con ella, el momento y la fuerza también en N·m y N, y la masa en la cabecera del CSV.
- Tests: velocidad constante exacta a través de las ventanas, sentadillas con 2° de ruido (la mitad de error o menos) y medio segundo sin ver la rotación de la cadera (a menos de 3°), huecos, y la cadena completa con 6 px (fuerza vertical a menos del 3 % del peso; sin suavizar, más del 5 %). Glosario: «Toma afinada». e2e: la tarjeta dice «Con la toma afinada» con el esqueleto reabierto y la masa da los N·m.

## Validación (pendiente de validar con vídeos)

1. **Con la toma B1 simplificada** (la de la validación final): sentadillas lentas, levantarse de una silla y apoyo monopodal; comprobar que los momentos tienen la forma y el orden de magnitud de la literatura (sentadilla: extensor de la rodilla de ~1 N·m/kg abajo) y que el reparto entre los pies sale ~50 % de pie quieto.
2. **Dos básculas de baño** bajo los pies (barato): el reparto del peso en posturas quietas y asimétricas, frente a la regla de la palanca.
3. **Plataforma de fuerzas**, si el usuario tiene acceso a una (universidad o laboratorio): sentadillas y levantarse de la silla grabados a la vez; es la validación de verdad de la fuerza vertical y, con la cinemática del laboratorio, de los momentos.
4. **OpenCap**: comparar las mismas tomas exige iPhones (OpenCap solo funciona con iOS): solo si se consiguen prestados.

## Riesgos

- **El ruido real del esqueleto** decide si la dinámica sirve para algo más que movimientos lentos.
- **El centro de masas** depende de la tabla (persona media) y del HAT sin brazos: los brazos adelantados en una sentadilla mueven el centro de presiones varios centímetros. Con los puntos de los brazos de la fase 8 se podría añadir.
- **El suelo**: si el suelo de la calibración está mal, el apoyo se detecta mal (se puede estimar de los pies).

## Qué necesito del usuario

1. Revisar D1–D11 cuando quiera (se sigue con lo propuesto).
2. Decir si tiene acceso a una plataforma de fuerzas o a dos básculas para la validación.
3. En la validación final, añadir a la toma B1 unas sentadillas lentas, levantarse de una silla y unos segundos sobre cada pierna.
