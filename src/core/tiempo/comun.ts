import { fpsMediano, indiceDeFrame, indiceMasCercano, type TablaFrames } from './tablaFrames'

/*
 * Tiempo común de una sesión de varias vistas (fase 3, §2 de docs/plan-fase-3.md).
 *
 * Una vista es la referencia y su tiempo es el tiempo común. Cada vista tiene
 * su `desfase` con este convenio, el único que se usa en todo el código:
 *
 *   tiempo común = tiempo del vídeo + desfase
 *
 * Un evento que se ve en t_B en la vista B ocurre en el tiempo común t_B + desfase_B;
 * la referencia tiene desfase 0. Cada vista conserva su tabla de frames (fps
 * distintos y variables): todo se convierte por tiempo, nunca por índice.
 *
 * Ir y volver por el tiempo común redondea: el inicio de un frame puede volver
 * una millonésima antes (1,24 + 0,733 − 0,733 = 1,2399999…) y caer en el frame
 * anterior. Por eso el frame visible se busca con el mismo margen que los tiempos
 * del decodificador (`indiceDeFrame`, 1 µs), muy por debajo de un frame.
 */

/** Margen de redondeo al comparar instantes (s): el mismo que `indiceDeFrame`. */
const MARGEN_S = 1e-6

/** Una vista vista desde el tiempo común: sus frames y su desfase (s). */
export interface VistaEnElTiempo {
  readonly tabla: TablaFrames
  readonly desfase: number
}

export interface Rango {
  readonly desde: number
  readonly hasta: number
}

/** Del tiempo del vídeo de una vista al tiempo común. */
export const aComun = (tVideo: number, desfase: number) => tVideo + desfase

/** Del tiempo común al tiempo del vídeo de una vista. */
export const aVideo = (tComun: number, desfase: number) => tComun - desfase

/**
 * Lo que dura en pantalla el último frame: no se sabe del archivo, así que se toma el paso típico entre frames (la
 * inversa del fps mediano). Con un solo frame, 0.
 */
function duracionUltimo(tabla: TablaFrames): number {
  const fps = fpsMediano(tabla)
  return Number.isFinite(fps) && fps > 0 ? 1 / fps : 0
}

/**
 * Lo que abarca una vista en el tiempo común: desde su primer frame hasta que acaba de verse el último. null si no
 * tiene frames.
 */
export function rangoComun(v: VistaEnElTiempo): Rango | null {
  const ts = v.tabla.tiempos
  if (ts.length === 0) return null
  return { desde: aComun(ts[0]!, v.desfase), hasta: aComun(ts[ts.length - 1]!, v.desfase) + duracionUltimo(v.tabla) }
}

/** El rango de la sesión: la unión de los de sus vistas (D10). null si ninguna tiene frames. */
export function rangoSesion(vistas: readonly VistaEnElTiempo[]): Rango | null {
  let r: Rango | null = null
  for (const v of vistas) {
    const rv = rangoComun(v)
    if (!rv) continue
    r = r ? { desde: Math.min(r.desde, rv.desde), hasta: Math.max(r.hasta, rv.hasta) } : rv
  }
  return r
}

/** ¿Se ve algo de la vista en el instante común t? Con el margen de redondeo en los dos extremos. */
function dentro(v: VistaEnElTiempo, tComun: number): boolean {
  const r = rangoComun(v)
  return !!r && tComun >= r.desde - MARGEN_S && tComun < r.hasta - MARGEN_S
}

/**
 * Frame que se ve en la vista en el instante común t: el último que empezó a verse (como `indiceEnTiempo`). null si t
 * cae fuera del vídeo (antes de su primer frame o después de que acabe de verse el último): esa vista no tiene imagen
 * ni valor en ese instante.
 */
export function frameVisibleEnComun(v: VistaEnElTiempo, tComun: number): number | null {
  if (!dentro(v, tComun)) return null
  return indiceDeFrame(v.tabla, aVideo(tComun, v.desfase))
}

/**
 * Frame de la vista más cercano al instante común t (para tocar una gráfica en el tiempo común: el más próximo al
 * punto, no el último anterior). null si t cae fuera del vídeo.
 */
export function frameMasCercanoEnComun(v: VistaEnElTiempo, tComun: number): number | null {
  if (!dentro(v, tComun)) return null
  return indiceMasCercano(v.tabla, aVideo(tComun, v.desfase))
}

/** Instante común en que empieza a verse el frame i de la vista. */
export const tiempoComunDeFrame = (v: VistaEnElTiempo, i: number) => aComun(v.tabla.tiempos[i]!, v.desfase)
