import { describe, expect, it } from 'vitest'
import { FRACCION_OJOS, FRACCION_TOBILLOS, alturaCamara, anguloEntreMoviles, consejoAltura, consejoAngulo, medianaAltura } from './altura'
import type { PuntoNorm } from './encuadre'
import { FOV_PREVIO_GRADOS } from '../tresd/camara'

const ANCHO = 1080
const ALTO = 1920

/**
 * Una persona de pie de estatura `H` a `d` m de una cámara a `h` m del suelo con cabeceo `cabeceo` (°, + hacia abajo),
 * vista con un móvil de campo de visión `fov`: los ojos y los tobillos donde caen en la imagen (y normalizada).
 */
function persona(H: number, d: number, h: number, cabeceo: number, fov = FOV_PREVIO_GRADOS): PuntoNorm[] {
  const f = ALTO / 2 / Math.tan((fov * Math.PI) / 360) / ALTO
  const th = (cabeceo * Math.PI) / 180
  // Un punto a altura z: ángulo α respecto a la horizontal; respecto al eje óptico (que baja θ), baja −α − θ.
  const y = (z: number) => 0.5 + f * Math.tan(-Math.atan((z - h) / d) - th)
  const p: PuntoNorm[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
  for (const i of [2, 5]) p[i] = { x: 0.5, y: y(FRACCION_OJOS * H), visibility: 0.95 }
  for (const i of [27, 28]) p[i] = { x: 0.5, y: y(FRACCION_TOBILLOS * H), visibility: 0.95 }
  return p
}

describe('altura de la cámara por el horizonte', () => {
  it('da la altura y la distancia exactas con la cámara horizontal o inclinada', () => {
    for (const [H, d, h, cab] of [
      [1.75, 1.5, 1.0, 0],
      [1.62, 2.0, 0.8, 6],
      [1.9, 1.6, 1.25, -8],
      [1.75, 3.0, 0.4, 10],
    ] as const) {
      const r = alturaCamara(persona(H, d, h, cab), ANCHO, ALTO, cab, H)!
      expect(Math.abs(r.altura - h)).toBeLessThan(1e-6)
      expect(Math.abs(r.distancia - d)).toBeLessThan(1e-6)
    }
  })

  it('con la cámara horizontal, la focal no importa para la altura; con 10° y la focal 10° equivocada, menos de 5 cm', () => {
    const plano = alturaCamara(persona(1.75, 1.5, 1.0, 0, 75), ANCHO, ALTO, 0, 1.75)!
    expect(Math.abs(plano.altura - 1.0)).toBeLessThan(1e-6)
    const inclinada = alturaCamara(persona(1.75, 1.5, 1.0, 10, 75), ANCHO, ALTO, 10, 1.75)!
    expect(Math.abs(inclinada.altura - 1.0)).toBeLessThan(0.05)
  })

  it('una estatura 5 cm equivocada mueve la altura unos 3 cm', () => {
    const r = alturaCamara(persona(1.75, 1.5, 1.0, 0), ANCHO, ALTO, 0, 1.8)!
    expect(Math.abs(r.altura - 1.0)).toBeLessThan(0.035)
  })

  it('sin ojos o sin tobillos visibles, o algo imposible: null', () => {
    const p = persona(1.75, 1.5, 1.0, 0)
    expect(alturaCamara(p.map((q, i) => (i === 27 || i === 28 ? { ...q, visibility: 0.1 } : q)), ANCHO, ALTO, 0, 1.75)).toBeNull()
    expect(alturaCamara(null, ANCHO, ALTO, 0, 1.75)).toBeNull()
    // Los ojos por debajo de los tobillos.
    expect(alturaCamara(p.map((q, i) => (i === 2 || i === 5 ? { ...q, y: 0.99 } : q)), ANCHO, ALTO, 0, 1.75)).toBeNull()
  })

  it('la mediana de varios frames y el consejo', () => {
    const m = medianaAltura([{ altura: 1, distancia: 2 }, null, { altura: 3, distancia: 2 }, { altura: 1.1, distancia: 2.2 }])!
    expect(m.altura).toBeCloseTo(1.1)
    expect(medianaAltura([null])).toBeNull()
    expect(consejoAltura(1.0)).toBeNull()
    expect(consejoAltura(0.4)).toMatch(/^Sube/)
    expect(consejoAltura(1.6)).toMatch(/^Baja/)
  })

  it('el ángulo entre los móviles visto desde la persona, por el teorema del coseno', () => {
    expect(anguloEntreMoviles(1.5, 1.5, 1.5 * Math.SQRT2)).toBeCloseTo(90, 6)
    expect(anguloEntreMoviles(2, 2, 2)).toBeCloseTo(60, 6)
    expect(anguloEntreMoviles(1, 1, 3)).toBeNull()
    expect(consejoAngulo(90)).toBeNull()
    expect(consejoAngulo(40)).toMatch(/^Separa/)
    expect(consejoAngulo(150)).toMatch(/^Junta/)
  })
})
