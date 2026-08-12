import { z } from 'zod';

/**
 * Zod schemas validated at the repository boundary (Section: typed
 * repository functions over the DB, zod-validated at the boundary).
 * Two directions are validated:
 *  - inputs, before anything touches SQLite;
 *  - rows read back out, so a hand-edited or migration-drifted DB value is
 *    caught as a thrown error rather than silently handed to a caller as an
 *    incorrectly-typed value.
 */

export const ParseStatusSchema = z.enum(['ok', 'needs_attention', 'failed']);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase 64-char hex SHA-256');

// ---- candidates ----------------------------------------------------------

export const CandidateSchema = z.object({
  id: z.string().min(1),
  fileSha256: sha256HexSchema,
  originalFilename: z.string().min(1),
  rawText: z.string(),
  parseStatus: ParseStatusSchema,
  parseConfidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string()),
  language: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const CreateCandidateInputSchema = z.object({
  fileBytes: z.instanceof(Buffer).refine((b) => b.length > 0, 'fileBytes must not be empty'),
  originalFilename: z.string().min(1),
  rawText: z.string(),
  parseStatus: ParseStatusSchema,
  parseConfidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string()),
  language: z.string().nullable(),
});
export type CreateCandidateInput = z.infer<typeof CreateCandidateInputSchema>;

// ---- jobs -----------------------------------------------------------------

export const JobSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  fileSha256: sha256HexSchema,
  rawText: z.string(),
  parseStatus: ParseStatusSchema,
  parseConfidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string()),
  language: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

export const CreateJobInputSchema = z.object({
  title: z.string().min(1),
  fileBytes: z.instanceof(Buffer).refine((b) => b.length > 0, 'fileBytes must not be empty'),
  originalFilename: z.string().min(1),
  rawText: z.string(),
  parseStatus: ParseStatusSchema,
  parseConfidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string()),
  language: z.string().nullable(),
});
export type CreateJobInput = z.infer<typeof CreateJobInputSchema>;

// ---- job_requirements -------------------------------------------------------

export const JobRequirementSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  label: z.string().min(1),
  isHardRequirement: z.boolean(),
  evidenceStart: z.number().int().nonnegative().nullable(),
  evidenceEnd: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

export const CreateJobRequirementInputSchema = z
  .object({
    jobId: z.string().min(1),
    label: z.string().min(1),
    isHardRequirement: z.boolean(),
    evidenceStart: z.number().int().nonnegative().nullable(),
    evidenceEnd: z.number().int().nonnegative().nullable(),
  })
  .refine(
    (v) => (v.evidenceStart === null) === (v.evidenceEnd === null),
    'evidenceStart and evidenceEnd must both be null or both be set',
  )
  .refine(
    (v) => v.evidenceStart === null || v.evidenceEnd === null || v.evidenceStart <= v.evidenceEnd,
    'evidenceStart must not be greater than evidenceEnd',
  );
export type CreateJobRequirementInput = z.infer<typeof CreateJobRequirementInputSchema>;

// ---- candidate_attributes ---------------------------------------------------

export const CandidateAttributeSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  attributeType: z.string().min(1),
  value: z.string().min(1),
  evidenceStart: z.number().int().nonnegative().nullable(),
  evidenceEnd: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CandidateAttribute = z.infer<typeof CandidateAttributeSchema>;

export const CreateCandidateAttributeInputSchema = z
  .object({
    candidateId: z.string().min(1),
    attributeType: z.string().min(1),
    value: z.string().min(1),
    evidenceStart: z.number().int().nonnegative().nullable(),
    evidenceEnd: z.number().int().nonnegative().nullable(),
  })
  .refine(
    (v) => (v.evidenceStart === null) === (v.evidenceEnd === null),
    'evidenceStart and evidenceEnd must both be null or both be set',
  )
  .refine(
    (v) => v.evidenceStart === null || v.evidenceEnd === null || v.evidenceStart <= v.evidenceEnd,
    'evidenceStart must not be greater than evidenceEnd',
  );
export type CreateCandidateAttributeInput = z.infer<typeof CreateCandidateAttributeInputSchema>;

// ---- matches ----------------------------------------------------------------

export const MatchSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  score: z.number().nullable(),
  engineVersion: z.string().nullable(),
  embeddingModelRevision: z.string().nullable(),
  computedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Match = z.infer<typeof MatchSchema>;

export const UpsertMatchInputSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  score: z.number().nullable(),
  engineVersion: z.string().nullable(),
  embeddingModelRevision: z.string().nullable(),
  computedAt: z.string().nullable(),
});
export type UpsertMatchInput = z.infer<typeof UpsertMatchInputSchema>;

// ---- audit_log ----------------------------------------------------------------

export const AuditLogEntrySchema = z.object({
  id: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  details: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AppendAuditLogInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  details: z.string().nullable(),
});
export type AppendAuditLogInput = z.infer<typeof AppendAuditLogInputSchema>;
