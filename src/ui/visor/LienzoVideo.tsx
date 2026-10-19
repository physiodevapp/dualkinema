import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { campoLupa, LUPA, radioBusquedaLupa } from './lupa'

/** Dónde quedaría el marcador si se suelta aquí: centro del gomet y su radio, en px del vídeo. */
export type Previsualizacion = { readonly x: number; readonly y: number; readonly r: number } | null

interface Props {
  ancho: number
  alto: number
  /** Canvas donde el visor pinta el frame. */
  lienzo: RefObject<HTMLCanvasElement | null>
  /**
   * Dibuja marcadores y trayectorias sobre la capa superior, en coordenadas del
   * frame. `escala` = px del frame por px de pantalla, para dar a trazos y
   * círculos un tamaño fijo en pantalla.
   */
  dibujar: (ctx: CanvasRenderingContext2D, escala: number) => void
  /** Si se puede tocar para colocar un marcador. */
  interactivo: boolean
  /**
   * Toque final (al levantar el dedo), en px del frame. `radio`: hasta dónde
   * buscar el gomet alrededor (lo que abarca la lupa).
   */
  onToque: (x: number, y: number, radio: number) => void
  /** Mientras se arrastra: dónde caería el marcador, para dibujarlo en la lupa. */
  previsualizar?: (x: number, y: number, radio: number) => Previsualizacion
  /** Vista de vídeo grande: todo el alto libre (sin la barra de abajo ni los controles de marcado), en vez de un tope de un tercio. */
  llenar?: boolean
}

/**
 * Frame del vídeo con una capa encima para marcadores. Al tocar aparece una
 * lupa por encima del dedo (el dedo tapa el gomet) con una cruz en el punto
 * exacto; se puede arrastrar y el marcador se coloca al soltar. Si el gomet
 * se ve dentro de la lupa, un anillo marca dónde quedará (su centro); sin
 * anillo, la cruz se vuelve roja: al soltar ahí no se encontrará gomet.
 */
const variableColor = (nombre: string, defecto: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || defecto

export default function LienzoVideo({ ancho, alto, lienzo, dibujar, interactivo, onToque, previsualizar, llenar }: Props) {
  const capa = useRef<HTMLCanvasElement>(null)
  const lupa = useRef<HTMLCanvasElement>(null)
  // `campo`: lo que abarca la lupa, en px del vídeo, con el tamaño del vídeo en pantalla al tocar.
  const [punto, setPunto] = useState<{ cx: number; cy: number; x: number; y: number; campo: number } | null>(null)
  const [anchoPantalla, setAnchoPantalla] = useState(0)
  // Dónde caería el marcador: se calcula al mover el dedo, no en un efecto, para
  // que el anillo y lo que dice la lupa nunca vayan un arrastre por detrás.
  const destino = useMemo(
    () => (punto && previsualizar ? previsualizar(punto.x, punto.y, radioBusquedaLupa(punto.campo)) : null),
    [punto, previsualizar],
  )

  // Tamaño en pantalla de la capa, para la escala de los trazos.
  useEffect(() => {
    const c = capa.current
    if (!c) return
    const obs = new ResizeObserver(() => setAnchoPantalla(c.clientWidth))
    obs.observe(c)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const ctx = capa.current?.getContext('2d')
    if (!ctx || anchoPantalla === 0) return
    ctx.clearRect(0, 0, ancho, alto)
    dibujar(ctx, ancho / anchoPantalla)
  }, [dibujar, ancho, alto, anchoPantalla])

  // Contenido de la lupa: ampliación del frame alrededor del punto.
  useEffect(() => {
    const c = lupa.current?.getContext('2d')
    const fuente = lienzo.current
    if (!c || !fuente || !punto) return
    const lado = punto.campo
    const x0 = punto.x - lado / 2
    const y0 = punto.y - lado / 2
    const k = LUPA / lado // px de la lupa por px del vídeo
    c.imageSmoothingEnabled = false
    c.fillStyle = '#000'
    c.fillRect(0, 0, LUPA, LUPA)
    c.drawImage(fuente, x0, y0, lado, lado, 0, 0, LUPA, LUPA)
    if (capa.current) c.drawImage(capa.current, x0, y0, lado, lado, 0, 0, LUPA, LUPA)

    // Cruz: dónde está el dedo. Roja si al soltar ahí no se encontraría gomet.
    c.strokeStyle = destino || !previsualizar ? 'rgba(255,255,255,0.7)' : '#f87171'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(LUPA / 2, 0)
    c.lineTo(LUPA / 2, LUPA)
    c.moveTo(0, LUPA / 2)
    c.lineTo(LUPA, LUPA / 2)
    c.stroke()
    if (destino) {
      // Anillo en el gomet que se encontrará: el marcador irá a su centro.
      const cx = (destino.x - x0) * k
      const cy = (destino.y - y0) * k
      const r = destino.r * k + 5
      c.lineWidth = 4
      c.strokeStyle = '#000'
      c.beginPath()
      c.arc(cx, cy, r, 0, Math.PI * 2)
      c.stroke()
      c.lineWidth = 2
      c.strokeStyle = variableColor('--color-acento', '#f2a65a')
      c.beginPath()
      c.arc(cx, cy, r, 0, Math.PI * 2)
      c.stroke()
      c.fillStyle = c.strokeStyle
      c.beginPath()
      c.arc(cx, cy, 2.5, 0, Math.PI * 2)
      c.fill()
    }
  }, [punto, ancho, alto, lienzo, previsualizar, destino])

  const aFrame = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * ancho
    const y = ((e.clientY - rect.top) / rect.height) * alto
    return {
      cx: e.clientX,
      cy: e.clientY,
      x: Math.min(Math.max(x, 0), ancho),
      y: Math.min(Math.max(y, 0), alto),
      campo: campoLupa(ancho, alto, ancho / rect.width),
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-borde bg-black">
      <div className="relative mx-auto w-fit">
        <canvas
          ref={lienzo}
          data-testid="lienzo"
          width={ancho}
          height={alto}
          className={`block max-w-full ${llenar ? 'max-h-[calc(100dvh-var(--alto-barra)-13rem)]' : 'max-h-[30dvh] lg:max-h-[60dvh]'}`}
          style={{ aspectRatio: `${ancho} / ${alto}` }}
        />
        <canvas
          ref={capa}
          data-testid="capa"
          width={ancho}
          height={alto}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: interactivo ? 'none' : 'auto', cursor: interactivo ? 'crosshair' : 'default' }}
          onPointerDown={(e) => {
            if (!interactivo || e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            setPunto(aFrame(e))
          }}
          onPointerMove={(e) => {
            if (punto) setPunto(aFrame(e))
          }}
          onPointerUp={(e) => {
            if (!punto) return
            const p = aFrame(e)
            setPunto(null)
            onToque(p.x, p.y, radioBusquedaLupa(p.campo))
          }}
          onPointerCancel={() => setPunto(null)}
          onContextMenu={(e) => e.preventDefault()}
        />
        {punto && (
          <canvas
            ref={lupa}
            width={LUPA}
            height={LUPA}
            aria-hidden="true"
            data-testid="lupa"
            data-gomet={destino ? 'si' : 'no'}
            // Fija respecto a la pantalla: así no la recorta el recuadro del vídeo.
            className="pointer-events-none fixed z-50 rounded-full border-2 border-acento shadow-lg"
            style={{
              width: LUPA,
              height: LUPA,
              left: Math.min(Math.max(punto.cx - LUPA / 2, 8), window.innerWidth - LUPA - 8),
              // Por encima del dedo; si no cabe, por debajo.
              top: punto.cy - LUPA - 48 >= 8 ? punto.cy - LUPA - 48 : punto.cy + 48,
            }}
          />
        )}
      </div>
    </div>
  )
}
