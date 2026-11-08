import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../geometria/vector'
import { idPose } from '../pose/puntos'
import { estadoEn, PROPORCIONES, puntosDe } from '../tresd/sintetico'
import { indiceGrado, N_GRADOS, posturaNeutra, puntosDePostura, type Grado, type Medidas } from './modelo'

const H = 1.75
const P = PROPORCIONES
/** Las medidas de la persona sintética de la fase 6 (`core/tresd/sintetico.ts`). */
const M: Medidas = {
  anchoCaderas: P.anchoCaderas * H,
  muslo: (P.cadera - P.rodilla) * H,
  pierna: (P.rodilla - P.tobillo) * H,
  talon: { x: -0.25 * P.pie * H, z: -P.tobillo * H * 0.8 },
  punta: { x: 0.75 * P.pie * H, z: -P.tobillo * H * 0.8 },
  tronco: (P.hombro - P.cadera) * H,
  anchoHombros: P.anchoHombros * H,
}
const con = (cambios: Partial<Record<Grado, number>>, q = posturaNeutra()) => {
  const r = [...q]
  for (const [g, v] of Object.entries(cambios)) r[indiceGrado(g as Grado)] = v
  return r
}
const deg = Math.PI / 180
const cerca = (a: Vec3, b: Vec3, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
  expect(Math.abs(a.z - b.z)).toBeLessThan(tol)
}

describe('esqueleto: cinemática directa', () => {
  it('21 grados; de pie, las piernas rectas bajo las caderas y los hombros encima, la derecha en −y', () => {
    expect(N_GRADOS).toBe(21)
    const p = puntosDePostura(posturaNeutra(), M)
    expect(p.get(idPose('cadera', 'der'))!.y).toBeCloseTo(-M.anchoCaderas / 2, 12)
    expect(p.get(idPose('tobillo', 'izq'))!.z).toBeCloseTo(-(M.muslo + M.pierna), 12)
    expect(p.get(idPose('hombro', 'izq'))!.z).toBeCloseTo(M.tronco, 12)
    expect(p.get(idPose('punta', 'der'))!.x).toBeGreaterThan(0)
  })

  it('los signos clínicos: flexión, abducción y rotación interna de cadera, rodilla, tobillo, pelvis y tronco', () => {
    const p = (c: Partial<Record<Grado, number>>) => puntosDePostura(con(c), M)
    // Cadera flexionada: la rodilla hacia delante (+x), en las dos piernas.
    expect(p({ caderaFlexDer: 30 * deg }).get(idPose('rodilla', 'der'))!.x).toBeGreaterThan(0)
    expect(p({ caderaFlexIzq: 30 * deg }).get(idPose('rodilla', 'izq'))!.x).toBeGreaterThan(0)
    // Abducción: hacia fuera (la derecha a −y, la izquierda a +y).
    expect(p({ caderaAbdDer: 20 * deg }).get(idPose('rodilla', 'der'))!.y).toBeLessThan(-M.anchoCaderas / 2)
    expect(p({ caderaAbdIzq: 20 * deg }).get(idPose('rodilla', 'izq'))!.y).toBeGreaterThan(M.anchoCaderas / 2)
    // Rotación interna con la rodilla doblada a 90° (la pierna apunta hacia atrás): la lleva hacia fuera.
    const interna = p({ rodillaDer: 90 * deg, caderaRotDer: 30 * deg }).get(idPose('tobillo', 'der'))!
    expect(interna.y).toBeLessThan(-M.anchoCaderas / 2)
    const internaIzq = p({ rodillaIzq: 90 * deg, caderaRotIzq: 30 * deg }).get(idPose('tobillo', 'izq'))!
    expect(internaIzq.y).toBeGreaterThan(M.anchoCaderas / 2)
    // Rodilla flexionada: el tobillo hacia atrás.
    expect(p({ rodillaDer: 40 * deg }).get(idPose('tobillo', 'der'))!.x).toBeLessThan(0)
    // Flexión dorsal: la punta sube.
    const neutra = puntosDePostura(posturaNeutra(), M).get(idPose('punta', 'izq'))!
    expect(p({ tobilloDorsalIzq: 15 * deg }).get(idPose('punta', 'izq'))!.z).toBeGreaterThan(neutra.z)
    // Progresión hacia fuera: la punta derecha a −y, la izquierda a +y.
    expect(p({ tobilloProgresionDer: 15 * deg }).get(idPose('punta', 'der'))!.y).toBeLessThan(-M.anchoCaderas / 2)
    expect(p({ tobilloProgresionIzq: 15 * deg }).get(idPose('punta', 'izq'))!.y).toBeGreaterThan(M.anchoCaderas / 2)
    // Oblicuidad +: la cadera izquierda más alta.
    const obl = p({ pelvisOblicuidad: 5 * deg })
    expect(obl.get(idPose('cadera', 'izq'))!.z).toBeGreaterThan(obl.get(idPose('cadera', 'der'))!.z)
    // Rumbo +: mira hacia la izquierda (la punta del pie va hacia +y).
    expect(p({ pelvisRumbo: 30 * deg }).get(idPose('punta', 'der'))!.y).toBeGreaterThan(-M.anchoCaderas / 2)
    // Tronco: flexión + hacia delante, inclinación + a la izquierda, rotación + a la izquierda (el hombro derecho adelanta).
    expect(p({ troncoFlex: 20 * deg }).get(idPose('hombro', 'der'))!.x).toBeGreaterThan(0)
    expect(p({ troncoLateral: 10 * deg }).get(idPose('hombro', 'der'))!.y).toBeGreaterThan(-M.anchoHombros / 2)
    expect(p({ troncoRot: 20 * deg }).get(idPose('hombro', 'der'))!.x).toBeGreaterThan(0)
    // Anteversión +: la pelvis se inclina hacia delante (los hombros, montados en ella, adelantan).
    expect(p({ pelvisAnteversion: 10 * deg }).get(idPose('hombro', 'izq'))!.x).toBeGreaterThan(0)
  })

  it('la persona sintética de la fase 6 es una postura del esqueleto (mismas convenciones)', () => {
    for (const t of [1.3, 7.5, 13.1]) {
      const e = estadoEn(t, H)
      // El origen del esqueleto es el punto medio de las caderas: la pelvis de la persona sintética.
      const q = con({
        pelvisX: e.pelvis.x,
        pelvisY: e.pelvis.y,
        pelvisZ: e.pelvis.z,
        pelvisRumbo: e.rumbo,
        caderaFlexDer: e.caderaFlex.der,
        caderaFlexIzq: e.caderaFlex.izq,
        rodillaDer: e.rodillaFlex.der,
        rodillaIzq: e.rodillaFlex.izq,
        // El pie sintético va siempre horizontal: la flexión dorsal es lo que se inclina la pierna.
        tobilloDorsalDer: e.rodillaFlex.der - e.caderaFlex.der,
        tobilloDorsalIzq: e.rodillaFlex.izq - e.caderaFlex.izq,
        troncoFlex: e.troncoFlex,
      })
      const esqueleto = puntosDePostura(q, M)
      for (const [n, X] of puntosDe(e, H)) cerca(esqueleto.get(`pose_${n}`)!, X, 1e-9)
    }
  })
})
