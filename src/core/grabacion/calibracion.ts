import type { AudioMono } from '../sincronia/pitido'

/*
 * Calibrar el retraso de la cámara de un móvil (fase 4, paso 8).
 *
 * Grabando con la app, cada frame va a la «captura» que da Chrome y cada trozo de audio a la suya (`media/captura.ts`),
 * pero la del vídeo no incluye lo que tarda la propia cámara: en el Pixel 8, el sonido de una palmada salía 19–85 ms
 * por delante de la imagen. Ese retraso es fijo en cada móvil: se mide una vez con unas palmadas delante de la cámara
 * y se descuenta al grabar.
 *
 * - **El sonido** de cada palmada: el comienzo de un golpe en el audio (`golpesDeAudio`): energía de la derivada (sin
 *   graves) en bloques de 1 ms, picos que sobresalen mucho del fondo, separados al menos SEPARACION_GOLPES_S, y su
 *   comienzo hacia atrás mientras sigue por encima del fondo.
 * - **La imagen:** la persona marca, en cada palmada, el primer frame con las manos juntas; el contacto está entre el
 *   frame anterior (aún separadas) y ese.
 * - **El retraso** R (cuánto tarde queda la imagen respecto al sonido) de cada palmada está en
 *   [anterior − sonido, juntas − sonido]; con varias, en la intersección (como el reloj común). El sonido tarda en
 *   llegar unos 3 ms por metro: con la persona a 1–2 m, despreciable frente al paso entre frames.
 */

export const SEPARACION_GOLPES_S = 0.5
/** Un golpe sobresale del fondo al menos esto (energía de la derivada, veces la mediana). */
export const UMBRAL_GOLPE = 50
const BLOQUE_S = 0.001

export interface Golpe {
  /** Comienzo del golpe (s de vídeo). */
  readonly t: number
  /** Energía del pico entre la mediana del fondo. */
  readonly fuerza: number
}

/** Los golpes (palmadas) del audio, del más antiguo al más reciente; como mucho `maximo`, los más fuertes. */
export function golpesDeAudio(audio: AudioMono, maximo = 8): Golpe[] {
  const { muestras, tasa, inicio } = audio
  const b = Math.max(1, Math.round(BLOQUE_S * tasa))
  const n = Math.floor((muestras.length - 1) / b)
  if (n < 10) return []
  const e = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    let s = 0
    for (let i = k * b; i < (k + 1) * b; i++) s += (muestras[i + 1]! - muestras[i]!) ** 2
    e[k] = s
  }
  const fondo = Float64Array.from(e).sort()[Math.floor(n / 2)]! || 1e-12
  const separacion = Math.round(SEPARACION_GOLPES_S / BLOQUE_S)
  const orden = Array.from(e.keys()).sort((x, y) => e[y]! - e[x]!)
  const picos: number[] = []
  for (const k of orden) {
    if (e[k]! < UMBRAL_GOLPE * fondo || picos.length >= maximo) break
    if (picos.every((p) => Math.abs(p - k) > separacion)) picos.push(k)
  }
  return picos
    .sort((x, y) => x - y)
    .map((k) => {
      let j = k
      while (j > 0 && e[j - 1]! > 20 * fondo) j--
      return { t: inicio + (j * b) / tasa, fuerza: e[k]! / fondo }
    })
}

export interface MarcaPalmada {
  /** Comienzo del sonido (s de vídeo). */
  readonly sonido: number
  /** Último frame con las manos aún separadas (s de vídeo). */
  readonly antes: number
  /** Primer frame con las manos juntas (s de vídeo). */
  readonly juntas: number
}

export interface RetrasoCamara {
  /** Cuánto tarde queda la imagen respecto al sonido (ms): se descuenta a los frames al grabar. */
  readonly ms: number
  /** ± (ms): la mitad del intervalo que dejan todas las palmadas. */
  readonly cotaMs: number
  readonly palmadas: number
  /** Las palmadas no casaban entre sí (algún frame mal marcado): se toma la mediana con una cota que las cubre. */
  readonly incoherente: boolean
}

/** El retraso de la cámara con las palmadas marcadas; null sin ninguna. */
export function retrasoDeCamara(marcas: readonly MarcaPalmada[]): RetrasoCamara | null {
  if (!marcas.length) return null
  const intervalos = marcas.map((m) => [(m.antes - m.sonido) * 1000, (m.juntas - m.sonido) * 1000] as const)
  const lo = Math.max(...intervalos.map(([a]) => a))
  const hi = Math.min(...intervalos.map(([, z]) => z))
  if (lo <= hi) return { ms: (lo + hi) / 2, cotaMs: (hi - lo) / 2, palmadas: marcas.length, incoherente: false }
  const centros = intervalos.map(([a, z]) => (a + z) / 2).sort((x, y) => x - y)
  const ms = centros[Math.floor(centros.length / 2)]!
  const cotaMs = Math.max(...intervalos.map(([a, z]) => Math.max(Math.abs(a - ms), Math.abs(z - ms))))
  return { ms, cotaMs, palmadas: marcas.length, incoherente: true }
}
