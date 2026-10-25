import type { OrientacionVista } from '../geometria/canonico'

/*
 * Mensajes entre los dos móviles de una sala (fase 4, §3–5 de docs/plan-fase-4.md). Viajan por el relé de señalización,
 * que no los entiende: solo los reenvía. **Por aquí no va vídeo, ni audio, ni nada del paciente**: la vista elegida, el
 * estado de la cámara, marcas de tiempo e ids aleatorios. Por eso cada mensaje se lee campo a campo y se reconstruye
 * solo con los campos conocidos (lo que sobre se descarta), y no hay ningún texto libre.
 *
 * Los instantes van en el reloj de quien envía (`performance.now()`, ms); quien recibe los pasa al suyo con su estimación
 * del desfase (`core/reloj/desfase.ts`). Los dos móviles se hacen pings el uno al otro, así que cualquiera puede
 * programar el inicio (D8).
 */

/** Sube si un mensaje cambia de sentido o deja de leerse igual. Con versiones distintas, la app lo dice y no graba. */
export const VERSION_PROTOCOLO = 1
/** Tamaño máximo de un mensaje (bytes de texto): el relé rechaza los mayores. */
export const TAMANO_MAXIMO_MENSAJE = 2048
/** Duración máxima de una grabación programada (s), la misma que al grabar con un móvil. */
export const DURACION_MAXIMA_PROGRAMADA_S = 300

/** Por qué no se graba: lo pidió la persona, o el móvil que contesta no puede (ver `doble.ts`), o falló al grabar. */
export type MotivoCancelar = 'usuario' | 'sin-camara' | 'sin-vista' | 'sin-reloj' | 'sin-espacio' | 'tarde' | 'ocupado' | 'version' | 'fallo'

export interface EstadoMovil {
  /** Lo que da su cámara; null si no está abierta. */
  readonly camara: { readonly ancho: number; readonly alto: number; readonly fps: number } | null
  /** Espacio libre para la app (MB); null si no se sabe. */
  readonly libreMB: number | null
  /** Batería (0–1); null si no se sabe. */
  readonly bateria: number | null
  readonly grabando: boolean
}

export type Mensaje =
  /** Al entrar en la sala y al cambiar de vista. */
  | { readonly tipo: 'hola'; readonly version: number; readonly vista: OrientacionVista | null }
  | { readonly tipo: 'ping'; readonly id: number; readonly t1: number }
  | { readonly tipo: 'pong'; readonly id: number; readonly t1: number; readonly t2: number; readonly t3: number }
  | ({ readonly tipo: 'estado' } & EstadoMovil)
  /** Grabar desde `inicio` (reloj de quien envía) durante `duracion` s, o hasta que alguien pare (null). */
  | { readonly tipo: 'programar'; readonly grabacion: string; readonly inicio: number; readonly duracion: number | null }
  | { readonly tipo: 'confirmar'; readonly grabacion: string }
  /** Parar en `fin` (reloj de quien envía). */
  | { readonly tipo: 'parar'; readonly grabacion: string; readonly fin: number }
  | { readonly tipo: 'cancelar'; readonly grabacion: string; readonly motivo: MotivoCancelar }
  | { readonly tipo: 'adios' }

const MOTIVOS: readonly MotivoCancelar[] = ['usuario', 'sin-camara', 'sin-vista', 'sin-reloj', 'sin-espacio', 'tarde', 'ocupado', 'version', 'fallo']

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const entero = (x: unknown): x is number => Number.isSafeInteger(x)
/** Ids de grabación: aleatorios (UUID), sin texto libre. */
const esId = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f-]{8,64}$/i.test(x)

function leerVista(v: unknown): OrientacionVista | null | undefined {
  if (v === null) return null
  if (typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (o.plano === 'sagital' && (o.mira === 'izquierda' || o.mira === 'derecha')) return { plano: 'sagital', mira: o.mira }
  if (o.plano === 'frontal' && (o.ve === 'delante' || o.ve === 'detras')) return { plano: 'frontal', ve: o.ve }
  return undefined
}

function leerEstado(o: Record<string, unknown>): EstadoMovil | null {
  const c = o.camara as Record<string, unknown> | null | undefined
  let camara: EstadoMovil['camara'] = null
  if (c !== null) {
    if (typeof c !== 'object' || !finito(c.ancho) || !finito(c.alto) || !finito(c.fps) || c.ancho <= 0 || c.alto <= 0 || c.fps <= 0) return null
    camara = { ancho: c.ancho, alto: c.alto, fps: c.fps }
  }
  const libreMB = o.libreMB === null ? null : finito(o.libreMB) && o.libreMB >= 0 ? o.libreMB : undefined
  const bateria = o.bateria === null ? null : finito(o.bateria) && o.bateria >= 0 && o.bateria <= 1 ? o.bateria : undefined
  if (libreMB === undefined || bateria === undefined || typeof o.grabando !== 'boolean') return null
  return { camara, libreMB, bateria, grabando: o.grabando }
}

/** Un mensaje recibido; null si no se entiende (roto, demasiado grande, de un tipo desconocido o con campos inválidos). */
export function leerMensaje(texto: string): Mensaje | null {
  if (texto.length > TAMANO_MAXIMO_MENSAJE) return null
  let v: unknown
  try {
    v = JSON.parse(texto)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  switch (o.tipo) {
    case 'hola': {
      const vista = leerVista(o.vista)
      return entero(o.version) && o.version >= 1 && vista !== undefined ? { tipo: 'hola', version: o.version, vista } : null
    }
    case 'ping':
      return entero(o.id) && finito(o.t1) ? { tipo: 'ping', id: o.id, t1: o.t1 } : null
    case 'pong':
      return entero(o.id) && finito(o.t1) && finito(o.t2) && finito(o.t3) ? { tipo: 'pong', id: o.id, t1: o.t1, t2: o.t2, t3: o.t3 } : null
    case 'estado': {
      const e = leerEstado(o)
      return e ? { tipo: 'estado', ...e } : null
    }
    case 'programar': {
      const duracion = o.duracion === null ? null : finito(o.duracion) && o.duracion > 0 && o.duracion <= DURACION_MAXIMA_PROGRAMADA_S ? o.duracion : undefined
      return esId(o.grabacion) && finito(o.inicio) && duracion !== undefined ? { tipo: 'programar', grabacion: o.grabacion, inicio: o.inicio, duracion } : null
    }
    case 'confirmar':
      return esId(o.grabacion) ? { tipo: 'confirmar', grabacion: o.grabacion } : null
    case 'parar':
      return esId(o.grabacion) && finito(o.fin) ? { tipo: 'parar', grabacion: o.grabacion, fin: o.fin } : null
    case 'cancelar':
      return esId(o.grabacion) && MOTIVOS.includes(o.motivo as MotivoCancelar)
        ? { tipo: 'cancelar', grabacion: o.grabacion, motivo: o.motivo as MotivoCancelar }
        : null
    case 'adios':
      return { tipo: 'adios' }
    default:
      return null
  }
}

/** El texto de un mensaje para enviarlo. Lanza si pasa del tamaño máximo (no debería: no hay texto libre). */
export function escribirMensaje(m: Mensaje): string {
  const texto = JSON.stringify(m)
  if (texto.length > TAMANO_MAXIMO_MENSAJE) throw new Error(`Mensaje de ${texto.length} caracteres: el máximo es ${TAMANO_MAXIMO_MENSAJE}.`)
  return texto
}
