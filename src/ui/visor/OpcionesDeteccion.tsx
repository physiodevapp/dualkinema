import type { TamanoModeloPose } from '../../core/modelo/tipos'
import { esRtmpose, HAY_RTMPOSE, MODELOS_POSE, PASO_COMPARAR, type ProgresoDeteccion } from './useDeteccionPose'

interface Props {
  modelo: TamanoModeloPose
  onModelo: (m: TamanoModeloPose) => void
  /** Solo 1 de cada `PASO_COMPARAR` frames (RTMPose, para comparar deprisa). */
  soloAlgunos: boolean
  onSoloAlgunos: (v: boolean) => void
  deshabilitado: boolean
  /** Versión de la tira del vídeo grande (letra pequeña). */
  compacto?: boolean
  /** Sufijo de los `data-testid` (dos copias en la página: la tarjeta y la tira). */
  sufijo?: string
}

/** El modelo con que se detecta el cuerpo y, con RTMPose, «1 de cada 4 frames». En la tarjeta de «Marcar» y en el vídeo grande. */
export default function OpcionesDeteccion({ modelo, onModelo, soloAlgunos, onSoloAlgunos, deshabilitado, compacto, sufijo = '' }: Props) {
  return (
    <>
      <label className={`flex items-center gap-2 ${compacto ? 'text-xs text-texto-2' : 'text-sm'}`}>
        Modelo
        <select
          value={modelo}
          disabled={deshabilitado}
          onChange={(e) => onModelo(e.target.value as TamanoModeloPose)}
          className="min-w-0 flex-1 rounded-md border border-borde bg-fondo px-2 py-1 text-texto"
          data-testid={`modelo-pose${sufijo}`}
        >
          {MODELOS_POSE.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </label>
      {HAY_RTMPOSE && esRtmpose(modelo) && (
        <label className={`flex items-center gap-2 ${compacto ? 'text-xs' : 'text-sm'} text-texto-2`}>
          <input type="checkbox" checked={soloAlgunos} disabled={deshabilitado} onChange={(e) => onSoloAlgunos(e.target.checked)} data-testid={`solo-algunos${sufijo}`} />
          Solo 1 de cada {PASO_COMPARAR} frames (para comparar con «Calibrar en 3D»: el esqueleto y los ángulos 3D necesitan todos)
        </label>
      )}
    </>
  )
}

const minutos = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`)

/** Mientras se detecta: en qué va (GPU o CPU con sus hilos), a qué ritmo y cuánto queda. */
export function DetalleDeteccion({ progreso }: { progreso: ProgresoDeteccion | null }) {
  if (progreso?.fase === 'cargando')
    return progreso.texto ? (
      <p className="font-mono text-xs text-texto-2" data-testid="detalle-deteccion">
        {progreso.texto}…
      </p>
    ) : null
  if (!progreso || !progreso.delegado) return null
  const partes = [
    progreso.delegado === 'CPU' && progreso.hilos ? `CPU, ${progreso.hilos} ${progreso.hilos === 1 ? 'hilo' : 'hilos'}` : progreso.delegado,
    ...(progreso.ritmo ? [`${progreso.ritmo.toLocaleString('es-ES', { maximumFractionDigits: progreso.ritmo < 10 ? 1 : 0 })} frames/s`] : []),
    ...(progreso.restanteS !== undefined ? [`quedan ~${minutos(progreso.restanteS)}`] : []),
  ]
  return (
    <p className="font-mono text-xs text-texto-2" data-testid="detalle-deteccion">
      {partes.join(' · ')}
    </p>
  )
}
