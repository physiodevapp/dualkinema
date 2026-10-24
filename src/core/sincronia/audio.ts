import type { Sincronia } from '../modelo/tipos'
import type { Envolvente } from './envolvente'
import type { EventoVisual } from './evento'
import { desfaseDeEvento } from './evento'
import { correlacionGccPhat, type OpcionesCorrelacion } from './gccPhat'

/*
 * Sincronía por audio (fase 3, paso 5; §3 de docs/plan-fase-3.md, D2).
 *
 * El audio da el desfase del sonido (desfase = t_ref − t_vista, como el evento visual) con la precisión de la
 * envolvente. Lo que no sabe: cada móvil tiene su propio retardo entre audio e imagen dentro del archivo, distinto en
 * cada grabación. La app no guarda ni aplica ninguna corrección fija: el resultado se comprueba con el evento visual,
 * que es la verdad de la imagen, y se muestra la diferencia entre los dos; si discrepan, la persona decide.
 */

/** Por debajo de esta calidad (pico / segundo pico) el pico no es claro: se avisa y se propone el evento visual. */
export const CALIDAD_AUDIO_MINIMA = 2

export interface ResultadoAudio {
  /** t_ref − t_vista del sonido común (s). */
  readonly desfase: number
  /** Pico / segundo pico. */
  readonly calidad: number
  /** ± (s): una muestra de la envolvente. No incluye el retardo entre audio e imagen de cada móvil. */
  readonly incertidumbre: number
  /** Se puede proponer: la calidad llega a CALIDAD_AUDIO_MINIMA. Si no, se avisa y se propone el evento visual. */
  readonly fiable: boolean
}

/** El desfase de la vista por el audio; null si no hay nada que correlacionar (sin sonido, sin solape). */
export function desfaseDeAudio(ref: Envolvente, vista: Envolvente, opciones?: OpcionesCorrelacion): ResultadoAudio | null {
  const c = correlacionGccPhat(ref, vista, opciones)
  if (!c) return null
  return { desfase: c.desfase, calidad: c.calidad, incertidumbre: 1 / ref.tasa, fiable: c.calidad >= CALIDAD_AUDIO_MINIMA }
}

/** Cómo queda anotada la sincronía al aplicar el audio. */
export const sincroniaDeAudio = (r: ResultadoAudio): Sincronia => ({ metodo: 'audio', audio: { calidad: r.calidad, desfase: r.desfase } })

/** La sincronía por audio con el evento visual que la comprueba (no cambia el desfase ni el método). */
export const conComprobacion = (s: Sincronia, evento: EventoVisual): Sincronia => ({ ...s, evento })

export interface Comprobacion {
  /** Desfase por audio (s). */
  readonly audio: number
  /** Desfase por el evento visual (s). */
  readonly evento: number
  /** evento − audio (s): cuánto habría que mover el audio para que casara con la imagen. */
  readonly diferencia: number
  /** La diferencia supera lo que explican las dos incertidumbres juntas. */
  readonly discrepan: boolean
}

/**
 * Compara el desfase del audio con el del evento visual. Solo informa: no corrige nada. Discrepan si la diferencia
 * supera la suma de las dos incertidumbres (el evento, medio frame de cada vista; el audio, una muestra).
 */
export function compararConEvento(
  audio: { readonly desfase: number; readonly incertidumbre: number },
  evento: EventoVisual,
  incertidumbreEvento: number,
): Comprobacion {
  const deEvento = desfaseDeEvento(evento)
  const diferencia = deEvento - audio.desfase
  return { audio: audio.desfase, evento: deEvento, diferencia, discrepan: Math.abs(diferencia) > incertidumbreEvento + audio.incertidumbre }
}
