import { useCallback, useEffect, useState } from 'react'
import { FolderOpenIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { CabeceraSesion } from '../core/persistencia/esquema'
import { textoAvisoRetencion } from '../core/persistencia/retencion'
import { borrarSesion, borrarTodo, idSesionAbierta, listarSesiones, type SesionIlegible } from '../persistencia/almacen'
import { diaCorto, fechaCorta, textoBytes, textoOrientacion, textoResumen } from './sesion'

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

/**
 * «Borrar todo lo guardado»: en dos toques (tres con una sesión abierta, que se volvería a guardar con el siguiente
 * cambio), como el borrado de una sola, sin diálogos del sistema.
 */
function BotonBorrarTodo({ hayAbierta, onBorrar }: { hayAbierta: boolean; onBorrar: () => void }) {
  const [paso, setPaso] = useState(0)
  const cancelar = (
    <button type="button" onClick={() => setPaso(0)} className="rounded-md border border-borde px-3 py-2 text-sm">
      No
    </button>
  )
  if (paso === 0) {
    return (
      <button
        type="button"
        onClick={() => setPaso(1)}
        data-testid="borrar-todo"
        className="flex items-center justify-center gap-1.5 self-start rounded-md border border-borde px-3 py-2 text-sm text-texto-2"
      >
        <TrashIcon className="size-4" /> Borrar todo lo guardado
      </button>
    )
  }
  if (paso === 1 && hayAbierta) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-sm text-red-200">Hay una sesión abierta: si sigues trabajando en ella, se volverá a guardar. ¿Borrar todo igualmente?</p>
        <span className="flex gap-2">
          <button type="button" onClick={() => setPaso(2)} className="rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-200">
            Continuar
          </button>
          {cancelar}
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2" role="alert">
      <p className="text-sm text-red-200">Se borrarán todas las sesiones guardadas en este móvil. No se puede deshacer.</p>
      <span className="flex gap-2">
        <button type="button" onClick={onBorrar} data-testid="confirmar-borrar-todo" className="rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-200">
          Sí, borrar todo
        </button>
        {cancelar}
      </span>
    </div>
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

  const borrarLo = async () => {
    try {
      await borrarTodo()
    } finally {
      await cargar()
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-sesiones">
      <div>
        <h2 id="titulo-sesiones" className="font-mono text-xs tracking-wider text-texto-2 uppercase">
          Sesiones guardadas
        </h2>
        <p className="mt-1 text-sm text-texto-2" data-testid="aviso-retencion">
          {textoAvisoRetencion()}
        </p>
        <p className="text-sm text-texto-2">Para continuar una, vuelve a abrir el mismo archivo.</p>
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
              <p className="font-mono text-xs text-texto-2" data-testid="caducidad">
                Se borra el {diaCorto(c.expiraEn)}
                {c.bytes !== undefined && ` · ocupa ${textoBytes(c.bytes)}`}
              </p>
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
              {s.nueva ? 'Guardada con una versión más nueva de dualkinema: recarga la página para actualizar.' : `No se puede abrir (${s.detalle}).`}{' '}
              No se borra sola: bórrala aquí.
            </p>
            <div className="flex">
              <BotonBorrar nombre={s.nombre} onBorrar={() => void borrar(s.id)} />
            </div>
          </li>
        ))}
      </ul>
      <BotonBorrarTodo hayAbierta={idSesionAbierta() !== null} onBorrar={() => void borrarLo()} />
    </section>
  )
}
