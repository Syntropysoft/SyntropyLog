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
  fn.white = add(37);
  fn.bold = add(1);
  fn.red = add(31);
  fn.bgRed = add(41);
  fn.yellow = add(33);
  fn.cyan = add(36);
  fn.green = add(32);
  fn.gray = add(90);
  fn.magenta = add(35);
  fn.blue = add(34);
  fn.bgWhite = add(47);
  fn.dim = add(2);
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
