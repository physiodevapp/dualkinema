import { describe, expect, it } from 'vitest'
import type { Muestra2D } from '../modelo/tipos'
import { asignarLadosFrontal, CALIDAD_LADO_DUDOSO, cambiosDeLado, corregirCambiosDeLado, corregirLados, VUELTA_MAX_S } from './cambiosLado'
import { idPose, PUNTOS_POSE } from './puntos'

const m = (x: number, y: number, calidad = 0.9): Muestra2D => ({ t: 0, x, y, calidad, editadoManual: false })

/** Dos piernas de perfil: la izquierda en x = 100 y la derecha en x = 200 (rodilla en y = 300, tobillo en y = 500). */
function piernas(n: number, cruzadas: Set<number>, xIzq = 100, xDer = 200) {
  const r = new Map<string, (Muestra2D | undefined)[]>()
  for (const parte of ['rodilla', 'tobillo'] as const) {
    const y = parte === 'rodilla' ? 300 : 500
    r.set(idPose(parte, 'izq'), Array.from({ length: n }, (_, i) => m(cruzadas.has(i) ? xDer : xIzq, y)))
    r.set(idPose(parte, 'der'), Array.from({ length: n }, (_, i) => m(cruzadas.has(i) ? xIzq : xDer, y)))
  }
  return r
}

describe('cambiosDeLado', () => {
  it('sin intercambios no detecta nada', () => {
    expect(cambiosDeLado(piernas(10, new Set()), 20)).toEqual([])
  })

  it('un tramo con las piernas intercambiadas: al entrar y al salir', () => {
    expect(cambiosDeLado(piernas(10, new Set([4, 5, 6])), 20)).toEqual([4, 7])
  })

  it('con las piernas una sobre otra, intercambiarlas no cuenta', () => {
    expect(cambiosDeLado(piernas(10, new Set([4, 5]), 150, 152), 20)).toEqual([])
  })

  it('si falta un punto en alguno de los dos frames, no se compara', () => {
    const tr = piernas(10, new Set([4]))
    tr.get(idPose('tobillo', 'der'))![4] = m(NaN, NaN, 0)
    expect(cambiosDeLado(tr, 20)).toEqual([])
  })

  it('la pierna lejana con poca visibilidad también cuenta (calidad > 0)', () => {
    const tr = piernas(10, new Set([3]))
    tr.set(
      idPose('rodilla', 'izq'),
      tr.get(idPose('rodilla', 'izq'))!.map((s) => s && { ...s, calidad: 0.1 }),
    )
    expect(cambiosDeLado(tr, 20)).toEqual([3, 4])
  })
})

/**
 * Los 12 puntos de perfil a 30 fps: la izquierda de la persona en x = 100 y la derecha en x = 200, cada parte a su
 * altura; en los frames de `cruzadas` el modelo los da intercambiados, y en los de `sinPersona` no ve a nadie.
 */
function cuerpo(n: number, cruzadas: Set<number>, sinPersona = new Set<number>()) {
  const Y = { hombro: 100, cadera: 250, rodilla: 400, tobillo: 550, talon: 570, punta: 580 }
  const r = new Map<string, (Muestra2D | undefined)[]>()
  for (const p of PUNTOS_POSE) {
    r.set(
      p.id,
      Array.from({ length: n }, (_, i) => {
        if (sinPersona.has(i)) return { t: i / 30, x: NaN, y: NaN, calidad: 0, editadoManual: false }
        const izq = (p.lado === 'izq') !== cruzadas.has(i)
        return { t: i / 30, x: izq ? 100 : 200, y: Y[p.parte], calidad: izq ? 0.4 : 0.95, editadoManual: false }
      }),
    )
  }
  return r
}
const tiempos = (n: number) => Array.from({ length: n }, (_, i) => i / 30)
const xDe = (s: Map<string, (Muestra2D | undefined)[]>, id: string) => s.get(id)!.map((m) => m?.x)
const rango = (desde: number, hasta: number) => new Set(Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k))

describe('corregirCambiosDeLado (de perfil)', () => {
  it('un intercambio que vuelve enseguida se deshace en los 12 puntos', () => {
    const entrada = cuerpo(30, rango(10, 14))
    const r = corregirCambiosDeLado(entrada, tiempos(30), 20)
    expect(r.intercambiados).toEqual([{ desde: 10, hasta: 14 }])
    expect(r.dudosos).toEqual([])
    for (const p of PUNTOS_POSE) {
      expect(xDe(r.series, p.id)).toEqual(new Array(30).fill(p.lado === 'izq' ? 100 : 200))
      // La calidad viaja con su punto: la pierna de la cámara (derecha) vuelve a ser la de 0,95.
      expect(r.series.get(p.id)![12]!.calidad).toBe(p.lado === 'der' ? 0.95 : 0.4)
    }
    // La entrada no se toca.
    expect(entrada.get(idPose('rodilla', 'izq'))![12]!.x).toBe(200)
  })

  it(`uno que tarda más de ${VUELTA_MAX_S} s en volver no se toca: las piernas de en medio quedan dudosas`, () => {
    const r = corregirCambiosDeLado(cuerpo(60, rango(10, 29)), tiempos(60), 20)
    expect(r.intercambiados).toEqual([])
    expect(r.dudosos).toEqual([{ desde: 10, hasta: 29 }])
    // En medio, la etiqueta izquierda lleva la pierna de la cámara (0,95): baja a dudosa, con su posición.
    const rodilla = r.series.get(idPose('rodilla', 'izq'))!
    expect(rodilla[9]!.calidad).toBe(0.4)
    expect(rodilla[10]!.calidad).toBe(CALIDAD_LADO_DUDOSO)
    expect(rodilla[10]!.x).toBe(200)
    expect(rodilla[29]!.calidad).toBe(CALIDAD_LADO_DUDOSO)
    expect(r.series.get(idPose('rodilla', 'der'))![30]!.calidad).toBe(0.95)
    expect(r.series.get(idPose('punta', 'izq'))![20]!.calidad).toBe(CALIDAD_LADO_DUDOSO)
    // Caderas y hombros no se tocan.
    expect(r.series.get(idPose('cadera', 'izq'))![15]!.calidad).toBe(0.95)
    expect(r.series.get(idPose('hombro', 'izq'))![15]!.calidad).toBe(0.95)
  })

  it('uno que no vuelve antes de perder a la persona deja dudoso hasta ahí, y después empieza de nuevo', () => {
    const r = corregirCambiosDeLado(cuerpo(40, rango(10, 19), rango(20, 22)), tiempos(40), 20)
    expect(r.intercambiados).toEqual([])
    expect(r.dudosos).toEqual([{ desde: 10, hasta: 19 }])
    expect(r.series.get(idPose('tobillo', 'der'))![25]!.calidad).toBe(0.95)
  })

  it('uno que no vuelve hasta el final deja dudoso hasta el final', () => {
    const r = corregirCambiosDeLado(cuerpo(20, rango(15, 19)), tiempos(20), 20)
    expect(r.dudosos).toEqual([{ desde: 15, hasta: 19 }])
  })

  it('dos intercambios cortos se corrigen por separado', () => {
    const r = corregirCambiosDeLado(cuerpo(60, new Set([...rango(5, 7), ...rango(40, 41)])), tiempos(60), 20)
    expect(r.intercambiados).toEqual([{ desde: 5, hasta: 7 }, { desde: 40, hasta: 41 }])
    expect(xDe(r.series, idPose('tobillo', 'izq'))).toEqual(new Array(60).fill(100))
  })

  it('lo marcado a mano no se vuelve dudoso', () => {
    const entrada = cuerpo(60, rango(10, 29))
    entrada.get(idPose('rodilla', 'der'))![12] = { t: 12 / 30, x: 150, y: 400, calidad: 1, editadoManual: true }
    const r = corregirCambiosDeLado(entrada, tiempos(60), 20)
    expect(r.series.get(idPose('rodilla', 'der'))![12]!.calidad).toBe(1)
  })

  it('sin intercambios no cambia nada', () => {
    const entrada = cuerpo(20, new Set())
    const r = corregirCambiosDeLado(entrada, tiempos(20), 20)
    expect(r.intercambiados).toEqual([])
    expect(r.dudosos).toEqual([])
    expect([...r.series]).toEqual([...entrada])
  })
})

describe('asignarLadosFrontal (de frente)', () => {
  /** Caderas a ±50 px del centro (640): `izqDerecha` = la cadera izquierda de la persona a la derecha de la imagen. */
  function frontal(n: number, izqDerecha: (i: number) => boolean) {
    const r = new Map<string, (Muestra2D | undefined)[]>()
    for (const p of PUNTOS_POSE) {
      r.set(
        p.id,
        Array.from({ length: n }, (_, i) => {
          const signo = (p.lado === 'izq') === izqDerecha(i) ? 1 : -1
          return { t: i / 30, x: 640 + signo * (p.parte === 'hombro' ? 80 : 50), y: 300, calidad: 0.9, editadoManual: false }
        }),
      )
    }
    return r
  }

  it('con la cámara delante, la izquierda de la persona va a la derecha de la imagen', () => {
    const r = asignarLadosFrontal(frontal(10, (i) => i < 3 || i > 6), { plano: 'frontal', ve: 'delante' }, 10)
    expect(r.intercambiados).toEqual([{ desde: 3, hasta: 6 }])
    expect(xDe(r.series, idPose('cadera', 'izq'))).toEqual(new Array(10).fill(690))
    expect(xDe(r.series, idPose('hombro', 'der'))).toEqual(new Array(10).fill(560))
  })

  it('con la cámara detrás, al revés: un modelo que etiqueta como si la viera de frente se corrige entero', () => {
    const r = asignarLadosFrontal(frontal(10, () => true), { plano: 'frontal', ve: 'detras' }, 10)
    expect(r.intercambiados).toEqual([{ desde: 0, hasta: 9 }])
    expect(xDe(r.series, idPose('rodilla', 'izq'))).toEqual(new Array(10).fill(590))
  })

  it('con las caderas casi superpuestas (menos del umbral) no se decide nada', () => {
    const entrada = frontal(4, () => false)
    for (const l of ['izq', 'der'] as const) entrada.set(idPose('cadera', l), entrada.get(idPose('cadera', l))!.map((m) => m && { ...m, x: 640 + (l === 'izq' ? -3 : 3) }))
    expect(asignarLadosFrontal(entrada, { plano: 'frontal', ve: 'delante' }, 10).intercambiados).toEqual([])
  })

  it('corregirLados elige el criterio por el plano de la vista', () => {
    const entrada = frontal(10, () => false)
    expect(corregirLados(entrada, { plano: 'frontal', ve: 'delante' }, tiempos(10), 10).intercambiados).toEqual([{ desde: 0, hasta: 9 }])
    expect(corregirLados(cuerpo(30, rango(10, 12)), { plano: 'sagital', mira: 'derecha' }, tiempos(30), 20).intercambiados).toEqual([{ desde: 10, hasta: 12 }])
  })
})
