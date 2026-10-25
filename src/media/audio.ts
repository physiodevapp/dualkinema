import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny'
import { CalculoEnvolvente, DURACION_ANALIZADA_S, mezclarMono, type Envolvente } from '../core/sincronia/envolvente'
import type { AudioMono } from '../core/sincronia/pitido'

/*
 * Lectura del audio de un vídeo para la sincronía (fase 3, paso 5): decodifica la pista con Mediabunny (WebCodecs) y
 * calcula su envolvente sobre la marcha (`core/sincronia/envolvente.ts`), sin guardar el audio crudo. Lee el archivo a
 * trozos desde el dispositivo: nunca sale de él.
 *
 * Se usa `AudioSampleSink` y no `AudioBufferSink`: `AudioBuffer` es de Web Audio, que no existe en los workers.
 *
 * Los instantes de cada trozo son los del contenedor, en la misma línea de tiempo que los pts del vídeo (la tabla de
 * frames): no se resta el principio de ninguno de los dos.
 */

export type LecturaAudio =
  | { readonly tipo: 'ok'; readonly envolvente: Envolvente }
  /** El archivo no tiene pista de audio. */
  | { readonly tipo: 'sinAudio' }
  /** Tiene audio, pero este navegador no lo decodifica. */
  | { readonly tipo: 'sinCodec'; readonly codec: string }

/** La envolvente de los primeros DURACION_ANALIZADA_S s del audio del archivo. `alProgreso`: fracción leída (0–1). */
export async function leerEnvolvente(archivo: File, alProgreso?: (fraccion: number) => void): Promise<LecturaAudio> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryAudioTrack()
    if (!pista) return { tipo: 'sinAudio' }
    if (!(await pista.canDecode())) return { tipo: 'sinCodec', codec: pista.codec ?? 'desconocido' }

    const duracion = Math.min(DURACION_ANALIZADA_S, await pista.computeDuration())
    const calculo = new CalculoEnvolvente()
    let inicio: number | null = null
    for await (const muestra of new AudioSampleSink(pista).samples()) {
      try {
        const canales: Float32Array[] = []
        for (let c = 0; c < muestra.numberOfChannels; c++) {
          const plano = new Float32Array(muestra.numberOfFrames)
          muestra.copyTo(plano, { planeIndex: c, format: 'f32-planar' })
          canales.push(plano)
        }
        calculo.anadir(mezclarMono(canales), muestra.sampleRate, muestra.timestamp)
        inicio ??= muestra.timestamp
        if (duracion > 0) alProgreso?.(Math.min(1, (muestra.timestamp + muestra.duration - inicio) / duracion))
      } finally {
        muestra.close()
      }
      if (calculo.completo) break
    }
    const envolvente = calculo.terminar()
    return envolvente ? { tipo: 'ok', envolvente } : { tipo: 'sinAudio' }
  } finally {
    entrada.dispose()
  }
}

/**
 * El audio mono de [desde, hasta) s de vídeo, sin procesar (para buscar los pitidos: `core/sincronia/pitido.ts`). null
 * si no hay audio o no se decodifica. Las muestras se colocan seguidas desde la primera (los pitidos están en unos
 * pocos segundos: no hay huecos que importen).
 */
export async function leerAudioMono(archivo: File, desde: number, hasta: number): Promise<AudioMono | null> {
  const entrada = new Input({ source: new BlobSource(archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryAudioTrack()
    if (!pista || !(await pista.canDecode())) return null
    const trozos: Float32Array[] = []
    let inicio: number | null = null
    let tasa = 0
    for await (const muestra of new AudioSampleSink(pista).samples(Math.max(0, desde), hasta)) {
      try {
        const canales: Float32Array[] = []
        for (let c = 0; c < muestra.numberOfChannels; c++) {
          const plano = new Float32Array(muestra.numberOfFrames)
          muestra.copyTo(plano, { planeIndex: c, format: 'f32-planar' })
          canales.push(plano)
        }
        trozos.push(Float32Array.from(mezclarMono(canales)))
        inicio ??= muestra.timestamp
        tasa = muestra.sampleRate
      } finally {
        muestra.close()
      }
    }
    if (inicio === null || tasa === 0) return null
    const muestras = new Float32Array(trozos.reduce((n, t) => n + t.length, 0))
    let i = 0
    for (const t of trozos) {
      muestras.set(t, i)
      i += t.length
    }
    return { inicio, tasa, muestras }
  } finally {
    entrada.dispose()
  }
}
