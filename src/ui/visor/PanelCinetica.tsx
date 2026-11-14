import { useMemo, useState } from 'react'
import type { Lado } from '../../core/articulaciones/catalogo'
import { cineticaDeLaToma, CORTE_DINAMICA_HZ, CORTES_DINAMICA_HZ, G, type IdArticulacionCinetica } from '../../core/cinetica/dinamica'
import { ARTICULACIONES_CINETICA, media, picos, repartoPeso, type Componente } from '../../core/cinetica/resumen'
import { construirCsvCinetica } from '../../core/exportacion/csvCinetica'
import { MASA_MAX, MASA_MIN } from '../../core/persistencia/esqueleto'
import { frameVisibleEnComun } from '../../core/tiempo/comun'
import { InfoGlosario } from '../glosario/Glosario'
import { fmt } from './formato'
import GraficaTiempo from './GraficaTiempo'
import PanelExportar from './PanelExportar'
import type { Angulos3D } from './useAngulos3D'

interface Props {
  readonly t3: Angulos3D
  /** Instante común del cursor, o null. */
  readonly instante: number | null
  readonly desde: number
  readonly hasta: number
  readonly onBuscar: (tComun: number) => void
  /** El filtro de la sesión (el del modo cuasiestático). */
  readonly ajustes: { readonly corteHz: number }
}

const LADOS: readonly Lado[] = ['der', 'izq']
const NOMBRE_ART: Record<IdArticulacionCinetica, string> = { cadera: 'Cadera', rodilla: 'Rodilla', tobillo: 'Tobillo' }
const POSITIVO: Record<Componente, Record<IdArticulacionCinetica, string>> = {
  sagital: { cadera: 'extensor', rodilla: 'extensor', tobillo: 'flexor plantar' },
  frontal: { cadera: 'abductor', rodilla: 'abductor', tobillo: '' },
}
const boton = 'rounded-md border border-borde px-2 py-1 text-xs text-texto-2 disabled:opacity-50'
const num = (v: number, d: number) => (Number.isFinite(v) ? fmt(v + 0, d) : '—')

/**
 * La cinética estimada sin plataforma (fase 11, paso 2; D5, D6, D10 y D11 de docs/plan-fase-11.md), dentro de «Ángulos en
 * 3D»: con el esqueleto ajustado y la escala en metros, los momentos internos de cadera, rodilla y tobillo de las dos
 * piernas, el reparto del peso entre los pies y la altura del centro de masas, en el modo cuasiestático (por defecto) o el
 * dinámico (con su propio corte, bajo). Todo por kilo de masa corporal. Se calcula al vuelo del esqueleto: no se guarda
 * el resultado, solo el modo y el corte.
 */
export default function PanelCinetica({ t3, instante, desde, hasta, onBuscar, ajustes }: Props) {
  const { esqueleto, calibracion, tr, fs, cinetica, setCinetica, ocupado } = t3
  const [art, setArt] = useState<IdArticulacionCinetica>('rodilla')
  const [componente, setComponente] = useState<Componente>('sagital')
  // Las posturas del esqueleto van en el marco del laboratorio de los puntos 3D: ya en metros (con la escala) y con el suelo
  // en z = 0 si la calibración lo encontró (si no, se estima de los pies).
  const metros = tr.enMetros ? 1 : null
  const suelo = calibracion.suelo !== null ? 0 : null
  const modo = cinetica?.modo ?? 'cuasiestatica'
  const corteHz = modo === 'dinamica' ? (cinetica?.corteHz ?? CORTE_DINAMICA_HZ) : ajustes.corteHz
  // Las posturas suavizadas de toda la toma (D12): sin ellas (un esqueleto guardado antes), las del ajuste frame a frame.
  const afinado = !!esqueleto?.suavizadas
  const resultado = useMemo(
    () =>
      cinetica && esqueleto && metros
        ? cineticaDeLaToma({
            tiempos: esqueleto.tiempos,
            posturas: esqueleto.suavizadas ?? esqueleto.posturas,
            medidas: esqueleto.medidas,
            metrosPorUnidad: metros,
            suelo,
            fs,
            corteHz,
            modo,
          })
        : null,
    [cinetica, esqueleto, metros, suelo, fs, corteHz, modo],
  )
  const reparto = useMemo(() => (resultado ? repartoPeso(resultado) : null), [resultado])
  const pico = useMemo(() => (resultado ? picos(resultado, componente) : null), [resultado, componente])

  const titulo = (
    <h3 className="flex items-center gap-1 text-xs tracking-wider text-texto-2 uppercase">
      Cinética estimada <InfoGlosario id="cinetica" tema="la cinética sin plataforma de fuerzas" className="-my-1.5" />
    </h3>
  )
  if (!cinetica || !esqueleto || !metros || !resultado || !reparto || !pico) {
    const falta = !esqueleto ? 'Hace falta el esqueleto ajustado (fuente «Esqueleto», «Ajustar el esqueleto»).' : !metros ? 'Hace falta la escala en metros: calibra en 3D con la estatura de la persona.' : null
    return (
      <div className="flex flex-col gap-2 border-t border-borde pt-3" data-testid="panel-cinetica">
        {titulo}
        <p className="text-sm text-texto-2">
          Los momentos de cadera, rodilla y tobillo de las dos piernas, el reparto del peso entre los pies y el centro de masas, estimados del esqueleto sin plataforma de fuerzas. Para movimientos lentos: sentadilla, levantarse de la silla, zancada, apoyo a una pierna.
        </p>
        {falta && <p className="text-sm text-acento">{falta}</p>}
        <button
          type="button"
          disabled={ocupado || !!falta}
          onClick={() => setCinetica({ modo: 'cuasiestatica', corteHz: CORTE_DINAMICA_HZ })}
          className="self-start rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-fondo disabled:opacity-50"
        >
          Estimar la cinética
        </button>
      </div>
    )
  }

  const xs = resultado.tiempos
  const indice = instante === null ? null : frameVisibleEnComun({ tabla: { tiempos: tr.tiempos }, desfase: 0 }, instante)
  const comp = art === 'tobillo' ? 'sagital' : componente
  const serieDe = (l: Lado) => resultado.articulaciones[l][art][comp]
  const enCursor = (v: readonly number[]) => (indice === null ? NaN : (v[indice] ?? NaN))
  const comZ = indice === null ? NaN : (resultado.com[indice]?.z ?? NaN) - resultado.suelo
  const fz = indice === null ? NaN : (resultado.fuerza[indice]?.z ?? NaN)
  const masa = cinetica.masa ?? null
  const conMasa = (v: number, unidad: string, d: number) => (masa !== null && Number.isFinite(v) ? ` (${num(v * masa, d)} ${unidad})` : '')
  const generar = (formato: Parameters<typeof construirCsvCinetica>[1]) => ({
    nombre: 'dualkinema_cinetica.csv',
    texto: construirCsvCinetica({ exportado: new Date().toISOString(), resultado, modo, corteHz, afinado, masa }, formato),
  })

  return (
    <div className="flex flex-col gap-3 border-t border-borde pt-3" data-testid="panel-cinetica">
      <div className="flex items-center justify-between gap-2">
        {titulo}
        <button type="button" className={boton} onClick={() => setCinetica(null)} disabled={ocupado}>
          Dejar de mirar la cinética
        </button>
      </div>
      <p className="text-xs text-texto-2" data-testid="aviso-cinetica">
        Estimación sin plataforma de fuerzas, por kilo de masa corporal. No vale para impactos (pisar, saltar, correr) ni separa la fuerza de cada pie en el doble apoyo de la marcha.
      </p>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <legend className="sr-only">Modo del cálculo</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="modo-cinetica" checked={modo === 'cuasiestatica'} onChange={() => setCinetica({ ...cinetica, modo: 'cuasiestatica' })} className="accent-acento" />
          Cuasiestático
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="modo-cinetica" checked={modo === 'dinamica'} onChange={() => setCinetica({ ...cinetica, modo: 'dinamica' })} className="accent-acento" data-testid="modo-dinamico" />
          Dinámico
        </label>
        {modo === 'dinamica' && (
          <label className="flex items-center gap-2 text-xs text-texto-2">
            Filtro
            <select
              value={cinetica.corteHz}
              onChange={(e) => setCinetica({ ...cinetica, corteHz: Number(e.target.value) })}
              className="rounded-md border border-borde bg-fondo px-2 py-1 text-sm text-texto"
              data-testid="corte-cinetica"
            >
              {CORTES_DINAMICA_HZ.map((c) => (
                <option key={c} value={c}>
                  {c} Hz
                </option>
              ))}
            </select>
          </label>
        )}
        <InfoGlosario id="cinetica-modo" tema="el modo cuasiestático y el dinámico" className="-my-1.5" />
      </fieldset>
      {modo === 'dinamica' && (
        <p className="text-xs text-acento">
          Con las aceleraciones del vídeo: para movimientos lentos o moderados. Mira la fuerza vertical: si oscila sin que la persona se mueva, es ruido; baja el filtro.
        </p>
      )}
      <p className="text-xs text-texto-2" data-testid="afinado-cinetica">
        {afinado ? (
          <>
            Con la toma afinada: el esqueleto suavizado en toda la toma, pesando lo que mejor ven las cámaras. <InfoGlosario id="toma-afinada" tema="el suavizado de toda la toma" className="-my-1.5" />
          </>
        ) : (
          <span className="text-acento">Este esqueleto se ajustó antes de afinar la toma: vuelve a ajustarlo para que la cinética dinámica tenga menos ruido.</span>
        )}
      </p>
      <label className="flex items-center gap-2 text-xs text-texto-2">
        Masa (kg, opcional)
        <input
          type="number"
          inputMode="decimal"
          min={MASA_MIN}
          max={MASA_MAX}
          step="0.5"
          defaultValue={cinetica.masa ?? ''}
          onChange={(e) => {
            const v = Number(e.target.value.replace(',', '.'))
            const vale = e.target.value !== '' && v >= MASA_MIN && v <= MASA_MAX
            const { masa: _m, ...sin } = cinetica
            void _m
            setCinetica(vale ? { ...sin, masa: v } : sin)
          }}
          className="w-24 rounded-md border border-borde bg-fondo px-2 py-1 font-mono text-sm text-texto"
          data-testid="masa-cinetica"
        />
        <span>con ella, también en N y N·m</span>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={art} onChange={(e) => setArt(e.target.value as IdArticulacionCinetica)} className="rounded-md border border-borde bg-fondo px-2 py-1" data-testid="articulacion-cinetica" aria-label="Articulación">
          {ARTICULACIONES_CINETICA.map((a) => (
            <option key={a} value={a}>
              {NOMBRE_ART[a]}
            </option>
          ))}
        </select>
        <select
          value={comp}
          onChange={(e) => setComponente(e.target.value as Componente)}
          disabled={art === 'tobillo'}
          className="rounded-md border border-borde bg-fondo px-2 py-1 disabled:opacity-50"
          data-testid="componente-cinetica"
          aria-label="Plano"
        >
          <option value="sagital">Sagital</option>
          <option value="frontal">Frontal</option>
        </select>
        <InfoGlosario id="momento-interno" tema="el momento articular interno" className="-my-1.5" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm" data-testid="valores-cinetica">
        {LADOS.map((l) => (
          <div key={l} className="contents">
            <dt className="text-texto-2">{l === 'der' ? 'Derecha' : 'Izquierda'}</dt>
            <dd data-testid={`momento-${l}`}>
              {num(enCursor(serieDe(l)), 2)} N·m/kg{conMasa(enCursor(serieDe(l)), 'N·m', 0)}
            </dd>
          </div>
        ))}
        <dt className="text-texto-2">+ es</dt>
        <dd className="font-sans">{POSITIVO[comp][art]}</dd>
        <dt className="text-texto-2">Peso en cada pie</dt>
        <dd data-testid="reparto-cursor">
          der. {num(enCursor(reparto.der), 0)} % · izq. {num(enCursor(reparto.izq), 0)} %
        </dd>
        <dt className="text-texto-2">Fuerza vertical</dt>
        <dd data-testid="fuerza-cursor">
          {num((100 * fz) / G, 0)} % del peso{conMasa(fz, 'N', 0)}
        </dd>
        <dt className="text-texto-2">Centro de masas</dt>
        <dd data-testid="com-cursor">{num(comZ * 100, 0)} cm del suelo</dd>
      </dl>
      <GraficaTiempo
        xs={xs}
        series={[
          { id: 'der', color: 'acento', valores: serieDe('der').map((v) => (Number.isFinite(v) ? v : null)), visible: true, ancho: 2 },
          { id: 'izq', color: 'texto', valores: serieDe('izq').map((v) => (Number.isFinite(v) ? v : null)), visible: true, ancho: 1.5 },
        ]}
        desde={desde}
        hasta={hasta}
        indice={indice}
        unidad={(v) => `${fmt(v, 1)}`}
        altoMinimo={0.5}
        alto={180}
        etiqueta={`${NOMBRE_ART[art]}, momento ${comp} (N·m/kg): derecha ámbar, izquierda claro`}
        testid="grafica-cinetica"
        onBuscar={onBuscar}
      />
      <GraficaTiempo
        xs={xs}
        series={[
          { id: 'peso-der', color: 'acento', valores: reparto.der.map((v) => (Number.isFinite(v) ? v : null)), visible: true, ancho: 2 },
          { id: 'peso-izq', color: 'texto', valores: reparto.izq.map((v) => (Number.isFinite(v) ? v : null)), visible: true, ancho: 1.5 },
        ]}
        desde={desde}
        hasta={hasta}
        indice={indice}
        unidad={(v) => `${fmt(v, 0)} %`}
        altoMinimo={20}
        banda={[45, 55]}
        alto={140}
        etiqueta="Parte del peso en cada pie (%): derecho ámbar, izquierdo claro"
        testid="grafica-reparto"
        onBuscar={onBuscar}
      />
      <table className="w-full font-mono text-xs" data-testid="picos-cinetica">
        <thead>
          <tr className="text-texto-2">
            <th className="text-left font-normal">Pico {componente === 'sagital' ? 'sagital' : 'frontal'} (N·m/kg)</th>
            <th className="text-right font-normal">Der.</th>
            <th className="text-right font-normal">Izq.</th>
            <th className="text-right font-normal">Asimetría</th>
          </tr>
        </thead>
        <tbody>
          {ARTICULACIONES_CINETICA.filter((a) => componente === 'sagital' || a !== 'tobillo').map((a) => (
            <tr key={a}>
              <td className="text-texto-2">{NOMBRE_ART[a]}</td>
              <td className="text-right">{num(pico[a].der, 2)}</td>
              <td className="text-right">{num(pico[a].izq, 2)}</td>
              <td className="text-right">{Number.isFinite(pico[a].asimetria) ? `${num(pico[a].asimetria, 0)} %` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-mono text-xs text-texto-2" data-testid="resumen-cinetica">
        Peso medio en el pie derecho {num(media(reparto.der), 0)} % · {modo === 'cuasiestatica' ? 'cuasiestático' : 'dinámico'}, filtro {fmt(corteHz, 0)} Hz
      </p>
      <PanelExportar generar={generar} resumen={`${xs.length} frames · centro de masas, fuerza del suelo, peso en cada pie y momentos y potencias de las dos piernas, por kilo`} deshabilitado={ocupado} />
    </div>
  )
}
