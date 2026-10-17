# Pruebas en navegador (e2e)

Abren la app construida en un Chromium real con Playwright y la usan como una persona: cargar un vídeo, tocar los gomets, seguir, mover el deslizador, tocar la gráfica. Lo que `npm test` (Vitest) no puede ver: que los módulos carguen, que el decodificador devuelva *el frame pedido*, que el seguimiento dé el ángulo real de principio a fin.

```
npm run build        # las pruebas sirven dist/
npm run test:e2e     # ~15 s; la primera vez ~2 min más: genera los vídeos
```

Necesitan `ffmpeg` (con libvpx-vp9) y el Chromium de Playwright (`npx playwright install chromium`). Otras opciones: `E2E_PUERTO` (por defecto 4173) y `CHROMIUM_PATH` (usar un Chromium ya instalado).

## Vídeos sintéticos (`videos.mjs`)

Se generan con Node + ffmpeg en la carpeta temporal del sistema (`dualkinema-e2e-v<VERSIÓN>`) y no entran en el repositorio. Súbele `VERSION` a `videos.mjs` si cambias un generador. Son VP9 en WebM porque el Chromium de Playwright no trae H.264 (por eso H.264 y HEVC reales solo se prueban en un móvil).

| Vídeo | Qué es | Para qué |
|---|---|---|
| `numerado` | 320×180, 120 frames, fotograma clave cada 25, fps variable. El número de cada frame está en 8 bloques blanco/negro | Comprobar que el frame que se muestra es el pedido (sin depender de fuentes ni de comparar imágenes) |
| `verde` | Flexión de rodilla 0°→90°→0° en 4 s, 3 gomets verdes sobre una pierna color piel, fps variable | Seguimiento, ángulo real conocido en cada frame y gráfica |
| `rojo` | Lo mismo con gomets rojos | Que el gomet rojo se separe de la piel |
| `oculto` | Como `verde`, con el tobillo tapado unos frames | Que un hueco no se rellene ni se invente |

Cada vídeo de rodilla va con un `.json` con la verdad: tiempo, flexión real y posición exacta de cada gomet en cada frame.

## Qué se comprueba

- **Visor:** frame exacto avanzando, retrocediendo y saltando (incluidos los fotogramas clave); tiempo de cada frame; aviso de fps variable; teclado; pulsación mantenida.
- **Marcado:** un toque fuera de un gomet da el motivo con su detalle técnico, **sin tapar la imagen**; uno correcto pasa al siguiente marcador.
- **Seguimiento:** sin huecos; ángulo medido frente al real (tolerancia 0,5°; lo medido en la fase 1 fue ≤ 0,1°), en varios frames, también tras los huecos de fps.
- **Gráfica:** máximo y mínimo; tocar y arrastrar salta al frame más cercano (±1).
- **Huecos:** el aviso, la gráfica y el recuento coinciden con los frames realmente tapados; durante el hueco no hay ángulo; «Ir al primer frame con hueco».
- **Persistencia:** marcar y seguir, recargar, ver la sesión en la lista, reabrir el mismo vídeo y recuperarla (mismo ángulo mostrado en cada frame comparado, mismo resumen de la gráfica, mismas marcas a mano); seguir trabajando actualiza la misma sesión; «Continuar» con otro vídeo lo rechaza y con el suyo recupera; el mismo vídeo con otro nombre se reconoce avisando; un cambio hecho justo antes de recargar no se pierde; «Empezar de cero» y borrar con confirmación.
- **Escritorio** (1280 px): sin desbordes.
- **Consola:** ninguna prueba produce errores de consola ni de página.

## Convenciones

- Se localizan los elementos por rol, por texto o por `data-testid` (`lienzo`, `capa`, `posicion`, `angulo`, `aviso`, `error-toque`, `resumen-grafica`, `guardado`, `sesion-guardada`, `sesion-ilegible`, `candidata`), nunca por clases de estilo.
- Cada página se abre en su propio contexto del navegador, así que empieza con IndexedDB vacío; recargar la misma página lo conserva. Para esperar a que algo esté guardado, `esperarGuardado()` mira IndexedDB y no solo el texto «Guardado…».
- La página se abre con `locale: 'es-ES'` (uPlot falla con el idioma del Chromium de la nube, `en-US@posix`).
- Una prueba nueva que dependa de un resultado numérico debe usar la verdad conocida del vídeo, no un valor «que sale».
- Se han comprobado a propósito dos roturas (signo de la rodilla invertido; la gráfica salta 5 frames de más) y las pruebas las detectan.
