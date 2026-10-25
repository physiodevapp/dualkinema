import { describe, expect, it } from 'vitest'
import type { VelocidadMarcador } from '../filtros/derivadas'
import type { PosicionFiltrada, TrayectoriaFiltrada } from '../filtros/tramos'
import type { Muestra2D } from '../modelo/tipos'
import { angulosPorFrame, construirCsv, nombreArchivoCsv, type DatosExportacion } from './csv'

const BOM = String.fromCharCode(0xfeff)
const tiempos = [0, 0.1, 0.2, 0.3]
const NaNs = () => new Float64Array(4).fill(NaN)

const crudo: (Muestra2D | undefined)[] = [
  { t: 0, x: 100, y: 200, calidad: 1, editadoManual: false },
  { t: 0.1, x: 101.5, y: 201.25, calidad: 0.8, editadoManual: true },
  { t: 0.2, x: NaN, y: NaN, calidad: 0, editadoManual: false }, // perdido
  undefined, // sin muestra
]
const pos = (t: number, x: number, y: number): PosicionFiltrada => ({ t, x, y, corto: false, interpolado: false, editadoManual: false })
const filtrado: TrayectoriaFiltrada = {
  posiciones: [pos(0, 100, 200), pos(0.1, 101, 201), undefined, undefined],
  tramos: [],
  rejillas: [],
}
const velocidad = (unidad: 'px/s' | 'm/s'): VelocidadMarcador => {
  const modulo = NaNs()
  modulo[1] = 12.34567
  return { vx: NaNs(), vy: NaNs(), modulo, unidad }
}

function datos(conEscala: boolean): DatosExportacion {
  return {
    tiempos,
    marcadores: [{ id: 'rodilla', nombre: 'Rodilla', crudo, filtrado, velocidad: velocidad(conEscala ? 'm/s' : 'px/s') }],
    angulo: {
      id: 'rodilla-sagital',
      nombre: 'Rodilla (flexión)',
      positivo: 'flexión',
      negativo: 'extensión',
      crudo: [10, 20, NaN, NaN],
      filtrado: [11, 21, NaN, NaN],
      relativo: [1, 11, NaN, NaN],
      velocidad: NaNs(),
      aceleracion: NaNs(),
      cero: { tramo: { desde: 0, hasta: 0.1 }, media: 10, desviacion: 0.5, muestras: 2 },
    },
    calibracion: conEscala
      ? { tipo: 'escala-plano', objeto: 'cinta', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, longitudM: 1, t: 0 }
      : null,
    meta: {
      archivo: 'sentadilla.mp4', ancho: 720, alto: 1280, rotacion: 90, duracionS: 0.3, fpsMedio: 10, fpsVariable: false,
      orientacion: { plano: 'sagital', mira: 'derecha' }, corteHz: 6, corteEfectivoHz: 4, exportado: '2026-10-18T10:00:00.000Z',
    },
  }
}

const filas = (csv: string) => csv.replace(BOM, '').split('\r\n').filter((l) => l !== '')
const cuerpo = (csv: string) => filas(csv).filter((l) => !l.startsWith('#')).slice(1)

describe('construirCsv', () => {
  it('formato es: empieza con BOM; internacional: sin BOM, la primera línea empieza por #', () => {
    expect(construirCsv(datos(false), 'internacional').startsWith('# dualkinema')).toBe(true)
  })

  it('empieza con BOM, cabecera con # y una fila por frame', () => {
    const csv = construirCsv(datos(false))
    expect(csv.startsWith(BOM + '# dualkinema')).toBe(true)
    expect(cuerpo(csv)).toHaveLength(4)
    expect(filas(csv).some((l) => l.startsWith('# archivo;sentadilla.mp4'))).toBe(true)
  })

  it('formato español: «;» y coma decimal; sin valor = celda vacía, nunca 0', () => {
    const [f0, f1, f2, f3] = cuerpo(construirCsv(datos(false)))
    expect(f0!.split(';')).toEqual(['0,000000', '1', '100,000', '200,000', '1,00', '0', '0', '100,000', '200,000', '', '10,000', '11,000', '1,000', '', ''])
    expect(f1!.split(';')[2]).toBe('101,500')
    expect(f1!.split(';')[5]).toBe('1') // editado a mano
    expect(f1!.split(';')[9]).toBe('12,3457')
    // perdido: calidad 0 visible, posición vacía
    expect(f2!.split(';').slice(2, 7)).toEqual(['', '', '0,00', '0', '0'])
    // sin muestra: todo vacío salvo t y frame
    expect(f3!.split(';').slice(2).every((c) => c === '')).toBe(true)
  })

  it('formato internacional: «,» y punto decimal', () => {
    const f1 = cuerpo(construirCsv(datos(false), 'internacional'))[1]!
    expect(f1.split(',')[2]).toBe('101.500')
  })

  it('con escala: posición filtrada en m, velocidad en m/s y la calibración en la cabecera', () => {
    const csv = construirCsv(datos(true))
    const cols = filas(csv).find((l) => !l.startsWith('#'))!.split(';')
    expect(cols).toContain('rodilla_filtrado_x_m')
    expect(cols).toContain('rodilla_velocidad_m_s')
    const f0 = cuerpo(csv)[0]!.split(';')
    // 1 m / 100 px = 0,01 m/px
    expect(f0[cols.indexOf('rodilla_filtrado_x_m')]).toBe('1,000000')
    expect(f0[cols.indexOf('rodilla_filtrado_y_m')]).toBe('2,000000')
    const cab = filas(csv).filter((l) => l.startsWith('# escala'))
    expect(cab.find((l) => l.startsWith('# escala;'))).toContain('cinta, 1,0000 m = 100,00 px; 10,0000 mm/px')
    expect(cab.length).toBe(4)
  })

  it('sin escala: columnas en px, sin columnas en metros, y se dice en la cabecera', () => {
    const csv = construirCsv(datos(false))
    const cols = filas(csv).find((l) => !l.startsWith('#'))!
    expect(cols).toContain('rodilla_velocidad_px_s')
    expect(cols).not.toContain('_x_m')
    expect(csv).toContain('# escala;sin escala')
  })

  it('cabecera: filtro, vista y cero de referencia', () => {
    const csv = construirCsv(datos(false))
    expect(csv).toContain('corte pedido 6,0 Hz, aplicado 4,0 Hz')
    expect(csv).toContain('# vista;sagital, la persona mira a la derecha')
    expect(csv).toContain('media 10,000 grados')
  })

  it('en internacional las celdas con comas de la cabecera van entre comillas', () => {
    const csv = construirCsv(datos(false), 'internacional')
    expect(csv).toContain('# vista,"sagital, la persona mira a la derecha"')
  })

  it('sin cero la columna relativa queda vacía y se avisa', () => {
    const d = datos(false)
    const sinCero: DatosExportacion = { ...d, angulo: { ...d.angulo!, relativo: null, cero: null } }
    const csv = construirCsv(sinCero)
    expect(csv).toContain('# cero de referencia;ninguno')
    expect(cuerpo(csv)[0]!.split(';')[12]).toBe('')
  })

  it('articulación de otro plano: sin columnas de ángulo', () => {
    const csv = construirCsv({ ...datos(false), angulo: null })
    expect(csv).not.toContain('angulo_')
    expect(cuerpo(csv)[0]!.split(';')).toHaveLength(10)
  })
})

describe('construirCsv con varias vistas: tiempo común', () => {
  const conSincronia = (sincronia: NonNullable<DatosExportacion['sincronia']>): DatosExportacion => ({ ...datos(false), sincronia })
  const columnasDe = (csv: string) => filas(csv).find((l) => !l.startsWith('#'))!.split(';')

  it('una sola vista (sin sincronía): el archivo de siempre, sin columna de tiempo común', () => {
    const csv = construirCsv(datos(false))
    expect(columnasDe(csv).slice(0, 3)).toEqual(['t_s', 'frame', 'rodilla_x_px'])
    expect(filas(csv).some((l) => l.includes('sincronización'))).toBe(false)
  })

  it('la columna t_comun_s es t_s + desfase en cada fila, justo tras t_s', () => {
    const csv = construirCsv(conSincronia({ referencia: false, desfaseS: 0.733, sincronia: { metodo: 'evento', evento: { referencia: 1.5, vista: 0.767 } }, incertidumbreEventoS: 0.0367 }))
    expect(columnasDe(csv).slice(0, 4)).toEqual(['t_s', 't_comun_s', 'frame', 'rodilla_x_px'])
    expect(cuerpo(csv).map((f) => f.split(';').slice(0, 3))).toEqual([
      ['0,000000', '0,733000', '1'],
      ['0,100000', '0,833000', '2'],
      ['0,200000', '0,933000', '3'],
      ['0,300000', '1,033000', '4'],
    ])
    // El resto de columnas no se mueve: las celdas de la fila 0 siguen donde estaban, una más a la derecha.
    expect(cuerpo(csv)[0]!.split(';')).toHaveLength(cuerpo(construirCsv(datos(false)))[0]!.split(';').length + 1)
  })

  it('un desfase negativo da tiempo común menor que el del vídeo', () => {
    const csv = construirCsv(conSincronia({ referencia: false, desfaseS: -0.25, sincronia: { metodo: 'manual' } }))
    expect(cuerpo(csv)[0]!.split(';').slice(0, 2)).toEqual(['0,000000', '-0,250000'])
    expect(cuerpo(csv)[3]!.split(';').slice(0, 2)).toEqual(['0,300000', '0,050000'])
  })

  it('la vista de referencia: tiempo común = t_s y la cabecera lo dice', () => {
    const csv = construirCsv(conSincronia({ referencia: true, desfaseS: 0, sincronia: { metodo: 'ninguna' } }))
    expect(cuerpo(csv)[1]!.split(';').slice(0, 2)).toEqual(['0,100000', '0,100000'])
    expect(filas(csv).find((l) => l.startsWith('# sincronización'))).toContain('vista de referencia')
  })

  it('la cabecera da el desfase, el método, la precisión y los instantes del evento', () => {
    const csv = construirCsv(conSincronia({ referencia: false, desfaseS: 0.48, sincronia: { metodo: 'evento', evento: { referencia: 1, vista: 0.52 } }, incertidumbreEventoS: 0.03667 }))
    const linea = filas(csv).find((l) => l.startsWith('# sincronización'))!
    expect(linea).toContain('desfase 0,480 s')
    expect(linea).toContain('método: evento visual')
    expect(linea).toContain('±37 ms')
    expect(linea).toContain('evento en 1,000 s de la referencia y en 0,520 s de esta vista')
    expect(filas(csv).some((l) => l.startsWith('# t_comun_s'))).toBe(true)
  })

  it('sin evento ni precisión (puesta a mano) la cabecera no inventa ninguno', () => {
    const linea = filas(construirCsv(conSincronia({ referencia: false, desfaseS: 0.1, sincronia: { metodo: 'manual' } }))).find((l) => l.startsWith('# sincronización'))!
    expect(linea).toContain('método: puesta a mano')
    expect(linea).not.toContain('precisión')
    expect(linea).not.toContain('evento en')
  })

  const lineas = (x: NonNullable<DatosExportacion['sincronia']>) => filas(construirCsv(conSincronia(x)))
  const linea = (x: NonNullable<DatosExportacion['sincronia']>, clave = '# sincronización;') => lineas(x).find((l) => l.startsWith(clave))

  it('un evento ajustado a mano lo dice: el desfase ya no es la diferencia de los instantes', () => {
    const l = linea({ referencia: false, desfaseS: 0.52, sincronia: { metodo: 'evento', evento: { referencia: 1, vista: 0.52 } }, incertidumbreEventoS: 0.03667 })!
    expect(l).toContain('desfase 0,520 s')
    expect(l).toContain('evento en 1,000 s de la referencia y en 0,520 s de esta vista')
    expect(l).toContain('ajustada +40 ms a mano sobre lo que dio el método')
  })

  it('por audio: la calidad y la precisión del audio, y no hay comprobación sin evento', () => {
    const x = { referencia: false, desfaseS: 0.456, sincronia: { metodo: 'audio', audio: { calidad: 7.7, desfase: 0.456 } }, incertidumbreEventoS: 0.0333 } as const
    const l = linea(x)!
    expect(l).toContain('desfase 0,456 s')
    expect(l).toContain('método: audio')
    expect(l).toContain('calidad del pico 7,7')
    expect(l).toContain('precisión del audio ±0,5 ms (no incluye el retardo entre sonido e imagen de cada móvil)')
    expect(l).not.toContain('evento en')
    expect(l).not.toContain('ajustada')
    expect(linea(x, '# sincronización: comprobación;')).toBeUndefined()
  })

  it('por audio comprobado con un evento: el evento va aparte, como comprobación, con la diferencia', () => {
    // Audio 0,480 s; evento visual 1,040 − 0,520 = 0,520 s (±37 ms): diferencia +40 ms, discrepan. El desfase es el del audio.
    const x = {
      referencia: false,
      desfaseS: 0.48,
      sincronia: { metodo: 'audio', audio: { calidad: 9, desfase: 0.48 }, evento: { referencia: 1.04, vista: 0.52 } },
      incertidumbreEventoS: 0.03667,
    } as const
    const l = linea(x)!
    expect(l).toContain('desfase 0,480 s')
    expect(l).not.toContain('evento en')
    const c = linea(x, '# sincronización: comprobación;')!
    expect(c).toContain('con un evento visual (no da el desfase): evento en 1,040 s de la referencia y en 0,520 s de esta vista')
    expect(c).toContain('desfase por el evento 0,520 s ±37 ms')
    expect(c).toContain('diferencia con el desfase aplicado +40 ms (discrepan)')
  })

  it('la comprobación compara con el desfase aplicado, con el ajuste fino (limitación 2 de la fase 3)', () => {
    // Audio 0,480 s ajustado +33 ms a mano (0,513 s); evento 0,520 s: la diferencia es la de lo que se usa, +7 ms.
    const x = {
      referencia: false,
      desfaseS: 0.513,
      sincronia: { metodo: 'audio', audio: { calidad: 9, desfase: 0.48 }, evento: { referencia: 1.04, vista: 0.52 } },
      incertidumbreEventoS: 0.03667,
    } as const
    const c = linea(x, '# sincronización: comprobación;')!
    expect(c).toContain('diferencia con el desfase aplicado +7 ms')
    expect(c).not.toContain('discrepan')
  })

  it('por el pitido de ida y vuelta y por el reloj de una grabación doble (fase 4)', () => {
    const p = linea({ referencia: false, desfaseS: 0.009, sincronia: { metodo: 'pitido', pitido: { desfase: 0.009, calidad: 5.47, distancia: 1.98 } } })!
    expect(p).toContain('método: pitido de ida y vuelta; calidad 5,5; móviles a 1,98 m; precisión del audio ±0,1 ms')
    expect(p).toContain('no incluye el retardo entre sonido e imagen')
    const r = linea({ referencia: false, desfaseS: -0.0006, sincronia: { metodo: 'reloj', reloj: { desfase: -0.0006, cota: 0.0381 } } })!
    expect(r).toContain('método: reloj común de los dos móviles; precisión ±38 ms')
    // Un pitido comprobado con un evento visual.
    const c = linea(
      { referencia: false, desfaseS: 0.009, sincronia: { metodo: 'pitido', pitido: { desfase: 0.009, calidad: 5.47, distancia: 1.98 }, evento: { referencia: 2, vista: 1.991 } }, incertidumbreEventoS: 0.03667 },
      '# sincronización: comprobación;',
    )!
    expect(c).toContain('diferencia con el desfase aplicado +0 ms')
  })

  it('por audio ajustado a mano: lo movido se cuenta sobre lo que dio el audio', () => {
    expect(linea({ referencia: false, desfaseS: 0.4467, sincronia: { metodo: 'audio', audio: { calidad: 9, desfase: 0.48 } } })).toContain('ajustada −33 ms')
  })

  it('en internacional: punto decimal y la misma columna', () => {
    const csv = construirCsv(conSincronia({ referencia: false, desfaseS: 0.733, sincronia: { metodo: 'evento' } }), 'internacional')
    expect(csv.split('\r\n').find((l) => !l.startsWith('#'))!.split(',').slice(0, 2)).toEqual(['t_s', 't_comun_s'])
    expect(csv.split('\r\n').filter((l) => l && !l.startsWith('#'))[1]!.split(',').slice(0, 2)).toEqual(['0.000000', '0.733000'])
  })
})

describe('angulosPorFrame', () => {
  it('alinea por t exacto y deja NaN donde no hay valor', () => {
    const r = angulosPorFrame([{ t: 0.1, valor: 5, interpolado: false }, { t: 0.3, valor: 7, interpolado: false }], tiempos)
    expect(Array.from(r)).toEqual([NaN, 5, NaN, 7])
  })
})

describe('nombreArchivoCsv', () => {
  it('quita la extensión y los caracteres raros', () => {
    expect(nombreArchivoCsv('Sentadilla 1.mp4', 'rodilla')).toBe('Sentadilla_1_rodilla.csv')
    expect(nombreArchivoCsv('.mp4', null)).toBe('dualkinema.csv')
  })
})
