import { CubeIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { marcadoresSinMarcadores } from '../../core/pose/catalogo'
import { esPuntoMedio } from '../../core/pose/puntos'
import { movimiento, verticalCamara, type Sensores } from '../../core/sensores/sensores'
import { pasoTipico } from '../../core/sincronia/evento'
import { INSTANTES_MINIMOS, informe3D, nombrePunto, resumir3D, textoAviso, type Calibracion3D } from '../../core/tresd/calibracion3d'
import { correspondencias, instantesConCorrespondencias, type VistaParaEmparejar } from '../../core/tresd/correspondencias'
import type { AlWorkerCalibracion3D, DelWorkerCalibracion3D } from '../../workers/protocolo'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import type { VistaViva } from './vistas'

interface Props {
  readonly a: VistaViva
  readonly b: VistaViva
  readonly calibracion: Calibracion3D | null
  readonly estatura: number | null
  readonly onCalibracion: (c: Calibracion3D | null, estatura: number | null) => void
  /** Mientras se sigue o se detecta en alguna vista (las trayectorias cambian). */
  readonly deshabilitado: boolean
}

/** El tramo que se recomienda grabar para calibrar: los primeros segundos, con unos pasos por la zona. */
const PRIMEROS_S = 10
/** Los puntos del cuerpo que se emparejan: los 12 del modelo (los puntos medios salen de ellos). */
const IDS = marcadoresSinMarcadores({ plano: 'sagital', mira: 'derecha' }).filter((id) => !esPuntoMedio(id))

const paraEmparejar = (w: VistaViva): VistaParaEmparejar => ({ series: w.series, tabla: w.tabla, desfase: w.desfaseS, paso: pasoTipico(w.tabla) })

/** Un número escrito con coma o punto; null si está vacío o no es un número positivo. */
function leerNumero(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'))
  return texto.trim() && Number.isFinite(n) && n > 0 ? n : null
}

type Estado = { readonly fase: 'parado' } | { readonly fase: 'calculando' } | { readonly fase: 'error'; readonly mensaje: string } | { readonly fase: 'pocos' }

/**
 * «Calibrar en 3D» (fase 6, paso 3), en la pestaña «Vídeo» con dos vistas: con el cuerpo detectado en las dos, calcula
 * dónde está cada móvil respecto al otro y su focal a partir de los puntos que ven las dos a la vez y de la vertical del
 * acelerómetro de cada uno (`core/tresd/`), en un worker; los metros salen de la estatura (o de la distancia con cinta).
 * Enseña el error de reproyección (en total y por punto del cuerpo), el ángulo entre los móviles, su distancia y altura, el
 * campo de visión de cada uno y los avisos, con un informe para copiar.
 */
export default function Calibrar3D({ a, b, calibracion, estatura, onCalibracion, deshabilitado }: Props) {
  const [textoEstatura, setTextoEstatura] = useState(estatura ? fmt(estatura * 100, 0) : '')
  const [textoCinta, setTextoCinta] = useState('')
  const [primeros, setPrimeros] = useState(false)
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' })
  const [copiado, setCopiado] = useState(false)
  // Los sensores que no venían con la vista se leen del MP4 al calibrar (un vídeo abierto con «Cargar vídeo»).
  const [leidos, setLeidos] = useState<readonly [Sensores | null, Sensores | null] | null>(null)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => worker.current?.terminate(), [])

  const tramo = primeros ? { desde: 0, hasta: PRIMEROS_S } : null
  // Las trayectorias cambian en sitio: la versión de cada vista dice cuándo volver a emparejar.
  const { version: va } = a
  const { version: vb } = b
  const corr = useMemo(
    () => correspondencias(paraEmparejar(a), paraEmparejar(b), IDS, { tramo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las series se modifican en sitio; la versión lo dice.
    [va, vb, a.desfaseS, b.desfaseS, primeros, a.series, b.series],
  )
  const instantes = instantesConCorrespondencias(corr)
  const sensores: readonly [Sensores | null, Sensores | null] = [a.sensores ?? leidos?.[0] ?? null, b.sensores ?? leidos?.[1] ?? null]
  const imagenes = [
    { ancho: a.info.ancho, alto: a.info.alto },
    { ancho: b.info.ancho, alto: b.info.alto },
  ] as const
  const distanciaPitido = b.sincronia.pitido?.distancia ?? null
  const vigente = calibracion && calibracion.vistas[0] === a.id && calibracion.vistas[1] === b.id ? calibracion : null
  const resumen = useMemo(
    () =>
      vigente
        ? resumir3D(vigente, { imagenes, distanciaPitido, movido: [!!(sensores[0] && movimiento(sensores[0])), !!(sensores[1] && movimiento(sensores[1]))], metodoSincronia: b.sincronia.metodo })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `imagenes` y `sensores` se rehacen en cada render con lo mismo.
    [vigente, a.info, b.info, distanciaPitido, sensores[0], sensores[1], b.sincronia.metodo],
  )

  const calibrar = async () => {
    const alt = leerNumero(textoEstatura)
    const estaturaM = alt === null ? null : alt > 3 ? alt / 100 : alt
    const cinta = leerNumero(textoCinta)
    if (instantes < INSTANTES_MINIMOS) {
      setEstado({ fase: 'pocos' })
      return
    }
    setEstado({ fase: 'calculando' })
    let s = sensores
    if (!s[0] || !s[1]) {
      const { leerMetadatosArchivo } = await import('../../media/grabaciones')
      const metas = await Promise.all([a, b].map((w, i) => (s[i] ? Promise.resolve(null) : leerMetadatosArchivo(w.archivo).catch(() => null))))
      s = [s[0] ?? metas[0]?.sensores ?? null, s[1] ?? metas[1]?.sensores ?? null]
      setLeidos(s)
    }
    worker.current?.terminate()
    const w = new Worker(new URL('../../workers/calibracion3d.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<DelWorkerCalibracion3D>) => {
      if (worker.current !== w) return
      const m = e.data
      if (m.tipo === 'hecho') {
        if (m.calibracion) {
          onCalibracion(m.calibracion, estaturaM)
          setEstado({ fase: 'parado' })
        } else setEstado({ fase: 'pocos' })
      } else setEstado({ fase: 'error', mensaje: m.mensaje })
      w.terminate()
      worker.current = null
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      if (worker.current !== w) return
      setEstado({ fase: 'error', mensaje: ev.message || 'no se ha podido cargar el cálculo. Recarga la página.' })
      worker.current = null
    }
    w.postMessage({
      tipo: 'calibrar',
      entrada: {
        vistas: [a.id, b.id],
        correspondencias: corr,
        imagenes,
        verticales: [s[0] ? verticalCamara(s[0]) : null, s[1] ? verticalCamara(s[1]) : null],
        tramo,
        estatura: estaturaM,
        distanciaCinta: cinta,
        fecha: new Date().toISOString(),
      },
    } satisfies AlWorkerCalibracion3D)
  }

  const cancelar = () => {
    worker.current?.terminate()
    worker.current = null
    setEstado({ fase: 'parado' })
  }

  const copiar = async () => {
    if (!vigente || !resumen) return
    const texto = informe3D(vigente, resumen, { estatura, distanciaPitido, metodoSincronia: b.sincronia.metodo })
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  const calculando = estado.fase === 'calculando'
  const unidad = resumen?.enMetros ? ' m' : ''
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="calibrar-3d">
      <h2 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
        Calibrar en 3D <InfoGlosario id="tres-d" tema="el 3D calibrado con la persona" className="-my-1.5" />
      </h2>
      <p className="text-xs text-texto-2">
        Con el cuerpo detectado en las dos vistas, se calcula dónde está cada móvil respecto al otro a partir de los puntos que ven los dos a la vez. Mejor
        con la toma de «Grabar con dos móviles» (lleva el acelerómetro) y sincronizada por el pitido.
      </p>
      <p className="font-mono text-sm" data-testid="instantes-3d">
        {instantes} instantes con las dos vistas{instantes < INSTANTES_MINIMOS ? ` (hacen falta ${INSTANTES_MINIMOS})` : ''}
      </p>
      {instantes < INSTANTES_MINIMOS && <p className="text-xs text-texto-2">Detecta el cuerpo en las dos vistas («Detectar el cuerpo», en «Marcar» de cada una).</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          <span className="flex items-center gap-1">
            Estatura (cm) <InfoGlosario id="escala-estatura" tema="la escala por la estatura" className="-my-1.5" />
          </span>
          <input
            inputMode="decimal"
            aria-label="Estatura (cm)"
            value={textoEstatura}
            onChange={(e) => setTextoEstatura(e.target.value)}
            placeholder="175"
            className="rounded-md border border-borde bg-fondo px-2 py-2 font-mono text-sm text-texto"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-2">
          Distancia entre móviles con cinta (m, opcional)
          <input
            inputMode="decimal"
            aria-label="Distancia entre móviles con cinta (m)"
            value={textoCinta}
            onChange={(e) => setTextoCinta(e.target.value)}
            placeholder="—"
            className="rounded-md border border-borde bg-fondo px-2 py-2 font-mono text-sm text-texto"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={primeros} onChange={(e) => setPrimeros(e.target.checked)} className="accent-acento" />
        Solo los primeros {PRIMEROS_S} s (los pasos por la zona)
      </label>
      {calculando ? (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm" role="status">
            Calculando…
          </p>
          <button type="button" onClick={cancelar} className="flex items-center gap-1 rounded-md border border-borde px-3 py-2">
            <XMarkIcon className="size-5" /> Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void calibrar()}
          disabled={deshabilitado || instantes < INSTANTES_MINIMOS}
          className="flex items-center justify-center gap-2 rounded-md border border-acento px-4 py-3 text-acento disabled:opacity-40"
        >
          <CubeIcon className="size-5" /> {vigente ? 'Volver a calibrar' : 'Calibrar en 3D'}
        </button>
      )}
      {estado.fase === 'pocos' && <p className="text-sm text-acento">No hay bastantes instantes con el cuerpo en las dos vistas para calibrar.</p>}
      {estado.fase === 'error' && <p className="text-sm text-acento">No se ha podido calibrar: {estado.mensaje}</p>}

      {vigente && resumen && (
        <div className="flex flex-col gap-2 rounded-md border border-borde p-3" data-testid="resultado-3d">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
            <dt className="flex items-center gap-1 text-texto-2">
              Error de reproyección <InfoGlosario id="reproyeccion" tema="el error de reproyección" className="-my-1.5" />
            </dt>
            <dd data-testid="error-reproyeccion">{fmt(vigente.errorMediano, 1)} px</dd>
            <dt className="text-texto-2">Ángulo entre móviles</dt>
            <dd data-testid="angulo-camaras">{fmt(resumen.anguloCamaras, 0)}°</dd>
            <dt className="text-texto-2">Distancia entre móviles</dt>
            <dd data-testid="distancia-camaras">
              {fmt(resumen.distanciaCamaras, 2)}
              {unidad}
              {!resumen.enMetros && <span className="text-texto-2"> (sin escala)</span>}
              {vigente.escalaDe === 'cinta' && <span className="text-texto-2"> (cinta)</span>}
            </dd>
            {(['A', 'B'] as const).map((n, i) => (
              <div key={n} className="contents">
                <dt className="text-texto-2">Móvil {n}</dt>
                <dd data-testid={`camara-${n}`}>
                  campo {fmt(resumen.campos[i]!, 0)}°{resumen.alturas[i] !== null ? ` · a ${fmt(resumen.alturas[i]!, 2)} m del suelo` : ''}
                  {vigente.sinVertical[i] ? ' · sin acelerómetro' : ''}
                </dd>
              </div>
            ))}
          </dl>
          <details className="text-sm">
            <summary className="cursor-pointer text-texto-2">Error por punto del cuerpo</summary>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-xs" data-testid="error-por-punto">
              {Object.entries(vigente.errorPorPunto)
                .sort((x, y) => y[1] - x[1])
                .map(([id, px]) => (
                  <li key={id}>
                    {nombrePunto(id)}: {fmt(px, 1)} px
                  </li>
                ))}
            </ul>
          </details>
          {resumen.avisos.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="avisos-3d">
              {resumen.avisos.map((x) => (
                <li key={x.tipo + ('vista' in x ? x.vista : '')} className="flex gap-2 text-sm text-acento">
                  <ExclamationTriangleIcon className="size-5 shrink-0" /> {textoAviso(x)}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copiar()} className="rounded-md border border-borde px-3 py-2 text-sm">
              {copiado ? 'Copiado' : 'Copiar el informe'}
            </button>
            <button type="button" onClick={() => onCalibracion(null, estatura)} className="rounded-md border border-borde px-3 py-2 text-sm text-texto-2">
              Quitar la calibración
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
