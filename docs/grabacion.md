# Cómo grabar el vídeo y colocar los gomets

Guía para la rodilla en el plano sagital (una vista, 3 gomets) y, al final, para la segunda vista de frente (FPPA, fase 3). Lo que se sabe se ha comprobado con vídeos reales del usuario; lo demás son recomendaciones razonadas, marcadas como tales.

## Gomets

| Gomet | Punto anatómico | Cómo encontrarlo |
|---|---|---|
| 1 | **Trocánter mayor** | Relieve óseo lateral de la cadera; se nota al rotar la cadera en bipedestación |
| 2 | **Epicóndilo femoral lateral** | Lateral de la rodilla, a la altura de la interlínea o justo por encima |
| 3 | **Maléolo lateral** | El relieve externo del tobillo |

En la pierna que mira a la cámara, sobre la piel (pantalón corto): en ropa suelta el gomet se mueve aunque el hueso no.

- **Color: verde o azul, fluorescente y mate.** Comprobado: con gomets verdes el seguimiento recorre el vídeo completo sin pérdidas; con rojos sobre piel y con una camiseta salmón fallaba, porque el rojo está en la misma gama de tono que la piel. Evita también rojo, naranja y amarillo pálido, y que haya verde (o azul) en la ropa o el fondo.
- Los tres pueden ser del mismo color; cada uno se sigue por separado. Si se tocan o se cruzan, durante ese tiempo no tienen posición.
- Tamaño: unos 2 cm (recomendación: a 2–3 m y en 1080p ocupan unos 15–20 px). Redondos o cuadrados valen.
- Con la rodilla extendida el ángulo no sale exactamente 0° (p. ej. −4,7° en un vídeo real): los gomets no caen justo sobre los ejes articulares. Importa que sean siempre los mismos puntos.

## Cámara

- Móvil en horizontal o vertical, **fijo** (trípode o apoyado), a la altura de la rodilla o la cadera. Nada en la mano.
- Perpendicular a la persona, de perfil puro, a 2–3 m, con la pierna entera de cadera a pie y margen alrededor.
- Cámara normal del móvil, 1080p, sin zoom digital. Si se puede desactivar la estabilización, mejor: recorta y deforma la imagen.
- Luz uniforme, sin contraluz (nada de ventana detrás de la persona). Fondo liso si es posible.
- H.264 (MP4): lo decodifican todos los navegadores. HEVC solo en algunos; si no abre, grabar con «Más compatible» (iPhone) o sin HEVC/H.265 (Android).
- fps variable (frames que el móvil no guarda): no es un problema, la app trabaja con el tiempo real de cada frame.

## Qué grabar

1. 2–3 s quieto de pie con la rodilla extendida: sirve para marcar los gomets y ver el cero.
2. 3–4 sentadillas lentas o flexiones de rodilla de pie. Unos 10–20 s en total.
3. Para pasar las velocidades a m/s: al principio, un objeto de longitud conocida **en el plano del movimiento** (ver «Objeto para la escala»).
4. Para ajustar el seguimiento: el mismo ejercicio a 60 fps, más rápido y con algo que complique (fondo con objetos, ropa de color parecido al gomet).

## Objeto para la escala

Sirve cualquier objeto rígido de longitud conocida: un palo de 1 m, una cinta métrica o una regla. En la app se elige cuál es, pero el cálculo es el mismo: tocar sus dos extremos y escribir la longitud.

- **En el plano del movimiento:** junto a la pierna que se mide, a la misma distancia de la cámara. A 3 m de la cámara, 10 cm más cerca o más lejos ya cambian la escala un 3 %.
- **Paralelo a la cámara:** sin inclinarlo hacia ella ni alejarlo (se vería más corto). Vertical u horizontal da igual.
- **Cuanto más largo, mejor:** un píxel de error al marcar pesa más en un objeto corto. Un palo de 1 m suele ocupar unos 400 px en un vídeo 1080 a 3 m (±0,35 %); una regla de 30 cm, unos 120 px (±1,2 %, la app avisa).
- **Lejos de los bordes de la imagen:** sin corrección de lente, ahí hay algo de distorsión.
- Basta con que se vea bien en un frame: se puede retirar antes de empezar el ejercicio, sin mover la cámara.
- **Sin objeto:** mide con cinta (mejor con pie de rey) la distancia entre los centros de los gomets de rodilla y tobillo, de pie, y elige «Entre dos marcadores» en la app. La escala queda justo en el plano de los marcadores, pero la medida sobre la piel tiene su error (5 mm en 40 cm = 1,2 %), en el tramo elegido la pierna debe estar quieta y paralela a la cámara, y la longitud de ese segmento ya no se podrá medir con el vídeo.

## En la app

1. Cargar el vídeo y elegir hacia dónde mira la persona (fija el signo del ángulo y qué pierna se marca: la que ve la cámara).
2. En el primer frame, tocar los 3 gomets. Con el dedo pulsado aparece una lupa; se coloca al soltar.
3. «Seguir desde aquí». Si un gomet se pierde, no se inventa su posición: queda un hueco (rojo en la franja y corte en la gráfica). Se puede ir a un frame donde se vea, tocarlo y seguir desde ahí.
4. La gráfica muestra el ángulo en segundos; tocarla o arrastrarla lleva el vídeo a ese instante.
5. Escala: en el panel «Escala», «Calibrar escala», elegir el objeto, ir a un frame donde se vea, tocar sus dos extremos con la lupa, escribir la longitud en cm y «Guardar escala». Con «Entre dos marcadores», después de seguir: elegir los marcadores y el tramo quieto, y escribir la distancia medida.
6. «Longitud de los segmentos» (panel «Escala»): si la distancia entre gomets cambia más de un 3 % en algunos frames, ahí la pierna sale del plano o los gomets se deslizan; la escala y los ángulos son menos fiables en esos frames.

## Grabar con la app

En la portada, «Grabar con este móvil» graba con la cámara trasera dentro de la app (sin la app de cámara del móvil):

- **1080p a 30 fps** por defecto. 60 fps no se ofrece: en el Pixel 8 Chrome los concede pero la cámara entrega unos 40.
- **Aparatos sin codificador de vídeo por hardware** (móviles o tablets antiguos): la app lo dice y empieza en 720p. Aun así pueden no llegar a 30 fps (una tablet Huawei de hace unos años grabó a 15 fps a 720p y a 10 a 1080p, con la cámara dando 30): para analizar, mejor un móvil más reciente.
- **Calibrar la cámara (una vez por móvil):** en «Grabar con este móvil», «Calibrar la cámara». Ponte a 1–2 m, con buena luz, da 3 a 5 palmadas secas separadas un segundo con las manos a la vista y para. En cada palmada, toca el primer frame con las manos juntas y «Guardar». Desde entonces la app descuenta a la imagen lo que tarda la cámara de ese móvil (unas decenas de ms), también en la grabación doble. Cuantas más palmadas, menor el margen («± N ms»).
- **Sin auriculares conectados:** con unos auriculares con micrófono (con cable o Bluetooth), Android graba el sonido por ellos. La app avisa si los ve.
- **Luz:** al parar, la app cuenta los frames que de verdad hay y avisa si la cámara dio menos del 90 % de los fps (por ejemplo, 25 de 30). Con una bombilla de techo normal el Pixel 8 dio 30 fps (exposición automática de 1/120 s); en una toma anterior con la misma luz dio unos 25, sin explicación clara. Si sale el aviso, más luz delante de la persona (una lámpara, una ventana de día) y volver a grabar. Recomendación razonada: con más luz la cámara acorta la exposición, lo que además reduce el desenfoque de movimiento de los gomets.
- **Sin estabilización ni recorte**, a diferencia de la app de cámara (mejor para medir).
- Las grabaciones quedan en el almacenamiento de la app, en ese móvil. Para pasarlas a otro dispositivo, «Compartir» (Quick Share) o «Guardar» (Descargas); así además quedan a salvo si Android limpia el almacenamiento de la app.
- No cerrar la app ni bloquear el móvil mientras graba (la pantalla se queda encendida sola): una grabación interrumpida se pierde. Como mucho 5 minutos seguidos.

## Grabar con dos móviles

Con la app en los dos móviles (la misma dirección: producción, o la misma previsualización):

1. **Móvil de perfil:** portada → «Grabar con dos móviles» → «Crear una sala». Sale un código y un QR.
2. **Móvil de frente:** escanea el QR con la cámara de Android (o abre la app y escribe el código en «Grabar con dos móviles»).
3. En cada uno, «¿Cómo ve este móvil a la persona?»: el de perfil, hacia dónde mira la persona; el otro, «De frente» (o «De espaldas»). Encuadra con la vista previa. Los dos en trípode, fijos.
4. Espera a que salga «Reloj común ± N ms» (unos segundos).
5. En cualquiera de los dos: cuenta atrás (10 s si estás solo y tienes que llegar a tu sitio), duración y «Grabar con los dos». Suenan tres pitidos al final de la cuenta atrás y empiezan los dos.
6. **Ya grabando, pita cada móvil por turnos** (el de perfil al segundo y el otro a los 2,5 s): es el pitido de referencia que sincroniza los dos vídeos. Silencio durante esos 3 s; la persona puede estar ya en su sitio.
7. Al acabar, cada móvil tiene su vídeo en «Grabaciones de este móvil» (con `-perfil` o `-frente` en el nombre) y dice si ha oído los dos pitidos. Para analizarlos juntos, pasa uno al otro con «Compartir» → Quick Share.
8. En el móvil que lo recibe: «Abrir con el otro vídeo» (en el resultado o en «Grabaciones de este móvil») y elige el que llegó por Quick Share (en Descargas). Se abren como una sesión de dos vistas con el desfase propuesto (el pitido o, si no se oyó, el reloj): pulsa «Aplicar» y, mejor, compruébalo con un evento visual (una palmada que se vea en las dos).

Recomendaciones razonadas: los dos móviles con la pantalla encendida y la app delante (se queda encendida sola mientras estás en la sala); batería suficiente; si el reloj común sale muy grande (más de 100 ms), mejor la misma Wi-Fi para los dos.

**Para que se oigan los pitidos:** volumen multimedia alto en los dos móviles (el de los vídeos, no el del timbre), sin auriculares ni altavoces Bluetooth conectados (el pitido saldría por ellos; la app avisa si los ve, también los del otro móvil) y toca la pantalla de cada móvil al menos una vez antes de grabar (el navegador no deja sonar nada sin un toque; elegir la vista ya cuenta). Si un móvil dice que no oye bien el del otro, sube el volumen o acércalos.

**Claqueta con la cámara del móvil:** si grabas con la app de cámara de cada móvil (arrancadas a mano), pon las dos a grabar y pulsa «Pitido de claqueta» en la portada de la app con un tercer móvil (o uno de los dos), a la misma distancia de las dos cámaras. Suena a los 3 s. Al abrir los dos vídeos, «Sincronizar por el audio» lo encuentra.

## Segunda vista: de frente (FPPA de la rodilla)

Con un segundo móvil, la misma pierna de frente da el valgo dinámico (FPPA). Recomendaciones (sin vídeos reales todavía):

| Gomet | Punto anatómico | Cómo encontrarlo |
|---|---|---|
| 1 | **Muslo proximal** | En la cara anterior del muslo, a media distancia entre la espina ilíaca anterosuperior y la rótula (estimación del centro de la cadera visto de frente) |
| 2 | **Centro de la rodilla** | Centro de la rótula, con la rodilla extendida |
| 3 | **Centro del tobillo** | Punto medio entre los dos maléolos, en la cara anterior |

- En la misma pierna que se graba de perfil (la app la toma de la vista lateral: la que ve la cámara; si la persona mira a la derecha de la imagen, su pierna derecha).
- **Cámara de frente, perpendicular y a la altura de la rodilla**, a 2–3 m, fija. El FPPA es una proyección: con la cámara en diagonal o la persona girada, una flexión se ve como valgo.
- Del mismo color que los laterales vale (cada vista sigue los suyos), pero que no se toquen entre sí.
- **Para sincronizar las dos vistas:** una palmada (o un golpe seco) al empezar, que se vea y se oiga en los dos vídeos. En la app: «Vídeo» → «Añadir la segunda vista» → «La cámara la ve de frente», y en «Sincronizar las vistas», marcar el frame de la palmada en cada una.
