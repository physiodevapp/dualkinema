/*
 * Código de una sala de emparejamiento (fase 4, D6 de docs/plan-fase-4.md): 6 caracteres de un alfabeto sin los que se
 * confunden al leerlos o escribirlos (ni 0 / O, ni 1 / I / L). 31⁶ ≈ 890 millones de combinaciones: una sala dura minutos
 * y admite dos móviles, así que adivinar una a tiempo no es realista. Se escribe en un QR como `…/?sala=CÓDIGO`.
 */

export const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LARGO_CODIGO = 6

/**
 * Un código nuevo. `aleatorios(n)` da n bytes aleatorios (en la app, `crypto.getRandomValues`). Se descartan los bytes
 * ≥ 248 (8 · 31): con el resto, cada carácter sale con la misma probabilidad.
 */
export function generarCodigo(aleatorios: (n: number) => Uint8Array): string {
  const limite = Math.floor(256 / ALFABETO_CODIGO.length) * ALFABETO_CODIGO.length
  let codigo = ''
  while (codigo.length < LARGO_CODIGO) {
    for (const b of aleatorios(LARGO_CODIGO * 2)) {
      if (b >= limite) continue
      codigo += ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]
      if (codigo.length === LARGO_CODIGO) break
    }
  }
  return codigo
}

/** El código escrito a mano (minúsculas, espacios, guiones) en su forma canónica; null si no es un código. */
export function normalizarCodigo(texto: string): string | null {
  const c = texto.replace(/[\s-]/g, '').toUpperCase()
  if (c.length !== LARGO_CODIGO) return null
  for (const ch of c) if (!ALFABETO_CODIGO.includes(ch)) return null
  return c
}

/** Para leerlo en voz alta o en pantalla: `ABC-DEF`. */
export const formatoCodigo = (codigo: string): string => `${codigo.slice(0, 3)}-${codigo.slice(3)}`

/** La dirección del QR: el mismo origen (en una previsualización, la misma) con la sala. */
export const urlDeSala = (origen: string, codigo: string): string => `${origen.replace(/\/+$/, '')}/?sala=${codigo}`

/** El código de la parte `?…` de una dirección; null si no hay o no es válido. */
export function codigoDeBusqueda(busqueda: string): string | null {
  const m = /[?&]sala=([^&#]*)/.exec(busqueda)
  if (!m) return null
  try {
    return normalizarCodigo(decodeURIComponent(m[1]!))
  } catch {
    return null
  }
}
