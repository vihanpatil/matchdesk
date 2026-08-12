import { z } from 'zod';

/**
 * `warnings` columns store a JSON array of human-readable strings (Section
 * 4 design note in migrations/0001_core_tables.sql). Parsing always
 * validates shape — a corrupt column value throws rather than silently
 * becoming `[]` (rule 0.2.4: never swallow).
 */
const WarningsSchema = z.array(z.string());

export function serializeWarnings(warnings: readonly string[]): string {
  return JSON.stringify(WarningsSchema.parse(warnings));
}

export function parseWarnings(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  return WarningsSchema.parse(parsed);
}
