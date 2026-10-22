// Pruebas de punta a punta de la app en un navegador real (Chromium con Playwright).
// Los vídeos son sintéticos y se generan con ffmpeg (ver videos.mjs): la verdad
// (ángulo y posición de cada gomet en cada frame) se conoce de antemano.
//
//   npm run build && npm run test:e2e
//
import assert from 'node:assert/strict'
import { copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { asegurarVideos } from './videos.mjs'
import {
  abrirApp,
  abrirPestana,
  cajaElemento,
  cajaVideo,
  cargarVideo,
  centrarLibre,
  elegirArchivoDesde,
  errores,
  esperarFiltroGuardado,
  esperarGuardado,
  esperarQuieto,
  esperarVideoAsentado,
  frameMasCercano,
  irAFrame,
  lanzarNavegador,
  leerAngulo,
  textoDe,
  leerFrameDibujado,
  leerPosicion,
  marcarTres,
  seguirHastaElFinal,
  servirApp,
  tocarVideo,
} from './utiles.mjs'

/** Diferencia máxima aceptada entre el ángulo medido y el real, en grados (lo medido en la fase 1: ≤ 0,1°). */
const TOLERANCIA_GRADOS = 0.5
/** Frames donde se compara el ángulo medido con el real: incluye los que siguen a los huecos de fps. */
const FRAMES_A_COMPARAR = [1, 20, 40, 41, 60, 80, 81, 100, 119]

// Flexión real de los vídeos de rodilla: 45·(1 − cos(πt/2)); velocidad 45·(π/2)·sin(πt/2) °/s (pico 70,7 a t = 1 s).
const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)

let videos
let navegador
let pararServidor

before(async () => {
  videos = await asegurarVideos()
  pararServidor = await servirApp()
  navegador = await lanzarNavegador()
})

after(async () => {
  await navegador?.close()
  pararServidor?.()
})

/** Marca los 3 gomets en el primer frame y sigue hasta el final. Devuelve la página y el aviso final. */
async function seguirVideo(video, { ancho = 390 } = {}) {
  const p = await abrirApp(navegador, { ancho })
  await cargarVideo(p, video.ruta)
  await marcarTres(p, video.verdad[0].ps)
  const aviso = await seguirHastaElFinal(p)
  return { p, aviso }
}

async function compararAngulos(p, verdad) {
  for (const i of FRAMES_A_COMPARAR) {
    await irAFrame(p, i)
    const medido = await leerAngulo(p)
    assert.ok(
      Math.abs(medido - verdad[i].flexion) < TOLERANCIA_GRADOS,
      `frame ${i + 1}: medido ${medido}°, real ${verdad[i].flexion.toFixed(2)}°`,
    )
  }
}

describe('visor: frame exacto con fps variable', () => {
  let p
  before(async () => {
    p = await abrirApp(navegador)
    await cargarVideo(p, videos.numerado.ruta)
  })
  after(() => p?.close())

  it('muestra el frame pedido avanzando, retrocediendo y saltando (incluidos los fotogramas clave)', async () => {
    const { tiempos, bits, ladoBloque } = videos.numerado
    const siguiente = p.getByRole('button', { name: 'Frame siguiente' })
    const anterior = p.getByRole('button', { name: 'Frame anterior' })
    // [frame al que se va, cómo]. El vídeo tiene un fotograma clave cada 25 frames.
    const recorrido = [
      [0, 'deslizador'], [1, 'siguiente'], [2, 'siguiente'], [29, 'deslizador'], [30, 'siguiente'], [31, 'siguiente'],
      [30, 'anterior'], [29, 'anterior'], [24, 'deslizador'], [25, 'siguiente'], [60, 'deslizador'], [119, 'deslizador'],
      [118, 'anterior'], [7, 'deslizador'],
    ]
    for (const [i, como] of recorrido) {
      if (como === 'deslizador') await irAFrame(p, i)
      else {
        await (como === 'siguiente' ? siguiente : anterior).click()
        await esperarQuieto(p)
      }
      const pos = await leerPosicion(p)
      assert.equal(pos.frame, i + 1, `el texto dice frame ${pos.frame}, se pidió el ${i + 1} (${como})`)
      assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i, `el canvas muestra otro frame que el ${i + 1} (${como})`)
      assert.ok(Math.abs(pos.t - tiempos[i]) < 0.0015, `frame ${i + 1}: t = ${pos.t} s, se esperaba ${tiempos[i].toFixed(3)} s`)
    }
  })

  it('avisa de que los fps son variables y da el rango entre frames', async () => {
    await abrirPestana(p, 'video')
    const datos = await p.locator('section', { has: p.getByRole('heading', { name: 'Datos del vídeo' }) }).innerText()
    assert.match(datos, /variable/)
    assert.match(datos, /33,\d.{1,3}6\d,\d ms/s) // 33 ms normales y 66 ms con el frame que falta
  })

  it('teclado: flechas, Mayús para saltar de 10 en 10, Inicio y Fin', async () => {
    await irAFrame(p, 50)
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 52)
    await p.keyboard.press('Shift+ArrowLeft')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 42)
    await p.keyboard.press('End')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 120)
    await p.keyboard.press('Home')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 1)
  })

  it('las flechas sobre el corte del filtro cambian el corte, no el frame', async () => {
    await irAFrame(p, 50)
    await abrirPestana(p, 'analisis')
    const corte = p.getByRole('slider', { name: 'Frecuencia de corte del filtro' })
    const antes = await textoDe(p, 'corte')
    await corte.focus()
    await p.keyboard.press('ArrowRight')
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, 51)
    assert.notEqual(await textoDe(p, 'corte'), antes)
    await corte.blur()
  })

  it('mantener pulsado «siguiente» avanza seguido y se para al soltar', async () => {
    await irAFrame(p, 0)
    const caja = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
    await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
    await p.mouse.down()
    await p.waitForTimeout(1500)
    await p.mouse.up()
    await esperarQuieto(p)
    const alSoltar = (await leerPosicion(p)).frame
    assert.ok(alSoltar > 6, `solo ha avanzado hasta el frame ${alSoltar}`)
    await p.waitForTimeout(800)
    assert.equal((await leerPosicion(p)).frame, alSoltar, 'sigue avanzando después de soltar')
  })
})

describe('marcado: errores sobre el vídeo y siguiente marcador', () => {
  let p
  before(async () => {
    p = await abrirApp(navegador)
    await cargarVideo(p, videos.verde.ruta)
  })
  after(() => p?.close())

  it('un toque fuera de un gomet muestra el motivo encima del vídeo, con detalle técnico', async () => {
    await tocarVideo(p, 60, 300)
    const error = p.getByTestId('error-toque')
    await error.waitFor()
    const texto = await error.innerText()
    assert.match(texto, /gomet/)
    assert.match(texto, /tono \d+°, saturación/)
  })

  it('el mensaje de error no tapa la imagen (si no, el siguiente toque cae en él en vez de marcar)', async () => {
    const error = await p.getByTestId('error-toque').boundingBox()
    const imagen = await cajaVideo(p)
    assert.ok(error.y >= imagen.y + imagen.height - 1, `el error empieza en y=${error.y} y la imagen acaba en ${imagen.y + imagen.height}`)
  })

  it('cambiar de frame quita el error (y con él «Colocarlo aquí a ojo», que marcaría el frame anterior)', async () => {
    await irAFrame(p, 5)
    assert.equal(await p.getByTestId('error-toque').count(), 0)
    await irAFrame(p, 0)
    await tocarVideo(p, 60, 300)
    await p.getByTestId('error-toque').waitFor()
  })

  it('un toque correcto limpia el error y pasa al siguiente marcador', async () => {
    const [cadera] = videos.verde.verdad[0].ps
    await tocarVideo(p, cadera.x + 2, cadera.y - 2)
    await p.getByTestId('error-toque').waitFor({ state: 'detached' })
    assert.equal(await p.getByRole('radio', { name: /Epicóndilo/ }).getAttribute('aria-checked'), 'true')
    assert.match(await p.getByRole('radiogroup').innerText(), /Trocánter\s+a mano/)
  })
})

describe('lupa: anillo donde quedará el marcador', () => {
  it('sin gomet en la lupa no hay anillo; con él dentro, sí, y al soltar va a su centro', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const caja = await cajaVideo(p)
      const enPantalla = (x, y) => [caja.x + (x / 640) * caja.width, caja.y + (y / 360) * caja.height]
      const lupa = p.getByTestId('lupa')
      const ps = videos.verde.verdad[0].ps
      // En este vídeo (640 × 360 a 390 px de ancho) la lupa abarca 40 px del vídeo: busca a 20 del dedo.
      for (const [k, q] of ps.entries()) {
        await p.mouse.move(...enPantalla(q.x + 45, q.y + 30))
        await p.mouse.down()
        await lupa.waitFor()
        assert.equal(await lupa.getAttribute('data-gomet'), 'no', 'a 54 px no debería encontrar el gomet')
        await p.mouse.move(...enPantalla(q.x + 12, q.y - 8), { steps: 5 })
        assert.equal(await lupa.getAttribute('data-gomet'), 'si', 'a 14 px debería encontrar el gomet')
        await p.mouse.up()
        assert.equal(await p.getByTestId('error-toque').count(), 0, `marcador ${k + 1}: error al soltar`)
      }
      // Soltando a 14 px de cada gomet, el ángulo es el real: los tres quedaron en su centro.
      assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[0].flexion) < TOLERANCIA_GRADOS)
    } finally {
      await p.close()
    }
  })
})

// La gráfica completa está siempre a la vista a 1280 px; en el móvil solo en «Solo gráficas» (probada en «vistas ampliadas del móvil»).
describe('seguimiento y gráfica con gomets verdes', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.verde, { ancho: 1280 }))
  })
  after(() => p?.close())

  it('recorre el vídeo entero sin huecos', () => {
    assert.match(aviso, /sin huecos/)
  })

  it('el ángulo medido coincide con el real (tolerancia 0,5°) con fps variable', async () => {
    await compararAngulos(p, videos.verde.verdad)
  })

  it('el ángulo filtrado (6 Hz, coordenadas remuestreadas por el fps variable) coincide con el real', async () => {
    assert.match(await textoDe(p, 'corte'), /6,0 Hz/)
    // El corte aplicado se ve también en el botón de la serie filtrada de la gráfica.
    assert.match(await p.getByTestId('serie-filtrado').innerText(), /Filtrado 6,0 Hz/)
    for (const i of FRAMES_A_COMPARAR) {
      await irAFrame(p, i)
      const filtrado = await leerAngulo(p, 'angulo-filtrado')
      assert.ok(
        Math.abs(filtrado - videos.verde.verdad[i].flexion) < TOLERANCIA_GRADOS,
        `frame ${i + 1}: filtrado ${filtrado}°, real ${videos.verde.verdad[i].flexion.toFixed(2)}°`,
      )
    }
    assert.equal(await p.getByTestId('tramos-cortos').count(), 0)
  })

  it('la gráfica resume el máximo (90°) y el mínimo (0°) sin instantes sin valor', async () => {
    const resumen = await p.getByTestId('resumen-grafica').innerText()
    assert.match(resumen, /máx\. 9[0-1],\d° \(t = 2,0\d s\)/)
    assert.match(resumen, /mín\. 0,0°/)
    assert.doesNotMatch(resumen, /sin valor/)
  })

  it('tocar la gráfica salta al frame más cercano a ese instante (±1 frame)', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    for (const f of [0.25, 0.5, 0.75, 0.999]) {
      await p.mouse.click(caja.x + caja.width * f, caja.y + caja.height / 2)
      await esperarQuieto(p)
      const t = tiempos[0] + f * (tiempos.at(-1) - tiempos[0])
      const esperado = frameMasCercano(tiempos, t) + 1
      const { frame } = await leerPosicion(p)
      assert.ok(Math.abs(frame - esperado) <= 1, `al ${f * 100} % de la gráfica: frame ${frame}, esperado ${esperado}`)
    }
  })

  it('arrastrar sobre la gráfica mueve el vídeo con el dedo', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    await p.mouse.move(caja.x + caja.width * 0.1, caja.y + caja.height / 2)
    await p.mouse.down()
    await p.mouse.move(caja.x + caja.width * 0.4, caja.y + caja.height / 2, { steps: 8 })
    await p.mouse.up()
    await esperarQuieto(p)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.4 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
  })

  it('las series de la gráfica dan en cada frame el ángulo real (crudo y filtrado) y la velocidad real', async () => {
    const verdad = videos.verde.verdad
    for (const i of [10, 30, 41, 60, 81, 100, 110]) {
      await irAFrame(p, i)
      const crudo = await leerNumero(p, 'valor-serie-crudo')
      const filtrado = await leerNumero(p, 'valor-serie-filtrado')
      const v = await leerNumero(p, 'valor-serie-velocidad')
      assert.ok(Math.abs(crudo - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: crudo ${crudo}°, real ${verdad[i].flexion.toFixed(2)}°`)
      assert.ok(Math.abs(filtrado - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: filtrado ${filtrado}°`)
      assert.ok(Math.abs(v - velReal(verdad[i].t)) < 3, `frame ${i + 1}: ${v} °/s, real ${velReal(verdad[i].t).toFixed(1)} °/s`)
    }
    // Sin derivada en el primer frame: la serie de velocidad no tiene valor (nunca 0).
    await irAFrame(p, 0)
    assert.equal(await p.getByTestId('valor-serie-velocidad').innerText(), '—')
  })

  it('cambiar de frame no redibuja la gráfica: el cursor va en una capa aparte, en su instante', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    await irAFrame(p, 20)
    const redibujos = async () => [await p.getByTestId('grafica-angulo').getAttribute('data-redibujos'), await p.getByTestId('grafica-velocidad').getAttribute('data-redibujos')]
    const antes = await redibujos()
    assert.ok(antes.every((n) => Number(n) > 0))
    for (const i of [21, 22, 40, 41, 90]) {
      await irAFrame(p, i)
      for (const id of ['grafica-angulo', 'grafica-velocidad']) {
        // La línea del cursor cae en el instante del frame (±1 px).
        const area = await p.getByTestId(`${id}-area`).boundingBox()
        const linea = await p.getByTestId(`${id}-cursor`).boundingBox()
        const esperado = area.x + ((tiempos[i] - tiempos[0]) / (tiempos.at(-1) - tiempos[0])) * area.width
        assert.ok(Math.abs(linea.x - esperado) <= 1.5, `${id}, frame ${i + 1}: cursor en ${linea.x}, esperado ${esperado}`)
      }
    }
    for (let k = 0; k < 5; k++) {
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
    }
    assert.deepEqual(await redibujos(), antes)
  })

  it('cada interruptor oculta y muestra su serie; un panel sin series no se dibuja', async () => {
    const velocidad = p.getByTestId('serie-velocidad')
    assert.equal(await velocidad.getAttribute('aria-pressed'), 'true')
    await velocidad.click()
    assert.equal(await velocidad.getAttribute('aria-pressed'), 'false')
    assert.equal(await p.getByTestId('grafica-velocidad').count(), 0)
    await velocidad.click()
    await p.getByTestId('grafica-velocidad').waitFor()
    // Sin crudo ni filtrado, el panel del ángulo desaparece; con uno de los dos, vuelve.
    await p.getByTestId('serie-crudo').click()
    assert.equal(await p.getByTestId('grafica-angulo').count(), 1)
    await p.getByTestId('serie-filtrado').click()
    assert.equal(await p.getByTestId('grafica-angulo').count(), 0)
    await p.getByTestId('serie-crudo').click()
    await p.getByTestId('serie-filtrado').click()
    await p.getByTestId('grafica-angulo').waitFor()
  })

  it('longitud de los segmentos: oculta al empezar; mostrada, cerca de 0 % en todo el vídeo (son rígidos)', async () => {
    const botones = p.locator('[data-testid^="serie-segmento-"]')
    assert.equal(await botones.count(), 2)
    assert.equal(await p.getByTestId('grafica-segmentos').count(), 0)
    for (let k = 0; k < 2; k++) {
      assert.equal(await botones.nth(k).getAttribute('aria-pressed'), 'false')
      await botones.nth(k).click()
    }
    await p.getByTestId('grafica-segmentos').waitFor()
    const ids = await botones.evaluateAll((bs) => bs.map((b) => b.dataset.testid.replace('serie-', '')))
    // En el vídeo, cadera–rodilla mide siempre 130 px y rodilla–tobillo 120 px: 0 % en cada frame.
    for (const i of [0, 30, 41, 60, 81, 119]) {
      await irAFrame(p, i)
      for (const id of ids) {
        const v = await leerNumero(p, `valor-serie-${id}`)
        assert.ok(Math.abs(v) < 1, `${id}, frame ${i + 1}: ${v} %`)
      }
    }
    // Tocar esta gráfica también lleva al frame.
    const caja = await cajaElemento(p, 'grafica-segmentos-area')
    await p.mouse.click(caja.x + caja.width * 0.3, caja.y + caja.height / 2)
    await esperarQuieto(p)
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.3 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
    for (let k = 0; k < 2; k++) await botones.nth(k).click()
    assert.equal(await p.getByTestId('grafica-segmentos').count(), 0)
  })

  it('tocar la gráfica de velocidad también salta al frame más cercano', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-velocidad-area')
    await p.mouse.click(caja.x + caja.width * 0.6, caja.y + caja.height / 2)
    await esperarQuieto(p)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.6 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
  })
})

describe('progreso del seguimiento: en la franja del deslizador y en «Parar»', () => {
  it('mientras se sigue, «Parar» lleva el porcentaje y la franja se va poniendo verde', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      const parar = p.getByRole('button', { name: /^Parar/ })
      await parar.waitFor()
      assert.match(await parar.innerText(), /Parar\s+\d+ %/)
      await p.getByTestId('aviso').waitFor({ timeout: 90000 })
      assert.equal(await p.getByTestId('progreso-seguimiento').count(), 0)
    } finally {
      await p.close()
    }
  })
})

/**
 * Frena el worker de seguimiento: cada lectura de píxeles tarda `ms` más. El seguimiento del vídeo sintético dura
 * menos de un segundo; frenado, dura varios y da tiempo a mirar y a tocar a medias (frenar la CPU no frena el worker).
 */
async function frenarWorker(p, ms = 15) {
  await p.context().route('**/seguimiento.worker-*.js', async (ruta) => {
    const r = await ruta.fetch()
    const freno = `{ const g = OffscreenCanvasRenderingContext2D.prototype.getImageData
      OffscreenCanvasRenderingContext2D.prototype.getImageData = function (...a) {
        const fin = performance.now() + ${ms}; while (performance.now() < fin); return g.apply(this, a) } }\n`
    await ruta.fulfill({ response: r, body: freno + (await r.text()) })
  })
}

describe('«Parar» a mitad del seguimiento', () => {
  let p
  const verdad = () => videos.verde.verdad
  before(async () => {
    p = await abrirApp(navegador, { ancho: 1280 })
    await frenarWorker(p)
    await cargarVideo(p, videos.verde.ruta)
    await marcarTres(p, verdad()[0].ps)
  })
  after(() => p?.close())

  it('se queda lo seguido hasta parar (con el ángulo real), lo de después sin seguir, y se avisa', async () => {
    await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
    // Varios lotes del worker ya aplicados: el porcentaje de «Parar» pasa del 30 %.
    await p.waitForFunction(() => Number.parseInt(document.querySelector('[data-testid=progreso-seguimiento]')?.textContent ?? '0') >= 30, null, {
      timeout: 60000,
    })
    await p.getByRole('button', { name: /^Parar/ }).click()
    await p.getByTestId('aviso').waitFor({ timeout: 30000 })
    const aviso = (await p.getByTestId('aviso').innerText()).replace(/\s+/g, ' ')
    assert.match(aviso, /^Seguimiento parado/, `aviso: «${aviso}»`)
    assert.doesNotMatch(aviso, /completado/)
    assert.equal(await p.getByTestId('progreso-seguimiento').count(), 0)
    await p.getByRole('button', { name: 'Seguir desde aquí' }).waitFor()
    // Lo seguido antes de parar se conserva y es el ángulo real.
    for (const i of [1, 20]) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad()[i].flexion.toFixed(2)}°`)
    }
    // Lo que no llegó a seguirse queda sin posición: sin ángulo, nada inventado.
    await irAFrame(p, verdad().length - 1)
    assert.ok(Number.isNaN(await leerAngulo(p)), 'el último frame no se llegó a seguir y tiene ángulo')
  })

  it('seguir desde un frame ya seguido termina el vídeo con el ángulo real', async () => {
    await irAFrame(p, 20)
    const aviso = await seguirHastaElFinal(p)
    assert.match(aviso, /completado hasta el final del vídeo, sin huecos/, `aviso: «${aviso}»`)
    for (const i of [60, 100, verdad().length - 1]) {
      await irAFrame(p, i)
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - verdad()[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad()[i].flexion.toFixed(2)}°`)
    }
  })
})

describe('seguir de nuevo desde un frame intermedio de un vídeo ya seguido', () => {
  it('lo de antes no cambia, lo de después se rehace con el ángulo real y no quedan huecos', async () => {
    const { p } = await seguirVideo(videos.verde)
    try {
      const verdad = videos.verde.verdad
      await irAFrame(p, 20)
      const antes20 = await textoDe(p, 'angulo')
      await irAFrame(p, 60)
      const aviso = await seguirHastaElFinal(p)
      assert.match(aviso, /completado hasta el final del vídeo, sin huecos/, `aviso: «${aviso}»`)
      // Antes del frame de partida no se toca nada (mismo texto, no solo el mismo valor redondeado a la tolerancia).
      await irAFrame(p, 20)
      assert.equal(await textoDe(p, 'angulo'), antes20)
      for (const i of [61, 90, verdad.length - 1]) {
        await irAFrame(p, i)
        const medido = await leerAngulo(p)
        assert.ok(Math.abs(medido - verdad[i].flexion) < TOLERANCIA_GRADOS, `frame ${i + 1}: ${medido}°, real ${verdad[i].flexion.toFixed(2)}°`)
      }
      assert.doesNotMatch(await p.getByTestId('resumen-grafica').innerText(), /sin valor/)
    } finally {
      await p.close()
    }
  })
})

describe('seguimiento con gomets rojos sobre piel', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.rojo))
  })
  after(() => p?.close())

  it('los separa de la piel y recorre el vídeo sin huecos', () => {
    assert.match(aviso, /sin huecos/)
  })

  it('el ángulo medido coincide con el real (tolerancia 0,5°)', async () => {
    await compararAngulos(p, videos.rojo.verdad)
  })
})

describe('un gomet tapado unos frames', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.oculto))
  })
  after(() => p?.close())

  const ocultos = () => videos.oculto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))

  it('el aviso, la gráfica y la franja cuentan exactamente los frames tapados', async () => {
    const n = ocultos().length
    assert.ok(n >= 6, 'el vídeo de prueba debería tapar el tobillo varios frames')
    assert.match(aviso, new RegExp(`Maléolo no tiene posición fiable en ${n} frames`))
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${n} sin valor`))
  })

  it('durante el hueco no hay ángulo (nunca 0 ni inventado) y fuera de él sí', async () => {
    const [primero] = ocultos()
    await irAFrame(p, primero + 2)
    assert.match(await p.getByRole('radiogroup').innerText(), /Maléolo\s+perdido/)
    assert.ok(Number.isNaN(await leerAngulo(p)))
    const despues = ocultos().at(-1) + 3
    await irAFrame(p, despues)
    assert.match(await p.getByRole('radiogroup').innerText(), /Maléolo\s+seguido/)
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[despues].flexion) < TOLERANCIA_GRADOS)
  })

  it('el filtro no cruza el hueco: dentro no hay ángulo filtrado; justo a los lados, sí y cerca del real', async () => {
    const tapados = ocultos()
    await irAFrame(p, tapados[2])
    assert.equal(await textoDe(p, 'angulo-filtrado'), '—')
    // Bordes de los dos tramos (reflexión en los extremos): ±1°.
    for (const i of [tapados[0] - 1, tapados.at(-1) + 1]) {
      await irAFrame(p, i)
      const filtrado = await leerAngulo(p, 'angulo-filtrado')
      assert.ok(Math.abs(filtrado - videos.oculto.verdad[i].flexion) < 1, `frame ${i + 1}: filtrado ${filtrado}°`)
    }
  })

  it('«Ir al primer frame con hueco» lleva al primero', async () => {
    const [primero] = ocultos()
    await irAFrame(p, 0)
    await p.getByRole('button', { name: new RegExp(`Ir al primer frame con hueco \\(${primero + 1}\\)`) }).click()
    await esperarQuieto(p)
    assert.equal((await leerPosicion(p)).frame, primero + 1)
  })

  it('el desplegable «Por qué» explica el motivo', async () => {
    await p.getByText('Por qué (para diagnosticar)').click()
    assert.match(await p.getByRole('status').innerText(), /Maléolo: \d+ .*(sin su color|tamaño distinto|lejos de lo esperado|dudosa)/s)
  })
})

describe('persistencia: marcar, seguir, recargar y recuperar', () => {
  let p
  let n
  /** Lo que mostraba el visor antes de recargar: ángulo en cada frame comparado, resumen y estado de los marcadores. */
  const antes = { angulos: [], resumen: '', marcadores: '' }

  before(async () => {
    ;({ p } = await seguirVideo(videos.verde))
    n = videos.verde.verdad.length
    await esperarGuardado(p, n)
    for (const i of FRAMES_A_COMPARAR) {
      await irAFrame(p, i)
      antes.angulos.push(await p.getByTestId('angulo').innerText())
    }
    antes.resumen = await p.getByTestId('resumen-grafica').innerText()
    await irAFrame(p, 0)
    antes.marcadores = await p.getByRole('radiogroup').innerText()
  })
  after(() => p?.close())

  it('tras recargar, la portada lista la sesión con su resumen', async () => {
    await p.reload()
    const sesion = p.getByTestId('sesion-guardada')
    await sesion.waitFor()
    assert.equal(await sesion.count(), 1)
    const texto = await sesion.innerText()
    assert.match(texto, /verde/)
    assert.match(texto, /mira a la derecha/)
    // Los 3 gomets se marcaron a mano en el primer frame y el resto se siguió.
    assert.match(texto, new RegExp(`${n} de ${n} frames seguidos · 1 con marcas a mano`))
  })

  it('al abrir el mismo vídeo ofrece recuperar el trabajo y lo recupera tal cual', async () => {
    await p.setInputFiles('input[type=file]', videos.verde.ruta)
    await p.getByRole('heading', { name: 'Ya has trabajado con este vídeo' }).waitFor({ timeout: 20000 })
    assert.equal(await p.getByTestId('candidata').count(), 1)
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await esperarQuieto(p)
    // Sin volver a preguntar la orientación: se guardó con la sesión.
    assert.match(await p.getByTestId('aviso').innerText(), /Trabajo recuperado/)
    // Ya está guardado: no debe decir «en cuanto marques algo».
    assert.match(await p.getByTestId('guardado').innerText(), /Guardado en este dispositivo\. Lo que cambies se guarda solo/)
    for (const [k, i] of FRAMES_A_COMPARAR.entries()) {
      await irAFrame(p, i)
      assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[k], `frame ${i + 1}`)
      assert.ok(Math.abs((await leerAngulo(p)) - videos.verde.verdad[i].flexion) < TOLERANCIA_GRADOS)
    }
    assert.equal(await p.getByTestId('resumen-grafica').innerText(), antes.resumen)
    await irAFrame(p, 0)
    assert.equal(await p.getByRole('radiogroup').innerText(), antes.marcadores)
    assert.match(antes.marcadores, /a mano/)
  })

  it('recuperar no crea otra sesión, y seguir trabajando actualiza la misma', async () => {
    // Recuperado no hay marcador elegido: se elige el trocánter y se corrige en el frame 6.
    await irAFrame(p, 5)
    await p.getByRole('radio', { name: /Trocánter/ }).click()
    await tocarVideo(p, videos.verde.verdad[5].ps[0].x + 1, videos.verde.verdad[5].ps[0].y - 1)
    await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo' }).waitFor({ state: 'attached', timeout: 10000 })
    await p.reload()
    await p.getByTestId('sesion-guardada').waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 1)
    assert.match(await p.getByTestId('sesion-guardada').innerText(), /2 con marcas a mano/)
  })

  it('«Continuar» con otro vídeo explica que no es el suyo y no abre nada', async () => {
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.numerado.ruta)
    const error = p.getByText(/no es el vídeo de la sesión/)
    await error.waitFor({ timeout: 20000 })
    assert.match(await error.innerText(), /tamaño/)
    assert.equal(await p.getByTestId('lienzo').count(), 0)
  })

  it('un vídeo sin trabajo guardado no pregunta y va a la orientación', async () => {
    await p.setInputFiles('input[type=file]', videos.numerado.ruta)
    await p.getByRole('button', { name: 'Mira a la derecha' }).waitFor({ timeout: 20000 })
    assert.equal(await p.getByText('Ya has trabajado con este vídeo').count(), 0)
    await p.reload()
  })

  it('«Continuar» con su vídeo lo recupera directamente', async () => {
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.verde.ruta)
    await esperarQuieto(p)
    assert.match(await p.getByTestId('aviso').innerText(), /Trabajo recuperado/)
    await irAFrame(p, FRAMES_A_COMPARAR[3])
    assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[3])
  })

  it('el mismo vídeo con otro nombre (selector de fotos de Android) se reconoce, avisando', async () => {
    const copia = join(tmpdir(), '1000012345.webm')
    await copyFile(videos.verde.ruta, copia)
    await p.reload()
    await p.setInputFiles('input[type=file]', copia)
    const candidata = p.getByTestId('candidata')
    await candidata.waitFor({ timeout: 20000 })
    assert.match(await candidata.innerText(), new RegExp(`Se guardó como «${basename(videos.verde.ruta)}».*es el mismo vídeo`, 's'))
    await p.getByRole('button', { name: 'Recuperar el trabajo' }).click()
    await esperarQuieto(p)
    await irAFrame(p, FRAMES_A_COMPARAR[3])
    assert.equal(await p.getByTestId('angulo').innerText(), antes.angulos[3])
  })

  it('«Empezar de cero» deja lo guardado y crea otra sesión al marcar', async () => {
    await p.reload()
    await p.setInputFiles('input[type=file]', videos.verde.ruta)
    await p.getByRole('button', { name: 'Empezar de cero' }).click({ timeout: 20000 })
    await p.getByRole('button', { name: 'Mira a la derecha' }).click()
    await esperarQuieto(p)
    assert.equal(await leerAngulo(p).then(Number.isNaN), true)
    assert.match(await p.getByTestId('guardado').innerText(), /en cuanto marques algo/)
    await marcarTres(p, videos.verde.verdad[0].ps)
    // Se recarga sin esperar al guardado diferido (1 s): lo guarda el aviso de que la página se oculta.
    await p.reload()
    await p.getByTestId('sesion-guardada').first().waitFor()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 2)
  })

  it('borrar pide confirmación y quita la sesión de la lista', async () => {
    const primera = p.getByTestId('sesion-guardada').first()
    await primera.getByRole('button', { name: /^Borrar/ }).click()
    await primera.getByRole('button', { name: 'No' }).click()
    assert.equal(await p.getByTestId('sesion-guardada').count(), 2)
    await primera.getByRole('button', { name: /^Borrar/ }).click()
    await primera.getByRole('button', { name: 'Sí, borrar' }).click()
    await p.waitForFunction(() => document.querySelectorAll('[data-testid=sesion-guardada]').length === 1)
    await p.getByTestId('sesion-guardada').getByRole('button', { name: /^Borrar/ }).click()
    await p.getByRole('button', { name: 'Sí, borrar' }).click()
    await p.getByRole('heading', { name: 'Sesiones guardadas' }).waitFor({ state: 'detached' })
  })
})

describe('filtro: el corte se guarda con la sesión', () => {
  it('cambiar el corte, recargar y recuperar lo deja como estaba', async () => {
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, videos.verde.verdad.length)
      await abrirPestana(p, 'analisis')
      await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('9')
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await esperarFiltroGuardado(p, 9)
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.match(await textoDe(p, 'corte'), /9,0 Hz/)
      await abrirPestana(p, 'analisis')
      assert.equal(await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).inputValue(), '9')
      await irAFrame(p, 60)
      assert.ok(Math.abs((await leerAngulo(p, 'angulo-filtrado')) - videos.verde.verdad[60].flexion) < TOLERANCIA_GRADOS)
      // «Volver a 6 Hz» y se guarda también.
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Volver a 6 Hz' }).click()
      await esperarFiltroGuardado(p, 6)
    } finally {
      await p.close()
    }
  })
})

describe('persistencia: recuperar a medio marcar', () => {
  it('elige el primer marcador que falta, como al marcar', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const [cadera] = videos.verde.verdad[0].ps
      await tocarVideo(p, cadera.x, cadera.y)
      await esperarGuardado(p, 1)
      await p.reload()
      await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.verde.ruta)
      await esperarQuieto(p)
      assert.equal(await p.getByRole('radio', { name: /Trocánter/ }).getAttribute('aria-checked'), 'false')
      assert.equal(await p.getByRole('radio', { name: /Epicóndilo/ }).getAttribute('aria-checked'), 'true')
      // Y se puede seguir marcando sin elegirlo antes.
      const [, rodilla] = videos.verde.verdad[0].ps
      await tocarVideo(p, rodilla.x, rodilla.y)
      assert.equal(await p.getByRole('radio', { name: /Maléolo/ }).getAttribute('aria-checked'), 'true')
    } finally {
      await p.close()
    }
  })

  it('quitar lo único que había también se guarda (no vuelve al recuperar)', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      const [cadera] = videos.verde.verdad[0].ps
      await tocarVideo(p, cadera.x, cadera.y)
      await esperarGuardado(p, 1)
      // Sin elegir el marcador antes: el botón sale solo en el frame con la marca a mano.
      await p.getByRole('button', { name: /Quitar la marca a mano: Trocánter/ }).click()
      await esperarGuardado(p, 0)
    } finally {
      await p.close()
    }
  })
})

/** Elige un marcador (sin desmarcarlo si ya estaba elegido). */
async function elegirMarcador(p, nombre) {
  const r = p.getByRole('radio', { name: new RegExp(nombre) })
  if ((await r.getAttribute('aria-checked')) !== 'true') await r.click()
}
const estadoMarcador = async (p, nombre) =>
  new RegExp(`${nombre}\\s+(\\S[^\\n]*)`).exec(await p.getByRole('radiogroup').innerText())?.[1]?.trim()

describe('corrección manual: arrastrar, a ojo, quitar y anclas', () => {
  let p
  let aviso
  const ocultos = () => videos.oculto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.oculto))
  })
  after(() => p?.close())

  it('un hueco de 0,3 s no se ofrece para rellenar', async () => {
    assert.match(aviso, /no tiene posición fiable/)
    assert.equal(await p.getByTestId('huecos-cortos').count(), 0)
  })

  it('arrastrar con la lupa coloca el marcador en el gomet donde se suelta', async () => {
    const i = 30
    await irAFrame(p, i)
    await elegirMarcador(p, 'Trocánter')
    const real = videos.oculto.verdad[i].ps[0]
    const caja = await cajaVideo(p)
    const enPantalla = (x, y) => [caja.x + (x / 640) * caja.width, caja.y + (y / 360) * caja.height]
    await p.mouse.move(...enPantalla(real.x + 40, real.y + 30))
    await p.mouse.down()
    await p.mouse.move(...enPantalla(real.x + 1, real.y - 1), { steps: 6 })
    await p.mouse.up()
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'a mano')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[i].flexion) < TOLERANCIA_GRADOS)
  })

  it('con el gomet tapado ofrece colocarlo a ojo, y queda marcado a mano', async () => {
    const i = ocultos()[2]
    await irAFrame(p, i)
    assert.ok(Number.isNaN(await leerAngulo(p)))
    await elegirMarcador(p, 'Maléolo')
    const real = videos.oculto.verdad[i].ps[2]
    await tocarVideo(p, real.x, real.y)
    await p.getByTestId('error-toque').waitFor()
    await p.getByRole('button', { name: 'Colocarlo aquí a ojo' }).click()
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[i].flexion) < 1.5)
  })

  it('al seguir de nuevo, lo marcado a mano es un ancla: se respeta y deja de contar como hueco', async () => {
    await irAFrame(p, 0)
    const texto = await seguirHastaElFinal(p)
    // El aviso lo cuenta el worker: si no recibiera las anclas, contaría el frame a ojo como hueco.
    assert.match(texto, new RegExp(`Maléolo no tiene posición fiable en ${ocultos().length - 1} frames`))
    await irAFrame(p, ocultos()[2])
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'a mano')
  })

  it('si no se puede arrancar desde un frame (gomet a ojo, tapado), lo seguido después se conserva', async () => {
    const despues = ocultos().at(-1) + 3
    await irAFrame(p, ocultos()[2])
    const texto = await seguirHastaElFinal(p)
    assert.match(texto, /No reconozco Maléolo/)
    await irAFrame(p, despues)
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'seguido')
    assert.ok(Math.abs((await leerAngulo(p)) - videos.oculto.verdad[despues].flexion) < TOLERANCIA_GRADOS)
  })

  it('una marca a mano equivocada se puede quitar', async () => {
    await irAFrame(p, ocultos()[2])
    // Aunque no sea el marcador elegido: sale un botón por cada marcador con marca a mano en el frame.
    await elegirMarcador(p, 'Epicóndilo')
    await p.getByRole('button', { name: /Quitar la marca a mano: Maléolo/ }).click()
    assert.equal(await estadoMarcador(p, 'Maléolo'), '—')
    assert.ok(Number.isNaN(await leerAngulo(p)))
  })

  it('antes de seguir avisa de las marcas a mano posteriores (serán anclas) y deja quitarlas', async () => {
    // Queda la del trocánter en el frame 31 (la que se arrastró con la lupa).
    await irAFrame(p, 0)
    const aviso = p.getByTestId('aviso-anclas')
    await aviso.waitFor()
    assert.match(await aviso.innerText(), /Hay marcas a mano más adelante \(frames 31\)/)
    // Desde un frame posterior a todas, no hay nada que avisar.
    await irAFrame(p, 60)
    assert.equal(await p.getByTestId('aviso-anclas').count(), 0)
    await irAFrame(p, 0)
    // También en el vídeo grande (versión corta), que es donde se marca y se sigue.
    await p.getByTestId('ampliar-video').click()
    const compacto = p.getByTestId('marcado-compacto').getByTestId('aviso-anclas')
    await compacto.waitFor()
    assert.match(await compacto.innerText(), /frames 31\): se usan como anclas/)
    await p.getByTestId('reducir-video').click()
    await aviso.getByRole('button', { name: 'Quitar las marcas a mano posteriores' }).click()
    assert.equal(await p.getByTestId('aviso-anclas').count(), 0)
    assert.match(await p.getByTestId('aviso').innerText(), /Quitadas 1 marca a mano posteriores al frame 1/)
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), '—')
    // Y se puede volver a seguir: el hueco se rehace y ya no hay anclas.
    await irAFrame(p, 0)
    const texto = await seguirHastaElFinal(p)
    assert.match(texto, /Maléolo no tiene posición fiable en \d+ frames/)
    await irAFrame(p, 30)
    assert.equal(await estadoMarcador(p, 'Trocánter'), 'seguido')
  })
})

describe('mientras se sigue, lo filtrado se rehace (no se queda en la pasada anterior)', () => {
  let p
  const verdad = () => videos.verde.verdad
  before(async () => {
    p = await abrirApp(navegador, { ancho: 1280 })
    // El seguimiento del vídeo sintético dura menos de un segundo: con cada lectura de píxeles del worker
    // frenada 15 ms, dura varios y da tiempo a mirar a medias (frenar la CPU no frena el worker).
    await p.context().route('**/seguimiento.worker-*.js', async (ruta) => {
      const r = await ruta.fetch()
      const freno = `{ const g = OffscreenCanvasRenderingContext2D.prototype.getImageData
        OffscreenCanvasRenderingContext2D.prototype.getImageData = function (...a) {
          const fin = performance.now() + 15; while (performance.now() < fin); return g.apply(this, a) } }\n`
      await ruta.fulfill({ response: r, body: freno + (await r.text()) })
    })
    await cargarVideo(p, videos.verde.ruta)
    await marcarTres(p, verdad()[0].ps)
  })
  after(() => p?.close())

  const siguiendo = async () => (await p.getByTestId('progreso-seguimiento').count()) > 0
  async function pulsarSeguir() {
    await abrirPestana(p, 'marcar')
    const seguir = p.getByRole('button', { name: 'Seguir desde aquí' })
    await centrarLibre(seguir)
    await seguir.click()
    await p.getByTestId('progreso-seguimiento').waitFor()
  }
  /** Toca la gráfica en el instante del frame i (se puede mientras se sigue). */
  async function tocarFrame(i) {
    const ts = verdad().map((f) => f.t)
    const caja = await cajaElemento(p, 'grafica-angulo-area')
    await p.mouse.click(caja.x + (caja.width * (ts[i] - ts[0])) / (ts.at(-1) - ts[0]), caja.y + caja.height / 2)
    await esperarQuieto(p)
  }

  it('la primera vez, el ángulo filtrado aparece antes de acabar de seguir y da el real', async () => {
    await pulsarSeguir()
    await tocarFrame(20)
    // Antes, lo filtrado era lo de antes de seguir (solo el frame 0) hasta parar: «—» todo el seguimiento.
    await p.waitForFunction(() => /\d/.test(document.querySelector('[data-testid=valor-serie-filtrado]')?.textContent ?? ''), null, { timeout: 15000 })
    const filtrado = await leerNumero(p, 'valor-serie-filtrado')
    assert.ok(await siguiendo(), 'el ángulo filtrado no apareció hasta acabar de seguir')
    assert.ok(Math.abs(filtrado - verdad()[20].flexion) < 1, `filtrado ${filtrado}°, real ${verdad()[20].flexion.toFixed(2)}°`)
    await p.getByTestId('aviso').waitFor({ timeout: 90000 })
  })

  it('al seguir de nuevo desde un frame intermedio, no queda ángulo filtrado donde ya no hay nada seguido', async () => {
    await irAFrame(p, 30)
    await pulsarSeguir()
    await tocarFrame(115)
    // Primero lo filtrado y después lo crudo: si lo filtrado tiene valor, el frame ya estaba seguido al filtrar.
    const filtrado = await p.getByTestId('valor-serie-filtrado').innerText()
    const crudo = await p.getByTestId('valor-serie-crudo').innerText()
    assert.ok(await siguiendo(), 'el seguimiento acabó antes de poder mirar: la prueba no dice nada')
    assert.equal(crudo.trim(), '—', 'el frame 116 aún no se ha vuelto a seguir')
    assert.equal(filtrado.trim(), '—', `ángulo filtrado ${filtrado} en un frame sin nada seguido (lo de la pasada anterior)`)
    await p.getByTestId('aviso').waitFor({ timeout: 90000 })
    await esperarQuieto(p)
    assert.ok(Math.abs((await leerNumero(p, 'valor-serie-filtrado')) - verdad()[115].flexion) < TOLERANCIA_GRADOS)
  })
})

describe('ancla a ojo lejos del gomet: se vuelve a encontrar (reenganche)', () => {
  it('con el tobillo tapado y marcado a ojo a 130 px, se recupera al reaparecer y da el ángulo real', async () => {
    const verdad = videos.oculto.verdad
    const ocultos = verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.oculto.ruta)
      await marcarTres(p, verdad[0].ps)
      // A ojo, en un frame con el tobillo tapado y 130 px a su izquierda (sobre el fondo): más lejos que el
      // tope de la ventana normal de búsqueda (un 25 % de 360 px = 90 px), así que antes se perdía hasta el final.
      const i = ocultos[2]
      await irAFrame(p, i)
      await abrirPestana(p, 'marcar')
      await elegirMarcador(p, 'Maléolo')
      const interruptor = p.getByTestId('colocar-a-ojo').filter({ visible: true })
      await interruptor.click()
      const real = verdad[i].ps[2]
      await tocarVideo(p, real.x - 130, real.y)
      await interruptor.click()
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      await irAFrame(p, 0)
      const aviso = await seguirHastaElFinal(p)
      // Huecos: exactamente los frames tapados, menos el del ancla (antes, del ancla al final del vídeo).
      assert.match(aviso, new RegExp(`Maléolo no tiene posición fiable en ${ocultos.length - 1} frames`))
      for (const k of [ocultos.at(-1) + 2, 80, verdad.length - 1]) {
        await irAFrame(p, k)
        assert.equal(await estadoMarcador(p, 'Maléolo'), 'seguido', `frame ${k + 1}`)
        assert.ok(Math.abs((await leerAngulo(p)) - verdad[k].flexion) < TOLERANCIA_GRADOS, `frame ${k + 1}`)
      }
    } finally {
      await p.close()
    }
  })
})

describe('huecos cortos: rellenar a petición', () => {
  let p
  const ocultos = () => videos.corto.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
  before(async () => {
    ;({ p } = await seguirVideo(videos.corto))
  })
  after(() => p?.close())

  it('el hueco se ofrece, pero no se rellena hasta pedirlo', async () => {
    const n = ocultos().length
    assert.ok(n >= 2)
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${n} sin valor`))
    await irAFrame(p, ocultos()[1])
    assert.ok(Number.isNaN(await leerAngulo(p)))
    assert.match(await p.getByTestId('huecos-cortos').innerText(), /Rellenar 1 hueco corto/)
  })

  it('al rellenarlo, cada frame interpolado da el ángulo real (±1°) y queda marcado', async () => {
    await p.getByRole('button', { name: /Rellenar 1 hueco corto/ }).click()
    const resumen = await p.getByTestId('resumen-grafica').innerText()
    assert.doesNotMatch(resumen, /sin valor/)
    assert.match(resumen, new RegExp(`${ocultos().length} interpolados`))
    for (const i of ocultos()) {
      await irAFrame(p, i)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'interpolado')
      const medido = await leerAngulo(p)
      assert.ok(Math.abs(medido - videos.corto.verdad[i].flexion) < 1, `frame ${i + 1}: ${medido}° frente a ${videos.corto.verdad[i].flexion.toFixed(2)}°`)
    }
  })

  it('lo interpolado se guarda y se recupera como interpolado', async () => {
    await p.getByTestId('guardado').filter({ hasText: 'Guardado en este dispositivo a las' }).waitFor({ state: 'attached', timeout: 10000 })
    await p.reload()
    assert.match(await p.getByTestId('sesion-guardada').innerText(), new RegExp(`${ocultos().length} interpolados`))
    await elegirArchivoDesde(p, p.getByRole('button', { name: 'Continuar' }), videos.corto.ruta)
    await esperarQuieto(p)
    await irAFrame(p, ocultos()[0])
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'interpolado')
  })

  it('«Quitar lo interpolado» los devuelve a huecos', async () => {
    await p.getByRole('button', { name: 'Quitar lo interpolado' }).click()
    assert.match(await p.getByTestId('resumen-grafica').innerText(), new RegExp(`${ocultos().length} sin valor`))
    assert.equal(await estadoMarcador(p, 'Maléolo'), 'perdido')
    assert.match(await p.getByTestId('huecos-cortos').innerText(), /Rellenar 1 hueco corto/)
  })
})

describe('retroceder con la caché de frames', () => {
  it('frame a frame hacia atrás muestra siempre el frame pedido', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.numerado.ruta)
      const { bits, ladoBloque } = videos.numerado
      await irAFrame(p, 70)
      const anterior = p.getByRole('button', { name: 'Frame anterior' })
      // El salto al 70 decodifica desde el fotograma clave del 50 y deja en la
      // caché todo lo que entrega de paso (del 50 al 70).
      assert.equal(await p.getByTestId('lectura').innerText(), 'clave')
      // Del 70 al 45: cruza el fotograma clave del 50 (uno cada 25 frames). Solo
      // el paso al 49 vuelve a decodificar (desde el 25); el resto sale de la caché.
      const conClave = []
      for (let i = 69; i >= 45; i--) {
        await anterior.click()
        await esperarQuieto(p)
        assert.equal((await leerPosicion(p)).frame, i + 1)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i, `el canvas no muestra el frame ${i + 1}`)
        if ((await p.getByTestId('lectura').innerText()) !== 'caché') conClave.push(i)
      }
      assert.deepEqual(conClave, [49])
      // Y hacia delante otra vez, saliendo de la caché.
      const siguiente = p.getByRole('button', { name: 'Frame siguiente' })
      for (let i = 46; i <= 52; i++) {
        await siguiente.click()
        await esperarQuieto(p)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i)
      }
    } finally {
      await p.close()
    }
  })
})

describe('avanzar saltando frames', () => {
  it('dentro del mismo grupo de imágenes sigue con el decodificador; pasado un fotograma clave, empieza en él', async () => {
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.numerado.ruta)
      const { bits, ladoBloque } = videos.numerado
      await irAFrame(p, 30)
      const avanzar = p.getByRole('button', { name: 'Avanzar 10 frames' })
      // 30 → 40: sin fotograma clave entre medias (son el 25 y el 50). Antes,
      // cualquier salto hacia delante volvía al fotograma clave: al mantener
      // pulsado y saltarse frames, el avance se atascaba.
      await avanzar.click()
      await esperarQuieto(p)
      assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), 40)
      assert.equal(await p.getByTestId('lectura').innerText(), 'seguido')
      // 40 → 50 y 70 → 80 cruzan un fotograma clave (50, 75): empezar en él
      // decodifica menos que seguir. 50 → 60 → 70, dentro del grupo, siguen.
      for (const [i, modo] of [
        [50, 'clave'],
        [60, 'seguido'],
        [70, 'seguido'],
        [80, 'clave'],
      ]) {
        await avanzar.click()
        await esperarQuieto(p)
        assert.equal(await leerFrameDibujado(p, { bits, ladoBloque }), i)
        assert.equal(await p.getByTestId('lectura').innerText(), modo, `al frame ${i}`)
      }
    } finally {
      await p.close()
    }
  })
})

/** Número que muestra un elemento («−12,3 °/s», «148 px/s»); NaN si muestra «—». */
async function leerNumero(p, testid) {
  const texto = (await textoDe(p, testid)).trim()
  const m = /^([+−-])?([\d.,]+)/.exec(texto)
  return m ? (m[1] === '−' || m[1] === '-' ? -1 : 1) * Number(m[2].replace(/\./g, '').replace(',', '.')) : NaN
}

/** Espera a que la sesión guardada tenga en su vista el cero `ceros` (comparado como JSON). */
async function esperarCerosGuardados(p, ceros) {
  await p.waitForFunction(
    async (esperado) => {
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
        return todas.some((c) => JSON.stringify(c.vistas[0].ceros) === esperado)
      } finally {
        bd.close()
      }
    },
    JSON.stringify(ceros),
    { timeout: 20000, polling: 200 },
  )
}

describe('velocidad y aceleración angulares, velocidad de los marcadores', () => {
  // Aceleración real 45·(π/2)²·cos(πt/2) °/s². El tobillo gira a 120 px de la rodilla.
  const acelReal = (t) => 45 * (Math.PI / 2) ** 2 * Math.cos((Math.PI * t) / 2)
  let p
  before(async () => {
    ;({ p } = await seguirVideo(videos.verde))
  })
  after(() => p?.close())

  it('velocidad angular frente a la derivada real del vídeo (±3 °/s), también tras los huecos de fps', async () => {
    const verdad = videos.verde.verdad
    for (const i of [10, 30, 41, 60, 81, 100, 110]) {
      await irAFrame(p, i)
      const v = await leerNumero(p, 'velocidad-angular')
      assert.ok(Math.abs(v - velReal(verdad[i].t)) < 3, `frame ${i + 1}: ${v} °/s, real ${velReal(verdad[i].t).toFixed(1)} °/s`)
      // La fila de valores junto a los controles dice lo mismo que el panel.
      assert.equal(await leerNumero(p, 'rapida-velocidad'), v)
      assert.equal(await leerNumero(p, 'rapida-angulo'), await leerNumero(p, 'angulo-sin-cero'))
    }
  })

  it('aceleración angular frente a la real (±10 °/s²) con el corte a 3 Hz', async () => {
    // La segunda derivada multiplica el ruido por (2πf)²: con el ruido de seguimiento de este
    // vídeo (≈ 0,05°), a 6 Hz la aceleración oscila unos ±20 °/s² (medido); a 3 Hz, unos ±4.
    // La flexión (0,25 Hz) pasa igual por los dos cortes.
    await abrirPestana(p, 'analisis')
    await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('3')
    assert.match(await textoDe(p, 'corte'), /3,0 Hz/)
    const verdad = videos.verde.verdad
    for (const i of [15, 30, 60, 90, 105]) {
      await irAFrame(p, i)
      const a = await leerNumero(p, 'aceleracion-angular')
      assert.ok(Math.abs(a - acelReal(verdad[i].t)) < 10, `frame ${i + 1}: ${a} °/s², real ${acelReal(verdad[i].t).toFixed(1)} °/s²`)
    }
  })

  it('sin derivada en el primer y el último frame (—, nunca 0)', async () => {
    for (const i of [0, videos.verde.verdad.length - 1]) {
      await irAFrame(p, i)
      for (const id of ['velocidad-angular', 'aceleracion-angular']) assert.equal(await textoDe(p, id), '—', `${id}, frame ${i + 1}`)
    }
  })

  it('velocidad lineal en px/s: el tobillo, la real (±5 %); cadera y rodilla quietas', async () => {
    const verdad = videos.verde.verdad
    const filas = p.locator('[data-testid^="velocidad-marcador-"]')
    assert.equal(await filas.count(), 3)
    await irAFrame(p, 30)
    const real = 120 * (velReal(verdad[30].t) * Math.PI) / 180
    const textos = await filas.allInnerTexts()
    assert.match(textos[2], /px\/s$/)
    const tobillo = await leerNumero(p, await filas.nth(2).getAttribute('data-testid'))
    assert.ok(Math.abs(tobillo / real - 1) < 0.05, `tobillo ${tobillo} px/s, real ${real.toFixed(0)} px/s`)
    for (const k of [0, 1]) {
      const v = await leerNumero(p, await filas.nth(k).getAttribute('data-testid'))
      assert.ok(v < 3, `marcador ${k}: ${v} px/s`)
    }
  })
})

describe('cero de referencia: tramo estático guardado con la sesión', () => {
  it('primeros 2 s, inicio y fin aquí, relativo = sin cero − media; se guarda, se recupera y se quita', async () => {
    const verdad = videos.verde.verdad
    const media = (a, b) => {
      const v = verdad.filter((f) => f.t >= a - 1e-9 && f.t <= b + 1e-9).map((f) => f.flexion)
      return v.reduce((s, x) => s + x, 0) / v.length
    }
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      assert.equal(await textoDe(p, 'angulo-relativo'), '—')
      // Primeros 2 s: de 0° a 90° y vuelta a empezar; la media es la de esos frames (≈ 45°).
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Primeros 2 s' }).click()
      const m1 = media(verdad[0].t, verdad[0].t + 2)
      assert.ok(Math.abs((await leerNumero(p, 'cero-media')) - m1) < 0.5, `media ${await textoDe(p, 'cero-media')}, real ${m1.toFixed(2)}`)
      // No es un tramo quieto: se avisa.
      await abrirPestana(p, 'analisis')
      await p.getByText(/no parece quieto/).waitFor()
      await irAFrame(p, 60)
      const sinCero = await leerNumero(p, 'angulo-sin-cero')
      assert.ok(Math.abs(sinCero - verdad[60].flexion) < TOLERANCIA_GRADOS)
      assert.ok(Math.abs((await leerNumero(p, 'angulo-relativo')) - (sinCero - (await leerNumero(p, 'cero-media')))) < 0.11)
      assert.equal(await leerNumero(p, 'rapida-relativo'), await leerNumero(p, 'angulo-relativo'))

      // Inicio en el frame 11 y fin en el 31 (tiempos del vídeo).
      await irAFrame(p, 10)
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Inicio aquí' }).click()
      await irAFrame(p, 30)
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Fin aquí' }).click()
      const tramo = { desde: verdad[10].t, hasta: verdad[30].t }
      const m2 = media(tramo.desde, tramo.hasta)
      assert.ok(Math.abs((await leerNumero(p, 'cero-media')) - m2) < 0.5)
      await p.waitForFunction(
        async ({ a, b }) => {
          const bd = await new Promise((ok) => {
            const r = indexedDB.open('dualkinema')
            r.onsuccess = () => ok(r.result)
          })
          try {
            const todas = await new Promise((ok) => {
              const r = bd.transaction('sesiones').objectStore('sesiones').getAll()
              r.onsuccess = () => ok(r.result)
            })
            return todas.some((c) => Object.values(c.vistas[0].ceros).some((z) => z.desde === a && z.hasta === b))
          } finally {
            bd.close()
          }
        },
        { a: tramo.desde, b: tramo.hasta },
        { timeout: 20000, polling: 200 },
      )
      const textoTramo = await textoDe(p, 'cero-tramo')

      // Recargar y recuperar: el mismo tramo y la misma media.
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'cero-tramo'), textoTramo)
      await irAFrame(p, 60)
      assert.ok(Math.abs((await leerNumero(p, 'angulo-relativo')) - (verdad[60].flexion - m2)) < 0.6)

      // Quitar: vuelve a no haber relativo, y se guarda vacío.
      await abrirPestana(p, 'analisis')
      await p.getByRole('button', { name: 'Quitar', exact: true }).click()
      assert.equal(await textoDe(p, 'angulo-relativo'), '—')
      await esperarCerosGuardados(p, {})
    } finally {
      await p.close()
    }
  })
})

describe('escala en metros: dos extremos y la longitud', () => {
  it('elegir el objeto, tocar los extremos, m/s del tobillo con la escala; se guarda, se recupera y se quita', async () => {
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      await irAFrame(p, 30)
      const anguloAntes = await leerAngulo(p)
      assert.match(await textoDe(p, 'velocidad-marcador-' + (await idTobillo(p))), /px\/s$/)

      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      // Se puede elegir el objeto; cada uno trae su longitud de partida.
      assert.equal(await panel.getByRole('radio', { name: 'Cinta métrica' }).getAttribute('aria-checked'), 'true')
      await panel.getByRole('radio', { name: 'Regla' }).click()
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '30')
      await panel.getByRole('radio', { name: 'Palo' }).click()
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '100')

      // Dos extremos a 50 px: se avisa de que es corto.
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 150, 300)
      await panel.getByTestId('escala-aviso-corto').waitFor()
      // Un tercer toque mueve el extremo más cercano (el de x = 150): quedan a 400 px.
      await tocarVideo(p, 500, 300)
      const d = Number(/a ([\d.,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d - 400) < 3, `extremos a ${d} px`)
      assert.equal(await panel.getByTestId('escala-aviso-corto').count(), 0)
      // Tocar al calibrar no mueve ningún marcador.
      assert.equal(await leerAngulo(p), anguloAntes)
      // Los dos extremos, del mismo frame: un toque en otro frame empieza de nuevo (el objeto podría moverse).
      await irAFrame(p, 31)
      await tocarVideo(p, 120, 300)
      assert.match(await panel.getByTestId('escala-estado').innerText(), /Has cambiado de frame/)
      assert.match(await p.getByTestId('toca-escala').innerText(), /otro frame, empieza de nuevo/)
      assert.ok(await panel.getByRole('button', { name: 'Guardar escala' }).isDisabled())
      // De vuelta en el frame 30, los dos extremos otra vez (a 400 px).
      await irAFrame(p, 30)
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 500, 300)
      const d2 = Number(/a ([\d.,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d2 - d) < 0.5, `extremos a ${d2} px, antes ${d} px`)

      await panel.getByLabel('Longitud en cm').fill('400')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      // 4 m en 400 px: 10 mm por píxel.
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 1000 * (4 / d)) < 0.02, `${mm} mm/px`)

      // Velocidad del tobillo (gira a 120 px de la rodilla) en m/s, la real con la escala (±5 %).
      const tobillo = 'velocidad-marcador-' + (await idTobillo(p))
      assert.match(await textoDe(p, tobillo), /m\/s$/)
      const real = ((120 * velReal(verdad[30].t) * Math.PI) / 180) * (mm / 1000)
      const v = await leerNumero(p, tobillo)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)
      // Los ángulos no dependen de la escala.
      assert.equal(await leerAngulo(p), anguloAntes)

      await esperarCalibracionGuardada(p, 4)
      const textoEscala = await textoDe(p, 'escala-objeto')
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'escala-objeto'), textoEscala)
      assert.match(textoEscala, /400,0 cm/)
      await irAFrame(p, 30)
      assert.equal(await leerNumero(p, tobillo), v)

      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Quitar' }).click()
      assert.match(await textoDe(p, tobillo), /px\/s$/)
      await esperarCalibracionGuardada(p, null)
    } finally {
      await p.close()
    }
  })
})

describe('escala entre dos marcadores y longitud de los segmentos', () => {
  it('rodilla–tobillo en los primeros 2 s con su distancia real; la longitud de los segmentos no cambia', async () => {
    // En el vídeo sintético el muslo mide 130 px y la pierna 120, rígidos y en el plano.
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      // Uno por segmento de la rodilla, en orden: muslo (trocánter–rodilla) y pierna (rodilla–tobillo).
      const segmentos = panel.locator('[data-testid^="constancia-trocanter"], [data-testid^="constancia-epicondilo"]')
      assert.equal(await segmentos.count(), 2)
      for (const [k, real] of [[0, 130], [1, 120]]) {
        const s = segmentos.nth(k)
        const l = Number((await s.getByTestId('constancia-longitud').innerText()).match(/[\d,]+/)[0].replace(',', '.'))
        assert.ok(Math.abs(l - real) < 1.5, `segmento ${k}: ${l} px, real ${real}`)
        const rms = Number((await s.getByTestId('constancia-rms').innerText()).match(/[\d,]+/)[0].replace(',', '.'))
        assert.ok(rms < 1, `segmento ${k}: varía ± ${rms} %`)
        assert.equal(await s.getByTestId('constancia-fuera').count(), 0)
      }

      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      await panel.getByRole('radio', { name: 'Entre dos marcadores' }).click()
      // Por defecto, la pierna (rodilla–tobillo) y los primeros 2 s; sin longitud: hay que medirla.
      const opciones = panel.getByRole('radiogroup', { name: 'Segmento de calibración' }).getByRole('radio')
      assert.equal(await opciones.nth(1).getAttribute('aria-checked'), 'true')
      assert.equal(await panel.getByRole('radio', { name: 'Primeros 2 s' }).getAttribute('aria-checked'), 'true')
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '')
      assert.ok(await panel.getByRole('button', { name: 'Guardar escala' }).isDisabled())
      const d = Number(/([\d,]+) px/.exec(await panel.getByTestId('escala-estado').innerText())[1].replace(',', '.'))
      assert.ok(Math.abs(d - 120) < 1, `distancia media ${d} px`)
      // Promediar en muchos frames: la precisión por el marcado queda muy por debajo de la de dos toques (√2/120 = 1,2 %).
      const precision = Number(/± ([\d,]+) %/.exec(await panel.getByTestId('escala-precision').innerText())[1].replace(',', '.'))
      assert.ok(precision <= 0.3, `± ${precision} %`)

      await panel.getByLabel('Longitud en cm').fill('30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 2.5) < 0.03, `${mm} mm/px`)
      await irAFrame(p, 30)
      const tobillo = 'velocidad-marcador-' + (await idTobillo(p))
      const real = ((120 * velReal(verdad[30].t) * Math.PI) / 180) * 0.0025
      const v = await leerNumero(p, tobillo)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)
      // La longitud de los segmentos, también en cm.
      assert.match(await segmentos.nth(1).getByTestId('constancia-longitud').innerText(), /30,\d cm/)

      await esperarCalibracionGuardada(p, 0.3)
      const texto = await textoDe(p, 'escala-objeto')
      await p.reload()
      await p.getByTestId('sesion-guardada').waitFor()
      await p.setInputFiles('input[type=file]', videos.verde.ruta)
      await p.getByRole('button', { name: 'Recuperar el trabajo' }).click({ timeout: 20000 })
      await esperarQuieto(p)
      assert.equal(await textoDe(p, 'escala-objeto'), texto)
      await abrirPestana(p, 'escala')
      await p.getByText(/Posición media de los dos gomets/).waitFor()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)

      // Corregir el tobillo en un frame del tramo (mismo número de frames, otra distancia):
      // la escala ya no corresponde a lo seguido y se avisa, también desde otra pestaña.
      await abrirPestana(p, 'marcar')
      await irAFrame(p, 10)
      await elegirMarcador(p, 'Maléolo')
      const t10 = verdad[10].ps[2]
      await tocarVideo(p, t10.x + (t10.x > 320 ? -80 : 80), t10.y)
      await p.getByTestId('error-toque').waitFor()
      await p.getByRole('button', { name: 'Colocarlo aquí a ojo' }).click()
      assert.ok(await p.getByTestId('aviso-pestana-escala').isVisible())
      await abrirPestana(p, 'escala')
      assert.match(await panel.getByTestId('escala-rehacer').innerText(), /han cambiado desde que se guardó/)
    } finally {
      await p.close()
    }
  })
})

/** Id del tercer marcador (el tobillo, distal) según las filas de velocidad. */
async function idTobillo(p) {
  const id = await p.locator('[data-testid^="velocidad-marcador-"]').nth(2).getAttribute('data-testid')
  return id.replace('velocidad-marcador-', '')
}

/** Espera a que la vista guardada tenga una escala de `longitudM` metros (null: sin escala). */
async function esperarCalibracionGuardada(p, longitudM) {
  await p.waitForFunction(
    async (l) => {
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
        return todas.some((c) => (l === null ? c.vistas[0].calibracion === null : c.vistas[0].calibracion?.longitudM === l))
      } finally {
        bd.close()
      }
    },
    longitudM,
    { timeout: 20000, polling: 200 },
  )
}

describe('escala entre marcadores calibrada antes de seguir', () => {
  it('avisa de que solo hay un frame en el tramo y, tras seguir, ofrece rehacerla con todos', async () => {
    // Lo que pasó en el móvil: marcar los gomets, calibrar y después seguir. La escala se quedaba
    // con 1 frame de un tramo de 2 s, y la precisión se mostraba como si fueran muchos.
    const p = await abrirApp(navegador)
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await abrirPestana(p, 'escala')
      const panel = p.getByTestId('panel-escala')
      await panel.getByRole('button', { name: 'Calibrar escala' }).click()
      await panel.getByRole('radio', { name: 'Entre dos marcadores' }).click()
      await panel.getByTestId('escala-pocos-frames').waitFor()
      assert.match(await panel.getByTestId('escala-pocos-frames').innerText(), /Solo 1 de los \d+ frames/)
      // Un frame: √2 · 0,5 px sobre 120 px ≈ 0,6 %, no el 0,2 % de una media larga.
      const precision = Number(/± ([\d,]+) %/.exec(await panel.getByTestId('escala-precision').innerText())[1].replace(',', '.'))
      assert.ok(precision >= 0.5, `± ${precision} %`)
      await panel.getByLabel('Longitud en cm').fill('30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)

      await seguirHastaElFinal(p)
      await panel.getByTestId('escala-rehacer').waitFor()
      // Desde otra pestaña, un punto en «Escala» avisa de lo mismo.
      await abrirPestana(p, 'marcar')
      assert.ok(await p.getByTestId('aviso-pestana-escala').isVisible())
      await abrirPestana(p, 'escala')
      assert.match(await panel.getByTestId('escala-rehacer').innerText(), /solo había 1 frame .* ahora hay \d+/)
      await panel.getByRole('button', { name: 'Rehacer' }).click()
      assert.equal(await panel.getByTestId('escala-pocos-frames').count(), 0)
      assert.equal(await panel.getByLabel('Longitud en cm').inputValue(), '30')
      await panel.getByRole('button', { name: 'Guardar escala' }).click()
      assert.equal(await panel.getByTestId('escala-rehacer').count(), 0)
      assert.match(await panel.getByText(/Posición media de los dos gomets/).innerText(), /en \d{2,} frames/)
      const mm = await leerNumero(p, 'escala-mm-px')
      assert.ok(Math.abs(mm - 2.5) < 0.03, `${mm} mm/px`)
    } finally {
      await p.close()
    }
  })
})

describe('estela de los marcadores: siempre por detrás en el sentido del recorrido', () => {
  it('al avanzar dibuja los frames anteriores; al retroceder, los posteriores', async () => {
    // Antes la estela eran siempre los 20 frames anteriores: al retroceder iba por delante del marcador.
    const verdad = videos.verde.verdad
    const { p } = await seguirVideo(videos.verde)
    try {
      // ¿Hay trazo en la capa junto a la posición real del tobillo en el frame k?
      const hayTrazo = (k) =>
        p.evaluate(({ x, y }) => {
          const d = document.querySelector('[data-testid=capa]').getContext('2d').getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
          return false
        }, verdad[k].ps[2])
      // Avanzando hasta el 30 (de 29 a 30): se ve el tobillo del frame 20 y no el del 40.
      await irAFrame(p, 29)
      await irAFrame(p, 30)
      assert.equal(await hayTrazo(20), true, 'avanzando, estela en el frame 20')
      assert.equal(await hayTrazo(40), false, 'avanzando, sin estela en el frame 40')
      // Retrocediendo hasta el 30 (de 31 a 30): al revés.
      await irAFrame(p, 31)
      await irAFrame(p, 30)
      assert.equal(await hayTrazo(40), true, 'retrocediendo, estela en el frame 40')
      assert.equal(await hayTrazo(20), false, 'retrocediendo, sin estela en el frame 20')
      // Con el botón de frame anterior, igual.
      await irAFrame(p, 31)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
      await p.getByRole('button', { name: 'Frame anterior' }).click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, 32)
      assert.equal(await hayTrazo(42), true, 'con el botón, estela hacia delante')
    } finally {
      await p.close()
    }
  })
})

describe('trayectoria completa sobre el vídeo', () => {
  /** ¿Hay trazo en la capa en (x, y) del vídeo (±2 px)? */
  const hayTrazo = (p, { x, y }) =>
    p.evaluate(
      ({ x, y }) => {
        const d = document.querySelector('[data-testid=capa]').getContext('2d').getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
        return false
      },
      { x, y },
    )

  it('apagada por defecto; encendida, todo el recorrido del tobillo; se elige por marcador', async () => {
    // La flexión va de 0° a 90° y vuelve: la bajada y la subida pasan por los mismos sitios.
    // En el frame 30, avanzando, la estela corta cubre del 10 al 30 (de ~5° a 45°); el tobillo
    // de los frames 45 a 75 (más de 75°) solo puede estar dibujado por la trayectoria completa.
    // El corte en los huecos y los trazos de lo interpolado se prueban en el núcleo
    // (core/graficas/trayectoria.test.ts): aquí la vuelta taparía el hueco.
    const verdad = videos.verde.verdad
    const lejos = [45, 52, 60, 68, 75]
    const { p } = await seguirVideo(videos.verde)
    try {
      await irAFrame(p, 29)
      await irAFrame(p, 30)
      for (const k of lejos) assert.equal(await hayTrazo(p, verdad[k].ps[2]), false, `sin trayectoria completa, nada en el frame ${k + 1}`)
      const boton = p.getByRole('button', { name: 'Trayectoria completa' })
      assert.equal(await boton.getAttribute('aria-pressed'), 'false')
      await boton.click()
      for (const k of lejos) assert.equal(await hayTrazo(p, verdad[k].ps[2]), true, `trayectoria en el frame ${k + 1}`)
      // Sin el tobillo elegido, su trayectoria desaparece; los otros dos siguen elegidos.
      const marcadores = p.getByRole('group', { name: 'Marcadores con trayectoria' }).getByRole('button')
      assert.equal(await marcadores.count(), 3)
      await marcadores.nth(2).click()
      assert.equal(await marcadores.nth(2).getAttribute('aria-pressed'), 'false')
      assert.equal(await marcadores.nth(0).getAttribute('aria-pressed'), 'true')
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), false, 'sin el tobillo elegido')
      await marcadores.nth(2).click()
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), true)
      // Cambiar de frame no la quita; apagarla, sí.
      await irAFrame(p, 31)
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), true)
      await boton.click()
      assert.equal(await hayTrazo(p, verdad[60].ps[2]), false)
    } finally {
      await p.close()
    }
  })

})

describe('la barra fija del móvil no mueve los botones', () => {
  // Si «t = … · frame … · N ms clave» pasaba de una a dos líneas según el texto, los botones de
  // debajo se movían y se perdía la pulsación mantenida. Ahora van en una barra pegada abajo: si
  // su altura cambia, se mueve su borde de arriba y con él los botones. Se recorren anchos de móvil
  // para dar con el límite, con el texto más largo posible (frame de 3 cifras de «numerado» y «clave»).
  it('de 340 a 440 px, la barra y los botones de avance no se desplazan al cambiar de frame', async () => {
    for (let ancho = 340; ancho <= 440; ancho += 20) {
      const p = await abrirApp(navegador, { ancho })
      try {
        await cargarVideo(p, videos.verde.ruta)
        const boton = p.getByRole('button', { name: 'Frame siguiente' })
        const barra = p.getByTestId('barra-fija')
        const posiciones = new Set()
        for (const i of [0, 1, 50, 49, 119, 75, 74, 100, 99]) {
          await irAFrame(p, i)
          // Texto largo de verdad: un número de ms de 4 cifras, como al decodificar lento en el móvil.
          await p.getByTestId('ms-decodificar').evaluate((el) => {
            const numero = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /^\d+$/.test(n.textContent))
            if (numero) numero.textContent = '1288'
          })
          const b = await barra.boundingBox()
          posiciones.add(`${Math.round(b.y)}/${Math.round(b.height)}/${Math.round((await boton.boundingBox()).y)}`)
        }
        assert.equal(posiciones.size, 1, `a ${ancho} px la barra o el botón cambian de sitio: ${[...posiciones].join(', ')}`)
      } finally {
        await p.close()
      }
    }
  })

  it('la barra queda pegada abajo con scroll y no tapa el final de la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const alto = p.viewportSize().height
      const antes = await p.getByTestId('barra-fija').boundingBox()
      assert.equal(Math.round(antes.y + antes.height), alto, 'la barra no está pegada abajo')
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const despues = await p.getByTestId('barra-fija').boundingBox()
      assert.deepEqual(despues, antes, 'la barra se mueve con el scroll')
      // Lo último de la página (el panel de la pestaña abierta) queda entero por encima de la barra.
      const panel = await p.locator('[role=tabpanel]:visible').last().boundingBox()
      assert.ok(panel.y + panel.height <= despues.y + 1, `el panel acaba en ${panel.y + panel.height}, la barra empieza en ${despues.y}`)
      // El pie de página (rama y commit) también queda por encima de la barra, no tapado por ella.
      const pie = await p.getByTestId('pie').boundingBox()
      assert.ok(pie.y + pie.height <= despues.y + 1, `el pie acaba en ${pie.y + pie.height}, la barra empieza en ${despues.y}`)
      // Los botones y los valores del frame siguen ahí aunque se haya bajado hasta el final.
      assert.ok(await p.getByRole('button', { name: 'Frame siguiente' }).isVisible())
      assert.ok(await p.getByTestId('rapida-angulo').isVisible())
    } finally {
      await p.close()
    }
  })

  it('en pantalla ancha no es una barra: los controles van en el flujo', async () => {
    const p = await abrirApp(navegador, { ancho: 1280 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      assert.notEqual(await p.getByTestId('barra-fija').evaluate((el) => getComputedStyle(el).position), 'fixed')
      const boton = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
      assert.ok(boton.y + boton.height < 900)
    } finally {
      await p.close()
    }
  })
})

describe('pestañas de herramientas', () => {
  it('«Marcar» es la abierta; cambiar de pestaña muestra sus paneles y oculta los de las demás', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const abierta = async () => p.locator('[role=tab][aria-selected=true]').innerText()
      assert.equal(await abierta(), 'Marcar')
      assert.ok(await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).isVisible())
      assert.ok(!(await p.getByTestId('panel-filtro').isVisible()))

      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await abierta(), 'Análisis')
      for (const id of ['panel-filtro', 'panel-cinematica', 'panel-exportar']) assert.ok(await p.getByTestId(id).isVisible(), id)
      assert.ok(!(await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).isVisible()))

      await p.getByRole('tab', { name: 'Escala' }).click()
      assert.ok(await p.getByTestId('panel-escala').isVisible())
      assert.ok(!(await p.getByTestId('panel-filtro').isVisible()))

      await p.getByRole('tab', { name: 'Vídeo' }).click()
      assert.ok(await p.getByRole('heading', { name: 'Datos del vídeo' }).isVisible())

      // Lo que no se ve sigue montado: el ajuste del filtro no se pierde al cambiar de pestaña.
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).fill('9')
      await p.getByRole('tab', { name: 'Marcar' }).click()
      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await p.getByRole('slider', { name: 'Frecuencia de corte del filtro' }).inputValue(), '9')
    } finally {
      await p.close()
    }
  })

  it('en el móvil también hay pestañas, debajo del vídeo, y la gráfica completa no ocupa la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      await p.evaluate(() => window.scrollTo(0, 0))
      const video = await p.getByTestId('capa').boundingBox()
      const pestanas = await p.getByRole('tablist').boundingBox()
      assert.ok(video.y + video.height <= pestanas.y + 1, 'las pestañas quedan encima del vídeo')
      // El panel abierto va justo debajo de las pestañas y la página acaba ahí: no hay otra pantalla de gráfica más abajo.
      const panel = await p.locator('[role=tabpanel]:visible').first().boundingBox()
      assert.ok(panel.y >= pestanas.y + pestanas.height - 1, 'el panel queda debajo de las pestañas')
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
      assert.ok(await p.getByTestId('minigrafica').isVisible(), 'queda la gráfica pequeña')
      await p.getByRole('tab', { name: 'Escala' }).click()
      assert.ok(await p.getByTestId('panel-escala').isVisible())
    } finally {
      await p.close()
    }
  })

  it('la gráfica completa oculta no se redibuja mientras se sigue y se pinta entera al abrirla', async () => {
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, videos.verde.ruta)
      await marcarTres(p, videos.verde.verdad[0].ps)
      await seguirHastaElFinal(p)
      // Oculta (la vista mixta del móvil): casi sin redibujos pese a los lotes del seguimiento.
      const redibujos = Number(await p.getByTestId('grafica-angulo').getAttribute('data-redibujos'))
      assert.ok(redibujos <= 2, `la gráfica oculta se ha redibujado ${redibujos} veces`)
      // Al abrir «Solo gráficas» aparece con todos los datos: la curva (ámbar) está pintada.
      await p.getByTestId('ampliar-graficas').click()
      await p.getByTestId('grafica-angulo-area').waitFor()
      await p.waitForFunction(() => {
        const c = document.querySelector('[data-testid=grafica-angulo] canvas')
        const ctx = c?.getContext('2d')
        if (!c || !ctx) return false
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 120 && d[i + 1] < 200 && d[i + 2] < 140) n++
        return n > 100
      }, undefined, { timeout: 5000 })
    } finally {
      await p.close()
    }
  })

  it('en el móvil el vídeo y la gráfica del ángulo quedan a la vista al desplazarse, y las pestañas se pegan debajo', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const alto = p.viewportSize().height
      const cajas = async () => ({
        video: await p.getByTestId('capa').boundingBox(),
        mini: await p.getByTestId('minigrafica').boundingBox(),
        // La caja con su aire, no solo las pestañas: es lo que queda pegado.
        pestanas: await p.getByRole('tablist').locator('..').boundingBox(),
        fijo: await p.getByTestId('visor-fijo').boundingBox(),
      })
      // Desplazándose hasta el final de la pestaña «Marcar» (corta), el vídeo no se oculta: no hay tarjetas que ganar sitio.
      // En un frame sin marcas a mano (el primero lleva un botón de quitar por marcador y la haría más larga).
      await irAFrame(p, 60)
      await p.evaluate(() => window.scrollTo(0, 300))
      const a = await cajas()
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await p.waitForTimeout(300)
      const b = await cajas()
      assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-oculto'), 'false')
      assert.deepEqual(b.video, a.video, 'el vídeo se mueve al desplazarse')
      assert.deepEqual(b.mini, a.mini, 'la gráfica se mueve al desplazarse')
      assert.ok(b.video.y >= 0 && b.mini.y + b.mini.height <= b.fijo.y + b.fijo.height, 'vídeo y gráfica fuera de su zona pegada')
      // El vídeo no se come la pantalla: más de un tercio de alto se lo quitaría a las herramientas.
      assert.ok(b.video.height <= alto * 0.36, `el vídeo mide ${b.video.height} de ${alto} px`)
      assert.ok(b.mini.y > b.video.y + b.video.height - 1, 'la gráfica va debajo del vídeo')
      // Las pestañas se pegan justo debajo, no detrás del vídeo, y siguen ahí hasta el final de la página.
      for (const [donde, c] of [['a mitad', a], ['al final', b]]) {
        assert.ok(Math.abs(c.pestanas.y - (c.fijo.y + c.fijo.height)) <= 4, `${donde}: pestañas en ${c.pestanas.y}, vídeo y gráfica acaban en ${c.fijo.y + c.fijo.height}`)
      }
    } finally {
      await p.close()
    }
  })

  describe('el vídeo se oculta al bajar por tarjetas largas (pestaña «Análisis»)', () => {
    let p
    // Posición de scroll a la que las tarjetas llegan a la tira de pestañas (y el vídeo empieza a poder ocultarse): depende de
    // lo que haya sobre ellas (vídeo, barra, deslizador), así que se mide en vez de fijarla.
    let U
    before(async () => {
      ;({ p } = await seguirVideo(videos.verde, { ancho: 390 }))
      await abrirPestana(p, 'analisis')
      // Se mide con la gráfica pequeña en su alto de reposo (arriba del todo crece y las tarjetas quedan más abajo).
      await p.evaluate(() => window.scrollTo(0, 20))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'false')
      await esperarVideoAsentado(p, false)
      U = await p.evaluate(() => {
        const tarjetas = document.querySelector('[data-testid=panel-herramientas]').getBoundingClientRect().top + window.scrollY
        const tira = document.querySelector('[role=tablist]').parentElement.getBoundingClientRect().height
        return Math.round(tarjetas - tira - 4)
      })
    })
    after(() => p?.close())

    const oculto = async () => (await p.getByTestId('visor-fijo').getAttribute('data-oculto')) === 'true'
    const arribaTarjetas = async () => (await p.getByTestId('panel-herramientas').boundingBox()).y
    const bajar = async (y) => {
      await p.evaluate((y) => window.scrollTo(0, y), y)
      await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    }

    it('con el vídeo a la vista, las tarjetas tienen menos de la mitad de la pantalla', async () => {
      await bajar(300)
      assert.equal(await oculto(), false)
      const barra = (await p.getByTestId('barra-fija').boundingBox()).y
      const tira = await p.getByRole('tablist').locator('..').boundingBox()
      const libre = barra - (tira.y + tira.height)
      assert.ok(libre < p.viewportSize().height * 0.5, `sitio para las tarjetas con el vídeo: ${libre} px`)
    })

    it('mientras las tarjetas no han subido bajo las pestañas no se oculta (dejaría un hueco vacío)', async () => {
      await bajar(0)
      for (const y of [100, 250, U - 60, U - 40]) {
        await bajar(y)
        assert.equal(await oculto(), false, `oculto a y = ${y}`)
      }
    })

    it('al seguir bajando se oculta, las pestañas suben y las tarjetas no se mueven (solo se descubre lo que tapaba el vídeo)', async () => {
      await bajar(U - 27)
      assert.equal(await oculto(), false)
      const antes = await arribaTarjetas()
      await bajar(U + 13)
      await esperarVideoAsentado(p, true)
      assert.equal(await oculto(), true)
      // Lo que se mira no salta: las tarjetas subieron los 40 px que se bajó, no los ~340 del hueco del vídeo.
      const despues = await arribaTarjetas()
      assert.ok(Math.abs(despues - (antes - 40)) <= 3, `las tarjetas saltaron: de ${antes} a ${despues}`)
      // Las pestañas suben a lo más alto y las tarjetas ganan el sitio del vídeo.
      const tira = await p.getByRole('tablist').locator('..').boundingBox()
      assert.ok(tira.y >= -2 && tira.y <= 2, `las pestañas están en y = ${tira.y}`)
      const barra = (await p.getByTestId('barra-fija').boundingBox()).y
      const libre = barra - (tira.y + tira.height)
      assert.ok(libre >= p.viewportSize().height * 0.7, `queda ${libre} px para las tarjetas`)
      // Oculto de verdad: no recibe toques ni foco, y sigue montado (el lienzo y la gráfica conservan su estado).
      assert.equal(await p.getByTestId('visor-fijo').evaluate((e) => e.inert), true)
      assert.equal(await p.getByTestId('lienzo').count(), 1)
    })

    it('el cambio es suave: las pestañas se deslizan y el vídeo se desvanece, en vez de saltar', async () => {
      await bajar(0)
      await bajar(U - 27)
      // Al ocultarse (y al volver), mientras dura el cambio hay animaciones en la tira de pestañas y en el vídeo.
      const animaciones = () =>
        p.evaluate(() => ({
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }))
      const ocultar = await p.evaluate(async (y) => {
        window.scrollTo(0, y)
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        return {
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }
      }, U + 18)
      assert.ok(ocultar.tira > 0, 'las pestañas saltan en vez de deslizarse al ocultar el vídeo')
      assert.ok(ocultar.video > 0, 'el vídeo no se desvanece al ocultarse')
      await esperarVideoAsentado(p, true)
      assert.deepEqual(await animaciones(), { tira: 0, video: 0 })
      const volver = await p.evaluate(async () => {
        window.scrollBy(0, -60)
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        return {
          tira: document.querySelector('[role=tablist]').parentElement.getAnimations().length,
          video: document.querySelector('[data-testid=visor-fijo]').getAnimations().length,
        }
      })
      assert.ok(volver.tira > 0, 'las pestañas saltan en vez de deslizarse al volver el vídeo')
      assert.ok(volver.video > 0, 'el vídeo no aparece con un fundido')
      await esperarVideoAsentado(p, false)
    })

    it('al subir un poco vuelve, y tampoco salta nada', async () => {
      const antes = await arribaTarjetas()
      await p.evaluate(() => window.scrollBy(0, -60))
      await esperarVideoAsentado(p, false)
      const despues = await arribaTarjetas()
      assert.ok(Math.abs(despues - (antes + 60)) <= 3, `las tarjetas saltaron: de ${antes} a ${despues}`)
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      assert.ok(fijo.y >= 0 && fijo.y < 4, 'el vídeo vuelve pegado arriba')
    })

    it('vuelve al cambiar de frame con la barra y al cambiar de pestaña', async () => {
      await bajar(0)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarVideoAsentado(p, false)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      await p.getByTestId('pestana-escala').click()
      await esperarVideoAsentado(p, false)
      await abrirPestana(p, 'analisis')
    })

    it('con el botón «Vídeo» se ve y se queda por mucho que se baje, hasta volver al principio', async () => {
      await bajar(0)
      await bajar(U - 27)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
      const antes = await arribaTarjetas()
      await p.getByTestId('mostrar-video').click()
      await esperarVideoAsentado(p, false)
      assert.ok(Math.abs((await arribaTarjetas()) - antes) <= 3, 'al mostrar el vídeo con el botón, las tarjetas saltan')
      await p.evaluate(() => window.scrollBy(0, 200))
      await p.waitForTimeout(300)
      assert.equal(await oculto(), false, 'anclado, el vídeo no se oculta solo')
      await bajar(0)
      await bajar(U + 33)
      await esperarVideoAsentado(p, true)
    })

    it('mientras se calibra tocando el vídeo, no se oculta al bajar', async () => {
      await bajar(0)
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Calibrar escala' }).click()
      await bajar(300)
      await bajar(700)
      await p.waitForTimeout(300)
      assert.equal(await oculto(), false)
    })
  })

  it('la gráfica pequeña salta de frame al tocarla y su cursor no la redibuja', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const tiempos = videos.verde.verdad.map((f) => f.t)
      const redibujos = () => p.getByTestId('minigrafica').getAttribute('data-redibujos')
      await irAFrame(p, 20)
      const antes = await redibujos()
      assert.ok(Number(antes) > 0)
      for (const i of [21, 22, 40, 90]) await irAFrame(p, i)
      assert.equal(await redibujos(), antes, 'cambiar de frame redibuja la gráfica pequeña')
      const caja = await cajaElemento(p, 'minigrafica-area')
      for (const f of [0.3, 0.7]) {
        await p.mouse.click(caja.x + caja.width * f, caja.y + caja.height / 2)
        await esperarQuieto(p)
        const esperado = frameMasCercano(tiempos, tiempos[0] + f * (tiempos.at(-1) - tiempos[0])) + 1
        assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1, `al ${f * 100} %: frame ${(await leerPosicion(p)).frame}, esperado ${esperado}`)
      }
      // Su cursor está en el instante del frame.
      const linea = await p.getByTestId('minigrafica-cursor').boundingBox()
      const area = await p.getByTestId('minigrafica-area').boundingBox()
      const { frame } = await leerPosicion(p)
      const esperadoX = area.x + ((tiempos[frame - 1] - tiempos[0]) / (tiempos.at(-1) - tiempos[0])) * area.width
      assert.ok(Math.abs(linea.x - esperadoX) <= 1.5, `cursor en ${linea.x}, esperado ${esperadoX}`)
    } finally {
      await p.close()
    }
  })

  it('en pantalla ancha no hay gráfica pequeña ni vídeo pegado: la gráfica completa va a su sitio', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      assert.equal(await p.getByTestId('minigrafica').count(), 0)
      assert.notEqual(await p.getByTestId('visor-fijo').evaluate((el) => getComputedStyle(el).position), 'sticky')
      assert.ok(await p.getByTestId('grafica-angulo-area').isVisible())
    } finally {
      await p.close()
    }
  })

  it('la tira de pestañas pegada tiene un fondo opaco de lado a lado: no se ven las tarjetas por detrás', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      await p.evaluate(() => window.scrollTo(0, 300))
      const contenedor = p.getByRole('tablist').locator('..')
      const caja = await contenedor.boundingBox()
      assert.ok(caja.x <= 0.5 && Math.abs(caja.width - 390) <= 1, `el fondo va de ${caja.x} a ${caja.x + caja.width}`)
      const fondo = await contenedor.evaluate((el) => getComputedStyle(el).backgroundColor)
      assert.doesNotMatch(fondo, /rgba\(.*, 0\)|transparent/, `fondo ${fondo}`)
    } finally {
      await p.close()
    }
  })

  it('un punto en el nombre de una pestaña oculta avisa de huecos y de un cero que no parece quieto', async () => {
    const { p } = await seguirVideo(videos.oculto, { ancho: 1280 })
    try {
      // Estando en «Marcar» no hace falta el punto; en las demás, sí.
      assert.equal(await p.getByTestId('aviso-pestana-marcar').count(), 0)
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.getByTestId('aviso-pestana-marcar').waitFor()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
      // Un cero que no es quieto (los primeros 2 s del movimiento): el punto sale en «Análisis» desde otra pestaña.
      await p.getByRole('button', { name: 'Primeros 2 s' }).click()
      await p.getByText(/no parece quieto/).waitFor()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
      await p.getByRole('tab', { name: 'Escala' }).click()
      await p.getByTestId('aviso-pestana-analisis').waitFor()
      assert.ok(await p.getByTestId('aviso-pestana-marcar').isVisible())
      // El punto lleva su motivo para quien no lo ve (lectores de pantalla).
      assert.match(await p.getByTestId('aviso-pestana-analisis').getAttribute('aria-label'), /no parece quieto/)
      // Al abrir la pestaña, el punto se quita (el aviso ya está a la vista).
      await p.getByRole('tab', { name: 'Análisis' }).click()
      assert.equal(await p.getByTestId('aviso-pestana-analisis').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('a 1280 px la columna de herramientas tiene su propio scroll y el vídeo no se mueve', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      // Una ventana baja para que los paneles no quepan.
      await p.getByRole('tab', { name: 'Análisis' }).click()
      await p.setViewportSize({ width: 1280, height: 480 })
      const columna = p.getByTestId('columna-herramientas')
      const tarjeta = p.getByTestId('panel-herramientas')
      const hay = await tarjeta.evaluate((el) => el.scrollHeight > el.clientHeight + 20)
      assert.ok(hay, 'la tarjeta cabe entera: la prueba no comprueba nada')
      const antes = { video: await p.getByTestId('capa').boundingBox(), columna: await columna.boundingBox(), tarjeta: await tarjeta.boundingBox() }
      await tarjeta.evaluate((el) => (el.scrollTop = el.scrollHeight))
      assert.ok((await tarjeta.evaluate((el) => el.scrollTop)) > 100, 'la tarjeta no se desplazó')
      const despues = { video: await p.getByTestId('capa').boundingBox(), columna: await columna.boundingBox(), tarjeta: await tarjeta.boundingBox() }
      assert.deepEqual(despues.video, antes.video, 'el vídeo se movió al recorrer los paneles')
      assert.deepEqual(despues.columna, antes.columna, 'la columna se movió de sitio')
      assert.deepEqual(despues.tarjeta, antes.tarjeta, 'la tarjeta se movió de sitio: se desplaza su contenido, no ella')
      assert.equal(await p.evaluate(() => window.scrollY), 0, 'la página se desplazó')
      // Las pestañas siguen a mano arriba aunque se haya bajado, y la tarjeta conserva sus esquinas redondeadas (es ella la que se recorta).
      const pestanas = await p.getByRole('tablist').boundingBox()
      assert.ok(pestanas.y >= despues.columna.y - 1 && pestanas.y < despues.columna.y + 20, `las pestañas están en ${pestanas.y}`)
      const radios = await tarjeta.evaluate((el) => {
        const c = getComputedStyle(el)
        return { abajoIzq: parseFloat(c.borderBottomLeftRadius), abajoDer: parseFloat(c.borderBottomRightRadius), desborde: c.overflowY }
      })
      assert.ok(radios.abajoIzq >= 12 && radios.abajoDer >= 12, `esquinas de abajo: ${JSON.stringify(radios)}`)
      assert.equal(radios.desborde, 'auto')
    } finally {
      await p.close()
    }
  })
})

/** Lee un CSV exportado: cabecera «# clave;valor», nombres de columna y filas. */
function leerCsv(texto, sep = ';') {
  const lineas = texto.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l !== '')
  const cabecera = lineas.filter((l) => l.startsWith('# '))
  const [nombres, ...filas] = lineas.filter((l) => !l.startsWith('# '))
  const columnas = nombres.split(sep)
  return { cabecera, columnas, filas: filas.map((f) => f.split(sep)) }
}

describe('exportación CSV', () => {
  it('sin escala (px) y con escala (m y m/s): una fila por frame, cabecera, vacío = sin valor y valores de la verdad', async () => {
    const verdad = videos.verde.verdad
    const velReal = (t) => 45 * (Math.PI / 2) * Math.sin((Math.PI * t) / 2)
    const { p } = await seguirVideo(videos.verde)
    try {
      await esperarGuardado(p, verdad.length)
      await abrirPestana(p, 'analisis')
      const panel = p.getByTestId('panel-exportar')
      const descargar = async () => {
        await abrirPestana(p, 'analisis')
        const [descarga] = await Promise.all([p.waitForEvent('download'), panel.getByTestId('descargar-csv').click()])
        const { readFile } = await import('node:fs/promises')
        return { nombre: descarga.suggestedFilename(), texto: await readFile(await descarga.path(), 'utf8') }
      }

      // Sin escala: todo en píxeles, sin columnas en metros.
      const sin = await descargar()
      assert.match(sin.nombre, /\.csv$/)
      const a = leerCsv(sin.texto)
      assert.equal(a.filas.length, verdad.length)
      assert.ok(a.cabecera.some((l) => l.startsWith('# escala;sin escala')))
      assert.ok(a.columnas.some((c) => c.endsWith('_velocidad_px_s')))
      assert.ok(!a.columnas.some((c) => c.endsWith('_x_m')))
      const cCrudo = a.columnas.find((c) => c.endsWith('_crudo_grados'))
      for (const i of FRAMES_A_COMPARAR) {
        const medido = Number(a.filas[i - 1][a.columnas.indexOf(cCrudo)].replace(',', '.'))
        assert.ok(Math.abs(medido - verdad[i - 1].flexion) < TOLERANCIA_GRADOS, `frame ${i}: crudo ${medido}°, real ${verdad[i - 1].flexion.toFixed(2)}°`)
      }
      // El primer frame no tiene velocidad angular (sin derivada en el extremo del tramo): vacío, nunca 0.
      assert.equal(a.filas[0][a.columnas.findIndex((c) => c.endsWith('_vel_grados_s'))], '')

      // Con escala: 4 m en 400 px entre dos toques (10 mm por píxel).
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Calibrar escala' }).click()
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('radio', { name: 'Palo' }).click()
      await tocarVideo(p, 100, 300)
      await tocarVideo(p, 500, 300)
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByLabel('Longitud en cm').fill('400')
      await abrirPestana(p, 'escala')
      await p.getByTestId('panel-escala').getByRole('button', { name: 'Guardar escala' }).click()
      const mm = await leerNumero(p, 'escala-mm-px')
      const tobillo = await idTobillo(p)

      const con = leerCsv((await descargar()).texto)
      assert.equal(con.filas.length, verdad.length)
      const linea = con.cabecera.find((l) => l.startsWith('# escala;'))
      assert.match(linea, /400[,.]?\d* m|4,0000 m/)
      assert.ok(con.cabecera.some((l) => l.startsWith('# escala: origen;')))
      const col = (n) => con.columnas.indexOf(n)
      assert.ok(col(`${tobillo}_filtrado_x_m`) >= 0 && col(`${tobillo}_velocidad_m_s`) >= 0)
      const num = (f, n) => Number(f[col(n)].replace(',', '.'))
      // Coherencia: metros = píxeles filtrados × m/px.
      const f30 = con.filas[29]
      assert.ok(Math.abs(num(f30, `${tobillo}_filtrado_x_m`) - num(f30, `${tobillo}_filtrado_x_px`) * (mm / 1000)) < 1e-4)
      // Velocidad del tobillo en m/s frente a la real con la escala (±5 %).
      const real = ((120 * velReal(verdad[29].t) * Math.PI) / 180) * (mm / 1000)
      const v = num(f30, `${tobillo}_velocidad_m_s`)
      assert.ok(Math.abs(v / real - 1) < 0.05, `tobillo ${v} m/s, real ${real.toFixed(3)} m/s`)

      // Formato internacional: «,» y punto decimal.
      await panel.getByRole('radio', { name: /Internacional/ }).check()
      const intl = leerCsv((await descargar()).texto, ',')
      assert.equal(intl.filas.length, verdad.length)
      assert.match(intl.filas[29][intl.columnas.indexOf(`${tobillo}_filtrado_x_m`)], /^-?\d+\.\d{6}$/)
    } finally {
      await p.close()
    }
  })
})

describe('gráfica pequeña del móvil: ángulo, velocidad o las dos normalizadas', () => {
  it('alterna entre ángulo, velocidad y ambas; el punto del cursor cae donde está el valor', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const posicionRelativa = async () => {
        const area = await p.getByTestId('minigrafica-area').boundingBox()
        const punto = await p.getByTestId('minigrafica-punto').boundingBox()
        return (punto.y + punto.height / 2 - area.y) / area.height
      }
      const modo = (id) => p.getByTestId(`minigrafica-modo-${id}`)
      assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'true')

      // Velocidad: máxima hacia arriba en t = 1 s (frame ≈ 31) y mínima en t = 3 s (frame ≈ 91).
      await modo('velocidad').click()
      assert.equal(await modo('velocidad').getAttribute('aria-pressed'), 'true')
      assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'false')
      const tiempos = videos.verde.verdad.map((f) => f.t)
      const i1 = frameMasCercano(tiempos, 1)
      const i3 = frameMasCercano(tiempos, 3)
      await irAFrame(p, i1)
      const arriba = await posicionRelativa()
      await irAFrame(p, i3)
      const abajo = await posicionRelativa()
      assert.ok(arriba < 0.3, `velocidad máxima: el punto está a ${arriba} de la altura`)
      assert.ok(abajo > 0.7, `velocidad mínima: el punto está a ${abajo} de la altura`)

      // Ambas, normalizadas: el ángulo (el punto va sobre su curva) llega a su máximo en t = 2 s, arriba del todo.
      await modo('ambas').click()
      await p.getByText(/Normalizadas/).waitFor()
      await irAFrame(p, frameMasCercano(tiempos, 2))
      const cima = await posicionRelativa()
      assert.ok(cima < 0.3, `ángulo máximo normalizado: el punto está a ${cima} de la altura`)
      // Y al volver al ángulo desaparece la nota.
      await modo('angulo').click()
      assert.equal(await p.getByText(/Normalizadas/).count(), 0)

      // Tocar la gráfica sigue saltando de frame en cualquier modo.
      await modo('velocidad').click()
      const caja = await cajaElemento(p, 'minigrafica-area')
      await p.mouse.click(caja.x + caja.width * 0.5, caja.y + caja.height / 2)
      await esperarQuieto(p)
      const esperado = frameMasCercano(tiempos, tiempos[0] + 0.5 * (tiempos.at(-1) - tiempos[0])) + 1
      assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
    } finally {
      await p.close()
    }
  })
})

describe('gráfica pequeña del móvil: conserva su modo', () => {
  it('al cambiar de frame, de pestaña, al desplazarse, al ampliar el vídeo o las gráficas y volver, y al volver a seguir sigue en el modo elegido', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const modo = (id) => p.getByTestId(`minigrafica-modo-${id}`)
      const enVelocidad = async (cuando) => {
        assert.equal(await modo('velocidad').getAttribute('aria-pressed'), 'true', `${cuando}: la gráfica pequeña ha dejado el modo velocidad`)
        assert.equal(await modo('angulo').getAttribute('aria-pressed'), 'false', cuando)
      }
      await p.evaluate(() => window.scrollTo(0, 0))
      await modo('velocidad').click()
      await enVelocidad('al elegirlo')
      await irAFrame(p, 40)
      await enVelocidad('al cambiar de frame')
      for (const id of ['analisis', 'escala', 'video', 'marcar']) {
        await abrirPestana(p, id)
        await enVelocidad(`en la pestaña ${id}`)
      }
      // Bajar (la gráfica vuelve a su alto de siempre y el vídeo se puede ocultar) y volver arriba (crece otra vez).
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'false')
      await esperarVideoAsentado(p)
      await p.evaluate(() => window.scrollTo(0, 0))
      await p.waitForFunction(() => document.querySelector('[data-testid=visor-fijo]').dataset.grande === 'true')
      await esperarVideoAsentado(p, false)
      await enVelocidad('al bajar y volver arriba')
      // Al pasar al vídeo grande o a solo gráficas (la gráfica pequeña no está) y volver, sigue en «Velocidad».
      await p.getByTestId('ampliar-video').click()
      await p.getByTestId('reducir-video').click()
      await p.getByTestId('minigrafica-modo-velocidad').waitFor()
      await enVelocidad('al volver del vídeo grande')
      await p.getByTestId('ampliar-graficas').click()
      await p.getByTestId('reducir-graficas').click()
      await p.getByTestId('minigrafica-modo-velocidad').waitFor()
      await enVelocidad('al volver de solo gráficas')
      // Seguir de nuevo desde un frame intermedio: llegan lotes del worker y se rehace lo filtrado.
      await irAFrame(p, 60)
      await seguirHastaElFinal(p)
      await enVelocidad('al volver a seguir')
    } finally {
      await p.close()
    }
  })
})

describe('vistas ampliadas del móvil', () => {
  it('vídeo grande: se marca y se sigue sin salir de ella, y el ángulo medido es el real', async () => {
    const video = videos.verde
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      // Cubre la pantalla hasta la barra; lo demás no se ve.
      const alto = p.viewportSize().height
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(fijo.y <= 0.5 && Math.abs(fijo.y + fijo.height - barra.y) <= 1, `el vídeo grande ocupa de ${fijo.y} a ${fijo.y + fijo.height}; la barra empieza en ${barra.y}`)
      assert.equal(await p.getByRole('tablist').isVisible(), false)
      assert.equal(await p.getByTestId('minigrafica').count(), 0)
      // El deslizador de frames (con su franja de estado) va en la barra de abajo, en la fila de la posición, en todas las vistas.
      const deslizador = p.getByRole('slider', { name: 'Posición en el vídeo' })
      assert.ok(await deslizador.isVisible())
      const caja = await deslizador.boundingBox()
      assert.ok(caja.y >= barra.y - 1 && caja.y + caja.height <= barra.y + barra.height + 1, 'el deslizador no está en la barra de abajo')
      const fila = await p.getByTestId('posicion').boundingBox()
      assert.ok(caja.y >= fila.y - 2 && caja.y + caja.height <= fila.y + fila.height + 2, 'el deslizador no va en la fila de la posición')
      assert.equal(await p.getByTestId('marcado-compacto').getByRole('slider').count(), 0)
      await irAFrame(p, 40)
      assert.equal((await leerPosicion(p)).frame, 41)
      await irAFrame(p, 0)
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
      assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflow), 'hidden', 'la página de debajo se puede desplazar')
      // Lo necesario para marcar está dentro, y la barra de avance sigue.
      assert.equal(await p.getByRole('radio').count(), 3)
      assert.ok(await p.getByRole('button', { name: 'Frame siguiente' }).isVisible())
      assert.ok((await (await p.getByTestId('capa').boundingBox()).y) >= 0 && (await p.getByTestId('capa').boundingBox()).y < alto)

      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('marcado-compacto').getByText(/Seguimiento completado/).waitFor({ timeout: 90000 })

      // Al volver, todo lo hecho está en su sitio y el ángulo coincide con el real.
      // La franja se ve ya aquí, en el propio vídeo grande, verde donde se siguió.
      assert.ok((await colorFranja(p)).verde > (await colorFranja(p)).ancho * 0.9)
      await p.getByTestId('reducir-video').click()
      assert.ok(await p.getByRole('tablist').isVisible())
      assert.ok(await p.getByTestId('minigrafica').isVisible())
      assert.equal(await p.evaluate(() => getComputedStyle(document.body).overflow), 'visible')
      // La franja de estado, dibujada mientras estaba oculta, se rehace al volver: verde (seguido), no un solo píxel estirado.
      const franja = await colorFranja(p)
      assert.ok(franja.verde > franja.ancho * 0.9, `franja: ${JSON.stringify(franja)}`)
      await compararAngulos(p, video.verdad)
    } finally {
      await p.close()
    }
  })

  // Cuenta de colores de la franja de estado de los frames (verde = seguido, rojo = perdido, ámbar = a mano, azul = interpolado).
  const colorFranja = (p) =>
    p.getByRole('slider', { name: 'Posición en el vídeo' }).locator('..').locator('canvas').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, 1).data
      const cuenta = { verde: 0, rojo: 0, ambar: 0, azul: 0, otros: 0, ancho: c.width }
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
        if (a < 128) cuenta.otros++
        else if (g > 180 && r < 100) cuenta.verde++
        else if (r > 220 && g < 140) cuenta.rojo++
        else if (r > 220 && g > 140 && b < 120) cuenta.ambar++
        else if (b > 200 && r < 120) cuenta.azul++
        else cuenta.otros++
      }
      return cuenta
    })

  it('vídeo grande: seguir con huecos, ir al primero, trayectoria completa y, al volver, la franja de estado correcta', async () => {
    const video = videos.oculto
    const tapados = video.verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      await p.getByTestId('marcado-compacto').getByText(/no tiene posición fiable/).waitFor({ timeout: 90000 })
      // El botón para ir al primer hueco está dentro del vídeo grande y funciona.
      await p.getByRole('button', { name: new RegExp(`Ir al primer frame con hueco \\(${tapados[0] + 1}\\)`) }).click()
      await esperarQuieto(p)
      assert.equal((await leerPosicion(p)).frame, tapados[0] + 1)
      // La trayectoria completa se enciende desde el vídeo grande (y es la misma que la del panel «Marcar»).
      const trayectoria = p.getByTestId('trayectoria-compacta')
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'false')
      await trayectoria.click()
      assert.equal(await trayectoria.getAttribute('aria-pressed'), 'true')

      // Al volver: la franja refleja lo seguido (verde), lo perdido (rojo) y lo marcado a mano (ámbar), no un solo color.
      await p.getByTestId('reducir-video').click()
      assert.equal(await p.getByRole('button', { name: 'Trayectoria completa' }).getAttribute('aria-pressed'), 'true')
      await p.waitForFunction(() => {
        const c = document.querySelector('input[aria-label="Posición en el vídeo"]')?.parentElement?.querySelector('canvas')
        return !!c && c.width > 50
      })
      const franja = await colorFranja(p)
      const total = video.verdad.length
      assert.ok(franja.verde > franja.ancho * 0.7, `franja casi toda verde: ${JSON.stringify(franja)}`)
      assert.ok(franja.rojo >= 1, `la franja no marca el hueco en rojo: ${JSON.stringify(franja)}`)
      // El hueco ocupa tapados.length de total frames: su parte de la franja, con un píxel de margen por redondeo.
      const esperado = (tapados.length / total) * franja.ancho
      assert.ok(Math.abs(franja.rojo - esperado) <= 2 + esperado * 0.5, `rojo ${franja.rojo} px, esperado ≈ ${esperado.toFixed(1)}`)
    } finally {
      await p.close()
    }
  })

  it('vídeo grande: un hueco corto se rellena y se quita desde ella', async () => {
    const video = videos.corto
    const p = await abrirApp(navegador, { ancho: 390 })
    try {
      await cargarVideo(p, video.ruta)
      await p.getByTestId('ampliar-video').click()
      await marcarTres(p, video.verdad[0].ps)
      await p.getByRole('button', { name: 'Seguir desde aquí' }).click()
      const extras = p.getByTestId('extras-compactos')
      await extras.waitFor({ timeout: 90000 })
      await extras.getByRole('button', { name: /Rellenar 1 hueco corto/ }).click()
      await extras.getByRole('button', { name: 'Quitar lo interpolado' }).waitFor()
      assert.equal(await extras.getByRole('button', { name: /Rellenar/ }).count(), 0)
      await extras.getByRole('button', { name: 'Quitar lo interpolado' }).click()
      await extras.getByRole('button', { name: /Rellenar 1 hueco corto/ }).waitFor()
    } finally {
      await p.close()
    }
  })

  it('vídeo grande: «Colocar a ojo» deja el marcador justo donde se toca, sin buscar el gomet', async () => {
    const { p } = await seguirVideo(videos.oculto, { ancho: 390 })
    const verdad = videos.oculto.verdad
    const tapados = verdad.flatMap((f, i) => (f.tobilloOculto ? [i] : []))
    try {
      await irAFrame(p, tapados[2])
      await p.getByTestId('ampliar-video').click()
      // El del panel «Marcar» sigue montado pero oculto: se usa el de la tira del vídeo grande.
      const interruptor = p.getByTestId('marcado-compacto').getByTestId('colocar-a-ojo')
      assert.equal(await interruptor.getAttribute('aria-checked'), 'false')
      await elegirMarcador(p, 'Maléolo')
      await interruptor.click()
      assert.equal(await interruptor.getAttribute('aria-checked'), 'true')
      // Con el gomet tapado, un toque en su sitio queda a mano sin que salga el error de «no veo un gomet».
      const real = verdad[tapados[2]].ps[2]
      await tocarVideo(p, real.x, real.y)
      assert.equal(await p.getByTestId('error-toque').count(), 0)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      assert.ok(Math.abs((await leerAngulo(p)) - verdad[tapados[2]].flexion) < 1.5)
      // Ya no hay marcador elegido, pero el botón para quitar la marca a mano está a la vista en el vídeo grande.
      assert.equal(await p.getByRole('radio', { checked: true }).count(), 0)
      await p.getByTestId('extras-compactos').getByRole('button', { name: /Quitar la marca a mano: Maléolo/ }).waitFor()
      // No se ajusta a ningún gomet: un toque 40 px más abajo se queda ahí (con el interruptor apagado se iría al gomet).
      await elegirMarcador(p, 'Maléolo')
      await tocarVideo(p, real.x, real.y + 40)
      assert.equal(await estadoMarcador(p, 'Maléolo'), 'a mano')
      assert.ok(Math.abs((await leerAngulo(p)) - verdad[tapados[2]].flexion) > 3, 'el marcador se ha pegado al gomet')
      // Apagado, vuelve a buscar el gomet: tocar lejos de todos da el aviso.
      await elegirMarcador(p, 'Maléolo')
      await interruptor.click()
      assert.equal(await interruptor.getAttribute('aria-checked'), 'false')
      await tocarVideo(p, 60, 300)
      const error = p.getByTestId('error-toque')
      await error.waitFor()
      // En el vídeo grande el aviso es corto, va justo debajo del vídeo (antes de los marcadores) y no hace falta desplazarse.
      assert.ok((await error.locator('> p').innerText()).length < 60, 'el aviso del vídeo grande es largo')
      assert.equal(await error.getByRole('button', { name: 'Colocarlo aquí a ojo' }).isVisible(), true)
      const cajaError = await error.boundingBox()
      const cajaMarcadores = await p.getByRole('radiogroup', { name: 'Marcador a colocar' }).boundingBox()
      const cajaVideoGrande = await p.getByTestId('capa').boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(cajaError.y >= cajaVideoGrande.y + cajaVideoGrande.height - 1 && cajaError.y + cajaError.height <= cajaMarcadores.y + 1, 'el aviso no está entre el vídeo y los marcadores')
      assert.ok(cajaError.y + cajaError.height <= barra.y, 'el aviso queda tapado por la barra de abajo')
      // El detalle técnico y la explicación están plegados.
      assert.equal(await error.locator('details').getAttribute('open'), null)
    } finally {
      await p.close()
    }
  })

  it('solo gráficas: la completa ocupa el espacio, tocarla salta de frame y la barra sigue', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 390 })
    try {
      const tiempos = videos.verde.verdad.map((f) => f.t)
      await p.getByTestId('ampliar-graficas').click()
      const vista = p.getByTestId('vista-graficas')
      const caja = await vista.boundingBox()
      const barra = await p.getByTestId('barra-fija').boundingBox()
      assert.ok(caja.y <= 0.5 && Math.abs(caja.y + caja.height - barra.y) <= 1, `las gráficas van de ${caja.y} a ${caja.y + caja.height}; la barra empieza en ${barra.y}`)
      assert.equal(await p.getByTestId('capa').isVisible(), false)
      assert.equal(await p.getByRole('tablist').isVisible(), false)
      // Más altas que en la vista mixta (190 px de gráfica → unos 150 de zona táctil).
      assert.ok((await p.getByTestId('grafica-angulo-area').boundingBox()).height > 200)
      // Tocarla salta de frame; el cursor y los botones de avance siguen.
      const area = await cajaElemento(p, 'grafica-angulo-area')
      await p.mouse.click(area.x + area.width * 0.4, area.y + area.height / 2)
      await esperarQuieto(p)
      const esperado = frameMasCercano(tiempos, tiempos[0] + 0.4 * (tiempos.at(-1) - tiempos[0])) + 1
      assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
      await p.getByRole('button', { name: 'Frame siguiente' }).click()
      await esperarQuieto(p)
      assert.ok((await leerPosicion(p)).frame >= esperado)
      // Volver.
      await p.getByTestId('reducir-graficas').click()
      assert.ok(await p.getByTestId('capa').isVisible())
      assert.ok(await p.getByTestId('minigrafica').isVisible())
      assert.equal(await p.getByTestId('vista-graficas').isVisible(), false)
    } finally {
      await p.close()
    }
  })

  it('solo gráficas se reparte el alto de la pantalla y no hace falta desplazarse (móvil, móvil grande y tablet en vertical)', async () => {
    for (const [ancho, alto] of [[390, 844], [432, 960], [768, 1024]]) {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        await p.getByTestId('ampliar-graficas').click()
        const vista = p.getByTestId('vista-graficas')
        const sinScroll = () => vista.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
        assert.ok(await sinScroll(), `${ancho} × ${alto}: ángulo y velocidad no caben sin desplazarse`)
        // Las dos gráficas se ven enteras y con altura útil.
        for (const id of ['grafica-angulo-area', 'grafica-velocidad-area']) {
          const caja = await p.getByTestId(id).boundingBox()
          assert.ok(caja.height >= 70, `${ancho} × ${alto}: ${id} mide ${caja.height} px`)
        }
        // Con los segmentos encendidos son tres paneles: siguen cabiendo.
        await p.locator('[data-testid^="serie-segmento-"]').first().click()
        await p.getByTestId('grafica-segmentos-area').waitFor()
        assert.ok(await sinScroll(), `${ancho} × ${alto}: con los segmentos no caben sin desplazarse`)
        // Las gráficas se ajustan si cambia el alto (girar el móvil): más bajo, más corto, sin salirse.
        const antes = (await p.getByTestId('grafica-angulo-area').boundingBox()).height
        await p.setViewportSize({ width: ancho, height: alto - 200 })
        await p.waitForTimeout(300)
        const despues = (await p.getByTestId('grafica-angulo-area').boundingBox()).height
        assert.ok(despues < antes, `${ancho} × ${alto}: la gráfica no se ajusta al alto (${antes} → ${despues})`)
      } finally {
        await p.close()
      }
    }
  })

  it('en pantalla ancha no hay botones de ampliar', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      assert.equal(await p.getByTestId('ampliar-video').count(), 0)
      assert.equal(await p.getByTestId('ampliar-graficas').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('deslizador de frames y franja de estado: una sola barra', () => {
  it('la franja de estado es la pista del deslizador (una barra baja) y tocarlo salta de frame', async () => {
    for (const ancho of [390, 1280]) {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        const deslizador = p.getByRole('slider', { name: 'Posición en el vídeo' })
        const contenedor = deslizador.locator('..')
        await contenedor.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const caja = await contenedor.boundingBox()
        assert.ok(caja.height <= 30, `${ancho} px: la barra mide ${caja.height} px`)
        // La franja (canvas) va dentro de la misma caja, centrada: no es una fila aparte.
        const franja = await contenedor.locator('canvas').boundingBox()
        assert.ok(franja.y >= caja.y && franja.y + franja.height <= caja.y + caja.height + 0.5, `${ancho} px: la franja se sale de la barra`)
        assert.ok(Math.abs(franja.y + franja.height / 2 - (caja.y + caja.height / 2)) <= 1)
        // Tocar la barra salta de frame: al 50 % del recorrido, el frame central (±2 por el tirador).
        const total = videos.verde.verdad.length
        await p.mouse.click(caja.x + caja.width * 0.5, caja.y + caja.height / 2)
        await esperarQuieto(p)
        const { frame } = await leerPosicion(p)
        assert.ok(Math.abs(frame - (total / 2 + 0.5)) <= 3, `${ancho} px: tocar la mitad lleva al frame ${frame} de ${total}`)
        // El deslizador sigue siendo accesible y con el valor del frame actual.
        assert.equal(Number(await deslizador.inputValue()), frame - 1)
      } finally {
        await p.close()
      }
    }
  })
})

describe('escritorio: la pantalla cabe en la altura de la ventana', () => {
  for (const [nombre, ancho, alto, vertical] of [
    ['vídeo horizontal a 1280 × 900', 1280, 900, false],
    ['vídeo vertical a 1280 × 900', 1280, 900, true],
    ['vídeo horizontal a 1920 × 1000', 1920, 1000, false],
    ['vídeo vertical a 1920 × 1000', 1920, 1000, true],
  ]) {
    it(`${nombre}: ni el vídeo, ni los controles, ni la gráfica obligan a desplazarse`, async () => {
      const p = await abrirApp(navegador, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        const video = vertical ? videos.vertical : videos.verde
        await cargarVideo(p, video.ruta)
        if (!vertical) {
          await marcarTres(p, videos.verde.verdad[0].ps)
          await seguirHastaElFinal(p)
        }
        // También con los segmentos encendidos (tres paneles en la gráfica).
        await p.locator('[data-testid^="serie-segmento-"]').first().click()
        await p.waitForTimeout(300)
        const medidas = await p.evaluate(() => ({ alto: document.documentElement.scrollHeight, ventana: window.innerHeight, ancho: document.documentElement.scrollWidth, anchoVentana: window.innerWidth }))
        assert.ok(medidas.alto <= medidas.ventana + 1, `la página mide ${medidas.alto} px y la ventana ${medidas.ventana}`)
        assert.ok(medidas.ancho <= medidas.anchoVentana, 'scroll horizontal')
        // Vídeo, controles, gráfica y pie, enteros dentro de la ventana.
        for (const id of ['lienzo', 'barra-fija', 'grafica-angulo-area', 'pie']) {
          const caja = await p.getByTestId(id).boundingBox().catch(() => null)
          if (!caja) continue
          assert.ok(caja.y >= 0 && caja.y + caja.height <= alto + 1, `${id} está en ${caja.y}–${caja.y + caja.height}, la ventana mide ${alto}`)
        }
        const botones = await p.getByRole('button', { name: 'Frame siguiente' }).boundingBox()
        assert.ok(botones.y + botones.height <= alto)
        // La columna de herramientas, más alta que el hueco (la trayectoria desplegada, el panel de análisis), se desplaza por dentro:
        // no alarga la página ni empuja el pie hacia abajo.
        await p.getByRole('button', { name: 'Trayectoria completa' }).click()
        for (const pestana of ['marcar', 'analisis', 'escala', 'video']) {
          await abrirPestana(p, pestana)
          const m = await p.evaluate(() => ({ alto: document.documentElement.scrollHeight, ventana: window.innerHeight }))
          assert.ok(m.alto <= m.ventana + 1, `pestaña ${pestana}: la página mide ${m.alto} px y la ventana ${m.ventana}`)
          const pie = await p.getByTestId('pie').boundingBox()
          assert.ok(pie.y + pie.height <= alto + 1, `pestaña ${pestana}: el pie está en ${pie.y}–${pie.y + pie.height}`)
        }
        await abrirPestana(p, 'marcar')
        // El vídeo no queda diminuto: al menos 200 px de alto y un tercio del ancho de la columna.
        const lienzo = await p.getByTestId('lienzo').boundingBox()
        assert.ok(lienzo.height >= 200, `el vídeo mide ${lienzo.height} px de alto`)
      } finally {
        await p.close()
      }
    })
  }
})

describe('escritorio: la columna de herramientas mide lo mismo que la tarjeta de la gráfica', () => {
  for (const [ancho, alto] of [[1280, 900], [1920, 1000]]) {
    it(`a ${ancho} × ${alto}, en las cuatro pestañas, con y sin la trayectoria`, async () => {
      const { p } = await seguirVideo(videos.verde, { ancho })
      try {
        await p.setViewportSize({ width: ancho, height: alto })
        await p.waitForTimeout(300)
        const columna = p.getByTestId('columna-herramientas')
        const tarjeta = p.getByTestId('panel-grafica')
        const medir = async () => ({ c: await columna.boundingBox(), g: await tarjeta.boundingBox() })
        let alturas = new Set()
        for (const trayectoria of [false, true]) {
          if (trayectoria) {
            await abrirPestana(p, 'marcar')
            await p.getByRole('button', { name: 'Trayectoria completa' }).click()
          }
          for (const pestana of ['marcar', 'analisis', 'escala', 'video']) {
            await abrirPestana(p, pestana)
            const { c, g } = await medir()
            // Mismo alto y mismo borde de arriba: la caja de herramientas y la tarjeta de la gráfica.
            assert.ok(Math.abs(c.height - g.height) <= 1.5, `${pestana}: herramientas ${c.height} px y gráfica ${g.height} px`)
            assert.ok(Math.abs(c.y - g.y) <= 1.5 + 0.5, `${pestana}: herramientas empiezan en ${c.y} y la gráfica en ${g.y}`)
            alturas.add(Math.round(c.height))
            // La tarjeta de herramientas (la que lleva los paneles) acaba justo donde la de la gráfica, con scroll o sin él.
            const t = await p.getByTestId('panel-herramientas').boundingBox()
            assert.ok(Math.abs(t.y + t.height - (g.y + g.height)) <= 1.5, `${pestana}: la tarjeta acaba en ${t.y + t.height} y la de la gráfica en ${g.y + g.height}`)
          }
        }
        assert.equal(alturas.size, 1, `la altura cambia según la pestaña: ${[...alturas].join(', ')}`)
        // El scroll aparece solo si el panel excede esa altura: «Análisis» (largo) sí, «Vídeo» (corto) no.
        const tarjetaHerramientas = p.getByTestId('panel-herramientas')
        await abrirPestana(p, 'analisis')
        assert.ok(await tarjetaHerramientas.evaluate((el) => el.scrollHeight > el.clientHeight + 1), 'Análisis debería desplazarse')
        await abrirPestana(p, 'video')
        assert.ok(await tarjetaHerramientas.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), 'Vídeo no debería desplazarse')
      } finally {
        await p.close()
      }
    })
  }
})

describe('barras de desplazamiento', () => {
  it('llevan el estilo del tema (finas y oscuras), no las del sistema', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const estilos = await p.evaluate(() => {
        const e = (sel) => document.querySelector(sel)
        const g = (el) => getComputedStyle(el)
        return {
          esquema: g(document.documentElement).colorScheme,
          columna: g(e('[data-testid=panel-herramientas]')).scrollbarWidth,
          serie: g(e('[role=group][aria-label="Series de la gráfica"]')).scrollbarWidth,
          color: g(e('[data-testid=panel-herramientas]')).scrollbarColor,
        }
      })
      assert.equal(estilos.esquema, 'dark')
      assert.equal(estilos.columna, 'thin')
      assert.equal(estilos.serie, 'thin')
      assert.match(estilos.color, /^color\(srgb|^rgba?\(/, `scrollbar-color: ${estilos.color}`)
      assert.match(estilos.color, /transparent|rgba\(0, 0, 0, 0\)|\/ 0\)/, `la pista debe ser transparente: ${estilos.color}`)
    } finally {
      await p.close()
    }
  })
})

describe('escritorio', () => {
  it('a 1280 px la gráfica y los controles caben sin desbordar la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const { desborda } = await p.evaluate(() => ({ desborda: document.documentElement.scrollWidth > window.innerWidth }))
      assert.equal(desborda, false, 'la página tiene scroll horizontal')
      assert.ok(await p.getByTestId('grafica-angulo-area').isVisible())
    } finally {
      await p.close()
    }
  })
})

describe('aviso de versión nueva', () => {
  const publicar = (p, commit) => p.route('**/version.json', (r) => r.fulfill({ json: { commit, rama: 'prueba' } }))

  it('con lo publicado igual a lo abierto no avisa', async () => {
    const p = await abrirApp(navegador)
    try {
      // Build local: el commit de la app y el de version.json son el mismo («dev»).
      const publicada = await (await p.request.get(new URL('/version.json', p.url()).href)).json()
      assert.ok(publicada.commit)
      await p.reload()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
    } finally {
      await p.close()
    }
  })

  it('con otro commit publicado, avisa y «Recargar» vuelve a cargar la app; también al volver a verla', async () => {
    const p = await abrirApp(navegador)
    try {
      await publicar(p, 'commit-nuevo')
      await p.reload()
      const aviso = p.getByTestId('version-nueva')
      await aviso.waitFor()
      assert.match(await aviso.innerText(), /Hay una versión nueva/)
      // Recargar: la página se vuelve a cargar (y, sin el aviso simulado, desaparece).
      await p.unroute('**/version.json')
      await Promise.all([p.waitForEvent('load'), aviso.getByRole('button', { name: 'Recargar' }).click()])
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)

      // Comprobación al volver a la app: aparece sin recargar la página.
      await publicar(p, 'otro-commit')
      await p.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await p.getByTestId('version-nueva').waitFor()
    } finally {
      await p.close()
    }
  })

  it('el aviso flota: no cambia la posición de nada, y se cierra hasta que haya otra versión distinta', async () => {
    const p = await abrirApp(navegador)
    try {
      const y0 = (await p.getByRole('heading', { name: 'dualkinema' }).boundingBox()).y
      await publicar(p, 'commit-nuevo')
      await p.reload()
      await p.getByTestId('version-nueva').waitFor()
      assert.equal((await p.getByRole('heading', { name: 'dualkinema' }).boundingBox()).y, y0, 'el aviso mueve la cabecera')
      assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=version-nueva]')).position), 'fixed')

      await p.getByTestId('version-nueva-cerrar').click()
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
      // Misma versión publicada al volver a verla: sigue cerrado. Otra distinta: vuelve a avisar.
      const alVolver = () =>
        p.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
        })
      await alVolver()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
      await p.unroute('**/version.json')
      await publicar(p, 'otra-mas')
      await alVolver()
      await p.getByTestId('version-nueva').waitFor()
    } finally {
      await p.close()
    }
  })

  it('un version.json que no es una versión (p. ej. sin conexión o una página) no avisa', async () => {
    const p = await abrirApp(navegador)
    try {
      await p.route('**/version.json', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }))
      await p.reload()
      await p.waitForTimeout(500)
      assert.equal(await p.getByTestId('version-nueva').count(), 0)
    } finally {
      await p.close()
    }
  })
})

describe('app instalable', () => {
  it('el manifiesto está enlazado, es válido y sus iconos existen con el tamaño que dicen', async () => {
    const p = await abrirApp(navegador)
    try {
      const href = await p.locator('link[rel=manifest]').getAttribute('href')
      assert.ok(href, 'falta <link rel="manifest">')
      const url = new URL(href, p.url()).href
      const respuesta = await p.request.get(url)
      assert.ok(respuesta.ok())
      const m = await respuesta.json()
      // Sin la barra del navegador y con la URL de siempre (sin service worker: siempre la última versión).
      assert.equal(m.display, 'standalone')
      assert.equal(new URL(m.start_url, url).pathname, '/')
      assert.ok(m.name && m.short_name)
      const medidas = m.icons.map((i) => i.sizes)
      assert.ok(medidas.includes('192x192') && medidas.includes('512x512'), 'faltan los iconos de 192 y 512 px')
      assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'falta un icono maskable')
      for (const icono of m.icons) {
        const r = await p.request.get(new URL(icono.src, url).href)
        assert.ok(r.ok(), `no se sirve ${icono.src}`)
        assert.match(r.headers()['content-type'], /image\/png/)
        const png = await r.body()
        // Cabecera PNG: ancho y alto en los bytes 16–23.
        const [ancho, alto] = [png.readUInt32BE(16), png.readUInt32BE(20)]
        assert.equal(`${ancho}x${alto}`, icono.sizes, `${icono.src} no mide lo que dice el manifiesto`)
      }
    } finally {
      await p.close()
    }
  })
})

it('no ha habido errores de consola ni de página en ninguna prueba', () => {
  assert.deepEqual(errores, [])
})

describe('minigráfica grande arriba del todo (móvil)', () => {
  let p
  before(async () => {
    ;({ p } = await seguirVideo(videos.verde, { ancho: 390 }))
  })
  after(() => p?.close())

  const asentar = async () => {
    await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 })
  }
  const arriba = async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
  }
  const altoMini = async () => (await p.getByTestId('minigrafica-caja').boundingBox()).height
  const cajas = async () => ({
    tira: await p.getByRole('tablist').locator('..').boundingBox(),
    barra: await p.getByTestId('barra-fija').boundingBox(),
    tarjetas: await p.getByTestId('panel-herramientas').boundingBox(),
    video: await p.getByTestId('lienzo').boundingBox(),
  })

  it('arriba del todo la primera pantalla es vídeo, gráfica, pestañas y barra: no asoma ninguna tarjeta', async () => {
    await arriba()
    const c = await cajas()
    assert.ok((await altoMini()) > 120, `la gráfica mide ${await altoMini()} px`)
    // La tira acaba justo sobre la barra y las tarjetas empiezan por debajo de ella (fuera de la pantalla visible).
    assert.ok(Math.abs(c.tira.y + c.tira.height - c.barra.y) <= 2, `tira hasta ${c.tira.y + c.tira.height}, barra desde ${c.barra.y}`)
    assert.ok(c.tarjetas.y >= c.barra.y, `las tarjetas asoman: empiezan en ${c.tarjetas.y}, la barra en ${c.barra.y}`)
    assert.ok(c.video.y >= 0 && c.video.y + c.video.height <= c.tira.y, 'el vídeo cabe sobre la gráfica y la tira')
    assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-grande'), 'true')
  })

  it('al bajar un poco vuelve a su alto de siempre y no vuelve sola arriba (sin saltos)', async () => {
    await arriba()
    await p.evaluate(() => window.scrollTo(0, 120))
    await asentar()
    assert.equal(await p.getByTestId('visor-fijo').getAttribute('data-grande'), 'false')
    assert.equal(Math.round(await altoMini()), 76)
    // El scroll se queda donde se dejó (el navegador no lo «corrige» al encogerse la gráfica).
    assert.equal(await p.evaluate(() => Math.round(window.scrollY)), 120)
    // Vuelve a crecer al llegar arriba del todo.
    await arriba()
    assert.ok((await altoMini()) > 120)
  })

  it('tocar una pestaña desplaza hasta sus tarjetas: la tira queda pegada bajo el vídeo y las tarjetas se ven', async () => {
    for (const id of ['analisis', 'marcar']) {
      await arriba()
      await p.getByTestId(`pestana-${id}`).click()
      await p.waitForFunction(() => window.scrollY > 40)
      await asentar()
      const c = await cajas()
      assert.equal(Math.round(await altoMini()), 76)
      assert.ok(c.tarjetas.y < c.barra.y - 100, `${id}: las tarjetas empiezan en ${c.tarjetas.y} y la barra en ${c.barra.y}`)
      // La tira pegada bajo el vídeo con la gráfica en reposo.
      const fijo = await p.getByTestId('visor-fijo').boundingBox()
      assert.ok(Math.abs(c.tira.y - (fijo.y + fijo.height)) <= 4, `la tira está en ${c.tira.y} y el vídeo acaba en ${fijo.y + fijo.height}`)
    }
  })

  it('el estado del guardado está en la pestaña «Vídeo» en el móvil', async () => {
    await abrirPestana(p, 'video')
    await p.getByTestId('guardado').waitFor({ state: 'visible' })
    assert.equal(await p.getByTestId('guardado').count(), 1)
  })
})

describe('asa entre el vídeo y la gráfica pequeña (móvil)', () => {
  let p
  before(async () => {
    // Vídeo vertical: es el que puede crecer en alto (uno horizontal llena antes el ancho).
    p = await abrirApp(navegador, { ancho: 390 })
    await cargarVideo(p, videos.vertical.ruta)
  })
  after(() => p?.close())

  const asentar = async () => {
    await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))))
    await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 })
  }
  const asa = () => p.getByTestId('separador-video')
  const altoVideo = async () => (await p.getByTestId('lienzo').boundingBox()).height
  const altoMini = async () => (await p.getByTestId('minigrafica-caja').boundingBox()).height
  /** Arrastra el asa `dy` px y la suelta; devuelve el alto del vídeo justo antes de soltar. */
  const arrastrar = async (dy) => {
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + dy / 2, { steps: 4 })
    await p.mouse.move(x, y + dy, { steps: 4 })
    const durante = await altoVideo()
    await p.mouse.up()
    await asentar()
    return durante
  }
  /** La tira de pestañas acaba justo sobre la barra fija (la gráfica grande llena lo que deja el vídeo). */
  const tiraSobreLaBarra = async () => {
    const tira = await p.getByRole('tablist').locator('..').boundingBox()
    const barra = await p.getByTestId('barra-fija').boundingBox()
    assert.ok(Math.abs(tira.y + tira.height - barra.y) <= 2, `tira hasta ${tira.y + tira.height}, barra desde ${barra.y}`)
  }

  it('de partida, el reparto de siempre: el vídeo, un 30 % de la ventana', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'normal')
    assert.ok(Math.abs((await altoVideo()) - 0.3 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    await tiraSobreLaBarra()
  })

  it('arrastrar hacia abajo agranda el vídeo, encaja en «vídeo grande» y la gráfica cede el sitio', async () => {
    const miniAntes = await altoMini()
    const durante = await arrastrar(90)
    assert.ok(Math.abs(durante - (0.3 * 844 + 90)) <= 2, `durante el arrastre el vídeo mide ${durante} px`)
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.ok(Math.abs((await altoVideo()) - 0.45 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    assert.ok((await altoMini()) < miniAntes - 100, `la gráfica mide ${await altoMini()} px (antes ${miniAntes})`)
    await tiraSobreLaBarra()
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), 'video')
  })

  it('arrastrar hacia arriba agranda la gráfica', async () => {
    const miniAntes = await altoMini()
    await arrastrar(-200)
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
    assert.ok(Math.abs((await altoVideo()) - 0.2 * 844) <= 2, `el vídeo mide ${await altoVideo()} px`)
    assert.ok((await altoMini()) > miniAntes + 60, `la gráfica mide ${await altoMini()} px (antes ${miniAntes})`)
    await tiraSobreLaBarra()
  })

  it('dos toques vuelven al reparto de siempre; con el teclado, a la posición de al lado', async () => {
    await asa().dblclick()
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'normal')
    assert.ok(Math.abs((await altoVideo()) - 0.3 * 844) <= 2)
    await asa().focus()
    await p.keyboard.press('ArrowDown')
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    await p.keyboard.press('ArrowUp')
    await p.keyboard.press('ArrowUp')
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('tirar más allá de un extremo y soltar pasa a la vista ampliada y al volver se aterriza en ese extremo', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    const antes = await asa().getAttribute('data-reparto')
    // Hacia abajo, mucho más allá de «vídeo grande»: aviso mientras se tira y, al soltar, el vídeo ampliado.
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + 300, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), 'video')
    await p.getByTestId('aviso-ampliar').waitFor({ state: 'visible' })
    // Con resistencia: pasado el extremo (45 %), el vídeo sigue un poco más (56 × 0,35 ≈ 20 px como mucho), no se para en seco.
    const pasado = (await altoVideo()) - 0.45 * 844
    assert.ok(pasado > 8 && pasado < 25, `el vídeo pasa ${pasado} px del extremo`)
    await p.mouse.up()
    await p.getByTestId('reducir-video').waitFor({ state: 'visible' })
    await p.getByTestId('reducir-video').click()
    await asentar()
    // Se vuelve al extremo del que se viene (vídeo grande), sin tocar el reparto guardado.
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), antes)
    // Hacia arriba, más allá de «gráfica grande»: solo las gráficas.
    await arrastrar(-500)
    await p.getByTestId('vista-graficas').waitFor({ state: 'visible' })
    await p.getByTestId('reducir-graficas').click()
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('en las vistas ampliadas, tirar del asa en sentido contrario al de entrar vuelve a la mixta (con poco recorrido, no)', async () => {
    await p.evaluate(() => window.scrollTo(0, 0))
    await asentar()
    const antes = await asa().getAttribute('data-reparto')
    const tirar = async (id, dy) => {
      const c = await p.getByTestId(id).boundingBox()
      const x = c.x + c.width / 2
      const y = c.y + c.height / 2
      await p.mouse.move(x, y)
      await p.mouse.down()
      await p.mouse.move(x, y + dy / 2, { steps: 4 })
      await p.mouse.move(x, y + dy, { steps: 4 })
      return () => p.mouse.up()
    }
    // Vídeo grande: se entra tirando hacia abajo y se sale tirando hacia arriba.
    await arrastrar(500)
    await p.getByTestId('reducir-video').waitFor({ state: 'visible' })
    let soltar = await tirar('asa-volver-video', -20)
    assert.equal(await p.getByTestId('asa-volver-video-aviso').count(), 0, 'con poco recorrido no avisa')
    await soltar()
    assert.equal(await p.getByTestId('reducir-video').count(), 1, 'con poco recorrido no vuelve')
    soltar = await tirar('asa-volver-video', -120)
    await p.getByTestId('asa-volver-video-aviso').waitFor({ state: 'visible' })
    await soltar()
    await p.getByTestId('reducir-video').waitFor({ state: 'detached' })
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'video')
    assert.equal(await p.evaluate(() => localStorage.getItem('dualkinema.repartoVideo')), antes)
    // Solo gráficas: se entra tirando hacia arriba y se sale tirando hacia abajo.
    await arrastrar(-500)
    await p.getByTestId('vista-graficas').waitFor({ state: 'visible' })
    soltar = await tirar('asa-volver-graficas', 20)
    await soltar()
    assert.equal(await p.getByTestId('reducir-graficas').count(), 1, 'con poco recorrido no vuelve')
    soltar = await tirar('asa-volver-graficas', 120)
    await p.getByTestId('asa-volver-graficas-aviso').waitFor({ state: 'visible' })
    await soltar()
    await p.getByTestId('reducir-graficas').waitFor({ state: 'detached' })
    await asentar()
    assert.equal(await asa().getAttribute('data-reparto'), 'grafica')
  })

  it('pasado el margen, volver atrás sin soltar no amplía: encaja como siempre', async () => {
    const c = await asa().boundingBox()
    const x = c.x + c.width / 2
    const y = c.y + c.height / 2
    await p.mouse.move(x, y)
    await p.mouse.down()
    await p.mouse.move(x, y + 300, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), 'video')
    await p.mouse.move(x, y + 5, { steps: 8 })
    assert.equal(await asa().getAttribute('data-desborde'), null)
    await p.mouse.up()
    await asentar()
    assert.equal(await p.getByTestId('reducir-video').count(), 0)
    assert.equal(await p.getByTestId('aviso-ampliar').count(), 0)
  })

  it('«Cambiar vídeo» en el móvil es solo un icono (con su nombre accesible)', async () => {
    const b = p.getByRole('button', { name: 'Cambiar vídeo' })
    const c = await b.boundingBox()
    assert.ok(c.width <= 48 && c.height <= 48, `el botón mide ${c.width} × ${c.height} px`)
  })

  it('en pantalla ancha no hay asa', async () => {
    const q = await abrirApp(navegador, { ancho: 1280 })
    await cargarVideo(q, videos.vertical.ruta)
    assert.equal(await q.getByTestId('separador-video').count(), 0)
    await q.close()
  })
})
