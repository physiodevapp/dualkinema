/*
 * Ajuste del esqueleto a lo que ven las dos cámaras (fase 7, D2 y D3 de docs/plan-fase-7.md): las medidas de la persona
 * sacadas de la propia toma y, frame a frame, la postura (21 grados de libertad) que mejor explica los puntos 2D de las dos
 * vistas reproyectados (cinemática inversa sobre las imágenes, no sobre los puntos 3D: cuenta también lo que ve una sola
 * cámara). Levenberg–Marquardt con jacobiano numérico, pérdida de Huber, límites articulares suaves, continuidad con el
 * frame anterior y lo que no se ve sujeto a lo anterior (D4).
 */
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import type { Lado } from '../articulaciones/catalogo'
import { vec3, type Vec3 } from '../geometria/vector'
import type { IdMarcador } from '../modelo/tipos'
import { idPose } from '../pose/puntos'
import { resolver } from '../tresd/algebra'
import { proyectar, type Camara } from '../tresd/camara'
import { indiceGrado, N_GRADOS, posturaNeutra, puntosDePostura, type Grado, type Medidas } from './modelo'

const mediana = (xs: readonly number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return NaN
  const k = Math.floor(v.length / 2)
  return v.length % 2 ? v[k]! : (v[k - 1]! + v[k]!) / 2
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const finito = (p: Vec3 | undefined): p is Vec3 => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)

/** Diferencia relativa entre los dos lados a partir de la cual se avisa (una pierna medida más larga que la otra). */
export const ASIMETRIA_MAX = 0.05

/**
 * Las medidas de la persona (D2) a partir de los puntos 3D de la toma (en el marco del laboratorio, un mapa por frame): la
 * mediana de cada longitud en los frames con los dos extremos, media de los dos lados. El pie: talón y punta a la misma
 * altura en su marco, con el tobillo encima del punto de la línea talón–punta que le toca. Devuelve también la asimetría de
 * cada segmento (diferencia relativa entre lados). null sin bastantes datos.
 */
export function medidasDeLaToma(frames: readonly ReadonlyMap<IdMarcador, Vec3 | undefined>[]): { readonly medidas: Medidas; readonly asimetria: Readonly<Record<'muslo' | 'pierna' | 'pie', number>> } | null {
  const longitud = (a: IdMarcador, b: IdMarcador) => mediana(frames.map((f) => (finito(f.get(a)) && finito(f.get(b)) ? dist(f.get(a)!, f.get(b)!) : NaN)))
  const porLado = (pa: Parameters<typeof idPose>[0], pb: Parameters<typeof idPose>[0]) => (['der', 'izq'] as const).map((l) => longitud(idPose(pa, l), idPose(pb, l)))
  const [musloD, musloI] = porLado('cadera', 'rodilla')
  const [piernaD, piernaI] = porLado('rodilla', 'tobillo')
  const [pieD, pieI] = porLado('talon', 'punta')
  // El tobillo respecto a la línea talón–punta: a qué fracción de ella cae y a qué altura (perpendicular).
  const geometriaPie = (l: Lado) => {
    const f: number[] = []
    const h: number[] = []
    for (const fr of frames) {
      const [t, p, k] = [fr.get(idPose('talon', l)), fr.get(idPose('punta', l)), fr.get(idPose('tobillo', l))]
      if (!finito(t) || !finito(p) || !finito(k)) continue
      const d = vec3(p.x - t.x, p.y - t.y, p.z - t.z)
      const L2 = d.x * d.x + d.y * d.y + d.z * d.z
      if (!(L2 > 0)) continue
      const u = ((k.x - t.x) * d.x + (k.y - t.y) * d.y + (k.z - t.z) * d.z) / L2
      f.push(u)
      h.push(dist(k, vec3(t.x + u * d.x, t.y + u * d.y, t.z + u * d.z)))
    }
    return { f: mediana(f), h: mediana(h) }
  }
  const gD = geometriaPie('der')
  const gI = geometriaPie('izq')
  const anchoCaderas = longitud(idPose('cadera', 'izq'), idPose('cadera', 'der'))
  const anchoHombros = longitud(idPose('hombro', 'izq'), idPose('hombro', 'der'))
  const tronco = mediana(
    frames.map((fr) => {
      const [ci, cd, hi, hd] = [fr.get(idPose('cadera', 'izq')), fr.get(idPose('cadera', 'der')), fr.get(idPose('hombro', 'izq')), fr.get(idPose('hombro', 'der'))]
      if (!finito(ci) || !finito(cd) || !finito(hi) || !finito(hd)) return NaN
      return dist(vec3((ci.x + cd.x) / 2, (ci.y + cd.y) / 2, (ci.z + cd.z) / 2), vec3((hi.x + hd.x) / 2, (hi.y + hd.y) / 2, (hi.z + hd.z) / 2))
    }),
  )
  const media = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b)
  const asim = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / media(a, b) : NaN)
  const pie = media(pieD!, pieI!)
  const f = media(gD.f, gI.f)
  const h = media(gD.h, gI.h)
  const medidas: Medidas = {
    anchoCaderas,
    muslo: media(musloD!, musloI!),
    pierna: media(piernaD!, piernaI!),
    talon: { x: -f * pie, z: -h },
    punta: { x: (1 - f) * pie, z: -h },
    tronco,
    anchoHombros,
  }
  if (![medidas.anchoCaderas, medidas.muslo, medidas.pierna, pie, f, h, medidas.tronco, medidas.anchoHombros].every(Number.isFinite)) return null
  return { medidas, asimetria: { muslo: asim(musloD!, musloI!), pierna: asim(piernaD!, piernaI!), pie: asim(pieD!, pieI!) } }
}

/** Lo que ve una cámara en un frame: por punto, su posición (px) y calidad. */
export type Observaciones = ReadonlyMap<IdMarcador, { readonly u: number; readonly v: number; readonly calidad: number }>

const deg = Math.PI / 180
/** Límites articulares (rad): fuera, una penalización que crece deprisa. Amplios: solo quitan lo imposible. */
export const LIMITES: Partial<Record<Grado, readonly [number, number]>> = {
  pelvisAnteversion: [-30 * deg, 45 * deg],
  pelvisOblicuidad: [-30 * deg, 30 * deg],
  caderaFlexDer: [-40 * deg, 140 * deg],
  caderaFlexIzq: [-40 * deg, 140 * deg],
  caderaAbdDer: [-40 * deg, 60 * deg],
  caderaAbdIzq: [-40 * deg, 60 * deg],
  caderaRotDer: [-60 * deg, 60 * deg],
  caderaRotIzq: [-60 * deg, 60 * deg],
  rodillaDer: [-15 * deg, 160 * deg],
  rodillaIzq: [-15 * deg, 160 * deg],
  tobilloDorsalDer: [-60 * deg, 45 * deg],
  tobilloDorsalIzq: [-60 * deg, 45 * deg],
  tobilloProgresionDer: [-45 * deg, 60 * deg],
  tobilloProgresionIzq: [-45 * deg, 60 * deg],
  troncoFlex: [-40 * deg, 110 * deg],
  troncoLateral: [-50 * deg, 50 * deg],
  troncoRot: [-60 * deg, 60 * deg],
}
const SIGMA_LIMITE = 1 * deg
/** Continuidad con el frame anterior (por frame a ~30 fps): débil, solo desempata. */
const SIGMA_CONTINUIDAD_ANGULO = 15 * deg
const SIGMA_CONTINUIDAD_POSICION = 0.1
/** Lo que no se ve se sujeta (D4): la anteversión, fija en la de partida (0); la rotación de cadera con la rodilla recta, a la anterior. */
const SIGMA_SUJETO = 1 * deg
export const RODILLA_ROTACION_VISIBLE = 20 * deg
const HUBER_PX = 3

export interface EntradaAjuste {
  readonly camaras: readonly Camara[]
  /** Del marco del laboratorio (el del esqueleto) al mundo de las cámaras. */
  readonly aMundo: (p: Vec3) => Vec3
  readonly medidas: Medidas
  readonly observaciones: readonly Observaciones[]
  /** La postura del frame anterior (arranque y continuidad); sin ella, `arranque`. */
  readonly anterior: readonly number[] | null
  readonly arranque: readonly number[]
  /** La escala de las posiciones (m por unidad, para la continuidad de la pelvis). */
  readonly unidad: number
}

export interface ResultadoAjuste {
  readonly q: number[]
  /** Error de reproyección (px, raíz de la media de los cuadrados) de los puntos observados. */
  readonly error: number
  readonly observados: number
  /** En cuántas vistas se ve cada punto (con calidad suficiente) en este frame: lo que no se ve no tiene ángulo. */
  readonly vistas: Readonly<Record<IdMarcador, number>>
  /** La rotación de cada cadera, ¿la determina lo que se ve? (la rodilla doblada). */
  readonly rotacionVisible: Readonly<Record<Lado, boolean>>
  /**
   * Lo que dicen las cámaras de cada grado de libertad en este frame (JᵀJ de los residuos de reproyección, N_GRADOS ×
   * N_GRADOS, en px² por unidad²): la información para el suavizado de toda la toma (fase 11, D12). Solo con
   * `conInformacion`.
   */
  readonly informacion?: Float64Array
}

/** Los residuos (px y previos adimensionales) de una postura, y los de reproyección sueltos (para el error). */
function residuos(q: readonly number[], e: EntradaAjuste, anteversion: number): { r: number[]; reproy: number[] } {
  const puntos = puntosDePostura(q, e.medidas)
  const r: number[] = []
  const reproy: number[] = []
  e.camaras.forEach((c, k) => {
    for (const [id, o] of e.observaciones[k]!) {
      if (!(o.calidad >= CALIDAD_MINIMA)) continue
      const X = puntos.get(id)
      if (!X) continue
      const p = proyectar(c, e.aMundo(X))
      const du = p.u - o.u
      const dv = p.v - o.v
      const n = Math.hypot(du, dv)
      reproy.push(n)
      // Huber: por encima de HUBER_PX, el coste crece en línea recta (2·H·n − H²) en lugar de al cuadrado.
      const w = Math.sqrt(o.calidad) * (n > HUBER_PX ? Math.sqrt((2 * HUBER_PX) / n - (HUBER_PX * HUBER_PX) / (n * n)) : 1)
      r.push(du * w, dv * w)
    }
  })
  for (const [g, [lo, hi]] of Object.entries(LIMITES) as [Grado, readonly [number, number]][]) {
    const v = q[indiceGrado(g)]!
    r.push(v < lo ? (v - lo) / SIGMA_LIMITE : v > hi ? (v - hi) / SIGMA_LIMITE : 0)
  }
  r.push((q[indiceGrado('pelvisAnteversion')]! - anteversion) / SIGMA_SUJETO)
  const a = e.anterior
  if (a) {
    for (let i = 0; i < N_GRADOS; i++) r.push((q[i]! - a[i]!) / (i < 3 ? SIGMA_CONTINUIDAD_POSICION / e.unidad : SIGMA_CONTINUIDAD_ANGULO))
    for (const l of ['Der', 'Izq'] as const) {
      if (Math.abs(a[indiceGrado(`rodilla${l}`)]!) < RODILLA_ROTACION_VISIBLE) {
        const i = indiceGrado(`caderaRot${l}`)
        r.push((q[i]! - a[i]!) / SIGMA_SUJETO)
      }
    }
  }
  return { r, reproy }
}

/** En cuántas vistas se ve cada punto (calidad ≥ `CALIDAD_MINIMA`). */
function vistasDe(e: EntradaAjuste): Record<IdMarcador, number> {
  const r: Record<IdMarcador, number> = {}
  for (const o of e.observaciones) for (const [id, x] of o) if (x.calidad >= CALIDAD_MINIMA) r[id] = (r[id] ?? 0) + 1
  return r
}

const suma2 = (r: readonly number[]) => r.reduce((s, x) => s + x * x, 0)

/** Ajusta la postura de un frame (Levenberg–Marquardt). null si no hay bastantes puntos observados (menos de 6). */
export function ajustarFrame(e: EntradaAjuste, { iteraciones = 150, anteversion = 0, conInformacion = false } = {}): ResultadoAjuste | null {
  let q = [...(e.anterior ?? e.arranque)]
  let { r, reproy } = residuos(q, e, anteversion)
  if (reproy.length < 6) return null
  let coste = suma2(r)
  let lambda = 1e-5
  const h = 1e-6
  for (let it = 0; it < iteraciones; it++) {
    // Jacobiano numérico (diferencias hacia delante).
    const J: number[][] = []
    for (let j = 0; j < N_GRADOS; j++) {
      const qj = [...q]
      qj[j]! += h
      const rj = residuos(qj, e, anteversion).r
      J.push(rj.map((x, i) => (x - r[i]!) / h))
    }
    const JtJ = new Array<number>(N_GRADOS * N_GRADOS).fill(0)
    const Jtr = new Array<number>(N_GRADOS).fill(0)
    for (let a = 0; a < N_GRADOS; a++) {
      const Ja = J[a]!
      for (let i = 0; i < r.length; i++) Jtr[a]! += Ja[i]! * r[i]!
      for (let b = a; b < N_GRADOS; b++) {
        const Jb = J[b]!
        let s = 0
        for (let i = 0; i < r.length; i++) s += Ja[i]! * Jb[i]!
        JtJ[a * N_GRADOS + b] = s
        JtJ[b * N_GRADOS + a] = s
      }
    }
    let mejor = false
    for (let intento = 0; intento < 8 && !mejor; intento++) {
      const A = JtJ.map((v, k) => (k % (N_GRADOS + 1) === 0 ? v * (1 + lambda) + 1e-12 : v))
      const d = resolver(A, Jtr.map((x) => -x), N_GRADOS)
      if (!d) {
        lambda *= 10
        continue
      }
      const qn = q.map((v, i) => v + d[i]!)
      const rn = residuos(qn, e, anteversion)
      const cn = suma2(rn.r)
      if (cn < coste) {
        const mejora = coste - cn
        q = qn
        r = rn.r
        reproy = rn.reproy
        coste = cn
        lambda = Math.max(1e-9, lambda / 3)
        mejor = true
        if (mejora < 1e-10 * (1 + coste)) it = iteraciones
      } else lambda *= 10
    }
    if (!mejor) break
  }
  const error = Math.sqrt(reproy.reduce((s, x) => s + x * x, 0) / reproy.length)
  return {
    q,
    error,
    ...(conInformacion ? { informacion: informacionReproyeccion(q, e, anteversion, 2 * reproy.length) } : {}),
    observados: reproy.length,
    vistas: vistasDe(e),
    rotacionVisible: { der: Math.abs(q[indiceGrado('rodillaDer')]!) >= RODILLA_ROTACION_VISIBLE, izq: Math.abs(q[indiceGrado('rodillaIzq')]!) >= RODILLA_ROTACION_VISIBLE },
  }
}

/** JᵀJ de los `n` primeros residuos (los de reproyección: los previos van detrás) en la postura q. */
function informacionReproyeccion(q: readonly number[], e: EntradaAjuste, anteversion: number, n: number): Float64Array {
  const h = 1e-6
  const r0 = residuos(q, e, anteversion).r
  const J: number[][] = []
  for (let j = 0; j < N_GRADOS; j++) {
    const qj = [...q]
    qj[j]! += h
    const rj = residuos(qj, e, anteversion).r
    const fila = new Array<number>(n)
    for (let i = 0; i < n; i++) fila[i] = (rj[i]! - r0[i]!) / h
    J.push(fila)
  }
  const I = new Float64Array(N_GRADOS * N_GRADOS)
  for (let a = 0; a < N_GRADOS; a++) {
    for (let b = a; b < N_GRADOS; b++) {
      let s = 0
      for (let i = 0; i < n; i++) s += J[a]![i]! * J[b]![i]!
      I[a * N_GRADOS + b] = s
      I[b * N_GRADOS + a] = s
    }
  }
  return I
}

/**
 * Una postura de arranque a partir de los puntos 3D de un frame (en el marco del laboratorio): la pelvis en el punto medio
 * de las caderas con el rumbo de su línea, y lo demás neutro (el ajuste lo lleva a su sitio). null sin las dos caderas.
 */
export function arranqueDe(p: ReadonlyMap<IdMarcador, Vec3 | undefined>): number[] | null {
  const a = p.get(idPose('cadera', 'izq'))
  const b = p.get(idPose('cadera', 'der'))
  if (!finito(a) || !finito(b)) return null
  const q = posturaNeutra(vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2))
  // Delante = z × (derecha − izquierda).
  q[indiceGrado('pelvisRumbo')] = Math.atan2(b.x - a.x, -(b.y - a.y))
  return q
}
