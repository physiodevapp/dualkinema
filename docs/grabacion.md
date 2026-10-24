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

## Segunda vista: de frente (FPPA de la rodilla)

Con un segundo móvil, la misma pierna de frente da el valgo dinámico (FPPA). Recomendaciones (sin vídeos reales todavía):

| Gomet | Punto anatómico | Cómo encontrarlo |
|---|---|---|
| 1 | **Muslo proximal** | En la cara anterior del muslo, a media distancia entre la espina ilíaca anterosuperior y la rótula (estimación del centro de la cadera visto de frente) |
| 2 | **Centro de la rodilla** | Centro de la rótula, con la rodilla extendida |
| 3 | **Centro del tobillo** | Punto medio entre los dos maléolos, en la cara anterior |

- En la misma pierna que se graba de perfil (la app la toma de la vista lateral: si la persona mira a la derecha, la izquierda).
- **Cámara de frente, perpendicular y a la altura de la rodilla**, a 2–3 m, fija. El FPPA es una proyección: con la cámara en diagonal o la persona girada, una flexión se ve como valgo.
- Del mismo color que los laterales vale (cada vista sigue los suyos), pero que no se toquen entre sí.
- **Para sincronizar las dos vistas:** una palmada (o un golpe seco) al empezar, que se vea y se oiga en los dos vídeos. En la app: «Vídeo» → «Añadir la segunda vista» → «La cámara la ve de frente», y en «Sincronizar las vistas», marcar el frame de la palmada en cada una.
