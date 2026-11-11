import { leerEncuadre, type Encuadre } from '../grabacion/encuadre'
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
 *
 * **El mando** (un ordenador en la misma sala, `?rol=mando` en el relé): no graba ni hace pings; oye lo que mandan los
 * móviles (cada uno se presenta con un id aleatorio, `movil`, en `hola` y `estado`, para distinguirlos) y les manda
 * `orden`es dirigidas a uno (`para`), que este ejecuta como si se hubiera pulsado en él. Un móvil de antes las ignora.
 */

/** Sube si un mensaje cambia de sentido o deja de leerse igual. Con versiones distintas, la app lo dice y no graba. */
export const VERSION_PROTOCOLO = 1
/** Tamaño máximo de un mensaje (bytes de texto): el relé rechaza los mayores. */
export const TAMANO_MAXIMO_MENSAJE = 2048
/** Duración máxima de una grabación programada (s), la misma que al grabar con un móvil. */
export const DURACION_MAXIMA_PROGRAMADA_S = 300

/** Por qué no se graba: lo pidió la persona, o el móvil que contesta no puede (ver `doble.ts`), o falló al grabar. */
export type MotivoCancelar = 'usuario' | 'sin-camara' | 'sin-vista' | 'sin-reloj' | 'sin-espacio' | 'tarde' | 'ocupado' | 'version' | 'fallo'

/** Por qué un móvil no ha hecho lo que le pidió el mando (programar la grabación). */
export type MotivoRechazo = 'sin-camara' | 'sin-otro' | 'sin-vista' | 'sin-reloj' | 'ocupado'
const RECHAZOS: readonly MotivoRechazo[] = ['sin-camara', 'sin-otro', 'sin-vista', 'sin-reloj', 'ocupado']

export interface EstadoMovil {
  /** Lo que da su cámara; null si no está abierta. */
  readonly camara: { readonly ancho: number; readonly alto: number; readonly fps: number } | null
  /** Espacio libre para la app (MB); null si no se sabe. */
  readonly libreMB: number | null
  /** Batería (0–1); null si no se sabe. */
  readonly bateria: number | null
  readonly grabando: boolean
  /** Cómo codifica el vídeo (paso 6): por software no llega a 30 fps. null si no se sabe (o el otro es anterior). */
  readonly codificador: 'hardware' | 'software' | null
  /** Tiene unos auriculares o un micrófono externo conectados (paso 6). null si no se sabe. */
  readonly microExterno: boolean | null
  /** A cuántos fps grabaría, medido con una prueba antes de grabar (paso 9; `media/pruebaFps.ts`). null si no se sabe. */
  readonly fpsGrabacion: number | null
  /** Su inclinación en directo (fase 6, paso 6; `core/grabacion/colocacion.ts`). null si no se sabe (o el otro es anterior). */
  readonly inclinacion: { readonly cabeceo: number; readonly alabeo: number } | null
  /** Si su cámara ve a la persona entera (`core/grabacion/encuadre.ts`); null si no lo está comprobando. */
  readonly encuadre: Encuadre | null
  /** Pide al otro que compruebe también el encuadre (lo activó en él). */
  readonly pideEncuadre: boolean
  /** La cota de su reloj común con el otro (ms), para el mando; null si aún no está medido (o el móvil es anterior). */
  readonly reloj: number | null
  /**
   * Si entró en la sala antes que el otro (normalmente, el que la creó): el mando lo pone como «Móvil 1», y cada móvil dice
   * qué número es en el mando. null si no se sabe (o el móvil es anterior).
   */
  readonly primero: boolean | null
  /**
   * La última orden del mando que no pudo hacer, con su motivo y un contador (cambia con cada rechazo, para que el mando
   * sepa si es de ahora). null si no ha rechazado ninguna (o el móvil es anterior).
   */
  readonly rechazo: { readonly motivo: MotivoRechazo; readonly n: number } | null
}

/** Solo los campos del estado de un móvil (de un mensaje `estado`, sin `tipo` ni `movil`). */
export const soloEstado = (m: EstadoMovil): EstadoMovil => ({
  camara: m.camara,
  libreMB: m.libreMB,
  bateria: m.bateria,
  grabando: m.grabando,
  codificador: m.codificador,
  microExterno: m.microExterno,
  fpsGrabacion: m.fpsGrabacion,
  inclinacion: m.inclinacion,
  encuadre: m.encuadre,
  pideEncuadre: m.pideEncuadre,
  reloj: m.reloj,
  primero: m.primero,
  rechazo: m.rechazo,
})

/** Lo que el mando pide a un móvil. */
export type Orden =
  /** Programar la grabación de los dos (como «Grabar» en él): cuenta atrás (s) y duración (s; null, hasta parar). */
  | { readonly orden: 'programar'; readonly cuentaAtras: number; readonly duracion: number | null }
  /** Parar la grabación de los dos, o cancelar la cuenta atrás. */
  | { readonly orden: 'parar' }
  /** Empezar o dejar de comprobar el encuadre (por voz, en ese móvil; pide al otro que compruebe también). */
  | { readonly orden: 'encuadre'; readonly activo: boolean }

/** Cuenta atrás que puede pedir el mando (s). */
export const CUENTA_ATRAS_MANDO = { min: 3, max: 30 } as const

export type Mensaje =
  /** Al entrar en la sala y al cambiar de vista. */
  | { readonly tipo: 'hola'; readonly version: number; readonly vista: OrientacionVista | null; readonly movil?: string }
  | { readonly tipo: 'ping'; readonly id: number; readonly t1: number }
  | { readonly tipo: 'pong'; readonly id: number; readonly t1: number; readonly t2: number; readonly t3: number }
  | ({ readonly tipo: 'estado'; readonly movil?: string } & EstadoMovil)
  /** Del mando a un móvil (`para`: su id). */
  | ({ readonly tipo: 'orden'; readonly para: string } & Orden)
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
/** Id de un móvil en la sala: aleatorio, de letras y cifras. */
export const esIdMovil = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-z]{8,32}$/i.test(x)
const conMovil = (o: Record<string, unknown>) => (esIdMovil(o.movil) ? { movil: o.movil } : {})

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
  // Añadidos en el paso 6: si faltan o no se entienden, no se sabe (el resto del estado vale igual).
  const codificador = o.codificador === 'hardware' || o.codificador === 'software' ? o.codificador : null
  const microExterno = typeof o.microExterno === 'boolean' ? o.microExterno : null
  // Añadido en el paso 9, igual de opcional.
  const fpsGrabacion = finito(o.fpsGrabacion) && o.fpsGrabacion > 0 && o.fpsGrabacion <= 240 ? o.fpsGrabacion : null
  // Añadido en la fase 6, igual de opcional.
  const i = o.inclinacion as Record<string, unknown> | null | undefined
  const inclinacion = i && typeof i === 'object' && finito(i.cabeceo) && finito(i.alabeo) && Math.abs(i.cabeceo) <= 90 && Math.abs(i.alabeo) <= 180 ? { cabeceo: i.cabeceo, alabeo: i.alabeo } : null
  // Añadidos con la comprobación del encuadre, igual de opcionales.
  const encuadre = leerEncuadre(o.encuadre)
  const pideEncuadre = o.pideEncuadre === true
  // Añadido con el mando, igual de opcional.
  const reloj = finito(o.reloj) && o.reloj >= 0 && o.reloj < 60_000 ? o.reloj : null
  const primero = typeof o.primero === 'boolean' ? o.primero : null
  const r = o.rechazo as Record<string, unknown> | null | undefined
  const rechazo =
    r && typeof r === 'object' && RECHAZOS.includes(r.motivo as MotivoRechazo) && Number.isInteger(r.n) && (r.n as number) > 0
      ? { motivo: r.motivo as MotivoRechazo, n: r.n as number }
      : null
  return { camara, libreMB, bateria, grabando: o.grabando, codificador, microExterno, fpsGrabacion, inclinacion, encuadre, pideEncuadre, reloj, primero, rechazo }
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
      return entero(o.version) && o.version >= 1 && vista !== undefined ? { tipo: 'hola', version: o.version, vista, ...conMovil(o) } : null
    }
    case 'ping':
      return entero(o.id) && finito(o.t1) ? { tipo: 'ping', id: o.id, t1: o.t1 } : null
    case 'pong':
      return entero(o.id) && finito(o.t1) && finito(o.t2) && finito(o.t3) ? { tipo: 'pong', id: o.id, t1: o.t1, t2: o.t2, t3: o.t3 } : null
    case 'estado': {
      const e = leerEstado(o)
      return e ? { tipo: 'estado', ...conMovil(o), ...e } : null
    }
    case 'orden': {
      if (!esIdMovil(o.para)) return null
      if (o.orden === 'parar') return { tipo: 'orden', para: o.para, orden: 'parar' }
      if (o.orden === 'encuadre') return typeof o.activo === 'boolean' ? { tipo: 'orden', para: o.para, orden: 'encuadre', activo: o.activo } : null
      if (o.orden === 'programar') {
        const duracion = o.duracion === null ? null : finito(o.duracion) && o.duracion > 0 && o.duracion <= DURACION_MAXIMA_PROGRAMADA_S ? o.duracion : undefined
        const cuenta = entero(o.cuentaAtras) && o.cuentaAtras >= CUENTA_ATRAS_MANDO.min && o.cuentaAtras <= CUENTA_ATRAS_MANDO.max ? o.cuentaAtras : undefined
        return duracion !== undefined && cuenta !== undefined ? { tipo: 'orden', para: o.para, orden: 'programar', cuentaAtras: cuenta, duracion } : null
      }
      return null
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
