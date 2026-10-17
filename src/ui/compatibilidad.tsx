import { useEffect, useState } from 'react'
import { CheckCircleIcon, QuestionMarkCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

type Estado = boolean | null // null = comprobando

const basicas: { nombre: string; ok: Estado }[] = [
  { nombre: 'WebCodecs (VideoDecoder)', ok: typeof globalThis.VideoDecoder === 'function' },
  { nombre: 'OffscreenCanvas', ok: typeof globalThis.OffscreenCanvas === 'function' },
  { nombre: 'Web Workers', ok: typeof globalThis.Worker === 'function' },
  { nombre: 'IndexedDB', ok: typeof globalThis.indexedDB === 'object' },
]

// Perfiles típicos de móvil (H.264 High 4.0, HEVC Main 4.0) a 1920×1080.
const codecs = [
  { nombre: 'Decodifica H.264 (la mayoría de Android)', codec: 'avc1.640028' },
  { nombre: 'Decodifica HEVC / H.265 (iPhone y algunos Android)', codec: 'hvc1.1.6.L120.B0' },
]

async function decodifica(codec: string): Promise<boolean> {
  if (typeof globalThis.VideoDecoder !== 'function') return false
  try {
    const r = await VideoDecoder.isConfigSupported({ codec, codedWidth: 1920, codedHeight: 1080 })
    return r.supported === true
  } catch {
    return false
  }
}

function Icono({ ok }: { ok: Estado }) {
  if (ok === null) return <QuestionMarkCircleIcon className="size-5 shrink-0 text-texto-2" aria-label="comprobando" />
  return ok ? (
    <CheckCircleIcon className="size-5 shrink-0 text-emerald-400" aria-label="disponible" />
  ) : (
    <XCircleIcon className="size-5 shrink-0 text-red-400" aria-label="no disponible" />
  )
}

export default function Compatibilidad() {
  const [codecsOk, setCodecsOk] = useState<Estado[]>(codecs.map(() => null))

  useEffect(() => {
    let vivo = true
    Promise.all(codecs.map((c) => decodifica(c.codec))).then((r) => {
      if (vivo) setCodecsOk(r)
    })
    return () => {
      vivo = false
    }
  }, [])

  const filas = [...basicas, ...codecs.map((c, i) => ({ nombre: c.nombre, ok: codecsOk[i] ?? null }))]
  const todoOk = filas.every((f) => f.ok !== false)

  return (
    <details className="rounded-2xl border border-borde bg-panel p-4" open={!todoOk}>
      <summary className="cursor-pointer font-mono text-xs tracking-wider text-texto-2 uppercase">
        Compatibilidad de este navegador {todoOk ? '· todo bien' : '· revisa'}
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {filas.map(({ nombre, ok }) => (
          <li key={nombre} className="flex items-start gap-2">
            <Icono ok={ok} />
            {nombre}
          </li>
        ))}
      </ul>
    </details>
  )
}
