import { FOV_PREVIO_GRADOS } from '../tresd/camara'
import { VISIBLE, type PuntoNorm } from './encuadre'

/*
 * La altura de la cámara sobre el suelo por el horizonte (fase 6, asistente de colocación; D9 de docs/plan-fase-6.md).
 *
 * Con la persona de pie, el horizonte de la cámara (el plano horizontal que pasa por la lente) corta su cuerpo justo a la
 * altura de la cámara. Su inclinación sale del acelerómetro (`cabeceo`) y la altura de dos puntos del cuerpo, de la
 * estatura con las proporciones de Drillis y Contini (Winter, *Biomechanics and motor control of human movement*, 2009,
 * fig. 4.1): los ojos a FRACCION_OJOS y los tobillos (el maléolo) a FRACCION_TOBILLOS de la estatura. Con el ángulo de cada
 * uno respecto a la horizontal (α, + hacia arriba), su altura z y la distancia d de la cámara a la persona:
 *
 *   tan α = (z − h) / d     →     d = (z_ojos − z_tobillos) / (tan α_ojos − tan α_tobillos),   h = z_ojos − d · tan α_ojos
 *
 * Exacto para una persona de pie y derecha. La focal no se conoce (la de un móvil típico, FOV_PREVIO_GRADOS): con la cámara
 * horizontal no influye en h (solo en d), y con la inclinación que admite el asistente (10°), poco: 4 cm con el campo de visión 10° equivocado (lo fija el test).
 * También da la distancia de la cámara a la persona.
 */

/** Altura de los ojos y de los tobillos, en fracción de la estatura (Drillis y Contini). */
export const FRACCION_OJOS = 0.936
export const FRACCION_TOBILLOS = 0.039
/** Lo que se da por creíble: la cámara entre el suelo y 2,5 m, y la persona entre 0,5 y 10 m. */
const ALTURA_MAX_M = 2.5
const DISTANCIA_MIN_M = 0.5
const DISTANCIA_MAX_M = 10
/** Altura recomendada de la lente para el 3D y la marcha (m): más o menos la de la cadera. */
export const ALTURA_RECOMENDADA = { min: 0.7, max: 1.3 } as const

const OJOS = [2, 5]
const TOBILLOS = [27, 28]

export interface AlturaCamara {
  /** Altura de la lente sobre el suelo (m). */
  readonly altura: number
  /** Distancia horizontal de la cámara a la persona (m). */
  readonly distancia: number
}

const vistos = (p: readonly PuntoNorm[], idx: readonly number[]) =>
  idx.map((i) => p[i]).filter((q): q is PuntoNorm => !!q && (q.visibility ?? 0) >= VISIBLE && Number.isFinite(q.y))

/**
 * La altura de la cámara con los puntos de MediaPipe de un frame (normalizados a la imagen), la imagen (`ancho` × `alto`
 * en px), su cabeceo (°, + mirando hacia abajo, `core/grabacion/colocacion.ts`) y la estatura (m). null si no se ven los
 * ojos y los tobillos, o si sale algo imposible.
 */
export function alturaCamara(puntos: readonly PuntoNorm[] | null, ancho: number, alto: number, cabeceo: number, estatura: number, fovGrados = FOV_PREVIO_GRADOS): AlturaCamara | null {
  if (!puntos || puntos.length < 33 || !(ancho > 0 && alto > 0) || !(estatura > 0) || !Number.isFinite(cabeceo)) return null
  const ojos = vistos(puntos, OJOS)
  const tobillos = vistos(puntos, TOBILLOS)
  if (!ojos.length || !tobillos.length) return null
  const media = (q: PuntoNorm[]) => q.reduce((s, p) => s + p.y, 0) / q.length
  // La focal en altos de imagen (la del lado mayor de un móvil típico).
  const f = Math.max(ancho, alto) / 2 / Math.tan((fovGrados * Math.PI) / 360) / alto
  const th = (cabeceo * Math.PI) / 180
  // Ángulo de un punto respecto a la horizontal: el rayo baja atan((y − ½)/f) respecto al eje, que baja θ.
  const tanAlfa = (y: number) => Math.tan(-(th + Math.atan((y - 0.5) / f)))
  const zO = FRACCION_OJOS * estatura
  const zT = FRACCION_TOBILLOS * estatura
  const tO = tanAlfa(media(ojos))
  const tT = tanAlfa(media(tobillos))
  if (!(tO > tT)) return null
  const distancia = (zO - zT) / (tO - tT)
  const altura = zO - distancia * tO
  if (!(distancia >= DISTANCIA_MIN_M && distancia <= DISTANCIA_MAX_M && altura >= 0 && altura <= ALTURA_MAX_M)) return null
  return { altura, distancia }
}

/** La mediana de varias (de frames seguidos): un frame mal detectado no la mueve. null si no hay ninguna. */
export function medianaAltura(xs: readonly (AlturaCamara | null)[]): AlturaCamara | null {
  const v = xs.filter((x): x is AlturaCamara => !!x)
  if (!v.length) return null
  const med = (a: number[]) => {
    const o = [...a].sort((p, q) => p - q)
    return o.length % 2 ? o[(o.length - 1) / 2]! : (o[o.length / 2 - 1]! + o[o.length / 2]!) / 2
  }
  return { altura: med(v.map((x) => x.altura)), distancia: med(v.map((x) => x.distancia)) }
}

/** Qué hacer si la cámara no está a la altura recomendada (null si está bien). */
export function consejoAltura(altura: number): string | null {
  if (altura < ALTURA_RECOMENDADA.min) return `Sube el móvil: la lente está a ${Math.round(altura * 100)} cm del suelo y conviene que esté a 0,7–1,3 m (más o menos a la altura de la cadera).`
  if (altura > ALTURA_RECOMENDADA.max) return `Baja el móvil: la lente está a ${Math.round(altura * 100)} cm del suelo y conviene que esté a 0,7–1,3 m (más o menos a la altura de la cadera).`
  return null
}

/** Ángulo entre los móviles recomendado para el 3D (°, visto desde la persona). */
export const ANGULO_RECOMENDADO = { min: 60, max: 110 } as const

/**
 * El ángulo entre los dos móviles visto desde la persona (°), por el teorema del coseno: la distancia de cada cámara a la
 * persona (por el horizonte, `alturaCamara`) y la distancia entre los dos (por el pitido, `distancia.ts`). null si los tres
 * lados no forman un triángulo (alguno mal medido).
 */
export function anguloEntreMoviles(distanciaA: number, distanciaB: number, entreMoviles: number): number | null {
  const [a, b, c] = [distanciaA, distanciaB, entreMoviles]
  if (!(a > 0 && b > 0 && c > 0) || c > a + b || a > b + c || b > a + c) return null
  return (Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)))) * 180) / Math.PI
}

/** Qué hacer si el ángulo entre los móviles no es el recomendado para el 3D (null si está bien). */
export function consejoAngulo(grados: number): string | null {
  if (grados < ANGULO_RECOMENDADO.min) return `Separa más los móviles: se ven a ${Math.round(grados)}° desde la persona y para el 3D conviene que estén a 60–110°.`
  if (grados > ANGULO_RECOMENDADO.max) return `Junta un poco los móviles: se ven a ${Math.round(grados)}° desde la persona y para el 3D conviene que estén a 60–110° (los dos por delante).`
  return null
}
