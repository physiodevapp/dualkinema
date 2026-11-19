import type { AudioMono } from '../core/sincronia/pitido'

/*
 * Escuchar el micrófono unos segundos sin grabar vídeo (la distancia entre los móviles por el pitido, antes de grabar;
 * `core/grabacion/distancia.ts`). Se lee la pista de audio de la cámara (sin cancelación de eco ni supresión de ruido:
 * `media/grabadora.ts`) con MediaStreamTrackProcessor, como al grabar (`media/captura.ts`): cada trozo llega con la marca
 * de tiempo de su captura y se coloca en ella. Así un trozo perdido deja un hueco en su sitio en lugar de correr todo lo
 * que viene detrás (con un ScriptProcessor de Web Audio, un bloque de 128 muestras perdido corría el pitido del otro
 * 2,9 ms: medio metro). Lo que importa es el tiempo entre las dos secuencias dentro de lo escuchado; dónde cae en el reloj
 * de la app solo se sabe más o menos (la marca más la menor espera entre la captura y la llegada): para buscarlas, basta.
 */

interface Trozo {
  readonly t: number
  readonly datos: Float32Array
}

/**
 * Escucha `pista` hasta `hastaMs` (en el reloj `reloj`, ms: el de la app en la sala) y lo devuelve con su `inicio` en s
 * desde `referenciaMs`. null si no llega nada (la pista muerta, sin MediaStreamTrackProcessor) o si `cancelada()` antes de
 * acabar.
 */
export async function escuchar(
  pista: MediaStreamTrack,
  hastaMs: number,
  referenciaMs: number,
  reloj: () => number = () => performance.now(),
  cancelada: () => boolean = () => false,
): Promise<AudioMono | null> {
  if (typeof MediaStreamTrackProcessor === 'undefined') return null
  // Una copia de la pista: se cierra al acabar sin tocar la de la cámara.
  const copia = pista.clone()
  const lector = new MediaStreamTrackProcessor({ track: copia }).readable.getReader() as ReadableStreamDefaultReader<AudioData>
  const guardia = setTimeout(() => void lector.cancel(), Math.max(0, hastaMs - reloj()) + 3000)
  const trozos: Trozo[] = []
  let tasa = 0
  // Del reloj de las marcas al de la app (s): la menor diferencia entre la llegada y el final de cada trozo.
  let paso = Infinity
  try {
    for (;;) {
      const { value, done } = await lector.read()
      if (done || !value) break
      const llegada = reloj()
      try {
        tasa = value.sampleRate
        const n = value.numberOfFrames
        const datos = new Float32Array(n)
        value.copyTo(datos, { planeIndex: 0, format: 'f32-planar' })
        const t = value.timestamp / 1e6
        trozos.push({ t, datos })
        paso = Math.min(paso, llegada / 1000 - (t + n / tasa))
      } finally {
        value.close()
      }
      if (cancelada()) return null
      if (llegada >= hastaMs) break
    }
  } catch {
    return null
  } finally {
    clearTimeout(guardia)
    void lector.cancel().catch(() => {})
    copia.stop()
  }
  if (!trozos.length || !(tasa > 0)) return null
  const t0 = trozos[0]!.t
  const ultimo = trozos[trozos.length - 1]!
  const muestras = new Float32Array(Math.round((ultimo.t - t0) * tasa) + ultimo.datos.length)
  for (const { t, datos } of trozos) {
    const i = Math.round((t - t0) * tasa)
    if (i < 0 || i >= muestras.length) continue
    muestras.set(datos.subarray(0, Math.max(0, Math.min(datos.length, muestras.length - i))), i)
  }
  return { inicio: t0 + paso - referenciaMs / 1000, tasa, muestras }
}
