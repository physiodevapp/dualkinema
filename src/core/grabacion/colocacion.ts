/*
 * El asistente de colocación de la sala (fase 6, paso 6; D9 de docs/plan-fase-6.md): con la inclinación de cada móvil en
 * directo (su acelerómetro, `core/sensores`), si la cámara mira casi en horizontal y sin torcer. Para el 3D importa: la
 * calibración arranca de la vertical de cada móvil y la corrige poco (1°), y con la cámara inclinada la persona se ve
 * deformada por la perspectiva. Para el 2D también: de perfil, una cámara que mira hacia abajo acorta los segmentos.
 */

/** Cabeceo máximo (°, hacia arriba o hacia abajo) y alabeo máximo (°, la imagen girada) para darlo por bueno. */
export const CABECEO_MAX = 10
export const ALABEO_MAX = 3

export interface Inclinacion {
  /** + mirando hacia abajo (°). */
  readonly cabeceo: number
  /** + con el horizonte subiendo hacia la derecha de la imagen (°). */
  readonly alabeo: number
}

export interface RevisionInclinacion {
  readonly bienCabeceo: boolean
  readonly bienAlabeo: boolean
  /** «mira hacia abajo 4°» / «imagen girada 1°». */
  readonly cabeceo: string
  readonly alabeo: string
  /** Qué hacer, si algo no está bien (null si todo bien). */
  readonly consejo: string | null
}

const g = (x: number) => `${Math.round(Math.abs(x))}°`

/** Cómo está colocado un móvil y qué hacer si no está bien. */
export function revisarInclinacion(i: Inclinacion): RevisionInclinacion {
  const bienCabeceo = Math.abs(i.cabeceo) <= CABECEO_MAX
  const bienAlabeo = Math.abs(i.alabeo) <= ALABEO_MAX
  const consejos: string[] = []
  if (!bienCabeceo) consejos.push(i.cabeceo > 0 ? 'levanta la cámara: mira demasiado hacia abajo (súbelo o apóyalo más bajo, a la altura de la cadera)' : 'baja la cámara: mira demasiado hacia arriba')
  if (!bienAlabeo) consejos.push(`endereza el móvil: la imagen está girada (gíralo un poco en sentido ${i.alabeo > 0 ? 'horario' : 'antihorario'})`)
  return {
    bienCabeceo,
    bienAlabeo,
    cabeceo: `${i.cabeceo >= 0 ? 'mira hacia abajo' : 'mira hacia arriba'} ${g(i.cabeceo)}`,
    alabeo: `imagen girada ${g(i.alabeo)}`,
    consejo: consejos.length ? `${consejos.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : null,
  }
}

/** Para mandarla al otro móvil: a medio grado (no hace falta más y cambia menos). */
export const redondearInclinacion = (i: Inclinacion): Inclinacion => ({ cabeceo: Math.round(i.cabeceo * 2) / 2 + 0, alabeo: Math.round(i.alabeo * 2) / 2 + 0 })
