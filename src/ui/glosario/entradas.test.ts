import { describe, expect, it } from 'vitest'
import { ENTRADAS, entradaPorId } from './entradas'

// El código fuente de la interfaz, para comprobar que cada icono de información apunta a una entrada que existe.
const fuentes = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('glosario', () => {
  it('cada entrada tiene id único, título y al menos un párrafo', () => {
    const ids = ENTRADAS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of ENTRADAS) {
      expect(e.id, e.id).toMatch(/^[a-z-]+$/)
      expect(e.titulo.trim(), e.id).not.toBe('')
      expect(e.texto.length, e.id).toBeGreaterThan(0)
      for (const p of e.texto) expect(p.trim(), e.id).not.toBe('')
    }
  })

  it('los párrafos de una entrada no se repiten (se usan de clave)', () => {
    for (const e of ENTRADAS) expect(new Set(e.texto).size, e.id).toBe(e.texto.length)
  })

  it('cada <InfoGlosario id="…"> de la interfaz apunta a una entrada que existe', () => {
    const usados = new Set<string>()
    for (const [archivo, codigo] of Object.entries(fuentes)) {
      if (archivo.includes('/glosario/')) continue
      for (const m of codigo.matchAll(/<InfoGlosario[^>]*\sid="([^"]+)"/g)) usados.add(m[1]!)
    }
    expect(usados.size).toBeGreaterThan(5)
    for (const id of usados) expect(entradaPorId(id), `entrada «${id}»`).toBeDefined()
  })

  it('todas las entradas se pueden alcanzar desde la interfaz o están en el listado', () => {
    // «datos» solo se ve en el listado (sin icono propio): el resto, con icono.
    const sinIcono = new Set(['datos'])
    const usados = new Set<string>()
    for (const [archivo, codigo] of Object.entries(fuentes)) {
      if (archivo.includes('/glosario/')) continue
      for (const m of codigo.matchAll(/<InfoGlosario[^>]*\sid="([^"]+)"/g)) usados.add(m[1]!)
    }
    for (const e of ENTRADAS) if (!sinIcono.has(e.id)) expect(usados.has(e.id), `«${e.id}» sin ningún icono que lleve a ella`).toBe(true)
  })
})
