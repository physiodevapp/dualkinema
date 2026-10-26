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

/**
 * Fps de una serie de marcas de tiempo (s): frames contados entre la primera y la última. Cuenta los que faltan (un
 * frame descartado alarga la serie sin sumar), que es lo que interesa al medir si el móvil da abasto. NaN con menos de 3.
 */
export function fpsDeMarcas(marcas: readonly number[]): number {
  if (marcas.length < 3) return NaN
  const dur = marcas[marcas.length - 1]! - marcas[0]!
  return dur > 0 ? (marcas.length - 1) / dur : NaN
}

/** Por qué grabaría a pocos fps: la cámara ya da pocos (suele ser poca luz) o el codificador no da abasto. */
export type CausaFpsBajos = 'camara' | 'codificador'

export interface PrevisionFps {
  /** Los fps a los que grabaría (lo que sale del codificador). */
  readonly fps: number
  readonly bajos: boolean
  readonly causa: CausaFpsBajos | null
}

/**
 * Lo que se espera de una grabación por una prueba antes de grabar (`media/pruebaFps.ts`): los fps que da la cámara y
 * los que salen del codificador a la misma calidad. Con el mismo umbral que la revisión al parar.
 */
export function preverFps(pedidos: number, camara: number, codificados: number): PrevisionFps {
  const fps = Math.min(camara, codificados)
  const bajos = revisarFps(pedidos, fps).bajos
  const causa = !bajos ? null : revisarFps(pedidos, camara).bajos ? 'camara' : 'codificador'
  return { fps, bajos, causa }
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Nombre del archivo de una grabación con la hora local de inicio: `dualkinema-2026-10-24-213205.mp4`. */
export const nombreGrabacion = (inicio: Date): string =>
  `dualkinema-${inicio.getFullYear()}-${dos(inicio.getMonth() + 1)}-${dos(inicio.getDate())}-${dos(inicio.getHours())}${dos(inicio.getMinutes())}${dos(inicio.getSeconds())}.mp4`
