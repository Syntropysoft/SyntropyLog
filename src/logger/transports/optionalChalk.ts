/**
 * @file src/logger/transports/optionalChalk.ts
 * @description Built-in chalk-like API using ANSI escape codes. No chalk dependency.
 * Used by ClassicConsoleTransport, PrettyConsoleTransport, CompactConsoleTransport, ColorfulConsoleTransport.
 * Does not read process.env; pass disableColors from transport options (e.g. for NO_COLOR use
 * disableColors: process.env.NO_COLOR != null && process.env.NO_COLOR !== '' && process.env.NO_COLOR !== '0').
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

function createIdentityChalk(): ChalkLike {
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
  return identity;
}

let cachedWithColors: ChalkLike | null = null;
let cachedNoColors: ChalkLike | null = null;

/**
 * Returns a chalk-like instance using built-in ANSI colors. No external chalk dependency.
 * Does not read process.env. Pass disableColors from transport options; when true, output has no colors.
 * When false, colors are used only if stdout is a TTY. To respect NO_COLOR, pass
 * disableColors: process.env.NO_COLOR != null && process.env.NO_COLOR !== '' && process.env.NO_COLOR !== '0'.
 */
export function getOptionalChalk(disableColors: boolean): ChalkLike {
  if (disableColors) {
    if (cachedNoColors === null) cachedNoColors = createIdentityChalk();
    return cachedNoColors;
  }
  const isTTY =
    typeof process.stdout?.isTTY === 'boolean' && process.stdout.isTTY;
  if (!isTTY) {
    if (cachedNoColors === null) cachedNoColors = createIdentityChalk();
    return cachedNoColors;
  }
  if (cachedWithColors === null) cachedWithColors = createChain([]);
  return cachedWithColors;
}
