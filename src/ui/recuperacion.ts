import type { CabeceraSesion, DatosSesion, VistaCabecera } from '../core/persistencia/esquema'
import { compararHuella, type HuellaArchivo } from '../core/persistencia/huella'
import { desempaquetarTrayectoria } from '../core/persistencia/trayectorias'
import type { IdMarcador, Muestra2D } from '../core/modelo/tipos'
import type { VideoAbierto } from '../media/video'
import { fechaCorta, textoResumen } from './sesion'
import type { SesionAbierta } from './visor/useGuardado'
import type { EntradaVista } from './visor/vistas'

/** Los vídeos ya abiertos de una sesión que se recupera, por id de vista. */
export type Abiertos = Readonly<Record<string, VideoAbierto>>

/**
 * La vista de la sesión a la que corresponde un archivo (por su huella, sin fijarse en el nombre), entre las que aún no
 * tienen vídeo. Si la sesión tiene dos vistas con el mismo vídeo (no debería), va a la primera libre.
 */
export function vistaDeHuella(cabecera: CabeceraSesion, huella: HuellaArchivo, abiertos: Abiertos): VistaCabecera | undefined {
  return cabecera.vistas.find((v) => !(v.id in abiertos) && compararHuella(v.huella, huella) !== 'distinta')
}

/** Las vistas de la sesión que todavía no tienen su vídeo. */
export const vistasQueFaltan = (cabecera: CabeceraSesion, abiertos: Abiertos): VistaCabecera[] => cabecera.vistas.filter((v) => !(v.id in abiertos))

/**
 * Lo que el visor necesita para continuar una sesión guardada, con todos sus vídeos abiertos: las vistas (la de
 * referencia primero) con sus trayectorias, ceros y escalas, y la sesión con su modelo y filtro.
 */
export function armarSesion(cabecera: CabeceraSesion, datos: DatosSesion, abiertos: Abiertos) {
  const orden = [...cabecera.vistas].sort((a, b) => Number(b.id === cabecera.referencia) - Number(a.id === cabecera.referencia))
  const vistas: EntradaVista[] = orden.map((v) => {
    const video = abiertos[v.id]!
    const total = video.tabla.tiempos.length
    const inicial = new Map<IdMarcador, (Muestra2D | undefined)[]>()
    for (const mk of cabecera.modelo.marcadores) inicial.set(mk.id, desempaquetarTrayectoria(datos.trayectorias[v.id]![mk.id]!, total))
    return { id: v.id, video, orientacion: v.orientacion, desfase: v.desfase, sincronia: v.sincronia, inicial, ceros: v.ceros, calibracion: v.calibracion, marcadores: v.marcadores, deteccion: v.deteccion }
  })
  const sesion: SesionAbierta = { id: cabecera.id, nombre: cabecera.nombre, creada: cabecera.creada, referencia: cabecera.referencia }
  return {
    vistas,
    sesion,
    modelo: cabecera.modelo,
    filtro: cabecera.filtro,
    aviso: `Trabajo recuperado tal como se guardó el ${fechaCorta(cabecera.actualizada)}: ${textoResumen(cabecera)}.`,
  }
}
