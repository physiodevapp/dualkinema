/// <reference lib="webworker" />
// Recorre el vídeo desde un frame y sigue los marcadores frame a frame.
// Decodifica con su propia instancia de Mediabunny (el archivo no sale del
// dispositivo: se lee a trozos desde el File que manda el hilo principal).
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny'
import type { IdMarcador } from '../core/modelo/tipos'
import type { Imagen, LeerVentana } from '../core/seguimiento/imagen'
import { SeguidorMultiple } from '../core/seguimiento/multiple'
import { aprenderMarcador, ErrorMarcado, type EstadoMarcador, type MotivoPerdido } from '../core/seguimiento/seguidor'
import { crearTablaFrames, indiceEnTiempo } from '../core/tiempo/tablaFrames'
import type { AlWorker, DelWorker, Hueco, MuestraFrame } from './protocolo'

declare const self: DedicatedWorkerGlobalScope

let cancelado = false
const enviar = (m: DelWorker) => self.postMessage(m)

self.onmessage = (e: MessageEvent<AlWorker>) => {
  const m = e.data
  if (m.tipo === 'cancelar') cancelado = true
  else {
    cancelado = false
    seguirVideo(m).catch((err: unknown) => enviar({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) }))
  }
}

function lectorDe(canvas: OffscreenCanvas | HTMLCanvasElement): LeerVentana {
  const ctx = (canvas as OffscreenCanvas).getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pueden leer los píxeles del frame.')
  return (v) => {
    const d = ctx.getImageData(v.x, v.y, Math.max(1, v.ancho), Math.max(1, v.alto))
    return { ancho: d.width, alto: d.height, datos: d.data, x0: v.x, y0: v.y } satisfies Imagen
  }
}

async function seguirVideo(m: Extract<AlWorker, { tipo: 'seguir' }>) {
  const entrada = new Input({ source: new BlobSource(m.archivo), formats: ALL_FORMATS })
  try {
    const pista = await entrada.getPrimaryVideoTrack()
    if (!pista) throw new Error('El archivo no tiene pista de vídeo.')
    const pts: number[] = []
    for await (const p of new EncodedPacketSink(pista).packets(undefined, undefined, { metadataOnly: true })) pts.push(p.timestamp)
    const tabla = crearTablaFrames(pts)
    const ancho = pista.displayWidth
    const alto = pista.displayHeight
    const t0 = tabla.tiempos[m.desde]
    if (t0 === undefined) throw new Error(`No hay frame ${m.desde}.`)

    const sink = new CanvasSink(pista, { poolSize: 2 })
    let seguidor: SeguidorMultiple | null = null
    let lote: MuestraFrame[] = []
    let ultimoEnvio = performance.now()
    const huecos = new Map<IdMarcador, { primero: number; frames: number; motivos: Partial<Record<MotivoPerdido, number>>; areaMin?: number; areaMax?: number }>()
    const resumen = (): Hueco[] => [...huecos].map(([id, h]) => ({ id, ...h }))
    const vaciar = (indice: number) => {
      if (lote.length) enviar({ tipo: 'muestras', lote, progreso: indice / (tabla.tiempos.length - 1) })
      lote = []
      ultimoEnvio = performance.now()
    }

    for await (const frame of sink.canvases(t0)) {
      const indice = indiceEnTiempo(tabla, frame.timestamp)
      const leer = lectorDe(frame.canvas)

      if (!seguidor) {
        // Primer frame: aprende cada gomet en su posición conocida.
        const iniciales = new Map<IdMarcador, EstadoMarcador>()
        const sinReconocer: IdMarcador[] = []
        for (const p of m.posiciones) {
          try {
            iniciales.set(p.id, aprenderMarcador(leer, ancho, alto, frame.timestamp, p.x, p.y).estado)
          } catch (err) {
            if (!(err instanceof ErrorMarcado)) throw err
            sinReconocer.push(p.id)
          }
        }
        if (sinReconocer.length) {
          enviar({ tipo: 'fin', motivo: 'inicio', sinReconocer, huecos: [] })
          return
        }
        seguidor = new SeguidorMultiple(iniciales, ancho, alto)
        continue
      }

      if (cancelado) {
        vaciar(indice)
        enviar({ tipo: 'fin', motivo: 'cancelado', sinReconocer: [], huecos: resumen() })
        return
      }

      // Un marcador perdido no detiene el resto: se sigue buscando y, si
      // reaparece, se recupera. Sus frames sin encontrar quedan como huecos.
      const res = seguidor.procesar(frame.timestamp, leer)
      lote.push({ indice, t: frame.timestamp, marcadores: [...res].map(([id, r]) => ({ id, x: r.x, y: r.y, calidad: r.calidad })) })
      for (const [id, r] of res) {
        if (r.calidad > 0) continue
        let h = huecos.get(id)
        if (!h) huecos.set(id, (h = { primero: indice, frames: 0, motivos: {} }))
        h.frames++
        const motivo = r.motivo ?? 'calidad'
        h.motivos[motivo] = (h.motivos[motivo] ?? 0) + 1
        if (r.relacionArea !== undefined) {
          h.areaMin = Math.min(h.areaMin ?? Infinity, r.relacionArea)
          h.areaMax = Math.max(h.areaMax ?? 0, r.relacionArea)
        }
      }
      if (performance.now() - ultimoEnvio > 150) {
        vaciar(indice)
        // Deja que llegue un posible «cancelar».
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vaciar(tabla.tiempos.length - 1)
    enviar({ tipo: 'fin', motivo: 'final', sinReconocer: [], huecos: resumen() })
  } finally {
    entrada.dispose()
  }
}
