/**
 * @file src/logger/transports/optionalChalk.ts
 * @description Load chalk optionally so that pretty console transports work in both
 * ESM (tsx + "type": "module") and CJS (ts-node) consumers. If chalk is missing or
 * fails to load, a no-op identity is used (no colors).
 */

import { createRequire } from 'module';

/** Chalk-like API used by BaseConsolePrettyTransport and subclasses. */
export type ChalkLike = {
  (s: string): string;
  white: ChalkLike;
  bold: ChalkLike;
  red: ChalkLike;
  bgRed: ChalkLike;
  yellow: ChalkLike;
  cyan: ChalkLike;
  green: ChalkLike;
  gray: ChalkLike;
  magenta: ChalkLike;
  blue: ChalkLike;
  bgWhite: ChalkLike;
  dim: ChalkLike;
};

function createNoColorChalk(): ChalkLike {
  const noColor = ((s: string) => s) as ChalkLike;
  noColor.white = noColor;
  noColor.bold = noColor;
  noColor.red = noColor;
  noColor.bgRed = noColor;
  noColor.yellow = noColor;
  noColor.cyan = noColor;
  noColor.green = noColor;
  noColor.gray = noColor;
  noColor.magenta = noColor;
  noColor.blue = noColor;
  noColor.bgWhite = noColor;
  noColor.dim = noColor;
  return noColor;
}

function getRequire(): NodeRequire {
  if (typeof require !== 'undefined') {
    return require as NodeRequire;
  }
  return createRequire(import.meta.url);
}

function loadChalkSync(): ChalkLike {
  try {
    const c = getRequire()('chalk');
    const ch = (c?.default ?? c) as ChalkLike | undefined;
    if (ch && typeof ch.white !== 'undefined') {
      return ch;
    }
  } catch {
    // chalk not installed or failed to load (e.g. CJS/ESM interop)
  }
  return createNoColorChalk();
}

let cached: ChalkLike | null = null;

/**
 * Returns a chalk-like instance: real chalk if available and usable, otherwise
 * a no-op that returns the string unchanged. Safe to call from both ESM and CJS.
 */
export function getOptionalChalk(): ChalkLike {
  if (cached !== null) {
    return cached;
  }
  cached = loadChalkSync();
  return cached;
}
