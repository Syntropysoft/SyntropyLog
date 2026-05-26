/**
 * @file tests/nestjs/setup.ts
 * @description NestJS decorators require `reflect-metadata` loaded once at
 * process start. Vitest does not auto-import it; we import it here so any
 * test in tests/nestjs/ gets the metadata machinery configured.
 *
 * Wire-up: imported at the top of each NestJS test file.
 */

import 'reflect-metadata';
