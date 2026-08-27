import { z } from "zod";

/**
 * A single level on the KYC risk-rating scale. The scale is fully user-defined:
 * an institution can rename levels, recolour them, reorder them, and add or
 * remove levels to match its own risk taxonomy.
 *
 * - `id` is the stable value stored on baselines and in the audit log.
 * - `label` is the human-facing name shown in the report.
 * - `color` is any CSS colour string (hex from the picker, or a `var(--…)` token).
 */
export const RatingLevelSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "id must be lowercase letters, numbers, - or _"),
  label: z.string().min(1),
  color: z.string().min(1),
});
export type RatingLevel = z.infer<typeof RatingLevelSchema>;

/**
 * The ordered rating scale — lowest risk first, highest risk last. Order is
 * meaningful: the top level is what an approved escalation raises a customer to.
 */
export const RatingConfigSchema = z.object({
  levels: z.array(RatingLevelSchema).min(1),
});
export type RatingConfig = z.infer<typeof RatingConfigSchema>;

/** The scale used until an institution customises its own. */
export const DEFAULT_RATING_CONFIG: RatingConfig = {
  levels: [
    { id: "low", label: "Low", color: "#3f9e6d" },
    { id: "medium", label: "Medium", color: "#d19a34" },
    { id: "high", label: "High", color: "#cf5347" },
  ],
};

/** The level with this id, or undefined if it is not on the scale. */
export function ratingLevel(config: RatingConfig, id: string): RatingLevel | undefined {
  return config.levels.find((l) => l.id === id);
}

/** Human label for a rating id, falling back to the raw id for unknown values. */
export function ratingLabel(config: RatingConfig, id: string): string {
  return ratingLevel(config, id)?.label ?? id;
}

/** Display colour for a rating id, falling back to a muted token. */
export function ratingColor(config: RatingConfig, id: string): string {
  return ratingLevel(config, id)?.color ?? "var(--muted2)";
}

/** The highest-risk level on the scale — the target of an approved escalation. */
export function topRating(config: RatingConfig): RatingLevel {
  const last = config.levels.at(-1);
  if (!last) throw new Error("rating scale has no levels");
  return last;
}
