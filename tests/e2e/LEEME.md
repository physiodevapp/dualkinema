# Pruebas en navegador (e2e)

Abren la app construida en un Chromium real con Playwright y la usan como una persona: cargar un vídeo, tocar los gomets, seguir, mover el deslizador, tocar la gráfica. Lo que `npm test` (Vitest) no puede ver: que los módulos carguen, que el decodificador devuelva *el frame pedido*, que el seguimiento dé el ángulo real de principio a fin.

```
npm run build        # las pruebas sirven dist/
npm run test:e2e     # ~45 s; la primera vez unos minutos más: genera los vídeos
```

Necesitan `ffmpeg` (con libvpx-vp9) y el Chromium de Playwright (`npx playwright install chromium`). Otras opciones: `E2E_PUERTO` (por defecto 4173) y `CHROMIUM_PATH` (usar un Chromium ya instalado).

## Vídeos sintéticos (`videos.mjs`)

Se generan con Node + ffmpeg en la carpeta temporal del sistema (`dualkinema-e2e-v<VERSIÓN>`) y no entran en el repositorio. Súbele `VERSION` a `videos.mjs` si cambias un generador. Son VP9 en WebM porque el Chromium de Playwright no trae H.264 (por eso H.264 y HEVC reales solo se prueban en un móvil).

| Vídeo | Qué es | Para qué |
|---|---|---|
| `numerado` | 320×180, 120 frames, fotograma clave cada 25, fps variable. El número de cada frame está en 8 bloques blanco/negro | Comprobar que el frame que se muestra es el pedido (sin depender de fuentes ni de comparar imágenes) |
| `verde` | Flexión de rodilla 0°→90°→0° en 4 s, 3 gomets verdes sobre una pierna color piel, fps variable | Seguimiento, ángulo real conocido en cada frame y gráfica |
| `rojo` | Lo mismo con gomets rojos | Que el gomet rojo se separe de la piel |
| `oculto` | Como `verde`, con el tobillo tapado 0,3 s | Que un hueco no se rellene ni se invente; corrección a mano, a ojo y anclas |
| `corto` | Como `verde`, con el tobillo tapado 0,1 s | Rellenar un hueco corto a petición, con el ángulo real conocido |

Cada vídeo de rodilla va con un `.json` con la verdad: tiempo, flexión real y posición exacta de cada gomet en cada frame.

## Qué se comprueba

- **Visor:** frame exacto avanzando, retrocediendo y saltando (incluidos los fotogramas clave); tiempo de cada frame; aviso de fps variable; teclado; pulsación mantenida.
- **Marcado:** un toque fuera de un gomet da el motivo con su detalle técnico, **sin tapar la imagen**; uno correcto pasa al siguiente marcador.
- **Seguimiento:** sin huecos; ángulo medido frente al real (tolerancia 0,5°; lo medido en la fase 1 fue ≤ 0,1°), en varios frames, también tras los huecos de fps.
- **Gráfica:** máximo y mínimo; tocar y arrastrar salta al frame más cercano (±1), también en los paneles de velocidad y de segmentos. El valor de cada serie en el frame actual (botones `serie-<id>`) frente a la verdad: crudo y filtrado ±0,5°, velocidad angular ±3 °/s y «—» sin derivada. Cada botón oculta y muestra su serie, y un panel sin series desaparece. El cursor cae en el instante del frame (±1,5 px) y cambiar de frame no redibuja la gráfica (`data-redibujos` no sube; con `redraw` en cada frame, falla). Longitud de los segmentos: oculta al empezar y, mostrada, 0 % (±1 %) en todo el vídeo.
- **Trayectoria completa:** apagada por defecto; encendida, hay trazo en las posiciones reales del tobillo de frames que la estela no cubre; quitando el tobillo de los elegidos desaparece; cambiar de frame no la quita. El corte en los huecos y los trazos de lo interpolado se prueban en el núcleo: en estos vídeos la vuelta del movimiento (0→90→0°) pasa por los mismos puntos y taparía el hueco.
- **Huecos:** el aviso, la gráfica y el recuento coinciden con los frames realmente tapados; durante el hueco no hay ángulo; «Ir al primer frame con hueco».
- **Persistencia:** marcar y seguir, recargar, ver la sesión en la lista, reabrir el mismo vídeo y recuperarla (mismo ángulo mostrado en cada frame comparado, mismo resumen de la gráfica, mismas marcas a mano); seguir trabajando actualiza la misma sesión; «Continuar» con otro vídeo lo rechaza y con el suyo recupera; el mismo vídeo con otro nombre se reconoce avisando; un cambio hecho justo antes de recargar no se pierde; «Empezar de cero» y borrar con confirmación.
- **Lupa:** a 54 px del gomet no hay anillo; a 14 px sí, y al soltar ahí los tres marcadores quedan en su centro (ángulo real).
- **Corrección manual:** arrastrar con la lupa coloca el marcador en el gomet; con el gomet tapado se puede colocar a ojo; al volver a seguir, lo marcado a mano es un ancla (el recuento de huecos del worker lo excluye); una marca a mano se puede quitar.
- **Huecos cortos:** un hueco de 0,3 s no se ofrece; uno de 0,1 s no se rellena hasta pedirlo y, rellenado, da el ángulo real (±1°), queda marcado, se guarda y se recupera como interpolado, y se puede quitar.
- **Filtro:** con fps variable, el ángulo filtrado a 6 Hz coincide con el real (0,5°); dentro de un hueco no hay ángulo filtrado y justo a sus lados sí (±1°, el filtro no lo cruza); el corte cambiado se guarda, se recupera y «Volver a 6 Hz» también se guarda.
- **Velocidades:** velocidad angular frente a la derivada real del vídeo (±3 °/s), también tras los huecos de fps; aceleración angular con el corte a 3 Hz (±10 °/s²; a 6 Hz el ruido de seguimiento la mueve unos ±20 °/s²); «—» en el primer y el último frame; velocidad del tobillo en px/s (±5 %) con cadera y rodilla quietas.
- **Cero de referencia:** «Primeros 2 s» y «Inicio aquí» / «Fin aquí» dan la media real de su tramo; relativo = sin cero − media; se avisa si el tramo no es quieto; el tramo se guarda, se recupera tras recargar y «Quitar» se guarda vacío.
- **Escala en metros:** elegir el objeto cambia la longitud de partida; con los extremos a 50 px se avisa de que es corto; un tercer toque mueve el extremo más cercano; tocar al calibrar no mueve marcadores; mm por píxel; velocidad del tobillo en m/s frente a la real con la escala (±5 %); se guarda, se recupera y «Quitar» vuelve a px/s. Entre dos marcadores: rodilla–tobillo y primeros 2 s por defecto, distancia media real (120 px aunque la rodilla se flexione en el tramo), precisión ≤ 0,3 %, m/s del tobillo, guardado y recuperado. Longitud de los segmentos: 130 y 120 px, sin variación. Calibrada antes de seguir: aviso de «Solo 1 de los N frames», precisión de un frame (≥ 0,5 %), y tras seguir se ofrece «Rehacer», que la deja con todo el tramo.
- **Estela:** va siempre por detrás del marcador en el sentido del recorrido: al avanzar, los frames anteriores; al retroceder (deslizador o botón), los posteriores.
- **Lectura del vídeo:** retroceder del 70 al 45 solo decodifica una vez (al cruzar el fotograma clave del 50); el resto sale de la caché. Avanzar de 10 en 10 sigue con el decodificador dentro del grupo de imágenes y empieza en el fotograma clave al cruzarlo (lo dice el modo junto al número de frame, `data-testid="lectura"`).
- **Caché de frames:** retroceder frame a frame 25 frames, cruzando un fotograma clave, y volver a avanzar muestra siempre el frame pedido.
- **Línea de posición:** de 340 a 440 px, con un tiempo de decodificación largo, los botones de avance no se mueven al cambiar de frame (también con la fila de valores de encima) (antes la línea pasaba de una a dos y se perdía la pulsación mantenida).
- **Escritorio** (1280 px): sin desbordes.
- **Consola:** ninguna prueba produce errores de consola ni de página.

## Convenciones

- Se localizan los elementos por rol, por texto o por `data-testid` (`lienzo`, `capa`, `posicion`, `angulo`, `angulo-filtrado`, `corte`, `panel-filtro`, `tramos-cortos`, `panel-cinematica`, `angulo-sin-cero`, `angulo-relativo`, `velocidad-angular`, `aceleracion-angular`, `velocidad-marcador-<id>`, `cero-tramo`, `cero-media`, `panel-escala`, `escala-estado`, `escala-objeto`, `escala-mm-px`, `escala-precision`, `escala-aviso-corto`, `toca-escala`, `constancia-<desde>-<hasta>`, `constancia-longitud`, `constancia-rms`, `constancia-max`, `constancia-fuera`, `lectura-rapida`, `panel-grafica`, `grafica-angulo`, `grafica-velocidad`, `grafica-segmentos` (con `-area`, la zona que se toca, y `-cursor`), `serie-<id>`, `valor-serie-<id>` (`crudo`, `filtrado`, `velocidad`, `segmento-<desde>-<hasta>`), `trayectoria-<id>`, `rapida-angulo`, `rapida-relativo`, `rapida-velocidad`, `rapida-aceleracion`, `aviso`, `error-toque`, `resumen-grafica`, `guardado`, `sesion-guardada`, `sesion-ilegible`, `candidata`), nunca por clases de estilo.
- Cada página se abre en su propio contexto del navegador, así que empieza con IndexedDB vacío; recargar la misma página lo conserva. Para esperar a que algo esté guardado, `esperarGuardado()` mira IndexedDB y no solo el texto «Guardado…».
- Antes de tocar el vídeo, `cajaVideo()` lo trae a la vista: el ratón de Playwright no llega fuera de la ventana, y mover un deslizador puede desplazar la página (cuánto depende de la altura del texto; sin las fuentes de Google, como en el entorno en la nube de Claude, el vídeo quedaba en parte fuera y los toques se perdían). En ese entorno la prueba de consola falla solo por las fuentes que no cargan (`ERR_TUNNEL_CONNECTION_FAILED`); en la CI cargan.
- La página se abre con `locale: 'es-ES'` (uPlot falla con el idioma del Chromium de la nube, `en-US@posix`).
- Una prueba nueva que dependa de un resultado numérico debe usar la verdad conocida del vídeo, no un valor «que sale».
- Se han comprobado a propósito varias roturas y las pruebas las detectan: signo de la rodilla invertido; la gráfica salta 5 frames de más; no guardar al ocultar la página; no enviar las anclas al worker; guardar en la caché cada frame con el índice desplazado en uno; colocar sin el radio de búsqueda de la lupa.
- El límite de tiempo es de 10 min por archivo (`--test-timeout`): la primera vez, generar los vídeos tarda unos minutos.
- **Exportación CSV:** una fila por frame; sin escala, columnas en px y la cabecera lo dice; ángulo crudo frente al real (0,5°); sin derivada en el primer frame = celda vacía; con escala (4 m en 400 px), metros = píxeles × m/px, velocidad del tobillo en m/s frente a la real (±5 %) y la calibración en la cabecera; formato internacional con punto decimal.
