import type { OrientacionVista } from '../../core/geometria/canonico'
import type { EstadisticasFrames } from '../../core/tiempo/tablaFrames'
import type { InfoVideo } from '../../media/video'
import { fmt } from './formato'
import { InfoGlosario } from '../glosario/Glosario'

interface Props {
  info: InfoVideo
  total: number
  est: EstadisticasFrames
  orientacion: OrientacionVista
  /** Lo que tardó el último frame en decodificarse y cómo se consiguió (caché, seguido o clave). */
  msDecodificar: number | null
  lectura: string | null
}

/** Pestaña «Vídeo»: archivo, formato, fps y cómo se está decodificando. */
export default function DatosVideo({ info, total, est, orientacion, msDecodificar, lectura }: Props) {
  return (
    <section className="rounded-2xl border border-borde bg-panel p-4 font-mono text-sm">
              <h2 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
                Datos del vídeo <InfoGlosario id="fps" tema="el tiempo del vídeo y los fps variables" className="-my-1.5" />
              </h2>
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
                <dd>{msDecodificar === null ? '—' : `${fmt(msDecodificar, 0)} ms`}{lectura && ` · ${lectura}`}</dd>
              </dl>
            </section>
  )
}
