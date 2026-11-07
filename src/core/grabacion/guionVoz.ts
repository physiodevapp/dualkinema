/*
 * Guion por voz de una grabación doble (fase 6, para la toma B1; `docs/plan-fase-6.md`): lo que dice el móvil que
 * programa la grabación en cada instante, contado desde el inicio, para que la persona sepa qué gesto toca sin mirar
 * la pantalla. Empieza después de los pitidos de ida y vuelta (`EMPIEZA_S`), para no taparlos. Solo datos: la voz la
 * pone el navegador (`sala/voz.ts`).
 */
import { DURACION_SECUENCIA_S, PITIDO_OTRA_S } from '../sincronia/pitido'

export interface FraseGuion {
  /** Segundos desde el inicio de la grabación. */
  readonly t: number
  readonly texto: string
}

export interface GuionVoz {
  readonly id: 'b1-1' | 'b1-2'
  /** Para el selector. */
  readonly nombre: string
  /** La duración de la grabación que se programa con él (s). */
  readonly duracionS: number
  readonly frases: readonly FraseGuion[]
}

/** Primer instante en que se puede hablar: acabados los dos pitidos de ida y vuelta, con medio segundo de margen. */
export const EMPIEZA_S = Math.ceil((PITIDO_OTRA_S + DURACION_SECUENCIA_S + 0.5) * 2) / 2

/** Una repetición cada `cada` segundos desde `desde`: «Una», «Dos», «Tres». */
const repeticiones = (desde: number, cada: number): FraseGuion[] =>
  ['Una.', 'Dos.', 'Tres.'].map((texto, k) => ({ t: desde + k * cada, texto }))

export const GUIONES: readonly GuionVoz[] = [
  {
    id: 'b1-1',
    nombre: 'Toma B1, grabación 1 (pasos, sentadillas y marcha)',
    duracionS: 60,
    frases: [
      { t: EMPIEZA_S, texto: 'Quieta, de pie, mirando al frente.' },
      { t: 14, texto: 'Ahora, unos pasos por la zona: adelante, atrás y a los lados.' },
      { t: 29, texto: 'Para. Sentadilla, despacio, tres veces.' },
      ...repeticiones(32, 4),
      { t: 44, texto: 'Marcha en el sitio, levantando bien las rodillas.' },
      { t: 55, texto: 'Quieta.' },
      { t: 58, texto: 'Fin.' },
    ],
  },
  {
    id: 'b1-2',
    nombre: 'Toma B1, grabación 2 (sentadilla a una pierna)',
    duracionS: 60,
    frases: [
      { t: EMPIEZA_S, texto: 'Quieta, de pie.' },
      { t: 9, texto: 'Sentadilla a una pierna, sobre la derecha.' },
      ...repeticiones(12, 5),
      { t: 27, texto: 'Descansa.' },
      { t: 31, texto: 'Ahora sobre la izquierda.' },
      ...repeticiones(34, 5),
      { t: 50, texto: 'Quieta, de pie.' },
      { t: 57, texto: 'Fin.' },
    ],
  },
]

export const guionPorId = (id: string | null | undefined): GuionVoz | null => GUIONES.find((g) => g.id === id) ?? null
