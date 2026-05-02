import 'server-only'
import { getPayload } from 'payload'
import config from '@payload-config'
import { readGuestDraft, clearGuestDraft } from './guest-cookie'

const MAX_PREVIEW_AGE_HOURS = 24

export type ClaimResult =
  | { claimed: true; draftId: string }
  | { claimed: false }

/**
 * Adopts a signed guest builder cookie for the freshly authenticated user:
 * creates a `character-drafts` row, transfers ownership of the preview
 * media-assets, and clears the cookie. Safe no-op when no cookie is present.
 */
export async function claimGuestDraftForUser(userId: string | number): Promise<ClaimResult> {
  const guest = await readGuestDraft()
  if (!guest) return { claimed: false }
  if (!guest.previews.length) {
    await clearGuestDraft()
    return { claimed: false }
  }

  const payload = await getPayload({ config })
  const now = Date.now()
  const cutoff = now - MAX_PREVIEW_AGE_HOURS * 60 * 60 * 1000

  // Validate each preview asset exists, is unowned, recent, and of kind preview.
  // We rebuild the previewGenerations list from the DB rows (so attackers can't
  // smuggle arbitrary URLs through the cookie — the asset row is the source of
  // truth, the cookie just signs the IDs).
  const validatedPreviews: Array<{
    mediaAssetId: string
    publicUrl: string
    promptUsed: string
    generatedAt: string
    selectedAsReference: boolean
  }> = []
  let validatedSelectedId: string | null = null

  for (const preview of guest.previews) {
    let asset: Record<string, unknown> | null = null
    try {
      asset = (await payload.findByID({
        collection: 'media-assets',
        id: preview.mediaAssetId,
        overrideAccess: true,
      })) as Record<string, unknown>
    } catch {
      continue
    }
    if (!asset) continue
    if (asset.kind !== 'character_preview') continue
    if (asset.ownerUserId) continue
    const createdAt = typeof asset.createdAt === 'string' ? Date.parse(asset.createdAt) : NaN
    if (!Number.isFinite(createdAt) || createdAt < cutoff) continue

    validatedPreviews.push({
      mediaAssetId: String(asset.id),
      publicUrl: String(asset.publicUrl ?? preview.publicUrl),
      promptUsed: '',
      generatedAt: preview.generatedAt,
      selectedAsReference: guest.selectedMediaAssetId === preview.mediaAssetId,
    })
    if (guest.selectedMediaAssetId === preview.mediaAssetId) {
      validatedSelectedId = String(asset.id)
    }
  }

  if (validatedPreviews.length === 0) {
    await clearGuestDraft()
    return { claimed: false }
  }

  // Transfer ownership of all valid preview assets.
  for (const preview of validatedPreviews) {
    try {
      await payload.update({
        collection: 'media-assets',
        id: preview.mediaAssetId,
        data: { ownerUserId: userId },
        overrideAccess: true,
      })
    } catch {
      // Best-effort — continue even if one asset fails to transfer.
    }
  }

  const draftDataPayload: Record<string, unknown> = { appearance: guest.appearance }
  if (validatedSelectedId) {
    draftDataPayload.selectedReferenceMediaAssetId = validatedSelectedId
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const draft = await payload.create({
    collection: 'character-drafts',
    data: {
      userId,
      language: guest.language,
      // If they already picked a face, jump them straight to identity (step 2).
      // Otherwise leave them on appearance (step 1) to pick one.
      currentStep: validatedSelectedId ? 2 : 1,
      data: draftDataPayload,
      previewGenerations: validatedPreviews,
      expiresAt,
    },
    overrideAccess: true,
  })

  await clearGuestDraft()

  return { claimed: true, draftId: String(draft.id) }
}
