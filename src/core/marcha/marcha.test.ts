import { describe, expect, it } from 'vitest'
import { serieAngular, type MuestraAngulo } from '../articulaciones/calculo'
import { articulacionesSagitales, marcadores, type Lado } from '../articulaciones/catalogo'
import { comoMuestras, filtrarTrayectoria } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import type { Muestra2D } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { analizarMarcha, idsDelPie } from './analisis'
import { alternarExcluido, MARCHA_VACIA } from './guardado'
import { ciclosDe, mediaYDesviacion, normalizarCiclo, parametrosMarcha, PUNTOS_CICLO, type Ciclo } from './ciclos'
import { adelanteEn, conCorrecciones, detectarEventos, maximos, type EventoMarcha, type PuntosPie } from './eventos'
import { angulosEnFase, eventosVerdad, MARCHA_DEFECTO, puntosMarcha, type OpcionesMarcha } from './sintetico'

const FPS = 30
const ESCALA = 400 // px por metro
const AJUSTES = { corteHz: 6 }

/** Pseudoaleatorio con semilla (para que el ruido sea siempre el mismo). */
function aleatorio(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * La persona que anda vista de perfil, en px de la imagen, con fps variable (±15 % alrededor de 30), ruido gaussiano
 * aproximado de `ruidoPx` y, en `sinPersona`, frames sin nada.
 */
function grabar(
  o: OrientacionVista,
  { duracion = 8, ruidoPx = 0, sinPersona = [] as readonly number[], opciones = MARCHA_DEFECTO as OpcionesMarcha, variable = true } = {},
) {
  const azar = aleatorio(7)
  const gauss = () => (azar() + azar() + azar() + azar() - 2) * Math.sqrt(3)
  const tiempos: number[] = []
  for (let t = 0; t < duracion; t += (1 / FPS) * (variable ? 0.85 + 0.3 * azar() : 1)) tiempos.push(t)
  const espejo = o.plano === 'sagital' && o.mira === 'izquierda'
  const aImg = (p: { x: number; y: number }) => ({ x: 900 + (espejo ? -1 : 1) * p.x * ESCALA + ruidoPx * gauss(), y: 1000 - p.y * ESCALA + ruidoPx * gauss() })
  const serie = (f: (q: ReturnType<typeof puntosMarcha>) => { x: number; y: number }) =>
    tiempos.map((t, i): Muestra2D => {
      if (sinPersona.includes(i)) return { t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
      const p = aImg(f(puntosMarcha(t, opciones)))
      return { t, x: p.x, y: p.y, calidad: 0.95, editadoManual: false }
    })
  const pie = (l: Lado): PuntosPie => ({ cadera: serie((q) => q[l].cadera), talon: serie((q) => q[l].talon), punta: serie((q) => q[l].punta) })
  const m = marcadores('der')
  const gomets = {
    [m.hombro]: serie((q) => q.hombro),
    [m.cadera]: serie((q) => q.der.cadera),
    [m.rodilla]: serie((q) => q.der.rodilla),
    [m.tobillo]: serie((q) => q.der.tobillo),
    [m.talon]: serie((q) => q.der.talon),
    [m.antepie]: serie((q) => q.der.punta),
  }
  return { tiempos, pie, gomets }
}

const PERFIL_D: OrientacionVista = { plano: 'sagital', mira: 'derecha' }
const PERFIL_I: OrientacionVista = { plano: 'sagital', mira: 'izquierda' }

describe('la persona sintética que anda', () => {
  it('cada zancada tiene un contacto y un despegue de cada pie, con un apoyo de alrededor del 60 %', () => {
    const v = eventosVerdad(0, 8)
    for (const l of ['der', 'izq'] as const) {
      const c = v.filter((e) => e.lado === l && e.tipo === 'contacto').map((e) => e.t)
      const d = v.filter((e) => e.lado === l && e.tipo === 'despegue').map((e) => e.t)
      expect(c.length).toBeGreaterThanOrEqual(6)
      for (let k = 1; k < c.length; k++) {
        expect(c[k]! - c[k - 1]!).toBeCloseTo(MARCHA_DEFECTO.zancada, 6)
        const dentro = d.filter((t) => t > c[k - 1]! && t < c[k]!)
        expect(dentro).toHaveLength(1)
        const apoyo = (dentro[0]! - c[k - 1]!) / MARCHA_DEFECTO.zancada
        expect(apoyo).toBeGreaterThan(0.55)
        expect(apoyo).toBeLessThan(0.7)
      }
    }
  })

  it('las curvas son las típicas: cadera de unos +30° a −10°, rodilla hasta unos 60° en el balanceo', () => {
    const f = Array.from({ length: 101 }, (_, k) => angulosEnFase(k / 100))
    expect(Math.max(...f.map((a) => a.cadera))).toBeCloseTo(32, 0)
    expect(Math.min(...f.map((a) => a.cadera))).toBeCloseTo(-12, 0)
    expect(Math.max(...f.map((a) => a.rodilla))).toBeGreaterThan(55)
    expect(Math.max(...f.map((a) => a.rodilla))).toBeLessThan(65)
  })
})

describe('maximos', () => {
  it('encuentra los picos afinados con la parábola y descarta los pequeños, los cercanos y los bordes', () => {
    const ts = Array.from({ length: 200 }, (_, i) => i / 50)
    // Picos de cos en t = 1 y 3 (más el borde en 0, que no cuenta) y un rizo pequeño en t = 2.
    const v = ts.map((t) => Math.cos(Math.PI * t) + 0.05 * Math.cos(40 * Math.PI * t) * (Math.abs(t - 2) < 0.1 ? 1 : 0))
    const r = maximos(ts, v)
    expect(r.filter((t) => Math.abs(t - 2) < 0.2)).toHaveLength(1) // el de cos en t = 2 (el rizo, no aparte)
    expect(r.some((t) => t < 0.05)).toBe(false)
    expect(r.filter((t) => Math.abs(t - 1) < 0.2)).toHaveLength(0) // en t = 1, cos es mínimo
    // Un seno muestreado irregularmente: el pico cae entre frames y la parábola lo afina.
    const ts2 = [0, 0.11, 0.2, 0.33, 0.41, 0.52, 0.6, 0.71, 0.8, 0.95, 1.0]
    const v2 = ts2.map((t) => -((t - 0.47) ** 2))
    expect(maximos(ts2, v2)[0]).toBeCloseTo(0.47, 9)
  })
})

describe('eventos y ciclos de perfil (D1–D4)', () => {
  /** El evento de verdad más cercano del mismo tipo y pie. */
  const errorFrente = (e: EventoMarcha, verdad: ReturnType<typeof eventosVerdad>) =>
    Math.min(...verdad.filter((v) => v.tipo === e.tipo && v.lado === e.lado).map((v) => Math.abs(v.t - e.t)))

  it.each([PERFIL_D, PERFIL_I])('sin ruido, mirando a la $mira: cada evento a menos de un milisegundo de la verdad, y todos', (o) => {
    const g = grabar(o)
    const verdad = eventosVerdad(0, 8)
    for (const l of ['der', 'izq'] as const) {
      const d = detectarEventos(g.pie(l), l, o, FPS, AJUSTES)
      // Todos los de verdad lejos de los bordes (el filtro y el borde del tramo se comen alguno del principio y del final).
      const centrales = verdad.filter((v) => v.lado === l && v.t > 0.3 && v.t < 7.7)
      for (const v of centrales) expect(d.eventos.some((e) => e.tipo === v.tipo && Math.abs(e.t - v.t) < 0.005), `${v.tipo} ${l} en ${v.t}`).toBe(true)
      // (La verdad no da los de cerca de los bordes: ahí no se comparan.)
      for (const e of d.eventos.filter((x) => x.t > 0.5 && x.t < 7.5)) expect(errorFrente(e, verdad)).toBeLessThan(0.005)
    }
  })

  it('con 2 px de ruido, a menos de un frame; con un hueco, ningún ciclo lo cruza', () => {
    const sinPersona = Array.from({ length: 12 }, (_, k) => 110 + k)
    const g = grabar(PERFIL_D, { ruidoPx: 2, sinPersona })
    const verdad = eventosVerdad(0, 8)
    const d = detectarEventos(g.pie('der'), 'der', PERFIL_D, FPS, AJUSTES)
    for (const e of d.eventos.filter((x) => x.t > 0.5 && x.t < 7.5)) expect(errorFrente(e, verdad)).toBeLessThan(1 / FPS)
    expect(d.tramos).toHaveLength(2)
    const ciclos = ciclosDe(d.eventos, 'der', d.tramos)
    const hueco = { desde: g.tiempos[110]!, hasta: g.tiempos[121]! }
    for (const c of ciclos.filter((x) => !x.descarte)) expect(c.fin < hueco.desde || c.inicio > hueco.hasta).toBe(true)
    expect(ciclos.some((c) => c.descarte === 'hueco')).toBe(true)
    expect(ciclos.filter((c) => !c.descarte).length).toBeGreaterThanOrEqual(4)
  })

  it('un ciclo con un contacto perdido o un tropiezo queda descartado por duración o por despegues', () => {
    const c = (t: number): EventoMarcha => ({ tipo: 'contacto', lado: 'der', t })
    const d = (t: number): EventoMarcha => ({ tipo: 'despegue', lado: 'der', t })
    const eventos = [c(0), d(0.65), c(1.1), d(1.75), c(2.2), d(2.85), /* contacto perdido */ d(3.95), c(4.4), d(5.05), c(5.5)]
    const ciclos = ciclosDe(eventos, 'der', [])
    expect(ciclos.map((x) => x.descarte)).toEqual([null, null, 'despegues', null])
    const corto = ciclosDe([c(0), d(0.6), c(1.1), d(1.7), c(2.2), d(2.4), c(2.6), d(3.3), c(3.7)], 'der', [])
    expect(corto.map((x) => x.descarte)).toEqual([null, null, 'duracion', null])
  })
})

describe('normalización y curva media (D5)', () => {
  // El filtro de 6 Hz rebaja unas décimas el pico del balanceo, y unos ms de error en el evento son algo más de 1° donde
  // la rodilla se dobla más deprisa (unos 250 °/s): de ahí 2°.
  it('la rodilla de cada ciclo normalizado es la curva de verdad (a menos de 2° con ruido y filtro)', () => {
    const g = grabar(PERFIL_D, { ruidoPx: 1 })
    const d = detectarEventos(g.pie('der'), 'der', PERFIL_D, FPS, AJUSTES)
    const ciclos = ciclosDe(d.eventos, 'der', d.tramos).filter((c) => !c.descarte)
    const rodilla = articulacionesSagitales('der').find((a) => a.id === 'rodilla_sagital_der')!
    // El ángulo de siempre, de las coordenadas filtradas por tramos con el filtro de la sesión (como el visor).
    const filtradas = Object.fromEntries(Object.entries(g.gomets).map(([id, s]) => [id, comoMuestras(filtrarTrayectoria(s, FPS, AJUSTES))]))
    const filtrada = serieAngular(rodilla, filtradas, PERFIL_D)
    const normalizados = ciclos.map((c) => normalizarCiclo(filtrada, c.inicio, c.fin)!)
    expect(normalizados.length).toBeGreaterThanOrEqual(5)
    // La verdad: la fase de la pierna derecha en el instante del k % del ciclo.
    for (const [j, c] of ciclos.entries()) {
      for (let k = 0; k < PUNTOS_CICLO; k += 5) {
        const t = c.inicio + ((c.fin - c.inicio) * k) / 100
        const verdad = angulosEnFase(MARCHA_DEFECTO.fase0 + t / MARCHA_DEFECTO.zancada).rodilla
        expect(Math.abs(normalizados[j]![k]! - verdad), `ciclo ${j}, ${k} %`).toBeLessThan(2)
      }
    }
    const md = mediaYDesviacion(normalizados)!
    expect(md.media).toHaveLength(PUNTOS_CICLO)
    expect(Math.max(...md.de)).toBeLessThan(1)
    expect(Math.max(...md.media)).toBeGreaterThan(55)
  })

  it('un ciclo con un frame sin valor no se normaliza; con un ciclo la DE no existe', () => {
    const serie: MuestraAngulo[] = Array.from({ length: 40 }, (_, i) => ({ t: i / 30, valor: i === 20 ? NaN : i, interpolado: false }))
    expect(normalizarCiclo(serie, 0.1, 1.2)).toBeNull()
    const ok = normalizarCiclo(serie, 0, 0.6)!
    expect(ok[0]).toBeCloseTo(0, 9)
    expect(ok[50]).toBeCloseTo(9, 9)
    expect(ok[100]).toBeCloseTo(18, 9)
    const md = mediaYDesviacion([ok])!
    expect(md.media[100]).toBeCloseTo(18, 9)
    expect(md.de.every(Number.isNaN)).toBe(true)
    expect(mediaYDesviacion([])).toBeNull()
  })
})

describe('parámetros espaciotemporales (D6)', () => {
  const ciclosVerdad = (o: OpcionesMarcha): Ciclo[] => {
    const v = eventosVerdad(0, 8, o).filter((e) => e.lado === 'der')
    const c = v.filter((e) => e.tipo === 'contacto')
    return c.slice(0, -1).map((e, k) => ({ lado: 'der', inicio: e.t, fin: c[k + 1]!.t, despegue: v.find((x) => x.tipo === 'despegue' && x.t > e.t && x.t < c[k + 1]!.t)!.t, descarte: null }))
  }

  it('por el suelo y con escala: zancada, cadencia, apoyo, longitud y velocidad exactos sin ruido', () => {
    const g = grabar(PERFIL_I, { variable: false })
    const ciclos = ciclosVerdad(MARCHA_DEFECTO)
    const p = parametrosMarcha(ciclos, adelanteEn(g.pie('der').cadera, PERFIL_I), adelanteEn(g.pie('der').talon, PERFIL_I), 0.2 * ESCALA, 1 / ESCALA)!
    expect(p.ciclos).toBe(ciclos.length)
    expect(p.zancada.media).toBeCloseTo(1.1, 6)
    expect(p.cadencia).toBeCloseTo(120 / 1.1, 4)
    expect(p.apoyo.media).toBeGreaterThan(55)
    expect(p.apoyo.media).toBeLessThan(70)
    expect(p.enCinta).toBe(false)
    // La cadera avanza 1,2 m/s · 1,1 s = 1,32 m por zancada; el talón, lo mismo de contacto a contacto (misma fase).
    expect(p.velocidad!).toBeCloseTo(1.2, 2)
    expect(p.longitud!.media).toBeCloseTo(1.32, 2)
  })

  it('en cinta: se dice, y no hay longitud ni velocidad; sin escala, tampoco', () => {
    const o = { ...MARCHA_DEFECTO, velocidad: 0 }
    const g = grabar(PERFIL_D, { opciones: o })
    const ciclos = ciclosVerdad(o)
    const p = parametrosMarcha(ciclos, adelanteEn(g.pie('der').cadera, PERFIL_D), adelanteEn(g.pie('der').talon, PERFIL_D), 0.2 * ESCALA, 1 / ESCALA)!
    expect(p.enCinta).toBe(true)
    expect(p.longitud).toBeNull()
    expect(p.velocidad).toBeNull()
    const g2 = grabar(PERFIL_D)
    const sinEscala = parametrosMarcha(ciclosVerdad(MARCHA_DEFECTO), adelanteEn(g2.pie('der').cadera, PERFIL_D), adelanteEn(g2.pie('der').talon, PERFIL_D), 80, null)!
    expect(sinEscala.enCinta).toBe(false)
    expect(sinEscala.longitud).toBeNull()
    expect(parametrosMarcha([], () => 0, () => 0, 1, null)).toBeNull()
  })
})

describe('correcciones a mano (D7)', () => {
  it('un evento manual sustituye al detectado cercano y uno quitado no vuelve al detectar', () => {
    const det: EventoMarcha[] = [
      { tipo: 'contacto', lado: 'der', t: 1 },
      { tipo: 'despegue', lado: 'der', t: 1.6 },
      { tipo: 'contacto', lado: 'der', t: 2.1 },
    ]
    const r = conCorrecciones(det, [{ tipo: 'contacto', lado: 'der', t: 1.05 }], [{ tipo: 'despegue', lado: 'der', t: 1.62 }])
    expect(r).toEqual([
      { tipo: 'contacto', lado: 'der', t: 1.05, manual: true },
      { tipo: 'contacto', lado: 'der', t: 2.1 },
    ])
  })
})

describe('el análisis entero (analizarMarcha)', () => {
  it('con los puntos del modelo: ciclos, curva media de la rodilla relativa al cero, excluir un ciclo y en cinta forzado', () => {
    const g = grabar(PERFIL_D, { ruidoPx: 1 })
    const p = g.pie('der')
    const series = new Map<string, (Muestra2D | undefined)[]>([
      [idPose('cadera', 'der'), [...p.cadera]],
      [idPose('talon', 'der'), [...p.talon]],
      [idPose('punta', 'der'), [...p.punta]],
    ])
    const ids = idsDelPie(series, 'der', 'gomets')!
    expect(ids.talon).toBe(idPose('talon', 'der')) // sin gomets del pie, los del modelo
    expect(idsDelPie(new Map(), 'der', 'sinMarcadores')).toBeNull()
    const rodilla = articulacionesSagitales('der').find((a) => a.id === 'rodilla_sagital_der')!
    const filtradas = Object.fromEntries(Object.entries(g.gomets).map(([id, s]) => [id, comoMuestras(filtrarTrayectoria(s, FPS, AJUSTES))]))
    const serieAngulo = serieAngular(rodilla, filtradas, PERFIL_D)
    const base = { series, orientacion: PERFIL_D, lado: 'der' as const, ids, fs: FPS, ajustes: AJUSTES, guardado: MARCHA_VACIA, serieAngulo, cero: null, metrosPorPx: 1 / ESCALA }
    const a = analizarMarcha(base)
    const validos = a.ciclos.filter((c) => !c.descarte)
    expect(validos.length).toBeGreaterThanOrEqual(5)
    expect(a.parametros!.ciclos).toBe(validos.length)
    expect(a.parametros!.zancada.media).toBeCloseTo(1.1, 2)
    expect(a.parametros!.velocidad!).toBeCloseTo(1.2, 1)
    expect(a.despegueMedio).toBeGreaterThan(55)
    const conCero = analizarMarcha({ ...base, cero: 4 })
    expect(conCero.media!.media[50]!).toBeCloseTo(a.media!.media[50]! - 4, 9)
    const sinUno = analizarMarcha({ ...base, guardado: alternarExcluido(MARCHA_VACIA, validos[0]!.inicio) })
    expect(sinUno.parametros!.ciclos).toBe(validos.length - 1)
    expect(sinUno.ciclos[a.ciclos.indexOf(validos[0]!)]!.excluido).toBe(true)
    const cinta = analizarMarcha({ ...base, guardado: { ...MARCHA_VACIA, enCinta: true } })
    expect(cinta.parametros!.enCinta).toBe(true)
    expect(cinta.parametros!.longitud).toBeNull()
  })
})
