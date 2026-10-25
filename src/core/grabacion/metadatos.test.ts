import { describe, expect, it } from 'vitest'
import { FORMATO_METADATOS, leerMetadatos, textoMetadatos, type MetadatosGrabacion } from './metadatos'

const m: MetadatosGrabacion = {
  app: 'dualkinema',
  formato: FORMATO_METADATOS,
  id: '3f2a9c1e-0000-4000-8000-000000000000',
  creada: '2026-10-24T21:32:05.000Z',
  pedido: { ancho: 1920, alto: 1080, fps: 30 },
}

describe('metadatos de la grabación', () => {
  it('ida y vuelta', () => {
    expect(leerMetadatos(textoMetadatos(m))).toEqual(m)
  })

  it('un formato más nuevo se lee en lo que tiene en común (y se ignora lo que no conoce)', () => {
    const nuevo = JSON.stringify({ ...m, formato: 2, rol: 'B', reloj: { inicio: 123 } })
    expect(leerMetadatos(nuevo)).toEqual({ ...m, formato: 2 })
  })

  it('con la grabación doble: ida y vuelta, y si esa parte está rota se lee el resto sin ella', () => {
    const doble = {
      ...m,
      doble: { id: 'a1b2c3d4-0000-4000-8000-000000000000', vista: { plano: 'frontal', ve: 'delante' } as const, inicio: 12345.6, relojOtro: { desfase: -1500.25, cota: 51 }, deriva: { ppm: 96, errorPpm: 58 } },
    }
    expect(leerMetadatos(textoMetadatos(doble))).toEqual(doble)
    const sinReloj = { ...m, doble: { ...doble.doble, relojOtro: null, deriva: null } }
    expect(leerMetadatos(textoMetadatos(sinReloj))).toEqual(sinReloj)
    expect(leerMetadatos(JSON.stringify({ ...m, doble: { ...doble.doble, vista: { plano: 'sagital', mira: 'arriba' } } }))).toEqual(m)
    expect(leerMetadatos(JSON.stringify({ ...m, doble: { ...doble.doble, inicio: 'ayer' } }))).toEqual(m)
    // Un reloj del otro roto no tira la grabación doble: queda sin reloj.
    expect(leerMetadatos(JSON.stringify({ ...m, doble: { ...doble.doble, relojOtro: { desfase: 1, cota: -1 } } }))?.doble?.relojOtro).toBeNull()
  })

  it('lo que no es de dualkinema o está roto no se lee', () => {
    expect(leerMetadatos(null)).toBeNull()
    expect(leerMetadatos('')).toBeNull()
    expect(leerMetadatos('Grabado con Google Cámara')).toBeNull()
    expect(leerMetadatos(JSON.stringify({ ...m, app: 'otra' }))).toBeNull()
    expect(leerMetadatos(JSON.stringify({ ...m, formato: 0 }))).toBeNull()
    expect(leerMetadatos(JSON.stringify({ ...m, id: '' }))).toBeNull()
    expect(leerMetadatos(JSON.stringify({ ...m, creada: 'ayer' }))).toBeNull()
    expect(leerMetadatos(JSON.stringify({ ...m, pedido: { ancho: 1920, alto: 1080 } }))).toBeNull()
    expect(leerMetadatos('[1,2]')).toBeNull()
  })
})
