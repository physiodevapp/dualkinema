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
 */

export type ObjetoCalibracion = 'cinta' | 'palo' | 'regla' | 'otro'
export const OBJETOS_CALIBRACION: readonly ObjetoCalibracion[] = ['cinta', 'palo', 'regla', 'otro']

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
  return { ok: true, valor: { tipo: 'escala-plano', objeto: e.objeto, a: { x: e.a.x, y: e.a.y }, b: { x: e.b.x, y: e.b.y }, longitudM: e.longitudM, t: e.t } }
}

const esPunto = (v: unknown): v is Punto2D =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Punto2D).x) && Number.isFinite((v as Punto2D).y)

/** Valida una calibración leída de lo guardado. */
export function esCalibracion(v: unknown): v is CalibracionVista {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  if (c.tipo !== 'escala-plano' || !OBJETOS_CALIBRACION.includes(c.objeto as ObjetoCalibracion)) return false
  if (!esPunto(c.a) || !esPunto(c.b) || typeof c.t !== 'number' || !Number.isFinite(c.t)) return false
  if (typeof c.longitudM !== 'number' || !(c.longitudM >= LONGITUD_MIN_M && c.longitudM <= LONGITUD_MAX_M)) return false
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
