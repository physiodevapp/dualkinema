import type { Sincronia } from '../modelo/tipos'
import { fpsMediano, type TablaFrames } from '../tiempo/tablaFrames'

/*
 * Sincronía por evento visual (fase 3, §3 de docs/plan-fase-3.md).
 *
 * La persona lleva cada vídeo al frame de un mismo evento (una palmada, el pie que toca el suelo, un destello) y lo marca
 * en cada uno. Un evento visto en `t_vista` en la vista y en `t_ref` en la de referencia ocurre en el mismo instante:
 *
 *   t_ref = t_vista + desfase  →  desfase = t_ref − t_vista
 *
 * (el convenio de `tiempo/comun.ts`: tiempo común = tiempo del vídeo + desfase; la referencia tiene 0).
 */

/** Instante del evento en el vídeo de la referencia y en el de la vista (s de vídeo). */
export type EventoVisual = NonNullable<Sincronia['evento']>

/** El desfase de la vista que hace coincidir el evento con el de la referencia. */
export const desfaseDeEvento = (e: EventoVisual): number => e.referencia - e.vista

/**
 * Paso típico entre frames de una vista (s): la inversa del fps mediano, que no mueven los frames que el móvil se salta.
 * NaN con menos de 2 frames.
 */
export const pasoTipico = (tabla: TablaFrames): number => 1 / fpsMediano(tabla)

/**
 * Incertidumbre del desfase (s): cada vista sitúa el evento con un error de hasta medio frame suyo, así que el desfase
 * tiene la suma de los dos medios pasos. Entre dos vídeos de 30 fps, ±33 ms.
 */
export const incertidumbreEvento = (pasoReferencia: number, pasoVista: number): number => (pasoReferencia + pasoVista) / 2

/**
 * Mueve el desfase `frames` pasos de la vista (positivo: la vista se desplaza hacia más tarde en el tiempo común). Sin un
 * paso utilizable (un vídeo de un solo frame) no lo mueve: un desfase NaN dejaría la vista fuera del tiempo común.
 */
export const ajustarDesfase = (desfase: number, frames: number, pasoVista: number): number =>
  Number.isFinite(pasoVista) && pasoVista > 0 ? desfase + frames * pasoVista : desfase

/** Cómo queda anotada la sincronía tras mover el desfase a mano: un evento sigue siendo de dónde partió; sin método, es manual. */
export const sincroniaTrasAjuste = (s: Sincronia): Sincronia => (s.metodo === 'ninguna' ? { metodo: 'manual' } : s)

/** Lo que se ha movido a mano desde el desfase que daba el método (s); null si no hay un desfase de partida (manual o ninguna). */
export function ajusteManual(desfase: number, s: Sincronia): number | null {
  if (s.metodo === 'evento' && s.evento) return desfase - desfaseDeEvento(s.evento)
  if (s.metodo === 'audio' && s.audio) return desfase - s.audio.desfase
  if (s.metodo === 'pitido' && s.pitido) return desfase - s.pitido.desfase
  if (s.metodo === 'reloj' && s.reloj) return desfase - s.reloj.desfase
  return null
}
