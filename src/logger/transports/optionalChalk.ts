/**
 * @file src/logger/transports/optionalChalk.ts
 * @description Built-in chalk-like API using ANSI escape codes. No chalk dependency.
 * Used by ClassicConsoleTransport, PrettyConsoleTransport, CompactConsoleTransport, ColorfulConsoleTransport.
 */

/** Chalk-like API: chainable style that returns wrapped string when called. */
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

const RESET = '\x1b[0m';

function wrap(s: string, codes: number[]): string {
  if (codes.length === 0) return s;
  return `\x1b[${codes.join(';')}m${s}${RESET}`;
}

function createChain(codes: number[]): ChalkLike {
  const fn = ((s: string) => wrap(s, codes)) as ChalkLike;
  const add = (code: number) => createChain([...codes, code]);
  // Lazy getters: only create the next chain when the property is accessed (avoids stack overflow)
  Object.defineProperty(fn, 'white', { get: () => add(37), enumerable: true });
  Object.defineProperty(fn, 'bold', { get: () => add(1), enumerable: true });
  Object.defineProperty(fn, 'red', { get: () => add(31), enumerable: true });
  Object.defineProperty(fn, 'bgRed', { get: () => add(41), enumerable: true });
  Object.defineProperty(fn, 'yellow', { get: () => add(33), enumerable: true });
  Object.defineProperty(fn, 'cyan', { get: () => add(36), enumerable: true });
  Object.defineProperty(fn, 'green', { get: () => add(32), enumerable: true });
  Object.defineProperty(fn, 'gray', { get: () => add(90), enumerable: true });
  Object.defineProperty(fn, 'magenta', {
    get: () => add(35),
    enumerable: true,
  });
  Object.defineProperty(fn, 'blue', { get: () => add(34), enumerable: true });
  Object.defineProperty(fn, 'bgWhite', {
    get: () => add(47),
    enumerable: true,
  });
  Object.defineProperty(fn, 'dim', { get: () => add(2), enumerable: true });
  return fn;
}

let cached: ChalkLike | null = null;

/**
 * Returns a chalk-like instance using built-in ANSI colors. No external chalk dependency.
 * Respects NO_COLOR and disables colors when stdout is not a TTY (e.g. pipes, CI).
 */
export function getOptionalChalk(): ChalkLike {
  if (cached !== null) {
    return cached;
  }
  const noColor =
    process.env.NO_COLOR !== undefined &&
    process.env.NO_COLOR !== '' &&
    process.env.NO_COLOR !== '0';
  const isTTY =
    typeof process.stdout?.isTTY === 'boolean' && process.stdout.isTTY;
  if (noColor || !isTTY) {
    const identity = ((s: string) => s) as ChalkLike;
    identity.white = identity;
    identity.bold = identity;
    identity.red = identity;
    identity.bgRed = identity;
    identity.yellow = identity;
    identity.cyan = identity;
    identity.green = identity;
    identity.gray = identity;
    identity.magenta = identity;
    identity.blue = identity;
    identity.bgWhite = identity;
    identity.dim = identity;
    cached = identity;
  } else {
    cached = createChain([]);
  }
  return cached;
}
