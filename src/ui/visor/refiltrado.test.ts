import { describe, expect, it } from 'vitest'
import { esperaRefiltrado, FACTOR_COSTE, INTERVALO_MIN_MS, versionAFiltrar } from './refiltrado'

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

  it('parado se filtra con la versión actual; siguiendo, con la pedida', () => {
    expect(versionAFiltrar(false, false, 7, 3)).toBe(7)
    expect(versionAFiltrar(true, false, 7, 3)).toBe(3)
  })

  it('al empezar a seguir se filtra con la versión actual, la que ya tiene lo borrado', () => {
    // La pasada anterior acabó con la pedida alcanzando la versión 12; «Seguir desde aquí» borra (13) y empieza a seguir.
    // Con la pedida (12) el filtrado sería el de antes de borrar, el mismo que ya estaba calculado: no se rehacía.
    expect(versionAFiltrar(true, true, 13, 12)).toBe(13)
  })
})
