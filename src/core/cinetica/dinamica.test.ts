import { describe, expect, it } from 'vitest'
import type { Lado } from '../articulaciones/catalogo'
import { indiceGrado, N_GRADOS, posturaNeutra, type Grado } from '../esqueleto/modelo'
import { medidasDe, posturaEn } from '../esqueleto/sintetico'
import { vec3, type Vec3 } from '../geometria/vector'
import { rotacion, multiplicar, type Mat3 } from '../tresd/camara'
import { generadorRuido, PROPORCIONES } from '../tresd/sintetico'
import {
  aceleracionAngular,
  cineticaDeLaToma,
  derivadaMomentoAngular,
  G,
  repartir,
  velocidadAngular,
  type EntradaCinetica,
  type SegmentoMovil,
} from './dinamica'
import { centroDeMasas, cuerpoDePostura, INERCIA, segmentosDe, type CuerpoEnPostura, type Segmento } from './segmentos'

const H = 1.75
const M = medidasDe(H)
const deg = Math.PI / 180
const de = (cambios: Partial<Record<Grado, number>>, q = posturaNeutra(vec3(0, 0, PROPORCIONES.cadera * H))) => {
  const r = [...q]
  for (const [g, v] of Object.entries(cambios)) r[indiceGrado(g as Grado)] = v
  return r
}
const toma = (fps: number, duracion: number, postura: (t: number) => number[], cambios: Partial<EntradaCinetica> = {}): EntradaCinetica => {
  const tiempos = Array.from({ length: Math.round(duracion * fps) }, (_, k) => k / fps)
  return { tiempos, posturas: tiempos.map(postura), medidas: M, metrosPorUnidad: 1, suelo: 0, fs: fps, corteHz: 6, ...cambios }
}
const mas = (a: Vec3, b: Vec3) => vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const menos = (a: Vec3, b: Vec3) => vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const por = (a: Vec3, k: number) => vec3(a.x * k, a.y * k, a.z * k)
const cruz = (a: Vec3, b: Vec3) => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const cerca = (a: Vec3, b: Vec3, tol: number) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
  expect(Math.abs(a.z - b.z)).toBeLessThan(tol)
}
const GRAV = vec3(0, 0, -G)

/**
 * El momento estático en una articulación, calculado de otra forma (sin la recursión): el que equilibra el peso de todo lo
 * que cuelga de ella y la reacción de su pie. M = −Σ (cᵢ − r) × mᵢg − (cop − r) × F − libre.
 */
function momentoEstatico(c: CuerpoEnPostura, l: Lado, desde: 'cadera' | 'rodilla' | 'tobillo', F: Vec3, cop: Vec3, libre: number): Vec3 {
  const r = c.puntos[desde][l]
  const debajo: Segmento[] = desde === 'cadera' ? [c.muslo[l], c.pierna[l], c.pie[l]] : desde === 'rodilla' ? [c.pierna[l], c.pie[l]] : [c.pie[l]]
  let m = vec3(0, 0, -libre)
  for (const sg of debajo) m = menos(m, cruz(menos(sg.com, r), por(GRAV, sg.masa)))
  return menos(m, cruz(menos(cop, r), F))
}

describe('cinética: segmentos', () => {
  it('las masas de la tabla suman el cuerpo entero y, de pie, el centro de masas queda a un 55–60 % de la estatura', () => {
    const total = INERCIA.hat.masa + 2 * (INERCIA.muslo.masa + INERCIA.pierna.masa + INERCIA.pie.masa)
    expect(total).toBeCloseTo(1, 12)
    const c = cuerpoDePostura(de({}), M)
    expect(segmentosDe(c).reduce((a, s) => a + s.masa, 0)).toBeCloseTo(1, 12)
    const com = centroDeMasas(c)
    expect(com.z / H).toBeGreaterThan(0.55)
    expect(com.z / H).toBeLessThan(0.6)
    expect(Math.abs(com.x)).toBeLessThan(0.01)
    expect(Math.abs(com.y)).toBeLessThan(1e-12)
  })
})

describe('cinética: velocidad y aceleración angulares de una orientación', () => {
  it('dos giros encadenados: ω = ȧ·z + ḃ·(Rz x) y α su derivada', () => {
    const a = (t: number) => 0.7 * Math.sin(1.3 * t)
    const b = (t: number) => 0.4 * Math.cos(2.1 * t)
    const R = (t: number): Mat3 => multiplicar(rotacion(vec3(0, 0, 1), a(t)), rotacion(vec3(1, 0, 0), b(t)))
    const h = 1e-4
    const t = 0.83
    const dif = (f: (t: number) => Mat3, k: 1 | 2): Mat3 => {
      const p = f(t + h)
      const q = f(t - h)
      const c = f(t)
      return p.map((v, i) => (k === 1 ? (v - q[i]!) / (2 * h) : (v - 2 * c[i]! + q[i]!) / (h * h))) as unknown as Mat3
    }
    const ad = 0.7 * 1.3 * Math.cos(1.3 * t)
    const bd = -0.4 * 2.1 * Math.sin(2.1 * t)
    const add = -0.7 * 1.3 * 1.3 * Math.sin(1.3 * t)
    const bdd = -0.4 * 2.1 * 2.1 * Math.cos(2.1 * t)
    const ex = vec3(Math.cos(a(t)), Math.sin(a(t)), 0)
    const w = mas(vec3(0, 0, ad), por(ex, bd))
    // α = ä·z + b̈·ex + ḃ·(ȧ z × ex)
    const al = mas(mas(vec3(0, 0, add), por(ex, bdd)), por(cruz(vec3(0, 0, ad), ex), bd))
    cerca(velocidadAngular(R(t), dif(R, 1)), w, 1e-6)
    cerca(aceleracionAngular(R(t), dif(R, 2)), al, 1e-3)
  })
})

describe('cinética: reparto entre los dos pies', () => {
  it('conserva la fuerza y el momento totales; con el centro de presiones en un apoyo, se lo lleva ese pie', () => {
    const F = vec3(0.3, -0.2, 9.5)
    const cop = vec3(0.05, 0.04, 0)
    const r = repartir(F, cop, 0.02, { der: vec3(0, -0.1, 0), izq: vec3(0.1, 0.12, 0) })
    const suma = mas(r.der!.F, r.izq!.F)
    cerca(suma, F, 1e-12)
    cerca(mas(cruz(r.der!.cop, r.der!.F), cruz(r.izq!.cop, r.izq!.F)), cruz(cop, F), 1e-12)
    expect(r.der!.libre + r.izq!.libre).toBeCloseTo(0.02, 12)
    const todo = repartir(F, vec3(0, -0.1, 0), 0, { der: vec3(0, -0.1, 0), izq: vec3(0.1, 0.12, 0) })
    cerca(todo.der!.F, F, 1e-12)
    cerca(todo.izq!.F, vec3(0, 0, 0), 1e-12)
    // Con un solo pie, todo a él; sin centro de presiones, nada.
    expect(repartir(F, cop, 0, { der: null, izq: vec3(0, 0, 0) }).izq!.F).toBe(F)
    expect(repartir(F, vec3(NaN, NaN, NaN), 0, { der: vec3(0, 0, 0), izq: vec3(0, 0, 0) }).der).toBeNull()
  })
})

describe('cinética: postura quieta', () => {
  it('de pie: la fuerza es el peso, el centro de presiones está bajo el centro de masas y cada pie lleva la mitad', () => {
    const q = de({})
    const r = cineticaDeLaToma(toma(30, 2, () => q))
    const k = 30
    cerca(r.fuerza[k]!, vec3(0, 0, G), 1e-6)
    const com = centroDeMasas(cuerpoDePostura(q, M))
    cerca(r.cop[k]!, vec3(com.x, com.y, 0), 1e-6)
    expect(r.pies.der.apoyo[k]).toBe(true)
    expect(r.pies.izq.apoyo[k]).toBe(true)
    expect(r.pies.der.fuerza[k]!.z).toBeCloseTo(G / 2, 6)
    expect(r.pies.izq.fuerza[k]!.z).toBeCloseTo(G / 2, 6)
    // Todo vertical: ni la cadera ni la rodilla necesitan momento sagital (salvo el peso del pie, desplazado).
    for (const l of ['der', 'izq'] as const) {
      expect(Math.abs(r.articulaciones[l].cadera.sagital[k]!)).toBeLessThan(0.05)
      expect(Math.abs(r.articulaciones[l].rodilla.sagital[k]!)).toBeLessThan(0.05)
      expect(r.articulaciones[l].cadera.potencia[k]).toBeCloseTo(0, 9)
    }
  })

  it('sentadilla abajo con el tronco inclinado: momentos iguales al cálculo estático directo; cadera y rodilla extensores', () => {
    const q = posturaEn(7.5, H)
    const r = cineticaDeLaToma(toma(30, 2, () => q))
    const c = cuerpoDePostura(q, M)
    const k = 30
    cerca(r.fuerza[k]!, vec3(0, 0, G), 1e-6)
    for (const l of ['der', 'izq'] as const) {
      const pie = r.pies[l]
      const libre = (r.libre[k]! * pie.fuerza[k]!.z) / r.fuerza[k]!.z
      for (const a of ['cadera', 'rodilla', 'tobillo'] as const) {
        cerca(r.articulaciones[l][a].momento[k]!, momentoEstatico(c, l, a, pie.fuerza[k]!, pie.cop[k]!, libre), 1e-6)
      }
      expect(r.articulaciones[l].cadera.sagital[k]!).toBeGreaterThan(0.3)
      expect(r.articulaciones[l].rodilla.sagital[k]!).toBeGreaterThan(0.3)
    }
  })

  it('sobre la pierna izquierda: el pie derecho no apoya; cadera y rodilla izquierdas con momento abductor', () => {
    const q = de({ pelvisY: 0.03, caderaFlexDer: 0.8, rodillaDer: 1.2 })
    const r = cineticaDeLaToma(toma(30, 2, () => q))
    const c = cuerpoDePostura(q, M)
    const k = 30
    expect(r.pies.der.apoyo[k]).toBe(false)
    expect(r.pies.izq.apoyo[k]).toBe(true)
    cerca(r.pies.izq.fuerza[k]!, vec3(0, 0, G), 1e-6)
    cerca(r.pies.der.fuerza[k]!, vec3(0, 0, 0), 1e-12)
    cerca(r.articulaciones.izq.cadera.momento[k]!, momentoEstatico(c, 'izq', 'cadera', r.pies.izq.fuerza[k]!, r.pies.izq.cop[k]!, r.libre[k]!), 1e-6)
    expect(r.articulaciones.izq.cadera.frontal[k]!).toBeGreaterThan(0.2)
    expect(r.articulaciones.izq.rodilla.frontal[k]!).toBeGreaterThan(0.1)
    // La pierna derecha cuelga: su cadera sostiene el muslo flexionado (momento flexor: sagital negativo).
    expect(r.articulaciones.der.cadera.sagital[k]!).toBeLessThan(0)
  })
})

describe('cinética: movimiento', () => {
  it('rebote vertical de 3 cm a 1 Hz: F_z = g − Aω²·sen(ωt)', () => {
    const A = 0.03
    const w = 2 * Math.PI
    const z0 = PROPORCIONES.cadera * H
    const r = cineticaDeLaToma(toma(60, 4, (t) => de({ pelvisZ: z0 + A * Math.sin(w * t) })))
    let peor = 0
    for (let k = 30; k < r.tiempos.length - 30; k++) {
      const t = r.tiempos[k]!
      peor = Math.max(peor, Math.abs(r.fuerza[k]!.z - (G - A * w * w * Math.sin(w * t))))
    }
    expect(peor).toBeLessThan(0.02)
  })

  it('en caída libre la fuerza del suelo es nula (sin centro de presiones), aunque las piernas se muevan', () => {
    // La pierna se mueve y el centro de masas cae con g: la pelvis se coloca para que el centro de masas siga la parábola.
    const postura = (t: number) => {
      const q = de({ pelvisZ: 0, caderaFlexDer: 0.4 * Math.sin(8 * t), rodillaDer: 0.6 + 0.3 * Math.sin(8 * t) })
      const c = centroDeMasas(cuerpoDePostura(q, M))
      return de({ pelvisX: -c.x, pelvisY: -c.y, pelvisZ: 2 - 0.5 * G * t * t - c.z }, q)
    }
    const r = cineticaDeLaToma(toma(60, 1, postura))
    let con = 0
    for (let k = 0; k < r.tiempos.length; k++) {
      if (Number.isNaN(r.fuerza[k]!.z)) continue
      con++
      expect(Math.abs(r.fuerza[k]!.z)).toBeLessThan(0.05)
      expect(Number.isNaN(r.cop[k]!.x)).toBe(true)
    }
    expect(con).toBeGreaterThan(35)
  })

  it('pierna derecha balanceándose en el aire: el momento de la cadera es el de la inercia y el peso de la pierna', () => {
    const postura = (t: number) => de({ caderaFlexDer: 0.9 + 0.3 * Math.sin(2 * Math.PI * 0.8 * t), rodillaDer: 1.2 + 0.3 * Math.sin(2 * Math.PI * 0.8 * t + 1), caderaAbdDer: 5 * deg })
    const r = cineticaDeLaToma(toma(60, 4, postura))
    // Lo mismo, sin la recursión: Σ (cᵢ − cadera) × mᵢ(aᵢ − g) + Iαᵢ + ω × Iωᵢ de muslo, pierna y pie, con las derivadas
    // por diferencias finitas de la postura exacta.
    const h = 1e-4
    const pierna = (c: CuerpoEnPostura) => [c.muslo.der, c.pierna.der, c.pie.der]
    let peor = 0
    let escala = 0
    for (let k = 40; k < r.tiempos.length - 40; k += 7) {
      const t = r.tiempos[k]!
      const [a, b, c] = [cuerpoDePostura(postura(t - h), M), cuerpoDePostura(postura(t), M), cuerpoDePostura(postura(t + h), M)]
      const cadera = b.puntos.cadera.der
      let Mh = vec3(0, 0, 0)
      pierna(b).forEach((sg, i) => {
        const [sa, sc] = [pierna(a)[i]!, pierna(c)[i]!]
        const acc = por(mas(menos(sc.com, por(sg.com, 2)), sa.com), 1 / (h * h))
        const Rp = sc.R.map((v, j) => (v - sa.R[j]!) / (2 * h)) as unknown as Mat3
        const Rpp = sc.R.map((v, j) => (v - 2 * sg.R[j]! + sa.R[j]!) / (h * h)) as unknown as Mat3
        const mov: SegmentoMovil = { ...sg, a: acc, w: velocidadAngular(sg.R, Rp), al: aceleracionAngular(sg.R, Rpp) }
        Mh = mas(Mh, mas(cruz(menos(sg.com, cadera), por(menos(acc, GRAV), sg.masa)), derivadaMomentoAngular(mov)))
      })
      const calc = r.articulaciones.der.cadera.momento[k]!
      peor = Math.max(peor, Math.hypot(calc.x - Mh.x, calc.y - Mh.y, calc.z - Mh.z))
      escala = Math.max(escala, Math.hypot(Mh.x, Mh.y, Mh.z))
      expect(r.pies.der.apoyo[k]).toBe(false)
    }
    expect(peor / escala).toBeLessThan(0.02)
  })
})

describe('cinética: huecos', () => {
  it('nunca a través de un hueco: sin valor (NaN, nunca 0) en los bordes, en el hueco y en un tramo corto', () => {
    const q = de({})
    const e = toma(30, 3, () => q)
    const posturas = e.posturas.map((p, k) => ((k >= 40 && k < 45) || k === 60 ? null : p))
    const r = cineticaDeLaToma({ ...e, posturas })
    for (const k of [0, 3, 36, 39, 40, 44, 45, 49, 57, 60, 64, 86, 89]) expect(Number.isNaN(r.fuerza[k]!.z)).toBe(true)
    // 46–59: 14 frames, se calcula lejos de sus bordes (0,15 s); 61–89, también.
    expect(r.fuerza[52]!.z).toBeCloseTo(G, 6)
    expect(r.articulaciones.der.rodilla.sagital[70]).not.toBeNaN()
    const corto = cineticaDeLaToma({ ...e, posturas: e.posturas.map((p, k) => (k < 6 ? p : null)) })
    expect(corto.fuerza.every((f) => Number.isNaN(f.z))).toBe(true)
  })

  it('sin escala en metros no se puede: la entrada pide metros por unidad, y con otra unidad el resultado es el mismo', () => {
    const q = posturaEn(7.5, H)
    const k = 2
    const qu = [...q]
    qu[0] = q[0]! / k
    qu[1] = q[1]! / k
    qu[2] = q[2]! / k
    const Mu = { ...M, anchoCaderas: M.anchoCaderas / k, muslo: M.muslo / k, pierna: M.pierna / k, tronco: M.tronco / k, anchoHombros: M.anchoHombros / k, talon: { x: M.talon.x / k, z: M.talon.z / k }, punta: { x: M.punta.x / k, z: M.punta.z / k } }
    const a = cineticaDeLaToma(toma(30, 2, () => q))
    const b = cineticaDeLaToma({ ...toma(30, 2, () => qu), medidas: Mu, metrosPorUnidad: k })
    expect(b.articulaciones.der.rodilla.sagital[30]).toBeCloseTo(a.articulaciones.der.rodilla.sagital[30]!, 9)
  })
})

describe('cinética: ruido (D5 y D7 de docs/plan-fase-11.md)', () => {
  // Las sentadillas de la persona sintética (6–12 s, una cada 3 s) a 30 fps, con ruido blanco en cada ángulo del esqueleto
  // y 5 mm en la posición de la pelvis, frame a frame (más que lo que deja el ajuste de la fase 7, que lo suaviza).
  const tiempos = Array.from({ length: 6 * 30 }, (_, k) => 6 + k / 30)
  const limpias = tiempos.map((t) => posturaEn(t, H))
  const ruidosas = (grados: number) => {
    const rnd = generadorRuido(3)
    return limpias.map((q) => q.map((v, i) => (i < 3 ? v + 0.005 * rnd() : i < N_GRADOS ? v + grados * deg * rnd() : v)))
  }
  const base = { tiempos, medidas: M, metrosPorUnidad: 1, suelo: 0, fs: 30 }
  const verdad = cineticaDeLaToma({ ...base, posturas: limpias, corteHz: 6 })
  const ecm = (a: readonly number[], b: readonly number[]) => {
    let s = 0
    let n = 0
    for (let k = 0; k < a.length; k++) {
      if (!Number.isFinite(a[k]!) || !Number.isFinite(b[k]!)) continue
      s += (a[k]! - b[k]!) ** 2
      n++
    }
    return Math.sqrt(s / n)
  }
  const fz = (r: ReturnType<typeof cineticaDeLaToma>) => r.fuerza.map((f) => f.z)
  const rodilla = (r: ReturnType<typeof cineticaDeLaToma>) => r.articulaciones.der.rodilla.sagital

  it('la dinámica con ruido de 2° solo se sostiene con un corte bajo: a 6 Hz la fuerza vertical se va más de un 20 % del peso', () => {
    const a6 = cineticaDeLaToma({ ...base, posturas: ruidosas(2), corteHz: 6 })
    const a2 = cineticaDeLaToma({ ...base, posturas: ruidosas(2), corteHz: 2 })
    expect(ecm(fz(a6), fz(verdad))).toBeGreaterThan(0.2 * G)
    expect(ecm(fz(a2), fz(verdad))).toBeLessThan(0.05 * G)
  })

  it('la cuasiestática: en una sentadilla lenta, cerca de la dinámica; con 3,5° de ruido, la rodilla a menos de 0,5 N·m/kg', () => {
    const limpia = cineticaDeLaToma({ ...base, posturas: limpias, corteHz: 6, modo: 'cuasiestatica' })
    expect(fz(limpia).filter(Number.isFinite).every((f) => Math.abs(f - G) < 1e-9)).toBe(true)
    expect(ecm(rodilla(limpia), rodilla(verdad))).toBeLessThan(0.12)
    const ruido = cineticaDeLaToma({ ...base, posturas: ruidosas(3.5), corteHz: 6, modo: 'cuasiestatica' })
    expect(ecm(rodilla(ruido), rodilla(verdad))).toBeLessThan(0.5)
    // El momento extensor de la rodilla abajo (la media de los frames con más del 90 % del máximo), a menos de 0,15 N·m/kg.
    const v = rodilla(verdad)
    const tope = 0.9 * Math.max(...v.filter(Number.isFinite))
    const abajo = v.map((x, k) => (x > tope && Number.isFinite(rodilla(ruido)[k]!) ? k : -1)).filter((k) => k >= 0)
    const media = (a: readonly number[]) => abajo.reduce((s, k) => s + a[k]!, 0) / abajo.length
    expect(abajo.length).toBeGreaterThan(10)
    expect(Math.abs(media(rodilla(ruido)) - media(v))).toBeLessThan(0.15)
  })
})
