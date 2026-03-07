/**
 * @file UniversalLogFormatter.ts
 * @description Highly configurable JSON-driven formatter that maps LogEntry to any object structure.
 */

import { LogEntry } from '../../types';

export type MappingValue =
  | string
  | (string | { value: unknown; fallback?: unknown })[]
  | { value: unknown; fallback?: unknown };

export interface UniversalMapping {
  /** Map of [outputKey]: [inputPath | [inputPathFallbacks] | { value: staticValue }] */
  [key: string]: MappingValue;
}

export interface UniversalLogFormatterOptions {
  mapping: UniversalMapping;
  /** If true, includes all log data in a specific key (e.g. 'context') */
  includeAllIn?: string;
}

export class UniversalLogFormatter {
  private readonly mapping: UniversalMapping;
  private readonly includeAllIn?: string;

  constructor(options: UniversalLogFormatterOptions) {
    this.mapping = options.mapping;
    this.includeAllIn = options.includeAllIn;
  }

  /**
   * Formats a LogEntry into a custom object based on the mapping schema.
   */
  public format(entry: LogEntry): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [targetKey, sourceSpec] of Object.entries(this.mapping)) {
      result[targetKey] = this.resolveValue(sourceSpec, entry);
    }

    if (this.includeAllIn) {
      const bindings =
        (entry as { bindings?: Record<string, unknown> }).bindings ?? {};
      const metadata =
        (entry as { metadata?: Record<string, unknown> }).metadata ?? {};
      result[this.includeAllIn] = {
        ...(typeof bindings === 'object' && bindings !== null ? bindings : {}),
        ...(typeof metadata === 'object' && metadata !== null ? metadata : {}),
      };
    }

    return result;
  }

  private resolveValue(spec: MappingValue, entry: LogEntry): unknown {
    // 1. Static value with optional fallback
    if (typeof spec === 'object' && !Array.isArray(spec) && 'value' in spec) {
      const s = spec as { value?: unknown; fallback?: unknown };
      return s.value ?? s.fallback;
    }

    // 2. Single path or list of path fallbacks (can be mixed)
    const items = Array.isArray(spec) ? spec : [spec];
    for (const item of items) {
      if (typeof item === 'object' && item !== null && 'value' in item) {
        const i = item as { value?: unknown; fallback?: unknown };
        return i.value ?? i.fallback;
      }

      if (typeof item === 'string') {
        const val = this.getValueByPath(item, entry);
        if (val !== undefined && val !== null) {
          return val;
        }
      }
    }

    return undefined;
  }

  private getValueByPath(path: string, entry: LogEntry): unknown {
    // Special top-level keys
    if (path === 'message') return entry.message;
    if (path === 'level') return entry.level;
    if (path === 'timestamp') return entry.timestamp;

    const parts = path.split('.');
    let current: unknown = entry;

    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      // Handle shorthand 'bindings' and 'metadata'
      if (
        current === entry &&
        !Object.prototype.hasOwnProperty.call(entry, part)
      ) {
        const entryWithExtras = entry as {
          bindings?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
        };
        const inBindings = entryWithExtras.bindings?.[part];
        if (inBindings !== undefined) {
          current = inBindings;
          continue;
        }
        const inMeta = entryWithExtras.metadata?.[part];
        if (inMeta !== undefined) {
          current = inMeta;
          continue;
        }
      }

      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
