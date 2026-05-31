import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { notFound } from 'next/navigation'
import { ChatInterface } from '@/widgets/chat-interface/ChatInterface'
import { getTranslations } from 'next-intl/server'
import { getPaywallTeasers } from '@/widgets/paywall/teasers'
import { getPaywallBlock } from '@/widgets/paywall/admin-config'
import type { PaywallSurface } from '@/widgets/paywall/admin-config'
import type { ChatPaywallReason, ChatPaywallStrings } from '@/widgets/paywall'
import { PLANS } from '@/features/billing/plans'
import { getActiveExitIntentPromo } from '@/features/promotions/exit-intent-promo'
import { PHOTO_OPTION_GROUPS } from '@/features/chat/photo-options'
import type { PhotoComposerStrings } from '@/widgets/chat-interface/PhotoComposer'

type Props = {
  params: Promise<{ locale: string; conversationId: string }>
}

export default async function ConversationPage({ params }: Props) {
  const { locale, conversationId } = await params
  const user = await requireCompleteProfile()
  const payload = await getPayload({ config })
  const t = await getTranslations('chat')

  const conversation = await payload.findByID({ collection: 'conversations', id: conversationId }).catch(() => null)
  if (!conversation) notFound()

  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId

  if (String(convUserId) !== String(user.id)) notFound()

  const messagesResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
      ],
    },
    sort: 'createdAt',
    limit: 30,
  })

  const snapshot = conversation.characterSnapshot as { name?: string } | null

  // Look up the character's primary image so the chat header/avatars can
  // render the actual photo instead of a gradient initial. Best-effort —
  // if the character was deleted or the image is missing, the UI falls
  // back to the initial.
  const conversationCharacterId =
    typeof conversation.characterId === 'object' && conversation.characterId !== null
      ? (conversation.characterId as { id: string | number }).id
      : (conversation.characterId as string | number | undefined)

  let characterPhotoUrl: string | undefined
  if (conversationCharacterId) {
    try {
      const character = await payload.findByID({
        collection: 'characters',
        id: conversationCharacterId,
        depth: 1,
        overrideAccess: true,
      })
      const primary = character?.primaryImageId as unknown
      if (primary && typeof primary === 'object') {
        const url = (primary as { publicUrl?: unknown }).publicUrl
        if (typeof url === 'string' && url.length > 0) {
          characterPhotoUrl = url
        }
      }
    } catch {
      // ignore — photo is non-critical
    }
  }

  // Collect image and audio asset ids so we can batch-fetch their publicUrls
  // in a single media-assets query.
  const imageAssetIds: (string | number)[] = []
  const audioAssetIds: (string | number)[] = []
  for (const msg of messagesResult.docs) {
    if (msg.type === 'image' && msg.imageAssetId) {
      const assetId =
        typeof msg.imageAssetId === 'object' && msg.imageAssetId !== null
          ? (msg.imageAssetId as { id: string | number }).id
          : msg.imageAssetId
      if (assetId) imageAssetIds.push(assetId as string | number)
    }
    const audioRel = (msg as Record<string, unknown>).audioAssetId
    if (audioRel) {
      const audioId =
        typeof audioRel === 'object' && audioRel !== null && 'id' in audioRel
          ? ((audioRel as { id: string | number }).id)
          : (audioRel as string | number)
      if (audioId) audioAssetIds.push(audioId)
    }
  }

  // Fetch media-assets for image and audio messages.
  const assetMap = new Map<string, string>()
  const allAssetIds = [...imageAssetIds, ...audioAssetIds]
  if (allAssetIds.length > 0) {
    const assetsResult = await payload.find({
      collection: 'media-assets',
      where: { id: { in: allAssetIds.map(String) } },
      limit: allAssetIds.length,
      overrideAccess: true,
    })
    for (const asset of assetsResult.docs) {
      if (asset.publicUrl) {
        assetMap.set(String(asset.id), asset.publicUrl as string)
      }
    }
  }

  const initialMessages = messagesResult.docs.map((msg) => {
    const audioRel = (msg as Record<string, unknown>).audioAssetId
    const audioAssetId =
      audioRel && typeof audioRel === 'object' && 'id' in audioRel
        ? ((audioRel as { id: string | number }).id)
        : (audioRel as string | number | undefined)
    const audioUrl = audioAssetId ? assetMap.get(String(audioAssetId)) : undefined

    const base = {
      id: String(msg.id),
      role: msg.role as 'user' | 'assistant',
      content: msg.content ?? '',
      ...(audioUrl ? { audioUrl } : {}),
    }

    if (msg.type === 'image') {
      const assetId =
        typeof msg.imageAssetId === 'object' && msg.imageAssetId !== null
          ? (msg.imageAssetId as { id: string | number }).id
          : msg.imageAssetId
      const imageUrl = assetId ? assetMap.get(String(assetId)) : undefined
      return {
        ...base,
        type: 'image' as const,
        imageUrl,
        mediaAssetId: assetId as string | number | undefined,
      }
    }

    return base
  })

  // ─── Paywall plumbing ───────────────────────────────────────────────────
  // Per-reason copy is resolved server-side: admin CMS row first, then bundled
  // i18n. Carrying the promo code on the upgrade URL lets analytics attribute
  // chat-paywall-driven checkouts back to this surface even before CCBill
  // coupon support lands.
  const tPaywall = await getTranslations('chat.paywall')
  const tBilling = await getTranslations('billing.plans')
  const promo = getActiveExitIntentPromo()
  const upgradeUrl = `/${locale}/upgrade?promo=${promo.code}`
  const tokensUrl = `/${locale}/tokens`

  const reasonToSurface: Record<ChatPaywallReason, PaywallSurface> = {
    quota: 'chat_paywall_quota',
    tokens: 'chat_paywall_tokens',
    premium_feature: 'chat_paywall_premium',
  }
  const reasons: ChatPaywallReason[] = ['quota', 'tokens', 'premium_feature']
  const cmsBlocks = await Promise.all(
    reasons.map((r) => getPaywallBlock(reasonToSurface[r], locale)),
  )

  const stringsByReason = Object.fromEntries(
    reasons.map((reason, i) => {
      const cms = cmsBlocks[i]
      const value: ChatPaywallStrings = {
        badge: cms?.badge ?? tPaywall(`${reason}.badge`),
        headline: cms?.headline ?? tPaywall(`${reason}.headline`),
        subheadline: cms?.subheadline ?? tPaywall(`${reason}.subheadline`),
        perks: cms?.perks ?? [
          tPaywall('perks.unlimited'),
          tPaywall('perks.tokens'),
          tPaywall('perks.smarter'),
          tPaywall('perks.cancel'),
        ],
        monthlyLabel: tBilling('premium_monthly.name'),
        yearlyLabel: tBilling('premium_yearly.name'),
        yearlySaveLabel: tPaywall('yearlySaveLabel'),
        pricePerMonth: tPaywall('pricePerMonth'),
        pricePerYear: tPaywall('pricePerYear'),
        primaryCta: cms?.primaryCta ?? tPaywall('primaryCta'),
        secondaryCta: cms?.secondaryCta ?? tPaywall('secondaryCta'),
        decline: cms?.declineCta ?? tPaywall('decline'),
        close: tPaywall('close'),
      }
      return [reason, value]
    }),
  ) as Record<ChatPaywallReason, ChatPaywallStrings>

  // Single fallback teaser if the character lookup above didn't yield a photo —
  // grabs the first featured character so the modal still has eye candy.
  let fallbackTeaser: { name: string; photoUrl: string } | undefined
  if (!characterPhotoUrl) {
    const teasers = await getPaywallTeasers()
    fallbackTeaser = teasers[0]
  }

  // Photo composer strings — labels for every option in the catalog, resolved
  // from i18n so the chips render in the user's language (the prompt fragments
  // sent to the image pipeline stay English, see photo-options.ts).
  const tPhoto = await getTranslations('chat.photoComposer')
  const photoOptions: Record<string, string> = {}
  for (const g of PHOTO_OPTION_GROUPS) {
    for (const o of g.options) photoOptions[o.labelKey] = tPhoto(`options.${o.labelKey}`)
  }
  const photoComposer: PhotoComposerStrings = {
    title: tPhoto('title'),
    subtitle: tPhoto('subtitle'),
    groups: {
      outfit: tPhoto('groups.outfit'),
      pose: tPhoto('groups.pose'),
      setting: tPhoto('groups.setting'),
    },
    options: photoOptions,
    extraPlaceholder: tPhoto('extraPlaceholder'),
    send: tPhoto('send'),
    cancel: tPhoto('cancel'),
  }

  return (
    <ChatInterface
      photoComposer={photoComposer}
      initialConversationId={conversationId}
      initialMessages={initialMessages}
      locale={locale}
      characterName={snapshot?.name ?? 'Anna'}
      characterPhotoUrl={characterPhotoUrl}
      paywall={{
        upgradeUrl,
        tokensUrl,
        plans: {
          monthlyPriceCents: PLANS.premium_monthly.priceCents,
          yearlyPriceCents: PLANS.premium_yearly.priceCents,
          yearlySavePercent: 36,
        },
        stringsByReason,
        fallbackTeaser,
      }}
      strings={{
        typing: t('typing'),
        regenerate: t('regenerate'),
        copy: t('copy'),
        copied: 'Copied',
        inputPlaceholder: t('inputPlaceholder'),
        send: t('send'),
        errorGeneric: t('errorGeneric'),
        errorQuota: t('errorQuota'),
        upgradeCta: t('upgradeCta'),
        backToChats: t('backToChats'),
        backToHome: t('backToHome'),
        dashboard: t('dashboard'),
        gallery: t('gallery'),
        imagePending: t('imagePending'),
        imageQueuePosition: t('imageQueuePosition'),
        imageFailed: t('imageFailed'),
        askPhoto: t('quickActions.askPhoto'),
        askVoice: t('quickActions.askVoice'),
        askVideo: t('quickActions.askVideo'),
        photoCost: t('quickActions.photoCost'),
        voiceCost: t('quickActions.voiceCost'),
        videoCost: t('quickActions.videoCost'),
        tokensRemaining: t('quickActions.tokensRemaining'),
        videoSoon: t('quickActions.videoSoon'),
      }}
    />
  )
}
