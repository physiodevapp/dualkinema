import { CALIDAD_PITIDO_MINIMA, DISTANCIA_MAXIMA_M, DISTANCIA_MINIMA_M, VELOCIDAD_SONIDO, localizarSecuencia, type AudioMono } from '../sincronia/pitido'

/*
 * La distancia entre los dos móviles por el pitido, **antes de grabar** (fase 6, asistente de colocación; D9 de
 * docs/plan-fase-6.md). Es el pitido de ida y vuelta de la grabación doble (`core/sincronia/pitido.ts`) sin grabar vídeo:
 * los dos escuchan su micrófono unos segundos, el que lo pide pita primero (a PITA_PRIMERO_S del inicio acordado) y el otro
 * después (a PITA_SEGUNDO_S). Cada uno busca las dos secuencias en lo que oyó y cuenta al otro cuánto pasó entre la suya
 * y la del otro, en su propio reloj del audio:
 *
 *   el que pita primero (A): x_A = a₂ − a₁ = (t_B − t_A) + D/c       (a₁ la suya, a₂ la del otro)
 *   el que pita después (B): x_B = b₁ − b₂ = (t_A − t_B) + D/c       (b₂ la suya, b₁ la del otro)
 *
 *   D = c · (x_A + x_B) / 2
 *
 * No dependen del desfase entre los relojes, ni de cuándo sale de verdad el sonido de cada altavoz, ni de cuándo empieza
 * a oír cada micrófono: solo de lo que pasa dentro de cada grabación, a una muestra. El inicio acordado solo sirve para
 * buscar cada secuencia donde debe estar: las ventanas son anchas (BUSQUEDA) porque el audio del micrófono se coloca en el
 * reloj de la página con poca precisión y el altavoz suena hasta un tercio de segundo tarde.
 */

/** Cuándo pita cada uno (s desde el inicio acordado) y cuánto se escucha (s). */
export const PITA_PRIMERO_S = 0.5
export const PITA_SEGUNDO_S = 2.5
export const ESCUCHA_S = 4.2
/** Dónde se busca cada secuencia alrededor de donde debe estar: no llegan a pisarse (la primera acaba antes de 2,1 s). */
export const BUSQUEDA = { antes: 0.4, despues: 1.0 } as const
/** Margen desde la orden hasta el inicio (ms): que el otro la reciba y empiece a escuchar antes. */
export const MARGEN_INICIO_MS = 1500

/** Lo que oye un móvil: el tiempo entre su secuencia y la del otro (s, la del otro menos la suya) y la peor calidad. */
export interface MedidaPropia {
  readonly dif: number
  readonly calidad: number
}

/** Por qué no salió: no se oyó alguna secuencia, el otro no contestó o la distancia no es creíble. */
export type FalloDistancia = 'no-oido' | 'sin-respuesta' | 'sin-audio' | 'increible'
export const FALLOS_DISTANCIA: readonly FalloDistancia[] = ['no-oido', 'sin-respuesta', 'sin-audio', 'increible']

export type ResultadoDistancia = { readonly metros: number; readonly calidad: number } | { readonly fallo: FalloDistancia }

/**
 * Busca las dos secuencias en lo que oyó este móvil (`audio`, con su `inicio` en s desde el inicio acordado). null si no
 * encuentra alguna con calidad suficiente.
 */
export function medirEnEscucha(audio: AudioMono, pitaPrimero: boolean): MedidaPropia | null {
  const propia = localizarSecuencia(audio, pitaPrimero ? PITA_PRIMERO_S : PITA_SEGUNDO_S, BUSQUEDA)
  const otra = localizarSecuencia(audio, pitaPrimero ? PITA_SEGUNDO_S : PITA_PRIMERO_S, BUSQUEDA)
  if (!propia || !otra) return null
  const calidad = Math.min(propia.calidad, otra.calidad)
  if (calidad < CALIDAD_PITIDO_MINIMA) return null
  return { dif: otra.t - propia.t, calidad }
}

/** La distancia con lo que oyó cada uno (da igual el orden). */
export function distanciaEntre(a: MedidaPropia, b: MedidaPropia): ResultadoDistancia {
  const metros = (VELOCIDAD_SONIDO * (a.dif + b.dif)) / 2
  if (!(metros >= DISTANCIA_MINIMA_M && metros <= DISTANCIA_MAXIMA_M)) return { fallo: 'increible' }
  return { metros, calidad: Math.min(a.calidad, b.calidad) }
}

/** Lo que se dice («2,03 m», «no se ha oído el pitido de los dos»…). */
export const TEXTO_FALLO_DISTANCIA: Record<FalloDistancia, string> = {
  'no-oido': 'no se han oído bien los dos pitidos (sube el volumen, quita los auriculares o acerca los móviles y repite)',
  'sin-respuesta': 'el otro móvil no ha contestado (toca su pantalla una vez para que pueda sonar y repite)',
  'sin-audio': 'algún móvil no puede pitar todavía: toca su pantalla una vez (el navegador solo deja sonar tras un toque) y repite',
  increible: 'ha salido una distancia imposible (algún pitido se confundió con otro ruido): repite en silencio',
}

/** Para mandarlo en el estado y leerlo del otro (campo a campo; lo desconocido se descarta). */
export function leerResultadoDistancia(v: unknown): ResultadoDistancia | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.metros === 'number' && Number.isFinite(o.metros) && o.metros >= DISTANCIA_MINIMA_M && o.metros <= DISTANCIA_MAXIMA_M) {
    const calidad = typeof o.calidad === 'number' && Number.isFinite(o.calidad) && o.calidad >= 1 ? o.calidad : 1
    return { metros: o.metros, calidad }
  }
  if (FALLOS_DISTANCIA.includes(o.fallo as FalloDistancia)) return { fallo: o.fallo as FalloDistancia }
  return null
}
