/*
 * Lo que le pasa a cada móvil al grabar, contado al mando (pedido el 11-11: que el ordenador sea el centro de control y no
 * haya que mirar los móviles para saber si algo ha ido mal). Cada móvil manda sus últimos sucesos en su `estado`
 * (`protocolo.ts`), con un número que crece; el mando los junta en un registro con la hora a la que le llegan.
 *
 * Solo códigos de una lista cerrada y números (segundos, fps, pitidos oídos): nada de texto libre ni de la persona. Lo que
 * no se entienda se descarta.
 */
import { FRACCION_FPS_MINIMA } from '../grabacion/revision'
import type { MotivoCancelar } from './protocolo'

/** Por qué no se graba: un motivo de cancelar del protocolo, o que el otro no contesta, o que no hay conexión. */
export type MotivoNoGraba = MotivoCancelar | 'sin-respuesta' | 'sin-conexion'

export type Suceso = { readonly n: number } & (
  /** Empieza a grabar. */
  | { readonly tipo: 'empieza' }
  /** No se graba (`deOtro`: el motivo lo ha dado el otro móvil). */
  | { readonly tipo: 'no-graba'; readonly motivo: MotivoNoGraba; readonly deOtro: boolean }
  /** La grabación se ha cortado a los `segundos` (se guarda lo grabado). */
  | { readonly tipo: 'cortada'; readonly segundos: number }
  /** No se ha podido terminar de escribir la grabación. */
  | { readonly tipo: 'no-termina' }
  /** Ha parado porque al otro móvil se le cortó la grabación (se guarda lo grabado). */
  | { readonly tipo: 'parada-otro' }
  /** Grabación terminada: duración, fps medianos (null si no se pudo analizar) y pitidos oídos de 2 (null si no se buscaron). */
  | { readonly tipo: 'terminada'; readonly segundos: number | null; readonly fps: number | null; readonly pitidos: number | null }
)

/** Sin el número (lo pone quien los guarda). */
export type SucesoNuevo = Suceso extends infer S ? (S extends Suceso ? Omit<S, 'n'> : never) : never

/** Cuántos sucesos manda cada móvil en su estado (los últimos). */
export const SUCESOS_MAXIMOS = 5

/** Los fps que se piden al grabar en la sala (siempre 30). */
export const FPS_PEDIDOS = 30

const MOTIVOS: readonly MotivoNoGraba[] = ['usuario', 'sin-camara', 'sin-vista', 'sin-reloj', 'sin-espacio', 'tarde', 'ocupado', 'version', 'fallo', 'sin-respuesta', 'sin-conexion']

/** Añade un suceso con el número siguiente, quedándose con los últimos. */
export function anotarSuceso(lista: readonly Suceso[], s: SucesoNuevo): Suceso[] {
  const n = (lista.at(-1)?.n ?? 0) + 1
  return [...lista, { ...s, n } as Suceso].slice(-SUCESOS_MAXIMOS)
}

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numeroONulo = (v: unknown, max: number): number | null | undefined => (v === null ? null : finito(v) && v >= 0 && v <= max ? v : undefined)

/** Lee la lista de sucesos de un estado; lo que no se entiende se descarta. */
export function leerSucesos(v: unknown): Suceso[] {
  if (!Array.isArray(v)) return []
  const r: Suceso[] = []
  for (const x of v.slice(-SUCESOS_MAXIMOS) as unknown[]) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (!Number.isInteger(o.n) || (o.n as number) <= 0) continue
    const n = o.n as number
    if (o.tipo === 'empieza' || o.tipo === 'no-termina' || o.tipo === 'parada-otro') r.push({ n, tipo: o.tipo })
    else if (o.tipo === 'no-graba' && MOTIVOS.includes(o.motivo as MotivoNoGraba) && typeof o.deOtro === 'boolean')
      r.push({ n, tipo: 'no-graba', motivo: o.motivo as MotivoNoGraba, deOtro: o.deOtro })
    else if (o.tipo === 'cortada' && finito(o.segundos) && o.segundos >= 0 && o.segundos <= 3600) r.push({ n, tipo: 'cortada', segundos: o.segundos })
    else if (o.tipo === 'terminada') {
      const segundos = numeroONulo(o.segundos, 3600)
      const fps = numeroONulo(o.fps, 240)
      const pitidos = o.pitidos === null ? null : o.pitidos === 0 || o.pitidos === 1 || o.pitidos === 2 ? o.pitidos : undefined
      if (segundos !== undefined && fps !== undefined && pitidos !== undefined) r.push({ n, tipo: 'terminada', segundos, fps, pitidos })
    }
  }
  return r
}

const TEXTO_NO_GRABA: Record<MotivoNoGraba, string> = {
  usuario: 'se ha cancelado',
  'sin-camara': 'la cámara no está abierta',
  'sin-vista': 'falta elegir las vistas',
  'sin-reloj': 'el reloj común aún no está medido',
  'sin-espacio': 'queda poco espacio',
  tarde: 'el aviso llegó demasiado tarde para prepararse',
  ocupado: 'ya estaba grabando o programado',
  version: 'los móviles tienen versiones distintas de la app',
  fallo: 'no ha podido empezar a grabar',
  'sin-respuesta': 'el otro móvil no ha contestado',
  'sin-conexion': 'no hay conexión con el otro móvil',
}

const num = (v: number, decimales = 0) => v.toLocaleString('es-ES', { maximumFractionDigits: decimales })

/** Si los fps de una grabación terminada son bajos (por debajo del 90 % de los pedidos). */
const fpsBajos = (fps: number | null) => fps !== null && fps < FPS_PEDIDOS * FRACCION_FPS_MINIMA

/** Si el mando lo pone en ámbar: algo ha ido mal o hay que revisarlo. */
export function esImportante(s: Suceso): boolean {
  if (s.tipo === 'no-graba') return s.motivo !== 'usuario'
  if (s.tipo === 'terminada') return fpsBajos(s.fps) || (s.pitidos !== null && s.pitidos < 2)
  return s.tipo !== 'empieza'
}

/** El texto del suceso en el mando (`quien`: «Móvil 1»). */
export function textoSuceso(s: Suceso, quien: string): string {
  switch (s.tipo) {
    case 'empieza':
      return `${quien} empieza a grabar.`
    case 'no-graba':
      return `${quien} no graba: ${TEXTO_NO_GRABA[s.motivo]}${s.deOtro ? ' (lo dice el otro móvil)' : ''}.`
    case 'cortada':
      return `${quien}: la grabación se ha cortado a los ${num(s.segundos)} s (¿la app pasó a segundo plano?). Lo grabado está guardado.`
    case 'no-termina':
      return `${quien}: no se ha podido terminar de guardar la grabación.`
    case 'parada-otro':
      return `${quien} ha parado porque al otro se le ha cortado la grabación (lo grabado está guardado). Repite la toma.`
    case 'terminada': {
      const partes = [`${quien}: grabación terminada`]
      if (s.segundos !== null) partes.push(`${num(s.segundos, 1)} s`)
      if (s.fps !== null) partes.push(`a ${num(s.fps, 1)} fps${fpsBajos(s.fps) ? ' (bajos: más luz o menos resolución)' : ''}`)
      if (s.pitidos !== null) partes.push(s.pitidos === 2 ? 'pitidos oídos ✓' : `pitidos oídos: ${s.pitidos} de 2 (sin ellos, se sincroniza por el reloj)`)
      return `${partes.join(' · ')}.`
    }
  }
}

/** Un suceso en el registro del mando: de qué móvil y cuándo llegó (ms de `Date.now()` del mando, solo para enseñar la hora). */
export interface EntradaRegistro {
  readonly movil: string
  readonly hora: number
  readonly suceso: Suceso
}

/** Cuántas entradas guarda el registro del mando (las últimas). */
export const REGISTRO_MAXIMO = 30

/**
 * Lo nuevo de un móvil para el registro: los sucesos de su estado con número mayor que el último visto (`ultimo`;
 * undefined la primera vez, y entonces no se añade nada: lo de antes de abrir el mando no tiene hora). Devuelve también
 * el nuevo último.
 */
export function sucesosNuevos(sucesos: readonly Suceso[], ultimo: number | undefined): { nuevos: Suceso[]; ultimo: number } {
  const maximo = sucesos.reduce((m, s) => Math.max(m, s.n), 0)
  if (ultimo === undefined) return { nuevos: [], ultimo: maximo }
  // Un número menor que el último visto: el móvil ha vuelto a empezar (no debería, porque al recargar cambia de id).
  if (maximo < ultimo) return { nuevos: [...sucesos], ultimo: maximo }
  return { nuevos: sucesos.filter((s) => s.n > ultimo), ultimo: Math.max(ultimo, maximo) }
}
