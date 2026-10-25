import { describe, expect, it } from 'vitest'
import type { DatosDoble } from '../grabacion/metadatos'
import { MARGEN_RELOJ_S, desfaseDeReloj, proponerDesfase, sincroniaDePropuesta } from './doble'
import type { IdaVuelta } from './pitido'

const perfil = { plano: 'sagital', mira: 'derecha' } as const
const frente = { plano: 'frontal', ve: 'delante' } as const
const doble = (vista: DatosDoble['vista'], inicio: number, relojOtro: DatosDoble['relojOtro']): DatosDoble => ({ id: 'p', vista, inicio, relojOtro, deriva: null })

describe('desfaseDeReloj', () => {
  it('la segunda prueba real: los dos programaron el mismo instante (−0,35 ms, cota de 38 ms)', () => {
    // Pixel (referencia): inicio 75219,5 en su reloj; el de la tablet va 14832,5 ms por delante (± 38,1).
    // Tablet: inicio 90051,4 en el suyo; el del Pixel va −14832,25 ms (± 38,15). Se toma la cota más estrecha.
    const r = desfaseDeReloj(doble(perfil, 75219.5, { desfase: 14832.5, cota: 38.1 }), doble(frente, 90051.4, { desfase: -14832.25, cota: 38.15 }))!
    expect(r.desfase * 1000).toBeCloseTo(-0.6, 6)
    expect(r.cota).toBeCloseTo(0.0381, 9)
  })

  it('con un inicio de verdad conocido: B empezó 120 ms después que A', () => {
    // Reloj de B = reloj de A + 5000. A empieza en 1000 (su reloj) y B en 1000 + 120 de A = 6120 en el suyo.
    // Un instante cualquiera r: t_A = r − 1000, t_B = r − 1120 → desfase = t_A − t_B = +0,12 s (como en `pitido.ts`).
    const r = desfaseDeReloj(doble(perfil, 1000, { desfase: 5000, cota: 10 }), doble(frente, 6120, null))!
    expect(r.desfase).toBeCloseTo(0.12, 9)
    // Solo con la estimación de B (que ve el de A 5000 por detrás), lo mismo.
    expect(desfaseDeReloj(doble(perfil, 1000, null), doble(frente, 6120, { desfase: -5000, cota: 3 }))!.desfase).toBeCloseTo(0.12, 9)
  })

  it('sin estimación del reloj en ninguno: null', () => {
    expect(desfaseDeReloj(doble(perfil, 1, null), doble(frente, 2, null))).toBeNull()
  })
})

describe('proponerDesfase', () => {
  const pitido = (desfase: number, fiable = true): IdaVuelta => ({ desfase, distancia: 2, calidad: fiable ? 10 : 1.5, incertidumbre: 4e-5, distanciaRazonable: true, fiable })
  const reloj = { desfase: -0.0006, cota: 0.038 }

  it('el pitido, si es fiable y cae dentro del reloj (la segunda prueba real: +9,0 ms con el reloj en −0,6 ± 38)', () => {
    const p = proponerDesfase(pitido(0.009), reloj)
    expect(p).toMatchObject({ metodo: 'pitido', desfase: 0.009 })
    expect(sincroniaDePropuesta(p)).toEqual({ metodo: 'pitido', pitido: { desfase: 0.009, calidad: 10, distancia: 2 } })
  })

  it('un pitido fuera de la cota del reloj (más el margen) no se propone: el reloj, y se dice por qué', () => {
    const fuera = reloj.desfase + reloj.cota + MARGEN_RELOJ_S + 0.01
    expect(proponerDesfase(pitido(fuera), reloj)).toMatchObject({ metodo: 'reloj', desfase: reloj.desfase, motivo: 'fuera-del-reloj' })
    expect(proponerDesfase(pitido(reloj.desfase + reloj.cota + MARGEN_RELOJ_S - 0.001), reloj).metodo).toBe('pitido')
  })

  it('sin pitido o con uno poco fiable: el reloj', () => {
    expect(proponerDesfase(null, reloj)).toMatchObject({ metodo: 'reloj', motivo: 'sin-pitido' })
    expect(proponerDesfase(pitido(0.009, false), reloj)).toMatchObject({ metodo: 'reloj', motivo: 'no-fiable' })
    expect(sincroniaDePropuesta(proponerDesfase(null, reloj))).toEqual({ metodo: 'reloj', reloj })
  })

  it('sin reloj: el pitido fiable; si tampoco, nada', () => {
    expect(proponerDesfase(pitido(0.2), null).metodo).toBe('pitido')
    expect(proponerDesfase(pitido(0.2, false), null).metodo).toBe('ninguna')
    expect(proponerDesfase(null, null).metodo).toBe('ninguna')
  })
})
