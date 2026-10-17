// Utilidades para tests: poses sintéticas con ángulos conocidos.
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'

/** Dirección unitaria en el marco canónico a partir de un ángulo desde «abajo», + = antihorario. */
export function direccion(gradosDesdeAbajo: number): { x: number; y: number } {
  const r = (gradosDesdeAbajo * Math.PI) / 180
  return { x: Math.sin(r), y: -Math.cos(r) }
}

/**
 * Proyecta un punto del marco canónico a píxeles de imagen, como lo vería la
 * cámara con esa orientación (inverso de aCanonico), con un origen y una escala
 * cualesquiera para que los tests no dependan de coordenadas «bonitas».
 */
export function aImagen(
  p: { x: number; y: number },
  orientacion: OrientacionVista,
  origen = { x: 640, y: 360 },
  escala = 200,
): { x: number; y: number } {
  const espejo =
    orientacion.plano === 'sagital' ? orientacion.mira === 'izquierda' : orientacion.ve === 'detras'
  return { x: origen.x + (espejo ? -p.x : p.x) * escala, y: origen.y - p.y * escala }
}

/** Cadena de puntos: parte de `inicio` y avanza un segmento por cada dirección. */
export function cadena(
  inicio: { x: number; y: number },
  pasos: readonly { direccion: number; largo?: number }[],
): { x: number; y: number }[] {
  const puntos = [inicio]
  let actual = inicio
  for (const { direccion: g, largo = 1 } of pasos) {
    const d = direccion(g)
    actual = { x: actual.x + d.x * largo, y: actual.y + d.y * largo }
    puntos.push(actual)
  }
  return puntos
}

/** Trayectorias de un solo frame (t) a partir de puntos ya en píxeles. */
export function frame(
  t: number,
  puntos: Readonly<Record<IdMarcador, { x: number; y: number }>>,
  calidad = 1,
): Record<IdMarcador, Muestra2D[]> {
  const r: Record<IdMarcador, Muestra2D[]> = {}
  for (const [id, p] of Object.entries(puntos)) r[id] = [{ t, x: p.x, y: p.y, calidad, editadoManual: false }]
  return r
}

/** Une varios frames en un único conjunto de trayectorias. */
export function unir(...frames: Record<IdMarcador, Muestra2D[]>[]): Record<IdMarcador, Muestra2D[]> {
  const r: Record<IdMarcador, Muestra2D[]> = {}
  for (const f of frames) for (const [id, ms] of Object.entries(f)) (r[id] ??= []).push(...ms)
  return r
}
