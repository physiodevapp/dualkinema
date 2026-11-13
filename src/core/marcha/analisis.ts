/*
 * El análisis de marcha entero de una vista de perfil (fase 9): de las trayectorias y lo corregido a mano a los eventos, los
 * ciclos, las curvas normalizadas de la articulación que se mira (relativas al cero si lo hay), la media ± DE y los
 * parámetros. Lo usa la tarjeta «Marcha» del visor; aquí, para probarlo entero sin la interfaz.
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import { marcadores as idsGomets, type Lado } from '../articulaciones/catalogo'
import type { AjustesFiltro } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Muestra2D } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { ciclosDe, mediaYDesviacion, normalizarCiclo, parametrosMarcha, type Ciclo, type ParametrosMarcha } from './ciclos'
import { adelanteEn, conCorrecciones, detectarEventos, type EventoMarcha, type PuntosPie } from './eventos'
import { estaExcluido, type MarchaGuardada } from './guardado'

type Series = ReadonlyMap<IdMarcador, readonly (Muestra2D | undefined)[]>

/** Los puntos del pie y la cadera que se usan: los del modelo sin marcadores o los gomets del tobillo. */
export interface IdsPie {
  readonly cadera: IdMarcador
  readonly talon: IdMarcador
  readonly punta: IdMarcador
}

const tieneDatos = (s: Series, id: IdMarcador) => (s.get(id) ?? []).some((m) => !!m && m.calidad > 0 && Number.isFinite(m.x))

/**
 * Qué puntos usar para el pie `lado` (D2): con la fuente pedida si los tiene (sin marcadores: cadera, talón y punta del
 * modelo; gomets: trocánter, calcáneo y 5.º metatarsiano), si no, la otra; null si ninguna los tiene todos.
 */
export function idsDelPie(series: Series, lado: Lado, preferida: 'gomets' | 'sinMarcadores'): IdsPie | null {
  const g = idsGomets(lado)
  const deGomets: IdsPie = { cadera: g.cadera, talon: g.talon, punta: g.antepie }
  const dePose: IdsPie = { cadera: idPose('cadera', lado), talon: idPose('talon', lado), punta: idPose('punta', lado) }
  const orden = preferida === 'gomets' ? [deGomets, dePose] : [dePose, deGomets]
  return orden.find((ids) => tieneDatos(series, ids.cadera) && tieneDatos(series, ids.talon) && tieneDatos(series, ids.punta)) ?? null
}

export interface CicloAnalizado extends Ciclo {
  readonly excluido: boolean
  /** La curva en 101 puntos (null si el ciclo no es válido o le falta algún valor). */
  readonly curva: number[] | null
}

export interface AnalisisMarcha {
  readonly eventos: readonly EventoMarcha[]
  readonly ciclos: readonly CicloAnalizado[]
  /** Media ± DE de los ciclos válidos, incluidos y con curva. */
  readonly media: { readonly media: number[]; readonly de: number[] } | null
  /** El despegue medio, % del ciclo. */
  readonly despegueMedio: number
  readonly parametros: ParametrosMarcha | null
}

export interface EntradaAnalisis {
  readonly series: Series
  readonly orientacion: OrientacionVista
  readonly lado: Lado
  readonly ids: IdsPie
  readonly fs: number
  readonly ajustes: AjustesFiltro
  readonly guardado: MarchaGuardada
  /** La serie filtrada de la articulación que se mira (una muestra por frame). */
  readonly serieAngulo: readonly MuestraAngulo[]
  /** La media del cero (null sin cero): las curvas van relativas a él. */
  readonly cero: number | null
  readonly metrosPorPx: number | null
}

export function analizarMarcha(e: EntradaAnalisis): AnalisisMarcha {
  const vacio: readonly (Muestra2D | undefined)[] = []
  const pie: PuntosPie = { cadera: e.series.get(e.ids.cadera) ?? vacio, talon: e.series.get(e.ids.talon) ?? vacio, punta: e.series.get(e.ids.punta) ?? vacio }
  const det = detectarEventos(pie, e.lado, e.orientacion, e.fs, e.ajustes)
  const eventos = conCorrecciones(det.eventos, e.guardado.manuales.filter((x) => x.lado === e.lado), e.guardado.quitados)
  const serie = e.cero === null ? e.serieAngulo : e.serieAngulo.map((m) => ({ ...m, valor: m.valor - e.cero! }))
  const ciclos: CicloAnalizado[] = ciclosDe(eventos, e.lado, det.tramos).map((c) => ({
    ...c,
    excluido: estaExcluido(e.guardado.excluidos, c.inicio),
    curva: c.descarte ? null : normalizarCiclo(serie, c.inicio, c.fin),
  }))
  const usados = ciclos.filter((c) => !c.descarte && !c.excluido)
  const media = mediaYDesviacion(usados.flatMap((c) => (c.curva ? [c.curva] : [])))
  const despegues = usados.filter((c) => c.despegue !== null).map((c) => (100 * (c.despegue! - c.inicio)) / (c.fin - c.inicio))
  const despegueMedio = despegues.length ? despegues.reduce((a, b) => a + b, 0) / despegues.length : NaN
  // El largo del pie (talón–punta, px) típico, para decidir si es en cinta.
  const largos = pie.talon.flatMap((t, i) => {
    const p = pie.punta[i]
    return t && p && t.calidad > 0 && p.calidad > 0 ? [Math.hypot(p.x - t.x, p.y - t.y)] : []
  })
  const largoPie = largos.length ? [...largos].sort((a, b) => a - b)[largos.length >> 1]! : NaN
  const parametros = parametrosMarcha(
    usados,
    adelanteEn(pie.cadera, e.orientacion),
    adelanteEn(pie.talon, e.orientacion),
    largoPie,
    e.metrosPorPx,
    e.guardado.enCinta,
  )
  return { eventos, ciclos, media, despegueMedio, parametros }
}
