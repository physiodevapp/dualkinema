/*
 * Metros para el 3D calibrado (fase 6, D5 de docs/plan-fase-6.md). Los ángulos no necesitan escala; lo que va en metros
 * (velocidades, alturas, distancias) sale de la estatura: de pie, la distancia vertical entre el tobillo y el hombro es
 * (0,818 − 0,039)·H = 0,779·H (proporciones de Winter), con un 2–3 % de variación entre personas. La distancia entre los
 * móviles por el pitido (fase 4) o medida con cinta sirve de comprobación (o manda, si se escribe).
 */
import type { Vec3 } from '../geometria/vector'
import { PROPORCIONES } from './sintetico'

/** Fracción de la estatura entre el tobillo y el hombro, de pie. */
export const TOBILLO_HOMBRO = PROPORCIONES.hombro - PROPORCIONES.tobillo

/** Diferencia relativa a partir de la cual la distancia entre los móviles no casa con la escala (aviso). */
export const DISCREPANCIA_DISTANCIA = 0.1

/**
 * Metros por unidad del mundo calibrado a partir de la estatura (m) y, por instante, el hombro y el tobillo de cada lado
 * (en el mundo calibrado, z hacia arriba). Se usa el percentil 90 de la altura tobillo → hombro (de pie y erguido es
 * cuando es máxima; las sentadillas la acortan). null sin bastantes instantes (10).
 */
export function escalaPorEstatura(estatura: number, pares: readonly { readonly hombro: Vec3; readonly tobillo: Vec3 }[]): number | null {
  const alturas = pares.map((p) => p.hombro.z - p.tobillo.z).filter((h) => Number.isFinite(h) && h > 0)
  if (alturas.length < 10 || !(estatura > 0)) return null
  const s = [...alturas].sort((a, b) => a - b)
  const p90 = s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]!
  return (TOBILLO_HOMBRO * estatura) / p90
}

/** Si la distancia entre los móviles de la calibración (m) casa con la medida (pitido o cinta): diferencia relativa y aviso. */
export function compararDistancia(calibrada: number, medida: number): { readonly diferencia: number; readonly casa: boolean } {
  const diferencia = (calibrada - medida) / medida
  return { diferencia, casa: Math.abs(diferencia) <= DISCREPANCIA_DISTANCIA }
}

/**
 * La altura del suelo en el mundo calibrado (z hacia arriba): el percentil 5 de la altura de talones y puntas (apoyados
 * en el suelo buena parte de la toma; el 5 % quita los mal detectados por debajo). Con ella, la altura de cada cámara es
 * la z de su centro menos esta. NaN sin puntos de los pies.
 */
export function alturaSuelo(pies: readonly Vec3[]): number {
  const z = pies.map((p) => p.z).filter(Number.isFinite).sort((a, b) => a - b)
  return z.length ? z[Math.floor(0.05 * (z.length - 1))]! : NaN
}

/** La estatura escrita (en cm, o en m) en metros; null si no es razonable (de 1 a 2,5 m). */
export function estaturaEnMetros(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null
  const m = n > 3 ? n / 100 : n
  return m >= 1 && m <= 2.5 ? m : null
}
