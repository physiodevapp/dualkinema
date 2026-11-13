# Fase 9: marcha

Estado: **planificada** (plan del 13-11-2026, pedido por el usuario el 13-11; empieza al cerrar la fase 8). Las decisiones D1–D10 están escritas y se siguen con lo recomendado, según el acuerdo «Hasta el final del proyecto» de `CLAUDE.md`. Lo que dependa de vídeos reales queda marcado como **pendiente de validar con vídeos**.

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

**D9 — Verdad conocida.** Una persona sintética que anda (`core/marcha/sintetico.ts`): cadera, rodilla y tobillo con curvas de marcha típicas, longitudes de segmento conocidas, zancada y % de apoyo conocidos, en cinta y por el suelo, con ruido y frames sin persona. Tests: eventos a menos de un frame de la verdad, ciclos normalizados a menos de 1° de la curva de verdad, parámetros exactos sin ruido. e2e: el worker falso de las pruebas sin marcadores manda la persona que anda.

**D10 — 3D, después.** Con dos móviles calibrados, los mismos eventos salen de los puntos 3D (adelante = el rumbo de la persona) y valen para las dos piernas; queda para un paso posterior.

## Orden de trabajo (un PR por paso)

| Paso | Contenido |
|---|---|
| 1 | Núcleo (`core/marcha/`): eventos, ciclos, normalización, media, parámetros y la persona sintética que anda, con tests de valor conocido |
| 2 | Interfaz: la tarjeta «Marcha», la gráfica en % del ciclo, la corrección de eventos, el CSV, el glosario y lo guardado; e2e |
| 3 | Cierre: revisión de código y limitaciones |
