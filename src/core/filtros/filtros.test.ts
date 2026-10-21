import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import {
  coeficientes,
  corteEfectivo,
  CORRECCION_WINTER,
  filtrarEquiespaciado,
  ganancia,
  MUESTRAS_MINIMAS,
} from './butterworth'
import { splineNatural } from './spline'
import { velocidadMarcador } from './derivadas'
import { comoMuestras, esAjustesFiltro, filtrarTramo, filtrarTrayectoria, SALTO_MAX_PASOS, tramosUtiles } from './tramos'

// ---- Utilidades de prueba ----

/** Generador reproducible (mulberry32) y ruido gaussiano (Box-Muller). */
function azar(semilla: number) {
  let s = semilla >>> 0
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u())
  return { u, normal }
}

const rango = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))
const rms = (a: ArrayLike<number>, b: ArrayLike<number>, desde = 0, hasta = a.length) => {
  let s = 0
  for (let i = desde; i < hasta; i++) s += (a[i]! - b[i]!) ** 2
  return Math.sqrt(s / (hasta - desde))
}
const maxDif = (a: ArrayLike<number>, b: ArrayLike<number>, desde = 0, hasta = a.length) => {
  let m = 0
  for (let i = desde; i < hasta; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!))
  return m
}
/** Amplitud de un seno de frecuencia f conocida (proyección sobre seno y coseno). */
function amplitud(xs: ArrayLike<number>, ts: ArrayLike<number>, f: number, desde: number, hasta: number) {
  let s = 0
  let c = 0
  for (let i = desde; i < hasta; i++) {
    s += xs[i]! * Math.sin(2 * Math.PI * f * ts[i]!)
    c += xs[i]! * Math.cos(2 * Math.PI * f * ts[i]!)
  }
  return (2 * Math.hypot(s, c)) / (hasta - desde)
}

const muestra = (t: number, x: number, y = 0, extra: Partial<Muestra2D> = {}): Muestra2D => ({
  t,
  x,
  y,
  calidad: 1,
  editadoManual: false,
  ...extra,
})

// ---- Butterworth ----

describe('Butterworth de fase cero', () => {
  it('la corrección de Winter para un 2.º orden pasado dos veces es 0,802', () => {
    expect(CORRECCION_WINTER).toBeCloseTo(0.802, 3)
  })

  it('respuesta en frecuencia: −3 dB justo en el corte (ida y vuelta), también cerca de Nyquist', () => {
    for (const [fc, fs] of [
      [6, 30],
      [6, 60],
      [2, 30],
      [12, 30],
      [15, 240],
    ] as const) {
      const g = ganancia(fc, coeficientes(fc, fs), fs)
      expect(20 * Math.log10(g), `${fc} Hz a ${fs} fps`).toBeCloseTo(-3.0103, 3)
    }
  })

  it('ganancia 1 en continua, casi 1 a 1 Hz y atenúa fuerte por encima del corte', () => {
    const c = coeficientes(6, 30)
    expect(ganancia(0, c, 30)).toBeCloseTo(1, 12)
    expect(ganancia(1, c, 30)).toBeGreaterThan(0.999)
    expect(ganancia(12, c, 30)).toBeLessThan(0.02)
  })

  it('medido sobre la señal: un seno a la frecuencia de corte sale con amplitud 1/√2', () => {
    const fs = 60
    const ts = rango(600, (i) => i / fs)
    const y = filtrarEquiespaciado(ts.map((t) => Math.sin(2 * Math.PI * 6 * t)), fs, 6)
    expect(amplitud(y, ts, 6, 120, 480)).toBeCloseTo(Math.SQRT1_2, 3)
  })

  it('seno de 1 Hz con ruido blanco: queda cerca del seno y sin desfase', () => {
    const fs = 30
    const { normal } = azar(7)
    const ts = rango(150, (i) => i / fs)
    const limpio = ts.map((t) => 50 * Math.sin(2 * Math.PI * t))
    const ruidoso = limpio.map((v) => v + normal())
    const y = filtrarEquiespaciado(ruidoso, fs, 6)
    // Queda el ruido por debajo del corte (6 de los 15 Hz hasta Nyquist): de σ ≈ 1
    // a ≈ 0,64 px. Un retraso de un solo frame daría ~7 px de error RMS con este seno.
    expect(rms(ruidoso, limpio)).toBeGreaterThan(0.9)
    expect(rms(y, limpio)).toBeLessThan(0.7)
    // Fase del componente de 1 Hz: cero (± 0,1°).
    let s = 0
    let c = 0
    ts.forEach((t, i) => {
      s += y[i]! * Math.sin(2 * Math.PI * t)
      c += y[i]! * Math.cos(2 * Math.PI * t)
    })
    expect(Math.abs((Math.atan2(c, s) * 180) / Math.PI)).toBeLessThan(0.1)
    // Bordes por reflexión: sin deformarse.
    expect(maxDif(y, limpio, 0, 10)).toBeLessThan(1.5)
    expect(maxDif(y, limpio, 140, 150)).toBeLessThan(1.5)
  })

  it('una constante y una recta pasan sin cambios, bordes incluidos', () => {
    const constante = filtrarEquiespaciado(rango(40, () => 7.25), 30, 6)
    expect(maxDif(constante, rango(40, () => 7.25))).toBeLessThan(1e-9)
    // La recta, con un resto del arranque de 1/1000 de px como mucho
    // (el estado inicial es el de una constante; la reflexión lo absorbe casi todo).
    const recta = rango(40, (i) => 3 + 0.8 * i)
    expect(maxDif(filtrarEquiespaciado(recta, 30, 6), recta)).toBeLessThan(1e-3)
  })

  it('el corte se limita a 0,4·fs', () => {
    expect(corteEfectivo(15, 30)).toBe(12)
    expect(corteEfectivo(6, 30)).toBe(6)
    expect(() => coeficientes(15, 30)).toThrow(/Nyquist/)
  })
})

// ---- Spline ----

describe('spline cúbico natural', () => {
  it('pasa por los puntos y reproduce una recta con espaciado desigual', () => {
    const ts = [0, 0.03, 0.07, 0.1, 0.16]
    const s = splineNatural(ts, ts.map((t) => 2 - 5 * t))
    for (const t of [0, 0.01, 0.05, 0.12, 0.16]) expect(s(t)).toBeCloseTo(2 - 5 * t, 12)
    const ys = [1, 4, -2, 0.5, 3]
    const p = splineNatural(ts, ys)
    ts.forEach((t, i) => expect(p(t)).toBeCloseTo(ys[i]!, 12))
  })
})

// ---- Tramos, fps variable y huecos ----

/** Señal de prueba: 1 Hz y 4 Hz, con salida esperada exacta (fase cero: cada componente por su ganancia). */
const senal = (t: number) => 40 * Math.sin(2 * Math.PI * t) + 10 * Math.sin(2 * Math.PI * 4 * t + 0.3)
function esperada(t: number, fs: number, fc: number) {
  const c = coeficientes(fc, fs)
  return 40 * ganancia(1, c, fs) * Math.sin(2 * Math.PI * t) + 10 * ganancia(4, c, fs) * Math.sin(2 * Math.PI * 4 * t + 0.3)
}

/** Tiempos de un móvil: ~30 fps con variación de ±25 % y algunos frames saltados. */
function tiemposVariables(n: number, semilla: number) {
  const { u } = azar(semilla)
  const ts: number[] = [0]
  while (ts.length < n) {
    const salto = u() < 0.05 ? 2 : 1
    ts.push(ts[ts.length - 1]! + (salto * (1 + 0.5 * (u() - 0.5))) / 30)
  }
  return ts
}

describe('filtrado por tramos', () => {
  it('con fps variable da lo mismo que con muestras equiespaciadas', () => {
    const fs = 30
    const uniformes = rango(120, (i) => i / fs)
    const variables = tiemposVariables(110, 3)
    const [yu] = filtrarTramo(uniformes, [uniformes.map(senal)], fs, 6)
    const [yv] = filtrarTramo(variables, [variables.map(senal)], fs, 6)
    // Lejos de los bordes (0,5 s), las dos coinciden con la salida exacta del filtro…
    const centro = (ts: number[]) => [ts.findIndex((t) => t > 0.5), ts.findIndex((t) => t > ts[ts.length - 1]! - 0.5)]
    const [ui, uf] = centro(uniformes)
    const [vi, vf] = centro(variables)
    expect(maxDif(yu!, uniformes.map((t) => esperada(t, fs, 6)), ui, uf)).toBeLessThan(0.05)
    expect(maxDif(yv!, variables.map((t) => esperada(t, fs, 6)), vi, vf)).toBeLessThan(0.3)
    // …y entre sí, en los tiempos del vídeo variable (la uniforme llevada con spline).
    const deUniforme = splineNatural(uniformes, yu!)
    expect(maxDif(yv!, variables.map(deUniforme), vi, vf)).toBeLessThan(0.3)
    // En los bordes, del orden de lo que se deforma la señal equiespaciada.
    expect(maxDif(yv!, variables.map(deUniforme))).toBeLessThan(1.5)
  })

  it('con muestras ya equiespaciadas, el resultado es el del filtro sin remuestrear', () => {
    const ts = rango(60, (i) => i / 30)
    const [y] = filtrarTramo(ts, [ts.map(senal)], 30, 6)
    expect(maxDif(y!, filtrarEquiespaciado(ts.map(senal), 30, 6))).toBeLessThan(1e-9)
  })

  it('nunca filtra a través de un hueco: cada tramo sale como si estuviera solo', () => {
    const tiempos = tiemposVariables(100, 11)
    // Antes del hueco la señal; después, la señal desplazada 200 px (un salto
    // que, filtrado a través del hueco, se notaría a ambos lados).
    const serie: (Muestra2D | undefined)[] = tiempos.map((t, i) =>
      i >= 40 && i < 52 ? undefined : muestra(t, senal(t) + (i >= 52 ? 200 : 0), -senal(t)),
    )
    const f = filtrarTrayectoria(serie, 30, { corteHz: 6 })
    expect(f.tramos.map((t) => [t.primero, t.ultimo, t.corto])).toEqual([
      [0, 39, false],
      [52, 99, false],
    ])
    for (let i = 40; i < 52; i++) expect(f.posiciones[i]).toBeUndefined()
    const soloAntes = filtrarTrayectoria(serie.slice(0, 40), 30, { corteHz: 6 })
    for (let i = 0; i < 40; i++) expect(f.posiciones[i]!.x).toBe(soloAntes.posiciones[i]!.x)
    // Y lejos de los bordes de cada tramo, igual que la señal equiespaciada.
    for (const i of [15, 20, 25, 70, 75, 80]) {
      const t = tiempos[i]!
      expect(f.posiciones[i]!.x - (i >= 52 ? 200 : 0)).toBeCloseTo(esperada(t, 30, 6), 0)
      expect(f.posiciones[i]!.y).toBeCloseTo(-esperada(t, 30, 6), 0)
    }
  })

  it('un salto en el tiempo dentro de lo seguido corta el tramo: ni el filtro ni la derivada lo cruzan', () => {
    // 30 fps; el móvil se salta 0,5 s tras el frame 39 y, mientras, el marcador
    // pasa de 100 a 300 px. Quieto a cada lado: lo correcto es 100 y 300 exactos y velocidad 0.
    const tiempos = rango(80, (i) => (i < 40 ? i : i + 15) / 30)
    const serie = tiempos.map((t, i) => muestra(t, i < 40 ? 100 : 300, 50))
    const f = filtrarTrayectoria(serie, 30, { corteHz: 6 })
    expect(f.tramos.map((t) => [t.primero, t.ultimo, t.corto])).toEqual([
      [0, 39, false],
      [40, 79, false],
    ])
    for (let i = 0; i < 80; i++) expect(f.posiciones[i]!.x).toBeCloseTo(i < 40 ? 100 : 300, 6)
    const v = velocidadMarcador(f)
    // Sin derivada en los bordes del salto (NaN, nunca 0), y 0 dentro de cada tramo.
    expect(Number.isNaN(v.vx[39]!)).toBe(true)
    expect(Number.isNaN(v.vx[40]!)).toBe(true)
    for (const i of [5, 38, 41, 75]) expect(v.vx[i]).toBeCloseTo(0, 6)
  })

  it('un frame saltado (dos pasos) no corta el tramo; tres pasos, sí', () => {
    expect(SALTO_MAX_PASOS).toBe(2.5)
    const conSalto = (pasos: number) => rango(30, (i) => (i < 15 ? i : i + pasos - 1) / 30)
    const serie = (ts: number[]) => ts.map((t) => muestra(t, 1, 1))
    expect(tramosUtiles(serie(conSalto(2)), SALTO_MAX_PASOS / 30)).toHaveLength(1)
    expect(tramosUtiles(serie(conSalto(3)), SALTO_MAX_PASOS / 30).map((t) => [t.primero, t.ultimo])).toEqual([
      [0, 14],
      [15, 29],
    ])
    // Sin límite (por defecto), solo cortan los huecos.
    expect(tramosUtiles(serie(conSalto(3)))).toHaveLength(1)
  })

  it('un perdido o una calidad baja cortan el tramo; lo marcado a mano y lo interpolado entran y siguen marcados', () => {
    const ts = rango(40, (i) => i / 30)
    const serie: (Muestra2D | undefined)[] = ts.map((t) => muestra(t, 10 * t))
    serie[5] = muestra(ts[5]!, NaN, NaN, { calidad: 0 })
    serie[20] = muestra(ts[20]!, 10 * ts[20]!, 0, { calidad: 0.4 })
    serie[25] = muestra(ts[25]!, 10 * ts[25]!, 0, { editadoManual: true })
    serie[30] = muestra(ts[30]!, 10 * ts[30]!, 0, { interpolado: true })
    const f = filtrarTrayectoria(serie, 30)
    expect(f.tramos.map((t) => [t.primero, t.ultimo, t.corto])).toEqual([
      [0, 4, true],
      [6, 19, false],
      [21, 39, false],
    ])
    expect(f.posiciones[25]).toMatchObject({ editadoManual: true, interpolado: false })
    expect(f.posiciones[30]).toMatchObject({ editadoManual: false, interpolado: true })
    // Una recta pasa sin cambios, también en un tramo corto.
    expect(f.posiciones[2]!.x).toBeCloseTo(10 * ts[2]!, 2)
    const ms = comoMuestras(f)
    expect(ms).toHaveLength(38)
    expect(ms.every((m) => m.calidad === 1)).toBe(true)
  })

  it('tramo corto: por debajo de MUESTRAS_MINIMAS se filtra, pero queda marcado', () => {
    expect(MUESTRAS_MINIMAS).toBe(10)
    const corto = rango(MUESTRAS_MINIMAS - 1, (i) => muestra(i / 30, senal(i / 30)))
    const largo = rango(MUESTRAS_MINIMAS, (i) => muestra(i / 30, senal(i / 30)))
    expect(tramosUtiles(corto)[0]!.corto).toBe(true)
    expect(tramosUtiles(largo)[0]!.corto).toBe(false)
    const f = filtrarTrayectoria(corto, 30)
    expect(f.posiciones.every((p) => p?.corto && Number.isFinite(p.x))).toBe(true)
    // Una muestra suelta se queda como está.
    const suelta = filtrarTrayectoria([undefined, muestra(0.1, 5, 6), undefined], 30)
    expect(suelta.posiciones[1]).toMatchObject({ x: 5, y: 6, corto: true })
  })

  it('el corte que no permiten los fps se limita (15 Hz a 30 fps)', () => {
    const ts = rango(60, (i) => i / 30)
    const [y] = filtrarTramo(ts, [ts.map(senal)], 30, 15)
    expect(y!.every(Number.isFinite)).toBe(true)
  })
})

describe('ajustes del filtro', () => {
  it('valida el corte entre 2 y 15 Hz', () => {
    expect(esAjustesFiltro({ corteHz: 6 })).toBe(true)
    expect(esAjustesFiltro({ corteHz: 2 })).toBe(true)
    expect(esAjustesFiltro({ corteHz: 15 })).toBe(true)
    for (const v of [null, 6, { corteHz: 1.5 }, { corteHz: 16 }, { corteHz: NaN }, { corteHz: '6' }, { corteHz: 6, otro: 1 }]) {
      expect(esAjustesFiltro(v)).toBe(false)
    }
  })
})
