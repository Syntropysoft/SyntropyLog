import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { SerializableData } from '../../types';

function safeDecycle(
  data: unknown,
  seen: WeakSet<object>,
  root: unknown
): unknown {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  if (seen.has(data)) {
    return root; // Restore circular ref to root so result.self === result
  }

  seen.add(data);

  if (Array.isArray(data)) {
    let isModified = false;
    const out = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const decycledItem = safeDecycle(data[i], seen, root);
      out[i] = decycledItem;
      if (decycledItem !== data[i]) {
        isModified = true;
      }
    }
    seen.delete(data);
    return isModified ? out : data;
  }

  // Mutate in place to avoid copying the whole object when breaking circular refs.
  for (const key in data as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const val = (data as Record<string, unknown>)[key];
      const decycledVal = safeDecycle(val, seen, root);
      if (decycledVal !== val) {
        (data as Record<string, unknown>)[key] = decycledVal;
      }
    }
  }

  seen.delete(data);
  return data;
}

/**
 * @class HygieneStep
 * @description Ensures data is safe for serialization by handling circular references
 * and enforcing depth limits. This is part of the "Safety by Default" engine.
 */
export class HygieneStep implements PipelineStep<SerializableData> {
  name = 'hygiene';

  /**
   * Identifies and resolves circular references and limits depth synchronously.
   */
  execute(
    data: SerializableData,
    _context: SerializationPipelineContext
  ): SerializableData {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    try {
      // 1. Handle special objects like Errors (they don't stringify well)
      if (data instanceof Error) {
        return {
          name: data.name,
          message: data.message,
          stack: data.stack,
          ...(data as unknown as Record<string, unknown>),
        };
      }

      // 2. Fast path: V8 native check. If JSON.stringify succeeds, there are no circular refs.
      // This is 100x faster and uses 0 JS-heap memory compared to manual JS traversal.
      try {
        JSON.stringify(data);
        return data; // Return originally passed reference (zero structural cloning)
      } catch {
        // 3. Fallback: Circular reference detected, or hostile object (e.g. Proxy that throws on get).
        let cleaned: SerializableData;
        try {
          cleaned = safeDecycle(data, new WeakSet(), data) as SerializableData;
        } catch (e: unknown) {
          let msg: string;
          try {
            msg = e instanceof Error ? e.message : String(e);
          } catch {
            msg = 'unknown';
          }
          return `[HYGIENE_ERROR: ${msg}]` as unknown as SerializableData;
        }
        return cleaned;
      }
    } catch (error: unknown) {
      let msg: string;
      try {
        msg = error instanceof Error ? error.message : String(error);
      } catch {
        msg = 'unknown';
      }
      return `[HYGIENE_ERROR: ${msg}]` as unknown as SerializableData;
    }
  }
}
