import { useEffect, useMemo, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { rangoY } from '../../core/graficas/rango'

/** Token de color de `src/styles.css` (`--color-<token>`). */
export type TokenColor = 'acento' | 'interpolado' | 'texto' | 'texto-2'

export interface SerieGrafica {
  readonly id: string
  readonly color: TokenColor
  /** Un valor por frame (alineado con `xs`); null = hueco, corta la línea. */
  readonly valores: readonly (number | null)[]
  readonly ancho?: number
  /** A trazos: lo interpolado. */
  readonly trazos?: boolean
  /** Punto en cada muestra (la serie medida). */
  readonly puntos?: boolean
  readonly visible: boolean
}

interface Props {
  /** Tiempo de cada frame, s (eje X). */
  xs: readonly number[]
  /** Series en orden de dibujo; el punto del cursor va sobre la primera visible con valor. */
  series: readonly SerieGrafica[]
  /** Primer y último instante del vídeo: el eje X siempre los abarca. */
  desde: number
  hasta: number
  /** Frame actual (índice en `xs`), o null. */
  indice: number | null
  /** Etiqueta de los valores del eje Y. */
  unidad: (v: number) => string
  /** Alto mínimo del rango Y, en las unidades de la serie. */
  altoMinimo: number
  /** Banda sombreada [desde, hasta] en el eje Y (p. ej. ±3 %), siempre a la vista. */
  banda?: readonly [number, number]
  /** Alto en px, o `'llenar'` para ocupar todo el alto de su contenedor (que tiene que tener alto propio). */
  alto: number | 'llenar'
  etiqueta: string
  testid: string
  /** El usuario toca o arrastra la gráfica: instante pedido. */
  onBuscar: (t: number) => void
}

const FUENTE = '11px "DM Mono", ui-monospace, monospace'

const color = (token: TokenColor) => getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim() || '#888'

/**
 * Una serie (o varias) frente al tiempo del vídeo, en segundos. Los huecos
 * cortan la línea: nunca se unen ni se rellenan. Una línea vertical marca el
 * frame actual y, tocando o arrastrando la gráfica, el vídeo salta a ese
 * instante. El gesto vertical sigue desplazando la página.
 */
export default function GraficaTiempo({ xs, series, desde, hasta, indice, unidad, altoMinimo, banda, alto, etiqueta, testid, onBuscar }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const grafica = useRef<uPlot | null>(null)
  const cursor = useRef<() => void>(() => {})

  const datos = useMemo<uPlot.AlignedData>(() => [xs as number[], ...series.map((s) => s.valores as (number | null)[])], [xs, series])
  // Si cambia qué series hay (no sus valores ni si se ven), se rehace la gráfica.
  const forma = series.map((s) => `${s.id}:${s.color}:${s.ancho ?? 2}:${s.trazos ? 1 : 0}:${s.puntos ? 1 : 0}`).join('|')

  // Lo que leen los hooks de dibujo y los manejadores sin recrear la gráfica.
  const vivo = useRef({ datos, series, desde, hasta, indice, unidad, altoMinimo, banda, onBuscar })
  useEffect(() => {
    vivo.current = { datos, series, desde, hasta, indice, unidad, altoMinimo, banda, onBuscar }
  })

  useEffect(() => {
    const el = contenedor.current
    if (!el) return
    const borde = color('texto-2')
    const rejilla = getComputedStyle(document.documentElement).getPropertyValue('--color-borde').trim() || '#2a2f38'
    let redibujos = 0
    // Con `'llenar'` la gráfica mide lo que mida su contenedor (y se ajusta si cambia: girar el móvil, mostrar otra serie).
    const alturaDe = () => (alto === 'llenar' ? Math.max(el.clientHeight, 60) : alto)
    const ejes = { stroke: borde, font: FUENTE, grid: { stroke: rejilla, width: 1 }, ticks: { stroke: rejilla, width: 1 } }

    const u = new uPlot(
      {
        width: Math.max(el.clientWidth, 100),
        height: alturaDe(),
        padding: [10, 12, 0, 0],
        legend: { show: false },
        cursor: { show: false }, // el cursor es el frame actual, no el puntero
        scales: {
          x: { time: false, range: () => [vivo.current.desde, vivo.current.hasta] },
          y: { range: (_u, min, max) => rangoY([min, max, ...(vivo.current.banda ?? [])], vivo.current.altoMinimo) },
        },
        axes: [
          { ...ejes, size: 28, values: (_u, v) => v.map((n) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`) },
          // En un panel bajo, ticks más juntos: si no, solo queda el 0.
          { ...ejes, size: 50, space: alturaDe() < 160 ? 18 : 30, values: (_u, v) => v.map((n) => vivo.current.unidad(n)) },
        ],
        series: [
          {},
          ...vivo.current.series.map((s) => {
            const c = color(s.color)
            return {
              stroke: c,
              width: s.ancho ?? 2,
              dash: s.trazos ? [5, 4] : undefined,
              spanGaps: false, // un hueco corta la línea
              show: s.visible,
              points: s.puntos ? { size: 4, fill: c, stroke: c } : { show: false },
            }
          }),
        ],
        hooks: {
          drawClear: [
            (self) => {
              const b = vivo.current.banda
              if (!b) return
              const { ctx, bbox } = self
              const y0 = self.valToPos(b[1], 'y', true)
              const y1 = self.valToPos(b[0], 'y', true)
              ctx.save()
              ctx.fillStyle = rejilla
              ctx.globalAlpha = 0.45
              ctx.fillRect(bbox.left, y0, bbox.width, y1 - y0)
              ctx.restore()
            },
          ],
          // Tras cada dibujo (datos nuevos, series, tamaño), el cursor vuelve a su sitio.
          draw: [
            () => {
              el.dataset.redibujos = String(++redibujos)
              cursor.current()
            },
          ],
        },
      },
      vivo.current.datos,
      el,
    )
    grafica.current = u

    // Cursor del frame actual: dos elementos encima de las curvas. Moverlos no
    // redibuja la gráfica (antes, cada cambio de frame redibujaba todas las series).
    const linea = document.createElement('div')
    linea.dataset.testid = `${testid}-cursor`
    linea.className = 'pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white will-change-transform'
    const punto = document.createElement('div')
    punto.dataset.testid = `${testid}-punto`
    punto.className = 'pointer-events-none absolute top-0 left-0 -mt-[5px] -ml-[5px] size-2.5 rounded-full border-2 bg-white will-change-transform'
    u.over.append(linea, punto)
    const colocarCursor = () => {
      const { datos: d, indice: i, series: ss } = vivo.current
      const x = i === null || i >= d[0].length ? NaN : u.valToPos(d[0][i]!, 'x')
      const dentro = Number.isFinite(x) && x >= 0 && x <= u.over.clientWidth
      linea.style.display = dentro ? '' : 'none'
      punto.style.display = 'none'
      if (!dentro) return
      linea.style.transform = `translateX(${x}px)`
      // Punto sobre la curva: la primera serie visible con valor en este frame.
      const k = ss.findIndex((s, j) => s.visible && d[j + 1]![i!] != null)
      const v = k >= 0 ? d[k + 1]![i!] : null
      if (v == null) return
      punto.style.display = ''
      punto.style.transform = `translate(${x}px, ${u.valToPos(v, 'y')}px)`
      punto.style.borderColor = `var(--color-${ss[k]!.color})`
    }
    colocarCursor()
    cursor.current = colocarCursor

    // Tocar o arrastrar: salta el vídeo al instante bajo el dedo.
    const encima = u.over
    encima.dataset.testid = `${testid}-area`
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

    const obs = new ResizeObserver(() => u.setSize({ width: Math.max(el.clientWidth, 100), height: alturaDe() }))
    obs.observe(el)
    return () => {
      obs.disconnect()
      u.destroy()
      grafica.current = null
      cursor.current = () => {}
    }
  }, [forma, alto, testid])

  // Datos nuevos (el seguimiento los va añadiendo), series que se muestran u ocultan, y frame actual.
  useEffect(() => {
    grafica.current?.setData(datos)
  }, [datos])
  const visibles = series.map((s) => (s.visible ? 1 : 0)).join('')
  useEffect(() => {
    const u = grafica.current
    if (!u) return
    vivo.current.series.forEach((s, j) => {
      if (u.series[j + 1]!.show !== s.visible) u.setSeries(j + 1, { show: s.visible })
    })
  }, [visibles])
  useEffect(() => {
    cursor.current()
  }, [indice])

  return (
    <div
      ref={contenedor}
      data-testid={testid}
      className={alto === 'llenar' ? 'absolute inset-0 overflow-hidden' : 'w-full overflow-hidden'}
      role="img"
      aria-label={etiqueta}
    />
  )
}
