import { describe, expect, it } from 'vitest'
import { ARRANQUE_IGNORADO_S, CalculoEnvolvente, envolvente, mezclarMono, TASA_ENVOLVENTE, type Envolvente } from './envolvente'
import { CALIDAD_MAX, correlacionGccPhat } from './gccPhat'
import { CALIDAD_AUDIO_MINIMA, compararConEvento, conComprobacion, desfaseDeAudio, sincroniaDeAudio } from './audio'
import { ajusteManual, incertidumbreEvento } from './evento'
import { grabar, type Microfono } from './sintetico'

/*
 * Verdad conocida: un golpe a g_A s de la primera muestra de A (que está en inicio_A) y a g_B s de la de B ocurre a la
 * vez en los dos, así que desfase = t_ref − t_vista = (inicio_A + g_A) − (inicio_B + g_B).
 */

/** Las respuestas de los dos micrófonos: ecos distintos (uno con un rebote negativo, otro con dos). */
const ECOS_A = [{ retardo: 0.003, amplitud: -0.3 }]
const ECOS_B = [
  { retardo: 0.007, amplitud: 0.5 },
  { retardo: 0.019, amplitud: 0.25 },
]

const env = (m: Microfono, inicio = 0): Envolvente => envolvente(grabar(m), m.tasa, inicio)!

/** Desfase verdadero de un mismo golpe. */
const verdad = (inicioA: number, gA: number, inicioB: number, gB: number) => inicioA + gA - (inicioB + gB)

describe('envolvente', () => {
  it('la subida está en el bloque del golpe, contado desde la primera muestra, y antes no hay nada', () => {
    const e = env({ tasa: 48000, duracion: 3, golpes: [1.2345] }, 0.25)
    expect(e.inicio).toBe(0.25)
    expect(e.tasa).toBe(TASA_ENVOLVENTE)
    expect(e.senal.length).toBe(3 * TASA_ENVOLVENTE)
    const k = e.senal.indexOf(Math.max(...e.senal))
    // El golpe sube en sus primeros milisegundos (el bloque 2469 empieza en 1,2345 s).
    expect(k / TASA_ENVOLVENTE).toBeGreaterThanOrEqual(1.2345 - 0.0005)
    expect(k / TASA_ENVOLVENTE).toBeLessThan(1.2345 + 0.005)
    expect(e.senal.subarray(0, Math.floor(1.23 * TASA_ENVOLVENTE)).every((v) => v === 0)).toBe(true)
  })

  it('una ganancia distinta escala la envolvente (por su cuadrado) y nada más; la continua no cuenta (paso alto)', () => {
    const base: Microfono = { tasa: 44100, duracion: 2, golpes: [0.8], ruido: 0.01 }
    const a = env(base)
    const b = env({ ...base, ganancia: 4, continua: 0.3 })
    const max = Math.max(...a.senal)
    for (let k = 0; k < a.senal.length; k++) expect(Math.abs(b.senal[k]! - 16 * a.senal[k]!)).toBeLessThan(1e-6 * max)
  })

  it('un hueco en la pista deja el resto en su sitio; el redondeo del instante de cada trozo no mueve nada', () => {
    const m: Microfono = { tasa: 48000, duracion: 3, golpes: [2.1] }
    const x = grabar(m)
    const entera = envolvente(x, m.tasa)!
    const calculo = new CalculoEnvolvente()
    // Trozos de 1024 muestras con el instante redondeado al microsegundo, y sin el tramo de 1,0 a 1,5 s.
    for (let i = 0; i < x.length; i += 1024) {
      if (i >= 48000 && i < 72000) continue
      calculo.anadir(x.subarray(i, i + 1024), m.tasa, Math.round((i / m.tasa) * 1e6) / 1e6)
    }
    const conHueco = calculo.terminar()!
    const k = entera.senal.indexOf(Math.max(...entera.senal))
    expect(conHueco.senal.indexOf(Math.max(...conHueco.senal))).toBe(k)
  })

  it('ignora el arranque: ni el transitorio del paso alto ni un chasquido al empezar a grabar', () => {
    const e = env({ tasa: 48000, duracion: 1, golpes: [0.02], continua: 0.5 })
    expect(e.senal.subarray(0, Math.ceil(ARRANQUE_IGNORADO_S * TASA_ENVOLVENTE)).every((v) => v === 0)).toBe(true)
  })

  it('en trozos sale lo mismo que de una vez, y lo que pasa de la duración no cuenta', () => {
    const m: Microfono = { tasa: 48000, duracion: 2.5, golpes: [0.6, 1.9], ruido: 0.02 }
    const x = grabar(m)
    const entera = envolvente(x, m.tasa, 0.1, { duracion: 2 })!
    const calculo = new CalculoEnvolvente({ duracion: 2 })
    for (let i = 0; i < x.length && !calculo.completo; i += 1024) calculo.anadir(x.subarray(i, i + 1024), m.tasa, 0.1 + i / m.tasa)
    expect(calculo.completo).toBe(true)
    const trozos = calculo.terminar()!
    expect(trozos.senal.length).toBe(2 * TASA_ENVOLVENTE)
    for (let k = 0; k < entera.senal.length; k++) expect(trozos.senal[k]).toBeCloseTo(entera.senal[k]!, 12)
  })

  it('sin audio añadido no hay envolvente; mono es la media de los canales', () => {
    expect(new CalculoEnvolvente().terminar()).toBeNull()
    expect(Array.from(mezclarMono([Float32Array.of(1, 0, -1), Float32Array.of(0, 1, 0)]))).toEqual([0.5, 0.5, -0.5])
  })
})

describe('GCC-PHAT', () => {
  const A: Microfono = { tasa: 48000, duracion: 20, golpes: [3.4], ecos: ECOS_A, ruido: 0.01, semilla: 1 }
  const B: Microfono = { tasa: 48000, duracion: 20, golpes: [2.9], ecos: ECOS_B, ruido: 0.01, semilla: 2 }

  it('retardo positivo: la vista empezó después (el golpe sale antes en ella)', () => {
    const c = correlacionGccPhat(env(A), env(B))!
    expect(c.desfase).toBeCloseTo(verdad(0, 3.4, 0, 2.9), 3) // 0,500 s
    expect(Math.abs(c.desfase - 0.5)).toBeLessThan(0.0002)
    expect(c.calidad).toBeGreaterThan(5)
  })

  it('retardo negativo: la vista empezó antes', () => {
    const c = correlacionGccPhat(env({ ...A, golpes: [1.1] }), env({ ...B, golpes: [8.433] }))!
    expect(Math.abs(c.desfase - verdad(0, 1.1, 0, 8.433))).toBeLessThan(0.0002) // −7,333 s
  })

  it('el retardo no es un número entero de muestras: la parábola baja de la muestra (0,5 ms) a menos de 0,1 ms', () => {
    // Mismo micrófono en los dos, para medir solo la parábola: 0,73314 s = 1466,28 muestras de la envolvente, etc.
    for (const gB of [2.66686, 2.6669, 2.66713, 2.66735]) {
      const c = correlacionGccPhat(env({ ...A, ruido: 0 }), env({ ...A, golpes: [gB], ruido: 0 }))!
      expect(Math.abs(c.desfase - (3.4 - gB))).toBeLessThan(0.0001)
    }
  })

  it('el tiempo es el del vídeo: cuenta el instante de la primera muestra de cada audio', () => {
    const c = correlacionGccPhat(env(A, 0.021), env(B, -0.013))!
    expect(Math.abs(c.desfase - verdad(0.021, 3.4, -0.013, 2.9))).toBeLessThan(0.0002)
  })

  it('con ganancias muy distintas, tasas distintas (48 y 44,1 kHz) y duraciones distintas', () => {
    const c = correlacionGccPhat(
      env({ ...A, ganancia: 4, duracion: 12 }),
      env({ ...B, tasa: 44100, ganancia: 0.03, duracion: 35, golpes: [9.25] }),
    )!
    expect(Math.abs(c.desfase - verdad(0, 3.4, 0, 9.25))).toBeLessThan(0.0002)
    expect(c.calidad).toBeGreaterThan(5)
  })

  it('con ruido de fondo fuerte (de desviación 0,2 frente a un pico de la palmada de ~1)', () => {
    const c = correlacionGccPhat(env({ ...A, ruido: 0.2 }), env({ ...B, ruido: 0.2 }))!
    expect(Math.abs(c.desfase - 0.5)).toBeLessThan(0.0005)
    expect(c.calidad).toBeGreaterThan(CALIDAD_AUDIO_MINIMA)
  })

  it('un golpe que solo oye uno de los dos da otro pico tan alto como el bueno: calidad baja', () => {
    // El golpe de 6,1 s de A casa con la palmada de B tanto como la palmada de A: no se puede saber cuál es.
    const c = correlacionGccPhat(env({ ...A, golpes: [3.4, 6.1] }), env(B))!
    expect(c.calidad).toBeLessThan(CALIDAD_AUDIO_MINIMA)
  })

  it('sonidos que se repiten durante toda la grabación (pasos cada 0,6 s): calidad baja', () => {
    const pasos = (desde: number) => Array.from({ length: 32 }, (_, i) => desde + 0.6 * i)
    const c = correlacionGccPhat(env({ ...A, golpes: pasos(0.3) }), env({ ...B, golpes: pasos(0.45) }))!
    expect(c.calidad).toBeLessThan(CALIDAD_AUDIO_MINIMA)
  })

  it('solo se busca dentro de la ventana (±10 s): fuera, calidad baja; con una ventana mayor se encuentra', () => {
    const lejos = { ...B, duracion: 30, golpes: [15.4] } // desfase −12 s
    const corta = correlacionGccPhat(env(A), env(lejos))!
    expect(Math.abs(corta.desfase)).toBeLessThanOrEqual(10)
    expect(corta.calidad).toBeLessThan(CALIDAD_AUDIO_MINIMA)
    const larga = correlacionGccPhat(env(A), env(lejos), { ventana: 15 })!
    expect(Math.abs(larga.desfase + 12)).toBeLessThan(0.0002)
  })

  it('en silencio, o sin solape posible dentro de la ventana, no hay resultado', () => {
    const silencio = env({ tasa: 48000, duracion: 5, golpes: [] })
    expect(correlacionGccPhat(silencio, silencio)).toBeNull()
    expect(correlacionGccPhat(env(A), env(B, 40))).toBeNull()
  })

  it('sin un segundo pico la calidad se queda en el tope, finita', () => {
    const c = correlacionGccPhat(env({ ...A, ruido: 0 }), env({ ...B, ruido: 0 }))!
    expect(c.calidad).toBeGreaterThan(5)
    expect(c.calidad).toBeLessThanOrEqual(CALIDAD_MAX)
  })
})

describe('sincronía por audio', () => {
  const A: Microfono = { tasa: 48000, duracion: 15, golpes: [2.5], ecos: ECOS_A, ruido: 0.02, semilla: 3 }
  const B: Microfono = { tasa: 48000, duracion: 15, golpes: [2.02], ecos: ECOS_B, ruido: 0.02, semilla: 4 }

  it('da el desfase con la precisión de una muestra de la envolvente (±0,5 ms) y es fiable', () => {
    const r = desfaseDeAudio(env(A), env(B))!
    expect(Math.abs(r.desfase - 0.48)).toBeLessThan(0.0002)
    expect(r.incertidumbre).toBeCloseTo(0.0005, 12)
    expect(r.fiable).toBe(true)
  })

  it('no es fiable con calidad baja', () => {
    expect(desfaseDeAudio(env({ ...A, golpes: [2.5, 7.3] }), env(B))!.fiable).toBe(false)
  })

  it('se anota como audio con su calidad y el desfase que dio; el ajuste fino se cuenta sobre él', () => {
    const r = desfaseDeAudio(env(A), env(B))!
    const s = sincroniaDeAudio(r)
    expect(s).toEqual({ metodo: 'audio', audio: { calidad: r.calidad, desfase: r.desfase } })
    expect(ajusteManual(r.desfase + 0.04, s)).toBeCloseTo(0.04, 12)
  })

  it('la comprobación con el evento visual muestra la diferencia y no cambia nada', () => {
    // Audio 0,480 s; evento visual 0,520 s (A a 30 fps y B a 25: ±37 ms) → diferencia de 40 ms: discrepan.
    const audio = { desfase: 0.48, incertidumbre: 0.0005 }
    const evento = { referencia: 1.04, vista: 0.52 }
    const inc = incertidumbreEvento(1 / 30, 1 / 25)
    const c = compararConEvento(audio, evento, inc)
    expect(c.audio).toBe(0.48)
    expect(c.evento).toBeCloseTo(0.52, 12)
    expect(c.diferencia).toBeCloseTo(0.04, 12)
    expect(c.discrepan).toBe(true)
    // A 20 ms entra en la incertidumbre del evento.
    expect(compararConEvento(audio, { referencia: 1.02, vista: 0.52 }, inc).discrepan).toBe(false)
    // Se guarda con la sincronía, que sigue siendo la del audio.
    const s = conComprobacion({ metodo: 'audio', audio: { calidad: 9, desfase: 0.48 } }, evento)
    expect(s).toEqual({ metodo: 'audio', audio: { calidad: 9, desfase: 0.48 }, evento })
    expect(ajusteManual(0.48, s)).toBe(0)
  })
})
