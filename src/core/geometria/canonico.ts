import { vec3, type Vec3 } from './vector'

/**
 * Cómo ve la cámara a la persona en una vista 2D. Se elige al crear la vista;
 * nunca se infiere de la imagen (una inferencia que cambia entre frames
 * cambiaría el signo de los ángulos sin avisar).
 *
 * - sagital: hacia qué lado de la imagen mira la persona.
 * - frontal: si la cámara la ve de frente (delante) o de espaldas (detrás).
 */
export type OrientacionVista =
  | { readonly plano: 'sagital'; readonly mira: 'izquierda' | 'derecha' }
  | { readonly plano: 'frontal'; readonly ve: 'delante' | 'detras' }

/**
 * Pasa un punto de la imagen (px, y hacia abajo) al marco canónico de la vista,
 * el único sitio donde se cambia de convención:
 *
 * - sagital: x = hacia delante de la persona, y = hacia arriba.
 *   z = x × y apunta al lado izquierdo de la persona.
 * - frontal: x = hacia la izquierda de la persona, y = hacia arriba.
 *   z = x × y apunta hacia delante de la persona.
 *
 * En ese marco el eje de giro del plano es siempre +z, así que el mismo
 * movimiento da el mismo ángulo se grabe desde un lado o desde el otro.
 */
export function aCanonico(px: number, py: number, orientacion: OrientacionVista): Vec3 {
  const espejo =
    orientacion.plano === 'sagital' ? orientacion.mira === 'izquierda' : orientacion.ve === 'detras'
  return vec3(espejo ? -px : px, -py)
}

/** Eje de giro del plano de la vista en el marco canónico. */
export const NORMAL_CANONICA: Vec3 = vec3(0, 0, 1)
