import { describe, expect, it } from 'vitest'
import { formatearInforme } from './informe'

describe('formatearInforme', () => {
  it('secciones con título, claves sangradas, booleanos en español y listas sencillas en una línea', () => {
    const t = formatearInforme({
      Entorno: { sistema: 'Android 15', pantalla: { ancho: 412, alto: 915 }, apis: ['wakeLock', 'share'], opfs: true },
      Vacía: { lista: [] },
    })
    expect(t).toBe(
      ['## Entorno', 'sistema: Android 15', 'pantalla:', '  ancho: 412', '  alto: 915', 'apis: wakeLock, share', 'opfs: sí', '', '## Vacía', 'lista: (ninguno)'].join('\n'),
    )
  })

  it('una lista de objetos va numerada y lo que falta sale como «—» (nunca 0)', () => {
    const t = formatearInforme({ Cámaras: { lista: [{ nombre: 'trasera', fps: 29.97 }, { nombre: 'frontal', fps: NaN }] } })
    expect(t).toBe(['## Cámaras', 'lista:', '  [1]', '    nombre: trasera', '    fps: 29.97', '  [2]', '    nombre: frontal', '    fps: —'].join('\n'))
  })

  it('redondea a milésimas', () => {
    expect(formatearInforme({ A: { x: 1 / 3 } })).toBe('## A\nx: 0.333')
  })
})
