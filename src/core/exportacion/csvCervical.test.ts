import { describe, expect, it } from 'vitest'
import { construirCsvCervical } from './csvCervical'

describe('CSV cervical', () => {
  it('una fila por frame con las tres curvas y la calidad; los rangos en la cabecera; sin valor, vacío', () => {
    const tiempos = [0, 0.5, 1]
    const s = (v: number[]) => v.map((valor, i) => ({ t: tiempos[i]!, valor, interpolado: false }))
    const texto = construirCsvCervical(
      {
        archivo: 'cuello.mp4',
        exportado: '2026-11-13',
        tiempos,
        calidad: [0.9, 0, 0.8],
        cero: { desde: 0, hasta: 0.4 },
        series: { rotacion: s([0, Number.NaN, -60]), flexion: s([0, Number.NaN, 10]), inclinacion: s([1, Number.NaN, 0]) },
        corteHz: 6,
      },
      'internacional',
    )
    const lineas = texto.trim().split('\r\n')
    expect(lineas).toContain('# rango de rotación,izquierda  · derecha 60.0 · asimetría ')
    const datos = lineas.filter((l) => !l.startsWith('#'))
    expect(datos[0]).toBe('t_s,frame,rotacion_grados,flexion_grados,inclinacion_grados,calidad_cara')
    expect(datos[2]).toBe('0.500000,2,,,,0.00')
    expect(datos[3]).toBe('1.000000,3,-60.00,10.00,0.00,0.80')
  })
})
