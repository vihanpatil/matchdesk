import { monotonicFactory } from 'ulid';

/**
 * IDs are ULIDs: lexicographically sortable by creation time (unlike a raw
 * UUIDv4), 26 chars, URL-safe. Every row created by this app uses this, and
 * repository `list*` queries sort by `id` as a tiebreaker when `created_at`
 * (millisecond resolution) collides.
 *
 * Uses `monotonicFactory` rather than the bare `ulid()` export: the plain
 * function fills its random component independently on every call, so two
 * IDs generated within the same millisecond are NOT guaranteed to sort in
 * generation order — confirmed by a real bug, not a hypothetical one (see
 * `candidateAttributes.test.ts`: two attributes inserted back-to-back in the
 * same millisecond came back in the wrong order under plain `ulid()`,
 * because "id ASC" as a tiebreaker assumed monotonicity that did not hold).
 * The monotonic factory increments the random component for same-millisecond
 * calls instead, which is exactly what a tiebreaker needs.
 */
const nextUlid = monotonicFactory();

export function generateId(): string {
  return nextUlid();
}
