/// <reference types="vite/client" />

declare const __COMMIT__: string
declare const __RAMA__: string
/** Librería sin marcadores y su versión (fase 5). */
declare const __MEDIAPIPE__: string

/** ONNX Runtime Web sin el cargador del WASM dentro (`workers/rtmpose.worker.ts`): los mismos tipos que el paquete. */
declare module '*/onnxruntime-web/dist/ort.webgpu.min.mjs' {
  export * from 'onnxruntime-web'
}
