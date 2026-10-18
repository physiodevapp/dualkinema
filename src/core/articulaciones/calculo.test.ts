import { describe, expect, it } from 'vitest'
import { vec3, type Vec3 } from '../geometria/vector'
import { anguloArticular, CALIDAD_MINIMA, serieAngular } from './calculo'
import { articulacionesSagitales, marcadores } from './catalogo'
import { aImagen, direccion, frame, unir } from './poses'

const rodilla = articulacionesSagitales('der').find((a) => a.id === 'rodilla_sagital_der')!
const m = marcadores('der')
const o = { plano: 'sagital', mira: 'derecha' } as const

/** Rodilla con el muslo vertical y la pierna flexionada `k` grados, en píxeles. */
function rodillaEnImagen(k: number) {
  const pierna = direccion(-k)
  return {
    [m.cadera]: aImagen({ x: 0, y: 0 }, o),
    [m.rodilla]: aImagen({ x: 0, y: -1 }, o),
    [m.tobillo]: aImagen({ x: pierna.x, y: -1 + pierna.y }, o),
  }
}

describe('anguloArticular', () => {
  const p = (pares: Record<string, Vec3>) => new Map(Object.entries(pares))

  it('da NaN si falta un marcador, nunca 0', () => {
    expect(anguloArticular(rodilla, p({ [m.cadera]: vec3(0, 0), [m.rodilla]: vec3(0, -1) }))).toBeNaN()
  })

  it('da NaN si dos marcadores coinciden (segmento de longitud 0)', () => {
    expect(anguloArticular(rodilla, p({ [m.cadera]: vec3(0, 0), [m.rodilla]: vec3(0, 0), [m.tobillo]: vec3(0, -1) }))).toBeNaN()
  })

  it('en 3D da lo mismo que en 2D si se giran juntos los puntos y la normal', () => {
    const plano = p({ [m.cadera]: vec3(0, 0), [m.rodilla]: vec3(0, -1), [m.tobillo]: vec3(-Math.sin(Math.PI / 3), -1 - Math.cos(Math.PI / 3)) })
    const en2D = anguloArticular(rodilla, plano)
    expect(en2D).toBeCloseTo(60)

    // Giro arbitrario: 40° alrededor de x, luego 25° alrededor de y, más una traslación.
    const girar = (v: Vec3): Vec3 => {
      const a = (40 * Math.PI) / 180, b = (25 * Math.PI) / 180
      const y1 = v.y * Math.cos(a) - v.z * Math.sin(a), z1 = v.y * Math.sin(a) + v.z * Math.cos(a)
      return vec3(v.x * Math.cos(b) + z1 * Math.sin(b), y1, -v.x * Math.sin(b) + z1 * Math.cos(b))
    }
    const trasladar = (v: Vec3) => vec3(v.x + 3, v.y - 2, v.z + 5)
    const en3D = new Map([...plano].map(([id, v]) => [id, trasladar(girar(v))]))
    expect(anguloArticular(rodilla, en3D, girar(vec3(0, 0, 1)))).toBeCloseTo(60)
  })
})

describe('casos escritos a mano en píxeles', () => {
  // Cadera (100, 100), rodilla (100, 200): muslo vertical. El tobillo 100 px
  // por debajo y 100 px hacia atrás de la rodilla → 45° de flexión.
  it('persona mirando a la derecha: atrás es a la izquierda de la imagen', () => {
    const t = frame(0, { [m.cadera]: { x: 100, y: 100 }, [m.rodilla]: { x: 100, y: 200 }, [m.tobillo]: { x: 0, y: 300 } })
    expect(serieAngular(rodilla, t, { plano: 'sagital', mira: 'derecha' })[0]!.valor).toBeCloseTo(45)
  })

  it('persona mirando a la izquierda: atrás es a la derecha de la imagen', () => {
    const t = frame(0, { [m.cadera]: { x: 100, y: 100 }, [m.rodilla]: { x: 100, y: 200 }, [m.tobillo]: { x: 200, y: 300 } })
    expect(serieAngular(rodilla, t, { plano: 'sagital', mira: 'izquierda' })[0]!.valor).toBeCloseTo(45)
  })

  it('el tobillo por delante de la rodilla es hiperextensión (negativo)', () => {
    const t = frame(0, { [m.cadera]: { x: 100, y: 100 }, [m.rodilla]: { x: 100, y: 200 }, [m.tobillo]: { x: 110, y: 300 } })
    expect(serieAngular(rodilla, t, { plano: 'sagital', mira: 'derecha' })[0]!.valor).toBeCloseTo(-5.71, 1)
  })
})

describe('serieAngular', () => {
  it('ordena por tiempo y sigue el movimiento', () => {
    const tray = unir(frame(0.2, rodillaEnImagen(40)), frame(0, rodillaEnImagen(0)), frame(0.1, rodillaEnImagen(20)))
    const serie = serieAngular(rodilla, tray, o)
    expect(serie.map((s) => s.t)).toEqual([0, 0.1, 0.2])
    expect(serie.map((s) => Math.round(s.valor))).toEqual([0, 20, 40])
  })

  it('deja un hueco si un marcador está perdido o falta en ese instante', () => {
    const perdido = frame(0.1, rodillaEnImagen(20))
    perdido[m.tobillo] = [{ ...perdido[m.tobillo]![0]!, calidad: CALIDAD_MINIMA / 2 }]
    const sinTobillo = frame(0.2, rodillaEnImagen(30))
    delete sinTobillo[m.tobillo]
    const serie = serieAngular(rodilla, unir(frame(0, rodillaEnImagen(10)), perdido, sinTobillo, frame(0.3, rodillaEnImagen(40))), o)
    expect(serie.map((s) => s.t)).toEqual([0, 0.1, 0.2, 0.3])
    expect(serie[0]!.valor).toBeCloseTo(10)
    expect(serie[1]!.valor).toBeNaN()
    expect(serie[2]!.valor).toBeNaN()
    expect(serie[3]!.valor).toBeCloseTo(40)
  })

  it('marca los instantes con algún marcador interpolado, y solo si hay valor', () => {
    const interp = frame(0.1, rodillaEnImagen(20))
    interp[m.tobillo] = [{ ...interp[m.tobillo]![0]!, interpolado: true }]
    const sinRodilla = frame(0.2, rodillaEnImagen(30))
    sinRodilla[m.tobillo] = [{ ...sinRodilla[m.tobillo]![0]!, interpolado: true }]
    delete sinRodilla[m.rodilla]
    const serie = serieAngular(rodilla, unir(frame(0, rodillaEnImagen(10)), interp, sinRodilla), o)
    expect(serie.map((s) => s.interpolado)).toEqual([false, true, false])
    expect(serie[1]!.valor).toBeCloseTo(20)
  })

  it('es continua al pasar de 180°: no salta a −180°', () => {
    // Flexión forzada de 170° a 190° (geométricamente rara, pero la serie no debe saltar).
    const serie = serieAngular(rodilla, unir(frame(0, rodillaEnImagen(170)), frame(0.1, rodillaEnImagen(185)), frame(0.2, rodillaEnImagen(190))), o)
    expect(serie.map((s) => Math.round(s.valor))).toEqual([170, 185, 190])
  })

  it('el tiempo es el del vídeo, aunque los frames no estén equiespaciados', () => {
    const serie = serieAngular(rodilla, unir(frame(0, rodillaEnImagen(0)), frame(0.0333, rodillaEnImagen(5)), frame(0.0712, rodillaEnImagen(9))), o)
    expect(serie.map((s) => s.t)).toEqual([0, 0.0333, 0.0712])
  })

  it('rechaza una articulación de otro plano que el de la vista', () => {
    expect(() => serieAngular(rodilla, {}, { plano: 'frontal', ve: 'delante' })).toThrow(/plano sagital/)
  })
})
