import { describe, expect, it } from 'vitest'
import {
  CALIDAD_PITIDO_MINIMA,
  DURACION_SECUENCIA_S,
  PITIDO_OTRA_S,
  PITIDO_REFERENCIA_S,
  VELOCIDAD_SONIDO,
  combinarIdaVuelta,
  instantePitido,
  localizarSecuencia,
  muestrasSecuencia,
  secuencia,
  type AudioMono,
} from './pitido'
import { aleatorio, grabarPitidos, type MicrofonoPitidos } from './sintetico'

const TASA = 48000
const grabar = (m: Omit<MicrofonoPitidos, 'tasa'> & { tasa?: number }, inicio = 0): AudioMono => ({
  inicio,
  tasa: m.tasa ?? TASA,
  muestras: grabarPitidos({ tasa: TASA, ...m }, secuencia, DURACION_SECUENCIA_S),
})

describe('localizarSecuencia', () => {
  it('encuentra la secuencia limpia a menos de una centésima de muestra, también entre muestras', () => {
    for (const t of [1.0, 1.123456, 0.85001]) {
      const d = localizarSecuencia(grabar({ duracion: 2, secuencias: [{ t, amplitud: 0.5 }] }), 1.0)
      expect(d).not.toBeNull()
      expect(Math.abs(d!.t - t)).toBeLessThan(0.01 / TASA)
      expect(d!.calidad).toBeGreaterThan(CALIDAD_PITIDO_MINIMA)
    }
  })

  it('tiene en cuenta el instante de la primera muestra (tiempo del vídeo)', () => {
    const d = localizarSecuencia(grabar({ duracion: 2, secuencias: [{ t: 1.2, amplitud: 0.5 }] }, 0.174), 1.374)
    expect(d!.t).toBeCloseTo(1.374, 5)
  })

  it('con ruido, eco de la sala y palmadas 26 dB más fuertes antes y después, sigue a menos de 0,05 ms', () => {
    const d = localizarSecuencia(
      grabar({
        duracion: 3,
        secuencias: [{ t: 1.05, amplitud: 0.05 }],
        golpes: [0.75, 1.55],
        ecos: [
          { retardo: 0.004, amplitud: 0.5 },
          { retardo: 0.011, amplitud: 0.3 },
        ],
        ruido: 0.03,
        semilla: 3,
      }),
      1.0,
    )
    expect(Math.abs(d!.t - 1.05)).toBeLessThan(0.00005)
    expect(d!.calidad).toBeGreaterThan(CALIDAD_PITIDO_MINIMA)
  })

  it('suena 340 ms tarde (latencia del altavoz de una tablet antigua): se encuentra igual', () => {
    const d = localizarSecuencia(grabar({ duracion: 4, secuencias: [{ t: 2.84, amplitud: 0.2 }], ruido: 0.01 }), 2.5)
    expect(Math.abs(d!.t - 2.84)).toBeLessThan(0.00005)
  })

  it('en una sala con reverberación y un reflejo más fuerte que el sonido directo, da la llegada del directo', () => {
    // Un reflejo 2,5 ms después del directo y 1,6 veces más fuerte, y una cola de reflejos que decae en ~150 ms.
    const azar = aleatorio(21)
    const cola = Array.from({ length: 60 }, (_, i) => {
      const retardo = 0.004 + i * 0.0025 + azar() * 0.002
      return { retardo, amplitud: (azar() - 0.5) * 1.2 * Math.exp(-retardo / 0.05) }
    })
    const d = localizarSecuencia(
      grabar({ duracion: 3, secuencias: [{ t: 1.2, amplitud: 0.3 }], ecos: [{ retardo: 0.0025, amplitud: 1.6 }, ...cola], ruido: 0.005, semilla: 8 }),
      1.0,
    )
    expect(Math.abs(d!.t - 1.2)).toBeLessThan(0.0001)
    expect(d!.calidad).toBeGreaterThan(CALIDAD_PITIDO_MINIMA)
  })

  it('el propio pitido saturado en el micrófono se encuentra igual', () => {
    const d = localizarSecuencia(grabar({ duracion: 2, secuencias: [{ t: 0.98, amplitud: 5 }], saturacion: 1, ruido: 0.01 }), 1.0)
    expect(Math.abs(d!.t - 0.98)).toBeLessThan(0.00005)
  })

  it('solo palmadas y ruido, sin pitido: calidad baja', () => {
    const d = localizarSecuencia(grabar({ duracion: 2, secuencias: [], golpes: [0.9, 1.03, 1.16], ruido: 0.05, semilla: 9 }), 1.0)
    expect(d === null || d.calidad < CALIDAD_PITIDO_MINIMA).toBe(true)
  })

  it('un pitido fuera de la ventana no se encuentra (ni se confunde)', () => {
    const d = localizarSecuencia(grabar({ duracion: 3, secuencias: [{ t: 2.0, amplitud: 0.5 }], ruido: 0.02, semilla: 4 }), 1.0)
    expect(d === null || d.calidad < CALIDAD_PITIDO_MINIMA).toBe(true)
  })

  it('distingue las dos secuencias de la grabación doble aunque una sea mucho más débil', () => {
    const audio = grabar({
      duracion: 4,
      secuencias: [
        { t: 1.02, amplitud: 1 },
        { t: 2.51, amplitud: 0.03 },
      ],
      ruido: 0.01,
      semilla: 5,
    })
    expect(localizarSecuencia(audio, PITIDO_REFERENCIA_S)!.t).toBeCloseTo(1.02, 4)
    const otra = localizarSecuencia(audio, PITIDO_OTRA_S)!
    expect(otra.t).toBeCloseTo(2.51, 4)
    expect(otra.calidad).toBeGreaterThan(CALIDAD_PITIDO_MINIMA)
  })

  it('el audio no llega a la secuencia: null', () => {
    expect(localizarSecuencia(grabar({ duracion: 1.5, secuencias: [] }), PITIDO_OTRA_S)).toBeNull()
  })

  it('las muestras para emitir son la secuencia, con amplitud ≤ 1', () => {
    const x = muestrasSecuencia(TASA)
    expect(x.length).toBeGreaterThan(DURACION_SECUENCIA_S * TASA)
    expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1)
    expect(x[1000]).toBeCloseTo(secuencia(1000 / TASA), 6)
  })
})

describe('combinarIdaVuelta', () => {
  /** Grabación doble sintética: desfase Δ (= inicio de B − inicio de A), móviles a D m, latencias de altavoz distintas. */
  function grabacionDoble(delta: number, distancia: number, latA: number, latB: number, ruido = 0.01) {
    const vuelo = distancia / VELOCIDAD_SONIDO
    // Instantes reales con el inicio de A en 0 y el de B en Δ. A pita a 1,0 s de su inicio y B a 2,5 s del suyo.
    const emiteA = PITIDO_REFERENCIA_S + latA
    const emiteB = delta + PITIDO_OTRA_S + latB
    const enA = grabar({
      duracion: 4,
      secuencias: [
        { t: emiteA, amplitud: 1 },
        { t: emiteB + vuelo, amplitud: 0.05 },
      ],
      ecos: [{ retardo: 0.006, amplitud: 0.4 }],
      ruido,
      semilla: 11,
    })
    const enB = grabar({
      duracion: 4,
      secuencias: [
        { t: emiteA + vuelo - delta, amplitud: 0.05 },
        { t: emiteB - delta, amplitud: 1 },
      ],
      ecos: [{ retardo: 0.009, amplitud: 0.3 }],
      ruido,
      semilla: 12,
    })
    const det = (a: AudioMono, t: number) => localizarSecuencia(a, t)!
    return combinarIdaVuelta({
      referenciaEnReferencia: det(enA, PITIDO_REFERENCIA_S),
      referenciaEnVista: det(enB, PITIDO_REFERENCIA_S),
      vistaEnReferencia: det(enA, PITIDO_OTRA_S),
      vistaEnVista: det(enB, PITIDO_OTRA_S),
    })
  }

  it('da el desfase sin el sesgo de la distancia y la distancia, con latencias de altavoz distintas', () => {
    for (const [delta, d] of [
      [0.0371, 3.1],
      [-0.0425, 5],
      [0.0012, 1.2],
    ] as const) {
      const r = grabacionDoble(delta, d, 0.19, 0.34)
      // desfase = t_ref − t_vista de un mismo instante = inicio de B − inicio de A = Δ.
      expect(Math.abs(r.desfase - delta)).toBeLessThan(0.00005)
      expect(Math.abs(r.distancia - d)).toBeLessThan(0.03)
      expect(r.fiable).toBe(true)
    }
  })

  it('una distancia imposible no es fiable aunque la calidad sea buena', () => {
    const det = (t: number) => ({ t, calidad: 50, incertidumbre: 1 / TASA })
    const r = combinarIdaVuelta({
      referenciaEnReferencia: det(1.0),
      referenciaEnVista: det(1.0),
      vistaEnReferencia: det(2.5),
      vistaEnVista: det(2.6),
    })
    expect(r.distancia).toBeCloseTo(-17.15, 2)
    expect(r.distanciaRazonable).toBe(false)
    expect(r.fiable).toBe(false)
  })

  it('pita primero la vista de referencia', () => {
    expect(instantePitido(true)).toBe(PITIDO_REFERENCIA_S)
    expect(instantePitido(false)).toBe(PITIDO_OTRA_S)
    expect(PITIDO_OTRA_S - PITIDO_REFERENCIA_S).toBeGreaterThan(DURACION_SECUENCIA_S + 0.6)
  })
})
