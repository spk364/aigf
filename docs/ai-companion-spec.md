# AI Companion SaaS — Product Specification

Web-based AI companion platform с возможностью текстового общения, генерации контекстных изображений, кастомизации персонажей и tier-based монетизацией.

**Бизнес-модель:** Freemium с подпиской и токенами за тяжёлые операции.

**Целевые рынки:** Русскоязычный (СНГ), испаноязычный (LATAM + Spain), англоязычный non-tier-1.

---

## 1. Tech Stack

**Frontend:**
- Next.js 15 (App Router, Server Components где возможно)
- TypeScript 5.x strict
- Tailwind CSS 4 + shadcn/ui
- Feature-Sliced Design (FSD) architecture
- Zustand для local state, TanStack Query для server state
- next-intl для i18n (en/ru/es)
- react-hook-form + zod для форм

**Backend:**
- Payload CMS v3 (data layer + admin panel) с Postgres adapter
- Next.js API routes для streaming endpoints (chat) и orchestration
- Background jobs через Inngest

**Database:**
- PostgreSQL 16 с pgvector extension
- Hosted: Neon или Supabase
- HNSW indexes для vector search

**Storage:**
- Cloudflare R2 для всех media assets
- Public CDN URLs для изображений и видео

**External services:**
- **LLM:** OpenRouter (DeepSeek V3 primary, Magnum v4 для premium tier)
- **Image generation:** fal.ai (CyberRealistic Pony для realistic, Pony V7 для anime)
- **Video generation:** fal.ai (WAN 2.2) — post-MVP
- **Embeddings:** OpenAI text-embedding-3-small (1536 dim)
- **Payments:** CCBill (cards), NOWPayments (crypto)
- **Email:** Resend
- **Cache & rate limiting:** Upstash Redis

**Observability:**
- Sentry (errors)
- PostHog (analytics + feature flags)
- Better Stack (uptime monitoring)
- Pino structured logs → Axiom

**Hosting:**
- Vercel Pro для web
- Inngest cloud для background jobs

---

## 2. Языки и локализация

Поддерживаемые языки UI и AI-общения: **English, Русский, Español**.

**UI:**
- Все текстовые элементы переводятся через next-intl
- Все справочники (character_appearance_presets, token_packages) имеют localized displayName

**AI conversation languages:**
- Каждый conversation имеет `language` поле, определяющее язык общения
- Auto-detection по первому сообщению пользователя или ручной выбор
- LLM system prompts адаптированы для каждого языка
- Возможность явной смены языка пользователем в настройках conversation

**Preset characters:**
- Каждый persona создаётся отдельно для каждого языка (3 records per persona)
- Связаны через общий `localeGroupId`
- Каталог фильтрует по `language = user.locale`

**Custom characters:**
- Создаются на одном языке (выбирается создателем при старте builder'а)
- LLM может переключать язык в разговоре, если пользователь начнёт писать на другом

---

## 3. Functional Requirements

### 3.1 Authentication & Onboarding

**Регистрация:**
- Email + password
- Google OAuth
- Email verification обязателен перед доступом к NSFW

**Age gate:**
- Чекбокс 18+ (legally required)
- Дата рождения (для legal evidence в `age_verifications` table)
- Юзер блокируется если DOB указывает <18

**Onboarding wizard (после регистрации):**
1. Выбор языка UI (en/ru/es) — auto-detected по browser locale
2. Gender preference для фильтрации каталога (опционально)
3. Tutorial screen: показ 3-4 preset-персонажей с CTA "Choose one or create your own"

**Free tier активируется сразу:**
- 10 сообщений/день
- SFW only
- Blurred thumbnails на NSFW персонажах в каталоге (тизер)

### 3.2 Каталог персонажей (Discovery)

Каталог имеет **две поверхности**: публичную витрину на лендинге (до регистрации) и полноценный каталог в приложении (после логина).

#### 3.2.1 Public landing showcase (pre-auth)

Конверсионный hero на главной странице — посетитель видит готовых персонажей до регистрации, кликает по карточке и попадает на signup; после регистрации редирект сразу в чат с этим пресетом, минуя выбор в онбординге.

**Layout:**
- Под hero-блоком на `/` — секция "Meet your companion" с grid 6–12 карточек
- Mobile-first (60% трафика mobile), 2 колонки на mobile, 3–4 на desktop

**Источник данных:** существующая `characters` table с фильтром
```
kind = 'preset'
AND isPublished = true
AND landingFeatured = true            -- отдельный флаг (см. §3.2.3)
AND contentRating = 'sfw'             -- pre-auth ВСЕГДА только SFW
AND language = uiLocale
AND deletedAt IS NULL
ORDER BY landingOrder ASC, displayOrder ASC
LIMIT 12
```

**Карточка содержит:**
- `primaryImage` через `media-assets.publicUrl` (всегда SFW)
- `name`
- `tagline` (1 короткая фраза-крючок)
- 2–3 `tags`
- CTA "Chat with {name}" → `/{locale}/signup?next=/chat/new?characterId={id}`

**Compliance / safety:**
- На первом визите — age-gate splash модал (cookie `agePromptAck`, 365 дней). До подтверждения showcase скрыт, видна только hero без grid
- Pre-auth ВСЕГДА только SFW — никаких blurred тизеров (нет 18+ confirmed session)
- ToS / Privacy / 2257 ссылки в подвале лендинга обязательны
- Geo-blocking запрещённых юрисдикций уровнем выше (Cloudflare WAF, §3.10 Layer 1)

**Persistence:** карточки кешируются на edge на 5 минут (preset-данные редко меняются). Cache-Control: `public, s-maxage=300, stale-while-revalidate=600`.

#### 3.2.2 Authenticated catalog (post-auth)

Полноценный каталог внутри приложения — `/{locale}/catalog`.

**Layout:**
- Grid view с карточками: preview image, name, tagline, теги
- Sticky filter sidebar на desktop, drawer на mobile
- Pagination (server-side, 24 cards/page)

**Карточка персонажа содержит:**
- Primary image (или blurred preview если NSFW и user free-tier — тизер для конверсии)
- Name + age display
- Tagline (1 короткая фраза)
- Теги (interests, archetype)
- Content rating indicator (SFW / NSFW)

**Фильтры:**
- Art style (realistic / anime / 3d / stylized)
- Archetype (sweet / adventurous / dominant / etc)
- Content rating (SFW / NSFW soft / NSFW explicit) — для free-tier визуально доступен только SFW
- Tags (interests-based, multi-select из tag cloud)

**Search:** по `name` и `shortBio` (ILIKE, fuzzy не нужен на MVP).

**Разделы:**
- "Featured" — preset characters на языке UI пользователя (`featured = true`)
- "All" — все опубликованные preset на языке пользователя
- "My Characters" — custom characters пользователя

**Контент на старте:** 20-30 preset personas × 3 языка = 60-90 character records.

#### 3.2.3 Связь с Builder

Карточка любого preset (на лендинге или в каталоге) имеет вторичный CTA "Use as starting point" — создаёт `character_drafts` row, скопированный из preset (kind становится `custom`, `localeGroupId = null`, `createdBy = current user`), и открывает Builder на шаге 1. Реализация — Phase 3, после самой Builder-механики.

### 3.3 Character Builder

4-шаговый wizard для создания custom персонажей.

**Лимиты:**
- Free tier: 1 custom character total
- Premium: unlimited custom characters
- Создание персонажа бесплатное (preview-генерации не списывают токены)
- Редактирование personality/backstory доступно всегда
- Перегенерация appearance reference image — стоит токенов (4 tokens)

**Шаг 1: Appearance**
- Art style selector (realistic / anime / 3d / stylized)
- Ethnicity (multi-select)
- Age range: "Young adult (21-25)" / "Adult (25-35)" / "Mature (35-45)" / "Experienced (45+)"
  - **Hard constraint: minimum age 21 в UI**
- Body type: slender / average / curvy / voluptuous (без extreme petite вариантов)
- Hair: color × length × style (всё из presets)
- Eye color
- Distinctive features (multi-select из presets)

После выбора параметров — **live preview**: генерация 4 вариантов изображения через image gen API.
Юзер выбирает лучший → этот image становится **reference image** для всех будущих in-chat генераций (через IP-Adapter).

**Шаг 2: Identity & Personality**
- Name (free input + модерация на blocklist реальных знаменитостей и детских имён)
- Occupation (free input или 30-40 пресетов)
- Archetype selector (6-10 пресетов с готовыми system prompt fragments):
  - "The Sweet Girlfriend" (caring, supportive)
  - "The Adventurous Spirit" (playful, curious)
  - "The Mysterious One" (reserved, enigmatic)
  - "The Confident Leader" (dominant, assertive)
  - "The Shy Romantic" (introverted, tender)
  - "The Intellectual" (witty, philosophical)
  - "The Free Spirit" (spontaneous)
  - "The Caretaker" (nurturing)
- Trait sliders (4-6 параметров, 1-10):
  - shy ↔ bold
  - playful ↔ serious
  - submissive ↔ dominant
  - romantic ↔ casual
  - sweet ↔ sarcastic
  - traditional ↔ adventurous

Default values слайдеров определяются выбранным archetype.

**Шаг 3: Backstory & Relationship**
- Bio (auto-generate на основе предыдущих шагов, редактируемый)
- Interests (multi-select из библиотеки + free input)
- "How you met" scenario:
  - "Met at a coffee shop"
  - "Through mutual friends"
  - "Online — matched on a dating app"
  - "Neighbors"
  - "Colleagues at work"
  - Custom (free text)
- Current relationship stage: just met / dating / in a relationship / long-term

**Шаг 4: Review & Launch**
- Summary всех параметров
- Character card preview
- Preview chat (3-5 бесплатных сообщений в builder'е)
- "Regenerate appearance" опция (стоит 4 токенов)
- "Meet her" CTA → создание persistent character + первый conversation

**Технические детали:**
- Wizard state хранится в `character_drafts` table (TTL 7 дней)
- Возможность сохранить и вернуться позже
- Preview generations не списывают токены, но имеют rate limit (5 generations per draft)

### 3.4 Chat Engine

**Streaming:**
- SSE (Server-Sent Events) для текстовых ответов
- First token latency target: <2 секунды
- Full message latency target: <8 секунд p95

**Контекст для LLM:**
- Last 30-50 сообщений напрямую в prompt
- Summary более старых сообщений (если conversation длинный)
- Top-5 memory entries через vector search по релевантности к текущему сообщению
- Character snapshot system prompt
- DeepSeek V3 поддерживает 128k context — много места для контекста

**UX features:**
- Typing indicator с realistic delay (random 600-1500ms перед началом streaming)
- Auto-scroll при новых сообщениях
- Message timestamps в local timezone пользователя
- Copy сообщения
- **Regeneration текстовых ответов: бесплатно**
- **Regeneration изображений: стоит токенов (как новая генерация)**
- Soft delete своих сообщений
- Auto-save каждого сообщения

**Quota enforcement:**
- Free tier: 10 messages/day, reset в полночь UTC
- Premium: unlimited
- Quota check в начале каждого request, до отправки в LLM

### 3.5 Image Generation

**Два режима:**

**Auto mode** — персонаж "сам решает" отправить фото в нарративных триггерах:
- После N сообщений в новой scene
- При определённых emotional triggers (intimacy, milestone events)
- Опционально, выключаемо в conversation settings

**On-request mode** — пользователь явно просит:
- Intent detection: LLM анализирует input на запросы фото
- Триггеры: "send me a photo", "show me", "I want to see you"

**Pipeline:**
1. LLM генерирует **structured scene description** (JSON: что на фото, поза, освещение, эмоция)
2. Backend code собирает финальный SD prompt:
   - Scene description от LLM
   - Character `appearance.appearancePrompt` (Pony score-tags + appearance details)
   - Character `appearance.safetyAdultMarkers` (принудительные adult markers)
   - System negative prompt (hard-coded, user не может изменить)
3. Reserve tokens (atomic update token_balance)
4. Submit to fal.ai с reference image для IP-Adapter consistency
5. Multi-stage output classifier:
   - fal.ai NSFW classifier
   - Apparent age classifier — если возвращает <25 на NSFW image, блок + refund
6. Если flagged — refund tokens, log incident, return generic refusal
7. Если passed — upload to R2, save в media_assets, save message, stream user'у

**Models:**
- Realistic: CyberRealistic Pony (через `fal-ai/lora` endpoint)
- Anime: Pony V7 (нативный fal endpoint)
- Premium tier (post-MVP): FLUX-based для V2 quality

**Pricing:**
- Standard image: 2 токена
- Premium image (advanced model): 4 токена

### 3.6 Memory System

Двухуровневая.

**Short-term (conversation context):**
- Последние 30-50 сообщений напрямую в prompt
- Summary накапливается для сообщений за пределами окна

**Long-term (cross-session memory):**
- Background job каждые 30 сообщений: LLM extract фактов
- Категории: personal_info, preference, event, relationship, sensitive
- Embeddings через OpenAI text-embedding-3-small (1536 dim)
- Сохранение в `memory_entries` с pgvector
- При формировании prompt — vector search по релевантности к текущему контексту → top-5 facts добавляются в prompt
- Память per (user, character) pair — персонажная, не глобальная

**User control:**
- "What I know about you" страница в conversation settings
- Возможность отредактировать или удалить отдельные memory entries
- Verified flag для confirmed facts (boost importance)

### 3.7 Relationship System (light gamification)

**Mechanics:**
- Каждый conversation имеет `relationshipScore` (0-100)
- Растёт от: messages count, длительности sessions, deep conversations (длинные ответы)
- Падает от: длительной неактивности
- Recompute при каждом сообщении

**Effect:**
- Score < 20: персонаж более reserved в tone
- Score 20-60: normal
- Score > 60: более intimate, frequent pet names, deeper emotional engagement

**UX:**
- Progress bar в conversation settings
- Не overdone — это subtle layer, не главный feature

**Formula (initial):**
```
score = min(100, totalMessages × 0.1 + daysActive × 2 - daysSinceLastMessage × 0.5)
```

### 3.8 Subscriptions & Tokens

**Tiers:**

**Free:**
- 10 сообщений/день
- SFW only (NSFW заблокирован, blurred thumbnails в каталоге как тизер)
- 1 custom character
- Без image generation
- DeepSeek V3 standard

**Premium ($12.99/month or $99.99/year):**
- Unlimited messages
- NSFW unlocked
- 100 токенов/месяц на images (carry over если не использованы)
- Unlimited custom characters
- Priority generation queue
- Free text regenerations
- DeepSeek V3 standard

**Premium Plus ($29.99/month):**
- Всё из Premium
- 300 токенов/месяц
- Magnum v4 72B для лучшего prose quality
- Video generation enabled (5 видео/месяц включено) — post-MVP
- Earliest access to new features

**Token packages (one-time purchase):**
- 100 tokens — $4.99
- 300 tokens — $12.99 (best value badge)
- 1000 tokens — $39.99
- Video pack: 5 videos — $9.99 (post-MVP)

**Token spending:**
- Standard image generation: 2 tokens
- Premium image generation (advanced model): 4 tokens
- Image regeneration: 2-4 tokens (как новая)
- Text regeneration: **free**
- Appearance reference regeneration: 4 tokens
- Video generation (post-MVP): 60-100 tokens
- Advanced LLM tier override: 5 tokens per message

Tokens не истекают, переносятся между периодами.

### 3.9 Payments

**Primary:** CCBill — карты (Visa, Mastercard, Amex), recurring billing для подписок.

**Secondary:** NOWPayments — crypto (BTC, ETH, USDT), only one-time покупки токенов и инициальные подписки.

**Implementation:**
- Webhook-based обновление subscription status и token_balance
- Idempotent processing через `payment_webhooks` table (всегда сохранять webhook первым, обрабатывать асинхронно)
- Cancel subscription в 2 клика из UI
- Grace period 3 дня при failed payment
- Refund flow через админку → автоматический tokens reversal

**Critical:**
- Подача заявки на CCBill merchant account должна начинаться в день 1 (3-6 weeks approval)
- Stripe / PayPal не используются (banned для adult content)

### 3.10 Trust & Safety

**Multi-layered safety pipeline.**

**Layer 1: Edge (Cloudflare)**
- WAF rules
- Bot mitigation
- Geo-blocking запрещённых юрисдикций
- IP-based rate limiting

**Layer 2: Application middleware**
- CSRF protection
- Auth verification
- Per-user rate limiting (Upstash Redis)
- Age verification check

**Layer 3: Input safety filter (pre-LLM)**

Scoring system, не простой keyword match. Конкретные правила:

**Hard blocks (instant ban на третьей попытке):**
- Любые underage маркеры: child, kid, minor, underage, teen, loli, shota
- Числа возраста <18 в любой форме
- School + sexual context combinations
- Family roleplay: daughter, sister, mom + sexual
- Bestiality
- Non-consent явный (rape, forced, unconscious, drugged)
- Real celebrity names в sexual context

**Combinatorial blocks (scoring system):**

```
youthAmplifiers (-2 каждый): petite, tiny, small, little, young, flat chest,
                              flat-chested, slim, slender, skinny, innocent,
                              pure, virgin, inexperienced

adultMarkers (+3 каждый): 25+, 30+, 40+, mature, MILF, experienced, voluptuous,
                          curvy, fully developed, full figure, large breasts,
                          wide hips, married for years

if (sexualContext === true):
  adultnessScore = adultMarkers - youthAmplifiers
  if (adultnessScore < 0) → soft_block
```

**Soft block UX:** "Your request contains ambiguous language. Try clarifying age or description."

**Layer 4: LLM system prompt enforcement**
- System prompt включает explicit instruction: персонаж никогда не описывает себя или других как <21, в школьном контексте с sexual content, etc
- Если user пытается nudge в эту сторону — персонаж refuses in character

**Layer 5: Output safety filter (post-LLM)**
- Text classifier на сгенерированный output
- Если flagged — заменить на in-character refusal

**Layer 6: Image generation safety**
- LLM генерирует scene description (JSON), не raw SD prompt
- Backend code собирает финальный prompt с принудительно вшитыми `safetyAdultMarkers`
- Hard-coded negative prompt (user не может изменить):
  ```
  (child:1.5), (teen:1.5), (young:1.4), (kid:1.5), (loli:1.5),
  (school uniform:1.3), (petite:1.2), (small:1.2), (flat chest:1.4),
  (underage:1.5), (minor:1.5), (childlike features:1.5),
  deformed, low quality, multiple people, bad anatomy
  ```
- Multi-stage output classifiers:
  - fal.ai NSFW classifier
  - **Apparent age classifier — для NSFW images требуется apparent age > 25**
  - Если age check fails → block + refund tokens + log safety_incident

**Layer 7: Character builder constraints**
- Age input hard minimum 21 в UI
- Name blocklist (real celebrities, очевидно детские имена)
- Body type options без extreme petite вариантов
- Free-text input только в backstory/personality, проходит через scoring system
- Никакой free-text input в appearance fields

**Escalation:**
- 3 blocked attempts за 24h → temp suspension (24 часа) + email
- 5 blocked attempts за неделю → permanent ban + блокировка email и payment method
- Critical incidents (CSAM attempts) → permanent ban + report to authorities + retain evidence 7 лет

**Audit:**
- Все safety events → `safety_incidents` или `content_flags` (по severity)
- 7 years retention для critical incidents
- Никаких user-controlled negative prompts в image generation

### 3.11 Admin Panel

Через Payload admin UI, доступ только admin role.

**Functions:**
- CRUD preset characters (с поддержкой multilingual workflow)
- User management: view, suspend, ban, refund
- Custom characters moderation queue
- Safety incidents review and resolution
- Аналитика dashboard:
  - Регистрации, конверсии, MRR
  - Retention cohorts (D1/D7/D30)
  - Funnel analytics
  - Top characters by engagement
- System prompts management (edit без деплоя, A/B testing)
- Character appearance presets management
- Token packages management
- Feature flags

**Audit logging:** все админские действия → `audit_logs`

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|---|---|
| First message streaming starts | <2s |
| Full text generation p95 | <8s |
| Image generation p95 | <15s |
| Page LCP (chat screen) | <1.5s |
| API endpoint response p95 (non-streaming) | <500ms |

### 4.2 Scalability

MVP targets:
- 5,000 registered users
- 500 concurrent chat sessions
- 50,000 messages/day peak
- 3,000 image generations/day peak

Architecture must support 10x growth without major refactoring.

### 4.3 Availability

- 99.5% uptime
- Graceful degradation: если image gen упал, chat продолжает работать
- Queue-based обработка media generation с retry
- Failover между LLM providers (OpenRouter primary, direct DeepSeek API fallback)

### 4.4 Data & Privacy

- Все user data зашифрованы at rest (DB-level)
- TLS 1.3 везде
- Conversation content **не используется для тренировки моделей**
- GDPR compliant:
  - Data export endpoint (одной кнопкой → JSON dump)
  - Account deletion с cascade delete через 90 дней
  - Right to rectification через memory_entries editing
- Audit logs не содержат PII

### 4.5 Compliance

- 18 USC 2257 compliance: все persons в content 21+, документированные prompts, age verification audit trail
- Retention policy:
  - User data: пока active + 90 дней после deletion request
  - Age verifications: 7 лет
  - Safety incidents: 7 лет
  - Audit logs: 7 лет
- Юр. лицо: НЕ в РФ/СНГ. Опции: Эстония (e-Residency), UK LTD, Кипр

---

## 5. External Dependencies

| Service | Purpose | Notes |
|---|---|---|
| OpenRouter | LLM (DeepSeek V3, Magnum v4) | Primary, ~$0.27-3/M tokens depending on model |
| fal.ai | Image generation | CyberRealistic Pony, Pony V7 |
| OpenAI API | Embeddings (text-embedding-3-small) | 1536 dim vectors |
| CCBill | Card payments | High-risk processor для adult content |
| NOWPayments | Crypto payments | BTC/ETH/USDT |
| Resend | Transactional email | |
| Cloudflare R2 | File storage | S3-compatible |
| Cloudflare CDN | Image delivery | Edge caching |
| Cloudflare WAF | Edge protection | Geo-blocking, bot mitigation |
| Neon / Supabase | Postgres + pgvector | Serverless |
| Upstash Redis | Cache + rate limiting | |
| PostHog | Product analytics + feature flags | |
| Sentry | Error tracking | |
| Better Stack | Uptime monitoring | |
| Inngest | Background jobs | Memory extraction, webhook processing |

---

## 6. Out of Scope для MVP

Явно НЕ входит в MVP:

- Voice messages (TTS/STT) — v1.1
- Voice calls real-time — v1.2
- Video generation — v1.1 (premium plus tier only initially)
- Mobile native apps (web responsive only) — v2.0
- Sharing/marketplace custom characters — v1.3
- Multi-character conversations — TBD
- Telegram/Discord integrations
- Push notifications и proactive messaging — v1.4
- AI-assisted character creation ("describe your ideal" → auto-build)
- Referral program
- Multilingual custom characters (custom = один язык)
- Group chats
- User-to-user features (messaging, social)

---

## 7. Roadmap после MVP

| Version | Timing | Features |
|---|---|---|
| v1.1 | Month 4-5 | TTS озвучка сообщений (ElevenLabs), Video generation (WAN 2.2) для Premium Plus |
| v1.2 | Month 6-7 | Voice calls real-time |
| v1.3 | Month 8-9 | Sharing custom characters с модерацией, character marketplace |
| v1.4 | Month 10 | Push notifications + proactive messages, mobile-optimized PWA |
| v2.0 | Month 12+ | React Native mobile app, multi-character conversations |

---

## 8. Success Metrics

### Product
| Metric | Target |
|---|---|
| D1 retention | >40% |
| D7 retention | >20% |
| D30 retention | >10% |
| Free → Paid conversion | >5% (target 10%) |
| Messages per paying user per day | >30 |
| Builder completion rate | >60% |
| Image generation usage (premium users) | >50% использования квоты |

### Business
| Metric | Target by Month 6 |
|---|---|
| Paying users | 100+ |
| MRR | $1,500+ |
| Gross margin | >40% |
| Churn (monthly) | <15% |

### Technical
| Metric | Target |
|---|---|
| Message generation p95 | <8s |
| Image generation p95 | <15s |
| Error rate | <1% |
| Uptime | >99.5% |
| LLM cost per paying user | <$2.5/month |

---

## 9. Implementation Order

### Phase 0: Pre-development (parallel, weeks -2 to 0)
- Юр. лицо registration (Estonia/UK)
- CCBill merchant account application
- NOWPayments account setup
- ToS/Privacy/2257 documents
- OpenRouter, fal.ai accounts с initial balance

### Phase 1: Validation Spike (week 1)
- Test DeepSeek V3 на character RP scenarios
- Test image generation models с right prompts
- Validate end-to-end что продукт возможен

### Phase 2: Backbone (weeks 2-5)
- Project setup (Next.js + Payload + Postgres + R2)
- Auth + age gate + email verification
- Core collections: users, age_verifications, system_prompts
- Conversations, messages, basic chat UI с SSE streaming
- Token system: ledger + cached balance + atomic transactions
- CCBill integration (sandbox)
- Single hardcoded preset character

### Phase 3: Core Features (weeks 6-9)
- Full characters collection с appearance/personality/backstory
- Catalog page с фильтрами (authenticated, §3.2.2)
- **Public landing showcase** (§3.2.1) — pre-auth grid из 6-12 preset с конверсионным CTA
- Memory system: pgvector setup, extraction job
- Image generation pipeline: media_assets, fal.ai integration, IP-Adapter
- Intent detection, image safety pipeline (включая apparent age classifier)
- Safety pipeline complete: input filters, output filters, scoring system
- Admin panel: user management, character moderation, refunds
- **Character builder** (можно делать parallel с другим engineer)

### Phase 4: Content & Polish (weeks 10-12)
- 20-30 preset characters × 3 языка = 60-90 records
- i18n: переводы UI на ru/es
- Analytics: PostHog setup, key events tracking
- Onboarding flow polish
- Mobile-responsive verification
- Performance optimization

### Phase 5: Launch Prep (weeks 13-14)
- Bug fixes по beta feedback
- Legal final review (особенно ToS на 3 языках)
- Marketing site final touches
- Acquisition channels setup (Telegram, Reddit, affiliate program)
- Soft launch

**Total timeline:** 10-14 weeks от старта разработки до first public users.

---

## 10. Critical Constraints для разработки

**Безопасность важнее features:**
- Safety pipeline должен быть готов до first user, не после
- Apparent age classifier — критичный компонент, не опциональный
- Hard-coded negative prompts в image generation (user не контролирует)

**Финансовая корректность:**
- Token system: ledger + cache pattern, hourly cron-validator
- Payments idempotent через webhook deduplication
- Никаких financial операций без atomic DB transactions

**Snapshot consistency:**
- Conversations имеют character snapshot — изменения characters не ломают активные диалоги
- llmConfig snapshot per conversation — позволяет менять модели без потери context

**Multilingual из коробки:**
- НЕ добавлять английский first и переводить потом
- Schema поддерживает 3 языка с дня 1
- Все user-facing strings через i18n

**Сompliance ready:**
- Все user actions auditable
- 7-year retention для critical data
- GDPR data export и deletion работают с момента launch

---

## Reference Documents

- `data-model.md` — full database schema (17 collections, indexes, patterns)
- `architecture.md` — system architecture, data flows, deployment

End of specification.
