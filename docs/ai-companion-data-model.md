# Data Model — AI Companion SaaS

Production-ready data model для AI Companion веб-приложения с поддержкой text chat, image generation, character builder, multilingual UI (EN/RU/ES), tier-based billing.

**Стек:** Payload CMS v3 + PostgreSQL 16 + pgvector extension.

**Принципы:**
- Soft delete для всех пользовательских данных (`deletedAt: timestamp | null`)
- Денежные суммы хранятся в центах как integer
- Append-only ledger для финансовых данных, кешированный balance для быстрого чтения
- Snapshot-based консистентность для conversations (изменения characters не ломают активные диалоги)
- Все hot-таблицы партиционируются для будущего масштабирования

---

## Обзор коллекций

17 коллекций в 7 функциональных кластерах:

```
USER & AUTH              CHARACTERS                CONVERSATIONS
├── users                ├── characters            ├── conversations
└── age_verifications    ├── character_appearance_ ├── messages
                         │   presets               └── memory_entries
BILLING                  └── character_drafts
├── subscriptions
├── token_balances       MEDIA                     SAFETY & AUDIT
├── token_transactions   └── media_assets          ├── safety_incidents
├── token_packages                                 ├── content_flags
├── payment_transactions SYSTEM                    └── audit_logs
└── payment_webhooks     ├── system_prompts
                         └── feature_flags
```

---

## 1. User & Auth

### `users`

Ядро аутентификации, управляется Payload Auth.

```typescript
{
  id: uuid (pk)
  email: string (unique, indexed)
  emailVerified: boolean
  emailVerifiedAt: timestamp | null

  // Auth
  passwordHash: string (managed by Payload)
  googleId: string | null (unique, indexed)

  // Profile
  displayName: string | null
  avatarUrl: string | null
  timezone: string                              // IANA timezone
  locale: 'en' | 'ru' | 'es'                    // UI язык
  preferredLanguage: 'en' | 'ru' | 'es' | 'auto' // язык общения с AI

  // Age verification (legally required)
  dateOfBirth: date                             // required
  ageVerifiedAt: timestamp
  ageVerificationMethod: 'self_declaration' | 'id_check' | null

  // Content preferences
  nsfwEnabled: boolean                          // master switch, default false
  nsfwEnabledAt: timestamp | null

  // Status
  status: 'active' | 'suspended' | 'banned' | 'deleted'
  suspensionReason: string | null
  suspendedUntil: timestamp | null

  // Metadata
  createdAt: timestamp
  updatedAt: timestamp
  lastActiveAt: timestamp
  deletedAt: timestamp | null

  // Denormalized counters
  totalMessagesCount: integer
  charactersCreatedCount: integer
}
```

**Indexes:**
- `email` (unique)
- `googleId` (unique)
- `status, deletedAt`
- `lastActiveAt` (для retention analytics)

### `age_verifications`

Аудит-лог возрастных проверок. Отдельная таблица — компрометация `users` не должна стирать evidence.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)

  method: 'self_declaration' | 'dob_confirmation' | 'id_upload'
  verifiedAt: timestamp
  ipAddress: string
  userAgent: string
  dateOfBirthProvided: date
  evidence: jsonb                               // для id_upload — encrypted ref
}
```

**Retention:** 7 лет (legal requirement).

---

## 2. Characters

### `characters`

Главная сущность. Поддерживает multilingual preset characters через `localeGroupId`.

```typescript
{
  id: uuid (pk)

  // Type
  kind: 'preset' | 'custom'
  createdBy: uuid | null (fk → users)           // null для preset

  // Localization
  language: 'en' | 'ru' | 'es'                  // язык, на котором персонаж разговаривает
  localeGroupId: string | null                  // null для custom; для preset — общий ID
  // Пример: персонаж "Anna" имеет 3 записи с одним localeGroupId,
  // одна на язык. UI показывает запись соответствующую user.locale.

  // Identity
  name: string
  slug: string | null                           // для preset — для красивого URL
  tagline: string                               // короткий hook
  shortBio: string                              // 2-3 предложения для каталога

  // Visual
  primaryImageId: uuid (fk → media_assets)      // reference image для IP-Adapter
  galleryImageIds: uuid[] (fk → media_assets[]) // 3-5 дополнительных
  artStyle: 'realistic' | 'anime' | '3d_render' | 'stylized'

  // Image generation configuration
  imageModel: jsonb {
    primary: string                             // 'cyberrealistic_pony' | 'pony_v7' | etc
    fallback: string | null
  }

  // Appearance (structured data + assembled prompts)
  appearance: jsonb {
    ethnicity: string
    ageRange: 'young_adult' | 'adult' | 'mature' | 'experienced'
    ageDisplay: integer                         // >= 21 (hard constraint)
    bodyType: 'slender' | 'average' | 'curvy' | 'voluptuous'
    hair: { color: string, length: string, style: string }
    eyes: { color: string }
    features: string[]                          // freckles, tattoos, etc.

    // Pre-assembled prompts
    appearancePrompt: text                      // полный SD prompt с правильными tags
    appearancePromptShort: text                 // короткая версия для частых re-uses
    negativePrompt: text
    safetyAdultMarkers: string[]                // принудительные adult markers
    // Примеры: ['mature woman', 'curvy', '28 years old', 'voluptuous']
    // Эти теги добавляются в каждый image generation request системно
  }

  // Personality
  archetype: string                             // slug из справочника
  personalityTraits: jsonb {
    shyBold: integer                            // 1-10
    playfulSerious: integer
    submissiveDominant: integer
    romanticCasual: integer
    sweetSarcastic: integer
    traditionalAdventurous: integer
  }

  // Communication style
  communicationStyle: jsonb {
    formality: 'formal' | 'casual' | 'intimate'
    messageLength: 'short' | 'medium' | 'long'
    emojiUsage: 'frequent' | 'occasional' | 'none'
    petNamesForUser: string[]
    languageMixing: boolean
  }

  // Backstory
  backstory: jsonb {
    occupation: string
    location: string | null
    interests: string[]
    fullBio: text
    howYouMet: string
    relationshipStage: 'just_met' | 'dating' | 'relationship' | 'long_term'
    keyMemories: string[]
  }

  // System prompt (assembled from above fields)
  systemPrompt: text
  systemPromptVersion: integer                  // increments при каждой переassemble

  // Content classification
  contentRating: 'sfw' | 'nsfw_soft' | 'nsfw_explicit'
  tags: string[]                                // для фильтрации в каталоге

  // User content preferences (для custom characters)
  userContentPreferences: jsonb | null {
    contentIntensity: 'sfw' | 'mild' | 'explicit'
    preferredDynamic: string
    hardLimits: string[]                        // что персонаж НЕ делает
  }

  // Moderation
  moderationStatus: 'pending' | 'approved' | 'rejected' | 'flagged'
  moderatedAt: timestamp | null
  moderatedBy: uuid | null (fk → users)
  rejectionReason: string | null

  // Publishing
  isPublished: boolean                          // true для preset, false для custom
  publishedAt: timestamp | null
  displayOrder: integer | null
  featured: boolean                             // featured в authenticated catalog

  // Public landing showcase (см. spec §3.2.1)
  // Отдельный флаг от `featured`: позволяет продюсеру независимо тасовать
  // набор для pre-auth лендинга (всегда SFW), не затрагивая внутренний featured.
  landingFeatured: boolean                      // показывать на главной до signup
  landingOrder: integer | null                  // порядок именно для лендинга

  // Analytics
  conversationCount: integer
  messageCount: integer

  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp | null
}
```

**Indexes:**
- `localeGroupId, language` (для подбора по UI языку)
- `language, kind, isPublished` (каталог на нужном языке)
- `createdBy, deletedAt` (для "My Characters")
- `kind, isPublished, displayOrder` (каталог preset)
- `contentRating, isPublished` (SFW/NSFW фильтр)
- `landingFeatured, language, landingOrder` (public landing showcase, см. spec §3.2.1)
- GIN index по `tags` (array contains)
- `moderationStatus` (админская очередь)

### `character_appearance_presets`

Справочник опций для character builder. Управляется через админку.

```typescript
{
  id: uuid (pk)

  category: 'ethnicity' | 'body_type' | 'hair_color' | 'hair_style' | 'eye_color' | 'feature'
  slug: string                                  // 'european', 'curvy', 'blonde'

  displayName: { en: string, ru: string, es: string }
  promptFragment: string                        // что добавляется в SD prompt
  negativePromptFragment: string | null
  previewImageUrl: string | null                // для UI

  artStyle: 'realistic' | 'anime' | 'all'      // специфичен стилю или универсален
  displayOrder: integer
  isActive: boolean
}
```

### `character_drafts`

Незавершённые персонажи в builder'е. TTL-cleanup через cron.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)
  language: 'en' | 'ru' | 'es'                 // язык создаваемого персонажа

  currentStep: 1 | 2 | 3 | 4

  data: jsonb {                                 // та же структура что в characters
    appearance: { ... }
    identity: { ... }
    personality: { ... }
    backstory: { ... }
  }

  // Preview generation history
  previewGenerations: jsonb[] {
    mediaAssetId: uuid
    promptUsed: string
    generatedAt: timestamp
    selectedAsReference: boolean
  }

  createdAt: timestamp
  updatedAt: timestamp
  expiresAt: timestamp                          // TTL: 7 дней неактивности
}
```

---

## 3. Conversations

### `conversations`

Активный диалог user × character. Содержит character snapshot для консистентности.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)
  characterId: uuid (fk → characters)

  // Character snapshot — критично для консистентности
  // Изменения characters не ломают активные диалоги
  characterSnapshot: jsonb {
    systemPrompt: text
    name: string
    personalityTraits: { ... }
    backstory: { ... }
    imageModel: { primary: string, fallback: string | null }
  }
  snapshotVersion: integer                      // matches character.systemPromptVersion на момент snapshot

  // LLM configuration
  llmConfig: jsonb {
    provider: 'openrouter' | 'deepseek_direct'
    model: string                               // 'deepseek/deepseek-chat-v3' | etc
    tier: 'standard' | 'premium' | 'premium_plus'
    temperature: number                         // 1.0-1.4 для creative RP
    maxTokens: integer                          // обычно 500-800
    snapshotAt: timestamp
  }

  // Conversation language
  language: 'en' | 'ru' | 'es'                 // язык общения
  languageDetectedAt: timestamp | null
  languageManuallySet: boolean

  // Status
  status: 'active' | 'archived'

  // Running state
  summary: text | null                          // компрессированная история далёких сообщений
  summaryUpToMessageId: uuid | null
  summaryUpdatedAt: timestamp | null

  // Denormalized for performance
  messageCount: integer
  lastMessageAt: timestamp
  lastMessagePreview: string

  // Light gamification
  relationshipScore: integer                    // 0-100, влияет на tone

  createdAt: timestamp
  updatedAt: timestamp
  deletedAt: timestamp | null
}
```

**Indexes:**
- `userId, status, deletedAt, lastMessageAt DESC` (основной запрос — список чатов)
- `userId, characterId` (проверка существования conversation)

### `messages`

Hot-таблица. Append-mostly. Самый высокий рост.

```typescript
{
  id: uuid (pk)
  conversationId: uuid (fk → conversations)

  // Role & content type
  role: 'user' | 'assistant' | 'system'
  type: 'text' | 'image' | 'video' | 'image_request' | 'video_request' | 'action'

  // Content (одно из, в зависимости от type)
  content: text | null                          // для text
  imageAssetId: uuid | null (fk → media_assets) // для image
  videoAssetId: uuid | null (fk → media_assets) // для video

  // Generation metadata (только для assistant messages)
  generationMetadata: jsonb | null {
    // LLM fields
    model: string                               // 'deepseek/deepseek-chat-v3'
    provider: 'openrouter' | 'deepseek_direct' | 'fal' | 'replicate'
    tokensInput: integer
    tokensOutput: integer
    temperature: number
    latencyMs: integer
    timeToFirstTokenMs: integer | null          // для streaming аналитики
    cost: integer                               // в десятых долях цента

    // Image fields
    imagePromptUsed: string | null
    referenceImageId: uuid | null
    imageModel: string | null
    ipAdapterWeight: number | null

    // Video fields
    videoModel: string | null                   // 'wan-2.2' | etc
    videoDurationSec: number | null
    videoResolution: string | null              // '720p' | '1080p'
    videoSourceImageId: uuid | null             // для image-to-video
  }

  // User-side accounting
  userTokensSpent: integer
  spendType: 'free' | 'subscription' | 'image' | 'video' |
             'regeneration_image' | 'regeneration_video'

  // Regeneration tracking
  regeneratedFromId: uuid | null (fk → messages)
  isRegenerated: boolean                        // если был regenerated (есть дочерний)

  // Safety
  safetyFlags: jsonb | null {
    inputFlagged: boolean
    outputFlagged: boolean
    flagReasons: string[]
    inputClassifierScores: { ... }              // detailed scores
    outputClassifierScores: { ... }
  }

  // Status
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'flagged'
  errorReason: string | null

  createdAt: timestamp
  completedAt: timestamp | null
  deletedAt: timestamp | null                   // soft delete (юзер удалил своё)
}
```

**Indexes:**
- `conversationId, createdAt ASC, deletedAt` (основной запрос — история чата)
- `conversationId, role, createdAt` (для memory extraction — только user/assistant)
- `regeneratedFromId` (regeneration tree)

### `memory_entries`

Long-term memory — извлечённые факты с pgvector embeddings.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)
  characterId: uuid (fk → characters)           // память персонажно-специфичная
  conversationId: uuid (fk → conversations) | null
  sourceMessageId: uuid (fk → messages) | null

  // Content
  content: text                                 // "User's name is Ivan and works as frontend lead"
  category: 'personal_info' | 'preference' | 'event' | 'relationship' | 'sensitive'
  importance: integer                           // 1-10, управляет retrieval ranking
  sourceLanguage: 'en' | 'ru' | 'es'           // язык исходного сообщения

  // Vector search
  embedding: vector(1536)                       // pgvector
  embeddingModel: string                        // для re-indexing при смене модели

  // Lifecycle
  extractedAt: timestamp
  lastAccessedAt: timestamp                     // для cleanup unused entries
  accessCount: integer

  // User control
  userVerified: boolean                         // юзер подтвердил/отредактировал
  userEditable: boolean                         // показывать в "What I know about you"

  deletedAt: timestamp | null
}
```

**Indexes:**
- HNSW vector index по `embedding` WHERE `deletedAt IS NULL`
- `userId, characterId, deletedAt` (выборка памяти для пары)
- `importance DESC, lastAccessedAt DESC` (retrieval ordering)

```sql
CREATE INDEX memory_entries_embedding_idx
ON memory_entries
USING hnsw (embedding vector_cosine_ops)
WHERE deletedAt IS NULL;
```

---

## 4. Billing

### `subscriptions`

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users, unique)             // one-to-one

  // Plan
  plan: 'free' | 'premium_monthly' | 'premium_yearly' | 'premium_plus_monthly'
  status: 'active' | 'past_due' | 'canceled' | 'expired' | 'trialing'

  // Period
  currentPeriodStart: timestamp
  currentPeriodEnd: timestamp
  cancelAtPeriodEnd: boolean
  canceledAt: timestamp | null

  // Payment provider
  provider: 'ccbill' | 'crypto' | 'manual'
  providerSubscriptionId: string

  // Pricing snapshot
  amountCents: integer
  currency: string                              // 'USD'

  // Tier-based features
  features: jsonb {
    monthlyTokenAllocation: integer             // 100 standard, 300 premium_plus
    llmTier: 'standard' | 'premium' | 'premium_plus'
    videoEnabled: boolean
    monthlyVideoQuota: integer                  // 0 / 5 / 10
    priorityQueue: boolean
    customCharacterLimit: integer               // 1, unlimited (-1)
  }
  lastTokenGrantDate: timestamp | null

  createdAt: timestamp
  updatedAt: timestamp
}
```

### `token_balances`

Кешированный баланс для быстрого чтения. Источник истины — `token_transactions`.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users, unique)

  balance: integer                              // текущий
  lifetimeEarned: integer
  lifetimeSpent: integer

  updatedAt: timestamp
}
```

### `token_transactions`

Append-only ledger. Источник истины для всех операций с токенами.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)

  type: 'grant_subscription' | 'grant_purchase' | 'grant_bonus' |
        'spend_image' | 'spend_image_premium' | 'spend_image_regen' |
        'spend_video' | 'spend_video_regen' |
        'spend_advanced_llm' |
        'refund' | 'admin_adjustment'

  amount: integer                               // +grant, -spend
  balanceAfter: integer                         // snapshot после операции

  // Context
  relatedMessageId: uuid | null (fk → messages)
  relatedPaymentId: uuid | null (fk → payment_transactions)
  adminUserId: uuid | null                      // для admin_adjustment
  reason: string | null

  createdAt: timestamp
}
```

**Indexes:**
- `userId, createdAt DESC` (история транзакций в UI)

**Invariant:** каждая операция = транзакция в `token_transactions` + UPDATE `token_balances` в одной DB transaction. Cron-validator пересчитывает balance из ledger ежечасно для consistency check.

### `token_packages`

Справочник пакетов для one-time покупки.

```typescript
{
  id: uuid (pk)
  sku: string                                   // 'tokens_100', 'video_pack_5'
  displayName: { en: string, ru: string, es: string }
  tokenAmount: integer
  priceCents: integer
  currency: string
  isActive: boolean
  displayOrder: integer
  badgeText: { en: string, ru: string, es: string } | null
}
```

### `payment_transactions`

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)

  type: 'subscription_initial' | 'subscription_renewal' | 'token_purchase' | 'refund'
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed'

  // Amount
  amountCents: integer
  currency: string

  // Provider
  provider: 'ccbill' | 'crypto_btc' | 'crypto_eth' | 'crypto_usdt'
  providerTransactionId: string (unique)
  providerRawData: jsonb                        // raw webhook для аудита

  // Related entity
  subscriptionId: uuid | null (fk → subscriptions)
  tokenPackageId: uuid | null (fk → token_packages)

  // Crypto-specific
  cryptoAddress: string | null
  cryptoAmountReceived: string | null           // в минимальных единицах
  cryptoConfirmations: integer | null

  createdAt: timestamp
  completedAt: timestamp | null
}
```

**Indexes:**
- `providerTransactionId` (unique)
- `userId, createdAt DESC`

### `payment_webhooks`

Сырые webhook-события для idempotent обработки.

```typescript
{
  id: uuid (pk)
  provider: string
  eventType: string                             // 'subscription.created'
  providerEventId: string (unique)              // для идемпотентности

  payload: jsonb
  signature: string                             // для верификации

  processedAt: timestamp | null
  processingResult: 'success' | 'failed' | 'skipped' | null
  processingError: text | null
  retryCount: integer

  receivedAt: timestamp
}
```

**Critical:** всегда сохранять webhook в эту таблицу первым. Обработка идёт асинхронно из БД через background job.

---

## 5. Media

### `media_assets`

Все изображения и видео. Единая таблица.

```typescript
{
  id: uuid (pk)

  kind: 'character_reference' | 'character_gallery' | 'character_preview' |
        'generated_message' | 'generated_video' | 'video_source_image' |
        'user_avatar'

  // Ownership (одно из)
  ownerUserId: uuid | null (fk → users)
  ownerCharacterId: uuid | null (fk → characters)
  relatedMessageId: uuid | null (fk → messages)

  // Storage
  storageKey: string                            // R2 object key
  storageProvider: 'r2' | 's3'
  publicUrl: string                             // CDN URL

  // Metadata
  mimeType: string                              // 'image/png', 'video/mp4'
  sizeBytes: integer
  width: integer
  height: integer
  durationSec: number | null                    // для video

  // Generation metadata
  generationMetadata: jsonb | null {
    // Provider tracking
    provider: 'fal' | 'replicate' | 'self_hosted'
    cost: integer | null                        // в десятых долях цента

    // Image fields
    model: string                               // 'cyberrealistic_pony' | etc
    prompt: text
    negativePrompt: text
    seed: integer
    referenceImageId: uuid | null
    ipAdapterWeight: number | null
    steps: integer
    cfgScale: number

    // Video fields
    videoModel: string | null                   // 'wan-2.2-i2v'
    sourceImageId: uuid | null
    motionPrompt: text | null
    fps: integer | null
  }

  // Moderation
  moderationStatus: 'pending' | 'approved' | 'flagged' | 'rejected'
  moderationScores: jsonb | null {
    nsfw: number                                // 0-1
    underage: number                            // 0-1
    violence: number                            // 0-1
    apparentAge: number | null                  // estimated age (critical for safety)
                                                // для NSFW требуется > 25
    classifierVersion: string
    classifiedAt: timestamp
  }

  // Display variants
  isNsfw: boolean
  blurredUrl: string | null                     // для preview на SFW-tier
  thumbnailUrl: string | null                   // для video — preview frame

  createdAt: timestamp
  deletedAt: timestamp | null
}
```

**Indexes:**
- `relatedMessageId` (получить медиа для сообщения)
- `ownerCharacterId, kind` (reference/gallery персонажа)
- `ownerUserId, createdAt DESC` (галерея пользователя)
- `moderationStatus` (админская очередь)

---

## 6. Safety & Audit

### `safety_incidents`

Серьёзные инциденты, требующие review.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)

  severity: 'low' | 'medium' | 'high' | 'critical'
  category: 'underage_content' | 'celebrity_impersonation' | 'violence' |
            'bestiality' | 'non_consent' | 'csam_attempt' |
            'age_classifier_flag' | 'combinatorial_pattern' |
            'jailbreak_attempt' | 'other'

  triggeredAt: 'input_filter' | 'output_filter' | 'image_filter' |
               'apparent_age_classifier' | 'user_report' | 'admin'
  detectionMethod: 'keyword' | 'classifier' | 'vision_model' |
                   'scoring_system' | 'manual'

  // Context
  relatedMessageId: uuid | null (fk → messages)
  relatedImageId: uuid | null (fk → media_assets)
  relatedVideoId: uuid | null (fk → media_assets)
  relatedCharacterId: uuid | null (fk → characters)

  // Detailed scoring (для combinatorial patterns)
  scoringDetails: jsonb | null {
    ageMarkers: number
    youthAmplifiers: number
    adultMarkers: number
    sexualContext: boolean
    triggeredRules: string[]
  }

  // Evidence (encrypted)
  evidenceSnapshot: jsonb

  // Resolution
  status: 'open' | 'investigating' | 'resolved' | 'false_positive'
  actionTaken: 'none' | 'warning' | 'suspension' | 'ban' |
               'content_deletion' | 'reported_to_authorities'
  resolvedAt: timestamp | null
  resolvedBy: uuid | null (fk → users)
  resolutionNotes: text | null

  createdAt: timestamp
}
```

**Retention:** 7 лет для критических инцидентов.

### `content_flags`

Лёгкие флаги для rate limiting и поведенческих паттернов.

```typescript
{
  id: uuid (pk)
  userId: uuid (fk → users)
  flagType: 'blocked_input' | 'blocked_output' | 'blocked_image' | 'rate_limit_hit'
  context: jsonb
  createdAt: timestamp
}
```

**Used for:** "3 попытки за 24 часа → temp ban" логика. Партиционировать по месяцу.

**Indexes:**
- `userId, flagType, createdAt DESC`

### `audit_logs`

Админские действия и критичные операции.

```typescript
{
  id: uuid (pk)
  actorType: 'user' | 'admin' | 'system'
  actorId: uuid | null

  action: string                                // 'user.ban', 'character.reject', 'refund.issue'
  entityType: string                            // 'user', 'character', 'payment'
  entityId: uuid

  changes: jsonb | null                         // before/after для updates
  reason: string | null

  ipAddress: string | null
  userAgent: string | null

  createdAt: timestamp
}
```

**Indexes:**
- `actorId, createdAt`
- `entityType, entityId`

---

## 7. System

### `system_prompts`

Версионированные шаблоны промптов. Редактируются через админку без деплоя.

```typescript
{
  id: uuid (pk)
  key: string                                   // 'character_system_base' | 'memory_extraction'
  language: 'en' | 'ru' | 'es' | 'all'         // 'all' для language-agnostic
  version: integer
  isActive: boolean

  template: text                                // с переменными {{name}}, {{personality}}
  variables: string[]                           // документация переменных
  description: text

  // Model-specific optimization
  targetModel: string | null                    // 'deepseek/deepseek-chat-v3' | null
  // null = универсальный, иначе оптимизирован под конкретную модель

  // A/B testing
  rolloutPercentage: integer                    // 0-100

  createdAt: timestamp
  createdBy: uuid (fk → users)                  // admin
  activatedAt: timestamp | null
}
```

### `feature_flags`

```typescript
{
  id: uuid (pk)
  key: string (unique)
  enabled: boolean
  rolloutPercentage: integer                    // 0-100
  userAllowlist: uuid[]                         // конкретные users для тестов
  metadata: jsonb
  updatedAt: timestamp
}
```

---

## Critical patterns

### Token system: ledger + cache

```sql
-- WRITE PATH (every operation)
BEGIN;
  INSERT INTO token_transactions (...);
  UPDATE token_balances SET balance = balance + amount WHERE userId = ?;
COMMIT;

-- READ PATH (quota check, hot path)
SELECT balance FROM token_balances WHERE userId = ?;

-- VALIDATION (cron, hourly)
SELECT userId, SUM(amount) AS expected
FROM token_transactions
GROUP BY userId;
-- compare with token_balances.balance
-- alert если discrepancy
```

### Conversation snapshot pattern

```typescript
// При создании conversation:
const conversation = await create({
  userId,
  characterId,
  characterSnapshot: {
    systemPrompt: character.systemPrompt,
    name: character.name,
    personalityTraits: character.personalityTraits,
    backstory: character.backstory,
    imageModel: character.imageModel,
  },
  snapshotVersion: character.systemPromptVersion,
  llmConfig: {
    provider: 'openrouter',
    model: subscription.features.llmTier === 'premium_plus'
      ? 'anthracite-org/magnum-v4-72b'
      : 'deepseek/deepseek-chat-v3',
    tier: subscription.features.llmTier,
    temperature: 1.3,
    maxTokens: 600,
    snapshotAt: new Date(),
  },
  language: detectedLanguage || character.language,
});

// При генерации сообщения — используем snapshots, не characters/subscriptions tables:
const systemPrompt = conversation.characterSnapshot.systemPrompt;
const model = conversation.llmConfig.model;

// При редактировании character user видит UI:
if (character.systemPromptVersion > conversation.snapshotVersion) {
  // Show "Update character to v2" banner
}
```

### Memory retrieval с pgvector

```sql
WITH query_embedding AS (
  SELECT embedding FROM embed_query($currentMessageContent)
)
SELECT
  content,
  importance,
  (embedding <=> (SELECT embedding FROM query_embedding)) AS distance
FROM memory_entries
WHERE userId = $userId
  AND characterId = $characterId
  AND deletedAt IS NULL
ORDER BY
  (embedding <=> (SELECT embedding FROM query_embedding)) +
  (1.0 / (importance + 1)) ASC                  -- importance boost
LIMIT 5;
```

### Multilingual character linking

```typescript
// Один логический персонаж — три записи:
{ id: 'uuid-1', localeGroupId: 'anna-2026', language: 'en', name: 'Anna', ... }
{ id: 'uuid-2', localeGroupId: 'anna-2026', language: 'ru', name: 'Анна', ... }
{ id: 'uuid-3', localeGroupId: 'anna-2026', language: 'es', name: 'Ana',  ... }

// Authenticated catalog (spec §3.2.2) фильтрует по language=user.locale:
SELECT * FROM characters
WHERE kind = 'preset' AND language = $userLocale AND isPublished = true
  AND deletedAt IS NULL
ORDER BY displayOrder;

// Public landing showcase (spec §3.2.1) — pre-auth, всегда SFW, отдельный флаг:
SELECT c.*, m.publicUrl AS primaryImageUrl
FROM characters c
LEFT JOIN media_assets m ON m.id = c.primaryImageId
WHERE c.kind = 'preset'
  AND c.isPublished = true
  AND c.landingFeatured = true
  AND c.contentRating = 'sfw'
  AND c.language = $uiLocale
  AND c.deletedAt IS NULL
ORDER BY c.landingOrder ASC NULLS LAST, c.displayOrder ASC
LIMIT 12;
```

### Soft delete with cascade

```typescript
// Все user-content tables имеют deletedAt
// Read queries всегда фильтруют:
WHERE deletedAt IS NULL

// Cascade при удалении user (через GDPR request):
1. UPDATE users SET deletedAt = NOW() WHERE id = ?
2. Trigger cascade job через 90 дней:
   - DELETE all conversations
   - DELETE all messages
   - DELETE all custom characters
   - DELETE all memory_entries
   - DELETE all media_assets (с R2 cleanup)
   - HARD DELETE user record
   - KEEP audit_logs (без PII)
   - KEEP age_verifications (legal requirement, 7 years)
```

---

## Access control summary

| Коллекция | Read | Create | Update | Delete |
|---|---|---|---|---|
| `users` | self + admin | public (signup) | self + admin | admin only |
| `characters` (preset) | public | admin | admin | admin |
| `characters` (custom) | owner + admin | authenticated | owner + admin | owner (soft) |
| `conversations` | owner + admin | authenticated | owner | owner (soft) |
| `messages` | conversation owner | API only (server) | API only | owner (soft, own only) |
| `memory_entries` | owner + admin | API only | owner (verify/edit) | owner (soft) |
| `subscriptions` | self + admin | webhook only | webhook only | never |
| `token_balances` | self + admin | API only | API only | never |
| `token_transactions` | self + admin | API only | never | never |
| `payment_transactions` | self + admin | webhook only | webhook only | never |
| `media_assets` | owner + admin | API only | API only | owner (soft) |
| `safety_incidents` | admin only | system | admin | never |
| `audit_logs` | admin only | system | never | never |

---

## Implementation notes

**Database setup:**
- PostgreSQL 16+
- Extensions: `pgvector` (для embeddings), `pg_trgm` (для full-text search)
- HNSW index parameters: `m = 16`, `ef_construction = 64`
- Connection pooling через PgBouncer для production

**Migrations:**
- Все schema changes через Payload migrations API
- Custom SQL migrations для pgvector indexes
- Migrations через PR с code review

**Hot tables to monitor:**
- `messages` — растёт быстрее всего, партиционировать по `conversationId hash` при достижении 100M rows
- `token_transactions` — append-only, партиционировать по месяцу
- `content_flags` — партиционировать по месяцу, retention 1 год
- `media_assets` — отслеживать R2 storage cost, lifecycle policy для deleted assets

**Critical invariants:**
- `messages.conversationId` snapshot version должен matches `conversations.snapshotVersion` или быть меньше
- `token_balances.balance` = SUM(`token_transactions.amount`) для каждого userId
- Все NSFW `media_assets` должны иметь `moderationScores.apparentAge > 25` или быть `moderationStatus = 'flagged'`
- `characters` с `kind = 'preset'` обязательно имеют `localeGroupId`
- `payment_webhooks.providerEventId` должен быть unique per provider
