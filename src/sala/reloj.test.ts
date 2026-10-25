import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mensaje } from '../core/sala/protocolo'
import { RAFAGA, RelojSala } from './reloj'

/*
 * Dos relojes de sala conectados por una red simulada (temporizadores falsos): el de B va 1500 ms por delante del de A,
 * la ida tarda 12 ms y la vuelta 30 (asimétrica). Cada uno debe encontrar el desfase del otro dentro de su cota.
 */
const DESFASE = 1500
const IDA = 12
const VUELTA = 30

function pareja() {
  const real = () => Date.now()
  const relojes: { a?: RelojSala; b?: RelojSala } = {}
  const red = (destino: () => RelojSala, retardo: number) => (m: Mensaje) => {
    setTimeout(() => destino().recibir(m), retardo)
    return true
  }
  const a = new RelojSala(red(() => relojes.b!, IDA), () => real())
  const b = new RelojSala(red(() => relojes.a!, VUELTA), () => real() + DESFASE)
  Object.assign(relojes, { a, b })
  return { a, b }
}

describe('RelojSala', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('tras la ráfaga, cada móvil tiene el desfase del otro dentro de la cota (y con el signo de cada lado)', () => {
    const { a, b } = pareja()
    a.reiniciar()
    b.reiniciar()
    vi.advanceTimersByTime(RAFAGA * 50 + 500)
    const ea = a.estimacion()!
    const eb = b.estimacion()!
    expect(a.numero).toBeGreaterThanOrEqual(RAFAGA - 1)
    expect(Math.abs(ea.desfase - DESFASE)).toBeLessThanOrEqual(ea.cota)
    expect(Math.abs(eb.desfase + DESFASE)).toBeLessThanOrEqual(eb.cota)
    // Con retardos fijos el error es la mitad de la asimetría (9 ms) y la cota la mitad del retardo (21 ms).
    expect(ea.desfase).toBeCloseTo(DESFASE + (IDA - VUELTA) / 2, 6)
    expect(ea.cota).toBeCloseTo((IDA + VUELTA) / 2, 6)
    a.parar()
    b.parar()
  })

  it('después de la ráfaga, un ping por segundo; al reiniciar se olvida lo de antes', () => {
    const { a, b } = pareja()
    a.reiniciar()
    b.reiniciar()
    vi.advanceTimersByTime(RAFAGA * 50 + 500)
    const tras = a.numero
    vi.advanceTimersByTime(10_000)
    expect(a.numero - tras).toBeGreaterThanOrEqual(9)
    expect(a.numero - tras).toBeLessThanOrEqual(11)
    a.reiniciar()
    expect(a.numero).toBe(0)
    a.parar()
    b.parar()
  })

  it('una respuesta que no es a un ping propio y vivo se ignora', () => {
    const a = new RelojSala(() => true, () => 0)
    a.recibir({ tipo: 'pong', id: 99, t1: 0, t2: 5, t3: 5 })
    expect(a.numero).toBe(0)
    expect(a.estimacion()).toBeNull()
  })

  it('sin conexión no se queda esperando respuestas que no van a llegar', () => {
    const a = new RelojSala(() => false, () => Date.now())
    a.reiniciar()
    vi.advanceTimersByTime(5000)
    expect(a.estimacion()).toBeNull()
    a.parar()
  })
})
