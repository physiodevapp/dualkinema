# Fase 4: grabación con dos móviles

Estado: **plan aceptado** (2026-10-24). Decisiones D1–D12 aceptadas por el usuario tal como se proponen. En curso: paso 1 hecho (ver «Hecho»); este documento recoge cómo queda cada pieza, como `docs/plan-fase-3.md`.

Objetivo de la fase (de `CLAUDE.md`): emparejamiento por código o QR, sincronización de relojes, inicio programado, pitido de referencia y ajuste fino por audio. Además, lo que la fase 3 dejó para aquí:
- la **toma doble que el usuario no puede hacer solo** (cierre de la fase 3: con los dos móviles arrancados a mano, la toma de frente salió sin resolución suficiente);
- **más medidas reales de la sincronía por audio** (limitación 1: una sola medida, +43 ms entre el audio y la imagen, sin saber cuánto es retardo de cada móvil y cuánto error al marcar la palmada);
- la **deriva entre relojes** (§2 de la fase 3: no se corrige; esta fase sincroniza los relojes y puede medirla);
- la limitación 2 (la comprobación compara el audio sin el ajuste fino), porque esta fase toca esa pieza.

Caso de uso que guía las decisiones: **el usuario está solo**, con dos Android en trípode (uno de perfil, otro de frente) y es a la vez quien graba y quien hace la sentadilla. Con un paciente, el fisioterapeuta tampoco debería tener que tocar los dos móviles a la vez. Por eso: arrancar desde cualquiera de los dos, con cuenta atrás y duración fijada, sin volver a tocar nada hasta que acaba.

Criterio de cierre: con los dos Android del usuario, sin ayuda de nadie:
- emparejar los dos móviles escaneando un QR (o escribiendo un código de 6 letras) y ver en los dos que están conectados, con el reloj común y su precisión;
- elegir en cada uno su vista (perfil o frente) y encuadrar;
- pulsar «Grabar» en cualquiera de los dos: cuenta atrás, pitido de referencia, grabación de los dos a la vez y parada sola a la duración elegida;
- pasar el vídeo de un móvil al otro con «Compartir» (Quick Share) y abrir los dos como una sesión con la sincronía ya propuesta (por el pitido, comprobada con el reloj), con su precisión y la distancia entre los móviles;
- comprobarla con un evento visual (lo de la fase 3) y seguir trabajando como hasta ahora.

Lo que **no** entra: ver la cámara del otro móvil en directo (sería vídeo por la red), pasar el vídeo por la red, las dos vistas lado a lado (pendiente de la fase 3), 3D (fase 5).

---

## 1. Dónde se graba [D1]

| Alternativa | A favor | En contra |
|---|---|---|
| **a. Dentro de la app** (`getUserMedia` con la cámara trasera, codificado con WebCodecs) | Inicio programado de verdad; cada archivo sabe en qué instante del reloj común empieza; audio sin procesar (sin cancelación de eco ni control de ganancia); sin estabilización digital, que recorta y deforma; metadatos de la grabación dentro del archivo | La calidad la limita lo que Chrome deja usar de la cámara (a menudo 1080p a 30 fps; 60 fps solo en algunos móviles; poco control de enfoque y exposición) |
| b. Con la cámara del móvil (la app solo da la cuenta atrás y el pitido) | Mejor imagen (lo que dé la app de cámara, 4K, 60 fps, HEVC) | El arranque es manual (lo que la fase 3 ya hace); el reloj no sirve de nada, porque la app de cámara no dice cuándo empezó; solo queda el audio |
| c. Las dos | La (a) para la toma doble y la (b) como «claqueta» con vídeos de la cámara | Más interfaz |

**Recomendación: (a)**. La apertura de vídeos grabados con la cámara (el camino de la fase 3) se queda como está, y el **pitido** del §6 también se puede usar como claqueta con dos cámaras arrancadas a mano: sale casi gratis, porque el pitido se calcula igual. Lo que la cámara de cada móvil da dentro de Chrome se mide en el paso 1 antes de escribir nada más. Si el segundo móvil no da resolución suficiente ni dentro de la app, el problema es su cámara y no la sincronía: se dirá con datos.

## 2. Cómo se escribe y se guarda el vídeo [D2, D3]

**Codificar (D2).** Dos opciones:
- `MediaRecorder`: lo más simple, pero no controla el intervalo entre fotogramas clave (afecta a lo rápido que el visor salta a un frame), devuelve MP4 fragmentado o WebM sin índice y no dice con precisión cuándo empieza el primer frame.
- **Mediabunny** (ya está en el proyecto, D3 de la fase 1): `MediaStreamVideoTrackSource` y `MediaStreamAudioTrackSource` codifican las pistas de la cámara y el micrófono con WebCodecs y escriben un MP4 con `keyFrameInterval` a elección (1 s), `timestampBase` y metadatos (`setMetadataTags`).

**Recomendación: Mediabunny.** Códec por orden de preferencia, según lo que diga `canEncode` en ese móvil: H.264 por hardware (AAC para el audio), y si no, VP9 u Opus. El micrófono se abre con `echoCancellation`, `noiseSuppression` y `autoGainControl` desactivados: la cancelación de eco borraría el pitido del propio móvil, y el control de ganancia cambia el nivel a mitad de grabación.

**Dónde se guarda (D3).** Un vídeo de paciente no puede salir del móvil, pero tampoco conviene tenerlo entero en memoria (3 min a 12 Mb/s son unos 270 MB). **Recomendación:** se va escribiendo en el almacenamiento privado del origen (OPFS, con `StreamTarget`), con una duración máxima (5 min) y un aviso si queda poco espacio (`navigator.storage.estimate`). Si OPFS falla, se escribe en memoria con una duración máxima más corta. Al acabar, la grabación aparece en una lista «Grabaciones de este móvil» con:
- **Abrir** en el visor (sin copiarla);
- **Compartir** (`navigator.share` con el archivo: la hoja de Android con Quick Share, ver D11);
- **Guardar** en Descargas;
- **Borrar**.

La lista dice siempre que los vídeos están en el almacenamiento de la app y cuánto ocupan: es dato clínico guardado en el móvil, y borrarlo tiene que ser fácil. La huella del archivo (`claveHuella`) sirve igual para el que sale de OPFS y para su copia en Descargas (mismos bytes).

## 3. Señalización: el único servidor [D4, D5]

Solo hace falta un canal por el que los dos móviles de una sala se pasen mensajes cortos (hola, listo, pings del reloj, «graba en T», «para»). **Por ahí no va vídeo, ni audio, ni imágenes, ni nada del paciente**: ni nombre, ni sesión, ni ángulos. Solo un id de grabación aleatorio, el rol, la vista elegida, el estado (cámara lista, resolución, fps, espacio libre) y marcas de tiempo.

| Alternativa | A favor | En contra |
|---|---|---|
| **a. Un Worker de Cloudflare aparte con un Durable Object por sala** (WebSocket con hibernación) | Mismo proveedor y cuenta que el despliegue; Durable Objects con SQLite entran en el plan gratuito; no se pausa; sin claves en el cliente; la sala limita a 2 y caduca | Es código de servidor (poco: reenviar mensajes dentro de una sala de dos) y otro Worker que configurar en el panel |
| b. Supabase Realtime (broadcast por canal) | Sin código de servidor, solo el cliente | Otra cuenta y otro proyecto (el plan gratuito admite 2 activos); **los proyectos gratuitos se pausan tras 7 días con poca actividad de la base de datos**, y no consta que el Realtime cuente: con un uso esporádico, el día que se necesite puede estar pausado |
| c. Sin servidor: WebRTC con la oferta y la respuesta en dos QR (cada móvil escanea el del otro) | Nada pasa por un servidor | Dos escaneos cada vez; falla si los móviles no se ven en la red (sin servidor TURN no hay plan B); hay que decodificar QR en la app |

**Recomendación: (a), en un Worker aparte** (`dualkinema-senal`, carpeta `senal/` del mismo repositorio, con su propio *build* en Workers Builds). El motivo de que vaya aparte: un *changelog* de Cloudflare dice que los Workers con Durable Objects no tienen URL de previsualización, y la documentación nueva de *Previews* dice que cada previsualización tiene su propio espacio de Durable Objects. Las dos no pueden ser verdad a la vez, y si se pierden las previsualizaciones de cada rama se pierde la forma de trabajar del usuario. Con el Worker de la app solo estático, esto no puede pasar. El relé no entiende los mensajes, solo los reenvía (con un tamaño máximo y un ritmo máximo), así que casi nunca cambia: el protocolo vive en el cliente y lleva versión (si los dos móviles no hablan la misma versión, se dice). Las previsualizaciones de la app usan el relé de producción.

`CLAUDE.md` cambia en ese paso: «sin código de servidor» pasa a «sin código de servidor en la app; el relé de salas es un Worker aparte».

**Sin WebRTC en esta fase (D5).** Se hablaría de móvil a móvil con menos latencia, y eso daría un reloj algo más preciso (ver §4). Pero el reloj no es lo que fija el desfase final (lo fija el pitido, §6), y WebRTC añade STUN, NAT, nombres mDNS y conexiones que fallan según la red. No compensa. Queda como mejora posible.

**Lo que ve el proveedor:** la IP de cada móvil al conectarse (dato del fisioterapeuta, no del paciente) y mensajes sin contenido clínico. Se dice en la entrada «Dónde se guardan los datos» del glosario.

## 4. Emparejamiento y reloj común [D6, D7]

**Emparejar (D6).**
- Un móvil pulsa «Grabar con dos móviles» y crea una sala: un código de 6 caracteres sin letras que se confundan (sin 0/O ni 1/I/L) y un QR con la URL `…/?sala=CÓDIGO`.
- El otro escanea el QR con la cámara de Android (abre la app en la sala sin decodificar nada en la app) o escribe el código.
- El QR lleva el origen actual: en una previsualización, los dos móviles acaban en la misma.
- La sala admite 2, caduca a los 10 min sin nadie y no guarda nada.
- Cada móvil elige su vista (perfil, mirando a un lado u otro; frente o espalda), y la de perfil será la referencia (vista A), como exige la regla de la pierna que ve la cámara. Los dos ven el estado del otro (conectado, cámara lista, resolución y fps, espacio libre, batería si se puede leer).
- Mientras están emparejados, *Screen Wake Lock* mantiene las dos pantallas encendidas: con la pantalla apagada, Android corta la cámara y el WebSocket. Si un móvil se desconecta, se ve en el otro y se reconecta solo.

**Reloj común (D7).** Cada móvil usa su `performance.now()` (monotónico; `Date.now()` puede saltar). Se estima el desfase entre los dos relojes como en NTP, con cuatro marcas por intercambio:
- θ = ((t₂ − t₁) + (t₃ − t₄)) / 2
- retardo δ = (t₄ − t₁) − (t₃ − t₂)

Se hacen unos 30 intercambios al emparejar y uno por segundo después (también durante la grabación). Se quedan los de menor retardo (el ruido de la red solo añade retardo) y se toma su mediana. La **cota** del error es la mitad del menor retardo: sin suponer nada sobre la asimetría de la red, el error no puede ser mayor. Se muestra «Reloj común ± N ms».

- Por el relé, el retardo de ida y vuelta será de unos 20–80 ms según la red: cota de ±10–40 ms, y en la práctica bastante menos. **Es suficiente**, porque el reloj solo sirve para tres cosas:
  1. arrancar los dos a la vez (unos ms dan igual);
  2. situar el pitido en cada grabación (la búsqueda pasa de ±10 s a ±0,3 s, y un pico falso deja de ser probable);
  3. dar un desfase de respaldo si el audio falla.
- **Deriva:** con los intercambios de antes, durante y después de grabar se ajusta una recta (desfase frente a tiempo) y se mide la deriva en ppm. Se guarda y se muestra, pero **no se corrige** (el modelo sigue siendo un desfase constante): 100 ppm en 30 s son 3 ms. Si con los móviles del usuario pasa de 1 ms en la duración máxima, se avisa. Corregirla (una escala además del desfase) cambiaría el modelo de tiempo y el esquema: no en esta fase.
- Núcleo en `core/reloj/` (TypeScript puro, sin DOM): estimación, filtro, cota, recta de la deriva. El acceso a `performance.now()` va en la interfaz, inyectable (las pruebas le ponen un desfase conocido). La regla de `CLAUDE.md` se mantiene: el análisis usa el tiempo del vídeo; el reloj común solo programa y anota.

## 5. Inicio programado y parada [D8]

- Cualquiera de los dos pulsa «Grabar» con una **cuenta atrás** (5, 10 o 15 s, para llegar a su sitio) y una **duración** (10–300 s, o «hasta que pare a mano», desde cualquiera de los dos). El que pulsa manda «empieza en T» en el reloj común (T = ahora + cuenta atrás) y el otro confirma. Si no confirma a tiempo, no se graba en ninguno.
- Los dos abren el `Output` un poco antes de T y **descartan lo capturado antes de T**. Cada archivo anota el instante de su primer frame en el reloj común, con su cota.
- Cuenta atrás en las dos pantallas y en voz (pitidos cortos los últimos 3 s; el pitido de referencia del §6 sale ya grabando).
- Parada a T + duración en los dos. Si un móvil pierde la conexión mientras graba, **sigue grabando** hasta su hora de parada: ya sabe cuándo parar y el pitido se grabó al principio.
- **Metadatos en el MP4** (`comment` con un JSON pequeño):
  - la app y la versión del formato;
  - el id aleatorio de la grabación doble;
  - el rol y la vista;
  - el instante del primer frame en el reloj común y su cota;
  - la deriva medida;
  - el plan de pitidos (§6).

  Nada del paciente. Así los datos viajan con el archivo, aunque Android le cambie el nombre al compartirlo. Si en el paso 2 se ve que Mediabunny no los lee de vuelta, plan B: un archivo `.json` con el mismo nombre (más incómodo de pasar).

## 6. Pitido de referencia de ida y vuelta [D9]

El audio de la fase 3 alinea **lo que oyen** los dos micrófonos. Con una palmada o un pitido que sale de un solo sitio, el sonido llega antes al micrófono más cercano: con un móvil a 3 m más que el otro, **8,7 ms de sesgo** (343 m/s), siempre hacia el mismo lado.

**Propuesta: los dos móviles pitan, por turnos** (la idea de *BeepBeep*, Peng et al., 2007):
- A emite su secuencia a T + 1,0 s y B la suya a T + 2,5 s.
- Cada una son tres barridos cortos (2→5 kHz, 40 ms) con separaciones irregulares, para que no haya dos alineaciones parecidas.
- Cada grabación contiene las dos secuencias: la propia, oída a pocos cm, y la del otro, oída a la distancia D.

Con la correlación de la fase 3 (envolvente y GCC-PHAT, sin cambios) aplicada **a cada secuencia por separado** (el reloj dice dónde está cada una ±0,3 s):

- secuencia de A: d₁ = Δ − D/c
- secuencia de B: d₂ = Δ + D/c
- **Δ = (d₁ + d₂) / 2**: el desfase sin el sesgo de la distancia, sin conocer la distancia ni la latencia de los altavoces;
- **D = c · (d₂ − d₁) / 2**: la distancia entre los móviles, que sirve de prueba. Si sale 3,1 m y están a unos 3 m, todo cuadra; si sale −2 m o 40 m, algo ha ido mal y se dice.

Cuándo sale cada pitido de verdad (la latencia de salida del altavoz en Android, de 20 a más de 100 ms) da igual: los dos micrófonos graban el mismo sonido. Solo tiene que caer dentro de la grabación y de la ventana (por eso ±0,3 s y no menos). Se emite con Web Audio, programado en el reloj común.

- Alternativas: un solo pitido desde A (más simple, pero con todo el sesgo de la distancia entre los móviles, que no se puede quitar sin medirla) o la palmada de la fase 3 (el sesgo depende de dónde esté la persona). **Recomendación: ida y vuelta**. El núcleo nuevo es pequeño: segmentar, correlacionar dos veces y combinar. Se prueba con grabaciones sintéticas de desfase y distancia conocidos.
- **Claqueta con la cámara del móvil:** el mismo pitido desde un móvil (sin pareja) antes de grabar con las cámaras arrancadas a mano. Sin el otro móvil no hay ida y vuelta (queda el sesgo de la distancia), pero da un sonido más limpio que una palmada.
- **Lo que el pitido no sabe** (igual que en la fase 3): cada móvil puede tener su propio retardo entre el audio y la imagen dentro del archivo. Grabando con la app, el audio y el vídeo llevan las marcas de captura de Chrome, y puede que ese retardo sea pequeño y estable. No se sabe: se mide en el paso 8. Mientras tanto, **no se aplica ninguna corrección fija** (decisión de la fase 3, que se mantiene).

## 7. Qué desfase se propone al abrir la grabación doble [D10]

| Fuente | Precisión esperada | Qué alinea |
|---|---|---|
| Reloj común + instante del primer frame | ± cota del reloj + latencia de captura hasta la app (decenas de ms; se mide en los pasos 1–2) | la imagen, de forma aproximada |
| Pitido de ida y vuelta | ±0,5 ms (una muestra de la envolvente) | el audio, sin el sesgo de la distancia |
| Evento visual (fase 3) | ± medio frame de cada vista (±33 ms a 30 fps, ±17 ms a 60) | la imagen |

**Recomendación:**
- Se propone el **pitido** si su calidad es fiable (≥ `CALIDAD_AUDIO_MINIMA`), la distancia sale razonable (0,3–15 m) y cae dentro de la cota del reloj (con un margen).
- Si no, se propone el **reloj**, con su precisión y el aviso.
- La comprobación con un evento visual sigue como en la fase 3: informa y, si discrepan, ofrece usar el del evento.

Como siempre, nada cambia hasta pulsar «Aplicar». Se muestran las tres cifras que haya, por ejemplo: «pitido +0,1832 s (calidad 40, móviles a 3,1 m) · reloj +0,19 s ± 18 ms · evento visual …». Si las medidas del paso 8 muestran que la imagen se desvía del audio de forma sistemática con la app, se revisa esta decisión con datos.

Se arregla aquí la **limitación 2 de la fase 3**: la comprobación compara con el desfase aplicado (con su ajuste fino), no con el que dio el método.

## 8. Pasar el vídeo de un móvil al otro [D11]

El análisis necesita los dos vídeos en el mismo dispositivo, y el vídeo **no puede pasar por el servidor**.

| Alternativa | A favor | En contra |
|---|---|---|
| **a. «Compartir» de Android (Quick Share)** desde la lista de grabaciones (`navigator.share` con el archivo) | De móvil a móvil por Bluetooth o Wi-Fi directo, sin internet, sin código propio | Un paso a mano; unos segundos por cada 100 MB |
| b. WebRTC (canal de datos) de móvil a móvil | Automático | Mucho código; si los móviles no se ven en la red, falla (o el vídeo pasaría por un servidor TURN, que no se permite); roza la restricción «nunca vídeo» y habría que aceptarla a propósito |
| c. Google Drive u otra nube | Cómodo | Sube vídeo de pacientes a un servidor: no |

**Recomendación: (a).** Si con el uso resulta pesado, (b) se puede proponer más adelante como decisión aparte.

## 9. Abrir la grabación doble, persistencia y esquema [D12]

- **«Abrir la grabación doble»** (portada, y desde la lista de grabaciones con el propio vídeo ya puesto): se eligen los dos archivos. La app lee sus metadatos y:
  - comprueba que son la misma grabación doble (mismo id; uno ajeno o sin metadatos se rechaza, y queda el camino de siempre);
  - pone la de perfil como referencia (vista A) y fija la orientación de cada una sin preguntarla;
  - abre directamente «Sincronizar las vistas» con la propuesta del §7.

  Un vídeo de la app abierto solo funciona como cualquier otro.
- **Esquema 4 (D12).** La sincronía gana el método `pitido` (con d₁, d₂, la calidad de cada secuencia, la distancia y el desfase que dio) y el método `reloj` (con su cota y la deriva), y cada vista puede guardar su `grabacion` (id, rol, instante del primer frame en el reloj común y su cota). Una app de esquema 3 rechazaría el método nuevo como inválido, en vez de decir «es de una versión más nueva»; además, la regla de `CLAUDE.md` pide subir la versión si una app vieja no puede leerlo. Por eso: **esquema 4**, migración 3 → 4 directa (no cambia nada de lo guardado) con su test. La cabecera del CSV dice el método nuevo con sus números.
- **Glosario:** entradas nuevas con su icono: reloj común y su precisión, deriva, pitido de ida y vuelta (y por qué da la distancia), grabación doble, lo que viaja por el relé (en «Dónde se guardan los datos»).

## 10. Pruebas

- **Núcleo (Vitest):**
  - reloj: retardos asimétricos conocidos, ruido, valores atípicos, deriva de 50 ppm, pocos intercambios; la cota nunca es menor que el error real en los casos sintéticos;
  - protocolo: validación de cada mensaje y versión;
  - pitido: grabaciones sintéticas con Δ y D conocidos (un móvil a 3 m, desfases negativos, eco distinto en cada micro, una secuencia que no se oye → sin propuesta), con la generación de `sintetico.ts`;
  - metadatos: ida y vuelta y rechazo de lo ajeno;
  - migración 3 → 4.
- **Relé:** la lógica de la sala (dos como mucho, caducidad, tamaño y ritmo máximos) como clase pura con tests; el Worker, una capa fina encima.
- **e2e (Playwright):** Chromium tiene cámara y micrófono falsos (`--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture` con un `.y4m` de frames numerados y `--use-file-for-fake-audio-capture` con un `.wav`). Dos navegadores (dos móviles) y un relé local:
  - emparejar por código;
  - el reloj con un desfase inyectado conocido (estimado dentro de su cota);
  - grabar con inicio programado y duración;
  - cada archivo se abre en el visor, con los frames en orden y la duración pedida;
  - los metadatos con el mismo id;
  - «Abrir la grabación doble» configura las vistas y propone el desfase del reloj.

  En Playwright el códec será VP9 (su Chromium no trae H.264).
- **Lo que no se puede probar aquí:** la cadena acústica real (el altavoz de un móvil grabado por el micrófono del otro: la cámara falsa no oye los pitidos de la app), H.264 por hardware, el retardo entre audio e imagen de cada móvil y el comportamiento de Android con la pantalla y la batería. Eso va al paso 8, con los móviles del usuario.

## Hecho

**Paso 1 — laboratorio** (`src/media/laboratorio.ts`, `informe.ts`, `src/ui/Laboratorio.tsx`, `core/tiempo/saltos.ts`). Una sección de la portada que solo existe con **`?laboratorio`** en la dirección (`App.tsx`; se descarga entonces, la portada normal no cambia). «Medir este móvil» mide y escribe un informe de texto para copiar y pegar («Copiar informe»):
- **Entorno:** modelo, Android y Chrome (`userAgentData`), pantalla, núcleos y memoria, y qué APIs hay (`VideoEncoder`, `AudioEncoder`, `MediaStreamTrackProcessor`, `wakeLock`, `share` con archivos, OPFS).
- **Almacenamiento y pantalla:** cuota y uso, escritura de 16 MB en OPFS (velocidad, y que se lea lo escrito) y si se concede mantener la pantalla encendida.
- **Códecs:** H.264, HEVC, VP9 y AV1 a 1080p30, 1080p60 y 4K30, cada uno «hardware», «software» o «no» (`VideoEncoder.isConfigSupported` con `prefer-hardware` y `prefer-software`), más AAC y Opus.
- **Micrófono sin procesar:** lo que Chrome concede con la cancelación de eco, la supresión de ruido y el control de ganancia desactivados.
- **Cámaras:** por cada una (hasta 4), sus capacidades (rangos, enfoque, exposición, zoom, linterna) y, en cuatro modos (720p30, 1080p30, 1080p60, 4K30), qué concede Chrome y **qué entrega de verdad**: frames contados 1,5 s con `MediaStreamTrackProcessor` (fps medido, paso máximo, saltos y frames perdidos). Se pide con `ideal`, porque con `exact` una combinación que la cámara no tiene solo da un error y no dice qué da; el informe anota si lo concedido es lo pedido (`esLoPedido`).

«Grabar 10 s» (con resolución, códec y cámara a elegir y vista previa): es ya la grabación del paso 2 en pequeño: Mediabunny con `MediaStreamVideoTrackSource` y `MediaStreamAudioTrackSource` a un MP4 en memoria, fotograma clave cada 1 s, `latencyMode: 'realtime'`, micrófono sin procesar y **`frameRate: null`** (un frame por cada que entrega la cámara con su instante real: con el fps de la pista Mediabunny repetiría o saltaría frames y la prueba no mediría lo que la cámara da). Después **abre el archivo escrito y lo analiza**: códec, frames, fotogramas clave, fps medio y mediano, paso mínimo y máximo, saltos y frames perdidos (`saltosDeFrames`), duración y, sobre todo, **dónde empieza el sonido respecto a la imagen dentro del archivo** (`inicioAudioMenosVideoMs`: el primer dato sobre el retardo audio–imagen de la app). El archivo se puede «Abrir en el visor», «Compartir» (hoja de Android) o «Guardar». `?laboratorio&duracion=N` cambia los 10 s (las pruebas e2e usan 3).

Núcleo con tests de valor conocido: `saltosDeFrames` (sin saltos a 30 fps, un hueco de 4 pasos = 3 frames perdidos, el jitter normal de ±20 % no cuenta, menos de 2 frames) y `formatearInforme` (texto del informe). Pruebas e2e con la cámara y el micrófono falsos de Chromium (`lanzarNavegadorConCamaraFalsa`): sin `?laboratorio` no aparece; «Medir este móvil» da las cinco secciones, el micrófono sin eco ni ganancia automática y los fps medidos coinciden con los concedidos (la cámara falsa da 20 aunque se le pidan 30, y el informe lo dice); la grabación de 3 s se abre en el visor con **el mismo número de frames que cuenta el informe**, con audio, duración y fotogramas clave. Lo que no se puede probar ahí (H.264 por hardware, cámaras y micrófonos reales, Quick Share) lo da el informe en los móviles del usuario.

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo |
|---|---|---|
| 1 | **Laboratorio** (página oculta, `?laboratorio`): qué da cada móvil (resoluciones y fps de la cámara trasera, enfoque y exposición, `canEncode` de H.264 / HEVC / VP9 / AV1 a 1080p30 y 60, audio sin procesar, OPFS y espacio, *Wake Lock*, `navigator.share` con archivos) y una grabación de prueba de 10 s con Mediabunny que se abre en el visor. Resultado en texto para copiar y pegar | Sonnet |
| 2 | Grabar con un móvil dentro de la app: vista previa, ajustes según lo que dé el móvil, MP4 a OPFS con fotograma clave cada 1 s, audio sin procesar, metadatos, lista de grabaciones (abrir, compartir, guardar, borrar). e2e con la cámara falsa | Opus |
| 3 | Núcleo del reloj común (estimación, cota, deriva) y del protocolo de la sala, con tests | Opus |
| 4 | Relé de salas (`senal/`, Worker aparte con Durable Object) y emparejamiento en la app: código y QR, roles y vistas, estado del otro, reloj visible, *Wake Lock*, reconexión. e2e con dos navegadores. `CLAUDE.md`: el Worker aparte | Opus |
| 5 | Grabación doble: inicio programado desde cualquiera de los dos, cuenta atrás, duración, parada, metadatos del reloj | Opus |
| 6 | Pitido de ida y vuelta: núcleo (segmentar, correlacionar, combinar, distancia) con tests, y emisión programada; claqueta sin pareja | Opus |
| 7 | «Abrir la grabación doble», propuesta de sincronía (§7), esquema 4 y migración, cabecera del CSV, glosario, limitación 2 de la fase 3 | Opus |
| 8 | **Medidas reales con el usuario** (ver «Qué necesito») y ajuste: umbrales, ventana, si el audio se desvía de la imagen con la app; `docs/grabacion.md` (dónde poner los dos móviles, volumen, cuenta atrás) | Opus |
| 9 | Cierre de fase: revisión, documentación y limitaciones | Opus |

El paso 1 va antes que todo porque sus datos deciden cosas reales: el códec, si hay 60 fps y si merece la pena grabar dentro de la app con el segundo móvil. Los pasos 2 y 6 dan algo usable sin emparejar: grabar con un móvil y la claqueta con dos cámaras.

## Resumen de decisiones (propuestas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Dónde se graba | Dentro de la app (`getUserMedia` + WebCodecs); los vídeos de la cámara se siguen abriendo como hasta ahora |
| D2 | Cómo se codifica | Mediabunny con las pistas de la cámara y el micrófono; H.264 si el móvil lo codifica, si no VP9; fotograma clave cada 1 s; audio sin cancelación de eco, supresión de ruido ni control de ganancia |
| D3 | Dónde se guarda | OPFS, escrito sobre la marcha, con duración máxima; lista para abrir, compartir, guardar y borrar |
| D4 | Señalización | Worker de Cloudflare aparte con un Durable Object por sala, que solo reenvía; mensajes sin datos clínicos |
| D5 | Conexión entre móviles | Solo por el relé; sin WebRTC en esta fase |
| D6 | Emparejamiento | Código de 6 caracteres y QR con la URL; sala de dos que caduca; la vista de perfil es la referencia; pantallas encendidas |
| D7 | Reloj común | NTP sobre `performance.now()`, filtro de menor retardo, cota = la mitad del menor retardo; deriva medida y mostrada, no corregida |
| D8 | Inicio y parada | Desde cualquiera de los dos, cuenta atrás y duración fijada; cada uno para solo aunque se corte la conexión; metadatos en el MP4 |
| D9 | Pitido de referencia | De ida y vuelta (los dos pitan por turnos): desfase sin el sesgo de la distancia, y la distancia como prueba |
| D10 | Desfase propuesto | Pitido si es fiable y casa con el reloj; si no, el reloj; el evento visual comprueba; nada cambia sin «Aplicar»; sin corrección fija del retardo audio–imagen |
| D11 | Pasar el vídeo | «Compartir» de Android (Quick Share); nada por la red |
| D12 | Esquema | Subir a 4 (métodos `pitido` y `reloj`, datos de la grabación por vista) con migración 3 → 4 |

## Riesgos

- **Lo que Chrome para Android deja usar de la cámara:** resolución, fps (60 puede no estar), enfoque y exposición automáticos que cambian a mitad de toma. Se mide en el paso 1. Si la imagen dentro de la app es claramente peor que la de la cámara del móvil, la recomendación de D1 se revisa (y queda la claqueta).
- **Codificador por hardware:** si un móvil no codifica H.264 a 1080p30 en tiempo real, VP9 por software puede perder frames o calentar el móvil. Paso 1.
- **Sincronía entre el audio y la imagen en lo que graba Chrome:** si no es estable, el pitido alinea el audio pero no la imagen. Se mide en el paso 8 (con un evento visual nítido, y a 60 fps si se puede).
- **Android y la pantalla apagada o la app en segundo plano:** corta la cámara y la conexión. *Wake Lock* y avisos; probar con la batería baja.
- **El relé:** latencia de la red móvil o de una Wi-Fi saturada (peor cota del reloj, sin más consecuencia que ampliar la ventana), límites del plan gratuito (muy por encima de un uso así) y la duda sobre Durable Objects y previsualizaciones (resuelta yendo aparte).
- **Sonido:** pitido demasiado bajo, o saturado en el micrófono del propio móvil (el inicio de la subida sigue sirviendo), eco de la sala, ruido de fondo. Se ve en la calidad de cada secuencia; volumen y distancia van a `docs/grabacion.md`.
- **Espacio y memoria:** OPFS tiene cuota, y Quick Share con archivos grandes es lento. Duración máxima y avisos.
- **El segundo móvil del usuario:** si su cámara no da para seguir los gomets de frente, ninguna sincronía lo arregla. Se sabrá en el paso 1.
- **Permisos por origen:** cámara y micrófono se piden en cada previsualización (`Permissions-Policy` ya permite `camera=(self), microphone=(self)`).

## Qué necesito del usuario

1. **Aceptar o cambiar D1–D12**, sobre todo:
   - D1 (grabar dentro de la app);
   - D4 (Worker de Cloudflare aparte frente a Supabase);
   - D9 (pitido de ida y vuelta);
   - D11 (pasar el vídeo con Quick Share y no por la red).
2. **Modelo de los dos móviles** y versión de Android y de Chrome de cada uno.
3. Tras el paso 1: **abrir el laboratorio en los dos móviles** y pegarme el texto que da, y la grabación de prueba abierta en el visor (¿se ve bien? ¿se mueve bien frame a frame?).
4. Antes del paso 4: **crear en el panel de Cloudflare el Worker del relé** conectado al repositorio (raíz `senal/`, con su dirección `workers.dev` activada). Te daré los pasos exactos cuando llegue.
5. En el paso 8, **unas tomas de medida** (unos 15 minutos):
   - 5 grabaciones dobles con los dos móviles a unos 3 m;
   - en cada una, una palmada de cara a las dos cámaras a 1 m de ellas (y a 60 fps si el laboratorio dice que hay);
   - después, una sentadilla de verdad con los gomets, de perfil y de frente.

   Con eso se compara el pitido, el reloj y el evento visual, y se mide si la imagen se desvía del audio.
