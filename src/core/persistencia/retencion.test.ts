import { describe, expect, it } from 'vitest'
import { caducaEn, DIAS_CADUCIDAD, MAX_SESIONES, MS_POR_DIA, sesionesABorrar, textoAvisoRetencion, type Retenible } from './retencion'

const ACTUAL = 7
const AHORA = Date.parse('2026-11-10T12:00:00.000Z')
const dias = (n: number) => n * MS_POR_DIA

/** Una sesión guardada hace `haceDias` días (con la caducidad que le toca) o con la caducidad que se diga. */
const sesion = (id: string, haceDias: number, extra: Partial<Retenible> = {}): Retenible => ({
  id,
  esquema: ACTUAL,
  actualizada: new Date(AHORA - dias(haceDias)).toISOString(),
  expiraEn: caducaEn(AHORA - dias(haceDias)),
  ...extra,
})
const borrar = (cabeceras: Retenible[], protegidas: (string | null)[] = [], max?: number) =>
  sesionesABorrar({ cabeceras, ahora: AHORA, protegidas, esquemaActual: ACTUAL, ...(max ? { max } : {}) })

describe('retención de las sesiones guardadas', () => {
  it('las constantes son las decididas y el aviso sale de ellas', () => {
    expect(MAX_SESIONES).toBe(5)
    expect(DIAS_CADUCIDAD).toBe(30)
    expect(textoAvisoRetencion()).toBe('Se guardan solo en este móvil, sin el vídeo. Se conservan 5 y se borran solas a los 30 días.')
    expect(textoAvisoRetencion(3, 7)).toBe('Se guardan solo en este móvil, sin el vídeo. Se conservan 3 y se borran solas a los 7 días.')
  })

  it('caducar: 30 días desde el momento del guardado', () => {
    expect(caducaEn(0)).toBe(dias(30))
  })

  it('lista vacía: no hay nada que borrar', () => {
    expect(borrar([])).toEqual([])
  })

  it('hasta el máximo y sin caducar, no se borra nada', () => {
    expect(borrar([1, 2, 3, 4, 5].map((n) => sesion(`s${n}`, n)))).toEqual([])
  })

  it('caducadas: se borran las que han pasado de su caducidad (una exactamente en el límite también)', () => {
    const cabeceras = [sesion('hoy', 0), sesion('viejaa', 31), sesion('limite', 30), sesion('casi', 29)]
    expect(borrar(cabeceras)).toEqual(['limite', 'viejaa'])
  })

  it('guardar renueva: la misma sesión guardada hoy ya no caduca', () => {
    const antes = sesion('a', 29)
    expect(borrar([antes])).toEqual([])
    // Pasan 2 días sin guardar: caduca. Si se guarda en medio, su caducidad es otra.
    const dentroDeDos = AHORA + dias(2)
    expect(sesionesABorrar({ cabeceras: [antes], ahora: dentroDeDos, protegidas: [], esquemaActual: ACTUAL })).toEqual(['a'])
    expect(sesionesABorrar({ cabeceras: [{ ...antes, expiraEn: caducaEn(AHORA + dias(1)) }], ahora: dentroDeDos, protegidas: [], esquemaActual: ACTUAL })).toEqual([])
  })

  it('exceso sobre el máximo: se borran las más antiguas y se queda la más reciente', () => {
    const cabeceras = [sesion('a', 6), sesion('b', 1), sesion('c', 5), sesion('d', 2), sesion('e', 4), sesion('f', 3), sesion('g', 0)]
    // Quedan g, b, d, f, e (las 5 más recientes): se van c (5 días) y a (6 días).
    expect(borrar(cabeceras)).toEqual(['a', 'c'])
  })

  it('el orden de entrada no cambia el resultado', () => {
    const cabeceras = [sesion('a', 6), sesion('b', 1), sesion('c', 5), sesion('d', 2), sesion('e', 4), sesion('f', 3), sesion('g', 0)]
    expect(borrar([...cabeceras].reverse())).toEqual(borrar(cabeceras))
  })

  it('caducadas y exceso a la vez: cada una se cuenta una sola vez', () => {
    const cabeceras = [sesion('vieja', 40), ...[0, 1, 2, 3, 4, 5].map((n) => sesion(`s${n}`, n))]
    // La caducada se va; de las otras seis, sobra la más antigua (5 días).
    expect(borrar(cabeceras)).toEqual(['s5', 'vieja'])
  })

  it('la sesión protegida no se borra nunca: ni por exceso ni por caducidad', () => {
    const cabeceras = [sesion('vieja', 20), ...[0, 1, 2, 3, 4].map((n) => sesion(`s${n}`, n))]
    // Seis sesiones, la protegida es la más antigua: se queda y ocupa sitio; sobra la más antigua de las demás.
    expect(borrar(cabeceras, ['vieja'])).toEqual(['s4'])
    // Caducada y protegida (la que se está guardando o la que está abierta): tampoco.
    expect(borrar([sesion('caducada', 90)], ['caducada'])).toEqual([])
  })

  it('con la guardada y la abierta protegidas, ambas se quedan y el total no pasa del máximo', () => {
    const cabeceras = [sesion('guardada', 50), sesion('abierta', 40), ...[0, 1, 2, 3].map((n) => sesion(`s${n}`, n))]
    expect(borrar(cabeceras, ['guardada', 'abierta'])).toEqual(['s3'])
    // null o ids que no existen no estorban.
    expect(borrar(cabeceras, [null, 'no-existe', 'guardada', 'abierta'])).toEqual(['s3'])
  })

  it('empate de fecha: decide el id, siempre igual', () => {
    const misma = new Date(AHORA - dias(1)).toISOString()
    const cabeceras = ['a', 'b', 'c', 'd'].map((id) => sesion(id, 1, { actualizada: misma }))
    // Máximo 2: con la fecha igual cuenta como más reciente el id mayor (d, c); se borran a y b.
    expect(borrar(cabeceras, [], 2)).toEqual(['a', 'b'])
    expect(borrar([...cabeceras].reverse(), [], 2)).toEqual(['a', 'b'])
  })

  it('un esquema más nuevo que el de la app se ignora: ni caduca ni cuenta para el máximo', () => {
    const nueva = sesion('nueva', 90, { esquema: ACTUAL + 1 })
    const cabeceras = [nueva, ...[0, 1, 2, 3, 4].map((n) => sesion(`s${n}`, n))]
    expect(borrar(cabeceras)).toEqual([])
    // Y no ocupa uno de los cinco sitios: las cinco legibles se quedan.
    expect(borrar([...cabeceras, nueva, nueva])).toEqual([])
  })
})
