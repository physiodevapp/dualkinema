import { BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource } from 'mediabunny'
import { fpsDeMarcas } from '../core/grabacion/revision'
import { PENDIENTES_MAXIMOS } from './captura'
import { codificacionVideo, type Calidad } from './grabadora'

/*
 * A cuántos fps grabaría este móvil (fase 4, paso 9). Antes solo se sabía al parar (`revisarFps`): la tablet del usuario
 * grabó a 10 fps una prueba doble entera. Aquí se codifica lo que da la cámara durante unos segundos, con el mismo
 * códec, el mismo bitrate y la misma regla de descartar frames que al grabar (`Captura`), en memoria y sin guardar
 * nada. Da los fps de la cámara (con poca luz bajan) y los que salen del codificador (por software no da abasto).
 */

/** Lo que se deja pasar antes de contar (el codificador arranca) y lo que dura la prueba (s). */
const CALENTAR_S = 0.5
const DURACION_S = 2.5
/** Sin un frame en este tiempo, la prueba se abandona (ms). */
const SIN_FRAMES_MS = 3000

export interface ResultadoPruebaFps {
  /** Fps que da la cámara. */
  readonly camara: number
  /** Fps que salen del codificador (los frames que no se descartan). */
  readonly codificados: number
}

/** Mide; null si no se puede (sin cámara, sin códec, sin frames o cancelada con `senal`). */
export async function probarFps(flujo: MediaStream, calidad: Calidad, senal?: AbortSignal): Promise<ResultadoPruebaFps | null> {
  const original = flujo.getVideoTracks()[0]
  if (!original || original.readyState !== 'live' || typeof MediaStreamTrackProcessor !== 'function') return null
  const eleccion = await codificacionVideo(flujo, calidad).catch(() => null)
  if (!eleccion || senal?.aborted) return null
  const pista = original.clone()
  const lector = new MediaStreamTrackProcessor({ track: pista }).readable.getReader()
  const salida = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const fuente = new VideoSampleSource({ codec: eleccion.codec, bitrate: eleccion.bitrate, keyFrameInterval: 1, latencyMode: 'realtime', sizeChangeBehavior: 'contain' })
  salida.addVideoTrack(fuente)
  const pendientes = new Set<Promise<unknown>>()
  const camara: number[] = []
  const codificados: number[] = []
  let fallo = false
  const parar = () => void lector.cancel().catch(() => {})
  senal?.addEventListener('abort', parar)
  try {
    await salida.start()
    let t0: number | null = null
    for (;;) {
      let espera: ReturnType<typeof setTimeout> | undefined
      const sinFrames = new Promise<{ done: true; value: undefined }>((ok) => (espera = setTimeout(() => ok({ done: true, value: undefined }), SIN_FRAMES_MS)))
      const { value, done } = await Promise.race([lector.read(), sinFrames])
      clearTimeout(espera)
      if (done || !value || senal?.aborted || fallo) {
        value?.close()
        break
      }
      const t = value.timestamp / 1e6
      t0 ??= t
      const contar = t - t0 >= CALENTAR_S
      if (contar) camara.push(t)
      if (pendientes.size >= PENDIENTES_MAXIMOS) {
        value.close()
      } else {
        if (contar) codificados.push(t)
        const muestra = new VideoSample(value, { timestamp: t - t0 })
        const p = fuente
          .add(muestra)
          .catch(() => (fallo = true))
          .finally(() => {
            muestra.close()
            pendientes.delete(p)
          })
        pendientes.add(p)
      }
      if (t - t0 >= DURACION_S) break
    }
  } catch {
    fallo = true
  } finally {
    senal?.removeEventListener('abort', parar)
    parar()
    pista.stop()
    await Promise.allSettled([...pendientes])
    await salida.cancel().catch(() => {})
  }
  if (fallo || senal?.aborted || camara.length < 3) return null
  return { camara: fpsDeMarcas(camara), codificados: fpsDeMarcas(codificados) }
}
