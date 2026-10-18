/**
 * Caché de los últimos frames decodificados, para retroceder rápido.
 *
 * Retroceder un frame obliga a decodificar desde el fotograma clave anterior
 * (200–400 ms en un móvil). Al hacerlo se guardan aquí todos los frames que
 * se decodifican de paso, así que los siguientes pasos atrás salen de la
 * caché al instante. Se descarta primero el que lleva más tiempo sin usarse.
 */
export class CacheFrames<T> {
  private readonly frames = new Map<number, T>()

  constructor(readonly capacidad: number) {}

  obtener(indice: number): T | undefined {
    const f = this.frames.get(indice)
    if (f === undefined) return undefined
    // Map recuerda el orden de inserción: reinsertar = «usado ahora».
    this.frames.delete(indice)
    this.frames.set(indice, f)
    return f
  }

  guardar(indice: number, frame: T): void {
    this.frames.delete(indice)
    this.frames.set(indice, frame)
    while (this.frames.size > this.capacidad) this.frames.delete(this.frames.keys().next().value!)
  }

  get tamano(): number {
    return this.frames.size
  }

  vaciar(): void {
    this.frames.clear()
  }
}

/** Memoria que puede ocupar la caché (cada frame es un canvas RGBA de ancho × alto). */
export const MEMORIA_CACHE = 160 * 1024 * 1024

/**
 * Cuántos frames caben según la resolución: 45 a 720p, 20 a 1080p y 8 (el
 * mínimo) a 4K; 120 como mucho (4 s a 30 fps) en vídeos pequeños. Con un
 * fotograma clave por segundo, a 1080p un paso atrás que decodifica deja
 * listos los 19 anteriores.
 */
export function capacidadCache(ancho: number, alto: number, memoria = MEMORIA_CACHE): number {
  const porFrame = Math.max(1, ancho * alto * 4)
  return Math.min(120, Math.max(8, Math.floor(memoria / porFrame)))
}
