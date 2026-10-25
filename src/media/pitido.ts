import { DURACION_SECUENCIA_S, VENTANA_PITIDO_S, localizarSecuencia, type Deteccion } from '../core/sincronia/pitido'
import { leerAudioMono } from './audio'

/*
 * Buscar el pitido de referencia en lo grabado (fase 4, paso 6). La forma y la búsqueda están en
 * `core/sincronia/pitido.ts`; emitirlo, en `sala/sonido.ts`.
 */

export interface PitidosGrabados {
  /** La secuencia de este móvil en su grabación; null si no se encuentra. */
  readonly propio: Deteccion | null
  /** La del otro móvil; null si no se encuentra. */
  readonly otro: Deteccion | null
}

/** Busca las dos secuencias en lo grabado (`propio` y `otro`: cuándo debía empezar cada una, en s desde el inicio). */
export async function buscarPitidos(archivo: File, propio: number, otro: number): Promise<PitidosGrabados> {
  const hasta = Math.max(propio, otro) + VENTANA_PITIDO_S + DURACION_SECUENCIA_S + 0.1
  const audio = await leerAudioMono(archivo, Math.min(propio, otro) - VENTANA_PITIDO_S - 0.1, hasta)
  if (!audio) return { propio: null, otro: null }
  return { propio: localizarSecuencia(audio, propio), otro: localizarSecuencia(audio, otro) }
}
