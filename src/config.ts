/**
 * @file src/config.ts
 * @description Defines and exports the configuration types for the library.
 * These types are now explicitly defined for better TypeScript intellisense and autocompletion,
 * while still using Zod schemas for runtime validation.
 */

import * as v from 'valibot';
import { syntropyLogConfigSchema } from './config.schema';

/**
 * @description The complete, top-level configuration type for the SyntropyLog framework.
 * This type is inferred from the main Zod schema and represents the entire valid configuration object.
 */
export type SyntropyLogConfig = v.InferInput<typeof syntropyLogConfigSchema>;

// Redis config types removed
