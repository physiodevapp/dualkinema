import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import { golpesDeAudio, type Golpe, type RetrasoCamara } from '../core/grabacion/calibracion'
import { leerAudioMono } from './audio'

/*
 * La calibración del retraso de la cámara de este móvil (fase 4, paso 8; `core/grabacion/calibracion.ts`): se guarda en
 * el dispositivo (`localStorage`: es de este móvil, no de una sesión) y la grabadora la descuenta a cada frame.
 */

const CLAVE = 'dualkinema.retrasoCamara'

export interface CalibracionGuardada {
  readonly ms: number
  readonly cotaMs: number
  readonly palmadas: number
  /** ISO 8601. */
  readonly fecha: string
}

/** La calibración guardada en este móvil; null si no hay o no se entiende. */
export function leerCalibracion(): CalibracionGuardada | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Record<string, unknown> | null
    if (!v || typeof v !== 'object') return null
    const { ms, cotaMs, palmadas, fecha } = v
    if (typeof ms !== 'number' || !Number.isFinite(ms) || Math.abs(ms) > 1000) return null
    if (typeof cotaMs !== 'number' || !(cotaMs >= 0) || typeof palmadas !== 'number' || typeof fecha !== 'string') return null
    return { ms, cotaMs, palmadas, fecha }
  } catch {
    return null
  }
}

export function guardarCalibracion(r: RetrasoCamara): CalibracionGuardada {
  const c: CalibracionGuardada = { ms: r.ms, cotaMs: r.cotaMs, palmadas: r.palmadas, fecha: new Date().toISOString() }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(c))
  } catch {
    // Sin almacenamiento, vale para esta visita.
  }
  return c
}

export function borrarCalibracion() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // nada que borrar
  }
}

/** Las palmadas del audio de una grabación de calibración. */
export async function palmadasDe(archivo: File): Promise<Golpe[]> {
  const audio = await leerAudioMono(archivo, 0, 60)
  return audio ? golpesDeAudio(audio, 6) : []
}

export interface FrameVisto {
  /** s de vídeo. */
  readonly t: number
  /** La imagen, reducida (data URL). */
  readonly imagen: string
}

/** Los frames entre `desde` y `hasta` (s de vídeo), reducidos a `ancho` px, para elegir el de la palmada. */
export async function framesEntre(archivo: File, desde: number, hasta: number, ancho = 180): Promise<FrameVisto[]> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryVideoTrack()
    if (!pista) return []
    const sink = new CanvasSink(pista, { width: ancho, fit: 'contain' })
    const out: FrameVisto[] = []
    for await (const c of sink.canvases(Math.max(0, desde), hasta)) {
      if (c.timestamp < desde - 1e-6) continue
      const lienzo = c.canvas as HTMLCanvasElement | OffscreenCanvas
      const imagen =
        'toDataURL' in lienzo
          ? lienzo.toDataURL('image/jpeg', 0.7)
          : URL.createObjectURL(await (lienzo as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.7 }))
      out.push({ t: c.timestamp, imagen })
    }
    return out
  } finally {
    entrada.dispose()
  }
}
