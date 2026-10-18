/*
 * Escala 2D en metros (paso 6 de la fase 2, decisión D4). Con un objeto de
 * longitud conocida en el plano del movimiento, se tocan sus dos extremos en
 * la imagen y se introduce la longitud: metros por píxel = longitud / distancia.
 *
 * El objeto (cinta, palo, regla u otro) no cambia el cálculo: solo es un dato
 * para la exportación y para los consejos de la app. Lo que sí importa es
 * cuántos píxeles ocupa: un error de un píxel al marcar pesa más en un objeto
 * corto (ver `incertidumbreRelativa`).
 *
 * Solo vale para lo que se mueve en ese plano: lo que está más cerca o más
 * lejos de la cámara sale con otra escala, y sin corrección de lente (fase 6)
 * los bordes de la imagen tienen algo de distorsión.
 *
 * Se guarda con la vista (`calibracion`). Los ángulos no la necesitan; las
 * velocidades lineales y las distancias, sí.
 *
 * Variante «entre dos marcadores»: en vez de un objeto, la distancia medida
 * con cinta entre dos gomets de la persona (p. ej. rodilla y tobillo, de
 * pie). Los extremos son la posición media de cada marcador en un tramo
 * quieto, así que el error de marcado baja mucho y la escala queda justo en
 * el plano de los marcadores. Lo que más pesa entonces es la medida con cinta
 * sobre la piel, que la app no puede saber.
 */

import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'

export type ObjetoCalibracion = 'cinta' | 'palo' | 'regla' | 'otro' | 'marcadores'
export const OBJETOS_CALIBRACION: readonly ObjetoCalibracion[] = ['cinta', 'palo', 'regla', 'otro', 'marcadores']

/** De dónde salen los extremos cuando la escala es la distancia entre dos marcadores. */
export interface EntreMarcadores {
  readonly desde: IdMarcador
  readonly hasta: IdMarcador
  /** Tramo promediado, en s de vídeo (desde ≤ hasta: un solo frame vale). */
  readonly tramo: { readonly desde: number; readonly hasta: number }
  /** Frames con los dos marcadores utilizables en el tramo. */
  readonly muestras: number
  /** Desviación típica de la distancia entre ellos en el tramo, px. */
  readonly dispersionPx: number
}

export interface Punto2D {
  readonly x: number
  readonly y: number
}

/** Escala en el plano del movimiento a partir de un objeto de longitud conocida. */
export interface EscalaPlano {
  readonly tipo: 'escala-plano'
  readonly objeto: ObjetoCalibracion
  /** Extremos del objeto, en px de la imagen tal como se ve (rotación aplicada). */
  readonly a: Punto2D
  readonly b: Punto2D
  /** Longitud real entre los dos extremos, en metros. */
  readonly longitudM: number
  /** Instante (s de vídeo) del frame en que se marcaron los extremos, para volver a verlo. */
  readonly t: number
  /** Solo con `objeto: 'marcadores'`: de qué marcadores y tramo salen `a` y `b`. */
  readonly entre?: EntreMarcadores
}

/** Calibración de una vista. Hoy solo la escala 2D; DLT (fase 5) y lente (fase 6) se añadirán aquí. */
export type CalibracionVista = EscalaPlano

/** Longitud admitida: de 1 cm a 20 m. */
export const LONGITUD_MIN_M = 0.01
export const LONGITUD_MAX_M = 20
/** Por debajo de esta distancia en la imagen no se acepta: el error de marcado lo dominaría. */
export const DISTANCIA_MIN_PX = 20
/** Error típico al marcar cada extremo con la lupa, en px. */
export const ERROR_MARCADO_PX = 1
/**
 * Error mínimo de la posición media de un gomet, px. Promediar muchos frames
 * reduce el ruido del seguimiento, pero no lo que comparten todos (la forma
 * del gomet, la luz): no se baja de aquí.
 */
export const ERROR_MEDIA_MARCADOR_PX = 0.25
/**
 * Error típico del centro de un gomet en un solo frame, px. Con pocos frames
 * la dispersión no se puede estimar (con uno es 0): se supone este error en
 * cada marcador, √2 en la distancia, y se divide por √n.
 */
export const ERROR_DETECCION_PX = 0.5
/** Por encima de esta incertidumbre relativa, la app aconseja un objeto más largo. */
export const INCERTIDUMBRE_AVISO = 0.01

export const distanciaPx = (a: Punto2D, b: Punto2D) => Math.hypot(b.x - a.x, b.y - a.y)

export const metrosPorPx = (c: EscalaPlano) => c.longitudM / distanciaPx(c.a, c.b)

/**
 * Incertidumbre relativa de la escala debida solo al marcado: cada extremo
 * con un error de `errorPx` en la dirección del objeto, independientes, dan
 * √2·errorPx en la distancia. Un palo de 1 m que ocupa 400 px: 0,35 %; una
 * regla de 30 cm en el mismo vídeo (120 px): 1,2 %.
 *
 * No incluye lo que suele pesar más: que el objeto no esté exactamente en el
 * plano del movimiento (a 3 m de la cámara, 10 cm más cerca o más lejos ya
 * cambian la escala un 3 %) o que esté inclinado hacia la cámara.
 */
export function incertidumbreRelativa(a: Punto2D, b: Punto2D, errorPx = ERROR_MARCADO_PX): number {
  return (Math.SQRT2 * errorPx) / distanciaPx(a, b)
}

/**
 * Incertidumbre relativa de una escala por cómo se obtuvieron sus extremos:
 * tocados a mano, `incertidumbreRelativa`; entre marcadores, el error de la
 * distancia media: lo mayor de la dispersión medida / √n, el error supuesto de
 * cada detección (√2 · ERROR_DETECCION_PX / √n; con pocos frames la dispersión
 * no dice nada, con uno es 0) y ERROR_MEDIA_MARCADOR_PX. Los frames de un
 * tramo quieto no son independientes, así que √n es optimista: de ahí el mínimo.
 */
export function incertidumbreEscala(c: Pick<EscalaPlano, 'a' | 'b' | 'entre'>): number {
  if (!c.entre) return incertidumbreRelativa(c.a, c.b)
  const raiz = Math.sqrt(c.entre.muestras)
  const errorPx = Math.max(c.entre.dispersionPx / raiz, (Math.SQRT2 * ERROR_DETECCION_PX) / raiz, ERROR_MEDIA_MARCADOR_PX)
  return errorPx / distanciaPx(c.a, c.b)
}

export type ResultadoEntre =
  | { readonly ok: true; readonly a: Punto2D; readonly b: Punto2D; readonly muestras: number; readonly dispersionPx: number }
  | { readonly ok: false; readonly motivo: string }

const utilizable = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x) && Number.isFinite(m.y)

/**
 * Distancia media entre dos marcadores en un tramo (extremos incluidos), con
 * los frames en que los dos tienen posición utilizable, y su desviación
 * típica frame a frame (cuánto se deslizaron o salieron del plano). Las
 * series van por frame, como en el visor.
 *
 * Se promedia la distancia de cada frame, no las posiciones: si el segmento
 * se mueve en el tramo (gira en el plano), la distancia entre las posiciones
 * medias sería más corta que el segmento. `a` es la posición media del
 * primero y `b` está en la dirección de la posición media del segundo, a la
 * distancia media: así distanciaPx(a, b) es esa distancia y el segmento se
 * dibuja donde estaban.
 */
export function medirEntreMarcadores(
  serieA: readonly (Muestra2D | undefined)[],
  serieB: readonly (Muestra2D | undefined)[],
  tramo: { readonly desde: number; readonly hasta: number },
): ResultadoEntre {
  let n = 0
  let ax = 0, ay = 0, bx = 0, by = 0
  const distancias: number[] = []
  for (let i = 0; i < Math.min(serieA.length, serieB.length); i++) {
    const ma = serieA[i]
    const mb = serieB[i]
    if (!utilizable(ma) || !utilizable(mb) || ma.t < tramo.desde || ma.t > tramo.hasta) continue
    n++
    ax += ma.x
    ay += ma.y
    bx += mb.x
    by += mb.y
    distancias.push(distanciaPx(ma, mb))
  }
  if (n === 0) return { ok: false, motivo: 'En ese tramo no están los dos marcadores: sigue los gomets primero o elige otro tramo.' }
  const media = distancias.reduce((s, d) => s + d, 0) / n
  const dispersionPx = Math.sqrt(distancias.reduce((s, d) => s + (d - media) ** 2, 0) / n)
  const a = { x: ax / n, y: ay / n }
  const dx = bx / n - a.x
  const dy = by / n - a.y
  const norma = Math.hypot(dx, dy)
  // Si las posiciones medias coinciden (un giro completo), la dirección no importa.
  const [ux, uy] = norma > 1e-9 ? [dx / norma, dy / norma] : [0, 1]
  return { ok: true, a, b: { x: a.x + ux * media, y: a.y + uy * media }, muestras: n, dispersionPx }
}

export type ResultadoEscala = { readonly ok: true; readonly valor: EscalaPlano } | { readonly ok: false; readonly motivo: string }

/** Crea la escala comprobando los extremos y la longitud; si no sirve, dice por qué. */
export function crearEscala(e: Omit<EscalaPlano, 'tipo'>): ResultadoEscala {
  if (![e.a.x, e.a.y, e.b.x, e.b.y, e.t].every(Number.isFinite)) return { ok: false, motivo: 'Faltan los dos extremos del objeto.' }
  if (!Number.isFinite(e.longitudM) || e.longitudM < LONGITUD_MIN_M || e.longitudM > LONGITUD_MAX_M) {
    return { ok: false, motivo: 'La longitud tiene que estar entre 1 cm y 20 m.' }
  }
  const d = distanciaPx(e.a, e.b)
  if (d < DISTANCIA_MIN_PX) {
    return { ok: false, motivo: `Los extremos están a ${Math.round(d)} px: demasiado juntos. Toca los dos extremos del objeto (al menos ${DISTANCIA_MIN_PX} px).` }
  }
  if ((e.objeto === 'marcadores') !== !!e.entre || (e.entre && !esEntre(e.entre))) {
    return { ok: false, motivo: 'Faltan los dos marcadores y el tramo de donde sale la distancia.' }
  }
  return {
    ok: true,
    valor: {
      tipo: 'escala-plano',
      objeto: e.objeto,
      a: { x: e.a.x, y: e.a.y },
      b: { x: e.b.x, y: e.b.y },
      longitudM: e.longitudM,
      t: e.t,
      ...(e.entre && { entre: { desde: e.entre.desde, hasta: e.entre.hasta, tramo: { ...e.entre.tramo }, muestras: e.entre.muestras, dispersionPx: e.entre.dispersionPx } }),
    },
  }
}

const esPunto = (v: unknown): v is Punto2D =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Punto2D).x) && Number.isFinite((v as Punto2D).y)

function esEntre(v: unknown): v is EntreMarcadores {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  const t = e.tramo as Record<string, unknown> | null
  return (
    typeof e.desde === 'string' && typeof e.hasta === 'string' && e.desde !== e.hasta &&
    typeof t === 'object' && t !== null && Number.isFinite(t.desde) && Number.isFinite(t.hasta) && (t.desde as number) <= (t.hasta as number) &&
    Number.isInteger(e.muestras) && (e.muestras as number) >= 1 &&
    typeof e.dispersionPx === 'number' && Number.isFinite(e.dispersionPx) && e.dispersionPx >= 0
  )
}

/** Valida una calibración leída de lo guardado. */
export function esCalibracion(v: unknown): v is CalibracionVista {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  if (c.tipo !== 'escala-plano' || !OBJETOS_CALIBRACION.includes(c.objeto as ObjetoCalibracion)) return false
  if (!esPunto(c.a) || !esPunto(c.b) || typeof c.t !== 'number' || !Number.isFinite(c.t)) return false
  if (typeof c.longitudM !== 'number' || !(c.longitudM >= LONGITUD_MIN_M && c.longitudM <= LONGITUD_MAX_M)) return false
  if (c.objeto === 'marcadores' ? !esEntre(c.entre) : c.entre !== undefined) return false
  return distanciaPx(c.a, c.b) >= DISTANCIA_MIN_PX
}

/**
 * Lee una longitud escrita en centímetros («100», «100,5», «100.5») y la
 * devuelve en metros. null si no es un número positivo.
 */
export function metrosDesdeCm(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(limpio)) return null
  const cm = Number(limpio)
  return cm > 0 ? cm / 100 : null
}
