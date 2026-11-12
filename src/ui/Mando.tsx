import { ArrowLeftIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { formatoCodigo } from '../core/sala/codigo'
import { CUENTAS_ATRAS_S, DURACIONES_S, enFlancos } from '../core/sala/doble'
import { destino, faltaParaGrabar, grabando as algunoGraba, rechazoNuevo, TEXTO_RECHAZO, type MovilEnMando } from '../core/sala/mando'
import { esImportante, textoSuceso, type EntradaRegistro } from '../core/sala/sucesos'
import type { EstadoCanal } from '../sala/canal'
import { useMando } from '../sala/useMando'
import { InfoGlosario } from './glosario/Glosario'
import { Aviso, Colocacion, TextoEncuadre, textoVista } from './piezasSala'

/*
 * El mando (un ordenador que maneja la grabación con dos móviles): los dos móviles quedan colocados y la persona en su
 * sitio, y otra persona lo lleva todo desde aquí. Ve el estado de cada móvil (vista, cámara, batería, espacio, fps,
 * inclinación, encuadre, reloj) y les pide comprobar el encuadre, programar la grabación y pararla. Las órdenes van al
 * primer móvil, que las ejecuta como si se pulsara en él (el otro confirma como siempre). Por aquí no pasa vídeo.
 */

const TEXTO_CONEXION: Record<EstadoCanal, string> = {
  conectando: 'Conectando con la sala…',
  abierto: 'Conectado a la sala',
  reconectando: 'Se ha cortado la conexión: reconectando…',
  llena: 'Ya hay un mando en esta sala.',
  caducada: 'La sala ha caducado (3 h): crea otra en un móvil.',
  cerrado: 'Has salido de la sala.',
}

const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-borde px-3 text-texto disabled:opacity-40'

function TarjetaMovil({ m, n, encuadreActivo }: { m: MovilEnMando; n: number; encuadreActivo: boolean }) {
  const e = m.estado
  const quien = `Móvil ${n}`
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="mando-movil" data-id={m.id} data-grabando={String(!!e?.grabando)}>
      <h3 className="flex items-center justify-between gap-2 font-medium">
        <span>
          {quien}
          {e?.primero != null && <span className="text-texto-2"> ({e.primero ? 'creó la sala' : 'se unió'})</span>}: {textoVista(m.vista)}
        </span>
        {e?.grabando && <span className="rounded-md bg-red-500/80 px-2 py-0.5 text-sm text-white">Grabando</span>}
      </h3>
      <p className="font-mono text-xs text-texto-2" data-testid="mando-estado">
        {e?.camara ? `Cámara ${e.camara.ancho}×${e.camara.alto} a ${e.camara.fps} fps` : 'Cámara sin abrir'}
        {e?.libreMB != null && ` · ${e.libreMB.toLocaleString('es-ES')} MB libres`}
        {e?.bateria != null && ` · batería ${Math.round(e.bateria * 100)} %`}
        {e?.codificador === 'software' && ' · vídeo por software'}
        {e?.fpsGrabacion != null && ` · grabaría a ${Math.round(e.fpsGrabacion)} fps`}
        {e?.reloj != null && ` · reloj común ± ${e.reloj < 1 ? e.reloj.toFixed(1) : Math.round(e.reloj)} ms`}
      </p>
      {e?.microExterno && <Aviso testid="mando-aviso-micro">Tiene unos auriculares o un micrófono externo conectados: que se desconecten, o no se oirá su pitido.</Aviso>}
      <Colocacion inclinacion={e?.inclinacion ?? null} testid={`mando-inclinacion-${n}`} quien={quien} />
      <TextoEncuadre encuadre={e?.encuadre ?? null} activo={encuadreActivo} fallo={!!e?.encuadreFallo} testid={`mando-encuadre-${n}`} quien={quien} />
    </div>
  )
}

/** «Móvil N» por su sitio en el mando (el que entró primero en la sala es el 1). */
function nombreMovil(moviles: readonly MovilEnMando[], id: string): string {
  const i = moviles.findIndex((m) => m.id === id)
  return i < 0 ? 'Un móvil que ya no está' : `Móvil ${i + 1}`
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Lo último que ha pasado al grabar en cada móvil, lo más reciente arriba; lo que hay que revisar, en ámbar. */
function Registro({ registro, moviles }: { registro: readonly EntradaRegistro[]; moviles: readonly MovilEnMando[] }) {
  const quien = (id: string) => nombreMovil(moviles, id)
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-panel p-4" data-testid="mando-registro">
      <h3 className="font-medium">Lo último</h3>
      {registro.length === 0 ? (
        <p className="text-sm text-texto-2">Aquí saldrá lo que pase al grabar en cada móvil: si empieza, si no graba y por qué, si se corta y cómo ha quedado.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {registro.map((e) => {
            const importante = esImportante(e.suceso)
            return (
              <li
                key={`${e.movil}-${e.suceso.n}`}
                className={`flex gap-2 rounded-md p-2 text-sm ${importante ? 'border border-acento/60' : ''}`}
                data-testid="mando-suceso"
                data-tipo={e.suceso.tipo}
                data-importante={String(importante)}
              >
                <span className="shrink-0 font-mono text-xs text-texto-2">{hora(e.hora)}</span>
                <span>{textoSuceso(e.suceso, quien(e.movil))}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export default function Mando({ codigo, alSalir }: { codigo: string; alSalir: () => void }) {
  const { conexion, moviles, ordenar, registro } = useMando(codigo)
  const [cuenta, setCuenta] = useState<number>(10)
  const [duracion, setDuracion] = useState<number | null>(30)
  // Lo pedido (con el contador de rechazos del móvil en ese momento, para saber si uno nuevo es de esta orden).
  const [pedido, setPedido] = useState<{ texto: string; antes: number; desde: number } | null>(null)
  // Desde cuándo hay una grabación pedida desde aquí que aún no ha empezado (o no se ha dicho que no): mientras, se puede
  // cancelar con «Parar los dos». Se queda con el primer pedido aunque se pida otra vez durante la cuenta atrás.
  const [esperando, setEsperando] = useState<number | null>(null)
  const primero = destino(moviles)
  const falta = faltaParaGrabar(moviles)
  const graba = algunoGraba(moviles)
  // El encuadre se comprueba en los dos si uno lo pidió (el primero, al que se le ordena).
  const encuadreActivo = moviles.some((m) => m.estado?.pideEncuadre)
  const conectado = conexion === 'abierto'
  const rechazado = pedido ? rechazoNuevo(primero, pedido.antes) : null
  // Lo pedido ya ha empezado o no se graba (lo dice el registro): el aviso de lo pedido sobra y no hay nada que parar.
  const resuelto = (desde: number) => registro.some((e) => e.hora >= desde && (e.suceso.tipo === 'empieza' || e.suceso.tipo === 'no-graba'))
  const cuentaEnMarcha = esperando !== null && !resuelto(esperando)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4" data-testid="mando">
      <div className="flex items-center gap-2">
        <button type="button" onClick={alSalir} aria-label="Volver" title="Volver" className="flex size-11 items-center justify-center rounded-md border border-borde">
          <ArrowLeftIcon className="size-5" />
        </button>
        <h2 className="font-serif text-2xl">Mando de la sala {formatoCodigo(codigo)}</h2>
      </div>
      <p className="flex items-center gap-1 text-sm text-texto-2">
        <span role="status" data-testid="mando-conexion" data-conexion={conexion}>
          {TEXTO_CONEXION[conexion]}
        </span>
        {conectado && ` · ${moviles.length} ${moviles.length === 1 ? 'móvil' : 'móviles'}`}
        <InfoGlosario id="mando" tema="manejar la sala desde un ordenador" className="-my-1.5" />
      </p>
      <p className="text-sm text-texto-2">Por aquí no pasa ningún vídeo: solo el estado de cada móvil y las órdenes. Cada vídeo se queda en su móvil.</p>

      {moviles.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {moviles.map((m, i) => (
            <TarjetaMovil key={m.id} m={m} n={i + 1} encuadreActivo={encuadreActivo} />
          ))}
        </div>
      )}
      {moviles.length === 2 && enFlancos(moviles[0]!.vista, moviles[1]!.vista) && (
        <p className="text-sm text-texto-2">Un móvil en cada flanco: así se graba para el 3D.</p>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-borde bg-panel p-4">
        <button
          type="button"
          onClick={() => primero && ordenar(primero.id, { orden: 'encuadre', activo: !encuadreActivo })}
          disabled={!conectado || !primero || graba}
          aria-pressed={encuadreActivo}
          className={`${boton} ${encuadreActivo ? 'border-acento bg-acento/15' : ''}`}
          data-testid="mando-encuadre"
        >
          {encuadreActivo ? 'Dejar de comprobar el encuadre' : 'Comprobar que se ve a la persona entera (lo dice un móvil en voz alta)'}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-texto-2">
            Cuenta atrás
            <select value={cuenta} onChange={(e) => setCuenta(Number(e.target.value))} data-testid="mando-cuenta" className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto">
              {CUENTAS_ATRAS_S.map((s) => (
                <option key={s} value={s}>
                  {s} s
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-texto-2">
            Duración
            <select
              value={duracion ?? 'parar'}
              onChange={(e) => setDuracion(e.target.value === 'parar' ? null : Number(e.target.value))}
              data-testid="mando-duracion"
              className="rounded-md border border-borde bg-fondo px-3 py-3 text-texto"
            >
              {DURACIONES_S.map((s) => (
                <option key={s ?? 'parar'} value={s ?? 'parar'}>
                  {s === null ? 'Hasta parar' : `${s} s`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {falta.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-texto-2" data-testid="mando-falta">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (!primero || !ordenar(primero.id, { orden: 'programar', cuentaAtras: cuenta, duracion })) return
              const desde = Date.now()
              setPedido({ texto: `Pedido: empieza en ${cuenta} s${duracion ? ` y dura ${duracion} s` : ''}.`, antes: primero.estado?.rechazo?.n ?? 0, desde })
              setEsperando((e) => (e !== null && !resuelto(e) ? e : desde))
            }}
            disabled={!conectado || falta.length > 0 || graba}
            className={`${boton} min-h-14 border-acento bg-acento font-medium text-fondo`}
            data-testid="mando-grabar"
          >
            <PlayIcon className="size-5" />
            Grabar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!primero || !ordenar(primero.id, { orden: 'parar' })) return
              setPedido(null)
              setEsperando(null)
            }}
            // Solo con algo que parar: grabando o con la cuenta atrás que se pidió desde aquí.
            disabled={!conectado || !primero || !(graba || cuentaEnMarcha)}
            className={`${boton} min-h-14`}
            data-testid="mando-parar"
          >
            <StopIcon className="size-5" />
            Parar los dos
          </button>
        </div>
        {registro[0] && (
          <p
            className={`rounded-md p-2 text-sm ${esImportante(registro[0].suceso) ? 'border border-acento/60' : 'text-texto-2'}`}
            role="status"
            data-testid="mando-ultimo"
          >
            {hora(registro[0].hora)} · {textoSuceso(registro[0].suceso, nombreMovil(moviles, registro[0].movil))}
          </p>
        )}
        {pedido && !graba && (rechazado || !resuelto(pedido.desde)) && (rechazado ? (
          <Aviso testid="mando-rechazo">El Móvil 1 no ha grabado: {TEXTO_RECHAZO[rechazado]}.</Aviso>
        ) : (
          <p className="text-sm text-texto-2" data-testid="mando-pedido">
            {pedido.texto} Si no empieza, mira en los móviles qué dicen.
          </p>
        ))}
      </div>
      <Registro registro={registro} moviles={moviles} />
    </section>
  )
}
