import { QUANTIZATION_DECIMALS } from '@matchdesk/shared';

/**
 * The project's single rounding strategy (Section 6.4: "use a fixed float
 * rounding strategy; document it"). Every score-affecting rounding in the
 * engine goes through this function — never `Math.round`, never `toFixed`.
 *
 * Semantics: **half-up**, meaning exact ties round toward positive infinity.
 * `0.5 -> 1`, `1.5 -> 2`, and `-0.5 -> -0` (not `-1`). This is the behaviour
 * Section 6.4 specifies. Scores are non-negative, so the negative-tie case
 * never arises in practice, but it is defined and tested rather than left
 * to chance.
 *
 * Why not `Math.round(v * f) / f` alone: binary floating point stores many
 * decimal values slightly low, so the naive form rounds some exact ties the
 * wrong way. `1.005 * 100` is `100.49999999999999`, which naively yields
 * `1.00` instead of `1.01`. Re-reading the scaled value at 15 significant
 * digits — below the ~17 digits where the representation error lives, above
 * any precision the engine actually uses — restores the intended decimal
 * value before the tie is broken.
 *
 * @param value    Finite number to round.
 * @param decimals Decimal places to keep. Integer in [0, 15].
 * @throws RangeError on a non-finite `value` or an out-of-range `decimals`,
 *         rather than silently returning `NaN` (rule 0.2.4: never swallow).
 */
/**
 * Exact powers of ten for every `decimals` this function accepts, [0, 15].
 *
 * **Why a table instead of `10 ** decimals` (H-076).** `**` is ECMAScript's
 * `Number::exponentiate`, which the spec leaves implementation-approximated —
 * the same latitude as `Math.pow`. It was the ONLY operation in the entire
 * scoring path not required to be correctly rounded, and it sat inside
 * `quantize`, which is the mitigation ADR-009 introduced for H-002's
 * cross-machine drift. The mitigation was built from the one primitive with no
 * cross-platform guarantee.
 *
 * In practice every engine returns these exactly. "In practice" is not a
 * guarantee, this project's history is defects that survived because a check
 * was absent, and the cost of removing the doubt is sixteen literals. Every
 * value here is below 2^53 and therefore exactly representable.
 */
const POWERS_OF_TEN: readonly number[] = [
  1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000,
  100000000000, 1000000000000, 10000000000000, 100000000000000, 1000000000000000,
];

export function roundHalfUp(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundHalfUp: value must be finite, received ${String(value)}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15) {
    throw new RangeError(
      `roundHalfUp: decimals must be an integer in [0, 15], received ${String(decimals)}`,
    );
  }

  const factor = POWERS_OF_TEN[decimals] ?? 1;
  const scaled = value * factor;

  // Guard the correction step: toPrecision throws outside its own domain, and
  // very large magnitudes have no fractional part left to round anyway.
  if (!Number.isFinite(scaled) || Math.abs(scaled) >= 1e15) {
    return value;
  }

  const corrected = Number(scaled.toPrecision(15));
  return Math.floor(corrected + 0.5) / factor;
}

/**
 * Collapses a float to the engine's canonical precision
 * ({@link QUANTIZATION_DECIMALS} dp) so that hardware-level float drift cannot
 * propagate into a score. Applied to embedding components, cosine similarities
 * and dimension subscores before they are combined.
 */
export function quantize(value: number): number {
  return roundHalfUp(value, QUANTIZATION_DECIMALS);
}
