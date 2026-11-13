/*
 * Se importa lo primero en cada worker que carga MediaPipe (los módulos se evalúan en el orden de sus `import`): la barrera
 * queda puesta antes de que la librería guarde referencias a `fetch` o `XMLHttpRequest`. Lo bloqueado se cuenta en la
 * consola como aviso (sin la ruta: solo el host).
 */
import { instalarBarreraRed } from './barreraRed'

export const barrera = instalarBarreraRed(globalThis, (host) => console.warn(`dualkinema: llamada de red bloqueada (${host})`))
