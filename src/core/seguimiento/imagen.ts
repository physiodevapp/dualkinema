/**
 * Imagen RGBA en memoria, sin depender del DOM (compatible con ImageData).
 * Puede ser un recorte: `x0`, `y0` es la posición de su esquina superior
 * izquierda en el frame completo, y las coordenadas de entrada y salida del
 * seguimiento son siempre del frame completo.
 */
export interface Imagen {
  readonly ancho: number
  readonly alto: number
  readonly datos: Uint8ClampedArray
  readonly x0: number
  readonly y0: number
}

/** Rectángulo en coordenadas del frame completo, en px enteros. */
export interface Ventana {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

/** Ventana cuadrada centrada en (cx, cy) de semilado `radio`, recortada al frame. */
export function ventanaAlrededor(cx: number, cy: number, radio: number, anchoFrame: number, altoFrame: number): Ventana {
  const x = Math.max(0, Math.floor(cx - radio))
  const y = Math.max(0, Math.floor(cy - radio))
  const x1 = Math.min(anchoFrame, Math.ceil(cx + radio))
  const y1 = Math.min(altoFrame, Math.ceil(cy + radio))
  return { x, y, ancho: Math.max(0, x1 - x), alto: Math.max(0, y1 - y) }
}

/**
 * Fuente de píxeles de un frame: devuelve el recorte pedido. El seguimiento
 * solo lee ventanas pequeñas, nunca el frame entero.
 */
export type LeerVentana = (v: Ventana) => Imagen
