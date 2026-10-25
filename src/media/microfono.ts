/*
 * ¿Hay unos auriculares o un micrófono externo conectados? (fase 4, paso 6). Con unos auriculares con micrófono, Android
 * graba el sonido por ellos (en la prueba del usuario estaban en otra habitación y la palmada apenas se oyó) y el pitido
 * de la grabación doble saldría también por ellos: el otro móvil no lo oiría.
 *
 * Chrome para Android nombra las entradas de audio según su tipo ("Wired headset", "Bluetooth headset", "USB audio";
 * "Speakerphone" y "Headset earpiece" son el micrófono y el auricular del propio móvil) y solo lista las conectadas. Se
 * mira también el nombre de la pista abierta. Es una pista de nombres, no una garantía: si no se reconoce, no se avisa.
 */

const EXTERNO = /wired headset|bluetooth|\bbt\b|usb|headphone|auricular|cascos|manos libres|hands-?free/i

/** El nombre del micrófono externo conectado, o null si no se ve ninguno. */
export async function microExterno(flujo: MediaStream | null): Promise<string | null> {
  const pista = flujo?.getAudioTracks()[0]
  if (pista && EXTERNO.test(pista.label)) return pista.label
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices()
    return dispositivos.find((d) => d.kind === 'audioinput' && EXTERNO.test(d.label))?.label ?? null
  } catch {
    return null
  }
}

export const AVISO_MICRO_EXTERNO =
  'Hay unos auriculares o un micrófono externo conectados: Android grabará el sonido por ellos y los pitidos saldrían por ellos. Desconéctalos para grabar.'
