import { describe, expect, it } from 'vitest'
import { AcumuladorSensores, aEjesCamara, anguloPantalla, inclinacion, leerSensores, movimiento, verticalCamara, type Sensores, type VentanaSensores } from './sensores'

const G = 9.81
const rad = (g: number) => (g * Math.PI) / 180

/** Ventanas quietas de 60 muestras con la aceleración con gravedad `g` (ejes del aparato), de `desde` a `hasta` s. */
function quietas(g: readonly [number, number, number], desde: number, hasta: number): VentanaSensores[] {
  return Array.from({ length: hasta - desde }, (_, k) => ({ t: desde + k, n: 60, g, de: 0.02, giroMax: 0.5 }))
}
const sensores = (ventanas: VentanaSensores[], pantalla: Sensores['pantalla'] = 0): Sensores => ({ pantalla, giroPantalla: false, ventanas })

describe('aEjesCamara', () => {
  it('de pie y en vertical: arriba del aparato es arriba de la imagen (−y) y la pantalla mira hacia atrás (−z)', () => {
    expect(aEjesCamara([0, 1, 0], 0)).toMatchObject({ x: 0, y: -1, z: 0 })
    expect(aEjesCamara([1, 0, 0], 0)).toMatchObject({ x: 1, y: 0 })
    expect(aEjesCamara([0, 0, 1], 0).z).toBe(-1)
  })

  it('con la pantalla girada 90° (arriba del móvil a la izquierda): arriba del aparato es la izquierda de la imagen', () => {
    expect(aEjesCamara([0, 1, 0], 90)).toMatchObject({ x: -1, y: 0 })
    // El borde derecho del aparato queda arriba de la imagen.
    expect(aEjesCamara([1, 0, 0], 90)).toMatchObject({ x: 0, y: -1 })
  })

  it('con 270, al revés que con 90; con 180, todo invertido en el plano', () => {
    expect(aEjesCamara([0, 1, 0], 270)).toMatchObject({ x: 1, y: 0 })
    expect(aEjesCamara([0, 1, 0], 180)).toMatchObject({ x: 0, y: 1 })
  })

  it('anguloPantalla redondea y normaliza', () => {
    expect(anguloPantalla(-90)).toBe(270)
    expect(anguloPantalla(89)).toBe(90)
    expect(anguloPantalla(360)).toBe(0)
  })
})

describe('verticalCamara e inclinación', () => {
  it('móvil de pie, en vertical y sin inclinar: la gravedad va hacia abajo de la imagen; cabeceo y alabeo 0', () => {
    const v = verticalCamara(sensores(quietas([0, G, 0], 0, 5)))!
    expect(v.x).toBeCloseTo(0, 9)
    expect(v.y).toBeCloseTo(1, 9)
    expect(v.z).toBeCloseTo(0, 9)
    const i = inclinacion(v)
    expect(i.cabeceo).toBeCloseTo(0, 9)
    expect(i.alabeo).toBeCloseTo(0, 9)
  })

  it('la cámara mira 10° hacia abajo: cabeceo +10', () => {
    // Inclinar la parte de arriba del móvil hacia delante (hacia donde mira la cámara): la gravedad, en el aparato, gana
    // componente hacia la pantalla (+z hacia arriba en reposo: la reacción apunta a −z... la aceleración con gravedad
    // apunta hacia arriba del mundo, que ahora tiene componente hacia la pantalla, +z).
    const a = rad(10)
    const v = verticalCamara(sensores(quietas([0, G * Math.cos(a), G * Math.sin(a)], 0, 5)))!
    expect(inclinacion(v).cabeceo).toBeCloseTo(10, 6)
    expect(inclinacion(v).alabeo).toBeCloseTo(0, 6)
  })

  it('la imagen girada 5° (el móvil ladeado): alabeo de 5°, con su signo', () => {
    // Arriba del mundo con componente hacia la izquierda del aparato: abajo, hacia la derecha de la imagen.
    const a = rad(5)
    const v = verticalCamara(sensores(quietas([-G * Math.sin(a), G * Math.cos(a), 0], 0, 5)))!
    expect(v.x).toBeGreaterThan(0)
    expect(inclinacion(v).alabeo).toBeCloseTo(5, 6)
  })

  it('en horizontal (pantalla a 90°) y de pie: la gravedad sigue hacia abajo de la imagen', () => {
    // Arriba del móvil a la izquierda: el borde derecho del aparato apunta hacia arriba del mundo.
    const v = verticalCamara(sensores(quietas([G, 0, 0], 0, 5), 90))!
    expect(v.y).toBeCloseTo(1, 9)
    expect(inclinacion(v).alabeo).toBeCloseTo(0, 9)
  })

  it('usa las ventanas quietas de la grabación (no las de la cuenta atrás ni las sacudidas)', () => {
    const ventanas = [
      ...quietas([G, 0, 0], -5, 0), // en la mano durante la cuenta atrás, de otra manera
      ...quietas([0, G, 0], 0, 5),
      { t: 5, n: 60, g: [3, 8, 2] as const, de: 2, giroMax: 40 },
    ]
    expect(verticalCamara(sensores(ventanas))!.y).toBeCloseTo(1, 9)
  })

  it('sin ventanas, null', () => {
    expect(verticalCamara(sensores([]))).toBeNull()
  })
})

describe('movimiento', () => {
  it('apoyado y quieto: no se ha movido', () => {
    expect(movimiento(sensores(quietas([0, G, 0], 0, 20)))).toBeNull()
  })

  it('una sacudida o un giro: se ha movido, con el instante', () => {
    const v = quietas([0, G, 0], 0, 10)
    v[4] = { ...v[4]!, de: 1.2 }
    v[7] = { ...v[7]!, giroMax: 25 }
    expect(movimiento(sensores(v))).toMatchObject({ motivos: ['sacudidas'], instantes: [4, 7] })
  })

  it('la vertical cambia 2° entre el principio y el final (resbaló despacio): se ha movido', () => {
    const a = rad(2)
    const v = [...quietas([0, G, 0], 0, 5), ...quietas([0, G * Math.cos(a), G * Math.sin(a)], 5, 10)]
    const m = movimiento(sensores(v))!
    expect(m.motivos).toEqual(['vertical'])
    expect(m.cambioVertical).toBeCloseTo(2, 6)
  })

  it('lo de la cuenta atrás no cuenta', () => {
    const v = [{ t: -3, n: 60, g: [1, 9, 3] as const, de: 3, giroMax: 90 }, ...quietas([0, G, 0], 0, 10)]
    expect(movimiento(sensores(v))).toBeNull()
  })

  it('la pantalla que gira cuenta como movido', () => {
    expect(movimiento({ ...sensores(quietas([0, G, 0], 0, 5)), giroPantalla: true })!.motivos).toEqual(['pantalla'])
  })
})

describe('AcumuladorSensores', () => {
  it('junta las muestras en ventanas de 1 s desde el origen, con su media, dispersión y giro máximo', () => {
    const ac = new AcumuladorSensores()
    ac.pantalla(0)
    // Desde 1,5 s antes del origen (la cuenta atrás) hasta 2 s después, a 60 Hz; el origen se fija después.
    for (let k = 0; k < 210; k++) {
      const t = 8500 + k * (1000 / 60)
      ac.anadir(t, 0, G + (k % 2 ? 0.1 : -0.1), 0, { alpha: 1, beta: 0, gamma: k === 100 ? 20 : 0 })
    }
    ac.fijarOrigen(10_000)
    const r = ac.resumen()!
    expect(r.ventanas.map((v) => v.t)).toEqual([-2, -1, 0, 1])
    const w = r.ventanas[2]!
    expect(w.n).toBe(60)
    expect(w.g[1]).toBeCloseTo(G, 2)
    expect(w.de).toBeCloseTo(0.1, 2)
    expect(r.ventanas.map((v) => v.giroMax)).toEqual([1, 1, 20, 1])
    expect(r.pantalla).toBe(0)
    expect(r.giroPantalla).toBe(false)
  })

  it('sin giróscopo, giroMax null; un giro de pantalla se anota', () => {
    const ac = new AcumuladorSensores(0)
    ac.pantalla(90)
    ac.anadir(10, 0, G, 0, null)
    ac.pantalla(0)
    const r = ac.resumen()!
    expect(r.ventanas[0]!.giroMax).toBeNull()
    expect(r.pantalla).toBe(90)
    expect(r.giroPantalla).toBe(true)
  })

  it('el resumen se puede acotar (lo de antes de la cuenta atrás no interesa) y sin muestras es null', () => {
    const ac = new AcumuladorSensores(0)
    for (let t = -20_000; t < 3000; t += 100) ac.anadir(t, 0, G, 0, null)
    expect(ac.resumen(-5)!.ventanas[0]!.t).toBe(-6)
    expect(new AcumuladorSensores().resumen()).toBeNull()
  })

  it('se lee lo que se escribe; lo roto, null', () => {
    const ac = new AcumuladorSensores(0)
    ac.anadir(10, 0.1, G, 0.2, { alpha: 0, beta: 1, gamma: 0 })
    const r = ac.resumen()!
    expect(leerSensores(JSON.parse(JSON.stringify(r)))).toEqual(r)
    expect(leerSensores({ pantalla: 45, giroPantalla: false, ventanas: [] })).toBeNull()
    expect(leerSensores({ pantalla: 0, ventanas: [{ t: 0, n: 1, g: [0, 1], de: 0, giroMax: null }] })).toBeNull()
  })
})
