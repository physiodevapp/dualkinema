import type { CeroReferencia } from '../articulaciones/cero'
import type { MuestraAngulo } from '../articulaciones/calculo'
import { distanciaPx, incertidumbreEscala, metrosPorPx, type CalibracionVista } from '../calibracion/escala'
import type { VelocidadMarcador } from '../filtros/derivadas'
import type { TrayectoriaFiltrada } from '../filtros/tramos'
import type { OrientacionVista } from '../geometria/canonico'
import type { IdMarcador, Muestra2D, Sincronia } from '../modelo/tipos'
import { compararConEvento } from '../sincronia/audio'
import { TASA_ENVOLVENTE } from '../sincronia/envolvente'
import { ajusteManual, desfaseDeEvento } from '../sincronia/evento'

/*
 * Exportación CSV (paso 7 de la fase 2, decisión D7). Una fila por frame, con
 * una cabecera de metadatos en líneas «# clave;valor» antes de los nombres de
 * columna. Una celda sin valor está vacía, nunca a 0. Todo se calcula aquí a
 * partir de lo que ya tiene el visor; el archivo se genera en el dispositivo.
 *
 * Formato `es` (por defecto, para Excel en español): separador «;» y coma
 * decimal. Formato `internacional`: separador «,» y punto decimal. Empieza con
 * BOM para que Excel lea bien las tildes.
 */

/**
 * Marca de orden de bytes: sin ella Excel lee mal las tildes de un UTF-8. Solo en el
 * formato `es` (el de Excel): en el internacional, pensado para scripts (pandas, R…),
 * pegada a la primera línea «# …» le quitaría el «#» y no la tomarían por comentario.
 */
const BOM = String.fromCharCode(0xfeff)

export type FormatoCsv = 'es' | 'internacional'

export const FORMATOS_CSV: readonly FormatoCsv[] = ['es', 'internacional']

export interface MarcadorExportado {
  readonly id: IdMarcador
  readonly nombre: string
  /** Lo seguido o marcado, tal cual (una posición o nada por frame). */
  readonly crudo: readonly (Muestra2D | undefined)[]
  readonly filtrado: TrayectoriaFiltrada
  /** En m/s si hay escala, en px/s si no (la unidad va con el valor). */
  readonly velocidad: VelocidadMarcador
}

export interface AnguloExportado {
  readonly id: string
  readonly nombre: string
  readonly positivo: string
  readonly negativo: string
  /** Por frame (NaN = sin valor), todas del mismo largo que `tiempos`. */
  readonly crudo: ArrayLike<number>
  readonly filtrado: ArrayLike<number>
  /** Relativo al cero de referencia; null si no hay cero. */
  readonly relativo: ArrayLike<number> | null
  readonly velocidad: ArrayLike<number>
  readonly aceleracion: ArrayLike<number>
  readonly cero: CeroReferencia | null
}

/**
 * Cómo se sincronizó esta vista con la de referencia (fase 3, §8). Solo con varias vistas: el CSV lleva entonces la
 * columna `t_comun_s` (tiempo del vídeo + desfase) y estos datos en la cabecera. Sin ella (una sola vista) el archivo es
 * el de siempre.
 */
export interface SincronizacionExportada {
  /** Esta es la vista de referencia: su tiempo es el tiempo común (desfase 0). */
  readonly referencia: boolean
  /** Segundos que se suman al tiempo del vídeo para dar el tiempo común. */
  readonly desfaseS: number
  /** Cómo se halló, tal como se guarda: método, el evento (que lo dio o que comprobó el audio) y lo que dio el audio. */
  readonly sincronia: Sincronia
  /** ± s de un evento visual: la suma de medio frame de cada vista. */
  readonly incertidumbreEventoS?: number
}

export interface DatosExportacion {
  /** Tiempo de cada frame, en segundos de vídeo. */
  readonly tiempos: ArrayLike<number>
  readonly marcadores: readonly MarcadorExportado[]
  /** null si la articulación no es del plano de la vista. */
  readonly angulo: AnguloExportado | null
  readonly calibracion: CalibracionVista | null
  /** Solo con varias vistas (ver `SincronizacionExportada`). */
  readonly sincronia?: SincronizacionExportada
  readonly meta: {
    readonly archivo: string
    readonly ancho: number
    readonly alto: number
    readonly rotacion: number
    readonly duracionS: number
    readonly fpsMedio: number
    readonly fpsVariable: boolean
    readonly orientacion: OrientacionVista
    /** Corte pedido y corte aplicado (limitado por los fps), en Hz. */
    readonly corteHz: number
    readonly corteEfectivoHz: number
    /** ISO 8601, de quien llama (así la función es pura). */
    readonly exportado: string
  }
}

/**
 * Las filas de la cabecera sobre la sincronía de la vista: de dónde sale el desfase y con qué precisión. Por evento, sus
 * instantes; por audio, la calidad del pico y la precisión del audio (que no incluye el retardo entre sonido e imagen de
 * cada móvil) y, si se comprobó con un evento visual, la comprobación aparte (el evento no dio el desfase). Lo movido a mano
 * sobre lo que dio el método, como «ajustada».
 */
function filasSincronia(x: SincronizacionExportada, n: (v: number, d: number) => string): [string, string][] {
  if (x.referencia) return [['sincronización', 'vista de referencia: su tiempo es el tiempo común (desfase 0)']]
  const s = x.sincronia
  const metodo = { ninguna: 'sin sincronizar', evento: 'evento visual', audio: 'audio', manual: 'puesta a mano' }[s.metodo]
  const ms = (v: number) => `${v < 0 ? '−' : '+'}${n(Math.abs(v) * 1000, 0)} ms`
  const inc = x.incertidumbreEventoS
  const instantes = (e: NonNullable<Sincronia['evento']>) => `evento en ${n(e.referencia, 3)} s de la referencia y en ${n(e.vista, 3)} s de esta vista`
  let texto = `desfase ${n(x.desfaseS, 3)} s respecto a la vista de referencia; método: ${metodo}`
  const filas: [string, string][] = []
  if (s.metodo === 'evento') {
    if (inc !== undefined) texto += `; precisión ±${n(inc * 1000, 0)} ms`
    if (s.evento) texto += `; ${instantes(s.evento)}`
  } else if (s.metodo === 'audio' && s.audio) {
    texto += `; calidad del pico ${n(s.audio.calidad, 1)}; precisión del audio ±${n(1000 / TASA_ENVOLVENTE, 1)} ms (no incluye el retardo entre sonido e imagen de cada móvil)`
    if (s.evento) {
      const c = compararConEvento({ desfase: s.audio.desfase, incertidumbre: 1 / TASA_ENVOLVENTE }, s.evento, inc ?? 0)
      filas.push([
        'sincronización: comprobación',
        `con un evento visual (no da el desfase): ${instantes(s.evento)}; desfase por el evento ${n(desfaseDeEvento(s.evento), 3)} s` +
          (inc !== undefined ? ` ±${n(inc * 1000, 0)} ms` : '') +
          `; diferencia con el audio ${ms(c.diferencia)}${c.discrepan ? ' (discrepan)' : ''}`,
      ])
    }
  }
  const ajuste = ajusteManual(x.desfaseS, s)
  if (ajuste !== null && Math.abs(ajuste) > 1e-9) texto += `; ajustada ${ms(ajuste)} a mano sobre lo que dio el método`
  return [['sincronización', texto], ...filas]
}

/** Alinea una serie angular (solo frames con todos los marcadores) con la tabla de frames, por `t` exacto. */
export function angulosPorFrame(serie: readonly MuestraAngulo[], tiempos: ArrayLike<number>): Float64Array {
  const porT = new Map<number, number>()
  for (const m of serie) porT.set(m.t, m.valor)
  const r = new Float64Array(tiempos.length).fill(NaN)
  for (let i = 0; i < tiempos.length; i++) r[i] = porT.get(tiempos[i]!) ?? NaN
  return r
}

interface Estilo {
  readonly sep: string
  readonly decimal: string
}

const ESTILOS: Record<FormatoCsv, Estilo> = {
  es: { sep: ';', decimal: ',' },
  internacional: { sep: ',', decimal: '.' },
}

function numero(v: number | undefined, decimales: number, e: Estilo): string {
  if (v === undefined || !Number.isFinite(v)) return ''
  const s = v.toFixed(decimales)
  // Un −0,000 no aporta nada.
  const limpio = /^-0(\.0+)?$/.test(s) ? s.slice(1) : s
  return e.decimal === '.' ? limpio : limpio.replace('.', e.decimal)
}

function celda(texto: string, e: Estilo): string {
  return /["\r\n]/.test(texto) || texto.includes(e.sep) ? `"${texto.replaceAll('"', '""')}"` : texto
}

const orientacionTexto = (o: OrientacionVista) =>
  o.plano === 'sagital' ? `sagital, la persona mira a la ${o.mira}` : `frontal, vista desde ${o.ve}`

function cabecera(d: DatosExportacion, e: Estilo): [string, string][] {
  const n = (v: number, dec: number) => numero(v, dec, e)
  const m = d.meta
  const filas: [string, string][] = [
    ['dualkinema', 'exportación de análisis cinemático'],
    ['exportado', m.exportado],
    ['archivo', m.archivo],
    ['tamaño de imagen (px)', `${m.ancho} x ${m.alto}${m.rotacion ? ` (girado ${m.rotacion} grados)` : ''}`],
    ['duración (s)', n(m.duracionS, 3)],
    ['frames', String(d.tiempos.length)],
    ['fps medio', `${n(m.fpsMedio, 2)}${m.fpsVariable ? ' (variable)' : ''}`],
    ['vista', orientacionTexto(m.orientacion)],
    [
      'filtro',
      `Butterworth de 2.º orden de fase cero (ida y vuelta), corte pedido ${n(m.corteHz, 1)} Hz, aplicado ${n(m.corteEfectivoHz, 1)} Hz; ` +
        'cada tramo sin huecos por separado; la posición filtrada, el ángulo y las derivadas salen de ahí',
    ],
  ]
  const a = d.angulo
  if (a) {
    filas.push(['articulación', `${a.nombre} (positivo: ${a.positivo}; negativo: ${a.negativo})`])
    filas.push(
      a.cero
        ? [
            'cero de referencia',
            `tramo estático ${n(a.cero.tramo.desde, 3)}–${n(a.cero.tramo.hasta, 3)} s; media ${n(a.cero.media, 3)} grados; ` +
              `desviación típica ${n(a.cero.desviacion, 3)} grados; ${a.cero.muestras} frames`,
          ]
        : ['cero de referencia', 'ninguno (la columna relativa queda vacía)'],
    )
  }
  if (d.sincronia) {
    filas.push(...filasSincronia(d.sincronia, n))
    filas.push(['t_comun_s', 'tiempo común = tiempo del vídeo (t_s) + desfase: el eje de tiempo que comparten las vistas'])
  }
  const c = d.calibracion
  if (c) {
    const mpp = metrosPorPx(c)
    const origen = c.entre
      ? `distancia media entre ${c.entre.desde} y ${c.entre.hasta} en ${n(c.entre.tramo.desde, 3)}–${n(c.entre.tramo.hasta, 3)} s (${c.entre.muestras} frames, desviación ${n(c.entre.dispersionPx, 3)} px)`
      : `extremos marcados en el frame de t = ${n(c.t, 3)} s`
    filas.push(
      ['escala', `${c.objeto}, ${n(c.longitudM, 4)} m = ${n(distanciaPx(c.a, c.b), 2)} px; ${n(mpp * 1000, 4)} mm/px; incertidumbre ±${n(incertidumbreEscala(c) * 100, 2)} %`],
      ['escala: origen', origen],
      ['escala: extremos (px)', `a = (${n(c.a.x, 2)} ${n(c.a.y, 2)}); b = (${n(c.b.x, 2)} ${n(c.b.y, 2)})`],
      ['escala: alcance', 'plano del movimiento; la misma escala en x e y; y hacia abajo, como la imagen'],
    )
  } else {
    filas.push(['escala', 'sin escala (posiciones y velocidades en píxeles)'])
  }
  filas.push(
    ['marcadores', d.marcadores.map((k) => `${k.id} = ${k.nombre}`).join(' | ')],
    ['celdas vacías', 'sin valor (marcador perdido, hueco, sin derivada en los extremos de un tramo); nunca 0'],
    ['manual, interpolado', '1 = sí, 0 = no. Interpolado: hueco corto rellenado a petición'],
  )
  return filas
}

/** Nombres de columna, en el mismo orden que las celdas de `fila`. */
function columnas(d: DatosExportacion): string[] {
  const conEscala = d.calibracion !== null
  const cols = d.sincronia ? ['t_s', 't_comun_s', 'frame'] : ['t_s', 'frame']
  for (const k of d.marcadores) {
    const p = k.id
    cols.push(`${p}_x_px`, `${p}_y_px`, `${p}_calidad`, `${p}_manual`, `${p}_interpolado`, `${p}_filtrado_x_px`, `${p}_filtrado_y_px`)
    if (conEscala) cols.push(`${p}_filtrado_x_m`, `${p}_filtrado_y_m`)
    cols.push(`${p}_velocidad_${conEscala ? 'm_s' : 'px_s'}`)
  }
  if (d.angulo) {
    const p = `angulo_${d.angulo.id}`
    cols.push(`${p}_crudo_grados`, `${p}_filtrado_grados`, `${p}_relativo_grados`, `${p}_vel_grados_s`, `${p}_acel_grados_s2`)
  }
  return cols
}

/**
 * Texto CSV completo (con BOM solo en `es`). Precisión: tiempo 6 decimales, píxeles 3,
 * metros 6, ángulos 3, velocidades 4, aceleración 2 — de sobra para el ruido
 * de lo medido, sin arrastrar cifras que no significan nada.
 */
export function construirCsv(d: DatosExportacion, formato: FormatoCsv = 'es'): string {
  const e = ESTILOS[formato]
  const n = (v: number | undefined, dec: number) => numero(v, dec, e)
  const mpp = d.calibracion ? metrosPorPx(d.calibracion) : null
  const lineas: string[] = []
  for (const [clave, valor] of cabecera(d, e)) lineas.push(`# ${celda(clave, e)}${e.sep}${celda(valor, e)}`)
  lineas.push(columnas(d).join(e.sep))
  for (let i = 0; i < d.tiempos.length; i++) {
    const f: string[] = d.sincronia ? [n(d.tiempos[i], 6), n(d.tiempos[i]! + d.sincronia.desfaseS, 6), String(i + 1)] : [n(d.tiempos[i], 6), String(i + 1)]
    for (const mk of d.marcadores) {
      const c = mk.crudo[i]
      const utilizable = c !== undefined && Number.isFinite(c.x) && Number.isFinite(c.y)
      f.push(
        n(utilizable ? c.x : undefined, 3),
        n(utilizable ? c.y : undefined, 3),
        n(c?.calidad, 2),
        c ? (c.editadoManual ? '1' : '0') : '',
        c ? (c.interpolado ? '1' : '0') : '',
      )
      const p = mk.filtrado.posiciones[i]
      f.push(n(p?.x, 3), n(p?.y, 3))
      if (mpp !== null) f.push(n(p ? p.x * mpp : undefined, 6), n(p ? p.y * mpp : undefined, 6))
      f.push(n(mk.velocidad.modulo[i], 4))
    }
    if (d.angulo) {
      const a = d.angulo
      f.push(n(a.crudo[i], 3), n(a.filtrado[i], 3), n(a.relativo?.[i], 3), n(a.velocidad[i], 3), n(a.aceleracion[i], 2))
    }
    lineas.push(f.join(e.sep))
  }
  return `${formato === 'es' ? BOM : ''}${lineas.join('\r\n')}\r\n`
}

/** Nombre de archivo: el del vídeo sin extensión + articulación, sin caracteres problemáticos. */
export function nombreArchivoCsv(archivo: string, articulacionId: string | null): string {
  const base = archivo.replace(/\.[^./\\]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '') || 'dualkinema'
  return `${base}${articulacionId ? `_${articulacionId}` : ''}.csv`
}
