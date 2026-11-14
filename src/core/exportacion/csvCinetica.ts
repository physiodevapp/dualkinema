/*
 * El CSV de la cinética (fase 11, D10): una fila por frame de la toma, con el centro de masas, la fuerza del suelo total y
 * su centro de presiones, el apoyo y la parte del peso de cada pie y, por pierna, el momento sagital y frontal y la potencia
 * de cadera, rodilla y tobillo. Todo por kilo de masa corporal. En la cabecera: el modo, el filtro, el suelo, la tabla de
 * los segmentos, los convenios y que es una estimación sin plataforma. Sin valor, celda vacía (nunca 0).
 */
import type { Lado } from '../articulaciones/catalogo'
import { G, type ResultadoCinetica } from '../cinetica/dinamica'
import { ARTICULACIONES_CINETICA, picos, repartoPeso } from '../cinetica/resumen'
import { BOM, celda, ESTILOS, numero, type FormatoCsv } from './csv'

export interface DatosCsvCinetica {
  readonly exportado: string
  readonly resultado: ResultadoCinetica
  readonly modo: 'cuasiestatica' | 'dinamica'
  /** El corte del filtro con que se calculó (Hz). */
  readonly corteHz: number
  /** Si se calculó con el esqueleto suavizado en toda la toma (D12). */
  readonly afinado?: boolean
  /** La masa de la persona (kg), si se escribió. */
  readonly masa?: number | null
  /** Cómo se repartió el peso entre los pies en el doble apoyo. */
  readonly reparto?: 'palanca' | 'esfuerzo' | 'gaitdynamics'
}

const REPARTO_TEXTO = {
  palanca: 'con los dos apoyando, por la palanca entre sus apoyos: estimado (la cinemática sola no lo determina)',
  esfuerzo: 'con los dos apoyando, el reparto que pide menos momento a las articulaciones de las piernas: estimado',
  gaitdynamics: 'la fuerza de cada pie de GaitDynamics (red entrenada con la marcha y la carrera; experimental)',
} as const

const LADOS: readonly Lado[] = ['der', 'izq']

export function construirCsvCinetica(d: DatosCsvCinetica, formato: FormatoCsv = 'es'): string {
  const e = ESTILOS[formato]
  const n = (v: number | undefined, dec: number) => numero(v, dec, e)
  const r = d.resultado
  const p = picos(r, 'sagital')
  const cab: [string, string][] = [
    ['dualkinema', 'cinética estimada (sin plataforma de fuerzas)'],
    ['exportado', d.exportado],
    [
      'modo',
      d.modo === 'cuasiestatica'
        ? 'cuasiestático: sin aceleraciones (la fuerza es el peso y el centro de presiones cae bajo el centro de masas); para movimientos lentos'
        : 'dinámico: con las aceleraciones del esqueleto; con el ruido del vídeo, solo para movimientos lentos o moderados',
    ],
    ['filtro', `Butterworth de 2.º orden ida y vuelta, ${n(d.corteHz, 1)} Hz`],
    ['esqueleto', d.afinado ? 'suavizado en toda la toma (pesando lo que ven mejor las cámaras)' : 'ajustado frame a frame (sin afinar la toma)'],
    ...(d.masa ? [['masa (kg)', `${n(d.masa, 1)}: multiplica los valores por kilo por ella para tenerlos en N, N·m o W`] as [string, string]] : []),
    ['suelo (m, en el mundo calibrado)', n(r.suelo, 3)],
    ['segmentos', 'Dempster adaptado por Winter (2009): cabeza, brazos y tronco en un bloque'],
    ['unidades', 'por kilo de masa corporal: fuerzas en N/kg (entre 9,81: pesos corporales), momentos en N·m/kg, potencias en W/kg'],
    ['momentos', 'internos netos (del segmento proximal sobre el distal); sagital + extensor (cadera y rodilla) y + flexor plantar (tobillo); frontal + abductor (cadera y rodilla)'],
    ['reparto entre los pies', REPARTO_TEXTO[d.reparto ?? 'palanca']],
    ['aviso', 'estimación sin plataforma de fuerzas: no vale para impactos ni para el doble apoyo de la marcha'],
    ...ARTICULACIONES_CINETICA.map((a): [string, string] => [`pico sagital ${a} (N·m/kg)`, `derecha ${n(p[a].der, 3)}, izquierda ${n(p[a].izq, 3)}`]),
    ['celdas vacías', 'sin valor (sin esqueleto ajustado, bordes de cada tramo, sin apoyo reconocible); nunca 0'],
  ]
  const lineas = cab.map(([clave, valor]) => `# ${celda(clave, e)}${e.sep}${celda(valor, e)}`)
  const columnas = [
    't_comun_s',
    'com_x_m',
    'com_y_m',
    'com_z_m',
    'fuerza_x_N_kg',
    'fuerza_y_N_kg',
    'fuerza_z_N_kg',
    'fuerza_z_pct_peso',
    'cop_x_m',
    'cop_y_m',
    ...LADOS.flatMap((l) => [`apoyo_${l}`, `peso_${l}_pct`]),
    ...LADOS.flatMap((l) => ARTICULACIONES_CINETICA.flatMap((a) => [`${a}_${l}_sagital_Nm_kg`, ...(a === 'tobillo' ? [] : [`${a}_${l}_frontal_Nm_kg`]), `${a}_${l}_potencia_W_kg`])),
  ]
  lineas.push(columnas.join(e.sep))
  const reparto = repartoPeso(r)
  for (let k = 0; k < r.tiempos.length; k++) {
    const c = r.com[k]!
    const f = r.fuerza[k]!
    const fila = [
      n(r.tiempos[k], 4),
      n(c.x, 4),
      n(c.y, 4),
      n(c.z, 4),
      n(f.x, 3),
      n(f.y, 3),
      n(f.z, 3),
      n((100 * f.z) / G, 1),
      n(r.cop[k]!.x, 4),
      n(r.cop[k]!.y, 4),
      ...LADOS.flatMap((l) => [Number.isFinite(f.z) ? (r.pies[l].apoyo[k] ? '1' : '0') : '', n(reparto[l][k], 1)]),
      ...LADOS.flatMap((l) =>
        ARTICULACIONES_CINETICA.flatMap((a) => {
          const s = r.articulaciones[l][a]
          return [n(s.sagital[k], 3), ...(a === 'tobillo' ? [] : [n(s.frontal[k], 3)]), n(s.potencia[k], 3)]
        }),
      ),
    ]
    lineas.push(fila.join(e.sep))
  }
  return `${formato === 'es' ? BOM : ''}${lineas.join('\r\n')}\r\n`
}
