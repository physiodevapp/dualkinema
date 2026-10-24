/*
 * Revisión de una grabación recién hecha (fase 4, paso 2): el móvil puede conceder 30 fps y entregar menos (en el
 * laboratorio, un Pixel 8 dio unos 25 en una toma y 30 en otra con la misma luz; con poca luz la exposición automática
 * se alarga y baja los fps). Se avisa en el momento, no al analizar.
 */

/** Por debajo de esta fracción de los fps pedidos se avisa. */
export const FRACCION_FPS_MINIMA = 0.9

export interface RevisionFps {
  /** Fps medianos entregados / pedidos; NaN si no se pueden medir (menos de 2 frames). */
  readonly fraccion: number
  /** Hay que avisar: por debajo de FRACCION_FPS_MINIMA o sin medida. */
  readonly bajos: boolean
}

export function revisarFps(pedidos: number, fpsMediano: number): RevisionFps {
  const fraccion = pedidos > 0 ? fpsMediano / pedidos : NaN
  return { fraccion, bajos: !(fraccion >= FRACCION_FPS_MINIMA) }
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Nombre del archivo de una grabación con la hora local de inicio: `dualkinema-2026-10-24-213205.mp4`. */
export const nombreGrabacion = (inicio: Date): string =>
  `dualkinema-${inicio.getFullYear()}-${dos(inicio.getMonth() + 1)}-${dos(inicio.getDate())}-${dos(inicio.getHours())}${dos(inicio.getMinutes())}${dos(inicio.getSeconds())}.mp4`
