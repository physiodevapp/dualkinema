# Fase 9: marcha

Estado: **cerrada** (13-11-2026; ver «Cierre de la fase 9»). Plan del 13-11-2026, pedido por el usuario el 13-11. Las decisiones D1–D10 están escritas y se siguen con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md`. Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

## Qué se quiere

Analizar la marcha grabada de perfil: encontrar los **eventos del ciclo** (contacto inicial y despegue de cada pie), cortar la toma en **ciclos**, normalizar cada uno al **% del ciclo** (0–100 %), y dar la **curva media ± desviación típica** de cada articulación con los ciclos sueltos detrás, y los **parámetros espaciotemporales** (tiempo de zancada, cadencia, % de apoyo y, con la escala y andando por el suelo, longitud de zancada y velocidad). Es el informe de marcha de un laboratorio, pero con un móvil.

## Decisiones

**D1 — Eventos por la posición del pie respecto a la pelvis (Zeni y cols., 2008).** Contacto inicial: el talón en su punto más adelantado respecto a la cadera; despegue: la punta del pie en su punto más atrasado. En la vista de perfil, «adelante» es el x del marco canónico (`aCanonico`), así que vale mirando a un lado o al otro y **sirve igual andando por el suelo que en cinta** (es relativo a la pelvis). Alternativa descartada: por la velocidad del pie (necesita umbrales que dependen de la velocidad de la marcha y de los fps) o por el ángulo de la rodilla (más ruidoso en el despegue).

**D2 — De qué puntos.** De la fuente de la articulación que se mira: sin marcadores, talón, punta y cadera del modelo; con gomets, calcáneo, 5.º metatarsiano y trocánter (los del tobillo). Si faltan, no hay análisis de marcha (se dice qué falta). Primero el pie que ve la cámara (sus ángulos son los que se miden); el pie lejano, si el modelo lo da con calidad, solo para el tiempo de paso y el doble apoyo, y con un aviso de que es menos fiable (**pendiente de validar con vídeos**).

**D3 — Cómo se buscan los extremos.** Sobre las coordenadas **filtradas por tramos** (el filtro de la sesión: nunca a través de un hueco), máximos y mínimos locales separados al menos `SEPARACION_MIN_S` (0,4 s) y con una prominencia de al menos el 20 % del recorrido del pie respecto a la pelvis en ese tramo. El instante se afina con una parábola sobre los tres frames del extremo (fps variable: por tiempo, nunca por índice). Un extremo en el borde de un tramo no cuenta (no se sabe si era el extremo).

**D4 — Ciclos.** Un ciclo va de un contacto al siguiente del mismo pie, con un despegue en medio, todo dentro de un mismo tramo (sin huecos). Se descartan los que duran más de un 25 % de más o de menos que la mediana (un tropiezo, un giro, un evento perdido) y se dice cuántos y por qué. En la marcha por el suelo, los ciclos a medias al entrar y salir del encuadre se pierden solos (no tienen los dos contactos).

**D5 — Normalización y media.** Cada ciclo válido, de la serie del ángulo de siempre (`serieAngular`, filtrada; relativa al cero si hay cero), interpolada linealmente a 101 puntos (0, 1, …, 100 %). Un ciclo con algún frame sin valor no se normaliza (no se inventa). Media y desviación típica punto a punto de los ciclos incluidos; cada ciclo se puede excluir a mano (y vuelve a la media al incluirlo).

**D6 — Parámetros.** Tiempo de zancada (media ± DE), cadencia (pasos por minuto = 120 / tiempo de zancada), % de apoyo (del contacto al despegue, sobre la zancada) y, si el pie lejano da eventos fiables, tiempo de paso y doble apoyo. Con escala y **por el suelo**: longitud de zancada (avance del talón entre dos contactos) y velocidad (avance de la cadera por segundo). En cinta, longitud y velocidad no salen de la imagen (la cinta mueve el suelo): se detecta sola (la cadera avanza menos de un pie por ciclo) y se dice; se puede cambiar a mano.

**D7 — Corregir los eventos a mano.** Lista de eventos con «Ir», «Mover aquí» (al frame del cursor), «Quitar» y «Añadir contacto / despegue aquí». Lo corregido manda sobre lo detectado al volver a buscar (como lo marcado a mano). Se guarda con la vista (opcional, sin subir el esquema), con los ciclos excluidos.

**D8 — Interfaz.** En «Análisis», con una vista de perfil, la tarjeta «Marcha»: «Buscar los ciclos», el resumen (ciclos encontrados, válidos y descartados), los parámetros, la gráfica en % del ciclo de la articulación que se mira (media ± DE en banda, ciclos sueltos finos detrás, la línea vertical del despegue medio) y la lista de ciclos para incluir o excluir. Los eventos, como marcas sobre la gráfica del tiempo. CSV «Ciclos de marcha»: la media, la DE y cada ciclo en columnas, con los parámetros en la cabecera. Glosario: «Ciclo de marcha», «Contacto inicial y despegue», «% del ciclo», «Cadencia y parámetros espaciotemporales».

**D9 — Verdad conocida.** Una persona sintética que anda (`core/marcha/sintetico.ts`): cadera, rodilla y tobillo con curvas de marcha típicas, longitudes de segmento conocidas, zancada y % de apoyo conocidos, en cinta y por el suelo, con ruido y frames sin persona. Tests: eventos a menos de un frame de la verdad, ciclos normalizados a menos de 2° de la curva de verdad (el filtro de 6 Hz rebaja unas décimas el pico del balanceo de la rodilla, y unos ms de error en el evento pesan donde la rodilla se dobla deprisa), parámetros exactos sin ruido. e2e: el worker falso de las pruebas sin marcadores manda la persona que anda.

**D10 — 3D, después.** Con dos móviles calibrados, los mismos eventos salen de los puntos 3D (adelante = el rumbo de la persona) y valen para las dos piernas; queda para un paso posterior.

## Orden de trabajo (un PR por paso)

| Paso | Contenido |
|---|---|
| 1 | Núcleo (`core/marcha/`): eventos, ciclos, normalización, media, parámetros y la persona sintética que anda, con tests de valor conocido |
| 2 | Interfaz: la tarjeta «Marcha», la gráfica en % del ciclo, la corrección de eventos, el CSV, el glosario y lo guardado; e2e |
| 3 | Cierre: revisión de código y limitaciones |

## Hecho

**Paso 1 (13-11):** `core/marcha/`: `sintetico.ts` (la persona que anda, en cinta o por el suelo, con curvas típicas y eventos de verdad), `eventos.ts` (detección por tramos con el filtro de la sesión, prominencia del 20 %, separación de 0,4 s y vértice de la parábola por tiempo; las correcciones a mano) y `ciclos.ts` (ciclos con descarte por hueco, despegues o duración; normalización; media ± DE; parámetros). Tests: sin ruido, cada evento a menos de 5 ms de la verdad mirando a los dos lados con fps variable; con 2 px de ruido, a menos de un frame; ningún ciclo cruza un hueco; la rodilla normalizada a menos de 2° de la verdad; zancada, cadencia, longitud y velocidad exactas; en cinta, sin longitud ni velocidad.

**Paso 2 (13-11):** la tarjeta «Marcha» en «Análisis» (`ui/visor/PanelMarcha.tsx`, con una vista de perfil): «Buscar los ciclos», el resumen, los parámetros, «Dónde anda» (lo decide la app, por el suelo o en cinta), la curva en % del ciclo de la articulación que se mira (relativa al cero si lo hay), la lista de ciclos con su casilla para la media y su motivo de descarte, los eventos para corregir («Ir», «Mover aquí», «Quitar», «Añadir… aquí») y el CSV (`core/exportacion/csvMarcha.ts`). El análisis entero, en el núcleo (`core/marcha/analisis.ts`: qué puntos del pie usar —`idsDelPie`, D2— y `analizarMarcha`). Lo corregido se guarda con la vista (`core/marcha/guardado.ts`, `VistaCabecera.marcha`, opcional y sin subir el esquema; vive en `AnfitrionVista`). Glosario «Marcha: ciclos y parámetros». e2e con la persona sintética que anda (en cinta): ciclos, zancada, cadencia, apoyo, excluir un ciclo, «Ir», el CSV y un evento quitado que se recupera.

Cambios sobre el plan: **la gráfica en % del ciclo es un SVG**, no uPlot: es estática (sin cursor ni zoom) y así sale entera y sin coste en cualquier ancho. **Los eventos no se marcan sobre la gráfica del tiempo** ni se usa el pie lejano (D2): quedan para cuando haya vídeos reales con los que ver si hacen falta. **Pendiente de validar con vídeos:** la prominencia (20 %) y la separación (0,4 s), la detección de «en cinta» y la calidad de talón y punta del modelo en la marcha real.

## Cierre de la fase 9 (paso 3, 13-11-2026)

**Revisión de código.** Todo el cálculo está en el núcleo y probado con la persona sintética (`core/marcha/`); la tarjeta solo junta y pinta. Las señales se filtran por tramos con el filtro de la sesión y los extremos se buscan por tramo, así que ningún evento ni ciclo cruza un hueco; el instante se afina por tiempo (fps variable). Lo corregido a mano se guarda como correcciones sobre lo detectado (manuales, quitados y excluidos), no como una lista cerrada: si se corrigen las trayectorias, lo detectado se recalcula y las correcciones siguen valiendo. Sin valor, celda vacía o «—», nunca 0.

**Limitaciones conocidas.**
1. **Un solo pie**: el de la cámara. Sin el pie lejano no hay tiempo de paso, doble apoyo ni simetría (con dos vistas de perfil, una en cada flanco, cada una da su pie; con el 3D, los dos).
2. **Pocos ciclos por el suelo**: en el encuadre de un móvil de perfil caben dos o tres zancadas; para la media hace falta repetir pasadas (todavía no se juntan los ciclos de varias tomas) o usar la cinta.
3. **En cinta**, sin longitud ni velocidad (no salen de la imagen); la velocidad de la cinta no se puede escribir todavía.
4. **Umbrales sin validar**: la prominencia (20 %), la separación (0,4 s), la duración (±25 %) y la decisión de «en cinta» son razonados; **pendiente de validar con vídeos**, igual que la calidad del talón y la punta del modelo en la marcha real (el pie es lo que peor detecta).
5. **La gráfica en % del ciclo es estática** (SVG): sin cursor ni valor al tocarla.

## Después del cierre: la marcha en 3D (13-11, D10)

Pedido por el usuario al acabar la fase 9. `core/marcha/tresd.ts`: las señales de cada pie (talón y punta respecto al punto medio de las caderas, en la dirección en que mira la persona en cada frame: el rumbo de la línea de las caderas, `rumbos`), los eventos de los dos pies con el mismo detector (`eventosDeSenales`, sacado de `detectarEventos`), los ciclos de cada pie, la curva del ángulo 3D que se mira en los ciclos del pie de su lado (sin lado, el derecho) y los parámetros de los dos pies (`parametros3D`): zancada, paso, apoyo y longitud de cada uno; cadencia, doble apoyo (de cada contacto al despegue del otro pie y del contacto del otro al despegue propio), velocidad y anchura del paso (separación de lado a lado de los dos talones en cada contacto). Se buscan con los puntos 3D **sin filtrar** (cada señal se filtra por tramos con el filtro de la sesión, como en 2D). Tests con la persona sintética que anda llevada a 3D con cualquier rumbo: eventos de los dos pies a menos de 5 ms; paso, longitud, velocidad y anchura exactos; doble apoyo a menos de un 2 % de la zancada; en cinta, sin longitud ni velocidad; sin escala, sin anchura.

Interfaz: «Marcha en 3D» dentro de la tarjeta «Ángulos en 3D» (`ui/visor/PanelMarcha3D.tsx`, con la gráfica y los eventos de `PanelMarcha`): los dos pies lado a lado, sus ciclos y sus eventos, y su CSV. Lo corregido se guarda con lo que se mira en 3D (`Ajustes3D.marcha`, opcional; ilegible, se descarta sin perder lo demás). e2e: con la persona sintética de la fase 6 (que da unos pasos) busca los ciclos de los dos pies sin errores.

**Pendiente de validar con vídeos:** el rumbo de la línea de las caderas oscila con la rotación de la pelvis al andar (unos ±5°): con la persona sintética no se nota, con una real se verá; y por el suelo, el tramo que ven bien los dos móviles es corto.
