import type { DegreeLevel, Job as ScoringJob, SeniorityLevel } from '@matchdesk/core';
import type Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * The recruiter's confirmed scoring spec for one job (ADR-035).
 *
 * This is the ENGINE layer: exactly `packages/core`'s `Job` minus `id`,
 * validated on every write and every read. The `job_requirements` table is
 * the separate DISPLAY layer (label + evidence span). Keeping them apart is
 * what lets the engine's input stay strictly typed while the UI shows
 * free-text requirement labels with source highlighting.
 */

const weight = z.number().min(0);

const SENIORITY_LEVELS = ['junior', 'mid', 'senior', 'lead', 'principal'] as const;
const DEGREE_LEVELS = [
  'high_school',
  'associate',
  'bachelor',
  'master',
  'doctorate',
  'professional',
] as const;

export const JobScoringConfigSchema = z
  .object({
    skills: z
      .object({
        weight,
        requirements: z.array(
          z.object({
            id: z.string().min(1),
            canonicalSkillId: z.string().min(1),
            label: z.string().min(1),
            mustHave: z.boolean(),
          }),
        ),
      })
      .optional(),
    experience: z
      .object({
        weight,
        requirement: z.object({
          minYears: z.number().min(0),
          mustHave: z.boolean().optional(),
        }),
      })
      .optional(),
    seniority: z
      .object({
        weight,
        requirement: z.object({
          level: z.enum(SENIORITY_LEVELS),
          mustHave: z.boolean().optional(),
        }),
      })
      .optional(),
    educationCerts: z
      .object({
        weight,
        requirement: z.object({
          minDegreeLevel: z.enum(DEGREE_LEVELS),
          mustHave: z.boolean().optional(),
          requiredCertifications: z.array(z.string().min(1)).optional(),
        }),
      })
      .optional(),
  })
  .strict();

export type JobScoringConfig = z.infer<typeof JobScoringConfigSchema>;

// Compile-time drift pins, both directions. If `packages/core` widens or
// narrows the `Job` shape, one of these stops compiling — the stored config
// can never silently diverge from what the engine accepts. `DeepRequired`
// strips optionality on both sides first, because zod's `.optional()` types
// keys as `T | undefined` while core types them as plain optionals, and
// under `exactOptionalPropertyTypes` those differ even when the runtime
// shapes are identical (JSON can never carry an `undefined` value).
type DeepRequired<T> = T extends readonly (infer E)[]
  ? readonly DeepRequired<E>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<Exclude<T[K], undefined>> }
    : T;
type _ConfigFeedsEngine =
  DeepRequired<JobScoringConfig> extends DeepRequired<Omit<ScoringJob, 'id'>> ? true : never;
type _EngineFitsConfig =
  DeepRequired<Omit<ScoringJob, 'id'>> extends DeepRequired<JobScoringConfig> ? true : never;
const _driftPins: [_ConfigFeedsEngine, _EngineFitsConfig] = [true, true];
void _driftPins;
// Enum drift is not caught by the structural pins above (a removed union
// member still satisfies `extends`), so pin the literal unions directly.
const _seniorityPin: readonly SeniorityLevel[] = SENIORITY_LEVELS;
const _degreePin: readonly DegreeLevel[] = DEGREE_LEVELS;
void _seniorityPin;
void _degreePin;

interface ConfigRow {
  job_id: string;
  config: string;
  created_at: string;
  updated_at: string;
}

/** Stores (or replaces) the confirmed scoring config for a job. */
export function upsertJobScoringConfig(
  db: Database.Database,
  jobId: string,
  config: JobScoringConfig,
): JobScoringConfig {
  const parsed = JobScoringConfigSchema.parse(config);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO job_scoring_configs (job_id, config, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
  ).run(jobId, JSON.stringify(parsed), now, now);
  return parsed;
}

/**
 * The confirmed config, or `null` when the recruiter has not confirmed one —
 * in which case the job is NOT scoreable, per PRODUCT_DECISIONS ("the
 * recruiter must review and confirm them before scoring"). Callers must treat
 * `null` as "do not score", never as "score with defaults".
 */
export function getJobScoringConfig(db: Database.Database, jobId: string): JobScoringConfig | null {
  const row = db
    .prepare<[string], ConfigRow>('SELECT * FROM job_scoring_configs WHERE job_id = ?')
    .get(jobId);
  if (row === undefined) return null;
  // Validated on read too: a row edited by hand in a sqlite shell must fail
  // loudly here rather than reach the engine.
  return JobScoringConfigSchema.parse(JSON.parse(row.config));
}

/** The full `ScoringJob` the engine takes, or `null` if unconfirmed. */
export function scoringJobFor(db: Database.Database, jobId: string): ScoringJob | null {
  const config = getJobScoringConfig(db, jobId);
  if (config === null) return null;
  // The cast bridges zod's `T | undefined` optionals to core's plain
  // optionals. Runtime-safe: the config round-trips through JSON, which
  // cannot carry `undefined`, so absent keys stay absent. The REAL safety is
  // the DeepRequired drift pins above — structural divergence between the two
  // shapes is a compile error there, not something this cast can hide.
  return { id: jobId, ...config } as ScoringJob;
}
