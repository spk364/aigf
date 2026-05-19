/**
 * Pure-type module — separated from `teasers.ts` so client components can
 * import this type without dragging `server-only` into the client bundle.
 */
export type PaywallTeaser = {
  name: string
  photoUrl: string
}
