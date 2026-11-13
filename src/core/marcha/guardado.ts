/*
 * Lo que se guarda de la marcha con cada vista (fase 9, D7): que se buscaron los ciclos, los eventos puestos o quitados a
 * mano, los ciclos excluidos y si se forzó «en cinta» o «por el suelo». Lo detectado no se guarda: se vuelve a calcular
 * (es rápido y sale de las trayectorias, que sí se guardan). Opcional y sin subir el esquema: lo que no se pueda leer se
 * descarta sin rechazar la sesión.
 */
import type { Lado } from '../articulaciones/catalogo'
import type { EventoMarcha, TipoEvento } from './eventos'

export interface MarchaGuardada {
  /** Eventos puestos o movidos a mano. */
  readonly manuales: readonly EventoMarcha[]
  /** Eventos detectados que se quitaron a mano (su tipo, pie e instante). */
  readonly quitados: readonly Omit<EventoMarcha, 'manual'>[]
  /** Instante de inicio (s) de los ciclos excluidos de la media. */
  readonly excluidos: readonly number[]
  /** null = lo decide la app; true/false = forzado. */
  readonly enCinta: boolean | null
}

export const MARCHA_VACIA: MarchaGuardada = { manuales: [], quitados: [], excluidos: [], enCinta: null }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTiempo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const TIPOS: readonly TipoEvento[] = ['contacto', 'despegue']
const LADOS: readonly Lado[] = ['der', 'izq']

function leerEventos(v: unknown, manual: boolean): EventoMarcha[] | null {
  if (!Array.isArray(v)) return null
  const r: EventoMarcha[] = []
  for (const e of v) {
    if (!esObjeto(e) || !TIPOS.includes(e.tipo as TipoEvento) || !LADOS.includes(e.lado as Lado) || !esTiempo(e.t)) return null
    r.push({ tipo: e.tipo as TipoEvento, lado: e.lado as Lado, t: e.t, ...(manual ? { manual: true } : {}) })
  }
  return r
}

/** Lo guardado, si se puede leer; si no, null (como si no se hubieran buscado los ciclos). */
export function leerMarcha(v: unknown): MarchaGuardada | null {
  if (!esObjeto(v)) return null
  const manuales = leerEventos(v.manuales, true)
  const quitados = leerEventos(v.quitados, false)
  if (!manuales || !quitados || !Array.isArray(v.excluidos) || !v.excluidos.every(esTiempo)) return null
  if (v.enCinta !== null && typeof v.enCinta !== 'boolean') return null
  return { manuales, quitados, excluidos: [...v.excluidos], enCinta: v.enCinta }
}

/** Dos instantes de inicio de ciclo son el mismo ciclo si caen a menos de esto (s). */
const MISMO_CICLO_S = 0.05

export const estaExcluido = (excluidos: readonly number[], inicio: number) => excluidos.some((t) => Math.abs(t - inicio) < MISMO_CICLO_S)

/** Incluye o excluye el ciclo que empieza en `inicio`. */
export function alternarExcluido(m: MarchaGuardada, inicio: number): MarchaGuardada {
  return {
    ...m,
    excluidos: estaExcluido(m.excluidos, inicio) ? m.excluidos.filter((t) => Math.abs(t - inicio) >= MISMO_CICLO_S) : [...m.excluidos, inicio],
  }
}

const mismo = (a: Omit<EventoMarcha, 'manual'>, b: Omit<EventoMarcha, 'manual'>) => a.tipo === b.tipo && a.lado === b.lado && Math.abs(a.t - b.t) < 1e-6

/** Añade un evento puesto a mano. */
export function anadirEvento(m: MarchaGuardada, e: Omit<EventoMarcha, 'manual'>): MarchaGuardada {
  return { ...m, manuales: [...m.manuales, { ...e, manual: true }] }
}

/** Quita un evento: uno manual se borra; uno detectado se apunta en `quitados` (para que no vuelva al recalcular). */
export function quitarEvento(m: MarchaGuardada, e: EventoMarcha): MarchaGuardada {
  if (e.manual) return { ...m, manuales: m.manuales.filter((x) => !mismo(x, e)) }
  return { ...m, quitados: [...m.quitados, { tipo: e.tipo, lado: e.lado, t: e.t }] }
}

/** Mueve un evento a `t`: se quita y se pone a mano en el nuevo instante. */
export const moverEvento = (m: MarchaGuardada, e: EventoMarcha, t: number): MarchaGuardada => anadirEvento(quitarEvento(m, e), { tipo: e.tipo, lado: e.lado, t })
