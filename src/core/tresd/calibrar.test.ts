import { describe, expect, it } from 'vitest'
import { vec3, type Vec3 } from '../geometria/vector'
import { aplicar, camaraMirando, centro, focalPrevia, proyectar, type Camara } from './camara'
import { calibrarDosCamaras, nivelacion, type Correspondencia } from './calibrar'
import { estadoEn, generadorRuido, puntosDe } from './sintetico'

const H = 1.75
const ARRIBA = vec3(0, 0, 1)
const IMG = { ancho: 1080, alto: 1920 }
const f = focalPrevia(IMG.ancho, IMG.alto)
const grados = (r: number) => (r * 180) / Math.PI
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const abajoEn = (c: Camara) => aplicar(c.R, vec3(0, 0, -1))
const ejeOptico = (c: Camara) => vec3(c.R[6], c.R[7], c.R[8])
const anguloEntre = (a: Vec3, b: Vec3) => grados(Math.acos((a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))))

/**
 * La persona sintética (mira hacia +y) vista por dos móviles en los flancos por delante, a ±45° y unos 3 m, a 1,0 y
 * 0,8 m de alto; el segundo, ladeado 3° y con otra focal. Correspondencias de los 12 puntos en los primeros 6 s (los pasos
 * por la zona), cada 3 frames a 30 fps, con ruido y algunos puntos mal detectados.
 */
function escena({ ruidoPx = 2, malos = 0.05, fB = f * 1.08 } = {}) {
  const camaras = [
    camaraMirando(vec3(3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 1.0), vec3(0, 0, 0.9), ARRIBA, f, IMG.ancho, IMG.alto),
    camaraMirando(vec3(-3.2 * Math.SQRT1_2, 3.2 * Math.SQRT1_2, 0.8), vec3(0, 0, 0.85), ARRIBA, fB, IMG.ancho, IMG.alto, (3 * Math.PI) / 180),
  ] as const
  const ruido = generadorRuido(7)
  const correspondencias: Correspondencia[] = []
  const verdad: Vec3[] = []
  for (let k = 0; k < 180; k += 3) {
    for (const [id, X] of puntosDe(estadoEn(k / 30, H), H)) {
      const [a, b] = camaras.map((c) => proyectar(c, X))
      const malo = ruido() > 1.645 * (1 - malos * 10) && malos > 0 && Math.abs(ruido()) > 1.6
      const e = () => ruido() * ruidoPx + (malo ? 40 : 0)
      correspondencias.push({ id, a: { u: a!.u + e(), v: a!.v + e() }, b: { u: b!.u + e(), v: b!.v + e() } })
      verdad.push(X)
    }
  }
  return { camaras, correspondencias, verdad }
}

describe('nivelacion', () => {
  it('lleva la gravedad de la cámara a −z del mundo y el eje óptico a +x en horizontal', () => {
    const c = camaraMirando(vec3(0, 0, 1), vec3(2, 1, 0.6), ARRIBA, 1000, 1000, 1000, 0.1)
    const M = nivelacion(abajoEn(c))
    const g = aplicar(M, vec3(0, 0, -1))
    const d = abajoEn(c)
    expect(g.x).toBeCloseTo(d.x, 9)
    expect(g.y).toBeCloseTo(d.y, 9)
    expect(g.z).toBeCloseTo(d.z, 9)
    // El eje óptico en el mundo de la nivelación: fila 3 de M; sin componente y.
    expect(M[7]).toBeCloseTo(0, 9)
    expect(M[6]).toBeGreaterThan(0)
  })
})

// Cálculos de verdad con la persona sintética: en el runner de la CI, alguno pasa de los 5 s por defecto.
describe('calibrarDosCamaras con la persona sintética', { timeout: 30_000 }, () => {
  it('sin ruido y con la focal de cada móvil conocida: el ángulo entre las cámaras y la forma de la persona salen exactos', () => {
    const { camaras, correspondencias, verdad } = escena({ ruidoPx: 0, malos: 0 })
    const r = calibrarDosCamaras({ correspondencias, imagenes: [IMG, IMG], verticales: [abajoEn(camaras[0]), abajoEn(camaras[1])], focales: [f, f * 1.08] })
    expect(r.errorMediano).toBeLessThan(0.05)
    expect(anguloEntre(ejeOptico(r.camaras[0]), ejeOptico(r.camaras[1]))).toBeCloseTo(anguloEntre(ejeOptico(camaras[0]), ejeOptico(camaras[1])), 2)
    expect(r.camaras[0].f / f).toBeCloseTo(1, 3)
    expect(r.camaras[1].f / (f * 1.08)).toBeCloseTo(1, 3)
    // Escala: la distancia entre las cámaras es 1; la de verdad, la de las dos cámaras sintéticas.
    const base = dist(centro(camaras[0]), centro(camaras[1]))
    expect(dist(r.puntos[0]!, r.puntos[100]!) * base).toBeCloseTo(dist(verdad[0]!, verdad[100]!), 3)
  })

  it('con 2 px de ruido y un 5 % de puntos mal detectados (40 px), partiendo de una focal un 8 % errada en B', () => {
    const { camaras, correspondencias, verdad } = escena()
    const r = calibrarDosCamaras({ correspondencias, imagenes: [IMG, IMG], verticales: [abajoEn(camaras[0]), abajoEn(camaras[1])] })
    // La focal sale mal determinada con la persona sola (ver «Hecho», paso 2): el ángulo entre las cámaras, a 1,5°.
    expect(Math.abs(anguloEntre(ejeOptico(r.camaras[0]), ejeOptico(r.camaras[1])) - anguloEntre(ejeOptico(camaras[0]), ejeOptico(camaras[1])))).toBeLessThan(1.5)
    expect(Math.abs(r.camaras[0].f / f - 1)).toBeLessThan(0.03)
    expect(Math.abs(r.camaras[1].f / (f * 1.08) - 1)).toBeLessThan(0.03)
    expect(r.errorMediano).toBeGreaterThan(0.5)
    expect(r.errorMediano).toBeLessThan(3.5)
    // La longitud de la pierna (rodilla–tobillo) en unidades de la distancia entre cámaras, frente a la verdad.
    const base = dist(centro(camaras[0]), centro(camaras[1]))
    const largos = (pts: readonly Vec3[]) => {
      const r2: number[] = []
      for (let k = 0; k + 12 <= pts.length; k += 12) r2.push(dist(pts[k + 2]!, pts[k + 3]!))
      return r2.sort((a, b) => a - b)[r2.length >> 1]!
    }
    // En unidades de la distancia entre cámaras (la escala de verdad sale de la estatura): a un 5 %, por la focal.
    expect(Math.abs((largos(r.puntos) * base) / largos(verdad) - 1)).toBeLessThan(0.05)
    // El error por punto del cuerpo está para los 12.
    expect(r.errorPorPunto.size).toBe(12)
  })

  it('la vertical del acelerómetro con 1° de error: el ajuste la corrige y el resultado aguanta', () => {
    const { camaras, correspondencias } = escena()
    const d = abajoEn(camaras[1])
    const torcida = vec3(d.x + 0.0175, d.y, d.z)
    const r = calibrarDosCamaras({ correspondencias, imagenes: [IMG, IMG], verticales: [abajoEn(camaras[0]), torcida] })
    expect(Math.abs(anguloEntre(ejeOptico(r.camaras[0]), ejeOptico(r.camaras[1])) - anguloEntre(ejeOptico(camaras[0]), ejeOptico(camaras[1])))).toBeLessThan(1.5)
    expect(r.errorMediano).toBeLessThan(3.5)
  })

  it('con ruido y la focal de cada móvil conocida (calibrada una vez): el ángulo entre las cámaras, a menos de 0,5°', () => {
    const { camaras, correspondencias } = escena()
    const r = calibrarDosCamaras({ correspondencias, imagenes: [IMG, IMG], verticales: [abajoEn(camaras[0]), abajoEn(camaras[1])], focales: [f, f * 1.08] })
    expect(Math.abs(anguloEntre(ejeOptico(r.camaras[0]), ejeOptico(r.camaras[1])) - anguloEntre(ejeOptico(camaras[0]), ejeOptico(camaras[1])))).toBeLessThan(0.5)
  })
})
