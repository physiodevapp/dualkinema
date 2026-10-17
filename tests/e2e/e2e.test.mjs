// Pruebas de punta a punta de la app en un navegador real (Chromium con Playwright).
// Los vídeos son sintéticos y se generan con ffmpeg (ver videos.mjs): la verdad
// (ángulo y posición de cada gomet en cada frame) se conoce de antemano.
//
//   npm run build && npm run test:e2e
//
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { asegurarVideos } from './videos.mjs'
import {
  abrirApp,
  cargarVideo,
  errores,
  esperarQuieto,
  frameMasCercano,
  irAFrame,
  lanzarNavegador,
  leerAngulo,
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
    const datos = await p.locator('dl').innerText()
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
    const imagen = await p.getByTestId('capa').boundingBox()
    assert.ok(error.y >= imagen.y + imagen.height - 1, `el error empieza en y=${error.y} y la imagen acaba en ${imagen.y + imagen.height}`)
  })

  it('un toque correcto limpia el error y pasa al siguiente marcador', async () => {
    const [cadera] = videos.verde.verdad[0].ps
    await tocarVideo(p, cadera.x + 2, cadera.y - 2)
    await p.getByTestId('error-toque').waitFor({ state: 'detached' })
    assert.equal(await p.getByRole('radio', { name: /Epicóndilo/ }).getAttribute('aria-checked'), 'true')
    assert.match(await p.getByRole('radiogroup').innerText(), /Trocánter\s+a mano/)
  })
})

describe('seguimiento y gráfica con gomets verdes', () => {
  let p
  let aviso
  before(async () => {
    ;({ p, aviso } = await seguirVideo(videos.verde))
  })
  after(() => p?.close())

  it('recorre el vídeo entero sin huecos', () => {
    assert.match(aviso, /sin huecos/)
  })

  it('el ángulo medido coincide con el real (tolerancia 0,5°) con fps variable', async () => {
    await compararAngulos(p, videos.verde.verdad)
  })

  it('la gráfica resume el máximo (90°) y el mínimo (0°) sin instantes sin valor', async () => {
    const resumen = await p.getByTestId('resumen-grafica').innerText()
    assert.match(resumen, /máx\. 9[0-1],\d° \(t = 2,0\d s\)/)
    assert.match(resumen, /mín\. 0,0°/)
    assert.doesNotMatch(resumen, /sin valor/)
  })

  it('tocar la gráfica salta al frame más cercano a ese instante (±1 frame)', async () => {
    const tiempos = videos.verde.verdad.map((f) => f.t)
    const caja = await p.locator('.u-over').boundingBox()
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
    const caja = await p.locator('.u-over').boundingBox()
    await p.mouse.move(caja.x + caja.width * 0.1, caja.y + caja.height / 2)
    await p.mouse.down()
    await p.mouse.move(caja.x + caja.width * 0.4, caja.y + caja.height / 2, { steps: 8 })
    await p.mouse.up()
    await esperarQuieto(p)
    const esperado = frameMasCercano(tiempos, tiempos[0] + 0.4 * (tiempos.at(-1) - tiempos[0])) + 1
    assert.ok(Math.abs((await leerPosicion(p)).frame - esperado) <= 1)
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

describe('escritorio', () => {
  it('a 1280 px la gráfica y los controles caben sin desbordar la página', async () => {
    const { p } = await seguirVideo(videos.verde, { ancho: 1280 })
    try {
      const { desborda } = await p.evaluate(() => ({ desborda: document.documentElement.scrollWidth > window.innerWidth }))
      assert.equal(desborda, false, 'la página tiene scroll horizontal')
      assert.ok(await p.locator('.u-over').isVisible())
    } finally {
      await p.close()
    }
  })
})

it('no ha habido errores de consola ni de página en ninguna prueba', () => {
  assert.deepEqual(errores, [])
})
