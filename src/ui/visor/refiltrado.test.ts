import { describe, expect, it } from 'vitest'
import { esperaRefiltrado, FACTOR_COSTE, INTERVALO_MIN_MS } from './refiltrado'

describe('refiltrar mientras se sigue', () => {
  it('sin pasada anterior, en el acto', () => {
    expect(esperaRefiltrado(500, -Infinity, 0)).toBe(0)
  })

  it('como mucho una vez por segundo si filtrar es barato', () => {
    expect(INTERVALO_MIN_MS).toBe(1000)
    expect(esperaRefiltrado(10_300, 10_000, 8)).toBe(700)
    expect(esperaRefiltrado(11_000, 10_000, 8)).toBe(0)
    expect(esperaRefiltrado(12_500, 10_000, 8)).toBe(0)
  })

  it('si filtrar es caro, se espera 20 veces lo que tardó (≤ 5 % del tiempo)', () => {
    expect(FACTOR_COSTE).toBe(20)
    // 120 ms por pasada (3 marcadores, 3600 frames en un móvil): cada 2,4 s.
    expect(esperaRefiltrado(10_000, 10_000, 120)).toBe(2400)
    expect(esperaRefiltrado(12_000, 10_000, 120)).toBe(400)
  })
})
