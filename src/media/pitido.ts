import { DURACION_SECUENCIA_S, LLEGADA_PREVIA_S, VENTANA_ANTES_S, VENTANA_DESPUES_S, combinarIdaVuelta, localizarSecuencia, type Deteccion, type IdaVuelta } from '../core/sincronia/pitido'
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
  const hasta = Math.max(propio, otro) + VENTANA_DESPUES_S + DURACION_SECUENCIA_S + 0.1
  const audio = await leerAudioMono(archivo, Math.min(propio, otro) - VENTANA_ANTES_S - LLEGADA_PREVIA_S - 0.1, hasta)
  if (!audio) return { propio: null, otro: null }
  return { propio: localizarSecuencia(audio, propio), otro: localizarSecuencia(audio, otro) }
}

/**
 * El pitido de ida y vuelta de una pareja (`core/sincronia/pitido.ts`): las dos secuencias en cada vídeo, cada una donde
 * dicen sus metadatos (`pitidos`: cuándo pitó este móvil y cuándo el otro). null si falta alguna de las cuatro.
 */
export async function idaVueltaDePareja(
  referencia: { readonly archivo: File; readonly pitidos: { readonly propio: number; readonly otro: number } },
  vista: { readonly archivo: File; readonly pitidos: { readonly propio: number; readonly otro: number } },
): Promise<IdaVuelta | null> {
  const [enRef, enVista] = await Promise.all([
    buscarPitidos(referencia.archivo, referencia.pitidos.propio, referencia.pitidos.otro),
    buscarPitidos(vista.archivo, vista.pitidos.propio, vista.pitidos.otro),
  ])
  if (!enRef.propio || !enRef.otro || !enVista.propio || !enVista.otro) return null
  return combinarIdaVuelta({ referenciaEnReferencia: enRef.propio, vistaEnReferencia: enRef.otro, referenciaEnVista: enVista.otro, vistaEnVista: enVista.propio })
}
