import type { OrientacionVista } from '../geometria/canonico';
/** Sube si un mensaje cambia de sentido o deja de leerse igual. Con versiones distintas, la app lo dice y no graba. */
export declare const VERSION_PROTOCOLO = 1;
/** Tamaño máximo de un mensaje (bytes de texto): el relé rechaza los mayores. */
export declare const TAMANO_MAXIMO_MENSAJE = 2048;
/** Duración máxima de una grabación programada (s), la misma que al grabar con un móvil. */
export declare const DURACION_MAXIMA_PROGRAMADA_S = 300;
export type MotivoCancelar = 'usuario' | 'sin-camara' | 'sin-espacio' | 'tarde' | 'version';
export interface EstadoMovil {
    /** Lo que da su cámara; null si no está abierta. */
    readonly camara: {
        readonly ancho: number;
        readonly alto: number;
        readonly fps: number;
    } | null;
    /** Espacio libre para la app (MB); null si no se sabe. */
    readonly libreMB: number | null;
    /** Batería (0–1); null si no se sabe. */
    readonly bateria: number | null;
    readonly grabando: boolean;
}
export type Mensaje = 
/** Al entrar en la sala y al cambiar de vista. */
{
    readonly tipo: 'hola';
    readonly version: number;
    readonly vista: OrientacionVista | null;
} | {
    readonly tipo: 'ping';
    readonly id: number;
    readonly t1: number;
} | {
    readonly tipo: 'pong';
    readonly id: number;
    readonly t1: number;
    readonly t2: number;
    readonly t3: number;
} | ({
    readonly tipo: 'estado';
} & EstadoMovil)
/** Grabar desde `inicio` (reloj de quien envía) durante `duracion` s, o hasta que alguien pare (null). */
 | {
    readonly tipo: 'programar';
    readonly grabacion: string;
    readonly inicio: number;
    readonly duracion: number | null;
} | {
    readonly tipo: 'confirmar';
    readonly grabacion: string;
}
/** Parar en `fin` (reloj de quien envía). */
 | {
    readonly tipo: 'parar';
    readonly grabacion: string;
    readonly fin: number;
} | {
    readonly tipo: 'cancelar';
    readonly grabacion: string;
    readonly motivo: MotivoCancelar;
} | {
    readonly tipo: 'adios';
};
/** Un mensaje recibido; null si no se entiende (roto, demasiado grande, de un tipo desconocido o con campos inválidos). */
export declare function leerMensaje(texto: string): Mensaje | null;
/** El texto de un mensaje para enviarlo. Lanza si pasa del tamaño máximo (no debería: no hay texto libre). */
export declare function escribirMensaje(m: Mensaje): string;
