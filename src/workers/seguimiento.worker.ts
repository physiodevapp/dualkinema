/// <reference lib="webworker" />
// Recorre el vídeo desde un frame y sigue los marcadores frame a frame.
// Decodifica con su propia instancia de Mediabunny (el archivo no sale del
// dispositivo: se lee a trozos desde el File que manda el hilo principal).
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny'
import type { IdMarcador } from '../core/modelo/tipos'
import type { Imagen, LeerVentana } from '../core/seguimiento/imagen'
import { SeguidorMultiple, type Ancla } from '../core/seguimiento/multiple'
import { RecuentoHuecos } from '../core/seguimiento/huecos'
import { aprenderMarcador, ErrorMarcado, type EstadoMarcador } from '../core/seguimiento/seguidor'
import { crearTablaFrames, indiceDeFrame } from '../core/tiempo/tablaFrames'
import type { AlWorker, DelWorker, MuestraFrame } from './protocolo'

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

    const anclas = new Map<number, Map<IdMarcador, Ancla>>()
    for (const a of m.anclas) {
      if (a.indice <= m.desde) continue
      let f = anclas.get(a.indice)
      if (!f) anclas.set(a.indice, (f = new Map()))
      f.set(a.id, { x: a.x, y: a.y })
    }

    const sink = new CanvasSink(pista, { poolSize: 2 })
    let seguidor: SeguidorMultiple | null = null
    let lote: MuestraFrame[] = []
    let ultimoEnvio = performance.now()
    const huecos = new RecuentoHuecos()
    const vaciar = (indice: number) => {
      if (lote.length) enviar({ tipo: 'muestras', lote, progreso: indice / (tabla.tiempos.length - 1) })
      lote = []
      ultimoEnvio = performance.now()
    }

    for await (const frame of sink.canvases(t0)) {
      // Como en el visor: si el decodificador devolviera algún frame anterior al
      // de partida, se descarta (aprender en otro frame daría posiciones falsas).
      if (frame.timestamp < t0 - 1e-6) continue
      const indice = indiceDeFrame(tabla, frame.timestamp)
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
        enviar({ tipo: 'fin', motivo: 'cancelado', sinReconocer: [], huecos: huecos.resumen() })
        return
      }

      // Un marcador perdido no detiene el resto: se sigue buscando y, si
      // reaparece, se recupera. Sus frames sin encontrar quedan como huecos.
      const res = seguidor.procesar(frame.timestamp, leer, anclas.get(indice))
      // El t de la tabla: el mismo que usa el visor al marcar a mano y la gráfica para emparejar por t.
      lote.push({ indice, t: tabla.tiempos[indice]!, marcadores: [...res].map(([id, r]) => ({ id, x: r.x, y: r.y, calidad: r.calidad })) })
      for (const [id, r] of res) huecos.registrar(indice, id, r)
      if (performance.now() - ultimoEnvio > 150) {
        vaciar(indice)
        // Deja que llegue un posible «cancelar».
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vaciar(tabla.tiempos.length - 1)
    enviar({ tipo: 'fin', motivo: 'final', sinReconocer: [], huecos: huecos.resumen() })
  } finally {
    entrada.dispose()
  }
}
