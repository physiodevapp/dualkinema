import { describe, expect, it } from 'vitest'
import { rechazoNuevo, destino, faltaParaGrabar, grabando, movilesVivos, SIN_NOTICIAS_MS, type MovilEnMando } from './mando'
import type { EstadoMovil } from './protocolo'

const estado = (cambios: Partial<EstadoMovil> = {}): EstadoMovil => ({
  camara: { ancho: 1080, alto: 1920, fps: 30 },
  libreMB: 5000,
  bateria: 0.8,
  grabando: false,
  codificador: 'hardware',
  microExterno: false,
  fpsGrabacion: 30,
  inclinacion: null,
  encuadre: null,
  pideEncuadre: false,
  encuadreFallo: false,
  reloj: 2,
  primero: null,
  rechazo: null,
  sucesos: [],
  ...cambios,
})
const movil = (id: string, cambios: Partial<MovilEnMando> = {}): MovilEnMando => ({
  id,
  vista: { plano: 'sagital', mira: 'derecha' },
  version: 1,
  estado: estado(),
  visto: 1000,
  ...cambios,
})
const izq = { plano: 'sagital', mira: 'izquierda' } as const

describe('el mando', () => {
  it('con los dos listos (un móvil en cada flanco) no falta nada, y las órdenes van al primero', () => {
    const ms = [movil('aaaaaaaa'), movil('bbbbbbbb', { vista: izq })]
    expect(faltaParaGrabar(ms)).toEqual([])
    expect(destino(ms)?.id).toBe('aaaaaaaa')
    expect(destino([])).toBeNull()
  })

  it('dice lo que falta: el otro móvil, las vistas, la cámara, el reloj, el espacio y la versión', () => {
    expect(faltaParaGrabar([])).toHaveLength(1)
    expect(faltaParaGrabar([movil('aaaaaaaa')])[0]).toMatch(/otro móvil/)
    expect(faltaParaGrabar([movil('aaaaaaaa'), movil('bbbbbbbb')])[0]).toMatch(/no casan/)
    expect(faltaParaGrabar([movil('aaaaaaaa'), movil('bbbbbbbb', { vista: null })])[0]).toMatch(/elegir/)
    const r = faltaParaGrabar([movil('aaaaaaaa', { estado: estado({ camara: null, reloj: null, libreMB: 100 }) }), movil('bbbbbbbb', { vista: izq, version: 2 })])
    expect(r.join(' ')).toMatch(/versión/)
    expect(r.join(' ')).toMatch(/cámara/)
    expect(r.join(' ')).toMatch(/reloj/)
    expect(r.join(' ')).toMatch(/espacio/)
  })

  it('un móvil sin noticias se da por ido; como mucho dos, los últimos', () => {
    const ms = [movil('aaaaaaaa', { visto: 0 }), movil('bbbbbbbb', { visto: 5000 }), movil('cccccccc', { visto: 5000 })]
    expect(movilesVivos(ms, 5000 + SIN_NOTICIAS_MS).map((m) => m.id)).toEqual(['bbbbbbbb', 'cccccccc'])
    expect(movilesVivos(ms, 5001 + SIN_NOTICIAS_MS)).toEqual([])
  })

  it('grabando si alguno graba', () => {
    expect(grabando([movil('aaaaaaaa'), movil('bbbbbbbb', { estado: estado({ grabando: true }) })])).toBe(true)
    expect(grabando([movil('aaaaaaaa')])).toBe(false)
  })
})

describe('el orden de los móviles en el mando', () => {
  it('el que entró primero en la sala es el «Móvil 1» aunque llegara después al mando; sin saberlo, por llegada', () => {
    const ahora = 10_000
    const a = movil('a', { estado: estado({ primero: false }), visto: ahora })
    const b = movil('b', { estado: estado({ primero: true }), visto: ahora })
    expect(movilesVivos([a, b], ahora).map((m) => m.id)).toEqual(['b', 'a'])
    const c = movil('c', { estado: estado({ primero: null }), visto: ahora })
    const d = movil('d', { estado: estado({ primero: null }), visto: ahora })
    expect(movilesVivos([c, d], ahora).map((m) => m.id)).toEqual(['c', 'd'])
    // Las órdenes van al «Móvil 1».
    expect(destino(movilesVivos([a, b], ahora))?.id).toBe('b')
  })
})

describe('el rechazo de una orden', () => {
  it('se ve solo si llega después de pedirla', () => {
    const m = movil('a', { estado: estado({ rechazo: { motivo: 'sin-camara', n: 2 } }) })
    expect(rechazoNuevo(m, 1)).toBe('sin-camara')
    expect(rechazoNuevo(m, 2)).toBeNull()
    expect(rechazoNuevo(movil('b', { estado: estado() }), 0)).toBeNull()
    expect(rechazoNuevo(null, 0)).toBeNull()
  })
})
