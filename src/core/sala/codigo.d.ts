export declare const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export declare const LARGO_CODIGO = 6;
/**
 * Un código nuevo. `aleatorios(n)` da n bytes aleatorios (en la app, `crypto.getRandomValues`). Se descartan los bytes
 * ≥ 248 (8 · 31): con el resto, cada carácter sale con la misma probabilidad.
 */
export declare function generarCodigo(aleatorios: (n: number) => Uint8Array): string;
/** El código escrito a mano (minúsculas, espacios, guiones) en su forma canónica; null si no es un código. */
export declare function normalizarCodigo(texto: string): string | null;
/** Para leerlo en voz alta o en pantalla: `ABC-DEF`. */
export declare const formatoCodigo: (codigo: string) => string;
/** La dirección del QR: el mismo origen (en una previsualización, la misma) con la sala. */
export declare const urlDeSala: (origen: string, codigo: string) => string;
/** El código de la parte `?…` de una dirección; null si no hay o no es válido. */
export declare function codigoDeBusqueda(busqueda: string): string | null;
