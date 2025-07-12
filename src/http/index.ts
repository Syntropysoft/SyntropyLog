/**
 * @file src/http/index.ts
 * DESCRIPTION:
 * This file is the public entry point for all components related to HTTP instrumentation.
 * It defines the public API that framework users will consume to create and use adapters.
 */

// 1. EXPORT THE CONTRACT INTERFACES
// This is the most important part. It allows ANYONE to create their own
// adapter by simply implementing these interfaces.
export type {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from './adapters/adapter.types';

// 2. EXPORT THE ADAPTERS WE PROVIDE
// As a convenience for users, we export the adapters that we maintain
// ourselves (like the one for Axios). This way, they don't have to write
// it themselves if they use a common library.
export { AxiosAdapter } from './adapters/AxiosAdapter';

// 3. (OPTIONAL) EXPORT THE INSTRUMENTER
// Exporting the instrumenter class type can be useful for advanced
// TypeScript users who want explicit type references.
export type { InstrumentedHttpClient } from './InstrumentedHttpClient';
