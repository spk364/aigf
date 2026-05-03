/**
 * Image safety classifier — STUB.
 *
 * Real implementation will run an apparent-age + NSFW classifier on the
 * generated asset (likely fal.ai NSFW filter or a self-hosted CLIP head)
 * before the asset reaches the user. For now we always pass; the integration
 * point is structured so swapping the body later does not change call-sites.
 *
 * Returning `flagged: false` matches our threat model for the MVP since the
 * upstream image model already enforces the negative-prompt constraints.
 * When the real classifier is wired up, set `reason` to a short label
 * ('apparent_minor', 'csam_lookalike', 'gore', etc.) so it's queryable in
 * audit logs and we can break down safety_refund metrics by class.
 */

export type SafetyVerdict =
  | { flagged: false }
  | { flagged: true; reason: string }

export type ClassifyImageInput = {
  imageUrl: string
  contentRating?: 'sfw' | 'nsfw_soft' | 'nsfw_explicit'
  width?: number
  height?: number
}

export async function classifyImageSafety(
  input: ClassifyImageInput,
): Promise<SafetyVerdict> {
  void input
  return { flagged: false }
}
