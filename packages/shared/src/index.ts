/**
 * Cross-boundary constants and types.
 *
 * Anything here is shared by `core`, `server` and `web`, so it must stay
 * dependency-free and side-effect-free.
 */

/**
 * Bumped whenever a change alters computed scores. Persisted on every `matches`
 * row so a score can always be attributed to the engine that produced it
 * (Section 4, Section 10.3).
 */
export const ENGINE_VERSION = '0.0.0' as const;

/**
 * Embedding model, pinned to an exact revision rather than a floating tag
 * (Section 3.3). Persisted alongside every embedding and every match.
 *
 * Verified reachable 2026-08-12; fp32 ONNX weights are 90,387,606 bytes.
 * See ADR-002 in DECISIONS.md.
 */
export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2' as const;
export const EMBEDDING_MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9' as const;

/**
 * Decimal places every intermediate float is quantized to before it can affect
 * a score.
 *
 * ONNX Runtime float math is not bit-reproducible across CPU architecture,
 * thread count, or runtime version. Because a final score is `round(raw * 100)`,
 * an unmitigated drift of ~1e-7 can flip a boundary value (84.4999 -> 84 versus
 * 84.5001 -> 85). Quantizing to 6 dp makes scores stable against drift well
 * below that threshold. It does not make cross-architecture reproduction a
 * guarantee — see HONESTY_LOG.md.
 */
export const QUANTIZATION_DECIMALS = 6 as const;
