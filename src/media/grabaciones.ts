import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny'
import { leerMetadatos, type MetadatosGrabacion } from '../core/grabacion/metadatos'
import { saltosDeFrames } from '../core/tiempo/saltos'
import { crearTablaFrames, estadisticas } from '../core/tiempo/tablaFrames'

/*
 * Grabaciones de este móvil (fase 4, paso 2; D3 de docs/plan-fase-4.md): los vídeos que graba la app se escriben en el
 * almacenamiento privado del origen (OPFS), en la carpeta `grabaciones`, sin pasar por la memoria entera. Ahí se quedan
 * hasta que se borran; nunca salen del dispositivo salvo que la persona los comparta o los guarde.
 *
 * Ojo: el navegador solo hace visible lo escrito al cerrar el archivo (escribe en un temporal). Si la app se cierra a
 * mitad de una grabación, esa grabación se pierde.
 */

const CARPETA = 'grabaciones'

export interface GrabacionGuardada {
  readonly nombre: string
  readonly tamano: number
  /** ms desde 1970 (la última escritura: al acabar de grabar). */
  readonly modificada: number
}

const carpeta = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(CARPETA, { create: true })

/** Las grabaciones, la más reciente primero. Los temporales del navegador (`.crswap`) no cuentan. */
export async function listarGrabaciones(): Promise<GrabacionGuardada[]> {
  const dir = await carpeta()
  const lista: GrabacionGuardada[] = []
  for await (const [nombre, h] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    // Las de la calibración de la cámara son temporales: no son grabaciones de la persona.
    if (h.kind !== 'file' || !nombre.endsWith('.mp4') || nombre.startsWith('calibracion-')) continue
    const f = await (h as FileSystemFileHandle).getFile()
    if (f.size > 0) lista.push({ nombre, tamano: f.size, modificada: f.lastModified })
  }
  return lista.sort((a, b) => b.modificada - a.modificada)
}

export async function abrirGrabacion(nombre: string): Promise<File> {
  const f = await (await (await carpeta()).getFileHandle(nombre)).getFile()
  return new File([f], nombre, { type: 'video/mp4', lastModified: f.lastModified })
}

export async function borrarGrabacion(nombre: string): Promise<void> {
  await (await carpeta()).removeEntry(nombre)
}

/** Un archivo nuevo para escribir una grabación. `quitar` lo borra (al cancelar o si falla). */
export async function crearArchivoGrabacion(nombre: string): Promise<{ escritor: FileSystemWritableFileStream; quitar: () => Promise<void> }> {
  const dir = await carpeta()
  const h = await dir.getFileHandle(nombre, { create: true })
  const escritor = await h.createWritable()
  return {
    escritor,
    quitar: async () => {
      await escritor.abort().catch(() => {})
      await dir.removeEntry(nombre).catch(() => {})
    },
  }
}

export interface Espacio {
  /** Bytes que quedan para la app (cuota − uso); null si el navegador no lo dice. */
  readonly libre: number | null
  /** El navegador ha concedido que no borrará estos datos con poco espacio. */
  readonly persistente: boolean
}

export async function espacio(): Promise<Espacio> {
  try {
    const e = await navigator.storage.estimate()
    const persistente = (await navigator.storage.persisted?.()) ?? false
    return { libre: e.quota !== undefined && e.usage !== undefined ? e.quota - e.usage : null, persistente }
  } catch {
    return { libre: null, persistente: false }
  }
}

export interface AnalisisGrabacion {
  readonly codec: string
  readonly ancho: number
  readonly alto: number
  readonly frames: number
  readonly fpsMediano: number
  readonly saltos: number
  readonly framesPerdidos: number
  /** Del primer al último frame (s). */
  readonly duracion: number
  readonly conAudio: boolean
  /** Los datos de dualkinema del comentario del MP4 (null: no es de la app, o no se han podido leer). */
  readonly metadatos: MetadatosGrabacion | null
}

/** Lo que de verdad hay en un archivo grabado: frames por sus pts (sin decodificar), saltos, audio y metadatos. */
export async function analizarGrabacion(archivo: File): Promise<AnalisisGrabacion> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    const pv = await entrada.getPrimaryVideoTrack()
    if (!pv) throw new Error('El archivo no tiene pista de vídeo.')
    const pts: number[] = []
    for await (const p of new EncodedPacketSink(pv).packets(undefined, undefined, { metadataOnly: true })) pts.push(p.timestamp)
    const tabla = crearTablaFrames(pts)
    const est = estadisticas(tabla)
    const s = saltosDeFrames(tabla)
    const etiquetas = await entrada.getMetadataTags().catch(() => null)
    return {
      codec: pv.codec ?? 'desconocido',
      ancho: pv.displayWidth,
      alto: pv.displayHeight,
      frames: est.frames,
      fpsMediano: 1 / s.pasoMediano,
      saltos: s.saltos,
      framesPerdidos: s.framesPerdidos,
      duracion: est.intervalo,
      conAudio: (await entrada.getPrimaryAudioTrack()) !== null,
      metadatos: leerMetadatos(etiquetas?.comment),
    }
  } finally {
    entrada.dispose()
  }
}

/** Los datos de dualkinema del comentario de un MP4 (null: no es de la app o no se pueden leer). Sin recorrer los frames. */
export async function leerMetadatosArchivo(archivo: File): Promise<MetadatosGrabacion | null> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    return leerMetadatos((await entrada.getMetadataTags().catch(() => null))?.comment)
  } catch {
    return null
  } finally {
    entrada.dispose()
  }
}
