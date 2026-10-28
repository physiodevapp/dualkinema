import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, ModeloMarcadores } from '../modelo/tipos'
import { marcadoresDeArticulacion, type DefinicionArticulacion } from './definicion'

/*
 * Lo que ve cada vista del modelo de la sesión (D4 de la fase 3): el modelo tiene todos los marcadores; cada vista sigue
 * los suyos y mide la articulación de su plano (la lateral, la flexión de la rodilla; la de frente, el FPPA). El visor y
 * el análisis de una vista trabajan con este modelo recortado, así que no necesitan saber que hay otros marcadores.
 */

const marcadoresDe = marcadoresDeArticulacion

/**
 * Los marcadores que sigue una vista nueva: los de las articulaciones del plano de la vista que admite `admite` (sin
 * repetir, en el orden del modelo; fase 5: las de los gomets o las sin marcadores, según con qué se analiza). Sin ninguna,
 * todos los del modelo.
 */
export function marcadoresParaVista(
  modelo: ModeloMarcadores,
  orientacion: OrientacionVista,
  admite: (a: DefinicionArticulacion) => boolean = () => true,
): IdMarcador[] {
  const delPlano = new Set(modelo.articulaciones.filter((a) => a.plano === orientacion.plano && admite(a)).flatMap(marcadoresDe))
  const ids = modelo.marcadores.map((mk) => mk.id).filter((id) => delPlano.has(id))
  return ids.length ? ids : modelo.marcadores.map((mk) => mk.id)
}

/**
 * El modelo tal como lo ve una vista: sus marcadores (en el orden del modelo) y las articulaciones que se pueden calcular
 * con ellos, primero las de su plano. Si con sus marcadores no sale ninguna, la primera del modelo (el análisis dirá que
 * no hay ángulo, como con una vista de otro plano): siempre hay al menos una.
 */
export function modeloDeVista(modelo: ModeloMarcadores, marcadoresVista: readonly IdMarcador[], orientacion: OrientacionVista): ModeloMarcadores {
  const sigue = new Set(marcadoresVista)
  const marcadores = modelo.marcadores.filter((mk) => sigue.has(mk.id))
  const calculables = modelo.articulaciones.filter((a) => marcadoresDe(a).every((id) => sigue.has(id)))
  const ordenadas = [...calculables.filter((a) => a.plano === orientacion.plano), ...calculables.filter((a) => a.plano !== orientacion.plano)]
  return { marcadores, articulaciones: ordenadas.length ? ordenadas : modelo.articulaciones.slice(0, 1) }
}
