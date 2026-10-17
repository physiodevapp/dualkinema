import type { IdMarcador } from '../modelo/tipos'

/** Segmento corporal entre dos marcadores, orientado de `desde` a `hasta`. */
export interface Segmento {
  readonly desde: IdMarcador
  readonly hasta: IdMarcador
}

export type Plano = 'sagital' | 'frontal' | 'transversal'

/**
 * Definición declarativa de un ángulo articular. Todo lo que fija la
 * convención clínica está aquí, a la vista y con tests, en lugar de repartido
 * en banderas y cambios de signo dentro del cálculo.
 *
 * Cálculo: θ = ángulo con signo que hay que girar `proximal` para llevarlo a
 * `distal` alrededor del eje del plano (marco canónico, ver
 * geometria/canonico.ts), y valor = signo · θ − cero.
 *
 * Los dos segmentos se orientan en sentido distal (muslo: cadera → rodilla;
 * pierna: rodilla → tobillo), así que con los segmentos alineados θ = 0.
 */
export interface DefinicionArticulacion {
  readonly id: string
  readonly nombre: string
  readonly plano: Plano
  readonly proximal: Segmento
  readonly distal: Segmento
  /**
   * +1 si el sentido positivo (`positivo`) es un giro antihorario alrededor
   * del eje del plano; −1 si es horario.
   */
  readonly signo: 1 | -1
  /** Valor de signo · θ en la posición anatómica, que pasa a ser 0°. */
  readonly cero: number
  /** Nombre del movimiento que da valores positivos. */
  readonly positivo: string
  /** Nombre del movimiento que da valores negativos. */
  readonly negativo: string
}
