/** Lo que publica cada build en `/version.json`. */
export interface VersionPublicada {
  readonly commit: string
}

/** Lee lo publicado; null si no es lo que se espera (p. ej. un servidor de desarrollo, que devuelve la página). */
export function leerVersion(v: unknown): VersionPublicada | null {
  if (typeof v !== 'object' || v === null) return null
  const { commit } = v as Record<string, unknown>
  return typeof commit === 'string' && commit !== '' ? { commit } : null
}

/** Hay una versión nueva si lo publicado es otro commit que el de esta app. */
export function hayVersionNueva(actual: string, publicada: VersionPublicada | null): boolean {
  return publicada !== null && publicada.commit !== actual
}
