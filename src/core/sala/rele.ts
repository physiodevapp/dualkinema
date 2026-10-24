/*
 * Lo que decide el relé de salas (fase 4, paso 4; §3 de docs/plan-fase-4.md, D4) y los avisos que manda, en TypeScript
 * puro para probarlo sin el entorno de Cloudflare. El Worker (`senal/`) es una capa fina encima.
 *
 * El relé no entiende los mensajes de la app (`protocolo.ts`): los reenvía tal cual al otro móvil de la sala. Solo
 * decide quién entra (dos como mucho), cuánto puede mandar cada uno (tamaño y ritmo) y cuánto dura una sala, y avisa
 * de quién entra y sale. Sus avisos llevan la clave `rele` (los de la app, `tipo`), así no se confunden.
 */

export const OCUPANTES_MAXIMOS = 2
/** Mensajes por segundo y móvil sostenidos, y ráfaga: al emparejar, los pings van a 20 por segundo durante 1,5 s. */
export const RITMO_MAXIMO = 30
export const RAFAGA_MAXIMA = 60
/** Una sala se cierra a las 3 horas de abrirse, aunque siga en uso. */
export const DURACION_MAXIMA_SALA_MS = 3 * 60 * 60 * 1000

/** Códigos de cierre del WebSocket (4000–4999 son de la aplicación). */
export const CIERRE = { llena: 4001, caducada: 4002, ritmo: 4003, mensaje: 4004 } as const

export type AvisoRele =
  /** Al entrar: cuántos hay ya (contándose). */
  | { readonly rele: 'bienvenida'; readonly ocupantes: number }
  | { readonly rele: 'entra'; readonly ocupantes: number }
  | { readonly rele: 'sale'; readonly ocupantes: number }

export const textoAviso = (a: AvisoRele): string => JSON.stringify(a)

/** Un aviso del relé; null si el texto no lo es (será un mensaje de la app). */
export function leerAviso(texto: string): AvisoRele | null {
  let v: unknown
  try {
    v = JSON.parse(texto)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if ((o.rele === 'bienvenida' || o.rele === 'entra' || o.rele === 'sale') && Number.isSafeInteger(o.ocupantes) && (o.ocupantes as number) >= 0) {
    return { rele: o.rele, ocupantes: o.ocupantes as number }
  }
  return null
}

/** Cubo de fichas del ritmo de un móvil. */
export interface Cubo {
  readonly fichas: number
  /** ms del último mensaje. */
  readonly instante: number
}

/** Gasta una ficha si la hay (se reponen RITMO_MAXIMO por segundo, hasta RAFAGA_MAXIMA). */
export function gastarFicha(cubo: Cubo | null, ahora: number): { readonly permitido: boolean; readonly cubo: Cubo } {
  const previas = cubo ? Math.min(RAFAGA_MAXIMA, cubo.fichas + (Math.max(0, ahora - cubo.instante) / 1000) * RITMO_MAXIMO) : RAFAGA_MAXIMA
  if (previas < 1) return { permitido: false, cubo: { fichas: previas, instante: ahora } }
  return { permitido: true, cubo: { fichas: previas - 1, instante: ahora } }
}

/**
 * Páginas que pueden usar el relé: producción y las previsualizaciones de dualkinema, y localhost (pruebas). No es una
 * barrera contra quien no use un navegador (puede mandar cualquier `Origin`), pero evita que otra web lo use de paso.
 */
export function origenPermitido(origen: string | null): boolean {
  if (!origen) return false
  return /^https:\/\/([a-z0-9-]+-)?dualkinema\.edu-gamboa-rodriguez\.workers\.dev$/.test(origen) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen)
}
