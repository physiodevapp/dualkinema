import { describe, expect, it } from 'vitest'
import { anotarSuceso, esImportante, leerSucesos, SUCESOS_MAXIMOS, sucesosNuevos, textoSuceso, type Suceso } from './sucesos'

describe('los sucesos de un móvil', () => {
  it('se numeran seguidos y se queda con los últimos', () => {
    let l: Suceso[] = []
    for (let k = 0; k < SUCESOS_MAXIMOS + 2; k++) l = anotarSuceso(l, { tipo: 'empieza' })
    expect(l.map((s) => s.n)).toEqual([3, 4, 5, 6, 7])
  })

  it('se leen campo a campo; lo que no se entiende se descarta', () => {
    const buenos = [
      { n: 1, tipo: 'empieza' },
      { n: 2, tipo: 'no-graba', motivo: 'sin-respuesta', deOtro: false },
      { n: 3, tipo: 'cortada', segundos: 12.5 },
      { n: 4, tipo: 'no-termina' },
      { n: 5, tipo: 'terminada', segundos: 30, fps: null, pitidos: 1 },
    ]
    expect(leerSucesos(buenos)).toEqual(buenos)
    expect(
      leerSucesos([
        { n: 1, tipo: 'raro' },
        { n: 0, tipo: 'empieza' },
        { n: 2, tipo: 'no-graba', motivo: 'porque sí', deOtro: false },
        { n: 3, tipo: 'cortada', segundos: -1 },
        { n: 4, tipo: 'terminada', segundos: 30, fps: 30, pitidos: 3 },
        { n: 5, tipo: 'empieza', texto: 'nombre del paciente' },
      ]),
    ).toEqual([{ n: 5, tipo: 'empieza' }])
    expect(leerSucesos('x')).toEqual([])
    expect(leerSucesos(undefined)).toEqual([])
  })

  it('en el mando: lo de antes de abrirlo no entra; luego, solo lo nuevo', () => {
    const l: Suceso[] = [
      { n: 3, tipo: 'empieza' },
      { n: 4, tipo: 'no-termina' },
    ]
    expect(sucesosNuevos(l, undefined)).toEqual({ nuevos: [], ultimo: 4 })
    expect(sucesosNuevos(l, 3)).toEqual({ nuevos: [{ n: 4, tipo: 'no-termina' }], ultimo: 4 })
    expect(sucesosNuevos(l, 4)).toEqual({ nuevos: [], ultimo: 4 })
    expect(sucesosNuevos([{ n: 1, tipo: 'empieza' }], 4)).toEqual({ nuevos: [{ n: 1, tipo: 'empieza' }], ultimo: 1 })
  })

  it('lo importante (ámbar): no grabar sin cancelarlo, cortes, no terminar, fps bajos o pitidos sin oír', () => {
    expect(esImportante({ n: 1, tipo: 'empieza' })).toBe(false)
    expect(esImportante({ n: 1, tipo: 'no-graba', motivo: 'usuario', deOtro: false })).toBe(false)
    expect(esImportante({ n: 1, tipo: 'no-graba', motivo: 'sin-espacio', deOtro: true })).toBe(true)
    expect(esImportante({ n: 1, tipo: 'cortada', segundos: 3 })).toBe(true)
    expect(esImportante({ n: 1, tipo: 'no-termina' })).toBe(true)
    expect(esImportante({ n: 1, tipo: 'terminada', segundos: 30, fps: 29.8, pitidos: 2 })).toBe(false)
    expect(esImportante({ n: 1, tipo: 'terminada', segundos: 30, fps: 26.9, pitidos: 2 })).toBe(true)
    expect(esImportante({ n: 1, tipo: 'terminada', segundos: 30, fps: 30, pitidos: 1 })).toBe(true)
  })

  it('los textos dicen quién y qué', () => {
    expect(textoSuceso({ n: 1, tipo: 'no-graba', motivo: 'sin-espacio', deOtro: true }, 'Móvil 1')).toBe('Móvil 1 no graba: queda poco espacio (lo dice el otro móvil).')
    expect(textoSuceso({ n: 1, tipo: 'terminada', segundos: 30.1, fps: 29.8, pitidos: 2 }, 'Móvil 2')).toBe('Móvil 2: grabación terminada · 30,1 s · a 29,8 fps · pitidos oídos ✓.')
    expect(textoSuceso({ n: 1, tipo: 'cortada', segundos: 12 }, 'Móvil 1')).toMatch(/cortado a los 12 s/)
  })
})

describe('parada porque al otro se le cortó', () => {
  it('se lee, va en ámbar y lo dice', () => {
    expect(leerSucesos([{ n: 1, tipo: 'parada-otro' }])).toEqual([{ n: 1, tipo: 'parada-otro' }])
    expect(esImportante({ n: 1, tipo: 'parada-otro' })).toBe(true)
    expect(textoSuceso({ n: 1, tipo: 'parada-otro' }, 'Móvil 2')).toMatch(/^Móvil 2 ha parado porque al otro se le ha cortado/)
  })
})
