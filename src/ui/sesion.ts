import type { OrientacionVista } from '../core/geometria/canonico'
import type { CabeceraSesion } from '../core/persistencia/esquema'
import type { HuellaArchivo } from '../core/persistencia/huella'
import type { VideoAbierto } from '../media/video'

/** Huella del vídeo abierto: nombre, tamaño, duración y número de frames. */
export function huellaDe(video: VideoAbierto): HuellaArchivo {
  return { nombre: video.info.nombre, tamano: video.info.tamano, duracion: video.info.duracion, frames: video.tabla.tiempos.length }
}

export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const textoOrientacion = (o: OrientacionVista) =>
  o.plano === 'sagital' ? `mira a la ${o.mira}` : `vista desde ${o.ve === 'delante' ? 'delante' : 'detrás'}`

/** «82 de 120 frames seguidos · 1 con marcas a mano». */
export function textoResumen(c: CabeceraSesion): string {
  const { frames, conDatos, aMano, interpolados } = c.resumen
  return `${conDatos} de ${frames} frames seguidos · ${aMano} con marcas a mano${interpolados ? ` · ${interpolados} interpolados` : ''}`
}
