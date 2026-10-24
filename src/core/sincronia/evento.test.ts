import { describe, expect, it } from 'vitest'
import { crearTablaFrames } from '../tiempo/tablaFrames'
import { aComun, frameVisibleEnComun } from '../tiempo/comun'
import { ajustarDesfase, ajusteManual, desfaseDeEvento, incertidumbreEvento, pasoTipico, sincroniaTrasAjuste } from './evento'

/** Tabla de `n` frames a `fps` constantes. */
const tabla = (n: number, fps: number) => crearTablaFrames(Array.from({ length: n }, (_, i) => i / fps))

describe('sincronía por evento visual', () => {
  it('el desfase hace coincidir el evento: t_ref = t_vista + desfase', () => {
    // Palmada vista a 1,000 s en la referencia (30 fps) y a 0,520 s en la otra (25 fps).
    const evento = { referencia: 1, vista: 0.52 }
    const desfase = desfaseDeEvento(evento)
    expect(desfase).toBeCloseTo(0.48, 12)
    expect(aComun(evento.vista, desfase)).toBeCloseTo(evento.referencia, 12)
  })

  it('con el desfase, el frame de la vista en el instante del evento de la referencia es el del evento', () => {
    const ref = tabla(120, 30)
    const vista = tabla(100, 25)
    const frameRef = 45 // t = 1,5 s
    const frameVista = 12 // t = 0,48 s
    const desfase = desfaseDeEvento({ referencia: ref.tiempos[frameRef]!, vista: vista.tiempos[frameVista]! })
    expect(frameVisibleEnComun({ tabla: vista, desfase }, ref.tiempos[frameRef]!)).toBe(frameVista)
    // Un frame después de la referencia (33 ms): la vista sigue en el del evento (un frame suyo dura 40 ms)...
    expect(frameVisibleEnComun({ tabla: vista, desfase }, ref.tiempos[frameRef + 1]!)).toBe(frameVista)
    // ...y dos frames después (67 ms) ya va uno más allá.
    expect(frameVisibleEnComun({ tabla: vista, desfase }, ref.tiempos[frameRef + 2]!)).toBe(frameVista + 1)
  })

  it('un desfase negativo: la vista empieza antes que la referencia', () => {
    expect(desfaseDeEvento({ referencia: 0.4, vista: 1.1 })).toBeCloseTo(-0.7, 12)
  })

  it('la incertidumbre es medio paso de cada vista (±33 ms entre dos vídeos de 30 fps)', () => {
    expect(incertidumbreEvento(1 / 30, 1 / 30)).toBeCloseTo(1 / 30, 12)
    expect(incertidumbreEvento(1 / 30, 1 / 25)).toBeCloseTo((1 / 30 + 1 / 25) / 2, 12)
  })

  it('el paso típico no lo mueven los frames que el móvil se salta', () => {
    const conHuecos = crearTablaFrames([0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map((i) => i / 30))
    expect(pasoTipico(conHuecos)).toBeCloseTo(1 / 30, 12)
    expect(Number.isNaN(pasoTipico(crearTablaFrames([0])))).toBe(true)
  })

  it('ajustar el desfase un frame de la vista lo mueve exactamente su paso', () => {
    const paso = 1 / 25
    expect(ajustarDesfase(0.48, 1, paso)).toBeCloseTo(0.52, 12)
    expect(ajustarDesfase(0.48, -2, paso)).toBeCloseTo(0.4, 12)
    expect(ajustarDesfase(0.48, 0, paso)).toBe(0.48)
  })

  it('sin un paso utilizable el ajuste no mueve el desfase (nunca NaN)', () => {
    expect(ajustarDesfase(0.48, 1, NaN)).toBe(0.48)
    expect(ajustarDesfase(0.48, -1, Infinity)).toBe(0.48)
    expect(ajustarDesfase(0.48, 1, 0)).toBe(0.48)
  })

  it('tras mover a mano, un evento sigue siendo de dónde partió y sin método pasa a manual', () => {
    expect(sincroniaTrasAjuste({ metodo: 'ninguna' })).toEqual({ metodo: 'manual' })
    const evento = { metodo: 'evento', evento: { referencia: 1, vista: 0.52 } } as const
    expect(sincroniaTrasAjuste(evento)).toBe(evento)
  })

  it('lo movido a mano se mide contra el desfase que dio el método', () => {
    const evento = { metodo: 'evento', evento: { referencia: 1, vista: 0.52 } } as const
    expect(ajusteManual(0.48, evento)).toBeCloseTo(0, 12)
    expect(ajusteManual(0.52, evento)).toBeCloseTo(0.04, 12)
    expect(ajusteManual(0.6, { metodo: 'audio', audio: { calidad: 4, desfase: 0.5 } })).toBeCloseTo(0.1, 12)
    expect(ajusteManual(0.6, { metodo: 'manual' })).toBeNull()
    expect(ajusteManual(0, { metodo: 'ninguna' })).toBeNull()
  })
})
