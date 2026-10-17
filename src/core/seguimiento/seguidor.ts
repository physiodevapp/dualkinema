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

export interface Resultado {
  /** Posición en px del frame, o NaN si se ha perdido (nunca se inventa). */
  readonly x: number
  readonly y: number
  /** 0–1. Por debajo de CALIDAD_PERDIDO se considera perdido. */
  readonly calidad: number
  readonly estado: EstadoMarcador
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

export class ErrorMarcado extends Error {}

/** Radio aproximado del gomet, en px, a partir de su área. */
export const radioDe = (area: number) => Math.sqrt(area / Math.PI)

/**
 * Aprende un gomet a partir de un toque en (x, y) en el instante t.
 *
 * 1. Toma el color de los píxeles bajo el dedo (3 × 3) con una tolerancia amplia.
 * 2. Busca la mancha que contiene el toque (o la más cercana a pocos px).
 * 3. Aprende el color real con todos sus píxeles, vuelve a segmentar y devuelve
 *    el centro de la mancha: el marcador queda en el centro del gomet aunque el
 *    toque no fuera exacto.
 */
export function aprenderMarcador(
  leer: LeerVentana,
  ancho: number,
  alto: number,
  t: number,
  x: number,
  y: number,
  radioBusqueda = Math.max(24, Math.round(Math.min(ancho, alto) * 0.04)),
): Resultado {
  const semilla = leer(ventanaAlrededor(x, y, 1.5, ancho, alto))
  const colores: Hsv[] = []
  for (let k = 0; k < semilla.datos.length; k += 4) {
    colores.push(rgbAHsv(semilla.datos[k]!, semilla.datos[k + 1]!, semilla.datos[k + 2]!))
  }
  const media = aprenderColor(colores)
  if (media.s < 0.2) throw new ErrorMarcado('Ahí no hay un color definido: toca justo encima del gomet.')
  const tolerante: ModeloColor = { ...media, dh: Math.max(media.dh, 18), ds: Math.max(media.ds, 0.18), dv: Math.max(media.dv, 0.3) }

  const img = leer(ventanaAlrededor(x, y, radioBusqueda, ancho, alto))
  const cerca = (ms: readonly Mancha[]) =>
    ms
      .map((m) => ({ m, d: Math.hypot(m.x - x, m.y - y) }))
      .filter(({ m, d }) => d <= radioDe(m.area) + 4)
      .sort((a, b) => a.d - b.d)[0]?.m
  const primera = cerca(buscarManchas(img, tolerante))
  if (!primera) throw new ErrorMarcado('No encuentro un gomet aquí: toca justo encima.')

  const modelo = aprenderColor(primera.colores)
  const refinada = cerca(buscarManchas(img, modelo)) ?? primera
  if (refinada.area > (Math.PI * radioBusqueda * radioBusqueda) / 2) {
    throw new ErrorMarcado('La zona de ese color es demasiado grande para ser un gomet (¿ropa o fondo del mismo color?).')
  }
  return {
    x: refinada.x,
    y: refinada.y,
    calidad: 1,
    estado: { modelo: aprenderColor(refinada.colores), area: refinada.area, ultimas: [{ t, x: refinada.x, y: refinada.y }], perdidos: 0 },
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

  const perdido = (): Resultado => ({ x: NaN, y: NaN, calidad: 0, estado: { ...e, perdidos: e.perdidos + 1 } })

  const candidatas = buscarManchas(leer(ventanaAlrededor(p.x, p.y, radio, ancho, alto)), e.modelo).filter(
    (m) => m.area >= e.area * AREA_MIN && m.area <= e.area * AREA_MAX,
  )
  if (candidatas.length === 0) return perdido()

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
  if (calidad < CALIDAD_PERDIDO) return perdido()

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
