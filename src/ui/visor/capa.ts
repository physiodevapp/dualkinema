import type { Punto2D } from '../../core/calibracion/escala'
import type { LeerVentana } from '../../core/seguimiento/imagen'

export function lectorDeCanvas(c: HTMLCanvasElement | OffscreenCanvas): LeerVentana {
  const ctx = (c as HTMLCanvasElement).getContext('2d')
  if (!ctx) throw new Error('No se pueden leer los píxeles del frame.')
  return (v) => {
    const d = ctx.getImageData(v.x, v.y, Math.max(1, v.ancho), Math.max(1, v.alto))
    return { ancho: d.width, alto: d.height, datos: d.data, x0: v.x, y0: v.y }
  }
}

/**
 * Segmento de la escala sobre el vídeo: línea a trazos entre los extremos y,
 * en cada uno, una cruz con el centro libre para ver el punto exacto.
 */
export function dibujarSegmentoEscala(ctx: CanvasRenderingContext2D, base: number, a: Punto2D | null, b: Punto2D | null) {
  const acento = getComputedStyle(document.documentElement).getPropertyValue('--color-acento').trim() || '#f2a65a'
  const trazo = (color: string, ancho: number, f: () => void) => {
    ctx.strokeStyle = color
    ctx.lineWidth = ancho
    ctx.beginPath()
    f()
    ctx.stroke()
  }
  if (a && b) {
    ctx.setLineDash([base * 3, base * 2])
    trazo('#000', base * 1.2, () => (ctx.moveTo(a.x, a.y), ctx.lineTo(b.x, b.y)))
    trazo(acento, base * 0.6, () => (ctx.moveTo(a.x, a.y), ctx.lineTo(b.x, b.y)))
    ctx.setLineDash([])
  }
  for (const p of [a, b]) {
    if (!p) continue
    const cruz = () => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        ctx.moveTo(p.x + dx * base * 1.5, p.y + dy * base * 1.5)
        ctx.lineTo(p.x + dx * base * 6, p.y + dy * base * 6)
      }
    }
    trazo('#000', base * 1.2, cruz)
    trazo(acento, base * 0.6, cruz)
  }
}
