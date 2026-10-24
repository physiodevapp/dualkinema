import { describe, expect, it } from 'vitest'
import { aleatorio } from '../sincronia/sintetico'
import { ALFABETO_CODIGO, codigoDeBusqueda, formatoCodigo, generarCodigo, normalizarCodigo, urlDeSala } from './codigo'

const bytesDe = (semilla: number) => {
  const azar = aleatorio(semilla)
  return (n: number) => Uint8Array.from({ length: n }, () => Math.floor(azar() * 256))
}

describe('código de sala', () => {
  it('6 caracteres del alfabeto, sin 0, O, 1, I ni L', () => {
    expect(ALFABETO_CODIGO).toHaveLength(31)
    for (const ch of '0O1IL') expect(ALFABETO_CODIGO).not.toContain(ch)
    const c = generarCodigo(bytesDe(1))
    expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
  })

  it('descarta los bytes que darían más peso a unos caracteres (≥ 248)', () => {
    let llamada = 0
    // Primera tanda: todo 255 (se descarta); después, 0..11 → los 6 primeros caracteres del alfabeto.
    const c = generarCodigo((n) => (llamada++ === 0 ? new Uint8Array(n).fill(255) : Uint8Array.from({ length: n }, (_, i) => i)))
    expect(c).toBe('234567')
  })

  it('reparto uniforme: en 31 000 caracteres, cada uno entre 850 y 1150 veces', () => {
    const cuenta = new Map<string, number>()
    const bytes = bytesDe(2)
    for (let k = 0; k < 31_000 / 6; k++) for (const ch of generarCodigo(bytes)) cuenta.set(ch, (cuenta.get(ch) ?? 0) + 1)
    for (const ch of ALFABETO_CODIGO) {
      expect(cuenta.get(ch)).toBeGreaterThan(850)
      expect(cuenta.get(ch)).toBeLessThan(1150)
    }
  })

  it('escrito a mano se normaliza; lo que no es un código, null', () => {
    expect(normalizarCodigo('abc-def')).toBe('ABCDEF')
    expect(normalizarCodigo(' k7m 2pq ')).toBe('K7M2PQ')
    expect(normalizarCodigo('ABC1EF')).toBeNull() // el 1 no está
    expect(normalizarCodigo('ABCDE')).toBeNull()
    expect(normalizarCodigo('ABCDEFG')).toBeNull()
  })

  it('formato y dirección del QR, y vuelta desde la dirección', () => {
    expect(formatoCodigo('K7M2PQ')).toBe('K7M-2PQ')
    const url = urlDeSala('https://rama-dualkinema.x.workers.dev/', 'K7M2PQ')
    expect(url).toBe('https://rama-dualkinema.x.workers.dev/?sala=K7M2PQ')
    expect(codigoDeBusqueda(url.slice(url.indexOf('?')))).toBe('K7M2PQ')
    expect(codigoDeBusqueda('?laboratorio&sala=k7m-2pq')).toBe('K7M2PQ')
    expect(codigoDeBusqueda('?laboratorio')).toBeNull()
    expect(codigoDeBusqueda('?sala=%E0%A4%A')).toBeNull() // escape roto
  })
})
