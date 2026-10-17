import {
  leerCabecera,
  leerDatos,
  type CabeceraSesion,
  type DatosSesion,
} from '../core/persistencia/esquema'
import { claveHuella, compararHuella, type Coincidencia, type HuellaArchivo } from '../core/persistencia/huella'

/*
 * Sesiones guardadas en IndexedDB, solo en este dispositivo. Base propia de
 * dualkinema (no la de PhysiQ). La versión de la base (VERSION_BD) cambia solo
 * si cambian los almacenes o los índices; el contenido de cada registro tiene
 * su propia versión (`esquema`, ver core/persistencia/esquema.ts).
 */
const NOMBRE_BD = 'dualkinema'
const VERSION_BD = 1
const SESIONES = 'sesiones'
const TRAYECTORIAS = 'trayectorias'
const POR_CLAVE = 'porClave'

let conexion: Promise<IDBDatabase> | null = null
/** La base ya abierta, para crear transacciones sin esperar a ninguna promesa (ver guardarSesion). */
let abierta: IDBDatabase | null = null

function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise<IDBDatabase>((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(SESIONES)) {
        bd.createObjectStore(SESIONES, { keyPath: 'id' }).createIndex(POR_CLAVE, 'claves', { multiEntry: true })
      }
      if (!bd.objectStoreNames.contains(TRAYECTORIAS)) bd.createObjectStore(TRAYECTORIAS, { keyPath: 'id' })
    }
    peticion.onsuccess = () => {
      const bd = peticion.result
      // Otra pestaña con una versión más nueva de la app quiere actualizar la base.
      bd.onversionchange = () => {
        bd.close()
        conexion = null
        abierta = null
      }
      abierta = bd
      resolver(bd)
    }
    peticion.onerror = () => rechazar(peticion.error ?? new Error('No se ha podido abrir el almacenamiento local.'))
    peticion.onblocked = () => rechazar(new Error('El almacenamiento local está bloqueado por otra pestaña de dualkinema: ciérrala.'))
  }).catch((e) => {
    conexion = null
    throw e
  })
  return conexion
}

const resultado = <T,>(p: IDBRequest<T>) =>
  new Promise<T>((resolver, rechazar) => {
    p.onsuccess = () => resolver(p.result)
    p.onerror = () => rechazar(p.error)
  })

const terminada = (tx: IDBTransaction) =>
  new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error)
    tx.onabort = () => rechazar(tx.error ?? new Error('Guardado cancelado.'))
  })

/** Sesión que está guardada pero que esta versión de la app no puede abrir. */
export interface SesionIlegible {
  readonly id: string
  readonly nombre: string
  readonly detalle: string
  readonly nueva: boolean
}

/** Todas las sesiones, la más reciente primero. Las que no se pueden leer van aparte, para poder borrarlas. */
export async function listarSesiones(): Promise<{ sesiones: CabeceraSesion[]; ilegibles: SesionIlegible[] }> {
  const bd = await abrir()
  const todas = await resultado(bd.transaction(SESIONES).objectStore(SESIONES).getAll())
  const sesiones: CabeceraSesion[] = []
  const ilegibles: SesionIlegible[] = []
  for (const registro of todas as unknown[]) {
    const r = leerCabecera(registro)
    if (r.ok) sesiones.push(r.valor)
    else {
      const crudo = registro as { id?: unknown; nombre?: unknown }
      ilegibles.push({
        id: String(crudo.id),
        nombre: typeof crudo.nombre === 'string' ? crudo.nombre : 'sin nombre',
        detalle: r.detalle,
        nueva: r.motivo === 'nueva',
      })
    }
  }
  sesiones.sort((a, b) => b.actualizada.localeCompare(a.actualizada))
  return { sesiones, ilegibles }
}

/** Sesiones con alguna vista de este vídeo, la más reciente primero. */
export async function buscarPorHuella(h: HuellaArchivo): Promise<{ cabecera: CabeceraSesion; coincidencia: Exclude<Coincidencia, 'distinta'> }[]> {
  const bd = await abrir()
  const indice = bd.transaction(SESIONES).objectStore(SESIONES).index(POR_CLAVE)
  const registros = (await resultado(indice.getAll(claveHuella(h)))) as unknown[]
  const r: { cabecera: CabeceraSesion; coincidencia: Exclude<Coincidencia, 'distinta'> }[] = []
  for (const registro of registros) {
    const c = leerCabecera(registro)
    if (!c.ok) continue
    const vista = c.valor.vistas.find((v) => compararHuella(v.huella, h) !== 'distinta')
    if (!vista) continue
    r.push({ cabecera: c.valor, coincidencia: compararHuella(vista.huella, h) as Exclude<Coincidencia, 'distinta'> })
  }
  return r.sort((a, b) => b.cabecera.actualizada.localeCompare(a.cabecera.actualizada))
}

/** Cabecera y trayectorias de una sesión, validadas. */
export async function leerSesion(id: string): Promise<{ cabecera: CabeceraSesion; datos: DatosSesion }> {
  const bd = await abrir()
  const tx = bd.transaction([SESIONES, TRAYECTORIAS])
  const [c, d] = await Promise.all([
    resultado(tx.objectStore(SESIONES).get(id)),
    resultado(tx.objectStore(TRAYECTORIAS).get(id)),
  ])
  if (c === undefined) throw new Error('La sesión ya no está guardada.')
  const cabecera = leerCabecera(c)
  if (!cabecera.ok) throw new Error(`No se puede abrir la sesión: ${cabecera.detalle}.`)
  const datos = leerDatos(d, cabecera.valor)
  if (!datos.ok) throw new Error(`No se pueden leer las trayectorias: ${datos.detalle}.`)
  return { cabecera: cabecera.valor, datos: datos.valor }
}

/**
 * Guarda cabecera y trayectorias en una sola transacción: o se guardan las
 * dos, o ninguna.
 *
 * Con la base ya abierta (lo está desde que se abrió el vídeo: se buscaron sus
 * sesiones), la transacción se crea y se cierra en la misma llamada, sin
 * esperar a ninguna promesa. Así el guardado lanzado al ocultar o recargar la
 * página llega a escribirse: creada unas microtareas después, Chromium la
 * descartaba al descargar la página. Y no hace falta poner los guardados en
 * cola: IndexedDB ejecuta las transacciones de escritura sobre los mismos
 * almacenes en el orden en que se crean, así que queda el último.
 */
export function guardarSesion(cabecera: CabeceraSesion, datos: DatosSesion): Promise<void> {
  const escribir = (bd: IDBDatabase) => {
    try {
      const tx = bd.transaction([SESIONES, TRAYECTORIAS], 'readwrite')
      tx.objectStore(SESIONES).put(cabecera)
      tx.objectStore(TRAYECTORIAS).put(datos)
      tx.commit()
      return terminada(tx)
    } catch (e) {
      // Base cerrándose (otra pestaña la actualiza) o datos que no se pueden clonar.
      abierta = null
      conexion = null
      return Promise.reject(e)
    }
  }
  return abierta ? escribir(abierta) : abrir().then(escribir)
}

export async function borrarSesion(id: string): Promise<void> {
  const bd = await abrir()
  const tx = bd.transaction([SESIONES, TRAYECTORIAS], 'readwrite')
  tx.objectStore(SESIONES).delete(id)
  tx.objectStore(TRAYECTORIAS).delete(id)
  await terminada(tx)
}

/**
 * Pide al navegador que no borre estos datos cuando le falte espacio. Chrome
 * decide sin preguntar (según el uso del sitio); si dice que no, los datos se
 * guardan igual, solo que podrían borrarse con el almacenamiento muy lleno.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
