import { describe, expect, it } from 'vitest'
import type { MetadatosGrabacion } from './metadatos'
import { parejaDoble } from './pareja'

const meta = (id: string, doble?: Partial<NonNullable<MetadatosGrabacion['doble']>> | null): MetadatosGrabacion => ({
  app: 'dualkinema',
  formato: 1,
  id,
  creada: '2026-10-25T10:14:13.522Z',
  pedido: { ancho: 1920, alto: 1080, fps: 30 },
  ...(doble === null ? {} : { doble: { id: 'pareja', vista: { plano: 'sagital', mira: 'derecha' }, inicio: 1, relojOtro: null, deriva: null, ...doble } }),
})
const frente = { vista: { plano: 'frontal', ve: 'delante' } as const }

describe('parejaDoble', () => {
  it('perfil y frente de la misma pareja: el de perfil es la referencia, esté primero o segundo', () => {
    expect(parejaDoble(meta('a'), meta('b', frente))).toMatchObject({ ok: true, referencia: 0 })
    expect(parejaDoble(meta('b', frente), meta('a'))).toMatchObject({ ok: true, referencia: 1 })
  })

  it('se rechaza lo que no es una pareja, con el motivo', () => {
    expect(parejaDoble(null, meta('b', frente))).toEqual({ ok: false, motivo: 'sin-metadatos', cual: 0 })
    expect(parejaDoble(meta('a'), meta('b', null))).toEqual({ ok: false, motivo: 'no-doble', cual: 1 })
    expect(parejaDoble(meta('a'), meta('b', { ...frente, id: 'otra' }))).toMatchObject({ ok: false, motivo: 'otra-pareja' })
    expect(parejaDoble(meta('a'), meta('b'))).toMatchObject({ ok: false, motivo: 'mismo-plano' })
    expect(parejaDoble(meta('a'), meta('a', frente))).toMatchObject({ ok: false, motivo: 'mismo-video' })
  })
})
