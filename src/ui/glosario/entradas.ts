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
      'Se elige con «Primeros 2 s», con «Inicio aquí» y «Fin aquí» en el frame que se ve, o con «Aquí ± 0,2 s»: 0,4 s centrados en ese frame, para una pausa corta, como estar de pie entre dos sentadillas.',
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
    id: 'retraso-camara',
    titulo: 'Retraso de la cámara',
    texto: [
      'Al grabar con la app, cada frame y cada trozo de sonido se colocan en el instante en que se capturaron. Pero el instante que da el navegador a cada frame no cuenta lo que tarda la propia cámara en entregarlo (exponer, procesar), así que la imagen queda unas decenas de ms tarde respecto al sonido. Ese retraso es fijo en cada móvil.',
      'Para medirlo, «Calibrar la cámara» (en «Grabar con este móvil»): se graban unas palmadas, la app encuentra cada una en el sonido y enseña los frames de alrededor, y se toca el primero con las manos juntas. El contacto está entre ese frame y el anterior: cada palmada da un intervalo para el retraso y, con varias, se toma lo que tienen en común, con su margen («± N ms»). Más palmadas, menos margen.',
      'Se guarda en el móvil (no en una sesión) y desde entonces se descuenta a cada frame al grabar, también en la grabación doble; el vídeo lleva anotado lo que se descontó. Si se cambia de móvil o de cámara, hay que volver a calibrar.',
    ],
  },
  {
    id: 'fps-grabacion',
    titulo: 'A cuántos fps grabaría',
    texto: [
      'Antes de grabar, la app prueba unos segundos: primero cuenta los frames que da la cámara y después los codifica igual que al grabar (mismo formato, misma calidad), sin guardar nada, y cuenta los frames por segundo que salen. Se repite al cambiar de calidad y cada minuto, porque la luz cambia (cada 10 s mientras hay aviso, así que se quita poco después de poner más luz).',
      'Si salen menos del 90 % de los pedidos (27 de 30), avisa y dice por qué: si la propia cámara da pocos, suele ser poca luz (la exposición automática alarga cada frame); si la cámara da 30 y salen menos, el móvil no codifica tan deprisa (pasa con los que lo hacen por software: menos resolución ayuda). Con dos móviles, cada uno le cuenta al otro su cifra.',
      'Con pocos fps se pierde detalle del movimiento: entre un frame y el siguiente pasa más tiempo, y los instantes (un contacto, el pico de una velocidad) se sitúan peor. Al parar, la app vuelve a contar los fps de lo grabado.',
    ],
  },
  {
    id: 'sensores',
    titulo: 'Sensores al grabar (inclinación y movimiento)',
    texto: [
      'Mientras graba, la app lee el acelerómetro y el giróscopo del móvil (sin pedir permiso: no salen del móvil) y guarda en el propio vídeo un resumen por segundo. De ahí sale hacia dónde está la vertical vista por la cámara, que el 3D con dos móviles usa para saber dónde está el suelo.',
      'Al parar se ve cuánto mira la cámara hacia abajo o hacia arriba respecto al horizonte y cuánto está girada la imagen. Lo mejor para el 3D es una cámara casi horizontal (menos de 10° arriba o abajo) y sin girar.',
      'Si el móvil se mueve durante la toma (una sacudida, un giro de más de 3 °/s o una inclinación que cambia más de 1° entre el principio y el final: se resbaló), la app lo dice. Esa toma sirve para medir en 2D, pero no para el 3D, que necesita cada cámara quieta. Lo de la cuenta atrás (colocar el móvil) no cuenta.',
    ],
  },
  {
    id: 'toma-prueba-tres-d',
    titulo: 'Toma B1 (prueba del 3D)',
    texto: [
      'La primera grabación real con dos móviles para el 3D: un móvil en cada flanco de la persona, por delante, a unos 90° entre ellos y a unos 3 m. Con ella se comprueba, antes de construir el 3D encima, si el modelo sin marcadores marca el mismo punto del cuerpo visto desde los dos lados (la cadera, por ejemplo, la estima tras la ropa y podría cambiar con el punto de vista).',
      'Lleva unos pasos por la zona (es lo que permite calcular dónde está cada cámara), sentadillas, sentadillas a una pierna y marcha en el sitio. Las medidas con cinta (distancias, alturas de las lentes, estatura) sirven para comparar con lo que calcule la app. Los gomets de delante son opcionales: son el mismo punto para las dos cámaras y separan los errores de la calibración de los del modelo.',
      'Guía por voz: al programar cada grabación en la sala se puede elegir su guion (grabación 1 o 2 de la toma B1). El móvil que la programa dice en voz alta cada gesto a su hora («Quieta», «Ahora, unos pasos por la zona», «Sentadilla… Una, Dos, Tres»…), con la voz del propio móvil y después de los pitidos de sincronía, para no taparlos. La voz queda grabada en el vídeo, lo que ayuda a encontrar cada gesto. Al parar, se calla.',
    ],
  },
  {
    id: 'tres-d',
    titulo: '3D calibrado con la persona',
    texto: [
      'Con dos vídeos de la misma toma desde dos sitios (lo mejor, un móvil en cada flanco por delante de la persona, a unos 90° entre ellos), cada punto del cuerpo visto por los dos se puede situar en el espacio. Para eso hay que saber dónde está un móvil respecto al otro y la focal de cada uno: «Calibrar en 3D» lo calcula con los propios puntos del cuerpo, sin ningún objeto de calibración, y con la vertical del acelerómetro de cada móvil (la app lo guarda al grabar).',
      'Hace falta el cuerpo detectado en las dos vistas y las dos sincronizadas (mejor por el pitido de la grabación doble). Calibra mejor si la persona da unos pasos por la zona al principio: con ella siempre en el mismo sitio, la focal queda mal determinada. Se dice el ángulo entre los dos móviles visto desde la persona, su distancia, la altura de cada uno sobre el suelo y el campo de visión de cada cámara (en un móvil, de unos 60 a 80° sobre el lado largo).',
      'Las dos vistas no ven exactamente el mismo punto: el modelo estima el centro de cada articulación desde lo que ve, y desde un lado la cadera puede caer en otro sitio que desde el otro. El error por punto del cuerpo lo dice, pero solo en parte (ver «Error de reproyección»). Los puntos 3D no se guardan: se recalculan de los puntos de cada vista, así que corregir uno a mano cambia su 3D.',
    ],
  },
  {
    id: 'angulos-tres-d',
    titulo: 'Ángulos en 3D y marco de la pelvis',
    texto: [
      'Con la sesión calibrada en 3D, en «Análisis» salen los ángulos de las dos piernas a la vez en los tres planos. Se miden respecto a la pelvis de cada instante: la vertical es la gravedad, el eje de lado a lado es la línea de las caderas en horizontal y el de delante atrás, hacia donde mira la persona. Los sagitales (flexión de cadera, rodilla y tobillo, inclinación del tronco) y los frontales (valgo-varo de rodilla, abducción-aducción de cadera, oblicuidad de la pelvis, inclinación lateral del tronco) son los mismos que en 2D sin marcadores, con su signo, pero en el plano de la persona y no en el de la imagen: ya no dependen de dónde estuviera cada móvil.',
      'Los transversales: la rotación de la pelvis respecto al principio de la toma (+ hacia la izquierda), la del tronco respecto a la pelvis, la de la cabeza respecto al tronco (la línea de las orejas respecto a la de los hombros, + a la izquierda) y el ángulo de progresión de cada pie (+ con la punta hacia fuera). La de la cabeza vale para giros pequeños, como al andar: al girar mucho, cada oreja queda de cara a un solo móvil y el modelo se inventa la otra; a rango completo, el modo «Cervical» con la cara.',
      'Los brazos y la cabeza: la flexión y la abducción de cada hombro y la cabeza (adelantada y ladeada) van también en las vistas de la pelvis. El codo y la elevación del brazo van «entre segmentos»: el ángulo real entre el brazo y el antebrazo (estirado, 0°) y entre el brazo y el tronco de su lado (colgando, 0°), sin plano: valen hacia donde vaya el brazo. Son siempre positivos (no dicen hacia dónde).',
      'Por qué no hay rotación de cadera ni de rodilla: con dos puntos por segmento (los centros de las articulaciones) no se sabe cuánto gira el muslo o la pierna sobre su eje. Hará falta el esqueleto con articulaciones (fase 7). Tampoco la anteversión de la pelvis (haría falta otro punto de la pelvis).',
      'Con la sesión calibrada, la gráfica central también enseña el ángulo 3D que se mira (con «2D por vista» se vuelve a las medidas de cada vídeo). Con un móvil en cada flanco, los ángulos 2D de cada vista son proyecciones que no coinciden entre sí: la medida es la 3D.',
      'Encima, el monigote: el cuerpo en 3D en el instante del cursor, sobre una rejilla del suelo (cuadros de 50 cm con escala) y con las dos cámaras dibujadas en su sitio como pirámides. Se gira arrastrando con el dedo y se acerca o se aleja pellizcando con dos dedos (o con la rueda del ratón): lo más lejos enseña las dos cámaras y el suelo; lo más cerca, el cuerpo a unas dos veces el alto del recuadro, y entonces la vista sigue a la pelvis para no perderlo al moverse. El botón de la esquina lo devuelve a la vista de partida (la persona entera).',
      'Un punto solo tiene 3D en los frames en que lo ven las dos vistas; si su error de reproyección pasa del 1 % del lado largo de la imagen, tampoco. Las coordenadas se filtran en 3D con el filtro de la sesión, por tramos, sin cruzar huecos.',
    ],
  },
  {
    id: 'colocacion',
    titulo: 'Colocar los móviles',
    texto: [
      'En la sala, cada móvil dice cómo está inclinado su cámara, con su acelerómetro, y se lo cuenta al otro: cuánto mira hacia abajo o hacia arriba (mejor menos de 10°) y cuánto está girada la imagen (mejor menos de 3°). Con la cámara inclinada, la persona se ve deformada por la perspectiva (de perfil, una cámara que mira hacia abajo acorta los segmentos), y para el 3D la calibración parte de la vertical de cada móvil.',
      'Para el 3D, un móvil en cada flanco por delante de la persona, a unos 90° entre ellos, a unos 3 m y a la altura de la cadera, apoyados y quietos durante toda la toma, con la persona entera en las dos imágenes. Al principio de la toma, unos pasos por la zona ayudan a calibrar.',
    ],
  },
  {
    id: 'esqueleto',
    titulo: 'Esqueleto ajustado',
    texto: [
      'Con la sesión calibrada en 3D, «Ajustar el esqueleto» (en los ángulos en 3D, fuente «Esqueleto») coloca en cada frame un esqueleto con articulaciones como las de verdad —la cadera gira en todas las direcciones, la rodilla se dobla como una bisagra, el tobillo en dos ejes y el tronco sobre la pelvis— de forma que lo que vería cada cámara caiga donde el modelo vio los puntos del cuerpo. Las medidas de la persona (muslo, pierna, pie, caderas, tronco) salen de la propia toma.',
      'Lo que la articulación no deja hacer no aparece, y lo que no se ve directamente se deduce de cómo se mueven los segmentos unidos: así sale la rotación de la cadera, que con puntos sueltos no se puede medir. Un punto que ve una sola cámara también cuenta. Los ángulos siguen el sistema de coordenadas articulares (el de la Sociedad Internacional de Biomecánica): primero la flexión, después la abducción y por último la rotación.',
      'Por qué la rotación de la cadera solo con la rodilla doblada: con la pierna recta, girar el muslo sobre sí mismo no mueve ningún punto que se vea (salvo el pie, que también puede girar en el tobillo). Con la rodilla por debajo de 20°, la rotación se sujeta a la de antes y se marca como poco fiable (a trazos en la gráfica, 0 en la columna «fiable» del CSV).',
      'La anteversión de la pelvis no se separa de la flexión del tronco con estos puntos (gira alrededor de la línea de las caderas, que no cambia): queda fija en 0, así que la flexión de la cadera y la del tronco «respecto a la pelvis» son en la práctica respecto a la vertical. Un ángulo cuyos puntos no ve ninguna cámara en un frame no tiene valor (no se inventa). El ajuste se pide con el botón (unos 20–30 ms por frame) y se guarda con la sesión: al reabrirla está sin volver a ajustarlo, salvo que hayan cambiado los puntos 3D de los que salió (un punto corregido, otra sincronía o otra calibración), y entonces se avisa.',
    ],
  },
  {
    id: 'encuadre',
    titulo: 'Comprobar el encuadre',
    texto: [
      'En «Grabar con dos móviles», «Comprobar que se me ve entero» pone a los dos móviles a mirar su vista previa con el detector del cuerpo (unas dos veces por segundo, en el propio móvil: la imagen no sale de él) y a decir si se ve a la persona de la cabeza a los pies, con algo de margen, y sin que la corte un lado de la imagen. Basta con activarlo en uno: el otro también mira y se lo cuenta.',
      'El móvil donde se activa lo dice en voz alta, porque quien se coloca no ve las pantallas: «Se te ve entero en los dos móviles», o qué falta y en cuál («En el otro móvil no se te ven los pies»). Mientras algo falle, lo repite cada 10 segundos; al moverse, lo dice en cuanto cambia. Se para solo al grabar.',
    ],
  },
  {
    id: 'mando',
    titulo: 'Manejar la sala desde un ordenador (mando)',
    texto: [
      'Con los dos móviles colocados y la persona en su sitio, otra persona puede llevarlo todo desde un ordenador: abre la dirección de la sala con «&mando» al final (sale en «Manejarlo desde un ordenador», en la sala de los móviles) o escribe el código en «Grabar con dos móviles» → «Manejar esa sala desde aquí». El mando no cuenta como un tercer móvil: no graba ni mide el reloj.',
      'Ve cada móvil (cómo ve a la persona, la cámara, la batería, el espacio, a cuántos fps grabaría, su inclinación, si ve a la persona entera y la cota del reloj común) y lo que falta para poder grabar. Puede comprobar el encuadre (lo dice en voz alta uno de los móviles), programar la grabación (cuenta atrás y duración) y pararla. Cada orden la ejecuta uno de los móviles como si se pulsara en él, con las mismas comprobaciones de siempre. El «Móvil 1» es el que entró primero en la sala (normalmente el que la creó) y es el que recibe las órdenes; cada móvil dice en su pantalla qué número es en el mando. Si un móvil no puede hacer una orden, el mando dice por qué.',
      'En «Lo último» queda lo que pasa al grabar en cada móvil, con la hora: si empieza, si no graba y por qué (lo cancela alguien, el otro no contesta, falta la cámara o el espacio…), si la grabación se corta y, al terminar, cuánto ha durado, a cuántos fps y si se han oído los pitidos. Lo que hay que revisar sale en ámbar. Solo viajan códigos y números, nunca texto ni nada de la persona.',
      'Por la sala no pasa ningún vídeo ni nada de la persona: solo el estado de cada móvil y las órdenes. Cada vídeo se queda en el móvil que lo graba.',
    ],
  },
  {
    id: 'reproyeccion',
    titulo: 'Error de reproyección',
    texto: [
      'Con las dos cámaras calibradas, cada punto del cuerpo se sitúa en el espacio y se vuelve a proyectar en cada vídeo: la distancia en píxeles entre donde cae y donde lo marcó el modelo es el error de reproyección. Se da la mediana de todos y la de cada punto del cuerpo. Con puntos bien detectados y las vistas bien sincronizadas, unos pocos píxeles; más de un 0,4 % del lado largo de la imagen (unos 8 px en 1080p) es alto: suele ser la sincronía, un móvil que se movió o puntos mal detectados.',
      'Lo que no ve: un error del modelo a lo largo de la línea que une las dos cámaras vista en cada imagen (casi horizontal con los móviles a la misma altura) no cambia la reproyección, solo la profundidad del punto. Por eso un error por punto bajo no garantiza que las dos vistas marquen el mismo sitio: lo dirán las longitudes de los segmentos en 3D, que deben ser constantes.',
    ],
  },
  {
    id: 'escala-estatura',
    titulo: 'Escala por la estatura',
    texto: [
      'La calibración con la persona da las posiciones a escala desconocida (como un plano sin escala). Los ángulos no la necesitan; los metros sí. Se sacan de la estatura: de pie, del tobillo al hombro hay un 77,9 % de la estatura (proporciones de Winter), con un 2 o 3 % de variación entre personas. Si se escribe la distancia entre los móviles medida con cinta, manda ella.',
      'Con la grabación doble, la distancia entre los móviles que mide el pitido de ida y vuelta sirve de comprobación: si no casa con la de la calibración en más de medio metro, se avisa. Es una comprobación gruesa: cada milisegundo de error en la latencia de salida de un móvil son 34 cm de distancia (en la primera toma real, el pitido dio 1,68 m con 1,91 m de cinta). Para medir la distancia, mejor la cinta.',
    ],
  },
  {
    id: 'sin-marcadores',
    titulo: 'Sin marcadores',
    texto: [
      '«Detectar el cuerpo» busca a la persona en cada frame del vídeo con un modelo de visión (MediaPipe Pose, de Google, de uso libre) que corre en el propio móvil: el vídeo no sale de él. La primera vez se carga el modelo (el normal va con la app; el preciso, unos 30 MB, se descarga de Google: solo se descarga, no se envía nada).',
      'De cada frame se guardan 18 puntos: hombros, caderas, rodillas, tobillos, talones y puntas de los pies, y también codos, muñecas y orejas, de los dos lados, con su visibilidad (de 0 a 1: lo seguro que está el modelo de ver el punto). Por debajo de 0,5 un punto no se usa para los ángulos, como un gomet dudoso. De perfil, la pierna y el brazo lejanos quedan detrás y suelen salir con poca visibilidad: se dibujan, tenues, pero no se miden.',
      'Los puntos del modelo son centros articulares aproximados (lo que aprendió de miles de personas anotadas), no referencias óseas como los gomets: por eso un ángulo sin marcadores puede diferir unos grados del de los gomets, sobre todo en la posición de partida. La forma de la curva y el recorrido sí se pueden comparar, y el cero de referencia quita esa diferencia constante.',
      'A veces el modelo confunde una pierna con la otra durante unos frames. Al acabar se corrige: de frente, cada cadera tiene su lado de la imagen; de perfil, un intercambio que se deshace en medio segundo se deshace también aquí, y si no, esas piernas quedan dudosas para que las revises. Un punto mal puesto se corrige tocándolo, y volver a detectar no borra lo corregido a mano.',
    ],
  },
  {
    id: 'comparar-fuentes',
    titulo: 'Gomets frente a sin marcadores',
    texto: [
      'Cuando una vista tiene la misma articulación con gomets y sin marcadores, en «Análisis» se ven las dos curvas filtradas superpuestas (gomets en ámbar, sin marcadores en claro) y lo que se apartan. Mandan los gomets: son los que salen por defecto en la gráfica y en los valores; la fuente se cambia en «Articulación».',
      'No miden exactamente lo mismo: el gomet va sobre una referencia ósea (el trocánter, el epicóndilo, el maléolo) y el modelo da un centro articular aproximado. Por eso se espera una diferencia más o menos constante (en una sentadilla de perfil, unos 7° en la rodilla), sobre todo en la posición de partida.',
      '«A pelo» compara las dos tal cual: la diferencia media es esa diferencia constante, y lo que queda al quitarla (la desviación típica y el error cuadrático medio sin la diferencia media) es lo que de verdad no coincide. El recorrido y la correlación dicen si la forma de la curva es la misma.',
      '«Relativo al cero» resta a cada una su propio cero de referencia en el mismo tramo quieto: quita la diferencia constante y deja comparar el movimiento. «Copiar el informe» da todo esto en texto, sin el nombre del archivo.',
    ],
  },
  {
    id: 'inclinacion-tronco',
    titulo: 'Inclinación del tronco',
    texto: [
      'Sin marcadores, de perfil: el ángulo de la línea cadera → hombro (los de la pierna que ve la cámara) respecto a la vertical de la imagen. De pie y erguido, 0°; inclinado hacia delante, positivo; hacia atrás, negativo.',
      'De frente: la línea del punto medio de las caderas al punto medio de los hombros respecto a la vertical; inclinado hacia la izquierda de la persona, positivo; hacia la derecha, negativo (igual con la cámara delante o detrás).',
      'Es un ángulo absoluto, no entre dos segmentos: depende de que el móvil esté vertical (si está inclinado, todo sale desplazado lo que esté inclinado). El cero de referencia en una toma de pie quita ese desplazamiento.',
    ],
  },
  {
    id: 'pelvis-cadera-frente',
    titulo: 'Pelvis y cadera de frente',
    texto: [
      'Sin marcadores, en la vista de frente se miden las dos piernas a la vez: el FPPA de cada rodilla (ver «FPPA de la rodilla»), la cadera de cada lado, la pelvis y el tronco.',
      'Pelvis (oblicuidad): la línea que une las dos caderas respecto a la horizontal. Con la cadera izquierda más alta, positivo; con la derecha más alta, negativo. En un apoyo sobre una pierna, la pelvis que cae del lado contrario (signo de Trendelenburg) se ve aquí.',
      'Cadera (abducción-aducción respecto a la pelvis): el muslo (cadera → rodilla) respecto a la línea de las caderas. Con el muslo perpendicular a esa línea, 0°; la rodilla hacia fuera (abducción), positivo; hacia dentro (aducción), negativo, igual en las dos piernas. Va respecto a la pelvis, no al tronco: si la pelvis se inclina, el muslo puede no moverse respecto a la vertical y la cadera sí cambia.',
      'Todo depende de que la cámara esté de frente a la persona, perpendicular y a la altura de la cadera: si la persona gira, una flexión se ve como abducción o como valgo. Por eso se mira junto con la vista de perfil.',
    ],
  },
  {
    id: 'brazos-cabeza',
    titulo: 'Hombro, codo y cabeza sin marcadores',
    texto: [
      'De perfil (el brazo que ve la cámara): el hombro es el brazo (hombro → codo) respecto al tronco (hombro → cadera): colgando, 0°; hacia delante (flexión), positivo; hacia atrás (extensión), negativo. El codo, el antebrazo (codo → muñeca) respecto al brazo: estirado, 0°; doblado (flexión), positivo. Son los mismos ángulos que con gomets en el acromion, el epicóndilo y la estiloides.',
      'Cabeza de perfil: la línea del hombro a la oreja respecto a la vertical. Con la oreja por delante del hombro (cabeza adelantada), positivo; por detrás, negativo. Se parece al ángulo craneovertebral de la consulta, pero con el hombro del modelo en lugar de C7: se mira relativo al cero de una postura erguida, no a pelo.',
      'De frente: el hombro de cada lado es el brazo respecto al tronco de ese lado (hombro → cadera): colgando, 0°; separado del cuerpo (abducción), positivo, igual en los dos brazos. La cabeza, la línea de las orejas respecto a la horizontal: inclinada hacia la izquierda de la persona, positivo; hacia la derecha, negativo. El codo de frente no se mide.',
      'El hombro es la articulación que más sale del plano de la cámara: de perfil, la flexión solo vale si el brazo se mueve hacia delante (una abducción se ve como una flexión pequeña); de frente, la abducción solo si el brazo va de lado. El codo de perfil se acorta si el brazo está girado. Con dos móviles, en 3D, no pasa.',
    ],
  },
  {
    id: 'marcha',
    titulo: 'Marcha: ciclos y parámetros',
    texto: [
      'Para una toma andando de perfil (por el suelo o en cinta). «Buscar los ciclos» encuentra los eventos del pie que ve la cámara: el contacto inicial, cuando el talón está lo más adelantado respecto a la cadera, y el despegue, cuando la punta del pie está lo más atrasada (el método de Zeni, que vale igual en cinta). Salen de las coordenadas filtradas, nunca a través de un hueco.',
      'Un ciclo (una zancada) va de un contacto al siguiente del mismo pie, con un despegue en medio. Se descartan los que cruzan un hueco, los que no tienen un despegue en medio y los que duran un 25 % más o menos que lo habitual de la toma (un tropiezo, un giro, un evento perdido). Cada ciclo se estira o encoge a 0–100 % y se dibuja la media ± la desviación típica de la articulación que se mira, con los ciclos sueltos detrás y la línea del despegue medio. Un ciclo se puede quitar de la media con su casilla.',
      'Parámetros: el tiempo de zancada, la cadencia (pasos por minuto: dos pasos por zancada), el apoyo (% del ciclo con el pie en el suelo, unos 60 % andando) y, con la escala y andando por el suelo, la longitud de zancada y la velocidad. En cinta no salen de la imagen (el suelo se mueve): la app lo nota porque la cadera apenas avanza, y se puede cambiar a mano.',
      'Un evento mal puesto se corrige en «Eventos»: «Mover aquí» lo lleva al frame que se ve, «Quitar» lo borra y «Añadir… aquí» pone uno nuevo. Lo corregido a mano se guarda y manda sobre lo que se detecta.',
      'Con dos móviles calibrados en 3D, «Marcha en 3D» (en «Ángulos en 3D») hace lo mismo con los dos pies a la vez: «adelante» es hacia donde mira la persona en cada instante, así que no hace falta que ande justo de perfil. Además de lo de siempre da el paso (del contacto de un pie al del otro), el doble apoyo (el % del ciclo con los dos pies en el suelo, unos 20 % andando), la anchura del paso (la separación de lado a lado de los talones, con escala) y la longitud de zancada de cada pie. La curva es la del ángulo 3D que se mira (de los puntos o del esqueleto), en los ciclos del pie de su lado.',
    ],
  },
  {
    id: 'cervical',
    titulo: 'Cervical: orientación de la cabeza',
    texto: [
      '«Detectar la cara» pasa el vídeo por un modelo de la cara (Face Landmarker, de MediaPipe, el mismo de orbicula) que corre en el propio móvil y da, en cada frame, cómo está girada la cabeza respecto a la cámara con la cara entera (no con dos puntos). De ahí salen la rotación (+ a la izquierda), la flexo-extensión (+ flexión) y la inclinación lateral (+ a la izquierda), en ese orden.',
      'Se miden respecto al neutro: la posición de la cabeza en un tramo quieto mirando al frente (al acabar, los primeros 2 s; se cambia con «Aquí ± 0,2 s»). Sin neutro no hay ángulos: respecto a la cámara no son clínicos.',
      'Es la cabeza respecto a la cámara, no respecto al tronco: la persona tiene que estar sentada con la espalda apoyada, para que el tronco no gire. Toma de cerca: la cabeza y los hombros en el encuadre, el móvil delante, a la altura de la cara (a 3–4 m, en una toma de cuerpo entero, la cara es demasiado pequeña).',
      'Con un móvil, la cara se pierde cuando gira más de unos 70° respecto a la cámara (sale de perfil): esos frames quedan sin valor, nunca se inventan, y el rango de ese lado sale corto (se ve en la asimetría). Por eso el móvil va de frente. Rango: lo más lejos a cada lado en la toma; asimetría = (+ − −) / (+ + −). Pendiente de validar frente a un goniómetro o un inclinómetro.',
    ],
  },
  {
    id: 'piernas-intercambiadas',
    titulo: 'Piernas intercambiadas',
    texto: [
      'El modelo sin marcadores a veces confunde la pierna izquierda con la derecha durante unos frames, sobre todo de perfil, cuando una queda detrás de la otra. Al acabar de detectar, la app lo corrige.',
      'De perfil: si las dos piernas saltan a la vez a donde estaba la otra y vuelven en medio segundo como mucho, esos frames se intercambian de vuelta. Si no vuelven (o tardan más), no se sabe cuál es cada una: esos puntos quedan dudosos (se ven tenues y no se usan para los ángulos) para que los revises y, si hace falta, los corrijas a mano.',
      'De frente: cada cadera tiene su lado de la imagen según la cámara esté delante o detrás, así que se ponen siempre en su sitio.',
    ],
  },
  {
    id: 'datos',
    titulo: 'Dónde se guardan los datos',
    texto: [
      'Todo se procesa en este dispositivo, en el navegador: los vídeos y los datos nunca salen de él. Un vídeo que se abre no se guarda nunca (los grabados con la app quedan en su almacenamiento hasta que los borres: ver «Grabar con este móvil»); lo que se guarda (marcado, seguimiento, ajustes, escala, desfase) queda en este navegador y se actualiza solo. Al grabar con dos móviles, por internet solo viajan mensajes de control y marcas de tiempo (ver «Grabar con dos móviles»).',
      'Para continuar una sesión hay que volver a abrir el mismo vídeo (el navegador no puede reabrirlo solo); con dos vistas, los dos. Se reconocen por su tamaño, duración y número de frames, no por el nombre.',
      'Barrera de red: la librería de detección del cuerpo y de la cara (MediaPipe, de Google) intenta mandar un registro de uso a un servidor de Google (no son imágenes ni datos de la persona, sino de la librería). La app lo bloquea de dos maneras: en el propio código de la detección y con la política de seguridad de la página, que solo deja conectar con este sitio, con el relé de los dos móviles y con la descarga del modelo preciso. Lo único que se descarga de fuera son el modelo preciso, si se elige, y los tipos de letra.',
    ],
  },
]

export const entradaPorId = (id: string): EntradaGlosario | undefined => ENTRADAS.find((e) => e.id === id)
