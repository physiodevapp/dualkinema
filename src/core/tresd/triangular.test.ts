import { describe, expect, it } from 'vitest'
import { vec3, type Vec3 } from '../geometria/vector'
import { aCamara, camaraMirando, centro, focalPrevia, proyectar } from './camara'
import { triangular } from './triangular'

const ARRIBA = vec3(0, 0, 1)
const ANCHO = 1080
const ALTO = 1920
const f = focalPrevia(ANCHO, ALTO)
/** Un móvil en cada flanco por delante de la persona (mira hacia +y): a ±45°, a 3 m y a 1 m de alto. */
const camaras = [
  camaraMirando(vec3(3 * Math.sin(Math.PI / 4), 3 * Math.cos(Math.PI / 4), 1), vec3(0, 0, 0.9), ARRIBA, f, ANCHO, ALTO),
  camaraMirando(vec3(-3 * Math.sin(Math.PI / 4), 3 * Math.cos(Math.PI / 4), 0.8), vec3(0, 0, 0.9), ARRIBA, f, ANCHO, ALTO, 0.05),
]
const obs = (X: Vec3, ruido = [0, 0, 0, 0]) =>
  camaras.map((camara, k) => {
    const p = proyectar(camara, X)
    return { camara, u: p.u + ruido[2 * k]!, v: p.v + ruido[2 * k + 1]! }
  })

describe('cámara', () => {
  it('mirando a un punto, lo ve en el centro de la imagen; su centro es donde se colocó', () => {
    const c = camaras[0]!
    const p = proyectar(c, vec3(0, 0, 0.9))
    expect(p.u).toBeCloseTo(ANCHO / 2, 6)
    expect(p.v).toBeCloseTo(ALTO / 2, 6)
    const C = centro(c)
    expect(C.x).toBeCloseTo(3 * Math.SQRT1_2, 9)
    expect(C.z).toBeCloseTo(1, 9)
  })

  it('lo de arriba se ve arriba en la imagen (v menor) y la derecha de la cámara a la derecha', () => {
    const c = camaraMirando(vec3(0, -3, 1), vec3(0, 0, 1), ARRIBA, 1000, 1000, 1000)
    expect(proyectar(c, vec3(0, 0, 1.5)).v).toBeLessThan(500)
    // Mirando hacia +y con z arriba, la derecha de la imagen es +x.
    expect(proyectar(c, vec3(0.5, 0, 1)).u).toBeGreaterThan(500)
  })

  it('un punto detrás de la cámara no se ve', () => {
    expect(proyectar(camaras[0]!, vec3(10, 10, 1)).u).toBeNaN()
  })

  it('la focal previa: 65° sobre el lado largo', () => {
    expect((2 * Math.atan(ALTO / 2 / f) * 180) / Math.PI).toBeCloseTo(65, 9)
  })
})

describe('triangular', () => {
  it('sin ruido, recupera el punto exacto (rodilla, tobillo, hombro) con error de reproyección nulo', () => {
    for (const X of [vec3(0.1, 0.05, 0.5), vec3(-0.12, 0, 0.08), vec3(0.2, -0.1, 1.45)]) {
      const r = triangular(obs(X))
      expect(r.X.x).toBeCloseTo(X.x, 6)
      expect(r.X.y).toBeCloseTo(X.y, 6)
      expect(r.X.z).toBeCloseTo(X.z, 6)
      expect(r.error).toBeLessThan(1e-6)
    }
  })

  it('con 2 px de ruido, el punto queda a menos de 1 cm y el error es del orden del ruido', () => {
    const X = vec3(0.1, 0.05, 0.5)
    const r = triangular(obs(X, [2, -2, -1.5, 2]))
    expect(Math.hypot(r.X.x - X.x, r.X.y - X.y, r.X.z - X.z)).toBeLessThan(0.01)
    expect(r.error).toBeGreaterThan(0.1)
    expect(r.error).toBeLessThan(3)
  })

  it('con una sola cámara que lo ve, no se triangula (NaN): nunca se inventa', () => {
    const o = obs(vec3(0, 0, 1))
    const r = triangular([o[0]!, { ...o[1]!, u: NaN, v: NaN }])
    expect(r.X.x).toBeNaN()
    expect(r.error).toBeNaN()
  })

  it('el resultado queda delante de las dos cámaras', () => {
    const r = triangular(obs(vec3(0, 0.3, 1.2)))
    for (const c of camaras) expect(aCamara(c, r.X).z).toBeGreaterThan(0)
  })
})
