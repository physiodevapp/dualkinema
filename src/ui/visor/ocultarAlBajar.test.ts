import { describe, expect, it } from 'vitest'
import { anclar, BAJAR_PX, ESTADO_INICIAL, mostrar, siguienteEstado, SUBIR_PX, TOPE_ARRIBA_PX, type EntradaOcultar, type EstadoOcultar } from './ocultarAlBajar'

const entrada = (y: number, extra: Partial<EntradaOcultar> = {}): EntradaOcultar => ({ y, tarjetasArriba: true, forzarVisible: false, ...extra })
/** Pasa por una lista de posiciones de scroll y devuelve el estado tras cada una. */
const recorrer = (ys: number[], extra: Partial<EntradaOcultar> = {}, desde: EstadoOcultar = ESTADO_INICIAL) => {
  const salida: EstadoOcultar[] = []
  let e = desde
  for (const y of ys) salida.push((e = siguienteEstado(e, entrada(y, extra))))
  return salida
}

describe('ocultar el vídeo al bajar', () => {
  it('no se oculta por un movimiento pequeño ni cerca del principio', () => {
    expect(recorrer([10, 20, 30, 40, 50]).every((e) => !e.oculto)).toBe(true)
    // Aunque se baje mucho, por encima del tope sigue a la vista.
    expect(recorrer([0, 20, 40, 55]).at(-1)!.oculto).toBe(false)
  })

  it('se oculta al bajar BAJAR_PX seguidos con las tarjetas ya arriba', () => {
    const e = recorrer([200, 210, 220, 200 + BAJAR_PX + 1]).at(-1)!
    expect(e.oculto).toBe(true)
  })

  it('con las tarjetas aún abajo (ocultar dejaría un hueco vacío) no se oculta', () => {
    expect(recorrer([100, 140, 180, 220], { tarjetasArriba: false }).at(-1)!.oculto).toBe(false)
  })

  it('vuelve al subir SUBIR_PX seguidos, y un cambio de sentido reinicia lo acumulado', () => {
    const oculto = recorrer([200, 240]).at(-1)!
    expect(oculto.oculto).toBe(true)
    // Sube poco y vuelve a bajar: sigue oculto.
    const poco = recorrer([240 - SUBIR_PX + 5, 240 - SUBIR_PX + 20], {}, oculto).at(-1)!
    expect(poco.oculto).toBe(true)
    // Sube lo bastante de una vez.
    expect(recorrer([240 - SUBIR_PX - 1], {}, oculto).at(-1)!.oculto).toBe(false)
  })

  it('subir a pequeños pasos también lo trae (se acumula en el mismo sentido)', () => {
    const oculto = recorrer([300, 340]).at(-1)!
    const e = recorrer([335, 328, 320, 312], {}, oculto).at(-1)!
    expect(e.oculto).toBe(false)
  })

  it('cerca del principio siempre se ve', () => {
    const oculto = recorrer([300, 340]).at(-1)!
    expect(recorrer([TOPE_ARRIBA_PX - 1], {}, oculto).at(-1)!.oculto).toBe(false)
  })

  it('forzarVisible lo muestra y mientras dure no se oculta', () => {
    const e = recorrer([200, 260, 320], { forzarVisible: true }).at(-1)!
    expect(e.oculto).toBe(false)
    // Al dejar de forzar, vuelve a funcionar con lo que se baje después.
    expect(recorrer([360, 400], {}, e).at(-1)!.oculto).toBe(true)
  })

  it('anclado: no se oculta por mucho que se baje, hasta volver al principio', () => {
    const anclado = anclar(recorrer([200, 260]).at(-1)!)
    expect(anclado.oculto).toBe(false)
    expect(recorrer([300, 400, 500], {}, anclado).every((e) => !e.oculto && e.anclado)).toBe(true)
    // Al volver arriba se suelta y vuelve a ser automático.
    const arriba = recorrer([10], {}, anclado).at(-1)!
    expect(arriba.anclado).toBe(false)
    expect(recorrer([200, 260], {}, arriba).at(-1)!.oculto).toBe(true)
  })

  it('mostrar (cambio de frame o de pestaña) lo trae sin soltar el ancla ni perder la posición', () => {
    const oculto = recorrer([200, 260]).at(-1)!
    const visto = mostrar(oculto)
    expect(visto).toMatchObject({ oculto: false, y: 260, acumulado: 0 })
    // Hay que bajar otra vez BAJAR_PX para que se oculte de nuevo.
    expect(recorrer([270], {}, visto).at(-1)!.oculto).toBe(false)
    expect(recorrer([270, 300], {}, visto).at(-1)!.oculto).toBe(true)
  })
})
