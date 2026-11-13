import { describe, expect, it } from 'vitest'
import {
  anguloEntre,
  angulosCervicales,
  frontalidad,
  fusionar,
  giroDeAngulos,
  giroDeTransformacion,
  giroEntreCamaras,
  giroMedio,
  giroY,
  IDENTIDAD,
  multiplicar,
  traspuesta,
  type Giro,
  type MedidaCabeza,
} from './orientacion'

const cerca = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b), `${a} frente a ${b}`).toBeLessThan(tol)

/** Aplica un giro a un vector. */
const aplicar = (r: Giro, v: [number, number, number]) => [0, 1, 2].map((i) => r[i * 3]! * v[0] + r[i * 3 + 1]! * v[1] + r[i * 3 + 2]! * v[2])

describe('convención cervical (fijada aquí)', () => {
  it('rotación a la izquierda +: la cara (z) va hacia la izquierda de la persona (+x)', () => {
    const r = giroDeAngulos(30, 0, 0)
    const delante = aplicar(r, [0, 0, 1])
    expect(delante[0]!).toBeGreaterThan(0)
    cerca(angulosCervicales(IDENTIDAD, r).rotacion, 30)
  })
  it('flexión +: la coronilla (y) va hacia delante (+z) y la cara hacia abajo', () => {
    const r = giroDeAngulos(0, 25, 0)
    expect(aplicar(r, [0, 1, 0])[2]!).toBeGreaterThan(0)
    expect(aplicar(r, [0, 0, 1])[1]!).toBeLessThan(0)
    cerca(angulosCervicales(IDENTIDAD, r).flexion, 25)
  })
  it('inclinación a la izquierda +: la oreja izquierda (+x) baja', () => {
    const r = giroDeAngulos(0, 0, 20)
    expect(aplicar(r, [1, 0, 0])[1]!).toBeLessThan(0)
    cerca(angulosCervicales(IDENTIDAD, r).inclinacion, 20)
  })
  it.each([
    [80, 0, 0],
    [-75, 10, 0],
    [40, -30, 15],
    [-20, 45, -35],
    [0, -50, 40],
  ])('rotación %d°, flexión %d°, inclinación %d° se recuperan juntas, también respecto a un neutro girado', (rot, flex, incl) => {
    const r = giroDeAngulos(rot, flex, incl)
    const a = angulosCervicales(IDENTIDAD, r)
    cerca(a.rotacion, rot)
    cerca(a.flexion, flex)
    cerca(a.inclinacion, incl)
    // Con la cabeza de partida ya girada respecto a la cámara (neutro N), lo medido es respecto a N.
    const neutro = giroDeAngulos(-25, 8, 5)
    const b = angulosCervicales(neutro, multiplicar(neutro, r))
    cerca(b.rotacion, rot)
    cerca(b.flexion, flex)
    cerca(b.inclinacion, incl)
  })
})

describe('de la matriz de Face Landmarker al giro', () => {
  it('lee la matriz 4 × 4 por columnas, sin la escala ni la traslación', () => {
    const r = giroDeAngulos(35, -10, 5)
    // Por columnas, con escala 1,3 y traslación.
    const m = new Array<number>(16).fill(0)
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) m[4 * j + i] = 1.3 * r[i * 3 + j]!
    m[12] = 4
    m[13] = -2
    m[14] = -50
    m[15] = 1
    const g = giroDeTransformacion(m)!
    for (let k = 0; k < 9; k++) cerca(g[k]!, r[k]!, 1e-9)
    expect(giroDeTransformacion([1, 2])).toBeNull()
  })
  it('lo de frente: 1 mirando a la cámara, cos 60° a 60°, 0 de perfil', () => {
    cerca(frontalidad(IDENTIDAD), 1)
    cerca(frontalidad(giroY(60)), 0.5)
    cerca(frontalidad(giroY(90)), 0, 1e-12)
  })
})

describe('el neutro y dos cámaras (D4, D6)', () => {
  it('el giro medio de un tramo quieto con ruido queda en el centro', () => {
    const base = giroDeAngulos(10, 5, -3)
    const giros = [-2, -1, 0, 1, 2].map((d) => multiplicar(base, giroDeAngulos(d, -d, d / 2)))
    expect(anguloEntre(giroMedio(giros)!, base)).toBeLessThan(0.05)
  })

  it('dos móviles a ±45° del frente: el giro entre ellos sale de la cara, y la fusión cubre la rotación de −100° a +100°', () => {
    // Cámara A a la izquierda de la persona (girada 45°), B a la derecha. La cabeza vista por cada una: R_cam = C·R_cabeza.
    const camA = giroY(-45)
    const camB = giroY(45)
    const verdadBenA = multiplicar(camA, traspuesta(camB))
    // Cada cámara ve la cara si la tiene a menos de 60° de frente; calidad = lo de frente que la ve.
    const ver = (cam: Giro, cabeza: Giro): MedidaCabeza | null => {
      const r = multiplicar(cam, cabeza)
      return frontalidad(r) > 0.5 ? { giro: r, calidad: frontalidad(r) } : null
    }
    const rotaciones = Array.from({ length: 41 }, (_, k) => -100 + 5 * k)
    const cabezas = rotaciones.map((rot) => giroDeAngulos(rot, 10 * Math.sin(rot / 20), 0))
    const a = cabezas.map((c) => ver(camA, c))
    const b = cabezas.map((c) => ver(camB, c))
    // Ninguna de las dos sola cubre todo; juntas, sí.
    expect(a.some((x) => !x) && b.some((x) => !x)).toBe(true)
    const bEnA = giroEntreCamaras(a, b, 0.5)!
    expect(anguloEntre(bEnA, verdadBenA)).toBeLessThan(1e-6)
    const neutro = multiplicar(camA, IDENTIDAD)
    cabezas.forEach((c, i) => {
      const f = fusionar(a[i]!, b[i]!, bEnA, 0.5)
      expect(f, `rotación ${rotaciones[i]}`).not.toBeNull()
      const ang = angulosCervicales(neutro, f!.giro)
      cerca(ang.rotacion, rotaciones[i]!, 1e-6)
    })
    expect(fusionar(null, null, bEnA, 0.5)).toBeNull()
  })
})
