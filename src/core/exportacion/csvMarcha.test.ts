import { describe, expect, it } from 'vitest'
import type { AnalisisMarcha } from '../marcha/analisis'
import { construirCsvMarcha } from './csvMarcha'

const curva = (v: number) => Array.from({ length: 101 }, (_, i) => v + i)

describe('CSV de los ciclos de marcha', () => {
  it('una fila por % del ciclo con la media, la DE y cada ciclo incluido; sin valor, vacío', () => {
    const analisis: AnalisisMarcha = {
      eventos: [],
      ciclos: [
        { lado: 'der', inicio: 1, fin: 2.1, despegue: 1.7, descarte: null, excluido: false, curva: curva(0) },
        { lado: 'der', inicio: 2.1, fin: 3.2, despegue: 2.8, descarte: null, excluido: true, curva: curva(5) },
        { lado: 'der', inicio: 3.2, fin: 4.3, despegue: 3.9, descarte: null, excluido: false, curva: curva(2) },
        { lado: 'der', inicio: 4.3, fin: 6, despegue: null, descarte: 'despegues', excluido: false, curva: null },
      ],
      media: { media: curva(1), de: Array.from({ length: 101 }, () => NaN) },
      despegueMedio: 63,
      parametros: { ciclos: 2, zancada: { media: 1.1, de: 0 }, cadencia: 109.09, apoyo: { media: 63.6, de: 0 }, enCinta: true, longitud: null, velocidad: null },
    }
    const texto = construirCsvMarcha({ archivo: 'marcha.mp4', exportado: '2026-11-13', articulacion: { id: 'rodilla_sagital_der', nombre: 'Rodilla derecha' }, cero: null, corteHz: 6, analisis }, 'internacional')
    const lineas = texto.trim().split('\r\n')
    const datos = lineas.filter((l) => !l.startsWith('#'))
    expect(datos[0]).toBe('ciclo_pct,media_grados,de_grados,ciclo_1_grados,ciclo_2_grados')
    expect(datos).toHaveLength(102)
    expect(datos[51]).toBe('50,51.000,,50.000,52.000')
    expect(lineas).toContain('# en cinta,sí')
    expect(lineas.some((l) => l.startsWith('# longitud'))).toBe(false)
    expect(lineas).toContain('# ciclo 2,"3.200 s a 4.300 s, despegue 3.900 s"')
  })
})
