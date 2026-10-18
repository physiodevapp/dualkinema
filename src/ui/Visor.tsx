import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { anguloArticular, CALIDAD_MINIMA, serieAngular } from '../core/articulaciones/calculo'
import { modeloRodilla3 } from '../core/articulaciones/catalogo'
import { aCanonico, type OrientacionVista } from '../core/geometria/canonico'
import type { Vec3 } from '../core/geometria/vector'
import type { IdMarcador, ModeloMarcadores, Muestra2D } from '../core/modelo/tipos'
import type { LeerVentana } from '../core/seguimiento/imagen'
import type { MotivoHueco } from '../core/seguimiento/huecos'
import { huecosInterpolables, HUECO_MAX_S, interpolarHueco } from '../core/seguimiento/interpolar'
import { aprenderMarcador, ErrorMarcado, radioDe } from '../core/seguimiento/seguidor'
import { AJUSTES_FILTRO_DEFECTO, type AjustesFiltro } from '../core/filtros/tramos'
import { resumirSerie } from '../core/graficas/rango'
import { estadisticas, indiceMasCercano, limitarIndice } from '../core/tiempo/tablaFrames'
import type { VideoAbierto } from '../media/video'
import type { AlWorker, DelWorker, Hueco } from '../workers/protocolo'
import { COLORES_MARCADOR, ladoVisible, nombreCorto } from './marcadores'
import { huellaDe } from './sesion'
import { useRepetir } from './useRepetir'
import BandaFrames, { type EstadoFrame } from './visor/BandaFrames'
import GraficaAngulo from './visor/GraficaAngulo'
import LienzoVideo, { type Previsualizacion } from './visor/LienzoVideo'
import PanelFiltro from './visor/PanelFiltro'
import { useFiltrado } from './visor/useFiltrado'
import { useGuardado, type EstadoGuardado, type SesionAbierta } from './visor/useGuardado'

const SALTO = 10
const ESTELA = 20 // frames de trayectoria dibujados hacia atrás

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Grados con una decimal sin «−0,0» (un valor entre −0,05 y 0 se muestra 0,0). */
const grados = (n: number) => fmt(Math.round(n * 10) / 10 + 0, 1)
const valida = (m: Muestra2D | undefined): m is Muestra2D => !!m && m.calidad >= CALIDAD_MINIMA && Number.isFinite(m.x)

function BotonPaso({ etiqueta, accion, children }: { etiqueta: string; accion: () => void; children: React.ReactNode }) {
  const manejadores = useRepetir(accion)
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      {...manejadores}
      className="flex h-14 flex-1 touch-manipulation items-center justify-center rounded-md border border-borde bg-panel select-none active:border-acento active:text-acento"
    >
      {children}
    </button>
  )
}

function lectorDeCanvas(c: HTMLCanvasElement | OffscreenCanvas): LeerVentana {
  const ctx = (c as HTMLCanvasElement).getContext('2d')
  if (!ctx) throw new Error('No se pueden leer los píxeles del frame.')
  return (v) => {
    const d = ctx.getImageData(v.x, v.y, Math.max(1, v.ancho), Math.max(1, v.alto))
    return { ancho: d.width, alto: d.height, datos: d.data, x0: v.x, y0: v.y }
  }
}

const NOMBRE_MOTIVO: Record<MotivoHueco, string> = {
  sinColor: 'sin su color en la zona',
  tamano: 'mancha de tamaño distinto',
  calidad: 'lejos de lo esperado o ambiguo',
  conflicto: 'junto a otro gomet',
  dudoso: 'detección dudosa, descartada',
}

function describirMotivos(h: Hueco): string {
  const fmt = (n: number) => n.toFixed(1).replace('.', ',')
  return (Object.entries(h.motivos) as [MotivoHueco, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => {
      const area = m === 'tamano' && h.areaMin !== undefined ? ` (área ${fmt(h.areaMin)}–${fmt(h.areaMax!)}× la del gomet)` : ''
      return `${n} ${NOMBRE_MOTIVO[m]}${area}`
    })
    .join(', ')
}

type Seguimiento = { estado: 'parado' } | { estado: 'siguiendo'; progreso: number }

const hora = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function TextoGuardado({ g }: { g: EstadoGuardado }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-texto-2" data-testid="guardado" aria-live="polite">
      {(g.estado === 'guardado' || g.estado === 'recuperado') && <CheckIcon className="size-4 text-acento" />}
      {g.estado === 'error' && <ExclamationTriangleIcon className="size-4 text-red-300" />}
      {g.estado === 'nada' && 'Se guarda solo en este dispositivo en cuanto marques algo.'}
      {g.estado === 'recuperado' && 'Guardado en este dispositivo. Lo que cambies se guarda solo.'}
      {g.estado === 'pendiente' && 'Guardando en este dispositivo…'}
      {g.estado === 'guardado' && `Guardado en este dispositivo a las ${hora(g.hora)}`}
      {g.estado === 'error' && <span className="text-red-300">No se ha podido guardar: {g.mensaje}</span>}
    </p>
  )
}

interface Props {
  video: VideoAbierto
  orientacion: OrientacionVista
  sesion: SesionAbierta
  /** Al recuperar una sesión: su modelo y sus trayectorias, tal como se guardaron. */
  modelo?: ModeloMarcadores
  inicial?: Map<IdMarcador, (Muestra2D | undefined)[]>
  /** Al recuperar: el ajuste del filtro guardado (null = el de por defecto). */
  filtro?: AjustesFiltro | null
  avisoInicial?: string
}

export default function Visor({ video, orientacion, sesion, modelo: modeloGuardado, inicial, filtro, avisoInicial }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { info, tabla } = video
  const total = tabla.tiempos.length

  // Modelo de la fase 1: rodilla con 3 gomets en la pierna que ve la cámara.
  // Una sesión recuperada usa el que se guardó con ella.
  const lado = orientacion.plano === 'sagital' ? ladoVisible(orientacion) : 'izq'
  const modelo = useMemo(() => modeloGuardado ?? modeloRodilla3(lado), [modeloGuardado, lado])
  const ids = useMemo(() => modelo.marcadores.map((m) => m.id), [modelo])
  const articulacion = modelo.articulaciones[0]!

  // Trayectorias: una posición (o nada) por frame y marcador. Se modifican en
  // sitio y `version` avisa a React de que hay que repintar.
  const trayectorias = useRef<Map<IdMarcador, (Muestra2D | undefined)[]>>(new Map())
  const [version, setVersion] = useState(0)
  if (trayectorias.current.size === 0) for (const id of ids) trayectorias.current.set(id, inicial?.get(id) ?? new Array(total))
  const muestra = useCallback((id: IdMarcador, i: number) => trayectorias.current.get(id)?.[i], [])

  const [deseado, setDeseado] = useState(0)
  const [mostrado, setMostrado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; detalle?: string; irA?: number } | null>(avisoInicial ? { texto: avisoInicial } : null)
  // Error al tocar: se muestra encima del vídeo, que es donde se mira al marcar.
  // `aOjo`: dónde se tocó, para ofrecer colocarlo ahí aunque no se reconozca el gomet.
  const [errorToque, setErrorToque] = useState<{ texto: string; detalle?: string; aOjo?: { id: IdMarcador; i: number; x: number; y: number } } | null>(null)
  const [msDecodificar, setMsDecodificar] = useState<number | null>(null)
  // Al recuperar, el primer marcador que falte en el frame inicial (como al marcar);
  // si están todos, ninguno, para no mover uno sin querer con el primer toque.
  const [seleccionado, setSeleccionado] = useState<IdMarcador | null>(() =>
    inicial ? (ids.find((id) => !valida(inicial.get(id)?.[0])) ?? null) : (ids[0] ?? null),
  )
  const [seguimiento, setSeguimiento] = useState<Seguimiento>({ estado: 'parado' })
  const ultimoFrame = useRef<HTMLCanvasElement | OffscreenCanvas | null>(null)
  const huella = useMemo(() => huellaDe(video), [video])
  // Ajuste del filtro: se guarda con la sesión. `revAjustes` cuenta sus cambios
  // para que el guardado automático los vea (como `version` con las trayectorias).
  const [ajustes, setAjustes] = useState<AjustesFiltro>(filtro ?? AJUSTES_FILTRO_DEFECTO)
  const [revAjustes, setRevAjustes] = useState(0)
  const cambiarAjustes = useCallback((a: AjustesFiltro) => {
    setAjustes(a)
    setRevAjustes((r) => r + 1)
  }, [])
  const guardado = useGuardado({
    sesion,
    huella,
    orientacion,
    modelo,
    trayectorias,
    filtro: ajustes,
    // Los dos contadores solo crecen: su suma cambia con cualquiera de los dos.
    version: version + revAjustes,
    recuperada: !!inicial,
  })

  // Pintado «el último gana».
  const pedido = useRef(0)
  const ocupado = useRef(false)
  const pintar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      for (;;) {
        const i = pedido.current
        const inicio = performance.now()
        const frame = await video.frame(i)
        lienzo.current?.getContext('2d')?.drawImage(frame.canvas, 0, 0)
        ultimoFrame.current = frame.canvas
        setMsDecodificar(performance.now() - inicio)
        setMostrado(i)
        setError(null)
        if (pedido.current === i) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      ocupado.current = false
    }
  }, [video])

  // Primer frame al montar. pintar() solo cambia el estado tras decodificar
  // (asíncrono), no de forma síncrona dentro del efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void pintar(), [pintar])

  const ir = useCallback(
    (i: number) => {
      pedido.current = limitarIndice(tabla, i)
      setDeseado(pedido.current)
      void pintar()
    },
    [tabla, pintar],
  )
  const mover = useCallback((d: number) => ir(pedido.current + d), [ir])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
      const paso = e.shiftKey ? SALTO : 1
      if (e.key === 'ArrowRight') mover(paso)
      else if (e.key === 'ArrowLeft') mover(-paso)
      else if (e.key === 'Home') ir(0)
      else if (e.key === 'End') ir(total - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [mover, ir, total])

  // ---- Worker de seguimiento ----
  const worker = useRef<Worker | null>(null)
  useEffect(() => {
    const w = new Worker(new URL('../workers/seguimiento.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<DelWorker>) => {
      const m = e.data
      if (m.tipo === 'muestras') {
        for (const f of m.lote) {
          for (const mk of f.marcadores) {
            const serie = trayectorias.current.get(mk.id)
            if (!serie || serie[f.indice]?.editadoManual) continue
            serie[f.indice] = { t: f.t, x: mk.x, y: mk.y, calidad: mk.calidad, editadoManual: false }
          }
        }
        setSeguimiento({ estado: 'siguiendo', progreso: m.progreso })
        setVersion((v) => v + 1)
      } else if (m.tipo === 'fin') {
        setSeguimiento({ estado: 'parado' })
        const nombre = (id: IdMarcador) => nombreCorto(modelo.marcadores.find((x) => x.id === id)?.nombre ?? id)
        if (m.motivo === 'inicio') {
          setAviso({
            texto: `No reconozco ${m.sinReconocer.map(nombre).join(' ni ')} en este frame. Vuelve a tocarlo justo encima del gomet.`,
          })
          setSeleccionado(m.sinReconocer[0] ?? null)
        } else if (m.huecos.length) {
          const primero = Math.min(...m.huecos.map((h) => h.primero))
          setAviso({
            texto:
              `${m.motivo === 'final' ? 'Seguimiento completado' : 'Seguimiento parado'}, con huecos: ` +
              m.huecos.map((h) => `${nombre(h.id)} no tiene posición fiable en ${h.frames} frame${h.frames === 1 ? '' : 's'}`).join('; ') +
              '. Son los frames en rojo de la franja y no se rellenan. Si en alguno sí se ve el gomet, tócalo ahí y pulsa «Seguir desde aquí».',
            detalle: m.huecos.map((h) => `${nombre(h.id)}: ${describirMotivos(h)}`).join('\n'),
            irA: primero,
          })
          setSeleccionado(m.huecos[0]!.id)
        } else {
          setAviso({ texto: m.motivo === 'final' ? 'Seguimiento completado hasta el final del vídeo, sin huecos.' : 'Seguimiento parado.' })
        }
      } else {
        setSeguimiento({ estado: 'parado' })
        setAviso({ texto: `Error en el seguimiento: ${m.mensaje}` })
      }
    }
    return () => w.terminate()
  }, [modelo, ir])

  const posicionesEn = useCallback(
    (i: number) => ids.map((id) => ({ id, m: muestra(id, i) })),
    [ids, muestra],
  )
  const listoParaSeguir = mostrado !== null && posicionesEn(mostrado).every(({ m }) => valida(m))

  const seguirDesdeAqui = () => {
    if (mostrado === null || !listoParaSeguir) return
    // Lo seguido antes a partir de aquí se descarta; lo marcado a mano se conserva.
    for (const serie of trayectorias.current.values()) {
      for (let i = mostrado + 1; i < total; i++) if (!serie[i]?.editadoManual) serie[i] = undefined
    }
    setVersion((v) => v + 1)
    setAviso(null)
    setSeguimiento({ estado: 'siguiendo', progreso: mostrado / Math.max(1, total - 1) })
    // Lo marcado a mano más adelante son anclas: el seguidor las respeta y sigue desde ellas.
    const anclas: { indice: number; id: IdMarcador; x: number; y: number }[] = []
    for (const [id, serie] of trayectorias.current) {
      for (let i = mostrado + 1; i < total; i++) {
        const m = serie[i]
        if (m?.editadoManual && Number.isFinite(m.x)) anclas.push({ indice: i, id, x: m.x, y: m.y })
      }
    }
    const msg: AlWorker = {
      tipo: 'seguir',
      archivo: video.archivo,
      desde: mostrado,
      posiciones: posicionesEn(mostrado).map(({ id, m }) => ({ id, x: m!.x, y: m!.y })),
      anclas,
    }
    worker.current?.postMessage(msg)
  }

  /** Guarda una posición marcada a mano y pasa al siguiente marcador que falte en el frame. */
  const ponerManual = (id: IdMarcador, i: number, x: number, y: number) => {
    const serie = trayectorias.current.get(id)!
    serie[i] = { t: tabla.tiempos[i]!, x, y, calidad: 1, editadoManual: true }
    setErrorToque(null)
    setVersion((v) => v + 1)
    const falta = ids.find((otro) => otro !== id && !valida(muestra(otro, i)))
    setSeleccionado(falta ?? null)
    // Una corrección con lo seguido detrás: se puede rehacer desde aquí con ella como ancla.
    const seguidoDespues = serie.some((m, k) => k > i && m !== undefined && !m.editadoManual)
    setAviso(
      seguidoDespues && !falta
        ? { texto: 'Corregido. Para rehacer lo que viene después a partir de aquí, pulsa «Seguir desde aquí»: respeta todo lo marcado a mano.' }
        : null,
    )
  }

  /** Dónde quedaría el marcador si se suelta en (x, y): centro y radio del gomet, o null si no hay. */
  const previsualizar = useCallback(
    (x: number, y: number, radio: number): Previsualizacion => {
      if (mostrado === null || !ultimoFrame.current) return null
      try {
        const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, tabla.tiempos[mostrado]!, x, y, { radioSemilla: radio })
        return { x: r.x, y: r.y, r: radioDe(r.estado.area) }
      } catch {
        return null
      }
    },
    [mostrado, info, tabla],
  )

  const colocar = (x: number, y: number, radio: number) => {
    if (mostrado === null || !seleccionado || !ultimoFrame.current) return
    const t = tabla.tiempos[mostrado]!
    try {
      // Se lleva el marcador al centro del gomet que se ve en la lupa (el mismo que marcaba el anillo).
      const r = aprenderMarcador(lectorDeCanvas(ultimoFrame.current), info.ancho, info.alto, t, x, y, { radioSemilla: radio })
      ponerManual(seleccionado, mostrado, r.x, r.y)
    } catch (e) {
      setErrorToque(
        e instanceof ErrorMarcado
          ? { texto: e.message, detalle: e.detalle, aOjo: { id: seleccionado, i: mostrado, x, y } }
          : { texto: `No se ha podido marcar: ${String(e)}` },
      )
    }
  }

  const quitarManual = (id: IdMarcador, i: number) => {
    trayectorias.current.get(id)![i] = undefined
    setAviso(null)
    setVersion((v) => v + 1)
  }

  // ---- Huecos cortos: rellenar a petición ----
  const huecosCortos = useMemo(() => {
    void version
    return ids.flatMap((id) => huecosInterpolables(trayectorias.current.get(id)!, tabla.tiempos).map((h) => ({ id, h })))
  }, [version, ids, tabla])
  const hayInterpolados = useMemo(() => {
    void version
    return [...trayectorias.current.values()].some((s) => s.some((m) => m?.interpolado))
  }, [version])

  const rellenarHuecosCortos = () => {
    let frames = 0
    for (const { id, h } of huecosCortos) {
      const serie = trayectorias.current.get(id)!
      for (const { indice, muestra: m } of interpolarHueco(serie, tabla.tiempos, h)) {
        serie[indice] = m
        frames++
      }
    }
    setAviso({
      texto: `Rellenados ${huecosCortos.length} hueco${huecosCortos.length === 1 ? '' : 's'} (${frames} posiciones interpoladas, en azul en la franja y a trazos en la gráfica).`,
    })
    setVersion((v) => v + 1)
  }

  const quitarInterpolados = () => {
    // Vuelven a ser huecos: frames sin posición fiable, como los dejó el seguidor.
    for (const serie of trayectorias.current.values()) {
      serie.forEach((m, i) => {
        if (m?.interpolado) serie[i] = { t: m.t, x: NaN, y: NaN, calidad: 0, editadoManual: false }
      })
    }
    setAviso({ texto: 'Quitado lo interpolado: esos frames vuelven a ser huecos.' })
    setVersion((v) => v + 1)
  }

  // ---- Capa de dibujo ----
  const dibujar = useCallback(
    (ctx: CanvasRenderingContext2D, escala: number) => {
      void version
      if (mostrado === null) return
      const base = 2 * escala // 2 px de pantalla
      // Segmentos de la articulación.
      const p = (id: IdMarcador) => muestra(id, mostrado)
      ctx.lineCap = 'round'
      for (const s of [articulacion.proximal, articulacion.distal]) {
        const a = p(s.desde)
        const b = p(s.hasta)
        if (!valida(a) || !valida(b)) continue
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = base
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ids.forEach((id, k) => {
        const color = COLORES_MARCADOR[k % COLORES_MARCADOR.length]!
        // Estela de los últimos frames.
        ctx.strokeStyle = color
        ctx.lineWidth = base * 0.6
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        let empezado = false
        for (let i = Math.max(0, mostrado - ESTELA); i <= mostrado; i++) {
          const m = muestra(id, i)
          if (!valida(m)) {
            empezado = false
            continue
          }
          if (empezado) ctx.lineTo(m.x, m.y)
          else ctx.moveTo(m.x, m.y)
          empezado = true
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        const m = muestra(id, mostrado)
        if (!valida(m)) return
        ctx.lineWidth = base
        ctx.strokeStyle = '#000'
        ctx.beginPath()
        ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = color
        ctx.lineWidth = base * 0.7
        // Interpolado: círculo a trazos (no es una detección).
        if (m.interpolado) ctx.setLineDash([base * 1.5, base * 1.5])
        ctx.beginPath()
        ctx.arc(m.x, m.y, base * 4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        if (m.editadoManual) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(m.x, m.y, base * 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    },
    [version, mostrado, ids, muestra, articulacion],
  )

  // ---- Estado por frame para la franja y ángulo actual ----
  const estadosFrames = useMemo<EstadoFrame[]>(() => {
    void version
    const r: EstadoFrame[] = new Array(total)
    for (let i = 0; i < total; i++) {
      let hay = false
      let perdido = false
      let manual = false
      let interpolado = false
      for (const id of ids) {
        const m = muestra(id, i)
        if (!m) continue
        hay = true
        if (m.editadoManual) manual = true
        else if (m.interpolado) interpolado = true
        else if (!valida(m)) perdido = true
      }
      r[i] = perdido ? 'perdido' : interpolado ? 'interpolado' : manual ? 'manual' : hay ? 'seguido' : 'vacio'
    }
    return r
  }, [version, total, ids, muestra])

  const angulo = useMemo(() => {
    void version
    if (mostrado === null) return NaN
    const puntos = new Map<IdMarcador, Vec3>()
    for (const id of ids) {
      const m = muestra(id, mostrado)
      if (valida(m)) puntos.set(id, aCanonico(m.x, m.y, orientacion))
    }
    return anguloArticular(articulacion, puntos)
  }, [version, mostrado, ids, muestra, orientacion, articulacion])

  // Redondeado a la décima que se muestra (+ 0 evita «−0,0»), para que la etiqueta
  // (flexión / hiperextensión) concuerde con el número visible.
  const anguloRedondeado = Math.round(angulo * 10) / 10 + 0

  // Serie completa del ángulo para la gráfica: misma regla de huecos que el valor
  // en directo (marcador ausente o perdido = sin valor). Lo interpolado a
  // petición tiene valor, pero va marcado y se dibuja aparte.
  const serie = useMemo(() => {
    void version
    if (orientacion.plano !== articulacion.plano) return []
    const porMarcador: Record<IdMarcador, Muestra2D[]> = {}
    for (const id of ids) porMarcador[id] = (trayectorias.current.get(id) ?? []).filter((m): m is Muestra2D => m !== undefined)
    return serieAngular(articulacion, porMarcador, orientacion)
  }, [version, ids, orientacion, articulacion])
  const resumen = useMemo(() => resumirSerie(serie), [serie])
  const filtrado = useFiltrado({
    trayectorias,
    version,
    ids,
    tabla,
    ajustes,
    articulacion,
    orientacion,
    congelado: seguimiento.estado === 'siguiendo',
  })
  const anguloFiltrado = mostrado === null ? NaN : filtrado.anguloEn(mostrado)
  const instantesInterpolados = useMemo(() => serie.filter((p) => p.interpolado).length, [serie])
  const buscarEnTiempo = useCallback(
    (t: number) => {
      const i = indiceMasCercano(tabla, t)
      if (i >= 0) ir(i)
    },
    [tabla, ir],
  )
  const est = useMemo(() => estadisticas(tabla), [tabla])
  const t = mostrado === null ? null : tabla.tiempos[mostrado]!
  const siguiendo = seguimiento.estado === 'siguiendo'

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <LienzoVideo
            ancho={info.ancho}
            alto={info.alto}
            lienzo={lienzo}
            dibujar={dibujar}
            interactivo={!!seleccionado && !siguiendo && mostrado === deseado}
            onToque={colocar}
            previsualizar={seleccionado ? previsualizar : undefined}
          />
          {mostrado === null && !error && (
            <p className="absolute inset-0 grid place-items-center text-texto-2">Decodificando…</p>
          )}
          {seleccionado && !siguiendo && (
            <p className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-fondo/85 px-2 py-1 text-sm">
              <span
                className="size-3 rounded-full"
                style={{ background: COLORES_MARCADOR[ids.indexOf(seleccionado) % COLORES_MARCADOR.length] }}
              />
              Toca: {nombreCorto(modelo.marcadores.find((x) => x.id === seleccionado)!.nombre)}
            </p>
          )}
        </div>

        {errorToque && (
          // Debajo del vídeo y no encima: un mensaje encima tapaba casi toda la
          // imagen en un móvil, y el siguiente toque (aunque fuera sobre el
          // gomet) caía en el mensaje en vez de marcar.
          <div data-testid="error-toque" className="flex flex-col gap-2 rounded-md border border-red-400/60 bg-fondo p-2 text-sm text-red-200">
            <p>{errorToque.texto}</p>
            {errorToque.detalle && <p className="font-mono text-xs text-texto-2">{errorToque.detalle}</p>}
            <div className="flex flex-wrap gap-2">
              {errorToque.aOjo && (
                <button
                  type="button"
                  onClick={() => {
                    const { id, i, x, y } = errorToque.aOjo!
                    ponerManual(id, i, x, y)
                  }}
                  className="rounded-md border border-borde px-3 py-2 text-texto"
                >
                  Colocarlo aquí a ojo
                </button>
              )}
              <button type="button" onClick={() => setErrorToque(null)} className="rounded-md border border-borde px-3 py-2 text-texto-2">
                Cerrar
              </button>
            </div>
            {errorToque.aOjo && (
              <p className="text-xs text-texto-2">
                A ojo: para un frame en que el gomet no se ve (tapado, movido). Queda como marcado a mano, justo donde has
                soltado el dedo, sin ajustarlo al centro de ningún gomet.
              </p>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between font-mono text-sm" data-testid="posicion">
          <span>
            t = <span className="text-acento">{t === null ? '—' : fmt(t, 3)} s</span>
          </span>
          <span className="text-texto-2">
            frame {mostrado === null ? '—' : mostrado + 1} / {total}
            {mostrado !== deseado && ' …'}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={total - 1}
            step={1}
            value={deseado}
            onChange={(e) => ir(Number(e.target.value))}
            aria-label="Posición en el vídeo"
            className="w-full accent-acento"
          />
          <BandaFrames estados={estadosFrames} />
        </div>

        <div className="flex gap-2">
          <BotonPaso etiqueta={`Retroceder ${SALTO} frames`} accion={() => mover(-SALTO)}>
            <ChevronDoubleLeftIcon className="size-6" />
          </BotonPaso>
          <BotonPaso etiqueta="Frame anterior" accion={() => mover(-1)}>
            <ChevronLeftIcon className="size-7" />
          </BotonPaso>
          <BotonPaso etiqueta="Frame siguiente" accion={() => mover(1)}>
            <ChevronRightIcon className="size-7" />
          </BotonPaso>
          <BotonPaso etiqueta={`Avanzar ${SALTO} frames`} accion={() => mover(SALTO)}>
            <ChevronDoubleRightIcon className="size-6" />
          </BotonPaso>
        </div>

        <TextoGuardado g={guardado} />

        <section className="rounded-2xl border border-borde bg-panel p-3">
          <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
            <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">{articulacion.nombre.replace(/\s*\(.*\)$/, '')}</h2>
            <span className="font-mono text-xs text-texto-2">{articulacion.positivo} +</span>
          </div>
          <GraficaAngulo
            serie={serie}
            filtrada={filtrado.serie}
            desde={tabla.tiempos[0]!}
            hasta={tabla.tiempos[total - 1]!}
            tActual={deseado < total ? tabla.tiempos[deseado]! : null}
            onBuscar={buscarEnTiempo}
          />
          <p className="mt-1 px-1 font-mono text-xs text-texto-2" data-testid="resumen-grafica">
            {resumen.max && resumen.min ? (
              <>
                <span className="whitespace-nowrap">
                  máx. {grados(resumen.max.valor)}° (t = {fmt(resumen.max.t, 2)} s)
                </span>{' '}
                ·{' '}
                <span className="whitespace-nowrap">
                  mín. {grados(resumen.min.valor)}° (t = {fmt(resumen.min.t, 2)} s)
                </span>
                {resumen.huecos > 0 && <span className="whitespace-nowrap text-red-300"> · {resumen.huecos} sin valor</span>}
                {instantesInterpolados > 0 && <span className="whitespace-nowrap text-interpolado"> · {instantesInterpolados} interpolados</span>}
              </>
            ) : (
              'Sin datos todavía: marca los gomets y pulsa «Seguir desde aquí».'
            )}
          </p>
          <p className="mt-1 px-1 text-xs text-texto-2">
            <span className="text-acento">Ámbar</span>: medido · <span className="text-texto">línea clara</span>: filtrado a{' '}
            {fmt(filtrado.corte, 1)} Hz. Toca o arrastra la gráfica para ir a ese instante.
          </p>
        </section>

        {error && <p className="rounded-md border border-red-400/50 p-3 text-red-300">{error}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Marcadores</h2>
            <span className="text-sm text-texto-2">pierna {lado === 'izq' ? 'izquierda' : 'derecha'} (la que ve la cámara)</span>
          </div>

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Marcador a colocar">
            {modelo.marcadores.map((mk, k) => {
              const m = mostrado === null ? undefined : muestra(mk.id, mostrado)
              const estado = valida(m) ? (m.editadoManual ? 'a mano' : m.interpolado ? 'interpolado' : 'seguido') : m ? 'perdido' : '—'
              const activo = seleccionado === mk.id
              return (
                <button
                  key={mk.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  disabled={siguiendo}
                  onClick={() => setSeleccionado(activo ? null : mk.id)}
                  title={mk.nombre}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-sm disabled:opacity-50 ${activo ? 'border-acento text-texto' : 'border-borde text-texto-2'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full" style={{ background: COLORES_MARCADOR[k % COLORES_MARCADOR.length] }} />
                    {nombreCorto(mk.nombre)}
                  </span>
                  <span className={`font-mono text-xs ${estado === 'perdido' ? 'text-red-300' : ''}`}>{estado}</span>
                </button>
              )
            })}
          </div>

          <p className="text-sm text-texto-2">
            {siguiendo
              ? 'Siguiendo los gomets…'
              : seleccionado
                ? `Toca el ${nombreCorto(modelo.marcadores.find((x) => x.id === seleccionado)!.nombre).toLowerCase()} en la imagen. Mantén el dedo para ver la lupa: cuando el gomet salga rodeado por un anillo, suelta y el marcador irá a su centro.`
                : listoParaSeguir
                  ? 'Los tres marcadores están en este frame: ya puedes seguir. Para corregir uno, elígelo y arrástralo con la lupa.'
                  : 'Elige un marcador para colocarlo o corregirlo en este frame.'}
          </p>

          {(() => {
            // Quitar una marca a mano equivocada del marcador elegido, en este frame.
            const m = seleccionado && mostrado !== null ? muestra(seleccionado, mostrado) : undefined
            if (siguiendo || !seleccionado || mostrado === null || !m?.editadoManual) return null
            return (
              <button
                type="button"
                onClick={() => quitarManual(seleccionado, mostrado)}
                className="flex items-center justify-center gap-2 self-start rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
              >
                <TrashIcon className="size-4" /> Quitar la marca a mano de este frame
              </button>
            )
          })()}

          {siguiendo ? (
            <div className="flex flex-col gap-2">
              <div className="h-2 overflow-hidden rounded-full bg-borde">
                <div className="h-full bg-acento" style={{ width: `${Math.round(seguimiento.progreso * 100)}%` }} />
              </div>
              <button
                type="button"
                onClick={() => worker.current?.postMessage({ tipo: 'cancelar' } satisfies AlWorker)}
                className="flex items-center justify-center gap-2 rounded-md border border-borde px-4 py-3"
              >
                <StopIcon className="size-5" /> Parar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={seguirDesdeAqui}
              disabled={!listoParaSeguir}
              className="flex items-center justify-center gap-2 rounded-md bg-acento px-4 py-3 font-medium text-fondo disabled:opacity-40"
            >
              <PlayIcon className="size-5" /> Seguir desde aquí
            </button>
          )}

          {aviso && (
            <div className="flex flex-col gap-2 rounded-md border border-acento/50 p-3 text-sm" role="status">
              <p data-testid="aviso">{aviso.texto}</p>
              {aviso.detalle && (
                <details className="text-texto-2">
                  <summary className="cursor-pointer">Por qué (para diagnosticar)</summary>
                  <pre className="mt-1 font-mono text-xs whitespace-pre-wrap">{aviso.detalle}</pre>
                </details>
              )}
              {aviso.irA !== undefined && (
                <button type="button" onClick={() => ir(aviso.irA!)} className="self-start rounded-md border border-borde px-3 py-2">
                  Ir al primer frame con hueco ({aviso.irA + 1})
                </button>
              )}
            </div>
          )}

          {!siguiendo && (huecosCortos.length > 0 || hayInterpolados) && (
            <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="huecos-cortos">
              {huecosCortos.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={rellenarHuecosCortos}
                    className="flex items-center justify-center gap-2 rounded-md border border-interpolado/60 px-4 py-3 text-interpolado"
                  >
                    <SparklesIcon className="size-5" /> Rellenar {huecosCortos.length} hueco{huecosCortos.length === 1 ? '' : 's'} corto
                    {huecosCortos.length === 1 ? '' : 's'}
                  </button>
                  <p className="text-xs text-texto-2">
                    Huecos de {fmt(HUECO_MAX_S, 1)} s o menos entre dos posiciones fiables. Se rellenan con una curva suave que
                    sigue el movimiento de antes y de después, y quedan marcados como interpolados.
                  </p>
                </>
              )}
              {hayInterpolados && (
                <button type="button" onClick={quitarInterpolados} className="self-start rounded-md border border-borde px-3 py-2 text-sm text-texto-2">
                  Quitar lo interpolado
                </button>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-borde pt-3">
            <span className="text-texto-2">{nombreCorto(articulacion.nombre.replace(/\s*\(.*\)$/, ''))}</span>
            <span className="font-mono text-2xl" data-testid="angulo">
              {Number.isNaN(angulo) ? '—' : `${grados(angulo)}°`}
              {anguloRedondeado !== 0 && !Number.isNaN(angulo) && (
                <span className="ml-2 text-sm text-texto-2">{anguloRedondeado > 0 ? articulacion.positivo : articulacion.negativo}</span>
              )}
            </span>
          </div>
        </section>

        <PanelFiltro
          ajustes={ajustes}
          onCambiar={cambiarAjustes}
          corte={filtrado.corte}
          fs={filtrado.fs}
          tramosCortos={filtrado.tramosCortos}
          anguloTexto={Number.isNaN(anguloFiltrado) ? '—' : `${grados(anguloFiltrado)}°`}
          deshabilitado={siguiendo}
        />

        <section className="rounded-2xl border border-borde bg-panel p-4 font-mono text-sm">
          <h2 className="text-xs tracking-wider text-texto-2 uppercase">Datos del vídeo</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-texto-2">Archivo</dt>
            <dd className="truncate" title={info.nombre}>{info.nombre}</dd>
            <dt className="text-texto-2">Formato</dt>
            <dd>{info.formato} · {info.codec}</dd>
            <dt className="text-texto-2">Tamaño</dt>
            <dd>{info.ancho} × {info.alto} px{info.rotacion ? ` (girado ${info.rotacion}°)` : ''}</dd>
            <dt className="text-texto-2">Duración</dt>
            <dd>{fmt(info.duracion, 2)} s</dd>
            <dt className="text-texto-2">Frames</dt>
            <dd>{total}</dd>
            <dt className="text-texto-2">fps medio</dt>
            <dd>{Number.isNaN(est.fpsMedio) ? '—' : fmt(est.fpsMedio, 2)}</dd>
            <dt className="text-texto-2">Entre frames</dt>
            <dd>
              {Number.isNaN(est.pasoMin) ? '—' : `${fmt(est.pasoMin * 1000, 1)}–${fmt(est.pasoMax * 1000, 1)} ms`}
              {est.variable && <span className="text-acento"> · variable</span>}
            </dd>
            <dt className="text-texto-2">Persona</dt>
            <dd>{orientacion.plano === 'sagital' ? `mira a la ${orientacion.mira}` : `vista desde ${orientacion.ve}`}</dd>
            <dt className="text-texto-2">Decodificar</dt>
            <dd>{msDecodificar === null ? '—' : `${fmt(msDecodificar, 0)} ms`}</dd>
          </dl>
        </section>
      </div>
    </div>
  )
}
