/**
 * El glosario de la app (fase 3, §1): una entrada = id, título y texto (párrafos). Se enlaza por id desde el propio valor
 * o aviso (`InfoGlosario`). Todo local, sin servidor. Los números que citan los textos son los del código (`CLAUDE.md`):
 * si cambian allí, cambian aquí.
 */
export interface EntradaGlosario {
  readonly id: string
  readonly titulo: string
  readonly texto: readonly string[]
}

export const ENTRADAS: readonly EntradaGlosario[] = [
  {
    id: 'angulo',
    titulo: 'Ángulo: sin cero y relativo',
    texto: [
      'Es el ángulo que forman los dos segmentos de la articulación (en la rodilla, muslo y pierna), con la convención clínica de esa articulación: la flexión es positiva y sale lo mismo se grabe desde un lado o desde el otro.',
      '«Sin cero» es el ángulo tal cual sale de la imagen. «Relativo» es ese ángulo menos el del cero de referencia (una toma estática, ver «Cero de referencia»). Siempre se ven los dos: nunca uno en lugar del otro sin decirlo.',
      'Cada vista mide la articulación de su plano: en una vista de perfil, la flexión de la rodilla; en una de frente, el FPPA (ver «FPPA de la rodilla»). Con marcadores que no son de su plano no hay ángulo y se ve «—».',
    ],
  },
  {
    id: 'fppa',
    titulo: 'FPPA de la rodilla (valgo dinámico)',
    texto: [
      'El ángulo de proyección en el plano frontal de la rodilla (FPPA) es la medida en 2D del valgo dinámico más usada en sentadilla a una pierna, escalón y aterrizajes. Se mide en la vista de frente, entre el muslo (muslo proximal → centro de la rodilla) y la pierna (centro de la rodilla → centro del tobillo).',
      '0° es el muslo y la pierna alineados. Valgo (la rodilla hacia dentro, hacia la otra pierna) es positivo y varo (hacia fuera), negativo; igual en la pierna derecha y en la izquierda, y con la cámara delante o detrás de la persona.',
      'Gomets: muslo proximal (a media distancia entre la espina ilíaca anterosuperior y la rótula, como estimación del centro de la cadera), centro de la rodilla (centro de la rótula) y centro del tobillo (punto medio entre los maléolos).',
      'Es una proyección: depende de que la cámara esté de frente a la persona, perpendicular y a la altura de la rodilla. Si la persona gira o la cámara queda en diagonal, una flexión se ve como valgo. Por eso se mira junto con la vista de perfil.',
    ],
  },
  {
    id: 'cero',
    titulo: 'Cero de referencia',
    texto: [
      'Un tramo en que la persona está quieta (por ejemplo, de pie antes de empezar). Su ángulo medio se resta del ángulo de todo el vídeo para dar el relativo: así «0°» es la postura de referencia y no la que tenga la cámara.',
      'Se guarda el tramo y la media se recalcula cada vez, con lo que sale del seguimiento actual. Junto a la media se muestra su desviación: si es grande, la persona no estaba quieta y el cero no es fiable.',
    ],
  },
  {
    id: 'filtro',
    titulo: 'Filtro y frecuencia de corte',
    texto: [
      'El seguimiento tiene ruido (un gomet no se coloca siempre en el mismo píxel). Se filtran las coordenadas de cada gomet con un Butterworth de segundo orden aplicado de ida y vuelta: no retrasa la señal (fase cero), y el ángulo y las velocidades se calculan después, a partir de lo filtrado.',
      'La frecuencia de corte (en Hz) decide qué se conserva: más corte sigue más el detalle del movimiento y también más ruido. Por defecto, 6 Hz; se puede elegir entre 2 y 15 Hz y nunca pasa de 0,4 veces los fps del vídeo.',
      'El filtro nunca cruza un hueco ni un salto en el tiempo: cada tramo de frames con posición utilizable se filtra por separado. Un tramo de menos de 10 frames seguidos se filtra, pero se avisa de que es corto y no tiene velocidad.',
    ],
  },
  {
    id: 'velocidad',
    titulo: 'Velocidad y aceleración',
    texto: [
      'Son las derivadas de lo filtrado: velocidad angular (°/s) y aceleración angular (°/s²) del ángulo, y velocidad de cada marcador (m/s con la escala calibrada, px/s sin ella).',
      'No tienen valor («—») en el primer y el último frame de cada tramo seguido (no hay frame a un lado para derivar) ni en los tramos cortos. Nunca se pone un 0 donde no hay valor.',
      'La aceleración amplifica mucho el ruido: si salta de un frame a otro, baja la frecuencia de corte del filtro.',
    ],
  },
  {
    id: 'calidad',
    titulo: 'Seguido, dudoso, perdido y a mano',
    texto: [
      'Cada posición de un gomet lleva una calidad entre 0 y 1. «Seguido» (calidad de 0,5 o más) se usa en todo: ángulo, gráfica, filtro y recuentos. Es el único umbral que decide qué posición vale para el análisis.',
      '«Dudoso» (entre 0,3 y 0,5) es una detección que el seguidor acepta solo para no perder el hilo, pero que no cuenta para el análisis. «Perdido» es un frame sin posición: el seguidor nunca la inventa. Dos marcadores sobre la misma mancha quedan los dos perdidos.',
      '«A mano» es una posición que marcaste tú (es un ancla, ver «Anclas»). «Interpolado» es una posición rellenada a petición en un hueco corto.',
    ],
  },
  {
    id: 'huecos',
    titulo: 'Huecos y huecos cortos',
    texto: [
      'Un hueco son frames en que un gomet no tiene posición utilizable (se tapó, salió de plano, el color se confundió). En la gráfica un hueco corta la línea y en la franja del deslizador sale en rojo: nunca se dibuja como 0.',
      'Un hueco corto (de 0,2 s como mucho, entre dos posiciones fiables) se puede rellenar a petición con «Rellenar»: lo rellenado es interpolado, se ve distinto y se puede quitar. Los huecos largos no se rellenan: ahí no hay dato y no se inventa.',
    ],
  },
  {
    id: 'interpolado',
    titulo: 'Interpolado',
    texto: [
      'Una posición rellenada a petición dentro de un hueco corto, uniendo las dos posiciones fiables de sus lados. Se ve siempre distinto: azul en la franja y a trazos en la gráfica, en una serie aparte, para que no se confunda con lo medido.',
      'Se puede quitar: el hueco vuelve a ser lo que era antes (perdido, dudoso o sin muestra). La escala entre dos marcadores no usa las posiciones interpoladas.',
    ],
  },
  {
    id: 'anclas',
    titulo: 'Anclas y reenganche',
    texto: [
      'Lo que marcas a mano es un ancla: el seguimiento no lo sobrescribe, y «Seguir desde aquí» lo toma como cierto y vuelve a aprender el gomet desde ahí. Seguir quita lo seguido después de ese frame, pero no lo marcado a mano.',
      'Antes de seguir se avisa de las marcas a mano posteriores, con un botón para quitarlas: una marca de prueba sobre otra cosa haría seguir otra cosa desde ahí.',
      'Si un ancla está donde no se reconoce ningún gomet (por ejemplo, colocada «a ojo»), el seguidor intenta reengancharse: busca cerca, luego en medio frame y después en todo el frame, durante hasta 2 s. Solo acepta la única mancha con la forma, el tamaño y el color de su gomet que no sea de otro marcador; con dos candidatas, sigue perdido.',
    ],
  },
  {
    id: 'segmentos',
    titulo: 'Longitud de los segmentos',
    texto: [
      'Es la distancia entre los dos gomets de un segmento (muslo, pierna), en porcentaje respecto a su mediana. Con los gomets en el plano de la cámara, la longitud de un segmento rígido no cambia.',
      'Si sale de la banda (±3 %), el segmento se está saliendo del plano de la cámara (se ve más corto), o los gomets se deslizan sobre la piel, o el seguimiento falla: ahí el ángulo es menos fiable.',
    ],
  },
  {
    id: 'escala',
    titulo: 'Escala y su precisión',
    texto: [
      'Pasa píxeles a metros. Se calibra tocando los dos extremos de un objeto de longitud conocida que esté en el plano del movimiento, o tomando la distancia entre dos marcadores (por ejemplo, rodilla–tobillo) medida con cinta. Entre dos marcadores se promedia la distancia de cada frame del tramo (nunca la distancia entre posiciones medias) y sin lo interpolado.',
      'La precisión depende de la longitud: un píxel de error al tocar pesa más cuanto más corto es el objeto. Y solo vale para lo que se mueve en el plano del objeto: 10 cm más cerca o más lejos de la cámara ya cambian la escala.',
      'Los ángulos no usan la escala; sin escala no hay nada en metros (velocidades en px/s). Si lo seguido en el tramo cambia después de guardar la escala, se avisa y se puede rehacer.',
    ],
  },
  {
    id: 'fps',
    titulo: 'Tiempo del vídeo y fps variable',
    texto: [
      'Los móviles graban con fps variable: no hay una imagen cada 1/30 s exacta. Por eso todo se calcula con el tiempo de cada frame en segundos, nunca con su número, y los filtros y las derivadas trabajan sobre ese tiempo.',
      '«Entre frames» en los datos del vídeo es la separación mínima y máxima entre dos frames seguidos; si varía más de un 10 %, se marca como variable.',
    ],
  },
  {
    id: 'tiempo-comun',
    titulo: 'Tiempo común y desfase',
    texto: [
      'Con dos vistas, una es la referencia (A) y su tiempo es el tiempo común. Cada vista tiene un desfase respecto a ella: tiempo común = tiempo del vídeo + desfase. Un evento visto en el instante t en la vista B ocurre en el tiempo común t + desfase de B.',
      'Cada vista conserva su propia lista de frames (a 30 y a 25 fps el frame 50 de una no es el frame 50 de la otra): el cursor común lleva la otra vista al frame que se ve en ese instante. Si el instante cae fuera de su vídeo, se queda donde estaba y pone «Fuera de este vídeo».',
    ],
  },
  {
    id: 'sincronia',
    titulo: 'Sincronizar por evento y su precisión',
    texto: [
      'El desfase de B se halla con un evento que se vea en las dos vistas (una palmada, el pie que toca el suelo): se marca el frame del evento en cada una y desfase de B = instante del evento en A − instante del evento en B.',
      'La precisión es la suma de medio frame de cada vista: cada vídeo sitúa el evento con un error de hasta medio frame suyo. Entre dos vídeos de 30 fps, ±33 ms. El ajuste fino mueve B de a un frame suyo antes o después, mirando los dos vídeos en el evento.',
      'Los relojes de dos móviles se desvían unos 10–100 ppm: en 30 s, como mucho 3 ms. No se corrige: solo se halla un desfase constante.',
    ],
  },
  {
    id: 'datos',
    titulo: 'Dónde se guardan los datos',
    texto: [
      'Todo se procesa en este dispositivo, en el navegador: los vídeos y los datos nunca salen de él. El vídeo no se guarda nunca; lo que se guarda (marcado, seguimiento, ajustes, escala, desfase) queda en este navegador y se actualiza solo.',
      'Para continuar una sesión hay que volver a abrir el mismo vídeo (el navegador no puede reabrirlo solo); con dos vistas, los dos. Se reconocen por su tamaño, duración y número de frames, no por el nombre.',
    ],
  },
]

export const entradaPorId = (id: string): EntradaGlosario | undefined => ENTRADAS.find((e) => e.id === id)
