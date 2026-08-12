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
export function roundHalfUp(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundHalfUp: value must be finite, received ${String(value)}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15) {
    throw new RangeError(
      `roundHalfUp: decimals must be an integer in [0, 15], received ${String(decimals)}`,
    );
  }

  const factor = 10 ** decimals;
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
