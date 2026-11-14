/*
 * Dinámica inversa sin plataforma de fuerzas sobre el esqueleto ajustado (fase 11, paso 1; D2–D6 de
 * docs/plan-fase-11.md). Todo por kilo de masa corporal y en el marco del mundo calibrado (z hacia arriba, gravedad −z).
 *
 * 1. **Cinemática de los segmentos.** De la postura de cada frame (fase 7) salen el centro de masas y la orientación de
 *    cada segmento (`segmentos.ts`). Se filtran por tramos con el filtro de la sesión (Butterworth ida y vuelta, nunca a
 *    través de un hueco ni de un salto en el tiempo) y se derivan dos veces en la rejilla uniforme (`derivarTramo`): la
 *    aceleración lineal de cada centro de masas y, de la orientación, la velocidad y la aceleración angulares
 *    (Ṙ = [ω]×R ⇒ [ω]× = parte antisimétrica de ṘRᵀ; R̈ = [α]×R + [ω]×²R ⇒ [α]× = parte antisimétrica de R̈Rᵀ).
 * 2. **Fuerza de reacción del suelo total** por la segunda ley de Newton del cuerpo entero: F = Σ mᵢ(aᵢ − g). Es lo
 *    único que la cinemática determina sin suposiciones (con apoyo: en el aire, F tiene que salir ≈ 0).
 * 3. **Centro de presiones total y momento libre** por la ecuación de momentos del cuerpo entero alrededor del origen:
 *    M = Σ [cᵢ × mᵢ(aᵢ − g) + Iᵢαᵢ + ωᵢ × Iᵢωᵢ]; el punto del suelo (z = suelo) donde F da ese momento, más un momento
 *    libre vertical. Solo con F_z por encima del 20 % del peso (si no, sin apoyo: sin centro de presiones).
 * 4. **Reparto entre los dos pies** (D4): un pie apoya si su talón o su punta está a menos de `UMBRAL_APOYO_M` del suelo.
 *    Con uno, se lleva todo. Con los dos, la regla de la palanca: el centro de presiones total se proyecta en la recta
 *    entre los puntos de apoyo de los pies y cada uno se lleva la parte de la fuerza que le toca por cercanía; el centro
 *    de presiones de cada pie es su punto de apoyo con el mismo desplazamiento perpendicular que el total. Así la suma de
 *    los dos da exactamente la fuerza y el momento totales (la ecuación del cuerpo entero se cumple), y lo único supuesto
 *    es cómo se reparten. Es la indeterminación conocida del doble apoyo (Ren, Jones y Howard, 2008; Karatsidis y col.,
 *    2017): no tiene solución con la cinemática sola.
 * 5. **Momentos articulares** de abajo arriba (Newton–Euler en cada segmento: pie → pierna → muslo), con la fuerza de
 *    cada pie en su centro de presiones. Se dan como **momento interno neto** (el que hace el segmento proximal sobre el
 *    distal: músculos, ligamentos y contacto), en sus componentes clínicas y su potencia (M · (ω_distal − ω_proximal);
 *    + genera energía, − la absorbe).
 *
 * Convenios (fijados por `dinamica.test.ts`), con los ejes del segmento proximal:
 * - Sagital: cadera y rodilla, **+ extensor**; tobillo, **+ flexor plantar** (como en Winter: el «momento de soporte»).
 * - Frontal: cadera y rodilla, **+ abductor** (el que se opone a que la rodilla se vaya hacia dentro o la pelvis caiga del
 *   otro lado; en la rodilla, igual en magnitud al «momento aductor externo», KAM, de la marcha). Tobillo: sin frontal.
 * Sin valor = NaN (las primeras y las últimas `RECORTE_BORDE_S` de cada tramo, tramos cortos, huecos, sin apoyo), nunca 0.
 */
import type { Lado } from '../articulaciones/catalogo'
import type { Medidas } from '../esqueleto/modelo'
import { MUESTRAS_MINIMAS } from '../filtros/butterworth'
import { derivarTramo } from '../filtros/derivadas'
import { filtrarTramoConRejilla, SALTO_MAX_PASOS } from '../filtros/tramos'
import { vec3, type Vec3 } from '../geometria/vector'
import { aplicar, multiplicar, traspuesta, type Mat3 } from '../tresd/camara'
import { cuerpoDePostura, enMetros, segmentosDe, type CuerpoEnPostura } from './segmentos'

export const G = 9.81
const GRAVEDAD = vec3(0, 0, -G)
/** Un pie apoya si su talón o su punta están a menos de esto del suelo (m). */
export const UMBRAL_APOYO_M = 0.05
/** Por debajo de esta fuerza vertical total (N/kg; el 20 % del peso) no hay apoyo: sin centro de presiones ni reparto. */
export const FUERZA_MINIMA_APOYO = 0.2 * G
/**
 * Lo que se descarta en cada extremo de un tramo (s). La segunda derivada de lo filtrado se tuerce cerca de los extremos
 * (la reflexión impar del filtro conserva la posición y la pendiente, no la curvatura): con una caída libre, la fuerza
 * salía hasta 5 N/kg de más en el segundo frame y se iba a menos de 0,05 N/kg pasadas unas 0,15 s.
 */
export const RECORTE_BORDE_S = 0.15
/** Percentil de la altura de los pies con el que se estima el suelo si no viene de la calibración. */
const PERCENTIL_SUELO = 0.05

const LADOS = ['der', 'izq'] as const
const s = (l: Lado) => (l === 'izq' ? 1 : -1)
const NAN3 = vec3(NaN, NaN, NaN)

// ---- Álgebra pequeña ----
const mas = (a: Vec3, b: Vec3) => vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const menos = (a: Vec3, b: Vec3) => vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const por = (a: Vec3, k: number) => vec3(a.x * k, a.y * k, a.z * k)
const punto = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cruz = (a: Vec3, b: Vec3) => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const finito = (a: Vec3) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)
/** La columna j de R (el eje j del segmento en el laboratorio), unitaria. */
function eje(R: Mat3, j: number): Vec3 {
  const v = vec3(R[j]!, R[3 + j]!, R[6 + j]!)
  const n = Math.hypot(v.x, v.y, v.z)
  return por(v, 1 / n)
}
/** El vector de la parte antisimétrica de una matriz: (W − Wᵀ)/2 = [w]×. */
const vee = (W: Mat3): Vec3 => vec3((W[7]! - W[5]!) / 2, (W[2]! - W[6]!) / 2, (W[3]! - W[1]!) / 2)

/** La velocidad angular (rad/s, en el laboratorio) de una orientación R y su derivada Ṙ. */
export const velocidadAngular = (R: Mat3, Rp: Mat3): Vec3 => vee(multiplicar(Rp, traspuesta(R)))
/** La aceleración angular (rad/s²) de R y su segunda derivada R̈. */
export const aceleracionAngular = (R: Mat3, Rpp: Mat3): Vec3 => vee(multiplicar(Rpp, traspuesta(R)))

/** El estado de un segmento en un instante: lo de `Segmento` más sus derivadas. */
export interface SegmentoMovil {
  readonly masa: number
  readonly com: Vec3
  readonly R: Mat3
  readonly inercia: readonly [number, number, number]
  /** Aceleración del centro de masas (m/s²), velocidad y aceleración angulares (rad/s, rad/s²). */
  readonly a: Vec3
  readonly w: Vec3
  readonly al: Vec3
}

/** Iα + ω × Iω en el laboratorio (la derivada del momento angular alrededor del centro de masas). */
export function derivadaMomentoAngular(sg: SegmentoMovil): Vec3 {
  const Rt = traspuesta(sg.R)
  const [ix, iy, iz] = sg.inercia
  const enSeg = (v: Vec3) => aplicar(Rt, v)
  const Iv = (v: Vec3) => {
    const l = enSeg(v)
    return aplicar(sg.R, vec3(ix * l.x, iy * l.y, iz * l.z))
  }
  return mas(Iv(sg.al), cruz(sg.w, Iv(sg.w)))
}

/**
 * Newton–Euler de un segmento: con la fuerza y el momento que recibe por su extremo distal (`Fd`, `Md`, aplicada en
 * `rd`), la fuerza y el momento que recibe del segmento proximal en `rp`.
 *   Fp + Fd = m(a − g)        Mp + Md + (rp − c) × Fp + (rd − c) × Fd = Iα + ω × Iω
 */
export function newtonEuler(sg: SegmentoMovil, Fd: Vec3, Md: Vec3, rd: Vec3, rp: Vec3): { readonly F: Vec3; readonly M: Vec3 } {
  const F = menos(por(menos(sg.a, GRAVEDAD), sg.masa), Fd)
  const M = menos(menos(menos(derivadaMomentoAngular(sg), Md), cruz(menos(rp, sg.com), F)), cruz(menos(rd, sg.com), Fd))
  return { F, M }
}

/**
 * La fuerza del suelo total, su centro de presiones en el plano z = suelo y el momento libre vertical, de la ecuación del
 * cuerpo entero. Centro de presiones y momento libre NaN si F_z < `FUERZA_MINIMA_APOYO`.
 */
export function reaccionTotal(segs: readonly SegmentoMovil[], suelo: number): { readonly F: Vec3; readonly cop: Vec3; readonly libre: number } {
  let F = vec3(0, 0, 0)
  let M = vec3(0, 0, 0)
  for (const sg of segs) {
    const f = por(menos(sg.a, GRAVEDAD), sg.masa)
    F = mas(F, f)
    M = mas(M, mas(cruz(sg.com, f), derivadaMomentoAngular(sg)))
  }
  if (!(F.z >= FUERZA_MINIMA_APOYO)) return { F, cop: NAN3, libre: NaN }
  // M = p × F + (0, 0, libre), con p = (px, py, h).
  const h = suelo
  const px = (h * F.x - M.y) / F.z
  const py = (M.x + h * F.y) / F.z
  const libre = M.z - (px * F.y - py * F.x)
  return { F, cop: vec3(px, py, h), libre }
}

export interface ReaccionPie {
  readonly F: Vec3
  readonly cop: Vec3
  readonly libre: number
}

/**
 * Reparte la fuerza total entre los pies que apoyan (`apoyos`: el punto de apoyo de cada uno en el suelo, o null).
 * Regla de la palanca a lo largo de la recta entre los dos apoyos, conservando la fuerza y el momento totales.
 */
export function repartir(F: Vec3, cop: Vec3, libre: number, apoyos: Readonly<Record<Lado, Vec3 | null>>): Record<Lado, ReaccionPie | null> {
  const a = apoyos.der
  const b = apoyos.izq
  if (!finito(cop)) return { der: null, izq: null }
  if (a && !b) return { der: { F, cop, libre }, izq: null }
  if (b && !a) return { der: null, izq: { F, cop, libre } }
  if (!a || !b) return { der: null, izq: null }
  const d = vec3(b.x - a.x, b.y - a.y, 0)
  const d2 = d.x * d.x + d.y * d.y
  const lambda = d2 > 1e-12 ? Math.min(1, Math.max(0, ((cop.x - a.x) * d.x + (cop.y - a.y) * d.y) / d2)) : 0.5
  // El desplazamiento del centro de presiones total respecto a su punto en la recta (perpendicular, o el exceso más allá
  // de un extremo): cada pie lo lleva igual, y la suma ponderada vuelve a dar el total.
  const e = vec3(cop.x - (a.x + lambda * d.x), cop.y - (a.y + lambda * d.y), 0)
  return {
    der: { F: por(F, 1 - lambda), cop: vec3(a.x + e.x, a.y + e.y, cop.z), libre: (1 - lambda) * libre },
    izq: { F: por(F, lambda), cop: vec3(b.x + e.x, b.y + e.y, cop.z), libre: lambda * libre },
  }
}

// ---- Toda la toma ----

export type IdArticulacionCinetica = 'cadera' | 'rodilla' | 'tobillo'

export interface SerieArticulacion {
  /** Momento interno neto sobre el segmento distal (N·m/kg, laboratorio). */
  readonly momento: readonly Vec3[]
  /** Componente sagital: + extensor (cadera, rodilla), + flexor plantar (tobillo). N·m/kg. */
  readonly sagital: readonly number[]
  /** Componente frontal: + abductor (cadera, rodilla); NaN en el tobillo. N·m/kg. */
  readonly frontal: readonly number[]
  /** Potencia (W/kg): + genera, − absorbe. */
  readonly potencia: readonly number[]
}

export interface ResultadoCinetica {
  readonly tiempos: readonly number[]
  /** La altura del suelo usada (m). */
  readonly suelo: number
  /** Centro de masas del cuerpo (m, filtrado) y su velocidad (m/s). */
  readonly com: readonly Vec3[]
  readonly velocidadCom: readonly Vec3[]
  /** Fuerza del suelo total (N/kg; entre G, en pesos corporales), centro de presiones (m) y momento libre (N·m/kg). */
  readonly fuerza: readonly Vec3[]
  readonly cop: readonly Vec3[]
  readonly libre: readonly number[]
  /** Por pie: si apoya, su fuerza (N/kg) y su centro de presiones. */
  readonly pies: Readonly<Record<Lado, { readonly apoyo: readonly boolean[]; readonly fuerza: readonly Vec3[]; readonly cop: readonly Vec3[] }>>
  readonly articulaciones: Readonly<Record<Lado, Readonly<Record<IdArticulacionCinetica, SerieArticulacion>>>>
}

export interface EntradaCinetica {
  readonly tiempos: readonly number[]
  /** La postura de cada frame (fase 7), en las unidades de la calibración; null sin ajuste (un hueco). */
  readonly posturas: readonly (readonly number[] | null)[]
  readonly medidas: Medidas
  /** Metros por unidad de la calibración (sin escala no hay cinética: g necesita metros). */
  readonly metrosPorUnidad: number
  /** Altura del suelo en las unidades de la calibración; null: se estima de los pies. */
  readonly suelo: number | null
  /** fps de referencia (mediana) y corte del filtro de la sesión (Hz). */
  readonly fs: number
  readonly corteHz: number
  /**
   * 'dinamica' (por defecto): con las aceleraciones. 'cuasiestatica': sin ellas (aceleraciones lineales y angulares 0):
   * la fuerza es el peso, el centro de presiones cae bajo el centro de masas y los momentos son los que sostienen la
   * postura. Solo usa posiciones, así que el ruido apenas le afecta; vale para movimientos lentos (D5).
   */
  readonly modo?: 'dinamica' | 'cuasiestatica'
}

// Canales por frame: 7 segmentos × (centro de masas 3 + R 9), la R de la pelvis (9) y 6 puntos por lado (36).
const N_SEG = 7
const C_PELVIS = N_SEG * 12
const C_PUNTOS = C_PELVIS + 9
const PUNTOS = ['cadera', 'rodilla', 'tobillo', 'talon', 'punta'] as const
const N_CANALES = C_PUNTOS + PUNTOS.length * 2 * 3
const N_DERIVADOS = C_PUNTOS

function canalesDe(c: CuerpoEnPostura): number[] {
  const r: number[] = []
  for (const sg of segmentosDe(c)) r.push(sg.com.x, sg.com.y, sg.com.z, ...sg.R)
  r.push(...c.pelvis)
  for (const p of PUNTOS) for (const l of LADOS) r.push(c.puntos[p][l].x, c.puntos[p][l].y, c.puntos[p][l].z)
  return r
}
const v3 = (a: ArrayLike<number>, i: number) => vec3(a[i]!, a[i + 1]!, a[i + 2]!)
const m3 = (a: ArrayLike<number>, i: number) => Array.from({ length: 9 }, (_, k) => a[i + k]!) as unknown as Mat3

/** El suelo estimado de los pies: el percentil 5 de la altura del punto más bajo de cada pie (m). */
export function estimarSuelo(cuerpos: readonly (CuerpoEnPostura | null)[]): number {
  const zs: number[] = []
  for (const c of cuerpos) {
    if (!c) continue
    for (const l of LADOS) zs.push(Math.min(c.puntos.talon[l].z, c.puntos.punta[l].z))
  }
  if (!zs.length) return NaN
  zs.sort((a, b) => a - b)
  return zs[Math.min(zs.length - 1, Math.floor(PERCENTIL_SUELO * zs.length))]!
}

/** La cinética de toda la toma. */
export function cineticaDeLaToma(e: EntradaCinetica): ResultadoCinetica {
  const n = e.tiempos.length
  const k = e.metrosPorUnidad
  const cuasi = e.modo === 'cuasiestatica'
  const cuerpos = e.posturas.map((q) => {
    if (!q) return null
    const m = enMetros(q, e.medidas, k)
    return cuerpoDePostura(m.q, m.m)
  })
  const suelo = e.suelo !== null && Number.isFinite(e.suelo) ? e.suelo * k : estimarSuelo(cuerpos)

  const nanV = () => Array.from({ length: n }, () => NAN3)
  const nanN = () => new Array<number>(n).fill(NaN)
  const com = nanV()
  const velocidadCom = nanV()
  const fuerza = nanV()
  const cop = nanV()
  const libre = nanN()
  const pies = Object.fromEntries(LADOS.map((l) => [l, { apoyo: new Array<boolean>(n).fill(false), fuerza: nanV(), cop: nanV() }])) as Record<Lado, { apoyo: boolean[]; fuerza: Vec3[]; cop: Vec3[] }>
  const serie = () => ({ momento: nanV(), sagital: nanN(), frontal: nanN(), potencia: nanN() })
  const articulaciones = Object.fromEntries(LADOS.map((l) => [l, { cadera: serie(), rodilla: serie(), tobillo: serie() }])) as Record<Lado, Record<IdArticulacionCinetica, ReturnType<typeof serie>>>

  const pasoMax = SALTO_MAX_PASOS / e.fs
  let i = 0
  while (i < n) {
    if (!cuerpos[i]) {
      i++
      continue
    }
    let j = i
    while (j + 1 < n && cuerpos[j + 1] && e.tiempos[j + 1]! - e.tiempos[j]! <= pasoMax) j++
    if (j - i + 1 >= MUESTRAS_MINIMAS) procesarTramo(i, j)
    i = j + 1
  }

  function procesarTramo(i0: number, i1: number) {
    const ts = e.tiempos.slice(i0, i1 + 1)
    const filas = cuerpos.slice(i0, i1 + 1).map((c) => canalesDe(c!))
    const canales = Array.from({ length: N_CANALES }, (_, c) => filas.map((f) => f[c]!))
    const f = filtrarTramoConRejilla(ts, canales, e.fs, e.corteHz)
    const der = Array.from({ length: N_DERIVADOS }, (_, c) => derivarTramo(f.rejilla, f.enRejilla[c]!, ts))
    for (let t = 0; t < ts.length; t++) {
      if (ts[t]! - ts[0]! < RECORTE_BORDE_S || ts[ts.length - 1]! - ts[t]! < RECORTE_BORDE_S) continue
      const idx = i0 + t
      const val = (c: number) => f.enTiempos[c]![t]!
      const vel = (c: number) => der[c]!.velocidad[t]!
      const acc = (c: number) => der[c]!.aceleracion[t]!
      const lista = (fn: (c: number) => number, desde: number, cuantos: number) => Array.from({ length: cuantos }, (_, q) => fn(desde + q))
      const pos = lista(val, 0, N_CANALES)
      // Centro de masas del cuerpo (filtrado) y su velocidad.
      const masas = segmentosDe(cuerpos[idx]!).map((sg) => sg.masa)
      const total = masas.reduce((a, b) => a + b, 0)
      let cx = vec3(0, 0, 0)
      let cv = vec3(0, 0, 0)
      for (let q = 0; q < N_SEG; q++) {
        cx = mas(cx, por(v3(pos, q * 12), masas[q]! / total))
        cv = mas(cv, por(vec3(vel(q * 12), vel(q * 12 + 1), vel(q * 12 + 2)), masas[q]! / total))
      }
      com[idx] = cx
      velocidadCom[idx] = cv

      const base = segmentosDe(cuerpos[idx]!)
      const segs: SegmentoMovil[] = base.map((sg, q) => {
        const c0 = q * 12
        const R = m3(pos, c0 + 3)
        return {
          masa: sg.masa,
          inercia: sg.inercia,
          com: v3(pos, c0),
          R,
          a: vec3(acc(c0), acc(c0 + 1), acc(c0 + 2)),
          w: velocidadAngular(R, m3(lista(vel, c0 + 3, 9), 0)),
          al: aceleracionAngular(R, m3(lista(acc, c0 + 3, 9), 0)),
        }
      })
      if (!segs.every((sg) => finito(sg.a) && finito(sg.w) && finito(sg.al))) continue
      // Lo que entra en las ecuaciones: sin aceleraciones en el modo cuasiestático (la velocidad angular sigue para la potencia).
      const quieto = (sg: SegmentoMovil): SegmentoMovil => ({ ...sg, a: vec3(0, 0, 0), w: vec3(0, 0, 0), al: vec3(0, 0, 0) })
      const ec = cuasi ? segs.map(quieto) : segs
      const Rp = m3(pos, C_PELVIS)
      const wPelvis = velocidadAngular(Rp, m3(lista(vel, C_PELVIS, 9), 0))
      const punto3 = (p: (typeof PUNTOS)[number], l: Lado) => v3(pos, C_PUNTOS + (PUNTOS.indexOf(p) * 2 + LADOS.indexOf(l)) * 3)

      const r = reaccionTotal(ec, suelo)
      fuerza[idx] = r.F
      cop[idx] = r.cop
      libre[idx] = r.libre
      // Apoyos: el punto de apoyo de cada pie es la media de su talón y su punta que estén cerca del suelo, en el suelo.
      const apoyos = {} as Record<Lado, Vec3 | null>
      for (const l of LADOS) {
        const cerca = [punto3('talon', l), punto3('punta', l)].filter((p) => p.z - suelo < UMBRAL_APOYO_M)
        apoyos[l] = cerca.length ? vec3(cerca.reduce((a, p) => a + p.x, 0) / cerca.length, cerca.reduce((a, p) => a + p.y, 0) / cerca.length, suelo) : null
        pies[l].apoyo[idx] = apoyos[l] !== null
      }
      const reparto = repartir(r.F, r.cop, r.libre, apoyos)
      const [, musloD, musloI, piernaD, piernaI, pieD, pieI] = ec as [SegmentoMovil, SegmentoMovil, SegmentoMovil, SegmentoMovil, SegmentoMovil, SegmentoMovil, SegmentoMovil]
      const porLado = { der: { muslo: musloD, pierna: piernaD, pie: pieD }, izq: { muslo: musloI, pierna: piernaI, pie: pieI } }
      // En el aire (fuerza vertical total por debajo del 20 % del peso), ningún pie recibe nada y los momentos salen de la
      // inercia de cada pierna. Con apoyo, un pie que no apoya va sin fuerza; si no se ve apoyar a ninguno, no se sabe.
      const enElAire = !finito(r.cop)
      const algunApoyo = LADOS.some((o) => reparto[o])
      for (const l of LADOS) {
        const rp = reparto[l]
        if (!rp && !enElAire && !algunApoyo) continue
        pies[l].fuerza[idx] = rp ? rp.F : vec3(0, 0, 0)
        pies[l].cop[idx] = rp ? rp.cop : NAN3
        const Fg = rp ? rp.F : vec3(0, 0, 0)
        const Mg = rp ? vec3(0, 0, rp.libre) : vec3(0, 0, 0)
        const rg = rp ? rp.cop : punto3('tobillo', l)
        const p = porLado[l]
        const tob = punto3('tobillo', l)
        const rod = punto3('rodilla', l)
        const cad = punto3('cadera', l)
        const pie = newtonEuler(p.pie, Fg, Mg, rg, tob)
        const pierna = newtonEuler(p.pierna, por(pie.F, -1), por(pie.M, -1), tob, rod)
        const muslo = newtonEuler(p.muslo, por(pierna.F, -1), por(pierna.M, -1), rod, cad)
        const art = articulaciones[l]
        const poner = (id: IdArticulacionCinetica, M: Vec3, Rprox: Mat3, wProx: Vec3, wDist: Vec3) => {
          const a = art[id]
          a.momento[idx] = M
          const y = punto(M, eje(Rprox, 1))
          a.sagital[idx] = id === 'rodilla' ? -y : y
          a.frontal[idx] = id === 'tobillo' ? NaN : s(l) * punto(M, eje(Rprox, 0))
          a.potencia[idx] = punto(M, menos(wDist, wProx))
        }
        const w = (q: number) => segs[q]!.w
        const [iM, iP, iF] = l === 'der' ? [1, 3, 5] : [2, 4, 6]
        poner('cadera', muslo.M, Rp, wPelvis, w(iM))
        poner('rodilla', pierna.M, p.muslo.R, w(iM), w(iP))
        poner('tobillo', pie.M, p.pierna.R, w(iP), w(iF))
      }
    }
  }

  return { tiempos: e.tiempos, suelo, com, velocidadCom, fuerza, cop, libre, pies, articulaciones }
}
