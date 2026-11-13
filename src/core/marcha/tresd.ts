/*
 * La marcha a partir de los puntos 3D (con dos móviles calibrados; pedido por el usuario el 13-11, D10 de
 * docs/plan-fase-9.md). Los mismos eventos que en 2D (el talón en su punto más adelantado respecto a la pelvis, la punta en
 * el más atrasado), pero «adelante» es hacia donde mira la persona en cada instante (el rumbo de la línea de las caderas,
 * `rumbos`) y la pelvis es el punto medio de las dos caderas. Así salen **los dos pies** y, con ellos, lo que una vista de
 * perfil no da: el tiempo de paso, el doble apoyo, la simetría y la anchura del paso. Las curvas son las de cualquier
 * ángulo 3D (de los puntos o del esqueleto), en los ciclos del pie de su lado.
 */
import type { MuestraAngulo } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import type { AjustesFiltro } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { rumbos } from '../tresd/angulos3d'
import type { Muestra3D, Trayectorias3D } from '../tresd/puntos3d'
import type { CicloAnalizado } from './analisis'
import { ciclosDe, mediaDe, mediaYDesviacion, normalizarCiclo } from './ciclos'
import { conCorrecciones, eventosDeSenales, type EventoMarcha, type TramoSenal } from './eventos'
import { estaExcluido, type MarchaGuardada } from './guardado'

const LADOS: readonly Lado[] = ['der', 'izq']
const util = (m: Muestra3D | undefined): m is Muestra3D => !!m && m.calidad > 0 && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)

/** El punto medio de las caderas en cada frame (undefined sin las dos). */
function pelvis(tr: Trayectorias3D): (Muestra3D | undefined)[] {
  const izq = tr.series.get(idPose('cadera', 'izq')) ?? []
  const der = tr.series.get(idPose('cadera', 'der')) ?? []
  return tr.tiempos.map((_, i) => {
    const a = izq[i]
    const b = der[i]
    return util(a) && util(b) ? { ...a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, calidad: Math.min(a.calidad, b.calidad) } : undefined
  })
}

/**
 * Las señales de un pie: lo adelantado del talón y de la punta respecto a la pelvis, en la dirección en que mira la persona
 * en ese frame (como muestras con la señal en `x`; sin muestra donde falta algo).
 */
export function senales3D(tr: Trayectorias3D, lado: Lado): { talon: (Muestra2D | undefined)[]; punta: (Muestra2D | undefined)[] } {
  const c = pelvis(tr)
  const rumbo = rumbos(tr)
  const senal = (id: string) => {
    const s = tr.series.get(id) ?? []
    return tr.tiempos.map((t, i): Muestra2D | undefined => {
      const p = s[i]
      const q = c[i]
      const th = rumbo[i]!
      if (!util(p) || !q || !Number.isFinite(th)) return undefined
      return { t, x: (p.x - q.x) * Math.cos(th) + (p.y - q.y) * Math.sin(th), y: 0, calidad: 1, editadoManual: false }
    })
  }
  return { talon: senal(idPose('talon', lado)), punta: senal(idPose('punta', lado)) }
}

/** La posición de un punto en el instante `t`, entre dos frames seguidos utilizables (sin cruzar huecos); null si no. */
function posicionEn(serie: readonly (Muestra3D | undefined)[], tiempos: readonly number[], t: number): { x: number; y: number; z: number } | null {
  const k = tiempos.findIndex((x) => x >= t - 1e-9)
  if (k < 0) return null
  const b = serie[k]
  if (Math.abs(tiempos[k]! - t) < 1e-9) return util(b) ? b : null
  const a = serie[k - 1]
  if (!util(a) || !util(b)) return null
  const u = (t - tiempos[k - 1]!) / (tiempos[k]! - tiempos[k - 1]!)
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u }
}

const media = (v: readonly number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN)
const mediana = (v: readonly number[]) => {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

type MediaDe = { readonly media: number; readonly de: number }

export interface ParametrosPie {
  readonly ciclos: number
  readonly zancada: MediaDe
  readonly apoyo: MediaDe
  /** Del contacto del otro pie al de este (s). */
  readonly paso: MediaDe
  /** Longitud de zancada (m), con escala y por el suelo. */
  readonly longitud: MediaDe | null
}

export interface ParametrosMarcha3D {
  readonly porPie: Readonly<Record<Lado, ParametrosPie | null>>
  /** Pasos por minuto (120 / la zancada media de los dos pies). */
  readonly cadencia: number
  /** Doble apoyo, % de la zancada (los dos tramos con los dos pies en el suelo). */
  readonly dobleApoyo: MediaDe
  readonly enCinta: boolean
  /** m/s, con escala y por el suelo. */
  readonly velocidad: number | null
  /** Anchura del paso (m): separación de lado a lado de los talones en cada contacto, con escala. */
  readonly anchura: MediaDe | null
}

export interface AnalisisMarcha3D {
  readonly eventos: readonly EventoMarcha[]
  readonly ciclos: Readonly<Record<Lado, readonly CicloAnalizado[]>>
  /** El pie de la curva (el de la articulación; sin lado, el derecho). */
  readonly ladoCurva: Lado
  readonly media: { readonly media: number[]; readonly de: number[] } | null
  readonly despegueMedio: number
  readonly parametros: ParametrosMarcha3D | null
}

export interface EntradaMarcha3D {
  readonly tr: Trayectorias3D
  readonly fs: number
  readonly ajustes: AjustesFiltro
  readonly guardado: MarchaGuardada
  /** La serie del ángulo 3D que se mira (una muestra por frame de `tr`). */
  readonly serieAngulo: readonly MuestraAngulo[]
  readonly cero: number | null
  /** El lado de la articulación que se mira (null: pelvis, tronco…). */
  readonly ladoArticulacion: Lado | null
}

export function analizarMarcha3D(e: EntradaMarcha3D): AnalisisMarcha3D {
  const { tr } = e
  const deteccion: Record<Lado, { eventos: EventoMarcha[]; tramos: readonly TramoSenal[] }> = { der: { eventos: [], tramos: [] }, izq: { eventos: [], tramos: [] } }
  for (const l of LADOS) {
    const s = senales3D(tr, l)
    const d = eventosDeSenales(s.talon, s.punta, l, e.fs, e.ajustes)
    deteccion[l] = { eventos: conCorrecciones(d.eventos, e.guardado.manuales.filter((x) => x.lado === l), e.guardado.quitados), tramos: d.tramos }
  }
  const eventos = [...deteccion.der.eventos, ...deteccion.izq.eventos].sort((a, b) => a.t - b.t)
  const ladoCurva: Lado = e.ladoArticulacion ?? 'der'
  const serie = e.cero === null ? e.serieAngulo : e.serieAngulo.map((m) => ({ ...m, valor: m.valor - e.cero! }))
  const ciclos = {} as Record<Lado, CicloAnalizado[]>
  for (const l of LADOS) {
    ciclos[l] = ciclosDe(deteccion[l].eventos, l, deteccion[l].tramos).map((c) => ({
      ...c,
      excluido: estaExcluido(e.guardado.excluidos, c.inicio),
      curva: c.descarte || l !== ladoCurva ? null : normalizarCiclo(serie, c.inicio, c.fin),
    }))
  }
  const usados = (l: Lado) => ciclos[l].filter((c) => !c.descarte && !c.excluido)
  const curvas = usados(ladoCurva).flatMap((c) => (c.curva ? [c.curva] : []))
  const desp = usados(ladoCurva).filter((c) => c.despegue !== null).map((c) => (100 * (c.despegue! - c.inicio)) / (c.fin - c.inicio))
  return { eventos, ciclos, ladoCurva, media: mediaYDesviacion(curvas), despegueMedio: media(desp), parametros: parametros3D(tr, ciclos, eventos, e.guardado.enCinta) }
}

/** Los parámetros espaciotemporales con los dos pies (los ciclos incluidos de cada uno). */
export function parametros3D(tr: Trayectorias3D, ciclos: Readonly<Record<Lado, readonly CicloAnalizado[]>>, eventos: readonly EventoMarcha[], enCintaForzado: boolean | null): ParametrosMarcha3D | null {
  const usados = (l: Lado) => ciclos[l].filter((c) => !c.descarte && !c.excluido)
  if (usados('der').length + usados('izq').length === 0) return null
  const talon = (l: Lado) => tr.series.get(idPose('talon', l)) ?? []
  const punta = (l: Lado) => tr.series.get(idPose('punta', l)) ?? []
  const c = pelvis(tr)
  const pelvisEn = (t: number) => posicionEn(c, tr.tiempos, t)
  const contactos = (l: Lado) => eventos.filter((x) => x.lado === l && x.tipo === 'contacto').map((x) => x.t)
  const despegues = (l: Lado) => eventos.filter((x) => x.lado === l && x.tipo === 'despegue').map((x) => x.t)
  const otro = (l: Lado): Lado => (l === 'der' ? 'izq' : 'der')
  // En cinta: la pelvis avanza por zancada menos que el largo del pie.
  const largos = LADOS.flatMap((l) =>
    talon(l).flatMap((p, i) => {
      const q = punta(l)[i]
      return util(p) && util(q) ? [Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)] : []
    }),
  )
  const horizontal = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y)
  const avances = LADOS.flatMap((l) =>
    usados(l).flatMap((ci) => {
      const a = pelvisEn(ci.inicio)
      const b = pelvisEn(ci.fin)
      return a && b ? [horizontal(a, b)] : []
    }),
  )
  const enCinta = enCintaForzado ?? (avances.length > 0 && mediana(avances) < mediana(largos))
  const porPie = {} as Record<Lado, ParametrosPie | null>
  const dobles: number[] = []
  for (const l of LADOS) {
    const u = usados(l)
    if (u.length === 0) {
      porPie[l] = null
      continue
    }
    // Paso: del último contacto del otro pie antes de este contacto, a este (dentro de una zancada).
    const pasos = u.flatMap((ci) => {
      const previo = contactos(otro(l)).filter((t) => t < ci.fin && t > ci.inicio)
      return previo.length === 1 ? [ci.fin - previo[0]!] : []
    })
    let longitud: MediaDe | null = null
    if (tr.enMetros && !enCinta) {
      const l2 = u.flatMap((ci) => {
        const a = posicionEn(talon(l), tr.tiempos, ci.inicio)
        const b = posicionEn(talon(l), tr.tiempos, ci.fin)
        return a && b ? [horizontal(a, b)] : []
      })
      if (l2.length) longitud = mediaDe(l2)
    }
    porPie[l] = {
      ciclos: u.length,
      zancada: mediaDe(u.map((ci) => ci.fin - ci.inicio)),
      apoyo: mediaDe(u.filter((ci) => ci.despegue !== null).map((ci) => (100 * (ci.despegue! - ci.inicio)) / (ci.fin - ci.inicio))),
      paso: mediaDe(pasos),
      longitud,
    }
    // Doble apoyo de la zancada de este pie: de su contacto al despegue del otro, y del contacto del otro a su despegue.
    for (const ci of u) {
      if (ci.despegue === null) continue
      const despOtro = despegues(otro(l)).filter((t) => t > ci.inicio && t < ci.despegue!)
      const contOtro = contactos(otro(l)).filter((t) => t > ci.inicio && t < ci.despegue!)
      if (despOtro.length === 1 && contOtro.length === 1 && despOtro[0]! < contOtro[0]!) {
        dobles.push((100 * (despOtro[0]! - ci.inicio + (ci.despegue - contOtro[0]!))) / (ci.fin - ci.inicio))
      }
    }
  }
  const zancadas = LADOS.flatMap((l) => usados(l).map((ci) => ci.fin - ci.inicio))
  let velocidad: number | null = null
  let anchura: MediaDe | null = null
  if (tr.enMetros) {
    if (!enCinta) {
      const v = LADOS.flatMap((l) =>
        usados(l).flatMap((ci) => {
          const a = pelvisEn(ci.inicio)
          const b = pelvisEn(ci.fin)
          return a && b ? [horizontal(a, b) / (ci.fin - ci.inicio)] : []
        }),
      )
      if (v.length) velocidad = media(v)
    }
    // Anchura: en cada contacto, la separación de lado a lado (perpendicular a hacia donde mira) entre los dos talones.
    const rumbo = rumbos(tr)
    const anchos = LADOS.flatMap((l) =>
      contactos(l).flatMap((t) => {
        const a = posicionEn(talon(l), tr.tiempos, t)
        const b = posicionEn(talon(otro(l)), tr.tiempos, t)
        const k = tr.tiempos.findIndex((x) => x >= t - 1e-9)
        const th = rumbo[k] ?? NaN
        return a && b && Number.isFinite(th) ? [Math.abs(-(b.x - a.x) * Math.sin(th) + (b.y - a.y) * Math.cos(th))] : []
      }),
    )
    if (anchos.length) anchura = mediaDe(anchos)
  }
  return { porPie, cadencia: 120 / media(zancadas), dobleApoyo: mediaDe(dobles), enCinta, velocidad, anchura }
}
