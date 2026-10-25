import { describe, expect, it } from 'vitest'
import { aMiReloj, MARGEN_PREPARAR_MS, motivoNoPreparado, vistasCompatibles } from './doble'

const perfil = { plano: 'sagital', mira: 'derecha' } as const
const frente = { plano: 'frontal', ve: 'delante' } as const
const listo = { camara: true, vistas: true, reloj: true, libreMB: 9000, ocupado: false, faltan: 10_000 }

describe('grabación doble', () => {
  it('vistas: una de perfil y otra de frente o de espaldas; las dos iguales o sin elegir, no', () => {
    expect(vistasCompatibles(perfil, frente)).toBe(true)
    expect(vistasCompatibles({ plano: 'frontal', ve: 'detras' }, { plano: 'sagital', mira: 'izquierda' })).toBe(true)
    expect(vistasCompatibles(perfil, { plano: 'sagital', mira: 'izquierda' })).toBe(false)
    expect(vistasCompatibles(frente, { plano: 'frontal', ve: 'detras' })).toBe(false)
    expect(vistasCompatibles(null, frente)).toBe(false)
  })

  it('el inicio del otro en mi reloj: su reloj va 1500 ms por delante → 1500 ms antes en el mío', () => {
    expect(aMiReloj(11_500, 1500)).toBe(10_000)
    expect(aMiReloj(8500, -1500)).toBe(10_000)
  })

  it('preparado, o el primer motivo por el que no', () => {
    expect(motivoNoPreparado(listo)).toBeNull()
    expect(motivoNoPreparado({ ...listo, ocupado: true, camara: false })).toBe('ocupado')
    expect(motivoNoPreparado({ ...listo, camara: false })).toBe('sin-camara')
    expect(motivoNoPreparado({ ...listo, vistas: false })).toBe('sin-vista')
    expect(motivoNoPreparado({ ...listo, reloj: false })).toBe('sin-reloj')
    expect(motivoNoPreparado({ ...listo, libreMB: 120 })).toBe('sin-espacio')
    expect(motivoNoPreparado({ ...listo, libreMB: null })).toBeNull() // sin dato de espacio, no se impide
    expect(motivoNoPreparado({ ...listo, faltan: MARGEN_PREPARAR_MS - 1 })).toBe('tarde')
    expect(motivoNoPreparado({ ...listo, faltan: NaN })).toBe('tarde')
  })
})
