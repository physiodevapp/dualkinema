/** Color en HSV: h en grados [0, 360), s y v en [0, 1]. */
export interface Hsv {
  readonly h: number
  readonly s: number
  readonly v: number
}

export function rgbAHsv(r: number, g: number, b: number): Hsv {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** Diferencia de tono más corta, en grados [0, 180]. */
export function difTono(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Color aprendido de un gomet: media y dispersión de sus píxeles. La distancia
 * de un píxel a este modelo pondera poco el brillo (v), porque es lo que más
 * cambia con la luz y la orientación del gomet; el tono y la saturación
 * identifican el color.
 */
export interface ModeloColor {
  readonly h: number
  readonly s: number
  readonly v: number
  readonly dh: number
  readonly ds: number
  readonly dv: number
}

// Dispersiones mínimas: un gomet uniforme no debe dar un modelo tan estricto
// que el ruido de compresión lo rompa.
const DH_MIN = 8
const DS_MIN = 0.08
const DV_MIN = 0.12
const PESO_V = 0.35

/** Aprende el modelo a partir de los colores de un gomet. */
export function aprenderColor(muestras: readonly Hsv[]): ModeloColor {
  if (muestras.length === 0) throw new Error('No hay píxeles para aprender el color.')
  // Media circular del tono.
  let sx = 0
  let sy = 0
  let ss = 0
  let sv = 0
  for (const m of muestras) {
    const r = (m.h * Math.PI) / 180
    sx += Math.cos(r)
    sy += Math.sin(r)
    ss += m.s
    sv += m.v
  }
  const n = muestras.length
  let h = (Math.atan2(sy, sx) * 180) / Math.PI
  if (h < 0) h += 360
  const s = ss / n
  const v = sv / n
  let vh = 0
  let vs = 0
  let vv = 0
  for (const m of muestras) {
    vh += difTono(m.h, h) ** 2
    vs += (m.s - s) ** 2
    vv += (m.v - v) ** 2
  }
  return {
    h,
    s,
    v,
    dh: Math.max(Math.sqrt(vh / n), DH_MIN),
    ds: Math.max(Math.sqrt(vs / n), DS_MIN),
    dv: Math.max(Math.sqrt(vv / n), DV_MIN),
  }
}

/** Distancia normalizada (≈ número de desviaciones) de un píxel al modelo. */
export function distanciaColor(p: Hsv, m: ModeloColor): number {
  // Con poca saturación el tono no significa nada (grises, reflejos): no es el gomet.
  if (p.s < m.s * 0.4) return Infinity
  const a = difTono(p.h, m.h) / m.dh
  const b = (p.s - m.s) / m.ds
  const c = ((p.v - m.v) / m.dv) * PESO_V
  return Math.sqrt(a * a + b * b + c * c)
}

/** Mezcla el modelo con uno nuevo (adaptación lenta a cambios de luz). */
export function mezclarColor(m: ModeloColor, nuevo: ModeloColor, peso: number): ModeloColor {
  const r1 = (m.h * Math.PI) / 180
  const r2 = (nuevo.h * Math.PI) / 180
  let h = (Math.atan2((1 - peso) * Math.sin(r1) + peso * Math.sin(r2), (1 - peso) * Math.cos(r1) + peso * Math.cos(r2)) * 180) / Math.PI
  if (h < 0) h += 360
  const mez = (a: number, b: number) => a * (1 - peso) + b * peso
  return { h, s: mez(m.s, nuevo.s), v: mez(m.v, nuevo.v), dh: m.dh, ds: m.ds, dv: m.dv }
}
