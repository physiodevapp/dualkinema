/*
 * Lo que decide el relé de salas (fase 4, paso 4; §3 de docs/plan-fase-4.md, D4) y los avisos que manda, en TypeScript
 * puro para probarlo sin el entorno de Cloudflare. El Worker (`senal/`) es una capa fina encima.
 *
 * El relé no entiende los mensajes de la app (`protocolo.ts`): los reenvía tal cual a los demás de la sala. Solo
 * decide quién entra (dos móviles y un mando como mucho), cuánto puede mandar cada uno (tamaño y ritmo) y cuánto dura una
 * sala, y avisa de quién entra y sale. Sus avisos llevan la clave `rele` (los de la app, `tipo`), así no se confunden.
 *
 * El **mando** (un ordenador que maneja los dos móviles; entra con `?rol=mando`) no cuenta como móvil: `entra`, `sale` y
 * los `ocupantes` de la bienvenida hablan solo de móviles (un móvil no lo confunde con el otro), y su llegada y su salida
 * van en un aviso aparte (`mando`), que un móvil de antes ignora.
 */

/** Móviles por sala (los que graban). */
export const OCUPANTES_MAXIMOS = 2
/** Mandos por sala. */
export const MANDOS_MAXIMOS = 1

export type Rol = 'movil' | 'mando'

/** El rol de quien se conecta, por la dirección (`/sala/<código>?rol=mando`); sin decirlo, un móvil. */
export function rolDeUrl(url: string): Rol {
  const consulta = url.split('#')[0]!.split('?')[1] ?? ''
  return consulta.split('&').includes('rol=mando') ? 'mando' : 'movil'
}

/** Si cabe uno más de ese rol, con los que ya hay. */
export const cabe = (rol: Rol, moviles: number, mandos: number): boolean => (rol === 'mando' ? mandos < MANDOS_MAXIMOS : moviles < OCUPANTES_MAXIMOS)
/** Mensajes por segundo y móvil sostenidos, y ráfaga: al emparejar, los pings van a 20 por segundo durante 1,5 s. */
export const RITMO_MAXIMO = 30
export const RAFAGA_MAXIMA = 60
/** Una sala se cierra a las 3 horas de abrirse, aunque siga en uso. */
export const DURACION_MAXIMA_SALA_MS = 3 * 60 * 60 * 1000

/** Códigos de cierre del WebSocket (4000–4999 son de la aplicación). */
export const CIERRE = { llena: 4001, caducada: 4002, ritmo: 4003, mensaje: 4004 } as const

export type AvisoRele =
  /** Al entrar: cuántos móviles hay ya (contándose si es un móvil) y si hay un mando. */
  | { readonly rele: 'bienvenida'; readonly ocupantes: number; readonly mando?: boolean }
  /** Entra o sale un móvil: cuántos móviles quedan. */
  | { readonly rele: 'entra'; readonly ocupantes: number }
  | { readonly rele: 'sale'; readonly ocupantes: number }
  /** Entra o sale el mando (a los móviles). */
  | { readonly rele: 'mando'; readonly presente: boolean; readonly ocupantes: number }

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
  if (!Number.isSafeInteger(o.ocupantes) || (o.ocupantes as number) < 0) return null
  const ocupantes = o.ocupantes as number
  if (o.rele === 'bienvenida') return typeof o.mando === 'boolean' ? { rele: o.rele, ocupantes, mando: o.mando } : { rele: o.rele, ocupantes }
  if (o.rele === 'entra' || o.rele === 'sale') return { rele: o.rele, ocupantes }
  if (o.rele === 'mando' && typeof o.presente === 'boolean') return { rele: 'mando', presente: o.presente, ocupantes }
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
