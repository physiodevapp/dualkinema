import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { rangoY } from '../../core/graficas/rango'

export interface PuntoAngulo {
  readonly t: number
  /** Grados; NaN = hueco (no hay valor en ese instante). */
  readonly valor: number
}

interface Props {
  /** Serie del ángulo, ordenada por tiempo. */
  serie: readonly PuntoAngulo[]
  /** Primer y último instante del vídeo: el eje X siempre los abarca. */
  desde: number
  hasta: number
  /** Instante del frame actual, o null. */
  tActual: number | null
  /** El usuario toca o arrastra la gráfica: instante pedido. */
  onBuscar: (t: number) => void
}

const ALTO = 190
const FUENTE = '11px "DM Mono", ui-monospace, monospace'

const variable = (nombre: string, defecto: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || defecto

/** Posición del instante `t` en `xs` (ordenado) si hay una muestra exactamente ahí, o −1. */
function indiceExacto(xs: readonly number[], t: number): number {
  let lo = 0
  let hi = xs.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    const x = xs[m]!
    if (x === t) return m
    if (x < t) lo = m + 1
    else hi = m - 1
  }
  return -1
}

/**
 * Ángulo frente al tiempo del vídeo, en segundos. Los huecos (marcador perdido)
 * cortan la línea: nunca se unen ni se rellenan. Una línea vertical marca el
 * frame actual y, tocando o arrastrando la gráfica, el vídeo salta a ese
 * instante. El gesto vertical sigue desplazando la página.
 */
export default function GraficaAngulo({ serie, desde, hasta, tActual, onBuscar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const grafica = useRef<uPlot | null>(null)

  const datos = useMemo<uPlot.AlignedData>(() => {
    const xs = serie.map((p) => p.t)
    const ys = serie.map((p) => (Number.isFinite(p.valor) ? p.valor : null))
    // uPlot necesita al menos una muestra para dibujar los ejes.
    return xs.length ? [xs, ys] : [[desde, hasta], [null, null]]
  }, [serie, desde, hasta])

  // Lo que leen los hooks de dibujo y los manejadores sin recrear la gráfica.
  const vivo = useRef({ datos, desde, hasta, tActual, onBuscar })
  useEffect(() => {
    vivo.current = { datos, desde, hasta, tActual, onBuscar }
  })

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const acento = variable('--color-acento', '#f2a65a')
    const borde = variable('--color-borde', '#2a2f38')
    const texto = variable('--color-texto-2', '#a3a7ae')
    const ejes = { stroke: texto, font: FUENTE, grid: { stroke: borde, width: 1 }, ticks: { stroke: borde, width: 1 } }

    const u = new uPlot(
      {
        width: Math.max(el.clientWidth, 100),
        height: ALTO,
        padding: [10, 12, 0, 0],
        legend: { show: false },
        cursor: { show: false }, // el cursor es el frame actual, no el puntero
        scales: {
          x: { time: false, range: () => [vivo.current.desde, vivo.current.hasta] },
          y: { range: (_u, min, max) => rangoY([min, max]) },
        },
        axes: [
          { ...ejes, size: 28, values: (_u, v) => v.map((n) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`) },
          { ...ejes, size: 46, values: (_u, v) => v.map((n) => `${n}°`) },
        ],
        series: [
          {},
          {
            stroke: acento,
            width: 2,
            spanGaps: false, // un hueco corta la línea
            points: { size: 4, fill: acento, stroke: acento },
          },
        ],
        hooks: {
          draw: [
            (self) => {
              const { datos: d, tActual: t } = vivo.current
              if (t === null) return
              const { ctx, bbox } = self
              const x = self.valToPos(t, 'x', true)
              if (x < bbox.left || x > bbox.left + bbox.width) return
              ctx.save()
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = Math.max(1, devicePixelRatio)
              ctx.beginPath()
              ctx.moveTo(x, bbox.top)
              ctx.lineTo(x, bbox.top + bbox.height)
              ctx.stroke()
              // Punto sobre la curva, si hay valor en este frame.
              const i = indiceExacto(d[0] as number[], t)
              const v = i >= 0 ? ((d[1] as (number | null)[])[i] ?? null) : null
              if (v !== null && v !== undefined) {
                ctx.fillStyle = '#ffffff'
                ctx.strokeStyle = acento
                ctx.lineWidth = 2 * devicePixelRatio
                ctx.beginPath()
                ctx.arc(x, self.valToPos(v, 'y', true), 5 * devicePixelRatio, 0, Math.PI * 2)
                ctx.fill()
                ctx.stroke()
              }
              ctx.restore()
            },
          ],
        },
      },
      vivo.current.datos,
      el,
    )
    grafica.current = u

    // Tocar o arrastrar: salta el vídeo al instante bajo el dedo.
    const encima = u.over
    encima.style.touchAction = 'pan-y'
    encima.style.cursor = 'ew-resize'
    let arrastrando = false
    const buscar = (e: PointerEvent) => {
      const caja = encima.getBoundingClientRect()
      const x = Math.min(Math.max(e.clientX - caja.left, 0), caja.width)
      vivo.current.onBuscar(u.posToVal(x, 'x'))
    }
    const bajar = (e: PointerEvent) => {
      if (e.button !== 0) return
      arrastrando = true
      encima.setPointerCapture(e.pointerId)
      buscar(e)
    }
    const mover = (e: PointerEvent) => arrastrando && buscar(e)
    const soltar = () => (arrastrando = false)
    encima.addEventListener('pointerdown', bajar)
    encima.addEventListener('pointermove', mover)
    encima.addEventListener('pointerup', soltar)
    encima.addEventListener('pointercancel', soltar)

    const obs = new ResizeObserver(() => u.setSize({ width: Math.max(el.clientWidth, 100), height: ALTO }))
    obs.observe(el)
    return () => {
      obs.disconnect()
      u.destroy()
      grafica.current = null
    }
  }, [])

  // Datos nuevos (el seguimiento los va añadiendo) y frame actual.
  useEffect(() => {
    grafica.current?.setData(datos)
  }, [datos])
  useEffect(() => {
    grafica.current?.redraw(false, false)
  }, [tActual])

  return <div ref={contenedor} className="w-full overflow-hidden" role="img" aria-label="Gráfica del ángulo en el tiempo" />
}
