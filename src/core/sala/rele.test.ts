import { describe, expect, it } from 'vitest'
import { gastarFicha, leerAviso, origenPermitido, RAFAGA_MAXIMA, RITMO_MAXIMO, textoAviso, type Cubo } from './rele'

describe('relé de salas', () => {
  it('avisos: ida y vuelta, y un mensaje de la app no es un aviso', () => {
    for (const a of [{ rele: 'bienvenida', ocupantes: 1 }, { rele: 'entra', ocupantes: 2 }, { rele: 'sale', ocupantes: 1 }] as const) {
      expect(leerAviso(textoAviso(a))).toEqual(a)
    }
    expect(leerAviso(JSON.stringify({ tipo: 'ping', id: 1, t1: 0 }))).toBeNull()
    expect(leerAviso(JSON.stringify({ rele: 'entra', ocupantes: -1 }))).toBeNull()
    expect(leerAviso('no')).toBeNull()
  })

  it('ritmo: una ráfaga de 60 pasa, la 61 no; al segundo se han repuesto 30', () => {
    let cubo: Cubo | null = null
    for (let k = 0; k < RAFAGA_MAXIMA; k++) {
      const r = gastarFicha(cubo, 1000)
      expect(r.permitido, `mensaje ${k + 1}`).toBe(true)
      cubo = r.cubo
    }
    expect(gastarFicha(cubo, 1000).permitido).toBe(false)
    let pasan = 0
    for (let k = 0; k < 100; k++) {
      const r = gastarFicha(cubo, 2000)
      cubo = r.cubo
      if (r.permitido) pasan++
    }
    expect(pasan).toBe(RITMO_MAXIMO)
  })

  it('el uso de la app (20 pings por segundo y sus respuestas) nunca se corta', () => {
    let cubo: Cubo | null = null
    // 1,5 s a 20 pings/s más 20 pongs/s del otro móvil = 40 mensajes/s, y luego 2 por segundo durante un minuto.
    for (let t = 0; t < 1500; t += 25) {
      const r = gastarFicha(cubo, t)
      expect(r.permitido, `t = ${t}`).toBe(true)
      cubo = r.cubo
    }
    for (let t = 1500; t < 61_500; t += 500) {
      const r = gastarFicha(cubo, t)
      expect(r.permitido).toBe(true)
      cubo = r.cubo
    }
  })

  it('orígenes: producción, previsualizaciones y localhost sí; el propio relé y otras webs no', () => {
    expect(origenPermitido('https://dualkinema.edu-gamboa-rodriguez.workers.dev')).toBe(true)
    expect(origenPermitido('https://claude-dualkinema-fase-4-plan-u8i564-dualkinema.edu-gamboa-rodriguez.workers.dev')).toBe(true)
    expect(origenPermitido('http://localhost:4173')).toBe(true)
    expect(origenPermitido('http://127.0.0.1:8080')).toBe(true)
    expect(origenPermitido('https://dualkinema-senal.edu-gamboa-rodriguez.workers.dev')).toBe(false)
    expect(origenPermitido('https://dualkinema.edu-gamboa-rodriguez.workers.dev.malo.com')).toBe(false)
    expect(origenPermitido('http://dualkinema.edu-gamboa-rodriguez.workers.dev')).toBe(false)
    expect(origenPermitido(null)).toBe(false)
  })
})
