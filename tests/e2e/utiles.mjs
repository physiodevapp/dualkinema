// Utilidades de las pruebas en navegador: servidor, navegador y gestos sobre la app.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

export const PUERTO = Number(process.env.E2E_PUERTO ?? 4173)
export const URL_APP = `http://localhost:${PUERTO}/`

/** Errores de consola y de página de todas las pruebas: la última prueba exige que no haya ninguno. */
export const errores = []

/** Sirve `dist/` (hay que haber hecho `npm run build`). Devuelve una función para pararlo. */
export async function servirApp() {
  const servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PUERTO), '--strictPort'], {
    stdio: 'ignore',
  })
  const parar = () => servidor.kill()
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(URL_APP)).ok) return parar
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  parar()
  throw new Error(`El servidor no ha arrancado en ${URL_APP}: ¿falta \`npm run build\`?`)
}

export const PUERTO_RELE = Number(process.env.E2E_PUERTO_RELE ?? 8799)
/** Dirección del relé local para la app (`?senal=`: solo se acepta en localhost). */
export const URL_RELE = `ws://127.0.0.1:${PUERTO_RELE}`

/** Levanta el relé de salas (senal/) con `wrangler dev` (workerd). Devuelve una función para pararlo. */
export async function servirRele() {
  const rele = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'senal/wrangler.jsonc', '--port', String(PUERTO_RELE), '--ip', '127.0.0.1'], {
    stdio: 'ignore',
  })
  const parar = () => rele.kill()
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PUERTO_RELE}/salud`)).ok) return parar
    } catch {
      /* arrancando */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  parar()
  throw new Error('El relé de salas no ha arrancado')
}

/** `CHROMIUM_PATH` permite usar un Chromium ya instalado en vez del de Playwright. */
export const lanzarNavegador = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })

/**
 * Como `lanzarNavegador`, con cámara y micrófono falsos (Chromium genera una imagen en movimiento y un pitido) y los
 * permisos concedidos sin preguntar: para el laboratorio de grabación y lo que se construya sobre él.
 */
export const lanzarNavegadorConCamaraFalsa = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })

/**
 * Abre la app con un ancho de escritorio (1280) o, con `ancho` por debajo de 800, como un móvil: las pruebas de
 * funcionamiento (seguimiento, huecos, escala…) no dependen del diseño del móvil y van en escritorio, donde todo está a la
 * vista; las que prueban el móvil piden `ancho: 390`. El idioma es es-ES: uPlot lo necesita.
 * `consulta` va tras la dirección (p. ej. `?laboratorio`).
 */
export async function abrirApp(navegador, { ancho = 1280, alto, consulta = '' } = {}) {
  const pagina = await navegador.newPage({
    locale: 'es-ES',
    viewport: { width: ancho, height: alto ?? (ancho >= 800 ? 900 : 844) },
    // Un móvil girado (poco alto) también es táctil.
    hasTouch: ancho < 800 || (alto ?? 900) < 600,
  })
  pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
  pagina.on('console', (m) => m.type() === 'error' && errores.push(`console: ${m.text()}`))
  await pagina.goto(URL_APP + consulta)
  return pagina
}

/** Carga un vídeo, elige hacia dónde mira la persona y espera al primer frame. */
export async function cargarVideo(p, ruta, mira = 'derecha') {
  await p.setInputFiles('input[type=file]', ruta)
  await p.getByRole('button', { name: `Mira a la ${mira}` }).click({ timeout: 20000 })
  await esperarQuieto(p)
}

/** Espera a que el visor haya pintado lo pedido (sin el «…» de «decodificando»). */
export async function esperarQuieto(p) {
  await p.waitForFunction(
    () => {
      const t = document.querySelector('[data-testid=posicion]')?.textContent ?? ''
      return t.includes('frame') && !t.includes('—') && !t.includes('…')
    },
    null,
    { timeout: 20000 },
  )
}

/**
 * Espera a que acaben las animaciones (el fundido de una vista ampliada, el aviso de un asa): medir cajas mientras se
 * mueven da posiciones distintas para cada elemento.
 */
export async function esperarVideoAsentado(p) {
  await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
  await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 })
}

/** «frame 31 / 120» y «t = 1,000 s» del visor → { frame (1-based), total, t }. */
export async function leerPosicion(p) {
  const texto = (await p.getByTestId('posicion').innerText()).replace(/\s+/g, ' ')
  // En el móvil la línea va sin «t =» ni «frame» para caber en una: «18,346 s 550 / 603 · 12 ms caché».
  const m = /(-?[\d.,]+) s\b.*?(\d+) \/ (\d+)/.exec(texto)
  if (!m) throw new Error(`No entiendo la posición del visor: «${texto}»`)
  return { t: Number(m[1].replace(',', '.')), frame: Number(m[2]), total: Number(m[3]) }
}

/** Salta al frame `i` (0-based) con el deslizador. */
export async function irAFrame(p, i) {
  await p.getByRole('slider', { name: 'Posición en el vídeo' }).fill(String(i))
  await esperarQuieto(p)
}

/** Número del frame que muestra el canvas, leído de los bloques de `numerado.webm` (bit b en el bloque b). */
export function leerFrameDibujado(p, { bits, ladoBloque }) {
  return p.evaluate(
    ({ bits, ladoBloque }) => {
      const ctx = document.querySelector('[data-testid=lienzo]').getContext('2d')
      let v = 0
      for (let b = 0; b < bits; b++) {
        const d = ctx.getImageData(b * ladoBloque + ladoBloque / 2, ladoBloque / 2, 1, 1).data
        if (d[0] > 128) v |= 1 << b
      }
      return v
    },
    { bits, ladoBloque },
  )
}

/**
 * Caja del vídeo en pantalla, con el vídeo a la vista. El ratón de Playwright
 * no llega fuera de la ventana: si mover el deslizador ha desplazado la página
 * y el vídeo queda en parte fuera (depende de la altura del texto, p. ej. si
 * no cargan las fuentes), el toque se perdería.
 */
export async function cajaVideo(p) {
  const capa = p.getByTestId('capa')
  // En pantalla ancha la página puede desplazarse; en el móvil no (el vídeo está siempre en su sitio).
  await capa.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await esperarVideoAsentado(p)
  return capa.boundingBox()
}

/**
 * Arrastra un asa (`data-testid`) `dy` px en vertical y la suelta (en dos tramos, como un dedo). Devuelve lo que
 * `durante()` mide justo antes de soltar, si se pasa.
 */
export async function arrastrarAsa(p, testid, dy, durante) {
  const c = await p.getByTestId(testid).boundingBox()
  const x = c.x + c.width / 2
  const y = c.y + c.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  await p.mouse.move(x, y + dy / 2, { steps: 4 })
  await p.mouse.move(x, y + dy, { steps: 4 })
  const medido = durante ? await durante() : undefined
  await p.mouse.up()
  await esperarVideoAsentado(p)
  return medido
}

/** Toca el vídeo en (x, y) de los px del vídeo (640×360 por defecto). */
export async function tocarVideo(p, x, y, { ancho = 640, alto = 360 } = {}) {
  const caja = await cajaVideo(p)
  await p.mouse.click(caja.x + (x / ancho) * caja.width, caja.y + (y / alto) * caja.height)
}

/** Marca los 3 gomets en el frame actual, tocando `desvio` px desviados del centro (como un dedo). */
export async function marcarTres(p, posiciones, desvio = 2) {
  for (const [i, q] of posiciones.entries()) await tocarVideo(p, q.x + (i % 2 ? -desvio : desvio), q.y + (i === 2 ? desvio : -desvio))
}

/** Pulsa «Seguir desde aquí» y espera a que termine. Devuelve el texto del aviso final. La pestaña abierta queda como estaba. */
export async function seguirHastaElFinal(p) {
  const antes = await pestanaAbierta(p)
  await abrirPestana(p, 'marcar')
  const seguir = p.getByRole('button', { name: 'Seguir desde aquí' })
  await centrarLibre(seguir)
  await seguir.click()
  await p.getByTestId('aviso').waitFor({ timeout: 90000 })
  const aviso = (await p.getByTestId('aviso').innerText()).replace(/\s+/g, ' ')
  await abrirPestana(p, antes)
  return aviso
}

/** Abre una pestaña de herramientas del visor («marcar», «analisis», «escala», «video») si no es la abierta. */
/**
 * Móvil en vertical: elige qué dos zonas se ven con el selector de arriba (`vg` vídeo y gráfica, `vh` vídeo y
 * herramientas, `gh` gráfica y herramientas).
 */
export async function elegirModo(p, modo) {
  await p.getByTestId(`modo-${modo}`).click()
  await p.waitForFunction((m) => document.querySelector(`[data-testid=modo-${m}]`)?.getAttribute('aria-pressed') === 'true', modo)
}

/** Pasa a gráfica y herramientas (con las herramientas abiertas, la gráfica pequeña solo se ve en este modo o en `vg`). */
export async function verGrafica(p) {
  await elegirModo(p, 'gh')
  await p.getByTestId('minigrafica').waitFor({ state: 'visible' })
}

export async function abrirPestana(p, id) {
  const pestana = p.getByTestId(`pestana-${id}`)
  if ((await pestana.getAttribute('aria-selected')) !== 'true') await pestana.click()
}

/** Pestaña en que vive cada elemento que se lee por data-testid (lo que no está aquí no está en pestañas). */
export function pestanaDe(testid) {
  if (/^(angulo|huecos-cortos)$/.test(testid)) return 'marcar'
  if (/^(corte|tramos-cortos|angulo-|cero-|velocidad-angular|aceleracion-angular|velocidad-marcador-)/.test(testid)) return 'analisis'
  if (/^(escala-|constancia-)/.test(testid)) return 'escala'
  return null
}

/** Pestaña abierta ahora. */
async function pestanaAbierta(p) {
  return p.locator('[role=tab][aria-selected=true]').getAttribute('data-testid').then((t) => t.replace('pestana-', ''))
}

/** Lee el texto de un elemento abriendo su pestaña y dejando abierta la que estaba (para no estorbar al resto de la prueba). */
export async function textoDe(p, testid) {
  const id = pestanaDe(testid)
  const antes = id ? await pestanaAbierta(p) : null
  if (id) await abrirPestana(p, id)
  try {
    return await p.getByTestId(testid).innerText()
  } finally {
    if (id && antes !== id) await abrirPestana(p, antes)
  }
}

/**
 * Centra el elemento en lo que queda libre de la ventana: ni fuera de ella ni bajo la barra fija de
 * abajo ni bajo el vídeo pegado de arriba (en el móvil), donde el ratón de Playwright caería sobre ellos.
 */
export async function centrarLibre(locator) {
  await locator.evaluate((e) => {
    const pegado = (id, tipo) => {
      const x = document.querySelector(`[data-testid=${id}]`)
      return x && getComputedStyle(x).position === tipo ? x : null
    }
    e.scrollIntoView({ block: 'center' })
    const fijo = pegado('visor-fijo', 'sticky')
    const barra = pegado('barra-fija', 'fixed')
    // Con el vídeo oculto al bajar, lo que queda arriba es la tira de pestañas.
    const tira = document.querySelector('[role=tablist]')?.parentElement
    const arriba = fijo ? (fijo.dataset.oculto === 'true' ? (tira?.getBoundingClientRect().bottom ?? 0) : fijo.getBoundingClientRect().height) : 0
    const abajo = barra ? barra.getBoundingClientRect().top : window.innerHeight
    const r = e.getBoundingClientRect()
    window.scrollBy(0, r.top + r.height / 2 - (arriba + abajo) / 2)
  })
}

/** Caja de un elemento por `data-testid`, centrado en lo libre de la ventana (ver `centrarLibre`). */
export async function cajaElemento(p, testid) {
  const el = p.getByTestId(testid)
  await centrarLibre(el)
  return el.boundingBox()
}

/** Ángulo que muestra el panel (o el filtrado, con testid 'angulo-filtrado'), en grados (NaN si no hay valor). */
export async function leerAngulo(p, testid = 'angulo') {
  const texto = await textoDe(p, testid)
  const m = /^(−|-)?([\d.,]+)°/.exec(texto.trim())
  return m ? (m[1] ? -1 : 1) * Number(m[2].replace(',', '.')) : NaN
}

/** Frame (0-based) más cercano al instante t, según la tabla de tiempos. */
export function frameMasCercano(tiempos, t) {
  return tiempos.reduce((mejor, x, k) => (Math.abs(x - t) < Math.abs(tiempos[mejor] - t) ? k : mejor), 0)
}

/**
 * Espera a que la sesión guardada en IndexedDB tenga `conDatos` frames con muestra.
 * El texto «Guardado…» del visor no basta: puede venir de un guardado anterior
 * mientras el último todavía se escribe.
 */
export async function esperarGuardado(p, conDatos) {
  await p.waitForFunction(
    async (n) => {
      const bd = await new Promise((ok, mal) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
      try {
        if (!bd.objectStoreNames.contains('sesiones')) return false
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        return todas.some((c) => c.resumen.conDatos === n)
      } finally {
        bd.close()
      }
    },
    conDatos,
    { timeout: 20000, polling: 200 },
  )
  await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo' }).waitFor({ state: 'attached', timeout: 10000 })
}

/** Elige `ruta` desde un botón que abre el selector de archivos (p. ej. «Continuar» de la lista). */
export async function elegirArchivoDesde(p, boton, ruta) {
  const [selector] = await Promise.all([p.waitForEvent('filechooser'), boton.click()])
  await selector.setFiles(ruta)
}

/** Espera a que la sesión guardada tenga el corte de filtro `corteHz`. */
export async function esperarFiltroGuardado(p, corteHz) {
  await p.waitForFunction(
    async (corte) => {
      const bd = await new Promise((ok, mal) => {
        const r = indexedDB.open('dualkinema')
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error)
      })
      try {
        if (!bd.objectStoreNames.contains('sesiones')) return false
        const todas = await new Promise((ok) => {
          const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
          r.onsuccess = () => ok(r.result)
        })
        return todas.some((c) => c.filtro?.corteHz === corte)
      } finally {
        bd.close()
      }
    },
    corteHz,
    { timeout: 20000, polling: 200 },
  )
}
