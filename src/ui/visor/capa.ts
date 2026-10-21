import type { DefinicionArticulacion } from '../../core/articulaciones/definicion'
import type { CalibracionVista, medirEntreMarcadores, Punto2D } from '../../core/calibracion/escala'
import type { IdMarcador, Muestra2D } from '../../core/modelo/tipos'
import type { LeerVentana } from '../../core/seguimiento/imagen'
import type { TrayectoriaFiltrada } from '../../core/filtros/tramos'
import { polilineasTrayectoria } from '../../core/graficas/trayectoria'
import { COLORES_MARCADOR } from '../marcadores'
import type { BorradorEscala } from './PanelEscala'

const ESTELA = 20 // frames de trayectoria dibujados por detrás, en el sentido en que se recorre el vídeo

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

/** Un `Path2D` continuo y otro a trazos (lo interpolado) por marcador: la trayectoria completa, ya preparada para pintar. */
export type CaminosTrayectoria = ReadonlyMap<IdMarcador, { continuo: Path2D; trazos: Path2D }>

/**
 * Trayectoria completa de cada marcador, con lo filtrado: se prepara al encenderla y cuando cambian las trayectorias o
 * el corte; en cada frame solo se pinta. Vacía si `activa` es falso.
 */
export function caminosTrayectoria(porMarcador: ReadonlyMap<IdMarcador, TrayectoriaFiltrada>, activa: boolean): CaminosTrayectoria {
  const r = new Map<IdMarcador, { continuo: Path2D; trazos: Path2D }>()
  if (!activa) return r
  for (const [id, f] of porMarcador) {
    const c = { continuo: new Path2D(), trazos: new Path2D() }
    for (const l of polilineasTrayectoria(f.posiciones)) {
      const camino = l.interpolado ? c.trazos : c.continuo
      const [p0, ...resto] = l.puntos
      camino.moveTo(p0!.x, p0!.y)
      // Un punto suelto se ve como un punto (extremo redondeado).
      if (resto.length === 0) camino.lineTo(p0!.x, p0!.y)
      for (const q of resto) camino.lineTo(q.x, q.y)
    }
    r.set(id, c)
  }
  return r
}

/** Lo que `dibujarCapa` necesita del visor (valores del frame mostrado, de las trayectorias y de la escala). */
export interface EstadoCapa {
  /** Frame mostrado (null mientras se decodifica el primero: no se dibuja nada). */
  readonly mostrado: number | null
  /** Sentido de la última navegación: la estela va por detrás del marcador. */
  readonly sentido: 1 | -1
  readonly total: number
  readonly ids: readonly IdMarcador[]
  readonly muestra: (id: IdMarcador, i: number) => Muestra2D | undefined
  /** ¿Posición utilizable para el análisis? (`CALIDAD_MINIMA`.) */
  readonly valida: (m: Muestra2D | undefined) => m is Muestra2D
  readonly articulacion: DefinicionArticulacion
  readonly trayectoriaCompleta: boolean
  readonly conTrayectoria: ReadonlySet<IdMarcador>
  readonly caminos: CaminosTrayectoria
  readonly borrador: BorradorEscala | null
  readonly medicion: ReturnType<typeof medirEntreMarcadores> | null
  readonly calibracion: CalibracionVista | null
  readonly frameCalibracion: number | null
}

/**
 * Capa de dibujo sobre el vídeo: segmentos de la articulación, trayectoria completa, estela, marcadores y la escala
 * (mientras se calibra, y la guardada en el frame en que se marcó). `escala`: px del vídeo por px de pantalla.
 */
export function dibujarCapa(
  ctx: CanvasRenderingContext2D,
  escala: number,
  { mostrado, sentido, total, ids, muestra, valida, articulacion, trayectoriaCompleta, conTrayectoria, caminos, borrador, medicion, calibracion, frameCalibracion }: EstadoCapa,
) {
    if (mostrado === null) return
    const base = 2 * escala // 2 px de pantalla
    // Segmentos de la articulación.
    const p = (id: IdMarcador) => muestra(id, mostrado)
    ctx.lineCap = 'round'
    for (const s of [articulacion.proximal, articulacion.distal]) {
      const a = p(s.desde)
      const b = p(s.hasta)
      if (!valida(a) || !valida(b)) continue
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = base
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ids.forEach((id, k) => {
      const color = COLORES_MARCADOR[k % COLORES_MARCADOR.length]!
      // Trayectoria completa (con lo filtrado), ya preparada: aquí solo se pinta.
      const camino = trayectoriaCompleta && conTrayectoria.has(id) ? caminos.get(id) : undefined
      if (camino) {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = base * 0.75
        ctx.lineJoin = 'round'
        ctx.globalAlpha = 0.9
        ctx.stroke(camino.continuo)
        ctx.setLineDash([base * 2, base * 1.5])
        ctx.stroke(camino.trazos)
        ctx.restore()
      }
      // Estela de los últimos frames recorridos.
      ctx.strokeStyle = color
      ctx.lineWidth = base * 0.6
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      let empezado = false
      const desde = sentido > 0 ? Math.max(0, mostrado - ESTELA) : mostrado
      const hasta = sentido > 0 ? mostrado : Math.min(total - 1, mostrado + ESTELA)
      for (let i = desde; i <= hasta; i++) {
        const m = muestra(id, i)
        if (!valida(m)) {
          empezado = false
          continue
        }
        if (empezado) ctx.lineTo(m.x, m.y)
        else ctx.moveTo(m.x, m.y)
        empezado = true
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      const m = muestra(id, mostrado)
      if (!valida(m)) return
      ctx.lineWidth = base
      ctx.strokeStyle = '#000'
      ctx.beginPath()
      ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = base * 0.7
      // Interpolado: círculo a trazos (no es una detección).
      if (m.interpolado) ctx.setLineDash([base * 1.5, base * 1.5])
      ctx.beginPath()
      ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      if (m.editadoManual) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(m.x, m.y, base * 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    // Escala: mientras se calibra, y la guardada en el frame en que se marcó.
    const segmento = borrador
      ? borrador.objeto === 'marcadores'
        ? medicion?.ok
          ? medicion
          : null
        : borrador
      : calibracion && mostrado === frameCalibracion
        ? calibracion
        : null
    if (segmento) dibujarSegmentoEscala(ctx, base, segmento.a, segmento.b)
}
