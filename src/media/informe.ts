/*
 * Texto del informe del laboratorio (fase 4, paso 1): lo que da cada móvil, en un texto que se pega tal cual en el chat.
 * Puro, sin DOM. Un informe es un objeto de secciones; cada valor es un número, texto, booleano, lista o un objeto más.
 */

export type ValorInforme = string | number | boolean | null | undefined | readonly ValorInforme[] | { readonly [clave: string]: ValorInforme }

const esObjeto = (v: ValorInforme): v is { readonly [clave: string]: ValorInforme } => typeof v === 'object' && v !== null && !Array.isArray(v)

function escalar(v: ValorInforme): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return String(v)
}

/** Una lista de valores sencillos va en una línea; una de objetos, un elemento por bloque. */
const esListaSencilla = (v: readonly ValorInforme[]): boolean => v.every((x) => !esObjeto(x) && !Array.isArray(x))

function lineas(v: ValorInforme, sangria: string, salida: string[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (esObjeto(x)) {
        salida.push(`${sangria}[${i + 1}]`)
        lineas(x, sangria + '  ', salida)
      } else salida.push(`${sangria}- ${escalar(x)}`)
    })
    return
  }
  if (!esObjeto(v)) {
    salida.push(`${sangria}${escalar(v)}`)
    return
  }
  for (const [clave, valor] of Object.entries(v)) {
    if (Array.isArray(valor) && esListaSencilla(valor)) {
      salida.push(`${sangria}${clave}: ${valor.length ? valor.map(escalar).join(', ') : '(ninguno)'}`)
    } else if (esObjeto(valor) || Array.isArray(valor)) {
      salida.push(`${sangria}${clave}:`)
      lineas(valor, sangria + '  ', salida)
    } else salida.push(`${sangria}${clave}: ${escalar(valor)}`)
  }
}

/** El informe como texto: cada sección con su título en una línea y sus datos sangrados debajo. */
export function formatearInforme(informe: { readonly [seccion: string]: ValorInforme }): string {
  const salida: string[] = []
  for (const [titulo, datos] of Object.entries(informe)) {
    if (salida.length) salida.push('')
    salida.push(`## ${titulo}`)
    lineas(datos, '', salida)
  }
  return salida.join('\n')
}
