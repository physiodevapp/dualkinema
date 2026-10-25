/** Vector o punto en 3D. En 2D se usa z = 0. */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}
export declare const vec3: (x: number, y: number, z?: number) => Vec3;
export declare const restar: (a: Vec3, b: Vec3) => Vec3;
export declare const escalar: (a: Vec3, k: number) => Vec3;
export declare const producto: (a: Vec3, b: Vec3) => number;
export declare const vectorial: (a: Vec3, b: Vec3) => Vec3;
export declare const norma: (a: Vec3) => number;
/** Vector que va de `desde` a `hasta`. */
export declare const segmento: (desde: Vec3, hasta: Vec3) => Vec3;
