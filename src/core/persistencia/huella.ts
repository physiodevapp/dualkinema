/**
 * Huella de un archivo de vídeo: lo que permite reconocerlo al volver a abrirlo
 * sin guardar el vídeo (puede pesar cientos de MB y no sale del dispositivo).
 *
 * Tamaño en bytes, número de frames y duración identifican el contenido casi
 * sin ambigüedad; el nombre no basta ni hace falta: el selector de fotos de
 * Android entrega el mismo vídeo con otro nombre («1000012345.mp4») que el
 * gestor de archivos («VID_20261017_101500.mp4»). Por eso se busca por
 * `claveHuella` (sin nombre) y el nombre solo decide si se avisa.
 */
export interface HuellaArchivo {
  readonly nombre: string
  /** Bytes. */
  readonly tamano: number
  /** Segundos. */
  readonly duracion: number
  readonly frames: number
}

/** Duración en milisegundos enteros: absorbe el ruido de coma flotante de cada lectura. */
const duracionMs = (d: number) => Math.round(d * 1000)

/** Clave de búsqueda de la huella, sin el nombre. */
export function claveHuella(h: HuellaArchivo): string {
  return `${h.tamano}:${h.frames}:${duracionMs(h.duracion)}`
}

export type Coincidencia = 'igual' | 'otroNombre' | 'distinta'

/** Compara la huella guardada con la del archivo abierto. */
export function compararHuella(guardada: HuellaArchivo, abierta: HuellaArchivo): Coincidencia {
  if (claveHuella(guardada) !== claveHuella(abierta)) return 'distinta'
  return guardada.nombre === abierta.nombre ? 'igual' : 'otroNombre'
}

/** Qué cambia entre dos huellas, para explicar por qué un archivo no es el de una sesión. */
export function diferenciasHuella(guardada: HuellaArchivo, abierta: HuellaArchivo): ('nombre' | 'tamano' | 'duracion' | 'frames')[] {
  const r: ('nombre' | 'tamano' | 'duracion' | 'frames')[] = []
  if (guardada.nombre !== abierta.nombre) r.push('nombre')
  if (guardada.tamano !== abierta.tamano) r.push('tamano')
  if (duracionMs(guardada.duracion) !== duracionMs(abierta.duracion)) r.push('duracion')
  if (guardada.frames !== abierta.frames) r.push('frames')
  return r
}

export function esHuella(v: unknown): v is HuellaArchivo {
  if (typeof v !== 'object' || v === null) return false
  const h = v as Record<string, unknown>
  return (
    typeof h.nombre === 'string' &&
    Number.isInteger(h.tamano) && (h.tamano as number) >= 0 &&
    typeof h.duracion === 'number' && Number.isFinite(h.duracion) && h.duracion >= 0 &&
    Number.isInteger(h.frames) && (h.frames as number) > 0
  )
}
