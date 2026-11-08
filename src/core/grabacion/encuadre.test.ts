import { describe, expect, it } from 'vitest'
import { enteraEn, fraseEncuadre, igual, leerEncuadre, revisarEncuadre, type PuntoNorm } from './encuadre'

/** Una persona de pie en el centro, de y0 (cabeza) a y1 (pies), con todo visible. */
function persona(y0 = 0.1, y1 = 0.9, x = 0.5, cambios: Record<number, Partial<PuntoNorm>> = {}): PuntoNorm[] {
  const p: PuntoNorm[] = Array.from({ length: 33 }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / 32, visibility: 0.95 }))
  for (const i of [0, 2, 5]) p[i] = { x, y: y0, visibility: 0.95 }
  for (const i of [29, 30, 31, 32]) p[i] = { x: x + (i % 2 ? -0.03 : 0.03), y: y1, visibility: 0.9 }
  for (const [i, c] of Object.entries(cambios)) p[Number(i)] = { ...p[Number(i)]!, ...c }
  return p
}

describe('encuadre de la persona', () => {
  it('entera, con margen: bien', () => {
    expect(revisarEncuadre(persona())).toEqual({ persona: true, cortes: [] })
    expect(enteraEn(revisarEncuadre(persona()))).toBe(true)
  })

  it('sin nadie, o casi nada del cuerpo: no hay persona', () => {
    expect(revisarEncuadre(null)).toEqual({ persona: false })
    const casiNada = persona().map((p) => ({ ...p, visibility: 0.1 }))
    expect(revisarEncuadre(casiNada)).toEqual({ persona: false })
  })

  it('los pies fuera (MediaPipe los extrapola con poca visibilidad, o por debajo del borde) y la cabeza pegada arriba', () => {
    expect(revisarEncuadre(persona(0.1, 1.05)).persona && revisarEncuadre(persona(0.1, 1.05))).toMatchObject({ cortes: ['pies'] })
    expect(revisarEncuadre(persona(0.1, 0.9, 0.5, { 31: { visibility: 0.2 } }))).toMatchObject({ cortes: ['pies'] })
    expect(revisarEncuadre(persona(0.01, 0.9))).toMatchObject({ cortes: ['cabeza'] })
  })

  it('cortada por un lado de la imagen', () => {
    expect(revisarEncuadre(persona(0.1, 0.9, 0.02))).toMatchObject({ cortes: ['izquierda'] })
    expect(revisarEncuadre(persona(0.1, 0.9, 0.99))).toMatchObject({ cortes: ['derecha'] })
  })

  it('lo que se dice con los dos móviles', () => {
    const bien = revisarEncuadre(persona())
    const pies = revisarEncuadre(persona(0.1, 1.05))
    const todo = { persona: true as const, cortes: ['cabeza', 'pies', 'izquierda'] as const }
    expect(fraseEncuadre(bien, bien)).toBe('Se te ve entero en los dos móviles.')
    expect(fraseEncuadre(bien, pies)).toBe('En este móvil se te ve entero; en el otro móvil no se te ven los pies.')
    expect(fraseEncuadre({ persona: false }, bien)).toBe('En este móvil no te ve; en el otro se te ve entero.')
    expect(fraseEncuadre(todo, null)).toBe('En este móvil no se te ven la cabeza ni los pies y te corta por la izquierda de la imagen; del otro móvil no sé nada todavía.')
    expect(fraseEncuadre(revisarEncuadre(persona(0.01, 0.9)), bien)).toBe('En este móvil no se te ve la cabeza; en el otro se te ve entero.')
  })

  it('se lee del otro móvil campo a campo, y dos resultados iguales se reconocen', () => {
    expect(leerEncuadre({ persona: true, cortes: ['pies', 'raro', 'cabeza'], extra: 1 })).toEqual({ persona: true, cortes: ['cabeza', 'pies'] })
    expect(leerEncuadre({ persona: false })).toEqual({ persona: false })
    expect(leerEncuadre({ persona: 'sí' })).toBeNull()
    expect(igual({ persona: true, cortes: ['pies'] }, { persona: true, cortes: ['pies'] })).toBe(true)
    expect(igual({ persona: true, cortes: [] }, { persona: false })).toBe(false)
  })
})
