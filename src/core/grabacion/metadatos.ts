/*
 * Datos que la app escribe dentro de cada vídeo que graba (fase 4, D8 de docs/plan-fase-4.md): viajan con el archivo
 * aunque Android le cambie el nombre al compartirlo. Van como JSON en el comentario del MP4. Nada del paciente: un id
 * aleatorio, cuándo se grabó y qué se pidió a la cámara. La grabación doble (pasos 5–7) añadirá el rol, la vista y el
 * reloj común con la versión del formato.
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
  return { app: APP_METADATOS, formato: o.formato as number, id: o.id, creada: o.creada, pedido: { ancho: p.ancho, alto: p.alto, fps: p.fps } }
}
