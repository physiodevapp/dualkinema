import { describe, expect, it } from 'vitest'
import type { IdMarcador } from '../modelo/tipos'
import { estadoEnAncla, SeguidorMultiple, type Ancla } from './multiple'
import { aprenderMarcador, type Resultado } from './seguidor'
import { AZUL, dibujarFrame, lector, VERDE, type Disco } from './sintetico'

const W = 320
const H = 240
const TIEMPOS = Array.from({ length: 40 }, (_, i) => i / 30)

type Escena = (t: number, i: number) => Record<IdMarcador, Disco | null>

/**
 * Sigue la escena desde el frame 0 y devuelve, por frame, el resultado de cada
 * marcador y su posición real. `anclas`: por frame, la posición que se marcó a mano.
 */
function recorrer(escena: Escena, anclas: ReadonlyMap<number, ReadonlyMap<IdMarcador, Ancla>> = new Map()) {
  const dibujar = (t: number, i: number) => {
    const discos = Object.values(escena(t, i)).filter((d): d is Disco => d !== null)
    return lector(dibujarFrame(W, H, discos, { semilla: i + 1 }))
  }
  const inicial = escena(0, 0)
  const leer0 = dibujar(0, 0)
  const estados = new Map(Object.entries(inicial).map(([id, d]) => [id, aprenderMarcador(leer0, W, H, 0, d!.x, d!.y).estado]))
  const seguidor = new SeguidorMultiple(estados, W, H)
  const salida: { i: number; res: Map<IdMarcador, Resultado>; real: Record<IdMarcador, Disco | null> }[] = []
  TIEMPOS.forEach((t, i) => {
    if (i === 0) return
    salida.push({ i, res: seguidor.procesar(t, dibujar(t, i), anclas.get(i)), real: escena(t, i) })
  })
  return salida
}

const error = (r: Resultado, d: Disco | null) => (d ? Math.hypot(r.x - d.x, r.y - d.y) : NaN)

describe('anclas: una posición marcada a mano corrige lo que viene después', () => {
  // El gomet avanza y en el frame 15 aparece 120 px más allá (como si el
  // seguidor se hubiera quedado atrás): fuera de cualquier ventana de búsqueda.
  const salto: Escena = (t, i) => ({ a: { x: 60 + 60 * t + (i >= 15 ? 120 : 0), y: 120, r: 8, rgb: VERDE } })

  it('sin ancla, el salto deja el marcador perdido hasta el final', () => {
    const despues = recorrer(salto).filter(({ i }) => i >= 15)
    for (const { res } of despues) expect(res.get('a')!.x).toBeNaN()
  })

  it('con un ancla en el frame del salto, se sigue bien desde ahí', () => {
    const real = salto(TIEMPOS[15]!, 15).a!
    const anclas = new Map([[15, new Map([['a', { x: real.x, y: real.y }]])]])
    const res = recorrer(salto, anclas)
    const enAncla = res.find(({ i }) => i === 15)!.res.get('a')!
    expect(enAncla).toMatchObject({ x: real.x, y: real.y, calidad: 1 })
    for (const { res: r, real: d } of res.filter(({ i }) => i > 15)) expect(error(r.get('a')!, d.a!)).toBeLessThan(0.5)
  })

  it('vuelve a aprender el gomet en el ancla (cambio brusco de color)', () => {
    // A partir del frame 15 el gomet se ve azul (otra luz, otro gomet): el
    // seguidor no lo reconoce por su color antiguo, pero el ancla lo reaprende.
    const cambio: Escena = (t, i) => ({ a: { x: 80 + 60 * t, y: 120, r: 8, rgb: i >= 15 ? AZUL : VERDE } })
    expect(recorrer(cambio).find(({ i }) => i === 20)!.res.get('a')!.x).toBeNaN()
    const real = cambio(TIEMPOS[15]!, 15).a!
    const res = recorrer(cambio, new Map([[15, new Map([['a', { x: real.x, y: real.y }]])]]))
    for (const { res: r, real: d } of res.filter(({ i }) => i > 15)) expect(error(r.get('a')!, d.a!)).toBeLessThan(0.5)
  })

  it('un ancla a ojo (gomet tapado) se respeta y conserva el color aprendido', () => {
    const tapado = (i: number) => i >= 12 && i <= 14
    const escena: Escena = (t, i) => ({ a: tapado(i) ? null : { x: 80 + 60 * t, y: 120, r: 8, rgb: VERDE } })
    const x = 80 + 60 * TIEMPOS[13]!
    const res = recorrer(escena, new Map([[13, new Map([['a', { x, y: 120 }]])]]))
    expect(res.find(({ i }) => i === 12)!.res.get('a')!.x).toBeNaN() // sin ancla: hueco, no se inventa
    expect(res.find(({ i }) => i === 13)!.res.get('a')!).toMatchObject({ x, y: 120, calidad: 1 })
    expect(res.find(({ i }) => i === 14)!.res.get('a')!.x).toBeNaN()
    for (const { res: r, real: d } of res.filter(({ i }) => i > 14)) expect(error(r.get('a')!, d.a!)).toBeLessThan(0.5)
  })

  it('una corrección fina conserva la velocidad; una grande arranca sin ella', () => {
    const leer = lector(dibujarFrame(W, H, [{ x: 100, y: 120, r: 8, rgb: VERDE }]))
    const previo = { ...aprenderMarcador(leer, W, H, 0, 100, 120).estado, ultimas: [{ t: 0, x: 90, y: 120 }, { t: 1 / 30, x: 95, y: 120 }] }
    // Previsto en t = 2/30: x = 100. Corrección de 2 px: fina.
    expect(estadoEnAncla(previo, { x: 102, y: 120 }, 2 / 30, leer, W, H).ultimas).toEqual([{ t: 1 / 30, x: 95, y: 120 }, { t: 2 / 30, x: 102, y: 120 }])
    // A 60 px de lo previsto: lo de antes estaba mal, no se usa su velocidad.
    expect(estadoEnAncla(previo, { x: 160, y: 120 }, 2 / 30, leer, W, H).ultimas).toEqual([{ t: 2 / 30, x: 160, y: 120 }])
    // Venía perdido: tampoco.
    expect(estadoEnAncla({ ...previo, perdidos: 2 }, { x: 100, y: 120 }, 2 / 30, leer, W, H).ultimas).toHaveLength(1)
  })

  it('si el ancla cae encima de otro marcador, solo pierde la posición el buscado', () => {
    const escena: Escena = (t) => ({
      a: { x: 80 + 60 * t, y: 120, r: 8, rgb: VERDE },
      b: { x: 200, y: 120, r: 8, rgb: VERDE },
    })
    // Ancla (errónea) de «a» sobre el gomet de «b».
    const res = recorrer(escena, new Map([[10, new Map([['a', { x: 200, y: 120 }]])]]))
    const f = res.find(({ i }) => i === 10)!.res
    expect(f.get('a')).toMatchObject({ x: 200, y: 120, calidad: 1 })
    expect(f.get('b')).toMatchObject({ calidad: 0, motivo: 'conflicto' })
  })
})
