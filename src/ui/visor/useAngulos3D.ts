import { useEffect, useMemo, useRef, useState } from 'react'
import { ceroDeReferencia, type TramoEstatico } from '../../core/articulaciones/cero'
import { construirCsv3D } from '../../core/exportacion/csv3d'
import type { AjustesFiltro } from '../../core/filtros/tramos'
import { marcadoresSinMarcadores } from '../../core/pose/catalogo'
import { esPuntoMedio } from '../../core/pose/puntos'
import { pasoTipico } from '../../core/sincronia/evento'
import { fpsMediano } from '../../core/tiempo/tablaFrames'
import { ARTICULACIONES_3D, serieAngular3D } from '../../core/tresd/angulos3d'
import type { Calibracion3D } from '../../core/tresd/calibracion3d'
import { aLaboratorio, filtrar3D, triangularSesion } from '../../core/tresd/puntos3d'
import { ARTICULACIONES_ESQUELETO, serieEsqueleto, type ResultadoEsqueleto } from '../../core/esqueleto/sesion'
import { puntosDePostura } from '../../core/esqueleto/modelo'
import type { AlWorkerEsqueleto, DelWorkerEsqueleto } from '../../workers/protocolo'
import type { VistaViva } from './vistas'

/** Los puntos del cuerpo que se triangulan (los 12 de los dos lados; los puntos medios salen de ellos). */
export const IDS_3D = marcadoresSinMarcadores({ plano: 'sagital', mira: 'derecha' }).filter((id) => !esPuntoMedio(id))

export type Fuente3D = 'puntos' | 'esqueleto'
export type EstadoEsqueleto = { fase: 'parado' } | { fase: 'ajustando'; fraccion: number } | { fase: 'error'; mensaje: string }

/**
 * Los ángulos en 3D de la sesión calibrada (fase 6, paso 4; fase 7), en un solo sitio para la tarjeta de «Análisis»
 * (`Panel3D`) y la gráfica central (`Grafica3DCentral`): los puntos 3D (triangulados de las trayectorias 2D y filtrados),
 * el esqueleto ajustado a petición en un worker, la articulación y la fuente que se miran, y el cero de cada una. Sin las
 * dos vistas o sin calibrar, null (los hooks se llaman igual: el visor no los pone y quita).
 */
export function useAngulos3D({
  a,
  b,
  calibracion,
  ajustes,
}: {
  readonly a: VistaViva | null
  readonly b: VistaViva | null
  readonly calibracion: Calibracion3D | null
  readonly ajustes: AjustesFiltro
}) {
  const hay = !!a && !!b && !!calibracion
  const [elegida, setElegida] = useState(ARTICULACIONES_3D[0]!.id)
  const [ceros, setCeros] = useState<Readonly<Record<string, TramoEstatico>>>({})
  // Mientras se sigue o se detecta en una vista, sus trayectorias cambian con cada lote: no se rehace el 3D de toda la toma
  // cada vez (se rehace al acabar).
  const ocupado = !!a && !!b && (a.siguiendo || a.detectando || b.siguiendo || b.detectando)
  const va = ocupado ? -1 : (a?.version ?? 0)
  const vb = ocupado ? -1 : (b?.version ?? 0)
  // Sin filtrar (de él depende si el esqueleto ajustado sigue valiendo: cambiar el corte del filtro no lo invalida) y filtrado.
  const bruto = useMemo(
    () => {
      if (!a || !b || !calibracion) return null
      const ladoLargo = Math.max(a.info.ancho, a.info.alto, b.info.ancho, b.info.alto)
      const vista = (w: VistaViva) => ({ series: w.series, tabla: w.tabla, desfase: w.desfaseS, paso: pasoTipico(w.tabla) })
      return aLaboratorio(triangularSesion(calibracion, vista(a), vista(b), IDS_3D, ladoLargo))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión de cada vista lo dice.
    [calibracion, va, vb, a?.desfaseS, b?.desfaseS, a?.series, b?.series, a?.tabla, b?.tabla],
  )
  const fs = a ? fpsMediano(a.tabla) : 30
  const tr = useMemo(() => (bruto ? filtrar3D(bruto, fs, ajustes) : null), [bruto, fs, ajustes])
  const anchoA = a?.info.ancho
  const altoA = a?.info.alto
  const anchoB = b?.info.ancho
  const altoB = b?.info.alto
  const imagenes = useMemo(
    () =>
      [
        { ancho: anchoA ?? 1, alto: altoA ?? 1 },
        { ancho: anchoB ?? 1, alto: altoB ?? 1 },
      ] as const,
    [anchoA, altoA, anchoB, altoB],
  )
  // El esqueleto (fase 7): se ajusta a petición en un worker y vale mientras no cambien los puntos 3D de los que sale.
  const [fuente, setFuente] = useState<Fuente3D>('puntos')
  const [ajuste, setAjuste] = useState<{ bruto: typeof bruto; resultado: ResultadoEsqueleto | null; ms: number } | null>(null)
  const [estadoEsq, setEstadoEsq] = useState<EstadoEsqueleto>({ fase: 'parado' })
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])
  const esqueleto = ajuste && ajuste.bruto === bruto ? ajuste.resultado : null
  const conEsqueleto = fuente === 'esqueleto' && !!esqueleto
  const lista = fuente === 'esqueleto' ? ARTICULACIONES_ESQUELETO : ARTICULACIONES_3D
  const elegidaVigente = lista.some((x) => x.id === elegida) ? elegida : lista[0]!.id
  const art = lista.find((x) => x.id === elegidaVigente)!
  const serie = useMemo(() => {
    if (!tr) return []
    if (fuente === 'esqueleto') {
      const ae = ARTICULACIONES_ESQUELETO.find((x) => x.id === elegidaVigente)!
      return esqueleto ? serieEsqueleto(ae, esqueleto, fs, ajustes) : tr.tiempos.map((t) => ({ t, valor: NaN, interpolado: false, fiable: true }))
    }
    return serieAngular3D(elegidaVigente, tr).map((m) => ({ ...m, fiable: true }))
  }, [fuente, elegidaVigente, tr, esqueleto, fs, ajustes])
  const puntosEsqueleto = useMemo(
    () => (conEsqueleto && esqueleto ? (i: number) => (esqueleto.posturas[i] ? puntosDePostura(esqueleto.posturas[i]!, esqueleto.medidas) : null) : undefined),
    [conEsqueleto, esqueleto],
  )

  const ajustarEsqueleto = () => {
    if (!a || !b || !calibracion || !tr) return
    worker.current?.terminate()
    const w = new Worker(new URL('../../workers/esqueleto.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const desde = bruto
    setEstadoEsq({ fase: 'ajustando', fraccion: 0 })
    w.onmessage = (e: MessageEvent<DelWorkerEsqueleto>) => {
      if (worker.current !== w) return
      const m = e.data
      if (m.tipo === 'progreso') return setEstadoEsq({ fase: 'ajustando', fraccion: m.fraccion })
      if (m.tipo === 'hecho') {
        setAjuste({ bruto: desde, resultado: m.resultado, ms: m.ms })
        setEstadoEsq(m.resultado ? { fase: 'parado' } : { fase: 'error', mensaje: 'no hay bastantes puntos 3D para medir a la persona.' })
      } else setEstadoEsq({ fase: 'error', mensaje: m.mensaje })
      w.terminate()
      worker.current = null
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      if (worker.current !== w) return
      setEstadoEsq({ fase: 'error', mensaje: ev.message || 'no se ha podido cargar el cálculo. Recarga la página.' })
      worker.current = null
    }
    const vista = (x: VistaViva) => ({ series: x.series, tabla: x.tabla, desfase: x.desfaseS, paso: pasoTipico(x.tabla) })
    w.postMessage({ tipo: 'ajustar', calibracion, a: vista(a), b: vista(b), tr, ids: IDS_3D } satisfies AlWorkerEsqueleto)
  }
  const pararEsqueleto = () => {
    worker.current?.terminate()
    worker.current = null
    setEstadoEsq({ fase: 'parado' })
  }
  const tramo = ceros[elegidaVigente] ?? null
  const cero = tramo ? ceroDeReferencia(serie, tramo) : null
  const ponerCero = (t: TramoEstatico | null) =>
    setCeros((c) => (t ? { ...c, [elegidaVigente]: t } : Object.fromEntries(Object.entries(c).filter(([k]) => k !== elegidaVigente))))

  const generar = (formato: Parameters<typeof construirCsv3D>[1]) => {
    const angulos = ARTICULACIONES_3D.map((x) => {
      const s = serieAngular3D(x.id, tr!)
      const t = ceros[x.id]
      return { art: x, serie: s, cero: t ? (ceroDeReferencia(s, t)?.media ?? null) : null }
    })
    const delEsqueleto = esqueleto
      ? ARTICULACIONES_ESQUELETO.map((x) => {
          const s = serieEsqueleto(x, esqueleto, fs, ajustes)
          const t = ceros[x.id]
          return { art: x, serie: s, cero: t ? (ceroDeReferencia(s, t)?.media ?? null) : null, conFiable: !!x.ladoRotacion }
        })
      : []
    const texto = construirCsv3D({ tr: tr!, calibracion: calibracion!, angulos, esqueleto: delEsqueleto, puntos: IDS_3D, corteHz: ajustes.corteHz, sincronia: b!.sincronia.metodo }, formato)
    return { nombre: 'dualkinema_3d.csv', texto }
  }

  if (!hay || !tr || !calibracion) return null
  return {
    tr,
    calibracion,
    imagenes,
    ocupado,
    fuente,
    setFuente,
    ajuste: ajuste && { cambiado: ajuste.bruto !== bruto },
    estadoEsq,
    esqueleto,
    lista,
    elegida: elegidaVigente,
    setElegida,
    art,
    serie,
    puntosEsqueleto,
    ajustarEsqueleto,
    pararEsqueleto,
    tramo,
    cero,
    ponerCero,
    generar,
  }
}

export type Angulos3D = NonNullable<ReturnType<typeof useAngulos3D>>
