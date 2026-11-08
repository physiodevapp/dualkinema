import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Vec3 } from '../../core/geometria/vector'
import { vec3 } from '../../core/geometria/vector'
import { idPose, LINEAS_ESQUELETO } from '../../core/pose/puntos'
import { camaraDe, type Calibracion3D } from '../../core/tresd/calibracion3d'
import { enMarco, type Trayectorias3D } from '../../core/tresd/puntos3d'
import { aLienzo, aristasCamara, ELEVACION_MAX, ELEVACION_MIN, encuadre, encuadreConZoom, escalaMaxima, proyectarOrto, VISTA_INICIAL, type PuntoDeVista } from '../../core/tresd/vista3d'

interface Props {
  readonly tr: Trayectorias3D
  readonly calibracion: Calibracion3D
  readonly imagenes: readonly [{ readonly ancho: number; readonly alto: number }, { readonly ancho: number; readonly alto: number }]
  /** Frame de A que se dibuja (el del cursor común), o null. */
  readonly indice: number | null
  /** Los puntos del esqueleto ajustado en un frame (fase 7): si se dan, se dibujan ellos en lugar de los triangulados. */
  readonly puntos?: (indice: number) => ReadonlyMap<string, Vec3> | null
}

/** Grados de giro por px de arrastre. */
const GIRO_POR_PX = (0.5 * Math.PI) / 180
const color = (nombre: string, defecto: string) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || defecto

/**
 * El monigote 3D (fase 6, paso 5): los puntos del cuerpo en el frame del cursor común, sobre una rejilla del suelo, con las
 * dos cámaras en su sitio; se gira arrastrando con el dedo (proyección ortográfica en un `<canvas>` 2D, sin librería 3D).
 * Pierna derecha de la persona en ámbar, izquierda en gris (como el esqueleto sobre el vídeo). Se acerca y se aleja
 * pellizcando con dos dedos o con la rueda del ratón: de partida, la persona en toda la toma (no cambia de tamaño al
 * moverse); lo más lejos, con las dos cámaras y el suelo; lo más cerca, el cuerpo dos veces el alto del recuadro, y la vista
 * sigue entonces a la pelvis (`encuadreConZoom`).
 */
export default function Monigote3D({ tr, calibracion, imagenes, indice, puntos }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [vista, setVista] = useState<PuntoDeVista>(VISTA_INICIAL)
  const [ancho, setAncho] = useState(320)
  const arrastre = useRef<{ x: number; y: number; vista: PuntoDeVista } | null>(null)
  // Zoom respecto al encuadre de la persona (1 = de partida); los límites, del último dibujo (dependen del giro y del tamaño).
  const [zoom, setZoom] = useState(1)
  const limites = useRef({ min: 0.1, max: 10 })
  const limitar = (z: number) => Math.min(limites.current.max, Math.max(limites.current.min, z))
  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const pellizco = useRef<{ distancia: number; zoom: number } | null>(null)
  const alto = Math.round(ancho * 0.75)

  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const obs = new ResizeObserver(() => setAncho(Math.max(160, Math.round(c.clientWidth))))
    obs.observe(c)
    return () => obs.disconnect()
  }, [])

  // Lo fijo de la toma: las cámaras en el marco de la escena, su tamaño y la extensión del suelo.
  const escena = useMemo(() => {
    const aMundo = (X: Vec3) => enMarco(calibracion, tr.marco ?? null, X)
    const todos: Vec3[] = []
    for (const s of tr.series.values()) for (const p of s) if (p && p.calidad > 0) todos.push(vec3(p.x, p.y, p.z))
    const camaras = calibracion.camaras.map((g, i) => aristasCamara(camaraDe(g), imagenes[i]!.ancho, imagenes[i]!.alto, tr.enMetros ? 0.3 : 0.07, aMundo))
    // La extensión del suelo: el percentil 98 de la persona (un punto mal triangulado muy lejos no la dispara) y las cámaras.
    const absolutos = todos.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))).sort((x, y) => x - y)
    const persona = absolutos.length ? absolutos[Math.floor(0.98 * (absolutos.length - 1))]! : 1
    const ext = Math.max(persona, ...camaras.flat(2).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
    const paso = tr.enMetros ? 0.5 : 0.1
    // Como mucho 40 líneas por lado.
    const lado = Math.min(Math.ceil(ext / paso), 20) * paso
    const rejilla: (readonly [Vec3, Vec3])[] = []
    for (let k = -lado; k <= lado + 1e-9; k += paso) {
      rejilla.push([vec3(k, -lado, 0), vec3(k, lado, 0)], [vec3(-lado, k, 0), vec3(lado, k, 0)])
    }
    // La altura del cuerpo: el percentil 90 de lo que ocupa en vertical en cada frame (de los pies a los hombros).
    const alturas: number[] = []
    const n = tr.tiempos.length
    for (let i = 0; i < n; i++) {
      let lo = Infinity
      let hi = -Infinity
      for (const s of tr.series.values()) {
        const p = s[i]
        if (p && p.calidad > 0 && Number.isFinite(p.z)) {
          lo = Math.min(lo, p.z)
          hi = Math.max(hi, p.z)
        }
      }
      if (hi > lo) alturas.push(hi - lo)
    }
    alturas.sort((a, b) => a - b)
    const alturaCuerpo = alturas.length ? alturas[Math.floor(0.9 * (alturas.length - 1))]! : 0
    return { todos, camaras, rejilla, alturaCuerpo }
  }, [tr, calibracion, imagenes])

  useEffect(() => {
    const c = lienzo.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(ancho * dpr)
    c.height = Math.round(alto * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, ancho, alto)
    // Los puntos del frame (un frame sin esqueleto ajustado enseña los triangulados).
    const delEsqueleto = indice === null ? null : (puntos?.(indice) ?? null)
    const en = (id: string): Vec3 | null => {
      if (indice === null) return null
      if (delEsqueleto) return delEsqueleto.get(id) ?? null
      const p = tr.series.get(id)?.[indice]
      return p && p.calidad > 0 && Number.isFinite(p.x) ? vec3(p.x, p.y, p.z) : null
    }
    const eEscena = encuadre([...escena.camaras.flat(2), ...escena.rejilla.flat()], vista, ancho, alto, 12)
    const ePersona = escena.todos.length ? encuadre(escena.todos, vista, ancho, alto, 16) : eEscena
    const escalaMax = escalaMaxima(escena.alturaCuerpo, alto)
    limites.current = { min: eEscena.escala / ePersona.escala, max: Math.max(1, escalaMax / ePersona.escala) }
    const ci = en(idPose('cadera', 'izq'))
    const cd = en(idPose('cadera', 'der'))
    const pelvis = ci && cd ? proyectarOrto(vec3((ci.x + cd.x) / 2, (ci.y + cd.y) / 2, (ci.z + cd.z) / 2), vista) : null
    const e = encuadreConZoom(eEscena, ePersona, pelvis, ePersona.escala * zoom, escalaMax)
    const px = (p: Vec3) => aLienzo(proyectarOrto(p, vista), e, ancho, alto)
    const linea = (a: Vec3, b: Vec3) => {
      const p = px(a)
      const q = px(b)
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
    }
    // Suelo.
    ctx.strokeStyle = color('--color-borde', '#2a2f38')
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const [a, b] of escena.rejilla) linea(a, b)
    ctx.stroke()
    // Cámaras.
    ctx.strokeStyle = color('--color-texto-2', '#a3a7ae')
    ctx.beginPath()
    for (const aristas of escena.camaras) for (const [a, b] of aristas) linea(a, b)
    ctx.stroke()
    if (indice === null) return
    // Esqueleto: primero lo de detrás (la sombra en el suelo, luego las líneas por profundidad).
    const segmentos = LINEAS_ESQUELETO.map(([a, b]) => ({ a: en(a), b: en(b), der: a.endsWith('_der') && b.endsWith('_der'), izq: a.endsWith('_izq') && b.endsWith('_izq') }))
      .filter((s): s is { a: Vec3; b: Vec3; der: boolean; izq: boolean } => !!s.a && !!s.b)
      .sort((s, t) => proyectarOrto(s.a, vista).prof + proyectarOrto(s.b, vista).prof - proyectarOrto(t.a, vista).prof - proyectarOrto(t.b, vista).prof)
    ctx.strokeStyle = color('--color-borde', '#2a2f38')
    ctx.lineWidth = 3
    ctx.beginPath()
    for (const s of segmentos) linea(vec3(s.a.x, s.a.y, 0), vec3(s.b.x, s.b.y, 0))
    ctx.stroke()
    for (const s of segmentos) {
      ctx.strokeStyle = s.der ? color('--color-acento', '#f2a65a') : s.izq ? color('--color-texto-2', '#a3a7ae') : color('--color-texto', '#e8e6e3')
      ctx.lineWidth = 3
      ctx.beginPath()
      linea(s.a, s.b)
      ctx.stroke()
    }
  }, [ancho, alto, escena, vista, indice, tr, puntos, zoom])

  // La rueda del ratón acerca y aleja (con un oyente no pasivo: si no, la página se desplazaría a la vez).
  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const rueda = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => limitar(z * Math.exp(-e.deltaY * 0.0015)))
    }
    c.addEventListener('wheel', rueda, { passive: false })
    return () => c.removeEventListener('wheel', rueda)
  }, [])

  const distancia = () => {
    const [p, q] = [...dedos.current.values()]
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0
  }
  const empezar = (e: React.PointerEvent) => {
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (dedos.current.size === 2) {
      // Dos dedos: se pellizca (y no se gira).
      arrastre.current = null
      pellizco.current = { distancia: distancia(), zoom }
    } else arrastre.current = { x: e.clientX, y: e.clientY, vista }
  }
  const mover = (e: React.PointerEvent) => {
    if (dedos.current.has(e.pointerId)) dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pellizco.current
    if (p && dedos.current.size >= 2) {
      const d = distancia()
      if (p.distancia > 0 && d > 0) setZoom(limitar(p.zoom * (d / p.distancia)))
      return
    }
    const a = arrastre.current
    if (!a) return
    const azimut = a.vista.azimut - (e.clientX - a.x) * GIRO_POR_PX
    const elevacion = Math.min(ELEVACION_MAX, Math.max(ELEVACION_MIN, a.vista.elevacion + (e.clientY - a.y) * GIRO_POR_PX))
    setVista({ azimut, elevacion })
  }
  const soltar = (e: React.PointerEvent) => {
    dedos.current.delete(e.pointerId)
    pellizco.current = null
    // Si queda un dedo, sigue girando desde donde está (sin saltar).
    const [resto] = [...dedos.current.values()]
    arrastre.current = resto ? { x: resto.x, y: resto.y, vista } : null
  }

  return (
    <div className="relative">
      <canvas
        ref={lienzo}
        className="block w-full touch-none rounded-md border border-borde bg-fondo"
        style={{ height: alto }}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        role="img"
        aria-label="El cuerpo en 3D en el instante del cursor, con el suelo y las dos cámaras. Arrastra para girarlo; pellizca o usa la rueda para acercarlo."
        data-testid="monigote-3d"
        data-azimut={Math.round((vista.azimut * 180) / Math.PI)}
        data-zoom={zoom.toFixed(2)}
      />
      <button
        type="button"
        onClick={() => {
          setVista(VISTA_INICIAL)
          setZoom(1)
        }}
        className="absolute top-2 right-2 rounded-md border border-borde bg-panel p-1.5 text-texto-2"
        aria-label="Volver a la vista de partida"
        title="Volver a la vista de partida"
      >
        <ArrowPathIcon className="size-4" />
      </button>
    </div>
  )
}
