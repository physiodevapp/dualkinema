import { describe, expect, it } from 'vitest'
import { idMedio, idPose, PUNTOS_POSE } from '../../core/pose/puntos'
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
    const quitado = al.borrarDespuesDe(1, ['a', 'b'])
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
    expect(al.quitarManualesDespuesDe(1, ['a', 'b'])).toBe(2)
    expect(al.leer().version).toBe(v + 1)
    expect(al.leer().series.get('a')!.map((m) => m?.x)).toEqual([undefined, 1, undefined, undefined, undefined])
  })

  it('«Seguir desde aquí» solo quita las series que se siguen (los puntos sin marcadores no)', () => {
    const al = nuevo()
    al.aplicarLote([2, 3].map((i) => ({ indice: i, t: tiempos[i]!, marcadores: [{ id: 'a', x: i, y: i, calidad: 1 }, { id: 'b', x: i, y: i, calidad: 1 }] })))
    al.borrarDespuesDe(1, ['a'])
    expect(al.leer().series.get('a')![2]).toBeUndefined()
    expect(al.leer().series.get('b')![2]).toMatchObject({ x: 2 })
  })

  it('al detectar sin marcadores aparecen las series de los puntos; lo marcado a mano no se toca', () => {
    const al = nuevo()
    const id = idPose('rodilla', 'der')
    al.asegurar([id])
    al.poner(id, 1, 50, 50)
    const puntos = (x: number) => PUNTOS_POSE.flatMap(() => [x, 2 * x, 0.9])
    al.aplicarPose([
      { indice: 0, t: 0, puntos: puntos(10) },
      { indice: 1, t: 0.1, puntos: puntos(11) },
      { indice: 2, t: 0.2, puntos: null },
    ])
    const s = al.leer().series
    for (const p of PUNTOS_POSE) expect(s.get(p.id)).toHaveLength(tiempos.length)
    expect(s.get(id)![0]).toEqual({ t: 0, x: 10, y: 20, calidad: 0.9, editadoManual: false })
    expect(s.get(id)![1]).toMatchObject({ x: 50, editadoManual: true })
    expect(s.get(id)![2]).toMatchObject({ calidad: 0 })
    expect(s.get(id)![2]!.x).toBeNaN()
    // La detección entera, ya corregida, sustituye lo detectado y deja lo de a mano y lo que no trae.
    const v = al.leer().version
    al.fusionar(new Map([[id, [{ t: 0, x: 1, y: 1, calidad: 1, editadoManual: false }, { t: 0.1, x: 2, y: 2, calidad: 1, editadoManual: false }]]]))
    expect(al.leer().version).toBe(v + 1)
    expect(al.leer().series.get(id)!.map((m) => m?.x)).toEqual([1, 50, NaN, undefined, undefined])
    expect(al.leer().series.get('a')).toHaveLength(tiempos.length)
  })

  it('los puntos medios salen de los dos lados con cada cambio (también al recuperar) y siguen a una corrección a mano', () => {
    const [izq, der, medio] = [idPose('cadera', 'izq'), idPose('cadera', 'der'), idMedio('cadera')]
    const m = (x: number) => ({ t: 0, x, y: 10, calidad: 0.9, editadoManual: false })
    const al = new AlmacenTrayectorias([izq, der, medio], tiempos, new Map([[izq, [m(100)]], [der, [m(200)]]]))
    expect(al.leer().series.get(medio)![0]).toMatchObject({ x: 150, y: 10, calidad: 0.9 })
    al.poner(der, 0, 300, 10)
    expect(al.leer().series.get(medio)![0]).toMatchObject({ x: 200 })
    expect(al.leer().series.get(medio)![1]).toBeUndefined()
  })
})
