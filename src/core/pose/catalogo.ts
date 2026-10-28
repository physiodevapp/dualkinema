/*
 * Articulaciones sin marcadores (fase 5, D4 de docs/plan-fase-5.md): las del catálogo de siempre, pero con los puntos del
 * modelo (`pose_<parte>_<lado>`), que son centros articulares aproximados y no referencias óseas. Por eso son entradas
 * propias, con ids `pose_…` y la convención fijada por pose/catalogo.test.ts; donde miden lo mismo que una de los gomets,
 * tienen su signo y su cero (`equivalenteGomets`), y se comparan con ella por la forma, el rango y el valor relativo al
 * cero, no a pelo (`compararFuentes`).
 *
 * De perfil (solo la pierna que mira a la cámara: la otra queda detrás y el modelo supone sus puntos):
 *   - cadera, rodilla y tobillo, como las de los gomets (tobillo: pierna y talón → punta del pie, cero 90);
 *   - tronco: cadera → hombro respecto a la vertical (ángulo absoluto). Inclinado hacia delante = el hombro hacia +x,
 *     un giro horario desde la vertical → signo −1. De pie, 0°.
 * De frente (las dos piernas a la vez; x canónico = hacia la izquierda de la persona):
 *   - rodilla (FPPA): cadera → rodilla y rodilla → tobillo, como la de los gomets: valgo +, varo −.
 *   - cadera: la línea de las caderas (de la otra cadera a esta) y el muslo (cadera → rodilla). Con el muslo
 *     perpendicular a la línea de las caderas, θ = −90° en la izquierda y +90° en la derecha: signo +1 en la izquierda y
 *     −1 en la derecha con cero −90 dan 0°; abducción (la rodilla hacia fuera) +, aducción −. Es respecto a la pelvis,
 *     no al tronco: no mide lo mismo que `cadera_frontal_*` de los gomets.
 *   - pelvis (oblicuidad): la línea de las caderas (derecha → izquierda) respecto a la horizontal. Cadera izquierda más
 *     alta = giro antihorario → +; derecha más alta, −.
 *   - tronco (inclinación lateral): del punto medio de las caderas al de los hombros, respecto a la vertical. Hacia la
 *     izquierda de la persona = hacia +x, un giro horario → signo −1: izquierda +, derecha −.
 * La pelvis y el tronco de frente son de toda la persona, no de una pierna: su signo va por los lados de la persona.
 */
import { articulacionesFrontales, articulacionesSagitales, type Lado } from '../articulaciones/catalogo'
import { marcadoresDeArticulacion, type DefinicionArticulacion } from '../articulaciones/definicion'
import type { OrientacionVista } from '../geometria/canonico'
import type { Marcador, ModeloMarcadores } from '../modelo/tipos'
import { idMedio, idPose, PUNTOS_MEDIOS, PUNTOS_POSE, type ParteCuerpo, type ParteMedia } from './puntos'

const otroLado = (l: Lado): Lado => (l === 'der' ? 'izq' : 'der')

/** Una de los gomets con los segmentos cambiados por puntos del modelo: misma convención, id y nombre propios. */
function comoLaDeGomets(gomets: DefinicionArticulacion, proximal: [ParteCuerpo, ParteCuerpo], distal: [ParteCuerpo, ParteCuerpo], l: Lado): DefinicionArticulacion {
  return {
    ...gomets,
    id: `pose_${gomets.id}`,
    nombre: `${gomets.nombre} sin marcadores`,
    proximal: { desde: idPose(proximal[0], l), hasta: idPose(proximal[1], l) },
    distal: { desde: idPose(distal[0], l), hasta: idPose(distal[1], l) },
  }
}

const deGomets = (lista: readonly DefinicionArticulacion[], id: string) => lista.find((a) => a.id === id)!

/** De perfil, la pierna `l` (la que ve la cámara): cadera, rodilla, tobillo y la inclinación del tronco. */
export function articulacionesPoseSagitales(l: Lado): DefinicionArticulacion[] {
  const g = articulacionesSagitales(l)
  return [
    comoLaDeGomets(deGomets(g, `rodilla_sagital_${l}`), ['cadera', 'rodilla'], ['rodilla', 'tobillo'], l),
    comoLaDeGomets(deGomets(g, `cadera_sagital_${l}`), ['hombro', 'cadera'], ['cadera', 'rodilla'], l),
    comoLaDeGomets(deGomets(g, `tobillo_sagital_${l}`), ['rodilla', 'tobillo'], ['talon', 'punta'], l),
    {
      id: `pose_tronco_sagital_${l}`,
      nombre: 'Tronco (inclinación delante-detrás) sin marcadores',
      plano: 'sagital',
      proximal: { referencia: 'vertical' },
      distal: { desde: idPose('cadera', l), hasta: idPose('hombro', l) },
      signo: -1,
      cero: 0,
      positivo: 'inclinación hacia delante',
      negativo: 'inclinación hacia atrás',
    },
  ]
}

const NOMBRE_LADO: Record<Lado, string> = { der: 'derecha', izq: 'izquierda' }

/** La cadera de frente respecto a la pelvis (ver arriba). */
function caderaFrontalPose(l: Lado): DefinicionArticulacion {
  return {
    id: `pose_cadera_frontal_${l}`,
    nombre: `Cadera ${NOMBRE_LADO[l]} (abducción-aducción respecto a la pelvis) sin marcadores`,
    plano: 'frontal',
    proximal: { desde: idPose('cadera', otroLado(l)), hasta: idPose('cadera', l) },
    distal: { desde: idPose('cadera', l), hasta: idPose('rodilla', l) },
    signo: l === 'izq' ? 1 : -1,
    cero: -90,
    positivo: 'abducción',
    negativo: 'aducción',
  }
}

export const PELVIS_FRONTAL_POSE: DefinicionArticulacion = {
  id: 'pose_pelvis_frontal',
  nombre: 'Pelvis (oblicuidad) sin marcadores',
  plano: 'frontal',
  proximal: { referencia: 'horizontal' },
  distal: { desde: idPose('cadera', 'der'), hasta: idPose('cadera', 'izq') },
  signo: 1,
  cero: 0,
  positivo: 'cadera izquierda más alta',
  negativo: 'cadera derecha más alta',
}

export const TRONCO_FRONTAL_POSE: DefinicionArticulacion = {
  id: 'pose_tronco_frontal',
  nombre: 'Tronco (inclinación lateral) sin marcadores',
  plano: 'frontal',
  proximal: { referencia: 'vertical' },
  distal: { desde: idMedio('cadera'), hasta: idMedio('hombro') },
  signo: -1,
  cero: 0,
  positivo: 'inclinación a la izquierda',
  negativo: 'inclinación a la derecha',
}

/**
 * De frente, las dos piernas a la vez: el FPPA y la cadera de cada una (primero las de `primero`), la pelvis y el tronco.
 */
export function articulacionesPoseFrontales(primero: Lado = 'der'): DefinicionArticulacion[] {
  const lados = [primero, otroLado(primero)]
  const fppa = (l: Lado) => comoLaDeGomets(deGomets(articulacionesFrontales(l), `rodilla_frontal_${l}`), ['cadera', 'rodilla'], ['rodilla', 'tobillo'], l)
  return [...lados.map(fppa), ...lados.map(caderaFrontalPose), PELVIS_FRONTAL_POSE, TRONCO_FRONTAL_POSE]
}

const NOMBRE_PARTE: Record<ParteCuerpo, [string, 'm' | 'f']> = {
  hombro: ['Hombro', 'm'],
  cadera: ['Cadera', 'f'],
  rodilla: ['Rodilla', 'f'],
  tobillo: ['Tobillo', 'm'],
  talon: ['Talón', 'm'],
  punta: ['Punta del pie', 'm'],
}
const NOMBRE_MEDIO: Record<ParteMedia, string> = { hombro: 'Punto medio de los hombros', cadera: 'Punto medio de las caderas' }

/** Los marcadores virtuales del modelo: los 12 puntos y, si se piden, los puntos medios (que no se marcan ni se guardan). */
export function marcadoresPose(conMedios: boolean): Marcador[] {
  const puntos = PUNTOS_POSE.map((p) => {
    const [nombre, genero] = NOMBRE_PARTE[p.parte]
    const lado = p.lado === 'der' ? (genero === 'f' ? 'derecha' : 'derecho') : genero === 'f' ? 'izquierda' : 'izquierdo'
    // «Punta del pie derecho»: el adjetivo va con el pie.
    return { id: p.id, nombre: `${nombre} ${lado} (modelo)` }
  })
  return conMedios ? [...puntos, ...PUNTOS_MEDIOS.map((p) => ({ id: p.id, nombre: `${NOMBRE_MEDIO[p.parte]} (modelo)` }))] : puntos
}

/**
 * El modelo sin marcadores de una vista: los 12 puntos (siempre los dos lados, para dibujar el esqueleto) y las
 * articulaciones de su plano. De perfil, las de la pierna `l` (la que ve la cámara); de frente, las de las dos piernas,
 * primero las de `l`, con los puntos medios para el tronco.
 */
export function modeloPose(orientacion: OrientacionVista, l: Lado): ModeloMarcadores {
  if (orientacion.plano === 'sagital') return { marcadores: marcadoresPose(false), articulaciones: articulacionesPoseSagitales(l) }
  return { marcadores: marcadoresPose(true), articulaciones: articulacionesPoseFrontales(l) }
}

export type Fuente = 'gomets' | 'sinMarcadores'

/** De qué sale una articulación: de los puntos del modelo (todos sus marcadores son `pose_…`) o de gomets. */
export const fuenteDe = (def: DefinicionArticulacion): Fuente =>
  marcadoresDeArticulacion(def).every((id) => id.startsWith('pose_')) ? 'sinMarcadores' : 'gomets'

/**
 * La articulación de los gomets que mide lo mismo que una sin marcadores (misma convención), para compararlas; null si
 * no hay (el tronco, la pelvis, la cadera de frente respecto a la pelvis).
 */
export function equivalenteGomets(idPoseArticulacion: string): string | null {
  const m = /^pose_((?:cadera|rodilla|tobillo)_sagital|rodilla_frontal)_(der|izq)$/.exec(idPoseArticulacion)
  return m ? `${m[1]}_${m[2]}` : null
}
