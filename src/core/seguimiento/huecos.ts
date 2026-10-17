import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { IdMarcador } from '../modelo/tipos'
import type { MotivoPerdido, Resultado } from './seguidor'

/**
 * Por qué un frame no tiene posición utilizable para un marcador: los motivos
 * del seguidor más «dudoso», una detección que el seguidor acepta para no
 * perder la continuidad (calidad ≥ CALIDAD_PERDIDO) pero que el cálculo de
 * ángulos descarta (calidad < CALIDAD_MINIMA).
 */
export type MotivoHueco = MotivoPerdido | 'dudoso'

export interface Hueco {
  readonly id: IdMarcador
  /** Primer frame sin posición utilizable. */
  readonly primero: number
  readonly frames: number
  readonly motivos: Readonly<Partial<Record<MotivoHueco, number>>>
  /** Con motivo 'tamano': rango de área (mancha / gomet) observado. */
  readonly areaMin?: number
  readonly areaMax?: number
}

/**
 * Cuenta, por marcador, los frames sin posición utilizable para el análisis.
 * Usa el mismo criterio que el cálculo de ángulos y la interfaz
 * (calidad < CALIDAD_MINIMA), para que el resumen nunca diga «sin huecos»
 * mientras la franja o la gráfica los muestran.
 */
export class RecuentoHuecos {
  private readonly porMarcador = new Map<
    IdMarcador,
    { primero: number; frames: number; motivos: Partial<Record<MotivoHueco, number>>; areaMin?: number; areaMax?: number }
  >()

  registrar(indice: number, id: IdMarcador, r: Pick<Resultado, 'calidad' | 'motivo' | 'relacionArea'>): void {
    if (r.calidad >= CALIDAD_MINIMA) return
    let h = this.porMarcador.get(id)
    if (!h) this.porMarcador.set(id, (h = { primero: indice, frames: 0, motivos: {} }))
    h.primero = Math.min(h.primero, indice)
    h.frames++
    const motivo: MotivoHueco = r.calidad > 0 ? 'dudoso' : (r.motivo ?? 'calidad')
    h.motivos[motivo] = (h.motivos[motivo] ?? 0) + 1
    if (r.relacionArea !== undefined) {
      h.areaMin = Math.min(h.areaMin ?? Infinity, r.relacionArea)
      h.areaMax = Math.max(h.areaMax ?? 0, r.relacionArea)
    }
  }

  resumen(): Hueco[] {
    return [...this.porMarcador].map(([id, h]) => ({ id, ...h }))
  }
}
