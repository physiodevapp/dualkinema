/*
 * El mando (un ordenador en la sala que maneja los dos móviles; ver `protocolo.ts` y `rele.ts`): lo que sabe de cada
 * móvil, qué falta para poder grabar y a qué móvil manda las órdenes. Solo informa: cada móvil vuelve a comprobar lo
 * suyo al recibir una orden (la grabación doble no se salta ninguna de sus reglas, `doble.ts`).
 */
import type { OrientacionVista } from '../geometria/canonico'
import { ESPACIO_MINIMO_MB, vistasCompatibles } from './doble'
import { VERSION_PROTOCOLO, type EstadoMovil } from './protocolo'

export interface MovilEnMando {
  readonly id: string
  readonly vista: OrientacionVista | null
  /** null: aún no se ha presentado (`hola`). */
  readonly version: number | null
  readonly estado: EstadoMovil | null
  /** Último mensaje suyo (ms del reloj del mando). */
  readonly visto: number
}

/** Un móvil que no manda nada en este tiempo se da por ido (el estado llega cada 2 s). */
export const SIN_NOTICIAS_MS = 6000

/** Los móviles con noticias recientes, en el orden en que llegaron (como mucho dos: los últimos). */
export function movilesVivos(moviles: readonly MovilEnMando[], ahora: number): MovilEnMando[] {
  return moviles.filter((m) => ahora - m.visto <= SIN_NOTICIAS_MS).slice(-2)
}

/** Lo que falta para grabar, en el orden en que hay que arreglarlo; vacío si se puede. */
export function faltaParaGrabar(moviles: readonly MovilEnMando[]): string[] {
  if (moviles.length < 2) return [moviles.length === 0 ? 'Faltan los dos móviles: crea la sala en uno y únete con el otro.' : 'Falta el otro móvil.']
  const [a, b] = moviles as [MovilEnMando, MovilEnMando]
  const r: string[] = []
  if (moviles.some((m) => m.version !== null && m.version !== VERSION_PROTOCOLO)) r.push('Algún móvil tiene otra versión de la app: recarga la página en los tres.')
  if (!a.vista || !b.vista) r.push('Falta elegir en cada móvil cómo ve a la persona.')
  else if (!vistasCompatibles(a.vista, b.vista))
    r.push('Las dos vistas no casan: una de perfil y otra de frente o de espaldas, o cada una en un flanco (mirando a lados distintos).')
  if (moviles.some((m) => !m.estado?.camara)) r.push('Algún móvil no tiene la cámara abierta.')
  if (moviles.some((m) => m.estado && m.estado.reloj === null)) r.push('Los móviles aún están midiendo el reloj común.')
  if (moviles.some((m) => m.estado?.libreMB != null && m.estado.libreMB < ESPACIO_MINIMO_MB)) r.push('A algún móvil le queda poco espacio.')
  return r
}

/** Si alguno está grabando (o parando). */
export const grabando = (moviles: readonly MovilEnMando[]): boolean => moviles.some((m) => m.estado?.grabando)

/**
 * El móvil al que se mandan las órdenes de los dos (programar, parar, el encuadre): el primero que llegó. Programar en uno
 * basta (él se lo pide al otro, como si se pulsara «Grabar» en él); lo mismo el encuadre (él pide al otro que mire).
 */
export const destino = (moviles: readonly MovilEnMando[]): MovilEnMando | null => moviles[0] ?? null
