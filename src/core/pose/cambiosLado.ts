/*
 * Cambios de lado: de perfil, el modelo sin marcadores a veces confunde la pierna izquierda con la derecha durante unos
 * frames (la lejana queda detrás de la cercana). Se nota porque, de un frame al siguiente, cada rodilla y cada tobillo
 * «saltan» a donde estaba el del otro lado. Si el cambio se deshace enseguida, se corrige; si no, esas piernas quedan
 * dudosas (`corregirCambiosDeLado`). De frente no hace falta mirar los saltos: cada cadera tiene su lado de la imagen
 * (`asignarLadosFrontal`).
 */
import { aCanonico, type OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { idPose, PUNTOS_POSE, type ParteCuerpo } from './puntos'

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

/** Un intercambio de perfil que se deshace en este tiempo como mucho (s) es un error del modelo y se corrige. */
export const VUELTA_MAX_S = 0.5

/**
 * Calidad que se deja a las piernas cuando no se sabe cuál es cuál: por debajo de `CALIDAD_MINIMA` (no se usan para el
 * análisis) y por encima de `CALIDAD_PERDIDO` (se ven como dudosas, con su posición).
 */
export const CALIDAD_LADO_DUDOSO = 0.4

/** Frames seguidos, con los dos extremos incluidos (índices de la tabla). */
export interface TramoFrames {
  readonly desde: number
  readonly hasta: number
}

export interface CorreccionLados {
  /** Las trayectorias corregidas (copias: las de entrada no se tocan). */
  readonly series: Map<IdMarcador, (Muestra2D | undefined)[]>
  /** Tramos con izquierda y derecha intercambiadas de vuelta. */
  readonly intercambiados: readonly TramoFrames[]
  /** Tramos de perfil en los que no se sabe cuál es cada pierna: sus puntos quedan dudosos. */
  readonly dudosos: readonly TramoFrames[]
}

const PARTES_DUDOSAS: readonly ParteCuerpo[] = ['rodilla', 'tobillo', 'talon', 'punta']

const copiar = (series: SeriesPose) => new Map([...series].map(([id, s]) => [id, [...s]] as [IdMarcador, (Muestra2D | undefined)[]]))

/** Intercambia izquierda y derecha de los 12 puntos en los frames del tramo. */
function intercambiar(series: Map<IdMarcador, (Muestra2D | undefined)[]>, tramo: TramoFrames) {
  for (const p of PUNTOS_POSE) {
    if (p.lado !== 'izq') continue
    const izq = series.get(p.id)
    const der = series.get(idPose(p.parte, 'der'))
    if (!izq || !der) continue
    for (let i = tramo.desde; i <= tramo.hasta; i++) [izq[i], der[i]] = [der[i], izq[i]]
  }
}

/** Frames seguidos de una lista ordenada, como tramos. */
function tramosDe(frames: readonly number[]): TramoFrames[] {
  const r: TramoFrames[] = []
  for (const i of frames) {
    const ultimo = r[r.length - 1]
    if (ultimo && ultimo.hasta === i - 1) r[r.length - 1] = { desde: ultimo.desde, hasta: i }
    else r.push({ desde: i, hasta: i })
  }
  return r
}

type SeriesPose = ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>

/**
 * De frente, cada lado va donde tiene que estar: la cadera izquierda de la persona queda hacia +x del marco canónico
 * (con la cámara delante, a la derecha de la imagen; detrás, a la izquierda). Un frame con las caderas al revés (más de
 * `umbralPx` en x) tiene los 12 puntos intercambiados. Las caderas no se cruzan, así que el criterio no depende de lo que
 * pasara en el frame anterior, y arregla de paso que el modelo etiquete los lados como si viera a la persona de frente
 * cuando la cámara está detrás.
 */
export function asignarLadosFrontal(series: SeriesPose, orientacion: Extract<OrientacionVista, { plano: 'frontal' }>, umbralPx: number): CorreccionLados {
  const r = copiar(series)
  const izq = series.get(idPose('cadera', 'izq')) ?? []
  const der = series.get(idPose('cadera', 'der')) ?? []
  const frames: number[] = []
  for (let i = 0; i < Math.min(izq.length, der.length); i++) {
    const a = izq[i]
    const b = der[i]
    if (!con(a) || !con(b)) continue
    if (aCanonico(b.x, b.y, orientacion).x - aCanonico(a.x, a.y, orientacion).x > umbralPx) frames.push(i)
  }
  const intercambiados = tramosDe(frames)
  for (const t of intercambiados) intercambiar(r, t)
  return { series: r, intercambiados, dudosos: [] }
}

/**
 * De perfil, los intercambios que detecta `cambiosDeLado`: si al cambio le sigue el de vuelta en `VUELTA_MAX_S` como
 * mucho, sin que el modelo deje de ver a la persona entre medias, los frames de en medio se intercambian de vuelta. Si
 * tarda más, o no vuelve antes de que se pierda a la persona o acabe el vídeo, no se sabe qué lado es el bueno: las
 * piernas de esos frames quedan dudosas (`CALIDAD_LADO_DUDOSO`), con su posición. Nunca se inventa nada. Las
 * detecciones se corrigen antes de juntarlas con lo marcado a mano.
 */
export function corregirCambiosDeLado(series: SeriesPose, tiempos: readonly number[], umbralPx: number): CorreccionLados {
  const r = copiar(series)
  const cambios = cambiosDeLado(series, umbralPx)
  const caderas = series.get(idPose('cadera', 'izq')) ?? []
  const n = tiempos.length
  // Primer frame sin persona desde `i` (o el final): el detector vuelve a empezar y los lados pueden cambiar.
  const finDeRacha = (i: number) => {
    let j = i
    while (j < n && con(caderas[j])) j++
    return j
  }
  const intercambiados: TramoFrames[] = []
  const dudosos: TramoFrames[] = []
  for (let k = 0; k < cambios.length; ) {
    const e = cambios[k]!
    const fin = finDeRacha(e)
    const vuelta = cambios[k + 1]
    if (vuelta !== undefined && vuelta < fin) {
      const tramo = { desde: e, hasta: vuelta - 1 }
      if (tiempos[vuelta]! - tiempos[e]! <= VUELTA_MAX_S) intercambiados.push(tramo)
      else dudosos.push(tramo)
      k += 2
    } else {
      dudosos.push({ desde: e, hasta: fin - 1 })
      k += 1
    }
  }
  for (const t of intercambiados) intercambiar(r, t)
  for (const t of dudosos) {
    for (const parte of PARTES_DUDOSAS) {
      for (const lado of ['izq', 'der'] as const) {
        const s = r.get(idPose(parte, lado))
        if (!s) continue
        for (let i = t.desde; i <= t.hasta; i++) {
          const m = s[i]
          if (m && !m.editadoManual && m.calidad > CALIDAD_LADO_DUDOSO) s[i] = { ...m, calidad: CALIDAD_LADO_DUDOSO }
        }
      }
    }
  }
  return { series: r, intercambiados, dudosos }
}

/** Lo que toca según la vista: de frente, por la posición de las caderas; de perfil, por los saltos. */
export function corregirLados(series: SeriesPose, orientacion: OrientacionVista, tiempos: readonly number[], umbralPx: number): CorreccionLados {
  return orientacion.plano === 'frontal' ? asignarLadosFrontal(series, orientacion, umbralPx) : corregirCambiosDeLado(series, tiempos, umbralPx)
}
