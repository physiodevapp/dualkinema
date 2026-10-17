import { useEffect, useRef, useState, type RefObject } from 'react'

const LUPA = 128 // px en pantalla
const ZOOM = 3

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
  /** Toque final (al levantar el dedo), en px del frame. */
  onToque: (x: number, y: number) => void
}

/**
 * Frame del vídeo con una capa encima para marcadores. Al tocar aparece una
 * lupa por encima del dedo (el dedo tapa el gomet) con una cruz en el punto
 * exacto; se puede arrastrar para afinar y el marcador se coloca al soltar.
 */
export default function LienzoVideo({ ancho, alto, lienzo, dibujar, interactivo, onToque }: Props) {
  const capa = useRef<HTMLCanvasElement>(null)
  const lupa = useRef<HTMLCanvasElement>(null)
  const [punto, setPunto] = useState<{ cx: number; cy: number; x: number; y: number } | null>(null)
  const [anchoPantalla, setAnchoPantalla] = useState(0)

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
    const rect = fuente.getBoundingClientRect()
    const escala = ancho / rect.width // px del frame por px de pantalla
    const lado = (LUPA / ZOOM) * escala
    c.imageSmoothingEnabled = false
    c.fillStyle = '#000'
    c.fillRect(0, 0, LUPA, LUPA)
    c.drawImage(fuente, punto.x - lado / 2, punto.y - lado / 2, lado, lado, 0, 0, LUPA, LUPA)
    if (capa.current) c.drawImage(capa.current, punto.x - lado / 2, punto.y - lado / 2, lado, lado, 0, 0, LUPA, LUPA)
    c.strokeStyle = '#fff'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(LUPA / 2, 0)
    c.lineTo(LUPA / 2, LUPA)
    c.moveTo(0, LUPA / 2)
    c.lineTo(LUPA, LUPA / 2)
    c.stroke()
  }, [punto, ancho, lienzo])

  const aFrame = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * ancho
    const y = ((e.clientY - rect.top) / rect.height) * alto
    return { cx: e.clientX, cy: e.clientY, x: Math.min(Math.max(x, 0), ancho), y: Math.min(Math.max(y, 0), alto) }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-borde bg-black">
      <div className="relative mx-auto w-fit">
        <canvas
          ref={lienzo}
          width={ancho}
          height={alto}
          className="block max-h-[60dvh] max-w-full"
          style={{ aspectRatio: `${ancho} / ${alto}` }}
        />
        <canvas
          ref={capa}
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
            onToque(p.x, p.y)
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
