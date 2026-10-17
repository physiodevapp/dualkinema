import { describe, expect, it } from 'vitest'
import { CALIDAD_MINIMA } from '../articulaciones/calculo'
import { RecuentoHuecos } from './huecos'
import { CALIDAD_PERDIDO } from './seguidor'

describe('RecuentoHuecos', () => {
  it('no cuenta los frames con posición utilizable', () => {
    const r = new RecuentoHuecos()
    r.registrar(0, 'a', { calidad: 1 })
    r.registrar(1, 'a', { calidad: CALIDAD_MINIMA })
    expect(r.resumen()).toEqual([])
  })

  it('cuenta como «dudoso» lo que el seguidor acepta pero el análisis descarta', () => {
    // Mismo umbral que la franja y la gráfica: si no, el resumen diría «sin
    // huecos» con frames en rojo (fallo encontrado en la revisión de la fase 1).
    expect(CALIDAD_PERDIDO).toBeLessThan(CALIDAD_MINIMA)
    const r = new RecuentoHuecos()
    r.registrar(5, 'a', { calidad: (CALIDAD_PERDIDO + CALIDAD_MINIMA) / 2 })
    expect(r.resumen()).toEqual([{ id: 'a', primero: 5, frames: 1, motivos: { dudoso: 1 } }])
  })

  it('agrupa por marcador y motivo, con el primer frame y el rango de área', () => {
    const r = new RecuentoHuecos()
    r.registrar(10, 'a', { calidad: 0, motivo: 'tamano', relacionArea: 2.4 })
    r.registrar(11, 'a', { calidad: 0, motivo: 'tamano', relacionArea: 6 })
    r.registrar(12, 'a', { calidad: 0, motivo: 'sinColor' })
    r.registrar(3, 'b', { calidad: 0, motivo: 'conflicto' })
    const [a, b] = r.resumen()
    expect(a).toEqual({ id: 'a', primero: 10, frames: 3, motivos: { tamano: 2, sinColor: 1 }, areaMin: 2.4, areaMax: 6 })
    expect(b).toEqual({ id: 'b', primero: 3, frames: 1, motivos: { conflicto: 1 } })
  })
})
