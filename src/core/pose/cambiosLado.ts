/*
 * Cambios de lado: de perfil, el modelo sin marcadores a veces confunde la pierna izquierda con la derecha durante unos
 * frames (la lejana queda detrás de la cercana). Se nota porque, de un frame al siguiente, cada rodilla y cada tobillo
 * «saltan» a donde estaba el del otro lado. Aquí solo se detecta (el experimento del paso 1 lo cuenta); corregirlo se
 * decide en el paso 2 con los vídeos del usuario.
 */
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { idPose, type ParteCuerpo } from './puntos'

const PARTES_PIERNA: readonly ParteCuerpo[] = ['rodilla', 'tobillo']

const con = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad > 0 && Number.isFinite(m.x) && Number.isFinite(m.y)
const dist = (a: Muestra2D, b: Muestra2D) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Frames en los que las dos piernas parecen intercambiadas respecto al frame anterior: emparejar cada rodilla y cada
 * tobillo con los del otro lado del frame anterior cuesta menos de la mitad que con los suyos, y el salto con los suyos
 * pasa de `umbralPx` (con las piernas una sobre otra, intercambiarlas no cambia nada y no cuenta). Solo se comparan
 * frames seguidos con los cuatro puntos detectados (con cualquier visibilidad: la pierna lejana suele tenerla baja).
 */
export function cambiosDeLado(trayectorias: ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>, umbralPx: number): number[] {
  const series = PARTES_PIERNA.map((p) => ({ izq: trayectorias.get(idPose(p, 'izq')) ?? [], der: trayectorias.get(idPose(p, 'der')) ?? [] }))
  const n = Math.max(0, ...series.flatMap((s) => [s.izq.length, s.der.length]))
  const r: number[] = []
  for (let i = 1; i < n; i++) {
    let directo = 0
    let cruzado = 0
    let completo = true
    for (const s of series) {
      const [ia, da, ib, db] = [s.izq[i - 1], s.der[i - 1], s.izq[i], s.der[i]]
      if (!con(ia) || !con(da) || !con(ib) || !con(db)) {
        completo = false
        break
      }
      directo += dist(ib, ia) + dist(db, da)
      cruzado += dist(ib, da) + dist(db, ia)
    }
    if (completo && directo > umbralPx && cruzado < directo / 2) r.push(i)
  }
  return r
}
