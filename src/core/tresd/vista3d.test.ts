import { describe, expect, it } from 'vitest'
import { vec3 } from '../geometria/vector'
import { camaraMirando, centro } from './camara'
import { aLienzo, aristasCamara, encuadre, encuadreConZoom, escalaMaxima, proyectarOrto } from './vista3d'

describe('vista del monigote 3D', () => {
  it('desde delante (azimut 0, elevación 0): la izquierda de la persona (+y) a la derecha de la pantalla y z arriba', () => {
    const v = { azimut: 0, elevacion: 0 }
    expect(proyectarOrto(vec3(0, 1, 0), v)).toMatchObject({ u: 1, v: 0 })
    expect(proyectarOrto(vec3(0, 0, 1), v)).toMatchObject({ u: 0, v: 1 })
    // Lo que está más hacia +x (hacia quien mira) está más cerca.
    expect(proyectarOrto(vec3(1, 0, 0), v).prof).toBeGreaterThan(proyectarOrto(vec3(0, 0, 0), v).prof)
  })

  it('desde arriba: el suelo se ve entero y la altura no cuenta', () => {
    const v = { azimut: 0, elevacion: Math.PI / 2 }
    const a = proyectarOrto(vec3(0.3, 0.2, 0), v)
    const b = proyectarOrto(vec3(0.3, 0.2, 5), v)
    expect(a.u).toBeCloseTo(b.u, 9)
    expect(a.v).toBeCloseTo(b.v, 9)
  })

  it('el encuadre mete todos los puntos en el lienzo con su margen y respeta la proporción', () => {
    const v = { azimut: 0.4, elevacion: 0.3 }
    const pts = [vec3(0, 0, 0), vec3(1, 2, 1.8), vec3(-1, 0.5, 0.2), vec3(NaN, 0, 0)]
    const e = encuadre(pts, v, 300, 200, 10)
    for (const p of pts.slice(0, 3)) {
      const q = aLienzo(proyectarOrto(p, v), e, 300, 200)
      expect(q.x).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(q.x).toBeLessThanOrEqual(290 + 1e-9)
      expect(q.y).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(q.y).toBeLessThanOrEqual(190 + 1e-9)
    }
  })

  it('la pirámide de una cámara: el vértice en su centro y la base delante, hacia donde mira', () => {
    const c = camaraMirando(vec3(3, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1), 1000, 1920, 1080)
    const aristas = aristasCamara(c, 1920, 1080, 0.5, (X) => X)
    expect(aristas).toHaveLength(8)
    const C = centro(c)
    expect(aristas[0]![0].x).toBeCloseTo(C.x, 9)
    // La base, hacia −x (mira al origen) a 0,5 m.
    for (const [, b] of aristas.slice(0, 4)) expect(b.x).toBeCloseTo(2.5, 9)
  })
})

describe('zoom del monigote', () => {
  const escena = { escala: 50, u0: 0, v0: 0 }
  const persona = { escala: 200, u0: 1, v0: 1 }
  it('se queda entre la escena (lo más lejos) y dos veces el cuerpo en el alto (lo más cerca)', () => {
    expect(encuadreConZoom(escena, persona, null, 10, 600).escala).toBe(50)
    expect(encuadreConZoom(escena, persona, null, 5000, 600).escala).toBe(600)
    expect(escalaMaxima(1.5, 300)).toBe(400)
  })

  it('el centro: de la escena a la persona al acercarse, y luego hacia la pelvis, hasta seguirla del todo', () => {
    expect(encuadreConZoom(escena, persona, null, 50, 600)).toMatchObject({ u0: 0, v0: 0 })
    expect(encuadreConZoom(escena, persona, null, 100, 600).u0).toBeCloseTo(0.5, 9) // a medio camino en escala logarítmica
    expect(encuadreConZoom(escena, persona, { u: 3, v: 5 }, 200, 600)).toMatchObject({ u0: 1, v0: 1 })
    expect(encuadreConZoom(escena, persona, { u: 3, v: 5 }, 250, 600)).toMatchObject({ u0: 2, v0: 3 })
    expect(encuadreConZoom(escena, persona, { u: 3, v: 5 }, 400, 600)).toMatchObject({ u0: 3, v0: 5 })
    // Sin pelvis en el frame, se queda en la persona.
    expect(encuadreConZoom(escena, persona, null, 400, 600)).toMatchObject({ u0: 1, v0: 1 })
  })
})
