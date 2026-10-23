import { useCallback, useEffect, useState } from 'react'
import { FolderOpenIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { CabeceraSesion } from '../core/persistencia/esquema'
import { borrarSesion, listarSesiones, type SesionIlegible } from '../persistencia/almacen'
import { fechaCorta, textoOrientacion, textoResumen } from './sesion'

type Lista = { estado: 'cargando' } | { estado: 'lista'; sesiones: CabeceraSesion[]; ilegibles: SesionIlegible[] } | { estado: 'error'; mensaje: string }

/** Borrar en dos toques, sin diálogos del sistema. */
function BotonBorrar({ nombre, onBorrar }: { nombre: string; onBorrar: () => void }) {
  const [confirmar, setConfirmar] = useState(false)
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Borrar ${nombre}`}
        className="flex items-center justify-center gap-1.5 rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
      >
        <TrashIcon className="size-4" /> Borrar
      </button>
    )
  }
  return (
    <span className="flex gap-2">
      <button type="button" onClick={onBorrar} className="rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-200">
        Sí, borrar
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className="rounded-md border border-borde px-3 py-2 text-sm">
        No
      </button>
    </span>
  )
}

/** Sesiones guardadas en este dispositivo, con opción de continuarlas (abriendo su vídeo) o borrarlas. */
export default function SesionesGuardadas({ onContinuar, ocupado }: { onContinuar: (c: CabeceraSesion) => void; ocupado: boolean }) {
  const [lista, setLista] = useState<Lista>({ estado: 'cargando' })

  const cargar = useCallback(async () => {
    try {
      setLista({ estado: 'lista', ...(await listarSesiones()) })
    } catch (e) {
      setLista({ estado: 'error', mensaje: e instanceof Error ? e.message : String(e) })
    }
  }, [])
  // La lista llega tras leer IndexedDB (asíncrono), no de forma síncrona en el efecto.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void cargar(), [cargar])

  const borrar = async (id: string) => {
    try {
      await borrarSesion(id)
    } finally {
      await cargar()
    }
  }

  if (lista.estado === 'cargando') return null
  if (lista.estado === 'error') {
    return <p className="text-sm text-texto-2">No se pueden leer las sesiones guardadas: {lista.mensaje}</p>
  }
  if (lista.sesiones.length === 0 && lista.ilegibles.length === 0) return null

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-sesiones">
      <div>
        <h2 id="titulo-sesiones" className="font-mono text-xs tracking-wider text-texto-2 uppercase">
          Sesiones guardadas
        </h2>
        <p className="mt-1 text-sm text-texto-2">
          Solo en este dispositivo. El vídeo no se guarda: para continuar, vuelve a abrir el mismo archivo.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {lista.sesiones.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-3" data-testid="sesion-guardada">
            <div className="min-w-0">
              <p className="truncate" title={c.nombre}>{c.nombre}</p>
              <p className="text-sm text-texto-2">
                {fechaCorta(c.actualizada)} · {c.vistas.map((v) => textoOrientacion(v.orientacion)).join(' + ')}
              </p>
              <p className="font-mono text-xs text-texto-2">{textoResumen(c)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onContinuar(c)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-acento px-3 py-2 text-sm text-acento disabled:opacity-40"
              >
                <FolderOpenIcon className="size-4" /> Continuar
              </button>
              <BotonBorrar nombre={c.nombre} onBorrar={() => void borrar(c.id)} />
            </div>
          </li>
        ))}
        {lista.ilegibles.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-3" data-testid="sesion-ilegible">
            <p className="truncate">{s.nombre}</p>
            <p className="text-sm text-texto-2">
              {s.nueva ? 'Guardada con una versión más nueva de dualkinema: recarga la página para actualizar.' : `No se puede abrir (${s.detalle}).`}
            </p>
            <div className="flex">
              <BotonBorrar nombre={s.nombre} onBorrar={() => void borrar(s.id)} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
