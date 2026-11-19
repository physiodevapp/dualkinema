import { describe, expect, it } from 'vitest'
import { DURACION_SECUENCIA_S, VELOCIDAD_SONIDO, secuencia, type AudioMono } from '../sincronia/pitido'
import { grabarPitidos } from '../sincronia/sintetico'
import { ESCUCHA_S, PITA_PRIMERO_S, PITA_SEGUNDO_S, distanciaEntre, leerResultadoDistancia, medirEnEscucha } from './distancia'

const TASA = 48000

/**
 * Los dos móviles escuchando: el inicio acordado es t = 0 en el reloj de A; B lo tiene `errorReloj` s corrido. Cada uno
 * empieza a escuchar `empiezaA` / `empiezaB` s después de su inicio (y lo cree en `creeA` / `creeB`: lo que coloca mal el
 * audio en su reloj), y su altavoz suena `latA` / `latB` s tarde.
 */
function escuchas(o: { distancia: number; errorReloj: number; latA: number; latB: number; empiezaA: number; empiezaB: number; creeA: number; creeB: number; ruido?: number }) {
  const vuelo = o.distancia / VELOCIDAD_SONIDO
  const emiteA = PITA_PRIMERO_S + o.latA
  const emiteB = o.errorReloj + PITA_SEGUNDO_S + o.latB
  const oye = (empieza: number, cerca: number, lejos: number, semilla: number): Float64Array =>
    grabarPitidos(
      {
        tasa: TASA,
        duracion: ESCUCHA_S,
        secuencias: [
          { t: cerca - empieza, amplitud: 1 },
          { t: lejos - empieza, amplitud: 0.06 },
        ],
        ecos: [{ retardo: 0.007, amplitud: 0.35 }],
        ruido: o.ruido ?? 0.01,
        semilla,
      },
      secuencia,
      DURACION_SECUENCIA_S,
    )
  const enA = oye(o.empiezaA, emiteA, emiteB + vuelo, 3)
  // B cuenta el tiempo desde su inicio (corrido errorReloj respecto al de A).
  const enB = grabarPitidos(
    {
      tasa: TASA,
      duracion: ESCUCHA_S,
      secuencias: [
        { t: emiteB - o.errorReloj - o.empiezaB, amplitud: 1 },
        { t: emiteA + vuelo - o.errorReloj - o.empiezaB, amplitud: 0.06 },
      ],
      ecos: [{ retardo: 0.011, amplitud: 0.3 }],
      ruido: o.ruido ?? 0.01,
      semilla: 4,
    },
    secuencia,
    DURACION_SECUENCIA_S,
  )
  const a: AudioMono = { inicio: o.creeA, tasa: TASA, muestras: enA }
  const b: AudioMono = { inicio: o.creeB, tasa: TASA, muestras: enB }
  return { a, b }
}

describe('distancia entre los móviles por el pitido, antes de grabar', () => {
  it('da la distancia a menos de 2 cm, con el reloj corrido, latencias de altavoz distintas y el audio mal colocado', () => {
    for (const [d, err, latA, latB, crA, crB] of [
      [2.0, 0.04, 0.19, 0.34, -0.25, -0.1],
      [1.5, -0.05, 0.05, 0.3, -0.05, -0.3],
      [4.3, 0.0, 0.33, 0.0, -0.15, -0.15],
    ] as const) {
      // Empiezan a escuchar 0,3 s antes del inicio, pero cada uno lo cree en otro sitio (hasta 0,2 s de error).
      const { a, b } = escuchas({ distancia: d, errorReloj: err, latA, latB, empiezaA: -0.3, empiezaB: -0.3, creeA: crA, creeB: crB })
      const ma = medirEnEscucha(a, true)!
      const mb = medirEnEscucha(b, false)!
      expect(ma).not.toBeNull()
      expect(mb).not.toBeNull()
      const r = distanciaEntre(ma, mb)
      expect('metros' in r && Math.abs(r.metros - d)).toBeLessThan(0.02)
    }
  })

  it('sin el pitido del otro (no suena o no se oye): null', () => {
    const silencio: AudioMono = { inicio: -0.3, tasa: TASA, muestras: grabarPitidos({ tasa: TASA, duracion: ESCUCHA_S, secuencias: [{ t: 0.8, amplitud: 1 }], ruido: 0.02, semilla: 9 }, secuencia, DURACION_SECUENCIA_S) }
    expect(medirEnEscucha(silencio, true)).toBeNull()
  })

  it('una distancia imposible se dice como fallo', () => {
    expect(distanciaEntre({ dif: 2, calidad: 20 }, { dif: -2.2, calidad: 20 })).toEqual({ fallo: 'increible' })
  })

  it('se lee del otro campo a campo', () => {
    expect(leerResultadoDistancia({ metros: 2.03, calidad: 12 })).toEqual({ metros: 2.03, calidad: 12 })
    expect(leerResultadoDistancia({ fallo: 'no-oido' })).toEqual({ fallo: 'no-oido' })
    expect(leerResultadoDistancia({ metros: 40 })).toBeNull()
    expect(leerResultadoDistancia({ fallo: 'otro' })).toBeNull()
    expect(leerResultadoDistancia('2 m')).toBeNull()
  })
})
