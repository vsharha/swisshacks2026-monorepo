import { z } from "zod";
import {
  DriftAxisSchema,
  EventDate,
  RiskRatingSchema,
  Score,
} from "./common.ts";

/** A beneficial owner on the KYC baseline. */
export const BeneficialOwnerSchema = z.object({
  name: z.string().min(1),
  /** Ownership fraction in [0, 1], when known. */
  share: Score.optional(),
  role: z.string().optional(),
  /** Country of origin — ISO 3166-1 alpha-2 (e.g. "IR"), when known. */
  nationality: z
    .string()
    .regex(/^[A-Z]{2}$/, "nationality must be an ISO 3166-1 alpha-2 code")
    .optional(),
});
export type BeneficialOwner = z.infer<typeof BeneficialOwnerSchema>;

/**
 * The KYC baseline a customer was onboarded under — the assumptions that drift
 * can invalidate. Baseline embeddings are computed once (cheap persistent
 * state) so Stage 1 can measure cosine distance per axis without re-encoding.
 */
export const KYCBaselineSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  legalForm: z.string().optional(),
  /** Domicile — ISO country code or jurisdiction name. */
  jurisdiction: z.string().min(1),
  /** What the company does, as captured at onboarding. */
  businessModel: z.string().min(1),
  beneficialOwners: z.array(BeneficialOwnerSchema).default([]),
  riskRating: RiskRatingSchema,
  onboardedAt: EventDate,

  // --- External identifiers (used by connectors) ---
  /** EventRegistry entity concept URI. */
  conceptUri: z.string().optional(),
  /** SEC EDGAR Central Index Key. */
  cik: z.string().optional(),
  /** Legal Entity Identifier (GLEIF). */
  lei: z.string().optional(),
  /** Primary website (for Wayback business-activity drift). */
  domain: z.url().optional(),

  // --- Cheap persistent state, computed once ---
  /** Whole-entity baseline embedding. */
  baselineEmbedding: z.array(z.number()).optional(),
  /** Per-axis baseline embeddings, for axis-scoped cosine distance. */
  axisEmbeddings: z.partialRecord(DriftAxisSchema, z.array(z.number())).optional(),
});
export type KYCBaseline = z.infer<typeof KYCBaselineSchema>;
