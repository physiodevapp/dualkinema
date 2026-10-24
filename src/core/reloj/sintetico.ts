import { aleatorio } from '../sincronia/sintetico'
import type { Intercambio } from './desfase'

/*
 * Intercambios sintéticos de verdad conocida para probar el reloj común (como `sincronia/sintetico.ts` con el audio).
 * El reloj local marca el tiempo real; el remoto, el real más un desfase que cambia con la deriva:
 *
 *   remoto(t) = t + desfase + deriva · 10⁻⁶ · t
 */

export interface OpcionesSimulacion {
  /** Desfase real en t = 0 (ms). */
  readonly desfase: number
  /** ppm. */
  readonly deriva?: number
  readonly n: number
  /** Entre un ping y el siguiente (ms). */
  readonly intervalo: number
  readonly inicio?: number
  /** Retardo de ida y de vuelta (ms) de cada intercambio; reciben un número aleatorio en [0, 1). */
  readonly ida: (azar: () => number) => number
  readonly vuelta: (azar: () => number) => number
  /** Lo que tarda el remoto en contestar (ms). */
  readonly proceso?: number
  readonly semilla?: number
}

export const relojRemoto = (o: Pick<OpcionesSimulacion, 'desfase' | 'deriva'>, t: number): number => t + o.desfase + (o.deriva ?? 0) * 1e-6 * t

export function simularIntercambios(o: OpcionesSimulacion): Intercambio[] {
  const azar = aleatorio(o.semilla ?? 1)
  const lista: Intercambio[] = []
  for (let k = 0; k < o.n; k++) {
    const t1 = (o.inicio ?? 0) + k * o.intervalo
    const llega = t1 + o.ida(azar)
    const sale = llega + (o.proceso ?? 0.5)
    const t4 = sale + o.vuelta(azar)
    lista.push({ t1, t2: relojRemoto(o, llega), t3: relojRemoto(o, sale), t4 })
  }
  return lista
}

/** Retardo de una red móvil: un mínimo más una cola exponencial (la mayoría cerca del mínimo, algunos muy lentos). */
export const retardoRed = (minimo: number, media: number) => (azar: () => number) => minimo - media * Math.log(1 - azar())
