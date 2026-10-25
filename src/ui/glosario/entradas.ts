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
      'Las gráficas de las dos vistas comparten el eje X en tiempo común (alineadas, una debajo de la otra, o superpuestas en la misma), con el cursor compartido. En el CSV de cada vista, la columna `t_comun_s` es su tiempo del vídeo más su desfase, y la cabecera dice cómo se sincronizó. Nada se interpola: cada fila es un frame real de su vídeo.',
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
    id: 'sincronia-audio',
    titulo: 'Sincronizar por el audio',
    texto: [
      'La palmada (o cualquier sonido fuerte) la graban los micrófonos de los dos móviles. La app lee en este dispositivo el sonido de los primeros 60 s de cada vídeo, se queda con los instantes en que sube su energía (sin los graves) y busca el desfase de B, hasta ±10 s, con una correlación (GCC-PHAT) a la que no le importan el volumen ni el micrófono de cada móvil.',
      'La calidad compara el mejor pico de la correlación con el segundo. Por debajo de 2 no es fiable (varios golpes parecidos, pasos, música, mucho ruido o un golpe que solo oye un móvil) y se propone el evento visual. La precisión del audio es de ±0,5 ms.',
      'Lo que el audio no sabe: dentro del archivo, cada móvil guarda el sonido con su propio retardo respecto a la imagen, distinto en cada grabación (de unos pocos ms a varias decenas). Por eso se comprueba con un evento visual: se ven los dos desfases y su diferencia y, si discrepan más de lo que explica la precisión del evento, manda la imagen. La app no corrige nada por su cuenta.',
    ],
  },
  {
    id: 'grabacion',
    titulo: 'Grabar con este móvil',
    texto: [
      'La app graba con la cámara trasera a la resolución elegida y a 30 fps, en H.264 si el móvil lo codifica (si no, VP9, AV1 o HEVC), con un fotograma clave cada segundo para que el visor salte rápido a cualquier frame. El sonido se graba sin procesar (sin cancelación de eco, supresión de ruido ni control de ganancia), como hará falta para sincronizar dos móviles por el pitido. 60 fps no se ofrece: en los móviles probados Chrome los concede pero la cámara entrega unos 40.',
      'Cada vídeo se guarda en el almacenamiento de la app en este móvil y no sale de él. Se pueden abrir en el visor, compartir (con Quick Share, al otro móvil o a otro dispositivo tuyo), guardar en Descargas o borrar. Si el navegador no garantiza ese almacenamiento, Android podría borrarlo con muy poco espacio: compartir o guardar una grabación la pone a salvo. Se graba como mucho 5 minutos seguidos, y si la app se cierra a mitad (una llamada que la tapa, quedarse sin batería) esa grabación se pierde.',
      'Al parar, la app cuenta los frames que de verdad hay en el archivo. Si la cámara da menos del 90 % de los fps pedidos (por ejemplo, 25 de 30), avisa. Puede ser poca luz (la cámara alarga la exposición y baja los fps) u otra causa del móvil: con más luz suele dar los 30. Los fps variables no son un problema para los cálculos (se usa el tiempo de cada frame), pero con menos frames y más desenfoque de movimiento el seguimiento y las velocidades son menos finos.',
    ],
  },
  {
    id: 'emparejar',
    titulo: 'Grabar con dos móviles',
    texto: [
      'Un móvil crea una sala y el otro se une escaneando su QR con la cámara (abre la app ya en la sala) o escribiendo su código de 6 caracteres (sin 0, O, 1, I ni L, que se confunden). Una sala admite dos móviles y se cierra sola a las 3 horas; si se corta la conexión, cada móvil vuelve a entrar solo.',
      'Cada móvil dice cómo ve a la persona: uno de perfil (es la vista de referencia: de ella sale la pierna que se analiza) y el otro de frente o de espaldas. Los dos ven el estado del otro (su cámara, el espacio libre y la batería) y la pantalla se queda encendida.',
      'Grabar con los dos: cualquiera de los dos móviles elige la cuenta atrás (5, 10 o 15 s, para llegar a tu sitio) y la duración (10 a 60 s, o «hasta parar»). El otro confirma; si no contesta en 3 s, no graba ninguno. Suenan pitidos los últimos 3 s (antes de grabar: no quedan en el vídeo) y los dos empiezan a la vez, cada uno en su reloj. Paran solos al acabar la duración, aunque se corte la conexión, o cuando alguien pulsa «Parar los dos». Cada vídeo lleva dentro el id común de la pareja, su vista y su reloj (cuándo empezó y cuánto iba por delante el del otro), para reconocerlos y sincronizarlos al abrirlos juntos.',
      'Para hablarse, los dos móviles usan un relé en internet (un servicio de Cloudflare de dualkinema) que reenvía mensajes cortos de uno a otro sin leerlos ni guardarlos. Por ahí solo viajan la vista elegida, el estado de la cámara y marcas de tiempo: nunca vídeo, sonido ni nada del paciente. Cloudflare ve la dirección de internet de cada móvil al conectarse. Los vídeos se quedan en cada móvil y se pasan de uno a otro con «Compartir» (Quick Share).',
    ],
  },
  {
    id: 'reloj-comun',
    titulo: 'Reloj común entre los dos móviles',
    texto: [
      'Cada móvil cuenta el tiempo con su propio reloj, que empieza en otro momento. Para arrancar los dos a la vez hay que saber cuánto va por delante el del otro. Se mide como en NTP: un móvil manda la hora de su reloj, el otro anota cuándo la recibe y cuándo contesta, y el primero cuándo le llega la respuesta. Con esas cuatro marcas, el desfase real está a la fuerza en un intervalo, sin suponer nada de la red.',
      '«± N ms» es la mitad de ese intervalo, juntando todos los intercambios recientes: el desfase de verdad está dentro, seguro (salvo que un reloj salte). Con la red de casa suele ser de unos pocos ms a unas decenas. Para arrancar a la vez basta de sobra; la sincronía fina de los vídeos la dará el pitido (con precisión de menos de 1 ms) y se comprueba con un evento visual.',
      'La deriva es cuánto se separan los dos relojes con el tiempo (sus cristales no van exactamente igual): suele ser de 10 a 100 partes por millón, como mucho 3 ms en 30 s. Se mide (sale tras unos 20 s) y se muestra con su margen, pero no se corrige.',
    ],
  },
  {
    id: 'pitido',
    titulo: 'Pitido de ida y vuelta',
    texto: [
      'En la grabación con dos móviles, ya grabando, pita cada uno por turnos: el de perfil al segundo de empezar y el otro a los 2,5 s. Cada pitido son tres barridos cortos (de 2 a 5 kHz, 40 ms) con separaciones distintas, una forma que no se confunde con la voz, los pasos ni una palmada. Los dos vídeos oyen los dos pitidos: el propio de cerca y el del otro desde donde esté.',
      'Un sonido llega antes al micrófono más cercano (3 m de diferencia son 8,7 ms). Con un solo pitido ese retraso quedaría en el desfase; con dos, uno desde cada lado, el retraso suma en uno y resta en el otro: la media da el desfase de los vídeos sin él, y la diferencia da la distancia entre los móviles, que sirve de comprobación. No importa cuánto tarda en sonar cada altavoz: los dos micrófonos graban el mismo sonido.',
      'Al parar, cada móvil busca los dos pitidos en su vídeo y dice si los ha oído, con su calidad (pico entre segundo pico; desde 3 se dan por buenos). Para que se oigan: volumen multimedia alto en los dos y nada de auriculares conectados (el sonido saldría por ellos). Como con el audio de la fase 3, no incluye el retardo entre el sonido y la imagen de cada móvil: se comprueba con un evento visual.',
    ],
  },
  {
    id: 'grabacion-doble',
    titulo: 'Abrir una grabación doble',
    texto: [
      'Los dos vídeos de una grabación con dos móviles llevan dentro el mismo identificador de pareja, la vista de cada uno y su reloj. «Abrir la grabación doble» (en la portada, o desde «Grabaciones de este móvil» con el propio vídeo ya elegido) comprueba que son pareja, pone el de perfil como vista A y la orientación de cada uno sin preguntarla, y abre la pestaña «Vídeo» con el desfase que se propone.',
      'Se propone el pitido de ida y vuelta si es fiable (calidad desde 3 y una distancia entre los móviles de 0,3 a 15 m) y cae dentro de lo que permite el reloj común (su cota más 50 ms). Si no, el reloj, que es menos preciso (± su cota, unas decenas de ms), y se dice por qué. Nada cambia hasta pulsar «Aplicar».',
      'Las dos cifras miden el sonido o los relojes, no la imagen: cada móvil puede guardar el sonido algo desplazado de su imagen. Por eso conviene comprobarlo con un evento visual (una palmada que se vea en las dos vistas): si discrepan más de lo que explican las dos precisiones, se avisa y se puede usar el del evento.',
    ],
  },
  {
    id: 'datos',
    titulo: 'Dónde se guardan los datos',
    texto: [
      'Todo se procesa en este dispositivo, en el navegador: los vídeos y los datos nunca salen de él. Un vídeo que se abre no se guarda nunca (los grabados con la app quedan en su almacenamiento hasta que los borres: ver «Grabar con este móvil»); lo que se guarda (marcado, seguimiento, ajustes, escala, desfase) queda en este navegador y se actualiza solo. Al grabar con dos móviles, por internet solo viajan mensajes de control y marcas de tiempo (ver «Grabar con dos móviles»).',
      'Para continuar una sesión hay que volver a abrir el mismo vídeo (el navegador no puede reabrirlo solo); con dos vistas, los dos. Se reconocen por su tamaño, duración y número de frames, no por el nombre.',
    ],
  },
]

export const entradaPorId = (id: string): EntradaGlosario | undefined => ENTRADAS.find((e) => e.id === id)
