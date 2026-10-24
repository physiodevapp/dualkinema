export declare const OCUPANTES_MAXIMOS = 2;
/** Mensajes por segundo y móvil sostenidos, y ráfaga: al emparejar, los pings van a 20 por segundo durante 1,5 s. */
export declare const RITMO_MAXIMO = 30;
export declare const RAFAGA_MAXIMA = 60;
/** Una sala se cierra a las 3 horas de abrirse, aunque siga en uso. */
export declare const DURACION_MAXIMA_SALA_MS: number;
/** Códigos de cierre del WebSocket (4000–4999 son de la aplicación). */
export declare const CIERRE: {
    readonly llena: 4001;
    readonly caducada: 4002;
    readonly ritmo: 4003;
    readonly mensaje: 4004;
};
export type AvisoRele = 
/** Al entrar: cuántos hay ya (contándose). */
{
    readonly rele: 'bienvenida';
    readonly ocupantes: number;
} | {
    readonly rele: 'entra';
    readonly ocupantes: number;
} | {
    readonly rele: 'sale';
    readonly ocupantes: number;
};
export declare const textoAviso: (a: AvisoRele) => string;
/** Un aviso del relé; null si el texto no lo es (será un mensaje de la app). */
export declare function leerAviso(texto: string): AvisoRele | null;
/** Cubo de fichas del ritmo de un móvil. */
export interface Cubo {
    readonly fichas: number;
    /** ms del último mensaje. */
    readonly instante: number;
}
/** Gasta una ficha si la hay (se reponen RITMO_MAXIMO por segundo, hasta RAFAGA_MAXIMA). */
export declare function gastarFicha(cubo: Cubo | null, ahora: number): {
    readonly permitido: boolean;
    readonly cubo: Cubo;
};
/**
 * Páginas que pueden usar el relé: producción y las previsualizaciones de dualkinema, y localhost (pruebas). No es una
 * barrera contra quien no use un navegador (puede mandar cualquier `Origin`), pero evita que otra web lo use de paso.
 */
export declare function origenPermitido(origen: string | null): boolean;
