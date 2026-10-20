import { describe, expect, it } from 'vitest'
import { hayVersionNueva, leerVersion } from './versionApp'

describe('versionApp', () => {
  it('lee el commit publicado y rechaza lo que no es una versión', () => {
    expect(leerVersion({ commit: 'a9c3f46', rama: 'main' })).toEqual({ commit: 'a9c3f46' })
    for (const malo of [null, undefined, 'html', 42, [], {}, { commit: '' }, { commit: 3 }]) expect(leerVersion(malo), String(malo)).toBeNull()
  })

  it('hay versión nueva solo si el commit publicado es otro', () => {
    expect(hayVersionNueva('a9c3f46', { commit: 'dbdeb4c' })).toBe(true)
    expect(hayVersionNueva('a9c3f46', { commit: 'a9c3f46' })).toBe(false)
    expect(hayVersionNueva('a9c3f46', null)).toBe(false)
  })
})
