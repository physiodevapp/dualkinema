// Utilidades para tests: frames sintéticos con gomets en posiciones conocidas.
import type { Imagen, LeerVentana, Ventana } from './imagen'

export interface Disco {
  x: number
  y: number
  /** Radio del círculo, o medio lado del cuadrado. */
  r: number
  rgb: readonly [number, number, number]
  /** Gomet cuadrado girado `giro` radianes (por defecto, círculo). */
  cuadrado?: boolean
  giro?: number
}

function dentroDe(d: Disco, px: number, py: number): boolean {
  if (!d.cuadrado) return (px - d.x) ** 2 + (py - d.y) ** 2 <= d.r * d.r
  const c = Math.cos(-(d.giro ?? 0))
  const s = Math.sin(-(d.giro ?? 0))
  const u = (px - d.x) * c - (py - d.y) * s
  const v = (px - d.x) * s + (py - d.y) * c
  return Math.abs(u) <= d.r && Math.abs(v) <= d.r
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function azar(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Frame de `ancho × alto` con fondo tipo piel/suelo con ruido y discos con
 * antialiasing (supermuestreo 4 × 4), para que el centro real sea subpíxel.
 * `brillo` escala los discos (cambios de luz).
 */
export function dibujarFrame(
  ancho: number,
  alto: number,
  discos: readonly Disco[],
  opciones: {
    semilla?: number
    ruido?: number
    brillo?: number
    fondo?: readonly [number, number, number]
    /** Color a media resolución, como el 4:2:0 de H.264/HEVC de los móviles. */
    croma420?: boolean
  } = {},
): Imagen {
  const { semilla = 1, ruido = 6, brillo = 1, fondo = [196, 160, 140], croma420 = false } = opciones
  const rnd = azar(semilla)
  const datos = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const k = (y * ancho + x) * 4
      // Fondo con un degradado suave y ruido.
      const g = 0.85 + 0.15 * (y / alto)
      let r = fondo[0] * g
      let gg = fondo[1] * g
      let b = fondo[2] * g
      for (const d of discos) {
        const alcance = d.cuadrado ? d.r * Math.SQRT2 : d.r
        if (Math.abs(x + 0.5 - d.x) > alcance + 1 || Math.abs(y + 0.5 - d.y) > alcance + 1) continue
        let dentro = 0
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const px = x + (sx + 0.5) / 4
            const py = y + (sy + 0.5) / 4
            if (dentroDe(d, px, py)) dentro++
          }
        }
        const f = dentro / 16
        r = r * (1 - f) + d.rgb[0] * brillo * f
        gg = gg * (1 - f) + d.rgb[1] * brillo * f
        b = b * (1 - f) + d.rgb[2] * brillo * f
      }
      const n = () => (rnd() - 0.5) * 2 * ruido
      datos[k] = r + n()
      datos[k + 1] = gg + n()
      datos[k + 2] = b + n()
      datos[k + 3] = 255
    }
  }
  if (croma420) submuestrearCroma(datos, ancho, alto)
  return { ancho, alto, datos, x0: 0, y0: 0 }
}

/**
 * Promedia el color (Cb, Cr) en bloques de 2 × 2 conservando el brillo (Y) de
 * cada píxel, como hace la compresión 4:2:0: los bordes de un gomet pequeño
 * quedan con un color mezcla del gomet y lo que lo rodea.
 */
function submuestrearCroma(d: Uint8ClampedArray, ancho: number, alto: number) {
  for (let by = 0; by < alto; by += 2) {
    for (let bx = 0; bx < ancho; bx += 2) {
      const idx: number[] = []
      for (let y = by; y < Math.min(by + 2, alto); y++) for (let x = bx; x < Math.min(bx + 2, ancho); x++) idx.push((y * ancho + x) * 4)
      let cb = 0
      let cr = 0
      const ys = idx.map((k) => {
        const r = d[k]!, g = d[k + 1]!, b = d[k + 2]!
        const yy = 0.299 * r + 0.587 * g + 0.114 * b
        cb += b - yy
        cr += r - yy
        return yy
      })
      cb /= idx.length
      cr /= idx.length
      idx.forEach((k, i) => {
        const yy = ys[i]!
        const r = yy + cr
        const b = yy + cb
        d[k] = r
        d[k + 2] = b
        d[k + 1] = (yy - 0.299 * r - 0.114 * b) / 0.587
      })
    }
  }
}

/** LeerVentana sobre una imagen completa. */
export function lector(img: Imagen): LeerVentana {
  return (v: Ventana) => {
    const datos = new Uint8ClampedArray(v.ancho * v.alto * 4)
    for (let y = 0; y < v.alto; y++) {
      const desde = ((v.y + y) * img.ancho + v.x) * 4
      datos.set(img.datos.subarray(desde, desde + v.ancho * 4), y * v.ancho * 4)
    }
    return { ancho: v.ancho, alto: v.alto, datos, x0: v.x, y0: v.y }
  }
}

export const VERDE = [40, 200, 90] as const
export const AZUL = [30, 90, 220] as const
