import { describe, expect, it } from 'vitest'
import { aLocal, aRemoto, desfaseDe, estimarDesfase, intervaloDe, retardoDe, type Intercambio } from './desfase'
import { relojRemoto, retardoRed, simularIntercambios } from './sintetico'

const fijo = (ms: number) => () => ms

describe('un intercambio', () => {
  it('desfase, retardo e intervalo de valor conocido', () => {
    // Remoto 1000 ms por delante; ida 30 ms, contesta en 2 ms, vuelta 10 ms.
    const i: Intercambio = { t1: 0, t2: 1030, t3: 1032, t4: 42 }
    expect(retardoDe(i)).toBe(40)
    expect(desfaseDe(i)).toBe(1010) // el error de NTP es la mitad de la asimetría: (30 − 10) / 2
    expect(intervaloDe(i)).toEqual({ min: 990, max: 1030 }) // y el real (1000) está dentro
  })
})

describe('estimarDesfase', () => {
  it('sin intercambios válidos, null', () => {
    expect(estimarDesfase([])).toBeNull()
    expect(estimarDesfase([{ t1: 10, t2: 5, t3: 6, t4: 5 }])).toBeNull() // t4 < t1
    expect(estimarDesfase([{ t1: 0, t2: NaN, t3: 1, t4: 2 }])).toBeNull()
  })

  it('retardos asimétricos fijos (ida 30, vuelta 10): error de 10 ms y la cota de 20 lo cubre', () => {
    const e = estimarDesfase(simularIntercambios({ desfase: 1000, n: 30, intervalo: 50, ida: fijo(30), vuelta: fijo(10), proceso: 0 }))!
    expect(e.metodo).toBe('interseccion')
    expect(e.desfase).toBeCloseTo(1010, 9)
    expect(e.cota).toBeCloseTo(20, 9)
    expect(Math.abs(e.desfase - 1000)).toBeLessThanOrEqual(e.cota)
  })

  it('con la red variable, la intersección estrecha la cota por debajo de la mitad del retardo mínimo y sigue cubriendo el desfase real', () => {
    for (const semilla of [1, 2, 3, 4, 5]) {
      const real = -123456.789
      const lista = simularIntercambios({ desfase: real, n: 30, intervalo: 50, ida: retardoRed(8, 25), vuelta: retardoRed(12, 25), semilla })
      const e = estimarDesfase(lista)!
      expect(e.metodo).toBe('interseccion')
      expect(Math.abs(e.desfase - real), `semilla ${semilla}`).toBeLessThanOrEqual(e.cota)
      expect(e.cota).toBeLessThanOrEqual(e.retardoMinimo / 2)
      expect(e.cota).toBeLessThan(15)
    }
  })

  it('unos pocos intercambios lentísimos (500 ms) no mueven la estimación', () => {
    const buenos = simularIntercambios({ desfase: 250, n: 20, intervalo: 50, ida: retardoRed(10, 10), vuelta: retardoRed(10, 10), semilla: 7 })
    const lentos = simularIntercambios({ desfase: 250, n: 5, intervalo: 50, inicio: 2000, ida: fijo(480), vuelta: fijo(20), semilla: 8 })
    const a = estimarDesfase(buenos)!
    const b = estimarDesfase([...buenos, ...lentos])!
    expect(b.desfase).toBeCloseTo(a.desfase, 9)
    expect(b.cota).toBeCloseTo(a.cota, 9)
  })

  it('un intercambio con marcas imposibles vacía la intersección: mediana de los rápidos y una cota que sigue cubriendo el real', () => {
    const lista = simularIntercambios({ desfase: 500, n: 20, intervalo: 50, ida: retardoRed(10, 10), vuelta: retardoRed(10, 10), semilla: 9 })
    // El remoto marcó t2/t3 40 ms antes de lo posible (un reloj que salta): su intervalo no contiene el desfase real.
    const roto = { ...lista[3]!, t2: lista[3]!.t2 - 40, t3: lista[3]!.t3 - 40 }
    const e = estimarDesfase([...lista.slice(0, 3), roto, ...lista.slice(4)])!
    expect(e.metodo).toBe('mediana')
    expect(Math.abs(e.desfase - 500)).toBeLessThanOrEqual(e.cota)
  })

  it('aRemoto y aLocal deshacen el desfase', () => {
    const e = { desfase: 1234.5 }
    expect(aRemoto(e, 100)).toBe(1334.5)
    expect(aLocal(e, aRemoto(e, 77.25))).toBe(77.25)
  })

  it('la simulación cumple la definición: remoto = local + desfase', () => {
    expect(relojRemoto({ desfase: 10 }, 5)).toBe(15)
    expect(relojRemoto({ desfase: 0, deriva: 100 }, 1e6)).toBeCloseTo(1e6 + 100, 9)
  })
})
