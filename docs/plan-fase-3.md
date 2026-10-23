# Fase 3: dos vistas

Estado: **plan aceptado** (2026-10-23). Decisiones D1–D10 aceptadas por el usuario tal como se proponen, incluida la medida frontal de D3 (FPPA de rodilla con muslo proximal, centro de la rodilla y centro del tobillo). Nada de esta fase está escrito todavía; este documento recogerá cómo queda cada pieza, como `docs/plan-fase-2.md`.

Objetivo de la fase (de `CLAUDE.md`): carga de dos vídeos, sincronización por evento visual o por audio, línea de tiempo y cursor comunes, gráficas superpuestas. Además, lo que la fase 2 dejó para aquí: el glosario dentro de la app (limitación 8: las notas de la gráfica no se ven en ningún sitio), la deuda de supresiones de `react-hooks` en los hooks del visor y la limitación 1 (la vista lateral sola no ve lo que pasa en el plano frontal).

Caso de uso que guía las decisiones: una sentadilla (o sentadilla a una pierna, o un salto) grabada a la vez con **dos móviles**, uno de lado y otro de frente, **arrancados a mano** (la grabación sincronizada con dos móviles es la fase 4). Se mide la flexión de rodilla en la vista lateral y el valgo dinámico en la frontal, y se ven las dos curvas en el mismo eje de tiempo.

Criterio de cierre: con dos vídeos reales (lateral y frontal) de sentadillas grabados a la vez con dos móviles y una palmada al principio, la persona puede:
- abrir los dos vídeos como una sola sesión;
- sincronizarlos (por el audio de la palmada, comprobando con un evento visual) y ver el desfase y su precisión;
- marcar y seguir los gomets de cada vista;
- ver la flexión de rodilla (lateral) y el ángulo frontal de rodilla (frontal) en el mismo eje de tiempo, con un cursor común que mueve los dos vídeos;
- exportar los datos de cada vista con el tiempo común;
- recargar la página y recuperar la sesión eligiendo de nuevo los dos archivos.

---

## 1. Glosario dentro de la app (paso 1)

Ya acordado al cerrar la fase 2: un paso propio al principio de esta fase. Una página (o panel) con la explicación de cada parámetro y aviso: ángulo sin cero y relativo, cero de referencia, filtro y frecuencia de corte, velocidad y aceleración, calidad («dudoso», «perdido»), interpolado, longitud de los segmentos, precisión de la escala, huecos, anclas y reenganche. Enlaces desde el propio valor o aviso (un icono de información junto a cada uno). Vuelven aquí las notas de la gráfica que se perdieron (huecos sin línea, interpolado a trazos, banda de los segmentos).

Va primero porque es independiente del resto, se nota enseguida y la fase añade conceptos que hay que explicar (desfase, tiempo común, precisión de la sincronización): sus entradas se añaden en los pasos que los introducen. Todo local, sin servidor. Textos en `src/ui/glosario/` como datos (una entrada = id, título, texto), para poder enlazar por id.

## 2. Tiempo común y desfase [D1, D10] (paso 3)

**Definición.** Una vista es la **referencia** (D1) y su tiempo es el tiempo común. Cada vista guarda su `desfase` (ya previsto en el modelo y en el esquema, hoy siempre 0) con este convenio, el único que se usa en todo el código:

> tiempo común = tiempo del vídeo + `desfase`

Un evento que se ve en `t_B` en la vista B ocurre en el tiempo común `t_B + desfase_B`. La referencia tiene `desfase = 0`. Dicho al revés: para el instante común `t`, la vista B muestra el frame visible en `t − desfase_B` (`indiceEnTiempo` de su tabla, el mismo que ya se usa).

**Cada vista conserva su tabla de frames.** Dos móviles graban con fps distintos y variables: nunca se supone un frame de una vista por cada frame de otra. Todo se convierte por tiempo, nunca por índice (la regla de la fase 1 se mantiene).

**Rango del tiempo común (D10):** la unión de los dos vídeos. Donde un vídeo no tiene imagen (antes de empezar o después de acabar), su vídeo muestra «fuera de este vídeo» y sus series no tienen valor (NaN: la línea se corta, nunca 0).

**Navegación.** El cursor es un instante común. «Frame siguiente / anterior» avanza por los frames de la **vista activa** (la que se está marcando); la otra muestra el frame visible en ese instante. El deslizador y la franja de estado son los de la vista activa, con el tiempo común en el texto.

**Deriva entre relojes.** Dos móviles cuentan el tiempo con cristales distintos: del orden de 10–100 ppm. En una grabación de 30 s son como mucho 3 ms (un 10 % de un frame a 30 fps): **no se corrige** en esta fase (solo un desfase constante). En grabaciones largas (5 min: hasta 30 ms, un frame) habría que estimar también una escala; queda como limitación y como entrada de la fase 4, que sincroniza los relojes.

Núcleo: `core/tiempo/comun.ts` (paso de tiempo de vista a común y al revés, frame visible de cada vista en un instante común, rango común), TypeScript puro y con tests de valor conocido (fps distintos, desfases negativos, instantes fuera de rango).

## 3. Sincronización [D2] (pasos 4 y 5)

Hay que hallar `desfase_B`. Dos métodos que se complementan (D2: audio automático y comprobación visual con ajuste fino):

**Por evento visual (paso 4).** La persona lleva cada vídeo al frame de un mismo evento (la palmada, el pie que toca el suelo, un destello) y pulsa «Este es el evento». Entonces `desfase_B = t_evento_A − t_evento_B`. Precisión: cada vista sitúa el evento con un error de hasta medio frame, así que el desfase tiene una incertidumbre de ±(½·1/fps_A + ½·1/fps_B), unos ±33 ms entre dos vídeos de 30 fps. Se muestra junto al desfase. Siempre disponible (no depende del audio) y sirve para **comprobar** el desfase que da el audio: con los dos vídeos en el evento, deben coincidir.

**Ajuste fino.** Botones para mover el desfase de la vista B un frame suyo adelante o atrás, viendo los dos vídeos en el evento.

**Por audio (paso 5).** La palmada (o cualquier sonido fuerte) la graban los dos micrófonos. Se decodifica el audio de los dos archivos en el navegador (Mediabunny ya trae `AudioBufferSink`; WebCodecs decodifica AAC y Opus), se pasa a mono y a una envolvente de energía (unos 1–2 kHz de muestreo bastan para precisión de milisegundos), y se busca el desfase con la **correlación cruzada con ponderación de fase** (GCC-PHAT, por FFT): da un pico agudo en el retardo aunque los dos micrófonos tengan respuestas distintas. Pico refinado con una parábola (precisión por debajo de la muestra). Calidad: relación entre el pico y el segundo pico; si es baja, se avisa y se propone el evento visual.

- Ventana de búsqueda: ±10 s por defecto (dos móviles arrancados a mano por una persona).
- Va en un worker (decodificar y FFT de un minuto de audio es trabajo pesado) y la FFT en el núcleo (`core/sincronia/`), TypeScript puro, con tests de señales sintéticas de retardo conocido (con ruido, con ganancias distintas, con retardo negativo).
- **Lo que el audio no sabe:** cada móvil puede tener su propio retardo entre audio y vídeo dentro del archivo (en Android, de unos pocos ms a varias decenas). El audio da el desfase del audio; el de la imagen puede diferir en eso. Por eso el resultado se comprueba con el evento visual y se ajusta frame a frame (D2). Con vídeos reales del usuario se medirá cuánto difieren.
- Sin pista de audio en alguno de los dos vídeos: solo evento visual.
- El mismo algoritmo servirá en la fase 4 para el pitido de referencia.

Se guarda cómo se sincronizó (método, calidad del pico o frames del evento) para poder decir de dónde sale el desfase.

## 4. Modelo de marcadores y medida frontal [D3, D4] (paso 6)

**Marcadores (D4).** Un único modelo por sesión con todos los marcadores; cada vista dice cuáles sigue. El identificador sigue siendo común a todas las vistas y significa el mismo punto anatómico: así lo necesita la fase 5 (triangular un marcador visto en dos vistas). En el caso lateral + frontal casi no hay marcadores compartidos: la vista lateral sigue trocánter, epicóndilo lateral y maléolo lateral; la frontal, los suyos.

**Qué se mide en la vista frontal (D3).** Recomendación: el **ángulo de proyección en el plano frontal de la rodilla** (FPPA, *frontal plane projection angle*), la medida 2D del valgo dinámico más usada y estudiada en sentadilla a una pierna y aterrizajes. Se define entre el muslo (centro de cadera estimado → centro de rodilla) y la pierna (centro de rodilla → centro de tobillo) vistos de frente. Marcadores frontales habituales: muslo proximal (punto medio entre la espina ilíaca anterosuperior y la rodilla, como estimación del centro de la cadera), centro de la rodilla (punto medio entre los cóndilos femorales, o centro de la rótula) y centro del tobillo (punto medio entre los maléolos).

- Convención por fijar en `articulaciones/catalogo.ts` con su test en `catalogo.test.ts` (como todas): 0° con el muslo y la pierna alineados de frente; valgo (rodilla hacia dentro) positivo, varo negativo, igual para la pierna derecha y la izquierda y para la cámara delante o detrás (el marco canónico frontal ya lo resuelve con el espejo, falta el signo por lado). Es la parte de cálculo de esta fase: Opus, con casos de valor conocido.
- El núcleo ya tiene la abducción de cadera frontal (`cadera_frontal_*`); se puede ofrecer también, pero sus marcadores (acromion, trocánter, epicóndilo) no son los de un protocolo frontal: no lo recomiendo para esta fase.
- Aceptado por el usuario (criterio clínico): FPPA de rodilla, con muslo proximal, centro de la rodilla y centro del tobillo.

## 5. Persistencia [D7] (paso 2)

El esquema ya prevé varias vistas (`vistas[]` con `desfase`, trayectorias por id de vista, `claves` con la huella de cada vista para encontrar la sesión desde cualquiera de los dos vídeos). Cambios:

- Cada vista guarda los marcadores que sigue y cómo se sincronizó.
- **Subir el esquema a 3 (D7).** Por la regla de `CLAUDE.md`, añadir campos con un valor por defecto válido no obligaría a subir la versión. Pero una app vieja (una pestaña abierta antes del cambio, una previsualización vieja) que abriera una sesión de dos vistas leería solo la primera y, al guardar, **borraría la segunda**. Con el esquema 3, la app vieja se niega a abrirla y no se pierde nada. La migración 2 → 3 es directa (una vista, sigue todos los marcadores del modelo, desfase 0, sincronía «ninguna») y lleva su test.
- **Recuperar pide los dos archivos.** El navegador no puede reabrir un archivo por su ruta, y en Chrome para Android no existe la API para guardar el permiso de un archivo (File System Access): hay que elegirlos otra vez. El selector admite elegir los dos a la vez; se reconoce cuál es cuál por su huella. Si se abre solo uno, la sesión se puede ver con esa vista y pedir la otra.
- Dos sesiones distintas pueden compartir un vídeo (p. ej. la misma vista lateral con dos frontales): la búsqueda por huella ya devuelve todas las candidatas.

## 6. Estructura del visor [D5, D8] (paso 2)

Hoy `Visor.tsx` lleva una sola vista: los hooks (`useNavegacionFrames`, `useTrayectorias`, `useAnalisis`, `useEscala`, `useMarcado`, `useSeguimiento`) se llaman una vez. Propuesta:

- **Un componente por vista** (`VistaVisor`) que llama a esos hooks para su vídeo y publica lo que necesita el resto (su serie del ángulo, su estado, su frame mostrado). Los hooks no se pueden llamar en un bucle de longitud variable; con un componente por vista no hace falta.
- **Un nivel de sesión** con lo común: el instante del cursor, la vista activa, los desfases, la gráfica común y el guardado de toda la sesión (`useGuardado` pasa a guardar todas las vistas).
- Es el momento de pagar la **deuda de la fase 2**: las trayectorias como ref mutable que se lee en el render (`useTrayectorias`, con `refs` e `immutability` suprimidas) pasan a un almacén por vista leído con `useSyncExternalStore` (cambia `version` por una instantánea), y desaparecen esas supresiones.
- Se hace **sin cambiar nada visible** y con las mismas comprobaciones que al partir `Visor.tsx` en la fase 2 (§11: DOM idéntico en todos los estados, e2e dos veces), antes de añadir la segunda vista.

**Seguimiento, una vista cada vez (D8).** Cada vista tiene su worker, pero solo uno sigue a la vez (los demás esperan en cola). Dos decodificadores de vídeo trabajando a la vez en el móvil duplican la memoria y compiten por el decodificador por hardware; seguir en paralelo ahorraría poco tiempo a cambio de ese riesgo. La caché de frames de cada vista se reparte la memoria (`capacidadCache` por número de vistas).

**Interfaz (D5).**
- Móvil en vertical: una vista activa a tamaño completo, como hoy (marcar y seguir se hace en una vista cada vez), con un conmutador A / B junto al vídeo y una miniatura de la otra vista. La gráfica común debajo.
- Móvil girado y escritorio: las dos vistas a la vez, lado a lado, sobre la gráfica común.
- Pestaña nueva o sección en «Vídeo»: «Sincronizar», con los dos métodos, el desfase, su precisión y el ajuste fino.
- La barra fija, el reparto del alto, el vídeo que se oculta al bajar y las vistas ampliadas siguen funcionando con la vista activa.

## 7. Gráficas en el tiempo común [D6] (paso 7)

- Eje X en **segundos del tiempo común**. Cada vista conserva sus propios tiempos (`t + desfase`); las series de dos vistas se combinan con `uPlot.join`: los huecos de verdad son `null` y cortan la línea, y los instantes que solo existen en la otra vista quedan `undefined` y se saltan sin cortarla. Así se respeta «un hueco corta la línea» sin remuestrear nada. (Comprobado en el código de uPlot 1.6.32: `NULL_RETAIN` por defecto en `join`; se verificará con una e2e de dos vistas con fps distintos.)
- **Una gráfica por medida, alineadas en el tiempo** con el cursor compartido (D6): flexión de rodilla (lateral) arriba, FPPA (frontal) debajo, mismo eje X. Opción de **superponerlas en la misma gráfica** cuando tienen la misma unidad (grados), con colores y leyenda por vista.
- La gráfica pequeña del móvil muestra la medida de la vista activa.
- El cursor, en su capa aparte (regla de la fase 2): cambiar de instante no redibuja.

## 8. Exportación [D9] (paso 7)

Un CSV por vista, con el formato de la fase 2 más una columna `t_comun_s` (tiempo del vídeo + desfase) y el desfase y el método de sincronización en la cabecera. Sin remuestrear: cada fila es un frame real de su vídeo (D9). Un CSV combinado en una rejilla común exigiría interpolar entre frames: se deja para cuando haga falta, y entonces con las mismas reglas que el filtrado (nunca a través de un hueco).

## 9. Pruebas

- Núcleo: tiempo común, sincronización por audio (señales sintéticas de retardo conocido), convención del FPPA (casos de valor conocido) y migración del esquema 2 → 3.
- e2e: un par de vídeos sintéticos nuevos generados con ffmpeg con **verdad conocida**: el mismo movimiento visto de lado y de frente, con **fps distintos** (30 y 25), un **desfase conocido** (p. ej. 0,733 s), un destello en un frame conocido de cada vídeo (evento visual) y una **pista de audio** con un pitido corto en un instante conocido de cada uno. Se comprueba que el desfase por audio cae dentro de 1 ms del real, el visual dentro de su incertidumbre, que el cursor común muestra en cada vista el frame que toca y que las curvas de cada vista coinciden con su verdad en el tiempo común.
- Lo que no se puede probar aquí: H.264 y HEVC reales (como siempre) y el retardo audio–vídeo de cada móvil. Para eso hacen falta **vídeos reales del usuario** (ver «Qué necesito del usuario»).

## Hecho

**Paso 2a — esquema 3** (`core/persistencia/esquema.ts`, tipos en `core/modelo/tipos.ts`). Cada vista guarda `marcadores` (los que sigue; por defecto, todos los del modelo) y `sincronia` (`ninguna`, `evento` con el instante en cada vista, `audio` con la calidad del pico y el desfase que dio antes del ajuste fino, o `manual`); la sesión guarda `referencia` (id de la vista de referencia). `prepararGuardado` toma `desfase` de la entrada (antes lo ponía siempre a 0). Validación: marcadores no vacíos, sin repetir y del modelo; sincronía con un método conocido y números finitos; la referencia es una de las vistas y su desfase es 0. Migración 2 → 3 con los mismos valores que pone `prepararGuardado` por defecto (una sesión vieja se lee igual que una nueva de una vista); las trayectorias no cambian (2 → 3 solo sube la versión). Tests: ida y vuelta de dos vistas (lateral y frontal, con desfase negativo y sincronía por audio), referencia en la segunda vista, lectura del esquema 2 y del 1, y casos rechazados. Nada visible cambia: el visor sigue con una vista.

**Paso 2b, parte 1 — trayectorias en un almacén por vista** (`ui/visor/almacenTrayectorias.ts`, `useTrayectorias.ts`). Las trayectorias vivían en una ref que se modificaba en sitio, con un contador `version` para avisar a React; por eso `useTrayectorias` suprimía las reglas `refs` e `immutability` de `react-hooks`. Ahora viven en `AlmacenTrayectorias` (una clase, creada una vez por apertura), que guarda el mapa de las series, hace las mismas modificaciones en sitio que antes (un lote del worker no copia series de miles de frames) y publica con cada una una instantánea nueva `{ version, series }` que el hook lee con `useSyncExternalStore`. Los consumidores (`useMarcado`, `useSeguimiento`, `useEscala`, `useAnalisis`, `useFiltrado`, `useGuardado`, el visor) reciben `series` (el mapa, siempre el mismo objeto) en lugar de la ref y siguen dependiendo de `version`. Fuera la supresión de `useTrayectorias` y la parte de las trayectorias de la de `useFiltrado` (queda la de medir el tiempo de cada pasada). Es la pieza que se duplicará por vista. Tests del almacén (instantánea y aviso con cada cambio, lotes que no pisan lo marcado a mano, quitar y devolver, quitar marcas posteriores). Sin cambios visibles: DOM idéntico a `main` en 43 estados (la única diferencia de una pasada fue la carrera conocida de la gráfica pequeña al crecer; otra pasada, idéntica), lienzo idéntico en 7 estados y CSV idénticos en 25; e2e 136/136 dos veces.

**Paso 2b, parte 2 — lo de una vista en `useVista`** (`ui/visor/useVista.ts`). Todo lo de una vista sale del visor a un hook: sus trayectorias, la navegación por sus frames, el marcado, el seguimiento, la escala, el análisis, la trayectoria completa y el dibujo sobre su lienzo, los valores del frame, su CSV y lo que el marcado necesita del frame mostrado (marcas a mano aquí, estado de cada marcador, anclas posteriores). En `Visor.tsx` se queda lo de la sesión: el modelo, las pestañas, el reparto de la pantalla y el guardado. El visor desestructura lo que devuelve `useVista` con los mismos nombres, así que el JSX no cambia. Con dos vistas (paso 3) el visor llamará a `useVista` para cada una y desestructurará la activa (D5: una vista activa a pantalla completa). Movido literalmente con un guion (los nombres devueltos, los que el visor sigue usando); `Visor.tsx` baja de unas 800 a 650 líneas. Sin cambios visibles: DOM idéntico a `main` en 43 estados (salvo la carrera conocida de la gráfica pequeña en una pasada), lienzo, CSV, raíz (`--alto-barra`, desplazamiento, `localStorage`) y número de workers idénticos.

**Paso 3a — tiempo común en el núcleo** (`core/tiempo/comun.ts`). Paso del tiempo del vídeo de una vista al común y al revés (`aComun`, `aVideo`: tiempo común = tiempo del vídeo + desfase), frame que se ve en una vista en un instante común (`frameVisibleEnComun`) y el más cercano (`frameMasCercanoEnComun`, para tocar una gráfica), rango de una vista (de su primer frame a que acaba de verse el último, con el paso típico como duración de este) y de la sesión (la unión, D10). Fuera de un vídeo: null (sin imagen ni valor). Ir y volver por el tiempo común redondea (1,24 + 0,733 − 0,733 = 1,2399999…) y sin margen caía en el frame anterior: se busca con el margen de `indiceDeFrame` (1 µs). Tests con dos vistas a 30 y 25 fps y desfase de 0,733 s: ida y vuelta de todos los frames, frames por tiempo y no por índice, fuera de rango y desfase negativo. Nada visible todavía.

**Paso 3b, parte 1 — el visor admite varias vistas (sin cambiar nada visible)** (`ui/Visor.tsx`, `ui/visor/AnfitrionVista.tsx`, `CuerpoVisor.tsx`, `vistas.ts`). `Visor.tsx` es ahora la sesión: el modelo y la lista de vistas (`EntradaVista`: id, vídeo, orientación, desfase, sincronía y lo recuperado). Los hooks de cada vista (`useVista`) viven en un `AnfitrionVista`, y los anfitriones se anidan (`Anfitriones`, uno dentro del otro): un hook no se puede llamar en un bucle de longitud variable, y con una función hija quien pinta recibe todas las vistas **en el mismo render** (sin copiar su estado hacia arriba con un efecto, que daría un render de retraso). El cuerpo de antes pasa a `CuerpoVisor` (movido con `git mv`, mismo JSX): recibe todas las vistas y cuál es la activa, y se ocupa de lo común. Al añadir una vista, el cuerpo cuelga de un anfitrión más y se vuelve a montar (el anfitrión de la primera vista no: conserva su estado). `useGuardado` guarda ahora una lista de vistas (con su desfase y su sincronía) y la referencia de la sesión (`SesionAbierta.referencia`, ya no `vistaId`); los ajustes del filtro guardados son los de la vista de referencia. `App` guarda `vistas[]` en lugar de un vídeo suelto. Sin cambios visibles: DOM idéntico a `main` en 43 estados, CSV en 25, raíz, número de workers y píxeles del lienzo idénticos; e2e 136/136 dos veces.

**Paso 3b, parte 2 — la segunda vista, A / B, cursor común y recuperar con los dos vídeos** (`ui/visor/useCursorComun.ts`, `AnadirVista.tsx`, `ConmutadorVista.tsx`, `MiniaturaVista.tsx`, `ui/recuperacion.ts`, `FaltanVideos.tsx`, `App.tsx`). En la pestaña «Vídeo» («Añadir la segunda vista») se elige otro vídeo y se dice cómo se ve la persona (`ElegirOrientacion` con `conFrontal`: perfil a un lado u otro, de frente o de espaldas); entra como vista B (el mismo archivo se rechaza por su huella). La sesión (`Visor.tsx`) guarda la vista activa y la pestaña abierta (antes en el cuerpo, que se vuelve a montar al añadir la vista y las perdía); `useCursorComun` lleva el cursor: un instante del tiempo común que mueve la activa (`useVista` avisa de cada cambio de frame con `alCambiarFrame`) y al que van las otras por tiempo (`frameVisibleEnComun`); fuera del vídeo de una vista se queda donde estaba y su miniatura lo dice. **Cambiar de vista no mueve el cursor**: la primera versión llevaba la nueva al frame más próximo y la antigua, a su vez, al frame visible en el tiempo de aquella, con lo que cada cambio movía hasta un frame; ahora cada vista sigue en su frame y solo la que se activa con el cursor fuera de su vídeo va al más próximo. El teclado solo mueve la activa (`useNavegacionFrames(…, activa)`). El lienzo de una vista recién montada recibía en blanco el frame ya decodificado (los de una vista sin lienzo en pantalla solo se guardan en `ultimoFrame`): ahora el `ref` del canvas, al engancharse, pinta el último frame (lo encontró una captura de pantalla; lo vigila una prueba). **Seguimiento de una vista cada vez (D8)**: mientras una sigue, el botón de la otra está desactivado con un aviso (el worker de cada una sigue en segundo plano al cambiar de vista). Las dos reparten la memoria de la caché de frames (`VideoAbierto.repartirMemoria`). **Recuperar**: una sesión de dos vistas pide los dos vídeos (`FaltanVideos`): se abre uno (por «Cargar vídeo» o «Continuar»), se reconoce su vista por la huella (`vistaDeHuella`) y se pide el que falta; uno ajeno se rechaza; con los dos, el visor continúa con la referencia como A (`armarSesion`). `App` lleva ahora una lista de vídeos en uso y cierra los que dejan de estarlo. En el guardado, `sinGuardar` hace que la sesión con una vista recién añadida se guarde al montar. Pruebas: vídeo nuevo `numerado25` (25 fps constantes, 90 frames, con el número de cada frame en bloques; `setpts` en coma flotante repetía algún milisegundo y el vídeo salía con frames de más o de menos, así que con fps constante distinto de 30 no se reescriben los tiempos) y e2e: añadir, rechazar el mismo vídeo, cursor común frente a la verdad por tiempo en los dos sentidos (A de 30 fps con huecos y B de 25), el teclado, fuera de rango, guardado de las dos vistas, recuperar abriendo cualquiera de los dos y seguir de una en una (B = `rojo`). **Pendiente de este paso** (no se ha hecho y no bloquea): las dos vistas lado a lado en escritorio y móvil girado (D5; hoy es la misma miniatura), editar el desfase (paso 4) y los ajustes del filtro por vista (se guarda el de la referencia).

**Paso 4 — sincronía por evento visual y ajuste fino** (`core/sincronia/evento.ts`, `ui/visor/SincronizarVistas.tsx`, `useCursorComun`, `Visor.tsx`, `CuerpoVisor.tsx`). Núcleo con tests de valor conocido: `desfaseDeEvento` (`t_ref − t_vista`; con una palmada a 1,000 s en A y a 0,520 s en B, el desfase es 0,480 s y el evento de B queda en el instante del de A), `incertidumbreEvento` (medio paso de cada vista: ±33 ms entre dos vídeos de 30 fps, ±37 ms entre 30 y 25), `pasoTipico` (inversa del fps mediano: no lo mueven los frames saltados), `ajustarDesfase`, `sincroniaTrasAjuste` y `ajusteManual` (lo movido a mano sobre lo que dio el método). Interfaz: en la pestaña «Vídeo» con dos vistas, «Sincronizar las vistas» con el desfase de B, el método y la precisión; «Marcar el evento en las dos vistas» desenlaza el cursor (cada vista se mueve sola) y se marca el frame del evento de cada una con un botón **sobre el vídeo** (el panel de la pestaña queda fuera de pantalla al recorrerlo en el móvil) o con los de la tarjeta; «Aplicar» fija el desfase y vuelve a enlazar; «Cancelar» lo deja como estaba. «B un frame antes / después» ajusta de a un frame de B. «Quitar la sincronía» vuelve a 0. El desfase y la sincronía de cada vista viven en `Visor.tsx` (`sinc`, sobre lo que traía cada vista) con un contador (`revSinc`) para el guardado; al cambiar un desfase las demás vistas se vuelven a poner según la activa (`sincronizar` ahora parte siempre del frame de la activa, no de un instante guardado: si no, con B activa el cursor quedaba con el desfase viejo). Se guarda y se recupera (esquema 3, ya previsto: `desfase` y `Sincronia.evento`). Pruebas e2e (A = `verde` a 30 fps con huecos y B = `numerado25` a 25 fps; el evento es el frame 46 de A y el 13 de B): marcar con cada vista moviéndose sola, desfase propuesto igual a la diferencia de instantes del contenedor, aplicar (desfase, método y ±37 ms), el frame del evento en B tras aplicar, el cursor común con el desfase (B va a t − desfase), el ajuste fino (+40 ms y un frame antes en B), cancelar, el guardado de desfase, método e instantes, recuperar con los dos vídeos y quitar. **Pendiente:** el audio (paso 5) comprobará este desfase; con vídeos reales del usuario se verá cuánto se desvían audio e imagen.

**Paso 1 — glosario dentro de la app** (`ui/glosario/`). 14 entradas como datos (`entradas.ts`: ángulo sin cero y relativo, cero de referencia, filtro y corte, velocidad y aceleración, seguido / dudoso / perdido / a mano, huecos, interpolado, anclas y reenganche, longitud de los segmentos, escala y su precisión, tiempo del vídeo y fps variable, tiempo común y desfase, sincronía por evento y su precisión, dónde se guardan los datos), con los umbrales del código. Un panel (`DialogoGlosario`, cargado solo al abrirlo) con la entrada pedida abierta y a la vista; `InfoGlosario` (icono ⓘ) junto a cada valor o aviso: el filtro, el ángulo sin cero y el relativo, el cero, la velocidad, los marcadores, las anclas, los huecos cortos, el resumen de la gráfica (sin valor, interpolados), el título de la gráfica, la escala, los segmentos de la escala, los datos del vídeo y la sincronía; y un botón «Glosario» en la cabecera (también en la portada). Las notas de la gráfica de la limitación 8 (huecos sin línea, interpolado a trazos, banda de los segmentos) están en las entradas; la nota de debajo de la gráfica no se ve nunca (`!ampliada`: escritorio y móvil la tienen ampliada o no la montan), así que sus iconos van en el título de la gráfica y en el resumen. El panel lleva el foco dentro al abrir (con el foco en el botón de abajo, las flechas seguían moviendo el vídeo), bloquea el scroll de la página y detiene el teclado. Un icono con `-my-1.5` no cambia la altura de su fila; en la gráfica de segmentos de «Solo gráficas» en horizontal (216 px de ancho) el título se partía en más líneas y la gráfica bajaba de 80 px: ahí no lleva icono. Pruebas: 4 de núcleo (`entradas.test.ts`: ids únicos y con texto, cada icono apunta a una entrada y cada entrada tiene su icono) y 5 e2e (listado desde la cabecera con Escape y foco de vuelta; icono → entrada abierta, página y teclado quietos; los nueve conceptos con su icono y su entrada; huecos e interpolado del resumen; tiempo común). Con la entrada de cada concepto nuevo se añade un icono: es una regla de `CLAUDE.md`.

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | Glosario dentro de la app | Sonnet |
| 2 | Visor por vistas sin cambiar nada visible (y fuera la deuda de supresiones); esquema 3 y migración; sesión con varias vistas en la persistencia | Opus |
| 3 | Tiempo común en el núcleo; abrir la segunda vista; cursor común; las dos vistas en pantalla | Opus (núcleo) + Sonnet (interfaz) |
| 4 | Sincronización por evento visual y ajuste fino | Sonnet |
| 5 | Sincronización por audio (decodificar, envolvente, GCC-PHAT en un worker) | Opus |
| 6 | Medida frontal (FPPA de rodilla) en el catálogo, con su convención y test; modelo frontal | Opus |
| 7 | Gráficas en el tiempo común (alineadas y superpuestas) y CSV con tiempo común | Sonnet |
| 8 | Cierre de fase: revisión, documentación y limitaciones | Opus |

Los pasos 4 y 5 se pueden intercambiar: el 4 da antes algo usable con cualquier vídeo; el 5 necesita vídeos reales con palmada para afinarse.

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Vista de referencia | La primera que se abre (normalmente la lateral); se puede cambiar |
| D2 | Sincronización | Audio automático y comprobación con un evento visual, con ajuste fino de un frame; solo visual si no hay audio |
| D3 | Medida frontal | FPPA de rodilla (valgo dinámico), con sus 3 marcadores frontales |
| D4 | Marcadores | Un modelo por sesión; cada vista dice cuáles sigue; el mismo id es el mismo punto en todas |
| D5 | Interfaz en el móvil | Vertical: una vista activa con conmutador A / B y miniatura de la otra; girado y escritorio: las dos a la vez |
| D6 | Gráficas | Una por medida, alineadas en el tiempo común con cursor compartido; opción de superponer las de la misma unidad |
| D7 | Esquema | Subir a 3 para que una app vieja no abra ni reescriba (y pierda) una sesión de dos vistas |
| D8 | Seguimiento | Una vista cada vez, en cola |
| D9 | CSV | Uno por vista con columna de tiempo común, sin remuestrear |
| D10 | Rango del tiempo común | La unión de los dos vídeos; fuera de un vídeo, sin imagen y sin valor |

## Riesgos

- **Dos vídeos a la vez en el móvil:** memoria de las cachés y decodificadores por hardware. Se mide en el paso 3 con los vídeos del usuario antes de dar por buena la interfaz de dos vistas a la vez; si no da, se queda en una vista activa y la otra en pausa.
- **Retardo audio–vídeo de cada móvil:** puede hacer que el desfase por audio no case con la imagen. Mitigado por la comprobación visual (D2); se cuantifica con vídeos reales.
- **Complejidad de la interfaz en el móvil:** la pantalla ya está llena con una vista. Por eso, en vertical, una vista activa cada vez (D5).
- **Medida frontal 2D:** el FPPA es una proyección y depende de que la cámara esté de frente y a la altura de la rodilla. Va al glosario y a `docs/grabacion.md` (cómo colocar el segundo móvil).

## Qué necesito del usuario

- Antes del paso 5: **dos vídeos reales** de la misma sentadilla, grabados a la vez con dos móviles (uno de lado, otro de frente, a la altura de la rodilla), con una **palmada** al principio que se vea y se oiga en los dos. Con ellos se mide el retardo audio–vídeo y se afina la sincronización.
