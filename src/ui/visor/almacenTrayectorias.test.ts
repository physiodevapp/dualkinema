import { describe, expect, it } from 'vitest'
import { AlmacenTrayectorias } from './almacenTrayectorias'

const tiempos = [0, 0.1, 0.2, 0.3, 0.4]
const nuevo = () => new AlmacenTrayectorias(['a', 'b'], tiempos)

describe('almacén de trayectorias', () => {
  it('cada modificación publica una instantánea nueva (versión + 1) y avisa a los suscritos; sin cambios, la misma', () => {
    const al = nuevo()
    const antes = al.leer()
    expect(antes.version).toBe(0)
    expect(al.leer()).toBe(antes)
    let avisos = 0
    const baja = al.suscribir(() => avisos++)
    al.poner('a', 1, 10, 20)
    const despues = al.leer()
    expect(despues).not.toBe(antes)
    expect(despues.version).toBe(1)
    expect(avisos).toBe(1)
    // El mapa es siempre el mismo objeto (se modifica en sitio): las instantáneas lo comparten.
    expect(despues.series).toBe(antes.series)
    expect(despues.series.get('a')![1]).toEqual({ t: 0.1, x: 10, y: 20, calidad: 1, editadoManual: true })
    baja()
    al.quitar('a', 1)
    expect(avisos).toBe(1)
    expect(al.leer().version).toBe(2)
    expect(al.leer().series.get('a')![1]).toBeUndefined()
  })

  it('al recuperar, empieza con las series guardadas; cada marcador tiene un hueco por frame', () => {
    const guardada = [undefined, { t: 0.1, x: 1, y: 2, calidad: 1, editadoManual: true }, undefined, undefined, undefined]
    const al = new AlmacenTrayectorias(['a', 'b'], tiempos, new Map([['a', guardada]]))
    expect(al.leer().series.get('a')).toBe(guardada)
    expect(al.leer().series.get('b')).toHaveLength(tiempos.length)
  })

  it('un lote del worker no sobrescribe lo marcado a mano', () => {
    const al = nuevo()
    al.poner('a', 2, 5, 5)
    al.aplicarLote([{ indice: 2, t: 0.2, marcadores: [{ id: 'a', x: 9, y: 9, calidad: 0.9 }, { id: 'b', x: 7, y: 7, calidad: 0.8 }] }])
    const s = al.leer().series
    expect(s.get('a')![2]).toMatchObject({ x: 5, editadoManual: true })
    expect(s.get('b')![2]).toEqual({ t: 0.2, x: 7, y: 7, calidad: 0.8, editadoManual: false })
  })

  it('«Seguir desde aquí» quita lo seguido después (no lo marcado a mano) y lo devuelve si no arranca', () => {
    const al = nuevo()
    const lote = [1, 2, 3, 4].map((i) => ({ indice: i, t: tiempos[i]!, marcadores: [{ id: 'a', x: i, y: i, calidad: 1 }] }))
    al.aplicarLote(lote)
    al.poner('a', 3, 30, 30)
    const quitado = al.borrarDespuesDe(1)
    const s = al.leer().series.get('a')!
    expect(s[1]).toMatchObject({ x: 1 }) // el frame de partida se queda
    expect(s[2]).toBeUndefined()
    expect(s[3]).toMatchObject({ x: 30, editadoManual: true })
    expect(s[4]).toBeUndefined()
    al.devolver(quitado)
    expect(al.leer().series.get('a')!.map((m) => m?.x)).toEqual([undefined, 1, 2, 30, 4])
  })

  it('quita las marcas a mano posteriores y dice cuántas', () => {
    const al = nuevo()
    al.poner('a', 1, 1, 1)
    al.poner('a', 3, 3, 3)
    al.poner('b', 4, 4, 4)
    const v = al.leer().version
    expect(al.quitarManualesDespuesDe(1)).toBe(2)
    expect(al.leer().version).toBe(v + 1)
    expect(al.leer().series.get('a')!.map((m) => m?.x)).toEqual([undefined, 1, undefined, undefined, undefined])
  })
})
