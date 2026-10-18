import { describe, expect, it } from 'vitest'
import { CacheFrames, capacidadCache } from './cacheFrames'

describe('caché de frames', () => {
  it('devuelve lo guardado y descarta el que lleva más tiempo sin usarse', () => {
    const c = new CacheFrames<string>(3)
    c.guardar(1, 'a')
    c.guardar(2, 'b')
    c.guardar(3, 'c')
    expect(c.obtener(1)).toBe('a') // el 1 pasa a ser el más reciente
    c.guardar(4, 'd') // sale el 2
    expect(c.obtener(2)).toBeUndefined()
    expect([1, 3, 4].map((i) => c.obtener(i))).toEqual(['a', 'c', 'd'])
    expect(c.tamano).toBe(3)
  })

  it('volver a guardar un frame lo sustituye sin ocupar más', () => {
    const c = new CacheFrames<string>(2)
    c.guardar(1, 'a')
    c.guardar(1, 'a2')
    c.guardar(2, 'b')
    expect(c.obtener(1)).toBe('a2')
    expect(c.tamano).toBe(2)
  })

  it('la capacidad depende de la resolución, entre 8 y 120 frames', () => {
    expect(capacidadCache(1280, 720)).toBe(45)
    expect(capacidadCache(1920, 1080)).toBe(20)
    expect(capacidadCache(3840, 2160)).toBe(8)
    expect(capacidadCache(320, 180)).toBe(120)
  })
})
