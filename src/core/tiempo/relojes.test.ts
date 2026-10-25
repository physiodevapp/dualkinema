import { describe, expect, it } from 'vitest'
import { aleatorio } from '../sincronia/sintetico'
import { pasoDeReloj } from './relojes'

/** Frames a ~30 fps con jitter; el aviso de pintado ve solo algunos, y el procesador otros, con un reloj desplazado. */
function frames(semilla: number, diferencia: number, redondeo = 0.1, variacion = 8) {
  const azar = aleatorio(semilla)
  const capturas: number[] = []
  let t = 1000
  for (let i = 0; i < 90; i++) {
    t += 33.3 + (azar() - 0.5) * variacion
    capturas.push(t)
  }
  const r = (x: number) => Math.round(x / redondeo) * redondeo
  // El procesador ve los primeros 60 (en el reloj del vídeo, en µs → ms con 3 decimales); el aviso, uno de cada 2 o 3
  // de los últimos 70 (en el de la página, a 0,1 ms).
  const marcas = capturas.slice(0, 60).map((c) => Math.round((c + diferencia) * 1000) / 1000)
  const avisos = capturas.slice(20).filter(() => azar() < 0.45).map(r)
  return { marcas, avisos }
}

describe('pasoDeReloj', () => {
  it('encuentra la diferencia entre los relojes (la del Pixel 8: 353 110 s) a menos de 0,1 ms', () => {
    for (const [semilla, diferencia] of [
      [1, 353110546.37],
      [2, -38698285.1],
      [3, 178707.3],
    ] as const) {
      const { marcas, avisos } = frames(semilla, diferencia)
      const r = pasoDeReloj(marcas, avisos)!
      expect(Math.abs(r.diferenciaMs - diferencia)).toBeLessThan(0.1)
      expect(r.votos).toBeGreaterThanOrEqual(5)
    }
  })

  it('con frames muy regulares (±1 ms) tampoco confunde un frame con el siguiente', () => {
    const { marcas, avisos } = frames(6, 1234567.8, 0.1, 2)
    const r = pasoDeReloj(marcas, avisos)!
    expect(Math.abs(r.diferenciaMs - 1234567.8)).toBeLessThan(0.1)
  })

  it('con frames exactamente regulares, solo las llegadas desempatan (la cámara falsa de Chromium: uno cada 50 ms)', () => {
    const capturas = Array.from({ length: 60 }, (_, i) => 1000 + 50 * i)
    const diferencia = 304924.8
    const marcas = capturas.slice(0, 40).map((c) => c + diferencia)
    const llegadas = capturas.slice(0, 40).map((c, i) => c + 0.8 + (i % 3) * 0.3)
    const avisos = capturas.slice(5)
    // Sin llegadas no se puede saber qué frame es cuál: no se fía.
    expect(pasoDeReloj(marcas, avisos)).toBeNull()
    const r = pasoDeReloj(marcas, avisos, llegadas)!
    expect(Math.abs(r.diferenciaMs - diferencia)).toBeLessThan(0.1)
  })

  it('con las llegadas, también con frames irregulares y un retraso de llegada como el de la tablet (17 ms de 70)', () => {
    const { marcas, avisos } = frames(7, -39256556.8, 0.1, 6)
    const llegadas = marcas.map((m) => m - -39256556.8 + 16.6)
    const r = pasoDeReloj(marcas, avisos, llegadas)!
    expect(Math.abs(r.diferenciaMs - -39256556.8)).toBeLessThan(0.1)
  })

  it('sin frames en común (los avisos de otro momento), no se fía', () => {
    const { marcas } = frames(4, 5000)
    const lejos = frames(5, 5000 + 1e6).avisos
    expect(pasoDeReloj(marcas, lejos)).toBeNull()
    expect(pasoDeReloj([], [1, 2, 3])).toBeNull()
  })
})
