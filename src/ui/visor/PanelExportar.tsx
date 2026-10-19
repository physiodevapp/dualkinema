import { useState } from 'react'
import { ArrowDownTrayIcon, ShareIcon } from '@heroicons/react/24/outline'
import { FORMATOS_CSV, type FormatoCsv } from '../../core/exportacion/csv'

const CLAVE_FORMATO = 'dualkinema.formatoCsv'

function formatoGuardado(): FormatoCsv {
  try {
    const v = localStorage.getItem(CLAVE_FORMATO)
    return FORMATOS_CSV.find((f) => f === v) ?? 'es'
  } catch {
    return 'es'
  }
}

interface Props {
  /** Genera el archivo con lo que hay ahora en el visor. */
  generar: (formato: FormatoCsv) => { nombre: string; texto: string }
  /** Resumen de lo que saldrá: frames, escala... */
  resumen: string
  deshabilitado?: boolean
}

/**
 * Exportación CSV, todo en el dispositivo: se descarga o se pasa al menú de
 * compartir de Android (donde se puede elegir Drive, correo, etc. a mano). El
 * navegador no manda nada a ningún servidor.
 */
export default function PanelExportar({ generar, resumen, deshabilitado }: Props) {
  const [formato, setFormato] = useState<FormatoCsv>(formatoGuardado)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined'

  const cambiar = (f: FormatoCsv) => {
    setFormato(f)
    try {
      localStorage.setItem(CLAVE_FORMATO, f)
    } catch {
      /* sin almacenamiento: se usa solo en esta sesión */
    }
  }

  const archivo = () => {
    const { nombre, texto } = generar(formato)
    return { nombre, blob: new Blob([texto], { type: 'text/csv;charset=utf-8' }) }
  }

  const descargar = () => {
    const { nombre, blob } = archivo()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setMensaje(`Descargado ${nombre}`)
  }

  const compartir = async () => {
    const { nombre, blob } = archivo()
    const file = new File([blob], nombre, { type: 'text/csv' })
    try {
      if (!navigator.canShare({ files: [file] })) throw new Error('no')
      await navigator.share({ files: [file], title: nombre })
      setMensaje(`Compartido ${nombre}`)
    } catch (e) {
      // Cerrar el menú de compartir no es un error.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setMensaje('Este navegador no puede compartir el archivo: usa «Descargar».')
    }
  }

  const boton = 'inline-flex min-h-11 items-center gap-2 rounded-md border border-borde px-3 text-sm hover:border-acento disabled:opacity-50'
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4" data-testid="panel-exportar">
      <h2 className="font-mono text-xs tracking-wider text-texto-2 uppercase">Exportar CSV</h2>
      <p className="text-xs text-texto-2" data-testid="exportar-resumen">{resumen}</p>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">Formato</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="formato-csv" checked={formato === 'es'} onChange={() => cambiar('es')} className="accent-acento" />
          Excel en español (; y coma)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="formato-csv" checked={formato === 'internacional'} onChange={() => cambiar('internacional')} className="accent-acento" />
          Internacional (, y punto)
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={descargar} disabled={deshabilitado} className={boton} data-testid="descargar-csv">
          <ArrowDownTrayIcon className="size-5" aria-hidden />
          Descargar
        </button>
        {puedeCompartir && (
          <button type="button" onClick={() => void compartir()} disabled={deshabilitado} className={boton} data-testid="compartir-csv">
            <ShareIcon className="size-5" aria-hidden />
            Compartir
          </button>
        )}
      </div>
      {mensaje && <p className="text-xs text-texto-2" role="status" data-testid="exportar-mensaje">{mensaje}</p>}
      <p className="text-xs text-texto-2">
        Una fila por frame, con la cabecera de la escala, el filtro y el cero. Celda vacía = sin valor. El archivo se crea en este
        dispositivo; no sale a ningún servidor.
      </p>
    </section>
  )
}
