/**
 * GF(2^3) in the polynomial basis defined by z^3 + z + 1.
 *
 * Elements are the three-bit coefficient vectors 0babc = az^2 + bz + c.
 * Addition and subtraction are XOR. Multiplication is carryless polynomial
 * multiplication reduced by the irreducible polynomial 0b1011.
 */

export type GF8 = number;

export const GF8_SIZE = 8;
export const GF8_MODULUS = 0b1011;
export const GF8_BITS = 3;

export function assertGF8(value: number, name = 'field element'): asserts value is GF8 {
  if (!Number.isInteger(value) || value < 0 || value >= GF8_SIZE) {
    throw new RangeError(`${name} must be an integer in [0, 7]`);
  }
}

export function gf8Add(a: GF8, b: GF8): GF8 {
  assertGF8(a, 'a');
  assertGF8(b, 'b');
  return a ^ b;
}

/** Carryless multiplication followed by reduction modulo z^3 + z + 1. */
export function gf8Mul(a: GF8, b: GF8): GF8 {
  assertGF8(a, 'a');
  assertGF8(b, 'b');

  let multiplicand = a;
  let multiplier = b;
  let product = 0;

  for (let bit = 0; bit < GF8_BITS; bit += 1) {
    if ((multiplier & 1) !== 0) product ^= multiplicand;
    multiplier >>>= 1;
    multiplicand <<= 1;
    if ((multiplicand & 0b1000) !== 0) multiplicand ^= GF8_MODULUS;
  }

  return product & 0b111;
}

export function gf8Pow(base: GF8, exponent: number): GF8 {
  assertGF8(base, 'base');
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError('exponent must be a non-negative safe integer');
  }

  let result: GF8 = 1;
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if ((remaining & 1) !== 0) result = gf8Mul(result, factor);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) factor = gf8Mul(factor, factor);
  }
  return result;
}

export function gf8Inv(value: GF8): GF8 {
  assertGF8(value, 'value');
  if (value === 0) throw new RangeError('zero has no multiplicative inverse');
  // Every non-zero element of GF(8) has order dividing seven.
  return gf8Pow(value, GF8_SIZE - 2);
}

export function gf8Div(numerator: GF8, denominator: GF8): GF8 {
  assertGF8(numerator, 'numerator');
  assertGF8(denominator, 'denominator');
  return gf8Mul(numerator, gf8Inv(denominator));
}

export interface GF8Line {
  readonly constant: GF8;
  readonly slope: GF8;
}

export function gf8EvalLine(line: GF8Line, x: GF8): GF8 {
  assertGF8(line.constant, 'line.constant');
  assertGF8(line.slope, 'line.slope');
  assertGF8(x, 'x');
  return gf8Add(line.constant, gf8Mul(line.slope, x));
}

/** Interpolate the unique degree-at-most-one polynomial through two points. */
export function gf8InterpolateLine(x1: GF8, y1: GF8, x2: GF8, y2: GF8): GF8Line {
  assertGF8(x1, 'x1');
  assertGF8(y1, 'y1');
  assertGF8(x2, 'x2');
  assertGF8(y2, 'y2');
  if (x1 === x2) throw new RangeError('interpolation points must be distinct');

  // In characteristic two, subtraction is the same operation as addition.
  const slope = gf8Div(gf8Add(y1, y2), gf8Add(x1, x2));
  const constant = gf8Add(y1, gf8Mul(slope, x1));
  return { constant, slope };
}
