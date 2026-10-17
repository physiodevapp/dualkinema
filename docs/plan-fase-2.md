# Plan de la fase 2: calibración y cálculos

Estado: **decisiones D1–D8 aceptadas por el usuario tal como se proponen** (2026-10-17). Pendiente de empezar: paso 1 (pruebas e2e).

Objetivo de la fase (CLAUDE.md): escala en metros, Butterworth de fase cero, velocidades y aceleraciones, corrección manual de puntos y exportación CSV. Además, lo que la fase 1 dejó pendiente y conviene resolver antes de calcular: persistencia (D4 de la fase 1), retroceder rápido, cero de referencia y pruebas en navegador en el repositorio (limitaciones 1, 5, 7 y 12 de `docs/plan-fase-1.md`, §12).

Criterio de cierre: con un vídeo real de sentadillas, la persona puede:
- marcar y corregir a mano donde haga falta;
- ver el ángulo de rodilla filtrado y su velocidad angular, con el cero en la postura de pie;
- calibrar la escala con un objeto de longitud conocida y ver la velocidad del tobillo en m/s;
- exportar todo a CSV;
- recargar la página sin perder el trabajo.

---

## 1. Filtrado: Butterworth paso bajo de fase cero [D1, D2]

Por qué hace falta: el seguimiento tiene ruido de unas décimas de píxel por frame, y al derivar (velocidad, aceleración) ese ruido se multiplica por los fps al cuadrado. La media móvil de physiq-kinematics no sirve aquí: depende de los fps, retrasa la señal y deforma los picos.

**Propuesta:**

- **Qué se filtra.** Se filtran las **coordenadas de cada marcador** (x e y por separado) y después se calculan ángulos y derivadas a partir de ellas. Es el procedimiento estándar en biomecánica con marcadores (Winter, *Biomechanics and Motor Control of Human Movement*). Filtrar el ángulo directamente también sería posible, pero las velocidades lineales de los marcadores necesitan sus coordenadas filtradas de todos modos. **[D1]**
- **Cómo se filtra.**
  - Butterworth de 2.º orden aplicado ida y vuelta: fase cero, sin retraso, equivalente a 4.º orden.
  - Al pasar dos veces, la frecuencia de corte efectiva baja. Se corrige con el factor de Winter (0,802 para dos pasadas), para que el corte que eliges sea el corte real.
- **Frecuencia de corte.** **6 Hz** por defecto, ajustable de 2 a 15 Hz. 6 Hz es el valor habitual para marcadores en movimientos lentos o moderados (marcha, sentadilla). Más adelante se puede añadir el análisis de residuos de Winter, que propone un corte para cada vídeo. **[D2]**
- **fps variable.** Un Butterworth necesita muestras equiespaciadas, y los móviles no las dan.
  - Cada tramo sin huecos se remuestrea a una frecuencia constante (la mediana de los fps del vídeo) por interpolación cúbica.
  - Se filtra a esa frecuencia y se vuelve a los tiempos reales de cada frame.
  - Esto no inventa datos: solo reparte en el tiempo lo que ya está medido.
- **Huecos.**
  - Nunca se filtra a través de un hueco: cada tramo se filtra por separado.
  - Los extremos se rellenan por reflexión, que es lo estándar para que los bordes no se deformen.
  - Un tramo demasiado corto para filtrarlo bien (unas 3 veces la longitud del filtro) se marca y no se usa para derivadas.
- **Se muestran las dos curvas, cruda y filtrada,** para ver qué hace el filtro.

**Tests:** señales de valor conocido (seno de 1 Hz con ruido blanco).
- La señal filtrada debe quedar cerca del seno y sin desfase.
- La respuesta en frecuencia a 6 Hz debe ser −3 dB.
- Con fps variable y con huecos, el resultado debe coincidir con filtrar la señal equiespaciada.

## 2. Velocidades y aceleraciones

- **Cálculo:** diferencias centrales sobre la señal filtrada y equiespaciada, y vuelta a los tiempos reales.
  - **Velocidad angular** en °/s; **aceleración angular** en °/s².
  - **Velocidad lineal** de cada marcador en px/s, o en m/s con escala.
- **Sin datos fiables:** en los bordes de cada tramo y en los tramos cortos, no hay derivada (hueco, nunca 0).
- **Tests:** derivada de un seno y de una parábola, con valor conocido.

## 3. Cero de referencia [D3]

De pie salió −4,7° porque los gomets no caen sobre los ejes articulares. La práctica habitual es una **toma estática**: tú eliges un tramo quieto (por ejemplo, los primeros 2 s de pie), la app calcula el ángulo medio y lo resta.

- Se muestran el valor **crudo** y el **relativo al estático**, nunca uno en lugar del otro sin decirlo.
- El tramo elegido se guarda con la sesión y sale en el CSV.

**[D3]** ¿Te sirve clínicamente así, o prefieres otra referencia (por ejemplo, un ángulo medido con goniómetro e introducido a mano)?

## 4. Escala en metros [D4]

- **Calibración 2D:** con un objeto de longitud conocida **en el plano del movimiento**, tocas sus dos extremos, introduces la longitud y la app calcula metros por píxel. Sirve una cinta métrica o un palo de 1 m apoyado junto a la pierna, a la misma distancia de la cámara.
- **Avisos que tendrá la app:**
  - Solo vale para lo que está en ese plano: lo que está más cerca o más lejos de la cámara sale con otra escala.
  - Sin corrección de lente (fase 6), los bordes de la imagen tienen algo de distorsión.
- **Dónde se guarda:** con la vista (`Vista.calibracion`, previsto en el modelo de datos desde la fase 1).
- **Los ángulos no necesitan escala.** Las velocidades lineales y las distancias, sí.

**[D4]** ¿Qué objeto tendrías a mano para calibrar? Cinta métrica en el suelo, palo de longitud conocida, regla en la pared…

## 5. Corrección manual de puntos [D5]

Lo de la fase 1 se queda corto (limitación 8). **Propuesta:**

- **Arrastrar un marcador** en cualquier frame, con lupa, y soltar en su sitio. Queda `editadoManual`.
- **Las posiciones marcadas a mano son anclas.**
  - Al seguir y llegar a un frame con ancla, el seguidor usa esa posición y vuelve a aprender el gomet ahí, en lugar de su estimación.
  - Así una corrección arregla también lo que viene después.
- **Rellenar un hueco a mano,** frame a frame. Opcionalmente, interpolar huecos cortos **solo si tú lo pides**, marcando esos frames como interpolados en la franja, la gráfica y el CSV.
- **Retroceder rápido:** caché de los últimos frames decodificados (limitación 7). Su tamaño se ajusta a la resolución del vídeo para no agotar la memoria del móvil.

**[D5]** Interpolar huecos cortos a petición, marcado como interpolado: ¿sí o no? Mi recomendación: sí, con un máximo de unos 0,2 s y siempre visible como tal.

## 6. Persistencia (IndexedDB) [D6]

- **Se guarda automáticamente:**
  - marcado y trayectorias;
  - orientación, calibración y cero de referencia;
  - ajustes del filtro.
- **Esquema propio de dualkinema** (no el de PhysiQ), con versión, para poder cambiarlo.
- **El vídeo no se guarda,** porque puede pesar cientos de MB. La sesión se asocia a una huella del archivo (nombre, tamaño, duración y número de frames). Al volver a abrir el mismo vídeo, la app ofrece recuperar el trabajo.
- **Lista de sesiones guardadas,** con opción de borrarlas. Todo se queda en el dispositivo.

**[D6]** ¿De acuerdo con no guardar el vídeo y pedirlo al reabrir?

## 7. Exportación CSV [D7]

- **Una fila por frame:**
  - tiempo (s) y número de frame;
  - por marcador: x e y en px, x e y en m si hay escala, calidad y si está editado a mano o interpolado;
  - ángulo crudo, filtrado y relativo al estático;
  - velocidad y aceleración angulares;
  - velocidad lineal de cada marcador.
- **Cabecera con los metadatos:** archivo, fps, orientación, filtro (corte), calibración y tramo estático.
- **Sin valor = celda vacía,** nunca 0.
- **Se genera en el dispositivo y se descarga o se comparte** con el menú de compartir de Android. No pasa por ningún servidor.

**[D7]** ¿Formato para Excel en español (separador `;` y coma decimal) o el internacional (`,` y punto)? Propongo el de Excel en español por defecto y el otro como opción.

## 8. Pruebas en navegador en el repositorio [D8]

Las pruebas de punta a punta de la fase 1 se hicieron en la sesión, fuera del repo (limitación 12). **Propuesta:** `tests/e2e/` con:
- el generador de vídeos sintéticos (Node + ffmpeg);
- los guiones de Playwright: frame exacto, seguimiento y ángulo frente a la verdad, gomet tapado, gráfica.

Además, un trabajo de CI que las ejecute en cada PR. GitHub Actions puede instalar ffmpeg y Chromium.

**[D8]** ¿Las metemos en la CI o solo como herramienta local para las sesiones? Recomiendo la CI: tarda unos minutos y evita regresiones como el umbral incoherente que encontró la revisión.

---

## Orden de trabajo (un PR por paso)

| Paso | Contenido | Modelo (tabla de CLAUDE.md) |
|---|---|---|
| 1 | Pruebas e2e en el repo y en la CI | Sonnet |
| 2 | Persistencia en IndexedDB (modelo de datos de la sesión) | Opus |
| 3 | Corrección manual con anclas, relleno de huecos y caché para retroceder | Opus |
| 4 | Butterworth de fase cero, remuestreo y tramos, con tests | Opus |
| 5 | Velocidades y aceleraciones, y cero de referencia | Opus |
| 6 | Calibración de escala en metros | Opus |
| 7 | Exportación CSV | Sonnet |
| 8 | Gráfica: crudo y filtrado, velocidad | Sonnet |
| 9 | Cierre de fase: revisión, CLAUDE.md y limitaciones | Opus |

Las pruebas e2e van primero para que cada paso siguiente quede cubierto. La persistencia va antes que los cálculos porque probar los filtros con vídeos reales sin guardar el marcado obliga a repetirlo cada vez.

## Resumen de decisiones (aceptadas)

| | Decisión | Propuesta |
|---|---|---|
| D1 | Qué se filtra | Las coordenadas de los marcadores; ángulos y derivadas se calculan después |
| D2 | Frecuencia de corte | 6 Hz por defecto, ajustable de 2 a 15 Hz |
| D3 | Cero de referencia | Media de un tramo estático elegido; mostrar crudo y relativo |
| D4 | Objeto de calibración | El que haya: cinta, palo o regla en el plano del movimiento (la app no impone uno) |
| D5 | Interpolar huecos cortos | Solo a petición, ≤ 0,2 s, siempre marcado como interpolado |
| D6 | Persistencia | IndexedDB sin el vídeo; al reabrir el mismo archivo, recuperar el trabajo |
| D7 | Formato CSV | `;` y coma decimal por defecto; el internacional como opción |
| D8 | Pruebas e2e | En el repo y en la CI |
