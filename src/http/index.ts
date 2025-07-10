/**
 * FILE: src/http/index.ts (NUEVO)
 * DESCRIPTION:
 * Este archivo es el punto de entrada público para todos los componentes
 * relacionados con la instrumentación HTTP. Define la API pública que los
 * usuarios del framework consumirán para crear y utilizar adaptadores.
 */

// 1. EXPORTAMOS LAS INTERFACES DEL CONTRATO
// Esto es lo más importante. Permite a CUALQUIERA crear su propio
// adaptador simplemente implementando estas interfaces.
export type {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from './adapters/adapter.types';

// 2. EXPORTAMOS LOS ADAPTADORES QUE PROVEEMOS
// Como una conveniencia para los usuarios, exportamos los adaptadores que
// nosotros mismos mantenemos (como el de Axios). De esta forma, no tienen
// que escribirlo si usan una librería común.
export { AxiosAdapter } from './adapters/AxiosAdapter';

// 3. (OPCIONAL) EXPORTAMOS EL INSTRUMENTADOR
// Exportar el tipo de la clase instrumentadora puede ser útil para
// usuarios avanzados de TypeScript que quieran referencias de tipo explícitas.
export type { InstrumentedHttpClient } from './InstrumentedHttpClient';
