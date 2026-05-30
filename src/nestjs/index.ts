/**
 * @file src/nestjs/index.ts
 * @description Public surface of the `syntropylog/nestjs` sub-package.
 *
 * NestJS is an optional peer dependency — install it (and `@nestjs/core`,
 * `reflect-metadata`, `rxjs`) only if you import from this entry point.
 */

export {
  SyntropyNestLoggerService,
  type SyntropyNestLoggerServiceOptions,
} from './SyntropyNestLoggerService';

export {
  SyntropyLogModule,
  type SyntropyLogModuleOptions,
} from './SyntropyLogModule';

export { InjectLogger } from './InjectLogger';

export { SYNTROPYLOG_INSTANCE_TOKEN, SYNTROPYLOG_LOGGER_TOKEN } from './tokens';
