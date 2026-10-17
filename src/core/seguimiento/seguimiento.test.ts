import { describe, expect, it } from 'vitest'
import { serieAngular } from '../articulaciones/calculo'
import { modeloRodilla3, marcadores } from '../articulaciones/catalogo'
import type { Muestra2D } from '../modelo/tipos'
import { aprenderColor, rgbAHsv } from './color'
import { buscarManchas } from './manchas'
import { MAX_PERDIDOS, SeguidorMultiple } from './multiple'
import { aprenderMarcador, CALIDAD_PERDIDO, ErrorMarcado, seguir, type EstadoMarcador } from './seguidor'
import { AZUL, dibujarFrame, lector, VERDE, type Disco } from './sintetico'

const W = 320
const H = 240

describe('buscarManchas', () => {
  it('encuentra el centro de un gomet con precisión subpíxel', () => {
    const img = dibujarFrame(W, H, [{ x: 100.3, y: 80.7, r: 8, rgb: VERDE }])
    const modelo = aprenderColor([rgbAHsv(...VERDE)])
    const ms = buscarManchas(img, modelo)
    expect(ms).toHaveLength(1)
    expect(Math.abs(ms[0]!.x - 100.3)).toBeLessThan(0.15)
    expect(Math.abs(ms[0]!.y - 80.7)).toBeLessThan(0.15)
    expect(ms[0]!.area).toBeGreaterThan(Math.PI * 7 * 7)
  })

  it('separa dos gomets del mismo color', () => {
    const img = dibujarFrame(W, H, [
      { x: 60, y: 60, r: 7, rgb: VERDE },
      { x: 200, y: 150, r: 7, rgb: VERDE },
    ])
    expect(buscarManchas(img, aprenderColor([rgbAHsv(...VERDE)]))).toHaveLength(2)
  })

  it('no confunde el fondo (tono piel) con un gomet verde', () => {
    const img = dibujarFrame(W, H, [])
    expect(buscarManchas(img, aprenderColor([rgbAHsv(...VERDE)]))).toHaveLength(0)
  })
})

describe('aprenderMarcador', () => {
  const img = dibujarFrame(W, H, [{ x: 150.4, y: 120.6, r: 9, rgb: AZUL }])

  it('lleva el marcador al centro del gomet aunque el toque no sea exacto', () => {
    const r = aprenderMarcador(lector(img), W, H, 0, 154, 117)
    expect(r.x).toBeCloseTo(150.4, 0)
    expect(Math.hypot(r.x - 150.4, r.y - 120.6)).toBeLessThan(0.3)
    expect(r.estado.area).toBeGreaterThan(200)
  })

  it('avisa si el toque no cae sobre un gomet', () => {
    expect(() => aprenderMarcador(lector(img), W, H, 0, 40, 40)).toThrow(ErrorMarcado)
  })

  it('avisa si la zona de ese color es demasiado grande para ser un gomet', () => {
    const grande = dibujarFrame(W, H, [{ x: 150, y: 120, r: 80, rgb: AZUL }])
    expect(() => aprenderMarcador(lector(grande), W, H, 0, 150, 120)).toThrow(/demasiado grande/)
  })
})

/** Sigue un gomet a lo largo de frames generados por `pos(t)`. */
function recorrido(
  tiempos: readonly number[],
  discos: (t: number) => Disco[],
  opciones: (t: number) => Parameters<typeof dibujarFrame>[3] = () => ({}),
) {
  const t0 = tiempos[0]!
  const d0 = discos(t0)[0]!
  let estado: EstadoMarcador = aprenderMarcador(lector(dibujarFrame(W, H, discos(t0), opciones(t0))), W, H, t0, d0.x, d0.y).estado
  return tiempos.slice(1).map((t, i) => {
    const r = seguir(estado, lector(dibujarFrame(W, H, discos(t), { semilla: i + 2, ...opciones(t) })), W, H, t)
    estado = r.estado
    const real = discos(t)[0]
    return { t, r, real }
  })
}

// Tiempos con fps variable: 30 fps con algún frame perdido (66 ms).
const TIEMPOS = Array.from({ length: 60 }, (_, i) => i / 30 + (i > 20 ? 1 / 30 : 0) + (i > 40 ? 1 / 30 : 0))

describe('seguir', () => {
  it('sigue un gomet en movimiento con error subpíxel y fps variable', () => {
    const pos = (t: number): Disco[] => [{ x: 160 + 90 * Math.sin(2 * t), y: 120 + 50 * Math.sin(3 * t), r: 8, rgb: VERDE }]
    const res = recorrido(TIEMPOS, pos)
    for (const { r, real } of res) {
      expect(r.calidad).toBeGreaterThan(0.6)
      expect(Math.hypot(r.x - real!.x, r.y - real!.y)).toBeLessThan(0.5)
    }
  })

  it('no salta a otro gomet del mismo color que está lejos', () => {
    const pos = (t: number): Disco[] => [
      { x: 80 + 40 * t, y: 120, r: 8, rgb: VERDE },
      { x: 260, y: 60 + 20 * t, r: 8, rgb: VERDE },
    ]
    for (const { r, real } of recorrido(TIEMPOS, pos)) expect(Math.hypot(r.x - real!.x, r.y - real!.y)).toBeLessThan(0.5)
  })

  it('aguanta un cambio de luz progresivo (el gomet se oscurece un 40 %)', () => {
    const pos = (): Disco[] => [{ x: 160, y: 120, r: 8, rgb: VERDE }]
    const res = recorrido(TIEMPOS, pos, (t) => ({ brillo: 1 - 0.4 * (t / 2.1) }))
    for (const { r } of res) expect(r.calidad).toBeGreaterThan(CALIDAD_PERDIDO)
  })

  it('si el gomet desaparece da NaN y calidad 0 (no inventa) y lo recupera al volver', () => {
    const oculto = (t: number) => t > 0.5 && t < 0.6
    const pos = (t: number): Disco[] => (oculto(t) ? [] : [{ x: 100 + 60 * t, y: 120, r: 8, rgb: VERDE }])
    const res = recorrido(TIEMPOS, (t) => (pos(t).length ? pos(t) : [{ x: -100, y: -100, r: 1, rgb: VERDE }]))
    const durante = res.filter(({ t }) => oculto(t))
    expect(durante.length).toBeGreaterThan(0)
    for (const { r } of durante) {
      expect(r.x).toBeNaN()
      expect(r.calidad).toBe(0)
    }
    const despues = res.filter(({ t }) => t >= 0.7)
    for (const { r, real } of despues) expect(Math.hypot(r.x - real!.x, r.y - real!.y)).toBeLessThan(0.5)
  })
})

describe('SeguidorMultiple', () => {
  it('rodilla sintética: 3 gomets seguidos dan el ángulo real con error < 1°', () => {
    const l = 'izq' as const
    const m = marcadores(l)
    // Persona mirando a la derecha (se ve su lado izquierdo). Flexión 0 → 90° → 0.
    const flexion = (t: number) => 45 * (1 - Math.cos(Math.PI * t))
    const discos = (t: number): Disco[] => {
      const k = (flexion(t) * Math.PI) / 180
      const cadera = { x: 160, y: 30 }
      const rodilla = { x: 160 + 100 * Math.sin(0.2), y: 30 + 100 * Math.cos(0.2) }
      // Pierna: gira hacia atrás (izquierda de la imagen) al flexionar.
      const tobillo = { x: rodilla.x - 95 * Math.sin(k - 0.2), y: rodilla.y + 95 * Math.cos(k - 0.2) }
      return [cadera, rodilla, tobillo].map((p) => ({ ...p, r: 6, rgb: VERDE }))
    }
    const ids = [m.cadera, m.rodilla, m.tobillo]
    const tiempos = TIEMPOS.filter((t) => t <= 2)
    const primero = dibujarFrame(W, H, discos(0))
    const iniciales = new Map(ids.map((id, i) => [id, aprenderMarcador(lector(primero), W, H, 0, discos(0)[i]!.x, discos(0)[i]!.y).estado]))
    const seguidor = new SeguidorMultiple(iniciales, W, H)

    const trayectorias: Record<string, Muestra2D[]> = Object.fromEntries(ids.map((id) => [id, []]))
    const real: number[] = []
    for (const [i, t] of tiempos.entries()) {
      const res = seguidor.procesar(t, lector(dibujarFrame(W, H, discos(t), { semilla: i + 10 })))
      for (const [id, r] of res) trayectorias[id]!.push({ t, x: r.x, y: r.y, calidad: r.calidad, editadoManual: false })
      // Ángulo real a partir de los centros exactos.
      const [c, ro, to] = discos(t)
      const muslo = Math.atan2(ro!.x - c!.x, ro!.y - c!.y)
      const pierna = Math.atan2(to!.x - ro!.x, to!.y - ro!.y)
      real.push(((muslo - pierna) * 180) / Math.PI)
    }
    expect(seguidor.perdidos()).toEqual([])

    const def = modeloRodilla3(l).articulaciones[0]!
    const serie = serieAngular(def, trayectorias, { plano: 'sagital', mira: 'derecha' })
    let peor = 0
    serie.forEach((s, i) => (peor = Math.max(peor, Math.abs(s.valor - real[i]!))))
    expect(peor).toBeLessThan(1)
    expect(Math.max(...serie.map((s) => s.valor))).toBeGreaterThan(85)
  })

  it('dos gomets del mismo color que se cruzan: ni duplica, ni inventa durante el cruce, ni se intercambian', () => {
    const discos = (t: number): Disco[] => [
      { x: 100 + 100 * t, y: 120, r: 7, rgb: VERDE },
      { x: 220 - 100 * t, y: 120, r: 7, rgb: VERDE },
    ]
    const primero = dibujarFrame(W, H, discos(0))
    const iniciales = new Map([
      ['a', aprenderMarcador(lector(primero), W, H, 0, 100, 120).estado],
      ['b', aprenderMarcador(lector(primero), W, H, 0, 220, 120).estado],
    ])
    const s = new SeguidorMultiple(iniciales, W, H)
    let enCruce = 0
    for (let i = 1; i <= 36; i++) {
      const t = i / 30
      const res = s.procesar(t, lector(dibujarFrame(W, H, discos(t), { semilla: i })))
      discos(t).forEach((d, k) => {
        const r = res.get(k === 0 ? 'a' : 'b')!
        if (Number.isNaN(r.x)) {
          enCruce++
          return
        }
        // Si da una posición, es la de su propio gomet (nada de 160 en plena fusión ni intercambio).
        expect(Math.hypot(r.x - d.x, r.y - d.y)).toBeLessThan(1)
      })
    }
    expect(enCruce).toBeGreaterThan(0) // durante la fusión no hay posición fiable
    // Al final, los dos recuperados en su sitio.
    const fin = s.procesar(1.25, lector(dibujarFrame(W, H, discos(1.25), { semilla: 99 })))
    expect(fin.get('a')!.x).toBeCloseTo(225, 0)
    expect(fin.get('b')!.x).toBeCloseTo(95, 0)
  })

  it('avisa cuando un marcador lleva MAX_PERDIDOS frames sin aparecer', () => {
    const primero = dibujarFrame(W, H, [{ x: 100, y: 100, r: 7, rgb: VERDE }])
    const s = new SeguidorMultiple(new Map([['a', aprenderMarcador(lector(primero), W, H, 0, 100, 100).estado]]), W, H)
    for (let i = 1; i <= MAX_PERDIDOS; i++) s.procesar(i / 30, lector(dibujarFrame(W, H, [], { semilla: i })))
    expect(s.perdidos()).toEqual(['a'])
  })
})
