# Fase 4: grabación con dos móviles

Estado: **plan aceptado** (2026-10-24). Decisiones D1–D12 aceptadas por el usuario tal como se proponen. En curso: pasos 1 a 5 hechos (ver «Hecho»); este documento recoge cómo queda cada pieza, como `docs/plan-fase-3.md`.

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
- **Cámaras:** por cada una (hasta 4), sus capacidades (rangos, enfoque, exposición, zoom, linterna) y, en cuatro modos (720p30, 1080p30, 1080p60, 4K30), qué concede Chrome y **qué entrega de verdad**: frames contados 3 s con `MediaStreamTrackProcessor`, sin los primeros 0,7 s de arranque de la cámara (fps mediano y medio, paso mediano y máximo, saltos y frames perdidos). Se pide con `ideal`, porque con `exact` una combinación que la cámara no tiene solo da un error y no dice qué da; el informe anota si lo concedido es lo pedido (`esLoPedido`).

«Grabar 10 s» (con resolución, códec y cámara a elegir y vista previa): es ya la grabación del paso 2 en pequeño: Mediabunny con `MediaStreamVideoTrackSource` y `MediaStreamAudioTrackSource` a un MP4 en memoria, fotograma clave cada 1 s, `latencyMode: 'realtime'`, micrófono sin procesar y **`frameRate: null`** (un frame por cada que entrega la cámara con su instante real: con el fps de la pista Mediabunny repetiría o saltaría frames y la prueba no mediría lo que la cámara da). Después **abre el archivo escrito y lo analiza**: códec, frames, fotogramas clave, fps medio y mediano, paso mínimo y máximo, saltos y frames perdidos (`saltosDeFrames`), duración y, sobre todo, **dónde empieza el sonido respecto a la imagen dentro del archivo** (`inicioAudioMenosVideoMs`: el primer dato sobre el retardo audio–imagen de la app). El archivo se puede «Abrir en el visor», «Compartir» (hoja de Android) o «Guardar». `?laboratorio&duracion=N` cambia los 10 s (las pruebas e2e usan 3). La grabación también anota los ajustes que la cámara está usando (exposición, ISO, enfoque) y admite tres tratamientos de enfoque y exposición: automáticos, bloqueados en lo que eligió la cámara, o exposición corta de 1/100 s (hipótesis de abajo; 1/100 s y no 1/120 porque con red de 50 Hz las bombillas parpadean a 100 Hz y una exposición múltiplo de ese ciclo no hace pulsar el brillo).

Núcleo con tests de valor conocido: `saltosDeFrames` (sin saltos a 30 fps, un hueco de 4 pasos = 3 frames perdidos, el jitter normal de ±20 % no cuenta, menos de 2 frames) y `formatearInforme` (texto del informe). Pruebas e2e con la cámara y el micrófono falsos de Chromium (`lanzarNavegadorConCamaraFalsa`): sin `?laboratorio` no aparece; «Medir este móvil» da las cinco secciones, el micrófono sin eco ni ganancia automática y los fps medidos coinciden con los concedidos (la cámara falsa da 20 aunque se le pidan 30, y el informe lo dice); la grabación de 3 s se abre en el visor con **el mismo número de frames que cuenta el informe**, con audio, duración y fotogramas clave. Lo que no se puede probar ahí (H.264 por hardware, cámaras y micrófonos reales, Quick Share) lo da el informe en los móviles del usuario.

**Primera medida real: Pixel 8** (Android 17, Chrome 156, 24-10-2026, el móvil habitual del usuario). Entorno: todas las APIs del plan presentes (`VideoEncoder`, `AudioEncoder`, `MediaStreamTrackProcessor`, mantener la pantalla encendida, compartir archivos, OPFS); micrófono sin procesar concedido (48 kHz, mono, 40 ms de latencia declarada); OPFS a 53–96 MB/s (el vídeo necesita ~1,5) y 10 GB de cuota, pero **`persistente: no`**: Android puede vaciarlo con poco espacio, así que el paso 2 pide almacenamiento persistente y avisa de que «Compartir» o «Guardar» ponen una grabación a salvo. Códecs: Chrome dice «hardware» para H.264, HEVC, VP9 y AV1 en todos los modos (lo que contesta `isConfigSupported`, no una prueba de que AV1 lo codifique el chip). Cámaras: la trasera da 1–4080 px y 0–60 fps declarados, enfoque manual, de un disparo y continuo, exposición manual y linterna; Chrome concede los modos pedidos (también 1080p60 y 4K). **Lo que entrega es otra cosa: unos 25 fps medianos en todos los modos** (en la grabación de 10 s a 1080p «30»: 248 frames, fps mediano 24,9, pasos de 20 a 72 ms, 3 saltos y 3 frames perdidos; la prueba con H.264 a 6,3 Mb/s y audio AAC, sin problema en el codificador). El sonido empieza 8 ms antes que la imagen dentro del archivo, **pero eso no dice nada del retardo audio–imagen** (corrección: en las grabaciones siguientes salió −64 y −74 ms; solo indica qué pista dio antes su primera muestra, y cambia de una toma a otra). El retardo real solo lo da un evento visible y audible a la vez (paso 8). Hipótesis a comprobar: unos 40 ms entre frames es una exposición de unos 1/25 s, que la exposición automática alarga con poca luz y baja los fps; en ese caso la solución es luz y/o exposición manual corta (que además reduce el desenfoque de movimiento, importante para seguir gomets). Se prueba con los ajustes que ahora anota el informe y la opción de exposición corta. Si se confirma, entra en el paso 2: controles de exposición y enfoque bloqueados al grabar y una nota en `docs/grabacion.md`.

**Segunda medida: Pixel 8, con la misma bombilla de techo (exposición automática de 1/120 s e ISO 100)** (24-10-2026). **Hipótesis de la luz no confirmada:** la cámara trasera entrega **30 fps** con esa exposición: 30,1 de mediana en 720p, 29,7 en 1080p y 30,0 en 4K, y en la grabación de 10 s a 1080p «30» salen 296 frames, mediana 30,1, 1 salto y 2 frames perdidos. Los ≈25 fps de la primera medida (misma bombilla, sin exposición anotada) **no se han vuelto a ver y no se explican**: puede ser menos luz entonces, la cámara recién abierta o el estado del móvil. Con esta luz no hay problema; si reaparece, el informe ya anota la exposición. No hace falta luz diurna. **1080p60 no se consigue:** Chrome lo concede pero entrega 40–44 fps de mediana (con 2–5 saltos), así que el objetivo es 30 fps. La cámara frontal entrega 19–24 fps en casi todos los modos (no se usa). **Exposición corta (1/100 s, ISO 800):** se aplica (Chrome pasa `exposureMode` a `none`), 30,3 fps y 2 saltos: con buena luz no aporta nada sobre la automática. El sonido empieza antes que la imagen en el archivo por 64 y 74 ms: ver la corrección de arriba. `persistente: no` sigue igual. **Consecuencias para el paso 2:** se graba a 1080p y 30 fps con H.264 (hardware, ~7,5 Mb/s), exposición automática por defecto; la app compara los fps medianos con los pedidos y avisa si bajan del 90 % (poca luz u otra causa); `docs/grabacion.md` recoge la iluminación; el control de exposición bloqueada queda como opción, no como requisito.

**Paso 2 — grabar con un móvil dentro de la app** (`src/ui/Grabar.tsx`, `src/media/grabadora.ts`, `grabaciones.ts`, `core/grabacion/metadatos.ts`, `revision.ts`). En la portada, «Grabar con este móvil» (solo si el navegador tiene `getUserMedia`, `VideoEncoder` y `MediaStreamTrackProcessor`) abre una pantalla con la vista previa de la cámara trasera (resolución y fps concedidos y nombre de la cámara), la resolución (720p, 1080p por defecto o 4K; siempre 30 fps, porque 60 no se consigue en el Pixel 8), «Grabar» / «Parar» con el reloj y la lista de grabaciones. Lo decidido con los datos del paso 1:
- **Codificación (D2):** la del laboratorio: Mediabunny con `MediaStreamVideoTrackSource` (`frameRate: null`, fotograma clave cada 1 s, `latencyMode: 'realtime'`) y `MediaStreamAudioTrackSource` (AAC u Opus a 128 kb/s), micrófono sin procesar, H.264 si se puede (el Pixel 8 lo codifica por hardware a 7,5 Mb/s en 1080p30). Exposición automática: con la luz del usuario da 30 fps; el control de exposición queda en el laboratorio.
- **Almacén (D3):** MP4 sin `fastStart` (moov al final; el visor lo lee más rápido que uno fragmentado) escrito sobre la marcha en OPFS, carpeta `grabaciones`, con `StreamTarget` sobre el `FileSystemWritableFileStream` (`chunked`: trozos de 16 MB en memoria antes de escribir). Si OPFS falla, en memoria con 60 s como máximo; con OPFS, 5 min. Antes de grabar se avisa con menos de 300 MB libres. Al entrar se pide almacenamiento persistente; si el navegador no lo concede, la lista dice que Android podría borrar las grabaciones y que compartir o guardar las pone a salvo. **Limitación:** el navegador escribe en un temporal y solo hace visible el archivo al cerrarlo, así que una grabación interrumpida (la app cerrada, sin batería) se pierde; escribir en sitio exigiría un worker con `createSyncAccessHandle`.
- **Metadatos (D8):** el comentario del MP4 lleva un JSON (`core/grabacion/metadatos.ts`: `app`, `formato` 1, `id` aleatorio, `creada`, lo pedido a la cámara). Se lee de vuelta con `getMetadataTags`: **comprobado en la e2e**, que era el riesgo del plan (el plan B era un `.json` aparte). Un formato más nuevo se lee en lo que tiene en común; lo que no es de dualkinema se ignora.
- **Revisión al parar:** se analiza el archivo escrito (frames por sus pts sin decodificar, fps mediano, saltos, audio, metadatos) y se avisa si los fps medianos bajan del 90 % de los pedidos (`revisarFps`), con la luz como causa posible (sin afirmarla: en el Pixel 8 una toma dio 25 fps con la misma luz que otra de 30).
- **Lista de grabaciones:** la más reciente primero, con fecha y tamaño; «Abrir» (en el visor, como un vídeo cualquiera), «Compartir» (`navigator.share`: la hoja de Android con Quick Share), «Guardar» (descarga) y «Borrar» (un segundo toque confirma). La pantalla se mantiene encendida mientras está abierta (Wake Lock, que se vuelve a pedir al volver a ella). Salir a mitad de una grabación la descarta.
- Glosario: entrada «Grabar con este móvil» (qué se graba, dónde se guarda y cómo ponerla a salvo, el aviso de fps) con su icono en el título y en el aviso; «Dónde se guardan los datos» dice ya que los grabados con la app quedan en su almacenamiento. `docs/grabacion.md`: «Grabar con la app» (1080p30, luz, compartir, no cerrar la app).

Tests de núcleo con valor conocido: metadatos (ida y vuelta, formato más nuevo, todo lo que se rechaza), `revisarFps` (30 y 27,5 de 30 bien, 25 de 30 avisa, justo el 90 %, sin medida) y el nombre del archivo. e2e con la cámara falsa (20 fps aunque se pidan 30): graba unos 3 s y para; los fps contados en el archivo coinciden con los concedidos (±10 %), sale el aviso (20 de 30), los datos de la app se leen del MP4 y lleva sonido; «Abrir en el visor» da **los mismos frames que contó la revisión**; tras recargar la grabación sigue en la lista, «Guardar» descarga un archivo del tamaño exacto de la grabación y «Borrar» pide un segundo toque. Lo que no se puede probar ahí: H.264 por hardware, Quick Share y el almacenamiento persistente de Android.

**Paso 3 — núcleo del reloj común y del protocolo de la sala** (`core/reloj/desfase.ts`, `deriva.ts`, `sintetico.ts`; `core/sala/codigo.ts`, `protocolo.ts`). Sin nada visible: lo usan los pasos 4 y 5.
- **Desfase con cota rigurosa** (mejora sobre el plan, que proponía la mediana de los intercambios de menor retardo con cota δ_min/2): de las cuatro marcas, con retardos de ida y vuelta no negativos, el desfase real está en [t3 − t4, t2 − t1], sin suponer nada de la red (una marca tardía en el remoto solo cuenta como más retardo). Con varios intercambios está en la **intersección** de sus intervalos: su centro es la estimación y su semiancho, la cota. Junta la ida más rápida con la vuelta más rápida, así que es al menos tan estrecha como δ_min/2 (en las pruebas con red variable, siempre menor). Si la intersección queda vacía (marcas incoherentes, un reloj que salta), mediana de los intercambios más rápidos (un 25 %, al menos 3) con una cota que abarca todos sus intervalos, y se anota el método.
- **Deriva:** ventanas de 5 s; en cada una, el desfase de la intersección; recta por mínimos cuadrados ponderada por 1/cota²; ppm con su **error típico**. La precisión la pone la red: con intercambios de 10 ms + cola de 10 ms, ±3–8 ppm en 2 minutos; con una cola de 30 ms, unos ±19 ppm (una deriva de 50 ppm apenas se distingue de 0 en ese tiempo). La primera versión tomaba el intercambio más rápido de cada ventana y daba 98 ppm con 50 reales: ahora el error real cabe siempre en 3 errores típicos. Se mide y se muestra; no se corrige (D7).
- **Código de sala:** 6 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31: sin 0/O/1/I/L), uniformes (se descartan los bytes ≥ 248); se normaliza lo escrito a mano (minúsculas, espacios, guiones); URL `…/?sala=CÓDIGO` con el origen actual y su lectura de vuelta.
- **Protocolo** (versión 1): `hola` (versión y vista), `ping` / `pong` (las cuatro marcas), `estado` (cámara, espacio, batería, grabando), `programar` (id de grabación, inicio en el reloj de quien envía, duración o hasta parar, 300 s como mucho), `confirmar`, `parar`, `cancelar` (con un motivo de una lista, nunca texto) y `adios`. Cada mensaje se lee campo a campo y se reconstruye solo con lo conocido (lo demás se descarta: un campo con datos de un paciente no se reenvía), ids solo como UUID, 2 KB como mucho. Los dos móviles se hacen pings el uno al otro y cada uno pasa los instantes del otro a su reloj: cualquiera puede programar (D8).

Tests de valor conocido: un intercambio (remoto 1000 ms por delante, ida 30 y vuelta 10 → θ = 1010, intervalo [990, 1030]); asimetría fija (error de 10 ms, cota de 20 que lo cubre); red variable con 5 semillas (la cota cubre el real y es ≤ δ_min/2); intercambios de 500 ms que no mueven nada; una marca imposible (mediana con cota que sigue cubriendo el real); deriva de 50, 0 y −80 ppm con 5 redes (error ≤ 3 errores típicos) y el desfase de cada instante a < 3 ms; red lenta → error típico más ancho y no un resultado falso; código (alfabeto, rechazo de bytes, reparto uniforme en 31 000 caracteres, normalización, URL); protocolo (ida y vuelta de cada tipo, campos desconocidos descartados, 18 mensajes inválidos, versión más nueva, tamaño).

**Paso 4a — relé de salas** (`senal/`, `src/core/sala/rele.ts`, `tests/senal/`). El paso 4 se parte en dos: el relé tiene que estar desplegado desde `main` para que la app (4b, emparejamiento) pueda conectarse a él desde una previsualización.
- **Worker aparte** `dualkinema-senal` (`senal/wrangler.jsonc`, `senal/src/index.ts`), con un Durable Object por código de sala (SQLite, plan gratuito) y la API de hibernación (sin coste mientras nadie habla). `GET /sala/<código>` con `Upgrade: websocket`; `GET /salud` → «ok». El código se normaliza con `core/sala/codigo.ts` (el Worker importa del núcleo; `senal/tsconfig.json` referencia `tsconfig.core.json` y entra en `npm run typecheck`, con los tipos de Cloudflare que usa declarados a mano en `senal/src/cloudflare.d.ts`).
- **Lo que decide** (`core/sala/rele.ts`, puro y con tests): dos móviles por sala; el resto se abre y se cierra con 4001 («sala llena»; cerrarlo antes de devolver la respuesta no le llegaba al móvil, lo encontró la prueba: se cierra justo después); los mensajes de la app se reenvían tal cual al otro, sin leerlos ni guardarlos; más de 2 KB o binario → 4004; ritmo de 30 por segundo con ráfaga de 60 (cubo de fichas; los pings de la app al emparejar son 20/s, más las respuestas del otro) → 4003; la sala se cierra a las 3 h (alarma) → 4002. Avisos del relé con la clave `rele` (`bienvenida` con los ocupantes, `entra`, `sale`), distintos de los mensajes de la app (`tipo`). Orígenes permitidos: producción, previsualizaciones (`https://<rama>-dualkinema.edu-gamboa-rodriguez.workers.dev`) y localhost; no es una barrera contra quien no use un navegador, pero evita que otra web lo use de paso.
- **No guarda nada:** ni mensajes ni registros propios; solo la alarma de cierre. Cloudflare ve la IP de cada conexión (dato del fisioterapeuta, no del paciente).

Pruebas: núcleo (avisos, ritmo: ráfaga de 60 sí y 61 no, 30 repuestos al segundo, el uso real de la app nunca se corta; orígenes) y **el Worker de verdad** con `npm run test:senal` (lo levanta `wrangler dev` con workerd y lo usan clientes WebSocket de Node; en la CI, en `comprobar`): bienvenida y aviso de entrada, reenvío tal cual sin eco, el código en minúsculas es la misma sala, aviso al salir, el tercero se cierra con 4001 y los otros siguen, salas distintas no se oyen, 400 / 426 / 403, más de 2 KB → 4004 sin llegar al otro, 200 mensajes de golpe → 4003 tras la ráfaga de 60.

**Paso 4b — emparejar los dos móviles en la app** (`src/ui/Emparejar.tsx`, `src/sala/config.ts`, `canal.ts`, `reloj.ts`, `useSala.ts`, `src/ui/usePantallaEncendida.ts`). En la portada, «Grabar con dos móviles» (D6):
- **Crear o unirse:** «Crear una sala» da un código de 6 caracteres (grande, `ABC-DEF`) y un **QR** con `…/?sala=CÓDIGO` en el origen actual (librería `uqr` 0.1.3, MIT, sin dependencias; se pinta como SVG negro sobre blanco aunque la app sea oscura, porque los lectores lo necesitan así). El otro móvil lo escanea con la cámara de Android (la app se abre ya en la sala: `App` lee `?sala=` al arrancar) o escribe el código («Unirme»; minúsculas, espacios y guiones valen; uno mal escrito se rechaza con su motivo). El código queda en la dirección: al recargar se vuelve a la sala.
- **En la sala:** el estado de la conexión («Esperando al otro móvil…», «Conectado…», «Reconectando…», «La sala está llena», «La sala ha caducado»); cómo ve este móvil a la persona (perfil a la izquierda o a la derecha, de frente, de espaldas) con la vista previa de la cámara para encuadrar; del otro, su vista y su estado (cámara, espacio, batería); el **reloj común «± N ms»** (la cota) y la deriva con su error cuando hay bastante; avisos si los dos están en el mismo plano o si el otro tiene otra versión de la app. La pantalla se queda encendida (Wake Lock, ahora en `usePantallaEncendida`, compartido con «Grabar con este móvil»). «Salir de la sala» manda `adios` y cierra.
- **Cliente:** `CanalSala` (WebSocket al relé; se reconecta solo con esperas de 1, 2, 4… hasta 15 s salvo con la sala llena o caducada; separa los avisos del relé de los mensajes, que se leen con `leerMensaje`); `RelojSala` (ráfaga de 30 pings cada 50 ms al entrar el otro, después uno por segundo; contesta a los pings del otro; solo acepta la respuesta a un ping propio y vivo, con su mismo t1; estima con los últimos 30 y la deriva con todos, hasta 600); `useSala` (cuándo se manda `hola` y `estado`, y el estado de la sala para la pantalla). El reloj de la app es `performance.now()`; en localhost, `?reloj=<ms>` lo desplaza y `?senal=ws://…` cambia el relé (en una dirección pública se ignoran: un enlace no puede llevar la app a otro relé).
- **Glosario:** «Grabar con dos móviles» (sala, código y QR, vistas, qué viaja por el relé y qué ve Cloudflare) y «Reloj común entre los dos móviles» (las cuatro marcas, qué significa «± N ms», la deriva), con sus iconos; «Dónde se guardan los datos» lo menciona.

Pruebas: `RelojSala` con dos relojes en una red simulada (B 1500 ms por delante, ida 12 y vuelta 30 ms: cada uno encuentra el del otro con el signo correcto, error de la mitad de la asimetría y cota de la mitad del retardo; ráfaga y luego uno por segundo; reiniciar olvida; respuestas ajenas ignoradas; sin conexión no espera). e2e con dos navegadores con cámara falsa y el relé de verdad en local (`servirRele`, `wrangler dev`): A crea la sala (código, QR con la dirección de la sala, esperando; la dirección guarda la sala); B entra por la dirección del QR con su reloj desplazado 1500 ms y **cada uno mide el desfase del otro dentro de su cota respecto a la verdad** (cotas de menos de 1 ms en la misma máquina). La primera versión de la prueba fallaba porque tomaba 1500 ms como verdad: cada `performance.now()` cuenta desde que se abrió su página, así que la verdad es 1500 + (inicio de A − inicio de B), con el `performance.timeOrigin` de cada página. También: vistas y cámara del otro, aviso con los dos en el mismo plano y que desaparece al corregirlo, un tercero recibe «la sala está llena» sin echar a los otros, al salir B A vuelve a esperar, B vuelve a entrar escribiendo el código (en minúsculas y con guion) y el reloj se mide de nuevo, y un código mal escrito se rechaza.

**Paso 5 — grabación doble** (`src/sala/useGrabacionDoble.ts`, `core/sala/doble.ts`, `core/grabacion/metadatos.ts`, `media/grabadora.ts`, `ui/Emparejar.tsx`). En la sala, con los dos emparejados, el reloj medido y una vista de perfil y otra de frente o de espaldas, la tarjeta «Grabar con los dos» (D8):
- **Programar:** cuenta atrás (5, 10 o 15 s) y duración (10, 20, 30, 60 s o «hasta parar», con el máximo de 5 min) desde cualquiera de los dos. Quien pulsa manda `programar` con el inicio en su reloj; el otro lo pasa al suyo con su estimación (`aMiReloj`: inicio − desfase), comprueba que puede (`motivoNoPreparado`: cámara, vistas compatibles, reloj, 300 MB libres, al menos 1,5 s para prepararse, no estar ya grabando) y contesta `confirmar` o `cancelar` con el motivo (de una lista: el protocolo amplía los motivos sin cambiar de versión, porque nadie lo usaba aún). Sin confirmación en 3 s no graba ninguno.
- **Grabar:** cada uno, en su reloj, **prepara** la grabadora 1,5 s antes (códec, archivo en OPFS y metadatos: `Grabadora.preparar`, separado de `arrancar` porque Mediabunny no deja cambiar los metadatos después de empezar) y **arranca** justo en el inicio; tres pitidos cortos los últimos 3 s (Web Audio, desbloqueado con el primer toque en la pantalla; suenan antes de grabar y no quedan en el vídeo); para solo al acabar la duración aunque se corte la conexión, o cuando cualquiera pulsa «Parar los dos» (`parar`); «Cancelar» en la cuenta atrás cancela los dos. Si uno falla al grabar, avisa al otro (`cancelar`, `fallo`), que sigue. Mientras tanto no se puede cambiar de vista ni salir de la sala, y el estado que ve el otro dice que graba.
- **Metadatos:** el MP4 lleva, además de lo de siempre, `doble` (`DatosDoble`): el **id común** de la pareja, la vista, el **inicio** en el reloj de ese móvil y su estimación del reloj del otro (desfase y cota) y de la deriva al programar. Es opcional: no sube la versión del formato y, si está roto, se lee el resto sin él (con tests). El nombre del archivo lleva la vista (`…-perfil.mp4`, `…-frente.mp4`).
- **Resultado:** en cada móvil, la revisión de siempre (frames, fps, sonido, aviso de fps) y «Compartir» / «Guardar» / «Grabar otra vez»; el vídeo queda en «Grabaciones de este móvil». Para analizarlos juntos se pasa uno al otro con Quick Share (D11); abrirlos como pareja y proponer la sincronía es el paso 7.
- **El inicio es el programado,** no el instante exacto del primer frame: arrancar tarda unos pocos ms (3–7 ms en el laboratorio), mucho menos que la cota del reloj (±51 ms en la Wi-Fi del usuario). La sincronía fina la dará el pitido (paso 6).
- Glosario: «Grabar con dos móviles» explica la grabación a la vez; `docs/grabacion.md`, «Grabar con dos móviles» paso a paso.

Pruebas: núcleo (vistas compatibles, el inicio del otro en mi reloj con desfase positivo y negativo, cada motivo de no estar preparado; metadatos con `doble`: ida y vuelta, sin reloj, partes rotas). e2e con dos navegadores (cámara falsa, relé local, reloj de B desplazado 1500 ms): **B programa y A para; el mismo id en los dos MP4, y el inicio escrito en cada MP4 es el mismo instante de verdad en los dos** (con el `performance.timeOrigin` de cada página: dentro de la cota del reloj), los dos arrancan a menos de 250 ms de ese instante, la vista en el nombre; con 10 s de duración los dos paran solos (unos 200 frames a 20 fps); «Cancelar» en la cuenta atrás de uno cancela los dos; sin vistas compatibles no se ofrece grabar.

**Corrección: la cámara que Android apaga** (`src/ui/useCamara.ts`, `Grabar.tsx`, `Emparejar.tsx`). Probando la grabación doble, tras un rato con la app en segundo plano, el móvil dijo «Este móvil no ha podido grabar: Failed to construct 'MediaStreamTrackProcessor': Input track cannot be ended». Android apaga la cámara y el micrófono de una app que pasa a segundo plano: sus pistas quedan terminadas y no vuelven solas, y la app seguía usándolas (la vista previa congelada en la última imagen, el otro móvil leyendo «Cámara 1080×1920 a 30 fps»). Ahora la cámara la lleva `useCamara`, común a las dos pantallas: cuando una pista termina, `flujo` pasa a null (nadie graba ni anuncia una cámara muerta: el otro móvil ve «Cámara sin abrir» y, si alguien programa, se contesta `sin-camara`) y se vuelve a abrir en cuanto la app está a la vista. e2e: se terminan las pistas como lo hace Android (se paran y avisan con `ended`), la vista previa recibe un flujo nuevo con las pistas vivas y se graba sin error.

Otra lección de la misma prueba: con unos **auriculares con micrófono** conectados, Android graba el sonido por ellos (en ese caso, en otra habitación) y la palmada apenas se oyó. El paso 6 avisará de qué micrófono se usa y de que el pitido también saldría por los auriculares.

**Medidas con la tablet Huawei (BAH2-W19, Android 8, Chrome 138; 25-10-2026), el segundo aparato de la prueba.** Ningún codificador de vídeo por hardware (H.264, HEVC y AV1: «no»; VP9 solo por software) y sin AAC (audio en Opus). La cámara trasera entrega 30 fps a 720p y a 1080p, pero **grabando** a 1080p salen 10 fps (15 frames perdidos, huecos de 386 ms) y a 720p, 15 fps: el cuello de botella es el codificador por software, no la cámara. La tablet no será el segundo aparato habitual, pero de aquí sale la regla del paso 6: decir antes de grabar si un aparato no tiene codificador por hardware. De la primera prueba doble con ella (sin auriculares): audio de la palmada con calidad 3,67 y desfase +44,4 ms, dentro del reloj (≈0 ± 52 ms).

**Paso 6 — pitido de ida y vuelta** (`core/sincronia/pitido.ts`, `src/sala/sonido.ts`, `src/media/pitido.ts`, `audio.ts`, `codificador.ts`, `microfono.ts`, `src/ui/Claqueta.tsx`, `useGrabacionDoble.ts`, `Emparejar.tsx`, `Grabar.tsx`). Lo del §6 (D9), con tres añadidos aceptados: el filtro adaptado, el aviso de auriculares y el del codificador.
- **La secuencia:** tres barridos de 2 a 5 kHz de 40 ms con ventana de Hann, que empiezan a 0, 130 y 320 ms (separaciones distintas: corrida lo que separa dos barridos, solo coincide uno). Ya grabando, el móvil de perfil la emite a 1,0 s del inicio y el otro a 2,5 s. Se programa con Web Audio en el reloj de la app (300 ms antes, para que los temporizadores no la retrasen), adelantando la latencia de salida que declara el navegador (`baseLatency` + `outputLatency`). El MP4 guarda cuándo debía sonar cada una (`doble.pitidos`, opcional: no cambia el formato).
- **Filtro adaptado (mejora sobre el plan, que reutilizaba la envolvente de la fase 3):** se correlaciona el audio con el barrido en fase y en cuadratura (envolvente con un pico de unos 0,3 ms) y se divide por la energía de lo que cubre el barrido: queda el **parecido** (correlación normalizada, de 0 a ~1), que no depende de lo fuerte que suene. La secuencia se puntúa con la media geométrica del parecido en sus tres barridos; calidad = pico / segundo pico, buscado antes del pico (fuera de 50 ms) o después de la secuencia y su cola (0,2 s); la ventana va de 0,15 s antes a 0,6 s después de lo esperado. El instante, la primera llegada de cada barrido (el primer máximo que alcanza la mitad del pico en los 50 ms anteriores), mediana de los tres. (Ventana, calidad y primera llegada se ajustaron con la primera prueba real: ver abajo.) Con señales sintéticas: limpio, a menos de 0,01 muestras; con eco, ruido y palmadas 26 dB más fuertes antes y después, a menos de 0,05 ms; el propio pitido saturado en el micrófono, igual. La primera versión sin normalizar daba calidad 2,6 con esas palmadas (una palmada muy fuerte se parece un poco a todo); normalizada, 5. Desde calidad 3 (`CALIDAD_PITIDO_MINIMA`) se da por buena.
- **Ida y vuelta:** `combinarIdaVuelta` con las cuatro detecciones (cada secuencia en cada vídeo): Δ = (d₁ + d₂)/2 y D = c·(d₂ − d₁)/2 con c = 343 m/s; fiable con calidad ≥ 3 y D entre 0,3 y 15 m. Con dos grabaciones sintéticas (Δ de +37,1, −42,5 y +1,2 ms; móviles a 3,1, 5 y 1,2 m; latencias de altavoz de 60 y 120 ms distintas en cada uno; ecos distintos): Δ a menos de 0,05 ms y D a menos de 3 cm. Usarlo para proponer el desfase al abrir los dos vídeos es el paso 7.
- **Al parar, cada móvil revisa su vídeo:** lee el audio de los primeros segundos (`leerAudioMono`) y busca las dos secuencias: «Pitidos: el de este móvil oído (calidad N) · el del otro …», con un consejo si falta alguno (tocar la pantalla antes de grabar si no pudo sonar; volumen multimedia; acercar los móviles).
- **Claqueta sin pareja:** «Pitido de claqueta» en la portada: cuenta atrás de 3 s y la misma secuencia, para dos cámaras arrancadas a mano. La encuentra «Sincronizar por el audio» de la fase 3 (tres subidas bruscas con separaciones distintas); queda el retraso de la distancia, que se anula pitando a la misma distancia de las dos cámaras.
- **Auriculares o micrófono externo** (`media/microfono.ts`): Chrome para Android nombra las entradas de audio por su tipo («Wired headset», «Bluetooth headset», «USB audio»; «Speakerphone» y «Headset earpiece» son las del propio móvil) y solo lista las conectadas. Si se ve una externa, se avisa en «Grabar con este móvil» y en la sala, y se le dice al otro móvil (`estado.microExterno`). Es una pista de nombres, sin garantía: el laboratorio lista ahora las entradas de audio para comprobarlo en los móviles del usuario.
- **Codificador** (`media/codificador.ts`): `isConfigSupported` con `prefer-hardware` para la calidad elegida. Sin hardware, la app empieza en 720p (en la tablet, 15 fps en vez de 10) y avisa de que puede grabar a menos de 30 fps; en la sala se le dice al otro (`estado.codificador`, «vídeo por software»). Los dos campos nuevos de `estado` son opcionales al leer (un móvil anterior da «no se sabe»): el protocolo sigue en la versión 1.
- Glosario: «Pitido de ida y vuelta» (la secuencia, por qué dos pitidos quitan el retraso de la distancia y dan la distancia, la calidad, volumen y auriculares), con su icono en el resultado y en la claqueta.

**Primera prueba real (Pixel 8 de perfil y tablet Huawei de frente, a 2,10 m, volumen casi al máximo; 25-10-2026; la tablet, boca abajo).** Se oyen las cuatro secuencias (cada una en los dos vídeos), pero la primera versión del detector solo encontró la propia del Pixel: (1) **el pitido sonó 190 ms tarde en el Pixel y 340 ms en la tablet** respecto a lo programado (el navegador no declara toda su latencia de salida), fuera de la ventana de ±0,3 s; (2) con la reverberación de la sala, el pitido del otro llega como una ráfaga de unos 100 ms y las alineaciones más tardías, sobre esa cola, dejaban la calidad en 1,4; (3) con la tablet boca abajo, el máximo del filtro quedaba unos 40 ms después de donde empezaba el sonido. Cambios: ventana asimétrica (0,15 s antes, 0,6 s después), la calidad no cuenta la cola de la propia secuencia y el instante es la **primera llegada** de cada barrido (mediana de los tres). Con eso, en esos dos vídeos: las cuatro con calidad de 3,4 a 13, **desfase −0,5 ms** (dentro del reloj, ≈0 ± 46 ms) y **distancia 3,17 m en vez de 2,10**: cada sentido llega unos 3 ms más tarde de lo que daría la línea recta. Un retraso igual en los dos sentidos no cambia el desfase (es la ventaja de la ida y vuelta), pero la distancia deja de servir de comprobación. Con la tablet boca abajo (altavoz y micrófono contra la mesa) no se puede saber si es eso o un sesgo del detector: se repite con los dos de pie.

Pruebas: núcleo con valor conocido (las de arriba, más: sin pitido o fuera de la ventana → calidad baja; la secuencia débil del otro móvil junto a la propia fuerte; audio que no llega → null; distancia imposible → no fiable; protocolo con los campos nuevos y sin ellos; metadatos con `pitidos`). e2e: en la grabación doble, cada MP4 lleva su plan de pitidos y **cada móvil programa una sola secuencia que suena, en el reloj de su página, a menos de 50 ms de inicio + su turno** (1 s el de perfil y 2,5 s el otro, con el reloj de B desplazado 1500 ms); el micrófono falso no oye los altavoces y el resultado lo dice. La claqueta suena a los 3 s del toque. **Lo que no se puede probar aquí:** la cadena acústica (el altavoz de un móvil grabado por el del otro), si la latencia de salida declarada es la real y el nombre de los auriculares en Android: paso 8, con los móviles del usuario.

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
