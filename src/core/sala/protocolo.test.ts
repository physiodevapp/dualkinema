import { describe, expect, it } from 'vitest'
import { escribirMensaje, leerMensaje, TAMANO_MAXIMO_MENSAJE, VERSION_PROTOCOLO, type Mensaje } from './protocolo'

const id = '3f2a9c1e-0000-4000-8000-000000000000'

const mensajes: Mensaje[] = [
  { tipo: 'hola', version: VERSION_PROTOCOLO, vista: { plano: 'sagital', mira: 'derecha' } },
  { tipo: 'hola', version: VERSION_PROTOCOLO, vista: { plano: 'frontal', ve: 'detras' } },
  { tipo: 'hola', version: VERSION_PROTOCOLO, vista: null },
  { tipo: 'ping', id: 7, t1: 12345.678 },
  { tipo: 'pong', id: 7, t1: 12345.678, t2: -998.5, t3: -998.25 },
  { tipo: 'estado', camara: { ancho: 1080, alto: 1920, fps: 30 }, libreMB: 9800.5, bateria: 0.83, grabando: false },
  { tipo: 'estado', camara: null, libreMB: null, bateria: null, grabando: true },
  { tipo: 'programar', grabacion: id, inicio: 50_000.5, duracion: 20 },
  { tipo: 'programar', grabacion: id, inicio: 50_000.5, duracion: null },
  { tipo: 'confirmar', grabacion: id },
  { tipo: 'parar', grabacion: id, fin: 70_000 },
  { tipo: 'cancelar', grabacion: id, motivo: 'sin-espacio' },
  { tipo: 'adios' },
]

describe('protocolo de la sala', () => {
  it('ida y vuelta de cada tipo de mensaje', () => {
    for (const m of mensajes) expect(leerMensaje(escribirMensaje(m))).toEqual(m)
  })

  it('los campos que no conoce se descartan (no se reenvía nada que no esté en el protocolo)', () => {
    const m = leerMensaje(JSON.stringify({ tipo: 'confirmar', grabacion: id, paciente: 'Fulano', notas: 'dolor' }))
    expect(m).toEqual({ tipo: 'confirmar', grabacion: id })
    const e = leerMensaje(JSON.stringify({ tipo: 'estado', camara: { ancho: 1, alto: 1, fps: 30, modelo: 'x' }, libreMB: 1, bateria: 1, grabando: false, extra: 1 }))
    expect(e).toEqual({ tipo: 'estado', camara: { ancho: 1, alto: 1, fps: 30 }, libreMB: 1, bateria: 1, grabando: false })
  })

  it('no se entiende (null): roto, de otro tipo, campos inválidos o demasiado grande', () => {
    const malos = [
      'no es json',
      '[]',
      'null',
      JSON.stringify({ tipo: 'desconocido' }),
      JSON.stringify({ tipo: 'hola', version: 0, vista: null }),
      JSON.stringify({ tipo: 'hola', version: 1, vista: { plano: 'sagital', mira: 'arriba' } }),
      JSON.stringify({ tipo: 'hola', version: 1 }),
      JSON.stringify({ tipo: 'ping', id: 1.5, t1: 0 }),
      JSON.stringify({ tipo: 'pong', id: 1, t1: 0, t2: 0 }),
      JSON.stringify({ tipo: 'estado', camara: { ancho: 0, alto: 1, fps: 30 }, libreMB: 1, bateria: 1, grabando: false }),
      JSON.stringify({ tipo: 'estado', camara: null, libreMB: -1, bateria: null, grabando: false }),
      JSON.stringify({ tipo: 'estado', camara: null, libreMB: null, bateria: 1.2, grabando: false }),
      JSON.stringify({ tipo: 'programar', grabacion: id, inicio: 1, duracion: 0 }),
      JSON.stringify({ tipo: 'programar', grabacion: id, inicio: 1, duracion: 301 }),
      JSON.stringify({ tipo: 'programar', grabacion: 'Fulano García', inicio: 1, duracion: 10 }), // texto libre, no un id
      JSON.stringify({ tipo: 'parar', grabacion: id }),
      JSON.stringify({ tipo: 'cancelar', grabacion: id, motivo: 'otro texto' }),
      JSON.stringify({ tipo: 'adios', relleno: 'x'.repeat(TAMANO_MAXIMO_MENSAJE) }),
    ]
    for (const t of malos) expect(leerMensaje(t), t.slice(0, 80)).toBeNull()
  })

  it('una versión más nueva se lee (la app compara y dice que hay que actualizar)', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'hola', version: 2, vista: null }))).toEqual({ tipo: 'hola', version: 2, vista: null })
  })

  it('el mensaje más largo posible cabe con mucho margen', () => {
    const largo: Mensaje = { tipo: 'pong', id: Number.MAX_SAFE_INTEGER, t1: -123456789012.3456, t2: 123456789012.3456, t3: 123456789012.3456 }
    expect(escribirMensaje(largo).length).toBeLessThan(TAMANO_MAXIMO_MENSAJE / 4)
  })
})
