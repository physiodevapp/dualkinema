import type { OrientacionVista } from '../geometria/canonico'

/*
 * Datos que la app escribe dentro de cada vídeo que graba (fase 4, D8 de docs/plan-fase-4.md): viajan con el archivo
 * aunque Android le cambie el nombre al compartirlo. Van como JSON en el comentario del MP4. Nada del paciente: un id
 * aleatorio, cuándo se grabó y qué se pidió a la cámara; en una grabación doble (paso 5), además, `doble`: el id común
 * de la pareja de vídeos, la vista de este móvil y su reloj (cuándo empezó en su reloj y cuánto va por delante el del
 * otro móvil, con su cota). Con eso, al abrir los dos vídeos se sabe que son pareja y, a falta del pitido, cuánto se
 * desfasan (paso 7); desde el paso 6, también cuándo pitó cada uno. `doble` es opcional: no cambia la versión del formato (un archivo sin él se lee igual).
 */

export const APP_METADATOS = 'dualkinema'
/** Versión del formato de estos datos. Una más nueva se lee igual en lo que tiene en común (los campos no cambian de sentido). */
export const FORMATO_METADATOS = 1

export interface MetadatosGrabacion {
  readonly app: typeof APP_METADATOS
  readonly formato: number
  /** Aleatorio: identifica la grabación (y, en la grabación doble, la pareja). */
  readonly id: string
  /** Inicio de la grabación, ISO 8601. */
  readonly creada: string
  /** Lo que se pidió a la cámara (lo que dio de verdad está en el propio vídeo). */
  readonly pedido: { readonly ancho: number; readonly alto: number; readonly fps: number }
  /** Solo en una grabación doble. */
  readonly doble?: DatosDoble
}

/** Lo que añade una grabación doble. Los instantes, en ms del reloj de la sala de ese móvil (`performance.now()`). */
export interface DatosDoble {
  /** Común a los dos vídeos de la pareja (aleatorio). */
  readonly id: string
  /** Cómo ve este móvil a la persona. */
  readonly vista: OrientacionVista
  /** Cuándo empezó a grabar (ms, reloj propio): el instante programado, al que arranca la grabadora. */
  readonly inicio: number
  /** reloj del otro − reloj propio (ms) con su cota, en el momento de programar; null si no había estimación. */
  readonly relojOtro: { readonly desfase: number; readonly cota: number } | null
  /** Deriva medida entre los dos relojes (ppm) con su error típico; null si no había bastante. */
  readonly deriva: { readonly ppm: number; readonly errorPpm: number } | null
  /**
   * Cuándo debía empezar la secuencia de pitidos de cada móvil (s desde el inicio; `core/sincronia/pitido.ts`), para
   * buscarlas al abrir la pareja. Opcional: las grabaciones dobles anteriores al paso 6 no pitaban.
   */
  readonly pitidos?: { readonly propio: number; readonly otro: number }
}

export const textoMetadatos = (m: MetadatosGrabacion): string => JSON.stringify(m)

const esPositivo = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0

/** Los datos de dualkinema de un comentario; null si no hay, son de otra app o están rotos. */
export function leerMetadatos(texto: string | null | undefined): MetadatosGrabacion | null {
  if (!texto) return null
  let v: unknown
  try {
    v = JSON.parse(texto)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const p = o.pedido as Record<string, unknown> | undefined
  if (o.app !== APP_METADATOS || !Number.isInteger(o.formato) || (o.formato as number) < 1) return null
  if (typeof o.id !== 'string' || o.id === '' || typeof o.creada !== 'string' || Number.isNaN(Date.parse(o.creada))) return null
  if (typeof p !== 'object' || p === null || !esPositivo(p.ancho) || !esPositivo(p.alto) || !esPositivo(p.fps)) return null
  const doble = leerDoble(o.doble)
  return {
    app: APP_METADATOS,
    formato: o.formato as number,
    id: o.id,
    creada: o.creada,
    pedido: { ancho: p.ancho, alto: p.alto, fps: p.fps },
    ...(doble ? { doble } : {}),
  }
}

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function leerVista(v: unknown): OrientacionVista | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (o.plano === 'sagital' && (o.mira === 'izquierda' || o.mira === 'derecha')) return { plano: 'sagital', mira: o.mira }
  if (o.plano === 'frontal' && (o.ve === 'delante' || o.ve === 'detras')) return { plano: 'frontal', ve: o.ve }
  return null
}

/** La parte de la grabación doble; null si no hay o no se entiende (el resto de los datos se lee igual). */
function leerDoble(v: unknown): DatosDoble | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const vista = leerVista(o.vista)
  if (typeof o.id !== 'string' || o.id === '' || !vista || !finito(o.inicio)) return null
  const r = o.relojOtro as Record<string, unknown> | null | undefined
  const d = o.deriva as Record<string, unknown> | null | undefined
  const relojOtro = r && finito(r.desfase) && finito(r.cota) && r.cota >= 0 ? { desfase: r.desfase, cota: r.cota } : null
  const deriva = d && finito(d.ppm) && finito(d.errorPpm) ? { ppm: d.ppm, errorPpm: d.errorPpm } : null
  const p = o.pitidos as Record<string, unknown> | null | undefined
  const pitidos = p && finito(p.propio) && finito(p.otro) && p.propio >= 0 && p.otro >= 0 ? { propio: p.propio, otro: p.otro } : null
  return { id: o.id, vista, inicio: o.inicio, relojOtro, deriva, ...(pitidos ? { pitidos } : {}) }
}
