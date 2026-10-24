import type { OrientacionVista } from '../core/geometria/canonico'
import type { Lado } from '../core/articulaciones/catalogo'

/**
 * Colores para dibujar los marcadores sobre el vídeo (Okabe-Ito, distinguibles
 * con daltonismo). Se evita el verde, que es un color habitual de gomet.
 */
export const COLORES_MARCADOR = ['#E69F00', '#56B4E9', '#CC79A7', '#F0E442', '#D55E00'] as const

/**
 * Pierna que ve la cámara en una vista sagital: si la persona mira hacia la
 * derecha de la imagen, la cámara ve su lado derecho, y al revés (como quien
 * cruza un escenario hacia la derecha del público: le enseña su lado derecho).
 * Lo fija `marcadores.test.ts`: de esta pierna sale el signo del FPPA.
 */
export function ladoVisible(o: Extract<OrientacionVista, { plano: 'sagital' }>): Lado {
  return o.mira === 'derecha' ? 'der' : 'izq'
}

/** Nombre corto para los botones: lo que va antes del paréntesis, sin «mayor», etc. */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/\s*\(.*\)$/, '').replace(/\s+(mayor|femoral lateral|lateral)$/, '')
}

/** Pierna que ve la cámara de una vista; en una vista que no es sagital (de frente) no hay lado visible y se toma la izquierda. */
export const ladoDeVista = (o: OrientacionVista): Lado => (o.plano === 'sagital' ? ladoVisible(o) : 'izq')
