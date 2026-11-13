import { describe, expect, it } from 'vitest'
import { giroDeAngulos, giroY, multiplicar } from './orientacion'
import { anotarFrames, CALIDAD_CARA_MINIMA, caraVacia, fusionarVistas, giroNeutro, leerCara, medidaEn, rango, seriesCervicales } from './sesion'

const FPS = 30
/** La matriz 4 × 4 por columnas (como la de Face Landmarker) de un giro, con escala y traslación. */
const matriz = (r: readonly number[]) => {
  const m = new Array<number>(16).fill(0)
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) m[4 * j + i] = r[i * 3 + j]!
  m[14] = -40
  m[15] = 1
  return m
}

describe('lo cervical de una vista', () => {
  /** 6 s: 2 s quieto mirando algo girado a la derecha de la cámara (el neutro), luego rotación a ±70° y flexión de 40°. */
  const total = 6 * FPS
  const tiempos = Array.from({ length: total }, (_, i) => i / FPS)
  const camara = giroY(15) // la cara de partida, girada 15° respecto a la cámara
  const verdad = tiempos.map((t) => (t < 2 ? { rot: 0, flex: 0 } : { rot: 70 * Math.sin((Math.PI * (t - 2)) / 2), flex: 40 * Math.sin((Math.PI * (t - 2)) / 4) ** 2 }))
  const cara = caraVacia(total)
  const sinCara = new Set([100, 101, 102, 103])
  anotarFrames(
    cara,
    verdad.map((v, i) => ({ indice: i, matriz: sinCara.has(i) ? null : matriz(multiplicar(camara, giroDeAngulos(v.rot, v.flex, 0))) })),
  )

  it('la calidad es lo de frente que se ve la cara; sin cara, sin medida', () => {
    expect(cara.calidad[0]).toBeCloseTo(Math.cos((15 * Math.PI) / 180), 5)
    expect(medidaEn(cara, 101)).toBeNull()
    // A 70° de rotación respecto al neutro son 85° respecto a la cámara (o 55° hacia el otro lado): de perfil, sin medida.
    const i85 = verdad.findIndex((v) => v.rot > 69.5)
    expect(cara.calidad[i85]!).toBeLessThan(CALIDAD_CARA_MINIMA)
    expect(medidaEn(cara, i85)).toBeNull()
  })

  it('con el neutro de los primeros 2 s, las curvas son las de verdad donde se ve la cara, y no cruzan el hueco', () => {
    const medidas = tiempos.map((_, i) => medidaEn(cara, i))
    const neutro = giroNeutro(medidas, tiempos, { desde: 0, hasta: 2 })!
    const s = seriesCervicales(medidas, tiempos, neutro, FPS, { corteHz: 6 })
    for (let i = 70; i < total - 5; i += 7) {
      if (!medidas[i] || !medidas[i - 3] || !medidas[i + 3]) continue
      expect(Math.abs(s.rotacion[i]!.valor - verdad[i]!.rot), `rotación en ${tiempos[i]}`).toBeLessThan(1)
      expect(Math.abs(s.flexion[i]!.valor - verdad[i]!.flex), `flexión en ${tiempos[i]}`).toBeLessThan(1)
      expect(Math.abs(s.inclinacion[i]!.valor)).toBeLessThan(1)
    }
    expect(Number.isNaN(s.rotacion[101]!.valor)).toBe(true)
    // Rango: la cara de partida ya está girada 15° hacia la izquierda respecto a la cámara. A la derecha, 70° del neutro son
    // 55° respecto a la cámara: se ve entero. A la izquierda, a partir de 55° del neutro (70° respecto a la cámara) se
    // pierde: el rango a la izquierda se queda corto, y se ve en la asimetría. Con un solo móvil, hay que ponerlo de frente.
    const r = rango(s.rotacion)
    expect(r.negativo).toBeGreaterThan(68)
    expect(r.positivo).toBeLessThan(57)
    expect(r.asimetria).toBeLessThan(-0.1)
  })

  it('se guarda y se lee; lo que no cuadra se descarta', () => {
    const conCero = { ...cara, cero: { desde: 0, hasta: 2 } }
    expect(leerCara(conCero, total)).toEqual(conCero)
    expect(leerCara(conCero, total + 1)).toBeNull()
    expect(leerCara({ ...conCero, giros: [1, 2] }, total)).toBeNull()
  })
})

describe('dos móviles en diagonal (D6)', () => {
  it('juntos dan la rotación de −90° a +90° que ninguno da solo, con vídeos de fps y desfase distintos', () => {
    const tA = Array.from({ length: 8 * 30 }, (_, i) => i / 30)
    const tB = Array.from({ length: 8 * 25 }, (_, i) => i / 25 + 0.013)
    const desfaseB = 0.2 // el tiempo común de B = su tiempo + 0,2 s
    // La cabeza en el tiempo común: 2 s quieta y luego de −90° a +90° y vuelta.
    const rot = (tc: number) => (tc < 2 ? 0 : 90 * Math.sin((2 * Math.PI * (tc - 2)) / 5))
    const vista = (cam: number, tiempos: readonly number[], desfase: number) => {
      const c = caraVacia(tiempos.length)
      anotarFrames(c, tiempos.map((t, i) => ({ indice: i, matriz: matriz(multiplicar(giroY(cam), giroDeAngulos(rot(t + desfase), 5, 0))) })))
      return { medidas: tiempos.map((_, i) => medidaEn(c, i)), tiempos, desfase }
    }
    const a = vista(-45, tA, 0)
    const b = vista(45, tB, desfaseB)
    // Ninguna sola cubre el recorrido.
    expect(a.medidas.some((m) => !m) && b.medidas.some((m) => !m)).toBe(true)
    const f = fusionarVistas(a, b)!
    expect(f.anguloMoviles).toBeCloseTo(90, 0)
    expect(f.comunes).toBeGreaterThan(30)
    const neutro = giroNeutro(f.medidas, tA, { desde: 0, hasta: 1.8 })!
    const s = seriesCervicales(f.medidas, tA, neutro, 30, { corteHz: 6 })
    const r = rango(s.rotacion)
    expect(r.positivo).toBeGreaterThan(88)
    expect(r.negativo).toBeGreaterThan(88)
    expect(Math.abs(r.asimetria)).toBeLessThan(0.02)
    expect(f.medidas.every(Boolean)).toBe(true)
  })
})
