/**
 * @file UniversalLogFormatter.ts
 * @description Highly configurable JSON-driven formatter that maps LogEntry to any object structure.
 */

import { LogEntry } from '../../types';

export type MappingValue =
  | string
  | (string | { value: any; fallback?: any })[]
  | { value: any; fallback?: any };

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
  public format(entry: LogEntry): any {
    const result: Record<string, any> = {};

    for (const [targetKey, sourceSpec] of Object.entries(this.mapping)) {
      result[targetKey] = this.resolveValue(sourceSpec, entry);
    }

    if (this.includeAllIn) {
      result[this.includeAllIn] = {
        ...entry.bindings,
        ...entry.metadata,
      };
    }

    return result;
  }

  private resolveValue(spec: MappingValue, entry: LogEntry): any {
    // 1. Static value with optional fallback
    if (typeof spec === 'object' && !Array.isArray(spec) && 'value' in spec) {
      return (spec as any).value ?? (spec as any).fallback;
    }

    // 2. Single path or list of path fallbacks (can be mixed)
    const items = Array.isArray(spec) ? spec : [spec];
    for (const item of items) {
      if (typeof item === 'object' && item !== null && 'value' in item) {
        return (item as any).value ?? (item as any).fallback;
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

  private getValueByPath(path: string, entry: any): any {
    // Special top-level keys
    if (path === 'message') return entry.message;
    if (path === 'level') return entry.level;
    if (path === 'timestamp') return entry.timestamp;

    const parts = path.split('.');
    let current = entry;

    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      // Handle shorthand 'bindings' and 'metadata'
      if (
        current === entry &&
        !Object.prototype.hasOwnProperty.call(entry, part)
      ) {
        // Search in bindings or metadata if not found at top level
        const inBindings = entry.bindings?.[part];
        if (inBindings !== undefined) {
          current = inBindings;
          continue;
        }
        const inMeta = entry.metadata?.[part];
        if (inMeta !== undefined) {
          current = inMeta;
          continue;
        }
      }

      current = current[part];
    }

    return current;
  }
}
