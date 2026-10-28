import type { IdMarcador } from '../modelo/tipos'

/** Segmento corporal entre dos marcadores, orientado de `desde` a `hasta`. */
export interface Segmento {
  readonly desde: IdMarcador
  readonly hasta: IdMarcador
}

/**
 * Una dirección fija del marco de la vista en lugar de un segmento, para los ángulos absolutos (fase 5: inclinación del
 * tronco, oblicuidad de la pelvis). En el marco canónico (geometria/canonico.ts): vertical = +y (hacia arriba);
 * horizontal = +x (hacia delante de la persona de perfil; hacia su izquierda de frente). El espejo de la vista ya lo
 * quita el marco, así que el mismo gesto da el mismo ángulo desde un lado o desde el otro.
 */
export interface Referencia {
  readonly referencia: 'vertical' | 'horizontal'
}

export const esReferencia = (s: Segmento | Referencia): s is Referencia => 'referencia' in s

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
 *
 * Un ángulo absoluto (el de un segmento respecto a la vertical o la horizontal)
 * lleva una `Referencia` en `proximal`.
 */
export interface DefinicionArticulacion {
  readonly id: string
  readonly nombre: string
  readonly plano: Plano
  readonly proximal: Segmento | Referencia
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

/** Los segmentos de una articulación que van entre marcadores (sin la referencia de un ángulo absoluto). */
export const segmentosDeArticulacion = (def: DefinicionArticulacion): Segmento[] =>
  esReferencia(def.proximal) ? [def.distal] : [def.proximal, def.distal]

/** Los marcadores que usa una articulación, sin repetir. */
export const marcadoresDeArticulacion = (def: DefinicionArticulacion): IdMarcador[] => [
  ...new Set(segmentosDeArticulacion(def).flatMap((s) => [s.desde, s.hasta])),
]
