import type { DatosDoble } from '../grabacion/metadatos'
import type { Sincronia } from '../modelo/tipos'
import type { IdaVuelta } from './pitido'

/*
 * Qué desfase se propone al abrir una grabación doble (fase 4, paso 7; §7 de docs/plan-fase-4.md, D10).
 *
 * **Por el reloj.** Cada vídeo empieza (su tiempo 0) en el instante programado, anotado en su reloj (`doble.inicio`, ms),
 * y cada móvil anotó cuánto va el reloj del otro por delante del suyo (`relojOtro`: d = reloj del otro − reloj propio,
 * con su cota). Un mismo instante real r, en el reloj de la referencia, está en el tiempo de vídeo t_ref = r − inicio_ref
 * y t_vista = r − (inicio_vista − d_ref→vista), así que
 *
 *   desfase = t_ref − t_vista = (inicio_vista − d − inicio_ref) / 1000   (s)
 *
 * con d = relojOtro de la referencia o −relojOtro de la vista: se toma la estimación con la cota más estrecha. La
 * precisión es esa cota (más lo que tarda en arrancar cada grabadora, unos ms).
 *
 * **Por el pitido** (`pitido.ts`): mucho más fino (una fracción de ms), pero alinea el sonido y puede fallar (no se oye,
 * un ruido). Se propone si es fiable (calidad y distancia razonable) y cae dentro de la cota del reloj con un margen
 * (MARGEN_RELOJ_S): si no, algo ha ido mal con el pitido y se propone el reloj, diciendo por qué.
 */

/** Lo que se tolera fuera de la cota del reloj (s): el arranque de cada grabadora y los temporizadores. */
export const MARGEN_RELOJ_S = 0.05

export interface DesfaseReloj {
  /** t_ref − t_vista (s). */
  readonly desfase: number
  /** ± (s). */
  readonly cota: number
}

/** El desfase de la vista por el reloj común; null si ninguno de los dos móviles tenía estimación del otro. */
export function desfaseDeReloj(referencia: DatosDoble, vista: DatosDoble): DesfaseReloj | null {
  const estimaciones: { d: number; cota: number }[] = []
  if (referencia.relojOtro) estimaciones.push({ d: referencia.relojOtro.desfase, cota: referencia.relojOtro.cota })
  if (vista.relojOtro) estimaciones.push({ d: -vista.relojOtro.desfase, cota: vista.relojOtro.cota })
  if (!estimaciones.length) return null
  const mejor = estimaciones.reduce((a, b) => (b.cota < a.cota ? b : a))
  return { desfase: (vista.inicio - mejor.d - referencia.inicio) / 1000, cota: mejor.cota / 1000 }
}

export type PropuestaDoble =
  | {
      readonly metodo: 'pitido'
      readonly desfase: number
      readonly pitido: IdaVuelta
      readonly reloj: DesfaseReloj | null
    }
  | {
      readonly metodo: 'reloj'
      readonly desfase: number
      readonly reloj: DesfaseReloj
      /** El pitido, si se encontró algo (para mostrarlo), y por qué no se propone. */
      readonly pitido: IdaVuelta | null
      readonly motivo: 'sin-pitido' | 'no-fiable' | 'fuera-del-reloj'
    }
  | { readonly metodo: 'ninguna'; readonly pitido: IdaVuelta | null }

/** Lo que se propone con lo que haya: el pitido si es fiable y casa con el reloj; si no, el reloj; si no, nada. */
export function proponerDesfase(pitido: IdaVuelta | null, reloj: DesfaseReloj | null): PropuestaDoble {
  const casa = (p: IdaVuelta) => !reloj || Math.abs(p.desfase - reloj.desfase) <= reloj.cota + MARGEN_RELOJ_S
  if (pitido?.fiable && casa(pitido)) return { metodo: 'pitido', desfase: pitido.desfase, pitido, reloj }
  if (reloj) {
    const motivo = !pitido ? 'sin-pitido' : !pitido.fiable ? 'no-fiable' : 'fuera-del-reloj'
    return { metodo: 'reloj', desfase: reloj.desfase, reloj, pitido, motivo }
  }
  return { metodo: 'ninguna', pitido }
}

/** Cómo queda anotada la sincronía al aplicar la propuesta. */
export function sincroniaDePropuesta(p: PropuestaDoble): Sincronia {
  if (p.metodo === 'pitido') {
    return { metodo: 'pitido', pitido: { desfase: p.pitido.desfase, calidad: p.pitido.calidad, distancia: p.pitido.distancia } }
  }
  if (p.metodo === 'reloj') return { metodo: 'reloj', reloj: { desfase: p.reloj.desfase, cota: p.reloj.cota } }
  return { metodo: 'ninguna' }
}
