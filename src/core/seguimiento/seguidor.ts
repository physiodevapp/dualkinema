import { aprenderColor, mezclarColor, rgbAHsv, type Hsv, type ModeloColor } from './color'
import { ventanaAlrededor, type LeerVentana } from './imagen'
import { buscarManchas, UMBRAL_COLOR, type Mancha } from './manchas'

/** Estado del seguimiento de un marcador entre frames. */
export interface EstadoMarcador {
  readonly modelo: ModeloColor
  /** Área de referencia del gomet, en px². */
  readonly area: number
  /** Últimas posiciones buenas (como mucho 2), para predecir. */
  readonly ultimas: readonly { t: number; x: number; y: number }[]
  /** Frames seguidos sin encontrarlo. */
  readonly perdidos: number
}

/**
 * Por qué no se encontró un marcador en un frame (para diagnosticar con vídeos
 * reales sin tener que verlos):
 * - sinColor: ningún píxel de su color en la zona de búsqueda.
 * - tamano: manchas de su color, pero de tamaño muy distinto al del gomet
 *   (`area` = relación entre la más parecida y la del gomet).
 * - calidad: la mejor candidata queda lejos de lo esperado o es ambigua.
 * - conflicto: comparte mancha con otro marcador.
 */
export type MotivoPerdido = 'sinColor' | 'tamano' | 'calidad' | 'conflicto'

export interface Resultado {
  /** Posición en px del frame, o NaN si se ha perdido (nunca se inventa). */
  readonly x: number
  readonly y: number
  /** 0–1. Por debajo de CALIDAD_PERDIDO se considera perdido. */
  readonly calidad: number
  readonly estado: EstadoMarcador
  readonly motivo?: MotivoPerdido
  /** Con motivo 'tamano': área de la mancha más parecida / área del gomet. */
  readonly relacionArea?: number
}

export const CALIDAD_PERDIDO = 0.3

/**
 * Tamaño aceptado de una mancha respecto al gomet. Por abajo, tolera que se
 * tape en parte; por arriba es estricto, para no aceptar la mancha que forman
 * dos gomets del mismo color al juntarse (≈ 2×).
 */
export const AREA_MIN = 0.25
export const AREA_MAX = 1.8
/** Segundos que se extrapola la velocidad de un gomet perdido. */
export const EXTRAPOLACION_MAX = 0.3

export class ErrorMarcado extends Error {
  /** Datos técnicos para diagnosticar (se muestran en pequeño). */
  constructor(
    mensaje: string,
    readonly detalle?: string,
  ) {
    super(mensaje)
  }
}

/** Radio aproximado del gomet, en px, a partir de su área. */
export const radioDe = (area: number) => Math.sqrt(area / Math.PI)

/**
 * ¿Parece un gomet? Redondo o cuadrado en cualquier giro (alargamiento ≤ 2,5,
 * que admite verlo algo de canto), macizo (relleno ≥ 0,75: un círculo o un
 * cuadrado dan ≈ 1) y sin tocar el borde de la zona de búsqueda (si lo toca,
 * se ha «escapado» por la piel, la ropa o el fondo).
 */
function pareceGomet(m: Mancha, anchoImg: number, altoImg: number): boolean {
  const [x0, y0, x1, y1] = m.caja
  const tocaBorde = x0 === 0 || y0 === 0 || x1 === anchoImg - 1 || y1 === altoImg - 1
  return !tocaBorde && m.alargamiento <= 2.5 && m.relleno >= 0.75
}

/** Tolerancias que se prueban al aprender un gomet, de estricta a amplia. */
const ESCALAS = [1, 1.5, 2, 3, 4] as const

/**
 * Aprende un gomet a partir de un toque en (x, y) en el instante t.
 *
 * 1. Toma como color de partida el de los píxeles más saturados cerca del toque.
 * 2. Prueba tolerancias de color de menor a mayor y se queda con la mayor que
 *    aún da una mancha con forma de gomet alrededor del toque. Con una
 *    tolerancia fija, un gomet rojo sobre piel se «escapaba» por la piel.
 * 3. Aprende el color real con los píxeles de esa mancha y devuelve su centro:
 *    el marcador queda en el centro del gomet aunque el toque no fuera exacto.
 *
 * `radioSemilla`: hasta qué distancia del toque se busca el gomet (px del
 * vídeo). Por defecto ≈ 1,2 % del lado menor, pensado para posiciones ya
 * precisas (anclas, inicio del seguimiento). Al tocar con el dedo, el visor
 * pasa uno mayor, en proporción a lo que se ve en la lupa: en un vídeo 1080
 * en un móvil, el de por defecto eran 3–4 px de pantalla.
 */
export function aprenderMarcador(
  leer: LeerVentana,
  ancho: number,
  alto: number,
  t: number,
  x: number,
  y: number,
  opciones: { readonly radioSemilla?: number; readonly radioBusqueda?: number } = {},
): Resultado {
  // Color de partida: los píxeles más saturados cerca del toque. Un gomet es
  // lo más saturado de su entorno; así un toque en el borde (donde el color se
  // mezcla con la piel, sobre todo con la compresión de vídeo del móvil, que
  // guarda el color a media resolución) no da un color de partida a medias.
  const radioSemilla = Math.max(4, Math.round(opciones.radioSemilla ?? Math.min(ancho, alto) * 0.012))
  // La zona de búsqueda abarca la de la semilla y un gomet entero más allá.
  const radioBusqueda = Math.max(opciones.radioBusqueda ?? Math.max(24, Math.round(Math.min(ancho, alto) * 0.04)), radioSemilla * 2)
  const zona = leer(ventanaAlrededor(x, y, radioSemilla, ancho, alto))
  const candidatos: Hsv[] = []
  for (let k = 0; k < zona.datos.length; k += 4) {
    const px = zona.x0 + ((k / 4) % zona.ancho) + 0.5
    const py = zona.y0 + Math.floor(k / 4 / zona.ancho) + 0.5
    if (Math.hypot(px - x, py - y) > radioSemilla) continue
    candidatos.push(rgbAHsv(zona.datos[k]!, zona.datos[k + 1]!, zona.datos[k + 2]!))
  }
  // Saturación, sin fiarse de la de los píxeles muy oscuros (ruido).
  const viveza = (c: Hsv) => c.s * Math.min(1, c.v / 0.25)
  candidatos.sort((a, b) => viveza(b) - viveza(a))
  const base = aprenderColor(candidatos.slice(0, 9))
  if (base.s < 0.2) {
    throw new ErrorMarcado(
      'Ahí no hay un color definido: toca justo encima del gomet.',
      `saturación máxima cerca del toque: ${base.s.toFixed(2).replace('.', ',')}`,
    )
  }

  const img = leer(ventanaAlrededor(x, y, radioBusqueda, ancho, alto))
  const cerca = (ms: readonly Mancha[]) =>
    ms
      .map((m) => ({ m, d: Math.hypot(m.x - x, m.y - y) }))
      .filter(({ m, d }) => d <= radioDe(m.area) + radioSemilla)
      .sort((a, b) => a.d - b.d)[0]?.m

  let elegida: Mancha | undefined
  let seEscapa: Mancha | undefined
  for (const k of ESCALAS) {
    const modelo: ModeloColor = { ...base, dh: base.dh * k, ds: base.ds * k, dv: base.dv * k }
    const m = cerca(buscarManchas(img, modelo))
    if (!m) continue
    if (!pareceGomet(m, img.ancho, img.alto)) {
      seEscapa = m
      break
    }
    elegida = m
  }
  const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',')
  const detalle =
    `color bajo el dedo: tono ${Math.round(base.h)}°, saturación ${fmt(base.s)}, brillo ${fmt(base.v)}` +
    (seEscapa
      ? `; mancha de ${seEscapa.area} px, alargamiento ${fmt(seEscapa.alargamiento, 1)}, relleno ${fmt(seEscapa.relleno)}` +
        ` en una zona de ${img.ancho}×${img.alto}`
      : '')
  if (!elegida) {
    throw new ErrorMarcado(
      seEscapa
        ? 'Aquí no veo un gomet suelto: o el toque ha caído fuera, o su color se confunde con lo que lo rodea (piel, ropa o fondo). Toca justo encima; si se repite, prueba gomets de otro color (verde o azul suelen ir mejor).'
        : 'No encuentro un gomet aquí: toca justo encima.',
      detalle,
    )
  }

  // Segmentación final con el color aprendido del propio gomet.
  const modelo = aprenderColor(elegida.colores)
  const refinada = cerca(buscarManchas(img, modelo))
  const final = refinada && pareceGomet(refinada, img.ancho, img.alto) ? refinada : elegida
  return {
    x: final.x,
    y: final.y,
    calidad: 1,
    estado: { modelo: aprenderColor(final.colores), area: final.area, ultimas: [{ t, x: final.x, y: final.y }], perdidos: 0 },
  }
}

/** Posición prevista en t a velocidad constante (en tiempo, no en frames: fps variable). */
export function predecir(e: EstadoMarcador, t: number): { x: number; y: number; vx: number; vy: number } {
  const [a, b] = e.ultimas.length >= 2 ? [e.ultimas[e.ultimas.length - 2]!, e.ultimas[e.ultimas.length - 1]!] : [undefined, e.ultimas[0]!]
  if (!a || b.t === a.t) return { x: b.x, y: b.y, vx: 0, vy: 0 }
  const vx = (b.x - a.x) / (b.t - a.t)
  const vy = (b.y - a.y) / (b.t - a.t)
  return { x: b.x + vx * (t - b.t), y: b.y + vy * (t - b.t), vx, vy }
}

/**
 * Busca el marcador en el frame del instante t.
 *
 * Ventana alrededor de la posición prevista, con tamaño según el gomet y la
 * velocidad (y más grande tras frames perdidos). Entre las manchas de tamaño
 * plausible elige la que mejor combina cercanía a la predicción, área y color.
 * La calidad baja si la mancha se aleja de lo esperado o si hay otra candidata
 * casi igual de buena (ambigüedad).
 */
export function seguir(e: EstadoMarcador, leer: LeerVentana, ancho: number, alto: number, t: number): Resultado {
  const ultima = e.ultimas[e.ultimas.length - 1]!
  // Perdido: se extrapola la velocidad como mucho EXTRAPOLACION_MAX segundos
  // (más allá la predicción se alejaría del gomet) y la ventana crece con cada
  // frame sin encontrarlo. Mantener la velocidad evita que, tras taparse o
  // cruzarse dos gomets del mismo color, cada uno se recupere en el otro.
  const dt = Math.abs(t - ultima.t)
  const p = predecir(e, e.perdidos > 0 ? ultima.t + Math.min(dt, EXTRAPOLACION_MAX) : t)
  const r = radioDe(e.area)
  const desplazamiento = Math.hypot(p.vx, p.vy) * dt
  const radio = Math.min((3 * r + 1.5 * desplazamiento + 8) * (1 + e.perdidos), Math.min(ancho, alto) * 0.25)

  const perdido = (motivo: MotivoPerdido, relacionArea?: number): Resultado => ({
    x: NaN,
    y: NaN,
    calidad: 0,
    estado: { ...e, perdidos: e.perdidos + 1 },
    motivo,
    relacionArea,
  })

  const todas = buscarManchas(leer(ventanaAlrededor(p.x, p.y, radio, ancho, alto)), e.modelo)
  if (todas.length === 0) return perdido('sinColor')
  const candidatas = todas.filter((m) => m.area >= e.area * AREA_MIN && m.area <= e.area * AREA_MAX)
  if (candidatas.length === 0) {
    // La de tamaño más parecido, en escala logarítmica.
    const rel = todas.map((m) => m.area / e.area).sort((a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)))[0]!
    return perdido('tamano', rel)
  }

  const puntuadas = candidatas
    .map((m) => {
      const dist = Math.hypot(m.x - p.x, m.y - p.y)
      const coste = dist / radio + 0.5 * Math.abs(Math.log(m.area / e.area)) + 0.3 * (m.distanciaMedia / UMBRAL_COLOR)
      return { m, dist, coste }
    })
    .sort((a, b) => a.coste - b.coste)
  const { m, dist } = puntuadas[0]!

  const tolerancia = r + 0.5 * desplazamiento + 4
  const qDist = Math.exp(-0.5 * (dist / (2 * tolerancia)) ** 2)
  const qArea = Math.sqrt(Math.min(m.area, e.area) / Math.max(m.area, e.area))
  const qColor = Math.max(0, 1 - m.distanciaMedia / UMBRAL_COLOR)
  let calidad = Math.cbrt(qDist * qArea * qColor)
  const segunda = puntuadas[1]
  if (segunda && segunda.coste - puntuadas[0]!.coste < 0.15) calidad *= 0.6
  if (calidad < CALIDAD_PERDIDO) return perdido('calidad')

  // Adaptación lenta a cambios de luz y de tamaño aparente, solo con buenas detecciones.
  const adaptar = calidad > 0.7
  return {
    x: m.x,
    y: m.y,
    calidad,
    estado: {
      modelo: adaptar ? mezclarColor(e.modelo, aprenderColor(m.colores), 0.1) : e.modelo,
      area: adaptar ? 0.8 * e.area + 0.2 * m.area : e.area,
      ultimas: [...e.ultimas, { t, x: m.x, y: m.y }].slice(-2),
      perdidos: 0,
    },
  }
}
