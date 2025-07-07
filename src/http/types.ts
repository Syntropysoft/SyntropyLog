/**
 * FILE: src/http/types.ts
 * DESCRIPTION: Defines shared types for HTTP instrumentation.
 */

import { AxiosInstance } from 'axios';
import { Got } from 'got';

/**
 * A type representing the native `fetch` function signature.
 */
export type InstrumentedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * A union type representing any of the supported instrumented HTTP clients.
 */
export type InstrumentedHttpClient = AxiosInstance | InstrumentedFetch | Got;