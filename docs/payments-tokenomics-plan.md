# Payments + Tokenomics — Audit & Implementation Plan

Дата: 2026-05-13
Ветка: `feat/builder-submit-poll-pony-illustrious` (план не привязан к этой ветке — родится отдельный feature branch)

Цель документа: зафиксировать текущее состояние биллинга/токеномики в репозитории, выявить дыры, сравнить крипто-провайдеров, провести pricing-audit и предложить пошаговый план «подключить тестовую крипту + доработать планы».

---

## 1. Что уже реализовано

### 1.1 Тарифы и пакеты
- `src/features/billing/plans.ts` — 4 SKU подписок:
  - `premium_monthly` $12.99 → 100 токенов/мес, standard LLM, без video
  - `premium_yearly` $83.88 → 100/мес + 200 бонус, standard LLM, без video
  - `premium_plus_monthly` $24.99 → 300 токенов/мес, premium_plus LLM, video 5/мес
  - `premium_plus_yearly` $179.88 → 300/мес + 500 бонус, premium_plus LLM, video 5/мес
- `src/payload/seed/seed-token-packages.ts` — 4 token packs:
  - `tokens_100` $4.99 / `tokens_300` $12.99 / `tokens_1000` $39.99 / `tokens_3000` $99.99

### 1.2 Карты (CCBill)
- `src/features/billing/ccbill/checkout.ts` — FlexForm URL-builder, mock-режим если `CCBILL_ACCOUNT_NUM` пуст
- `src/features/billing/ccbill/handlers.ts` — полный набор:
  `handleNewSaleSuccess`, `handleRenewalSuccess`, `handleCancellation`, `handleExpiration`, `handleRefund`, `handleChargeback`
- `src/app/api/webhooks/ccbill/route.ts` — приёмник
- `src/features/billing/token-packs/checkout.ts` + `actions.ts` — отдельный путь для one-time покупок токенов через CCBill FlexForm (и mock fallback с прямым grant в ledger)

### 1.3 Крипта (NOWPayments) — частично
- `src/app/api/webhooks/nowpayments/route.ts` — приёмник готов:
  - сохраняет raw payload в `payment-webhooks` (идемпотентность по `providerEventId`)
  - валидирует HMAC-SHA512 через `NOWPAYMENTS_IPN_SECRET`
  - на `payment_status = finished` парсит `order_id = tokens_{userId}_{sku}_{nonce}`, ищет token-pack, создаёт `payment-transactions`, делает `grant()` в ledger
- Env: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` — заведены, опциональны
- **Чего НЕТ:**
  - функции `createNowpaymentsInvoice()` / API-клиента
  - server action `purchaseTokenPackWithCryptoAction()`
  - кнопки «Pay with crypto» в UI
  - ветки для подписок (webhook парсит только token-pack префикс)

### 1.4 Ledger и квоты
- `src/features/tokens/ledger.ts` — append-only, idempotency keys, atomic tx, race-replay
- Spend types в типах: `spend_image`, `spend_image_premium`, `spend_image_regen`, `spend_video`, `spend_video_regen`, `spend_voice_message`, `spend_voice_call`, `spend_advanced_llm`
- Реально вызывается **только** `spend_image` (см. `src/features/chat/image-job.ts`, `IMAGE_TOKEN_COST = 2`)
- Video / voice / advanced-LLM debit — в типах есть, в коде нет
- `src/features/quota/message-quota.ts` — daily cap 30 для free-tier, ∞ для premium

### 1.5 UI
- `/[locale]/upgrade` — рендерит 3 карточки (`premium_plus_yearly` спрятан)
- `/[locale]/tokens` — рендерит все 4 token-pack
- Обе формы пушат сразу в CCBill (или mock), переключателя card/crypto нет

---

## 2. Tokenomics audit — где сейчас уходим в минус

Аудит сделан по коду `feat/builder-submit-poll-pony-illustrious` на 2026-05-13. Каждая дыра подкреплена ссылкой на файл/строку.

### 2.1 Карта всех $-burning операций

| Операция | Где вызывается | Внешний $ за вызов | Токены сейчас | Защита |
|---|---|---|---|---|
| Chat LLM (DeepSeek V3 через OpenRouter) | `src/app/api/chat/route.ts:26` (`OPENROUTER_MODEL=deepseek/deepseek-chat-v3-0324`), 30-msg history + memories + summary, in≈6.2k / out≤600 | ~$0.002 | **0** | `CHAT_LIMIT` 30/min, 400/h, 2k/day + free-tier 30/day cap |
| Chat regenerate (LLM) | `src/app/api/chat/regenerate/route.ts:1` ("free per spec 3.8") | ~$0.002 | **0** | `CHAT_REGENERATE_LIMIT` 10/min, 100/h |
| Chat image | `src/features/chat/image-job.ts:26` default endpoint `FAL_IMAGE_ENDPOINT = FAL_ENDPOINT_REALISTIC_VISION` (RealVisXL) | ~$0.04–0.05 | **2** | `isPremiumPlan` gate + `IMAGE_GEN_LIMIT` 10/min, 60/h, 300/day + balance check + tech/safety auto-refund |
| Chat TTS | `src/app/api/chat/messages/[id]/tts/route.ts` MiniMax via fal, до 1500 chars | ~$0.05–0.15 | **0** ❌ | **только** «message belongs to user» + 1500-char cap + кэш в `audioAssetId` |
| Builder preview (auth) | `src/features/builder/actions.ts:267` `generatePreviewsAction`, эндпоинт зависит от выбранного style (FLUX schnell $0.003, fast-sdxl $0.02, Pony/Illustrious $0.08–0.10) | $0.003–0.10 | **0** ❌ | `IMAGE_GEN_LIMIT` 300/day + 5 поколений на черновик; **черновиков можно создавать неограниченно** |
| Builder preview (guest) | `src/features/builder/guest-actions.ts:295` `generateGuestPreviewAction`, 2 image per call, FLUX schnell / fast-sdxl | $0.006–0.04 | **0** | IP-bound: 3/hour, 20/day (бесполезно при ротации VPN/прокси) |
| Admin video gen | `src/app/api/admin/characters/[id]/generate-video/route.ts` (только admin) | $0.05–0.50 | **0** | admin-only — для юзеров недоступно, не риск |
| Admin generate-image / generate-reference | admin-only | $0.05–0.10 | **0** | admin-only — не риск |
| Voices seed | admin-only | ~$0.13 разово | n/a | admin-only |
| Inngest memory extraction | LLM-driven, fires каждые 30 user msgs (`src/app/api/chat/route.ts:638`) | ~$0.01 | **0** | event-bound, не abuse-able напрямую |

### 2.2 Доход за 1 «декларированный» токен

| Источник | Цена/токен | Markup vs Image $0.05 | Markup vs TTS $0.10 | Markup vs Video $0.40 |
|---|---|---|---|---|
| premium_monthly                 | $0.1299 | 2.6× | 1.30× | 0.32× ❌ |
| premium_plus_monthly            | $0.0833 | 1.67× | 0.83× ❌ | 0.21× ❌ |
| premium_yearly (после бонуса)   | $0.0599 | 1.20× | 0.60× ❌ | 0.15× ❌ |
| premium_plus_yearly (после бонуса) | $0.0410 | 0.82× ❌ | 0.41× ❌ | 0.10× ❌ |
| tokens_100 pack ($4.99)         | $0.0499 | 1.00× ⚠️ | 0.50× ❌ | 0.12× ❌ |
| tokens_300 pack ($12.99)        | $0.0433 | 0.87× ❌ | 0.43× ❌ | 0.11× ❌ |
| tokens_1000 pack ($39.99)       | $0.0399 | 0.80× ❌ | 0.40× ❌ | 0.10× ❌ |
| tokens_3000 pack ($99.99)       | $0.0333 | 0.67× ❌ | 0.33× ❌ | 0.08× ❌ |

«1.00×» — буквально 0% маржа до учёта эквайринга, **2% Stripe/CCBill + 5% chargeback resv + 1% NOWPayments = реально 8% loss** даже на breakeven строках.

### 2.3 Конкретные дыры (ранжированы по урону)

#### 🔴 HOLE-1: TTS списывается **0 токенов** для премиум-юзера
**Код:** `src/app/api/chat/messages/[id]/tts/route.ts` — нет `spend()`, нет subscription-check, нет rate-limit.
**Сценарий:** Premium ($12.99/мес) юзер делает 100 чат-сообщений/день. Кликает ▶ на каждом = 100 × $0.05 (MiniMax) = $5/день = **$150/мес COGS только на голос**, при выручке $12.99.
**Защита сейчас:** только `audioAssetId` кэш (одно TTS на сообщение).
**Митигация:**
- Списывать `TTS_TOKEN_COST = 1` (≈$0.05 при premium_monthly $0.1299/token = 24% маржа) при первом ▶.
- Per-user daily TTS cap (например 50/day для premium, 200/day для premium+).
- Rate limit: 20/min, 200/h.

#### 🔴 HOLE-2: chat-image использует RealVisXL ($0.05) за 2 токена ⇒ packs в минусе
**Код:** `src/features/chat/image-job.ts:80` → `submitImageJob({...})` без `endpoint` → default `FAL_IMAGE_ENDPOINT = FAL_ENDPOINT_REALISTIC_VISION` ⇒ $0.04–0.05/image.
**Сценарий:** Юзер покупает `tokens_3000` за $99.99. Тратит на чат-картинки: 3000/2 = 1500 images × $0.045 = **$67.50 COGS**, выручка $99.99 минус 8% эквайринг = $92. Margin 27% — терпимо, но **на packs 1000+ и любой premium_plus_yearly margin = отрицательный**.
**Митигация:**
- Раздельные стоимости: `IMAGE_FAST_COST = 1` (FLUX schnell ~$0.003) и `IMAGE_STANDARD_COST = 2` (RealVisXL/fast-sdxl) и `IMAGE_PREMIUM_COST = 4` (Pony/Illustrious).
- В чате юзер по умолчанию получает FAST endpoint (FLUX schnell, $0.003/img × 1500 = $4.5 COGS на полностью истраченный 3000-pack — здоровая маржа). Premium endpoint = слайдер «boost quality» с явным +2 токена.
- Удешевить дефолтный endpoint в chat-image: переключить с `FAL_ENDPOINT_REALISTIC_VISION` на `FAL_ENDPOINT_FAST_SDXL` или FLUX schnell.

#### 🟠 HOLE-3: Builder preview (auth) — 0 токенов, неограниченное число drafts
**Код:** `src/features/builder/actions.ts:267` — нет `spend()`. Ограничение 5 generations на draft (по `previewGenerations` timestamps), но число drafts не лимитировано.
**Сценарий:** Free-tier юзер регистрируется → создаёт 50 drafts → 50 × 5 = 250 previews × $0.05 (fast-sdxl) = $12.50 COGS. Через `IMAGE_GEN_LIMIT` всё равно лимитирует 300/day, но всё равно $15/день потенциально.
**Митигация:**
- Либо лимит drafts на юзера (`MAX_DRAFTS_PER_USER = 3` для free, ∞ для premium).
- Либо запретить FAST builder preview более N/day для free (есть в спеке `customCharacterLimit` уже на финализированных характерах).
- Либо: builder preview всегда через FLUX schnell ($0.003/img × 250 = $0.75/day) — минимальный COGS, terapevtic ограничение от Pony LoRA-абуза.

#### 🟠 HOLE-4: Guest builder — IP-based лимиты обходятся VPN
**Код:** `src/features/builder/guest-rate-limit.ts` — Redis key per IP.
**Сценарий:** Botnet с 1000 IP × 20/day × 2 img × $0.02 = **$800/day без revenue**.
**Митигация (любая комбинация):**
- Cloudflare Turnstile/hCaptcha перед guest-генерацией (бесплатно, 2 часа работы).
- Cookie-based limit как primary (`readGuestDraft` уже даёт `previews.length >= 6` cap) + IP как secondary.
- Запретить guest полностью на Pony/fast-sdxl, оставить только FLUX schnell ($0.003/img × 20 × 2 = $0.12/day per IP) — снижает blast radius в 10×.
- Капать общий guest-spend (Redis: глобальный счётчик дневного GUEST_USD, отрубать при достижении $50/day).

#### 🟠 HOLE-5: Yearly bonus делает yearly дешевле packs
**Код:** `src/features/billing/plans.ts:51-101` — `annualUpfrontBonus: 200` и `500`.
**Расчёт:** premium_yearly даёт 100×12 + 200 = 1400 токенов за $83.88 = $0.060/токен. **Дешевле tokens_100 ($0.0499) уже не вершина, но дешевле tokens_300 и больше — да.** premium_plus_yearly: 300×12 + 500 = 4100 / $179.88 = $0.044/токен — **дешевле любого pack**. Это превращает yearly в pack-replacement.
**Митигация:**
- Снизить bonus до символического (premium_yearly +100, premium_plus_yearly +200), сместить ценность в LLM-tier / video.
- Или дать bonus в _плане_, но запретить тратить bonus на TTS/video (отдельный under-account в ledger).

#### 🟡 HOLE-6: video/voice-call spend-types существуют в `ledger.ts`, но не подключены
**Код:** `src/features/tokens/ledger.ts:21-25` декларирует `spend_video`, `spend_video_regen`, `spend_voice_message`, `spend_voice_call`, `spend_advanced_llm`. Поиск `spend(` находит только **один** caller — `src/app/api/chat/route.ts:380` (image).
**Что это значит:** когда видео или voice-call будут пользовательски-доступны, нужно одновременно подключать `spend()` иначе HOLE-1 повторится для video ($0.40/штука).
**Митигация:** до релиза video для юзеров — обязательный grep-чеклист «во всех API routes, где fal-ai вызывается из user-context, есть `spend()`».

#### 🟡 HOLE-7: balance-check защищает только chat-image, не TTS/builder
**Код:** `src/app/api/chat/route.ts:320` — `if (balance < IMAGE_TOKEN_COST) { ... return }`. Аналогичного гейта нет в TTS и builder.
**Митигация:** обернуть в общий хелпер `assertBalanceAndReserve(payload, user, tokenCost, idempotencyKey)` который вызывается перед любым $-burning fal-ai вызовом.

#### 🟡 HOLE-8: LLM-context blow-up
**Код:** `src/app/api/chat/route.ts:481` history limit=30; `LLM_MAX_TOKENS = 600` output cap; user input `z.string().min(1).max(2000)` chars.
**Худший случай:** юзер шлёт 2000-char сообщения 100 раз, контекст разрастается до ~10k токенов × $0.27/M в = $0.003/call × 100 = $0.30/day. Не критично, но при 10k премиум-юзеров = $3000/день = $90k/мес COGS только на чат-LLM. С разделом по плану — Premium $12.99 × 10k = $130k MRR, COGS LLM = $90k = margin перед всем остальным **31%**. Опасно близко к нулю при добавлении TTS.
**Митигация:**
- `LLM_MAX_TOKENS` снизить до 400 (current responses часто 200–300 в реальности).
- В history-окне применять token-budget вместо message-count: вместо `limit: 30` — взять последние сообщения пока суммарно ≤ 3500 input-токенов.
- Cache system prompt + memory block через `prompt_caching` если OpenRouter/DeepSeek поддерживают (большинство современных моделей — да).

### 2.4 Whale-сценарий (worst-case Premium-юзер)

Один Premium ($12.99/мес) юзер, который **по-настоящему пользуется**:
- 30 chat msgs/день × 30 дней = 900 LLM calls × $0.002 = **$1.80 LLM**
- 50 images/мес (потолок 100/2 токенов) × $0.05 = **$2.50 image**
- TTS click на **каждом** ответе из 900 = 900 × $0.05 = **$45 TTS** ❌ (HOLE-1)
- Builder previews бесплатно = можно сделать 300×5 × $0.05 = **$75 builder** ❌ (HOLE-3, частично режется IMAGE_GEN_LIMIT)
- Memory extractions ~30 × $0.01 = **$0.30**

**COGS = $124.60/мес. Revenue $12.99. Чистый убыток $111.61/мес на одного пользователя**.

Whale-сценарий Premium+ ($24.99/мес, ∞ TTS, +video теоретически):
- LLM: $1.80
- Images: $7.50 (150 max при 300/2)
- TTS: $45
- Builder: $75
- = $129.30 COGS vs $24.99 revenue = **$104.31 убыток/мес**

Это не теоретика — TTS можно автоматизировать кликом в DevTools. Любой умеренно тыкающий power-user уже выходит у нас в минус.

### 2.5 Token packs — анализ scenario «whale купил 3000 за $99.99»

| Что юзер делает с 3000 токенов | Calls возможно | COGS | Net (после 8% эквайринг) |
|---|---|---|---|
| Только chat-images (RealVisXL текущий default) | 1500 | $67.50 | $92 - $67.50 = **+$24.50** ✅ |
| Chat-images если переключим на FLUX schnell | 1500 | $4.50 | **+$87.50** ✅ |
| Chat-images если переключим на Pony | 1500 | $150 | **-$58** ❌ |
| TTS spam (если списываем) — каждое = 1 токен | 3000 | $150 | **-$58** ❌ |
| Mix 50/50 image+TTS | 750+1500 | $112 | **-$20** ❌ |

**Вывод:** даже если HOLE-1 закрыть и брать 1 токен за TTS, токен-pack ломается при достаточном количестве TTS. Нужно либо:
- TTS = 2 токена (тогда 3000 = 1500 TTS = $75 COGS, OK)
- Или daily TTS cap по плану.
- Или цены packs поднять.

### 2.6 Конкретные числовые рекомендации (для обсуждения)

Не финал, но дефолт, от которого предлагаю плясать:

| Параметр | Сейчас | Предлагаю | Обоснование |
|---|---|---|---|
| `IMAGE_TOKEN_COST` (chat-image default) | 2 | **1** при default endpoint FLUX schnell | $0.003 COGS, маржа ×40 при premium |
| `IMAGE_STANDARD_COST` (RealVisXL/fast-sdxl) | n/a | **2** | $0.04 COGS, маржа ×3.25 |
| `IMAGE_PREMIUM_COST` (Pony/Illustrious) | n/a | **5** | $0.08 COGS, маржа ×1.6 — терпимо |
| `TTS_TOKEN_COST` | 0 | **2** | $0.05 COGS, маржа ×2.6 |
| `VIDEO_TOKEN_COST` | 0 | **20** | $0.40 COGS, маржа ×1.3 — close to floor, но video — упрашивающее feature |
| `ADVANCED_LLM_COST` (Magnum v4) | 0 | **2** на сообщение | $0.005 COGS — берём ради «премиум вкуса», margin высокий |
| `FAL_IMAGE_ENDPOINT` default в chat | RealVisXL | **FLUX schnell** | x16 cheaper, визуально приемлемо |
| `premium_monthly.monthlyTokenAllocation` | 100 | **150** | компенсирует cost-per-token увеличение от TTS spend |
| `premium_plus_monthly.monthlyTokenAllocation` | 300 | **500** | то же + video bandwidth |
| `annualUpfrontBonus` premium_yearly | 200 | **100** | убираем pack-replacement |
| `annualUpfrontBonus` premium_plus_yearly | 500 | **200** | то же |
| `tokens_3000` цена | $99.99 | **$129.99** | $0.043/token при VIDEO_TOKEN_COST=20 даёт margin даже на 100% video-spend |
| TTS daily cap | нет | **50/day premium, 200/day premium+** | защита от automated abuse |
| Builder drafts cap | ∞ | **3/lifetime free, ∞ premium** | блокирует HOLE-3 |
| Guest builder endpoint | fast-sdxl/FLUX | **FLUX schnell only** | -8× COGS |
| Guest global daily cap | нет | **Redis-cap $20/day total** | hard ceiling против botnet |

С этими цифрами whale-сценарий Premium:
- 900 LLM = $1.80
- 100 chat-images (FLUX) = $0.30
- 50 TTS (cap) × $0.05 = $2.50  
- Builder cap × FLUX = $0.45
- = **$5.05 COGS vs $12.99 revenue = margin 61%** ✅

И **token-pack scenario**: 3000 токенов = max(1500 TTS) × $0.05 = $75 COGS vs $129.99 revenue - 8% = $120 = **margin 38%** ✅

### 2.7 Что **не** рассматривал в этой версии

- Inngest job-cost (memory extraction $0.01 × 100k msgs/мес = $1k/мес — terпимо, можно перенести на embeddings-only через 6 мес)
- Cloudflare R2 egress (медиа-asset download) — копеечно
- Postgres / pgvector — фикс инфра-cost
- OpenAI embeddings (text-embedding-3-small 1536) — $0.02/1M токенов, мизер
- Refund/chargeback retention policy — отдельный compliance topic

---

## 3. Сравнение крипто-провайдеров

Критерии: **NSFW allowed**, есть **sandbox/test mode**, **низкий dev-effort** (учитывая что webhook уже под NOWPayments), **fees**, **глобальный coverage**.

| Провайдер | NSFW | Sandbox | KYC | Fees | Coins | Прим. |
|---|---|---|---|---|---|---|
| **NOWPayments** | ✅ Разрешён | ✅ есть `https://api-sandbox.nowpayments.io` | merchant only | 0.5%–1% + сеть | 200+ | Webhook уже написан. Custodial, есть авто-конвертация в стейбл. Иногда задержки в high-load. |
| **OxaPay** | ✅ | ✅ | минимальный | 0.4%–0.8% | 50+ | Молодой, мало review, но adult-friendly прямо в TOS. |
| **CoinGate** | ⚠️ серая зона | ✅ | merchant KYC обязателен | 1% | 70+ | EU-incorp, серьёзная процедура onboarding. |
| **BTCPay Server** | ✅ нет ограничений | self-hosted | нет | 0% | BTC/LTC/USDT-tron | Self-hosted: нужен node + reverse-proxy, +неделя dev-work на инфру. |
| **Coinbase Commerce** | ❌ запрещён | — | — | — | — | Прекратили приём новых merchants в 2024, NSFW в blacklist. |
| **TripleA** | ❌ | — | — | — | — | NSFW в restricted list. |
| **BitPay** | ❌ US-focus, NSFW restricted | — | — | — | — | Не подходит. |

### Рекомендация
**NOWPayments sandbox** на первой итерации:
1. Webhook-приёмник уже в коде → экономим день работы
2. Sandbox даёт реальные testnet-coins без денег
3. Adult/NSFW открыто разрешён в TOS
4. Sandbox endpoint `https://api-sandbox.nowpayments.io/v1` плюс отдельный IPN secret

**План Б на проде**, если NOWPayments начнут пушить с задержками / surprise fees:
- **OxaPay** как backup (один webhook, схожий формат) — на старте не закладываем, но архитектуру делаем provider-agnostic (`src/features/billing/crypto/<provider>/`).
- **BTCPay Server** как «no-fee» опция через 6–12 мес, когда обороты оправдают $20/мес на VPS под Bitcoin node.

---

## 4. Архитектурные изменения

### 4.1 Папочная раскладка (предложение)

```
src/features/billing/
  plans.ts                       (уже есть)
  ccbill/                        (уже есть, не трогаем)
  crypto/
    types.ts                     ← общий интерфейс CryptoProvider
    nowpayments/
      client.ts                  ← fetch wrapper для api(-sandbox).nowpayments.io
      invoice.ts                 ← createInvoice({ orderId, amount, currency, ipnUrl, returnUrl })
      verify.ts                  ← HMAC verify (вынесем из route.ts)
    actions.ts                   ← purchaseTokenPackWithCryptoAction, purchasePlanWithCryptoAction
  token-packs/
    actions.ts                   (расширяем: принимать method='card'|'crypto')
    checkout.ts                  (не трогаем)
```

### 4.2 API endpoints (новых маршрутов не вводим где можно — используем server actions)
- Существующий `/api/webhooks/nowpayments` остаётся приёмником. Расширяем парсинг `order_id`:
  - `tokens_{userId}_{sku}_{nonce}` — как сейчас, token packs
  - `sub_{userId}_{planKey}_{nonce}` — новый, для подписок (см. §4.4)

### 4.3 Конфигурация ENV (что ты должен будешь дать)
```
NOWPAYMENTS_API_KEY=                  # из NOWPayments sandbox dashboard
NOWPAYMENTS_IPN_SECRET=               # для HMAC IPN
NOWPAYMENTS_ENV=sandbox|production    # NEW — переключает базовый URL
NOWPAYMENTS_RETURN_URL_OK=            # опционально, иначе берётся из NEXT_PUBLIC_APP_URL
NOWPAYMENTS_RETURN_URL_CANCEL=        # опционально
```

Чтобы запустить sandbox:
1. Регистрация на `https://nowpayments.io` → switch to Sandbox
2. Account → API keys → создать key (ENV=sandbox)
3. Account → Store settings → выставить IPN callback URL = `https://<deploy>/api/webhooks/nowpayments`, сгенерировать IPN Secret
4. Положить значения в Vercel env (preview environment), `NOWPAYMENTS_ENV=sandbox`

### 4.4 Crypto-подписки — решение
Recurring у NOWPayments в beta и плохо документирован. Предлагаю:
- На MVP **крипто = только token packs**. UI плана-подписки в крипте скрываем, показываем тултип «Subscriptions: card only, or buy tokens with crypto».
- Через 1–2 месяца после прода, если будет спрос, добавим «крипто-подписку = buy N месяцев одной транзакцией» (single invoice → создаёт subscription с `currentPeriodEnd = now + N*30d`, без auto-renewal, юзер получает email-нотификацию о повторной оплате).
- Это совпадает с поведением OnlyFans/Brazzers-style sites где crypto ≈ pack tokens.

### 4.5 UI changes
На `/tokens` и `/upgrade`:
- В карточке кнопка «Buy» становится сплитом: `[Pay with card] [Pay with crypto]` или dropdown «Pay options».
- Premium+ Yearly карточка появляется на `/upgrade` (`planOrder` расширяется до 4).
- На `/upgrade` для crypto-кнопки на подписке — disabled state + tooltip (см. §4.4).

### 4.6 Безопасность
- HMAC-проверка уже есть, оставляем
- **Добавить**: проверка `actually_paid >= price_amount * 0.98` (NOWPayments может округлить вниз при колебаниях курса — гранатируем 2% slippage до flag-as-underpaid)
- Все суммы и `tokenAmount` берутся из БД по SKU, **не** из webhook body (`pkg.tokenAmount`, `pkg.priceCents`) — уже так, не регрессируем

---

## 5. Пошаговый план реализации

### Фаза A — закрыть кровотечения (без крипты) — рекомендую разбить на 2 PR

**Фаза A.1 — hot fixes (приоритет, можно за день):**
1. **HOLE-1 fix:** в `src/app/api/chat/messages/[id]/tts/route.ts` добавить:
   - balance pre-check + `spend(..., type:'spend_voice_message', amount: TTS_TOKEN_COST)` с idempotencyKey `tts:${messageId}` (одна оплата за message, потому что результат кэшируется в `audioAssetId`)
   - daily TTS cap через Redis: `tts:day:${userId}:${date}` с лимитом по плану
   - subscription gate (`isPremiumPlan`) — TTS только премиум, free-tier через upgrade prompt
   - `tech_refund` если `generateSpeech` или `persistGeneratedAudio` упали
2. **HOLE-2 fix:** в `src/features/chat/image-job.ts` использовать FLUX schnell как default endpoint (`endpoint: FAL_ENDPOINT_FLUX_SCHNELL`) — самое дешёвое visually-acceptable. При желании юзера boost — отдельная фича.
3. **HOLE-7 fix:** ввести `src/features/billing/cost.ts` с константами `IMAGE_FAST_COST`, `IMAGE_PREMIUM_COST`, `TTS_TOKEN_COST`, `VIDEO_TOKEN_COST`, `ADVANCED_LLM_COST` — единая точка правды.
4. Дописать unit-тесты в `ledger.test.ts` на TTS spend idempotency + smoke-тест что TTS route возвращает 402 при пустом балансе.
5. Manual e2e: создать тест-юзера с 5 токенами, кликнуть ▶ 3 раза, проверить что balance стал 5-3×TTS_TOKEN_COST.

**Фаза A.2 — pricing + plans cleanup:**
1. Утвердить цифры из §2.6 (или твой контр-вариант) и применить в `src/features/billing/plans.ts` + `src/payload/seed/seed-token-packages.ts`
2. Запустить seed, проверить что `payment-transactions` / `subscriptions` features-snapshot не регрессирует у существующих юзеров (читаются из строки subscription, не из PLANS)
3. На `/upgrade` рендерить все 4 плана (2×2 на md+)
4. **HOLE-3:** ввести `MAX_DRAFTS_PER_USER` в `src/features/builder/actions.ts` (3 для free, ∞ для premium); или принудительно роутить builder через FLUX schnell для free.
5. **HOLE-4:** Cloudflare Turnstile перед `generateGuestPreviewAction` + Redis-key глобального дневного guest-USD-cap.
6. **HOLE-8:** в `src/app/api/chat/route.ts:481` history-loop — заменить `limit: 30` на token-budget (≤3500 input tokens). `LLM_MAX_TOKENS` снизить до 400.
7. **HOLE-5:** обновить `annualUpfrontBonus` в plans.ts, плюс i18n строки `billing.plans.*` где упоминается бонус.
8. Обновить translations EN/RU/ES для всех новых copy.

### Фаза B — NOWPayments sandbox + UI (отдельный PR)
1. `src/features/billing/crypto/nowpayments/client.ts` — fetch wrapper, base URL переключается по `NOWPAYMENTS_ENV`
2. `invoice.ts` — `createInvoice({ orderId, amount, currency, ipnUrl, returnUrl })` → `POST /v1/invoice`, возвращает `invoice_url`
3. `src/features/billing/token-packs/actions.ts` — расширить `purchaseTokenPackAction(sku, method)`; при `method='crypto'` дёргать `createInvoice` и `redirect(invoiceUrl)`
4. `/tokens/page.tsx` — карточка получает два таргета `<form>`; кнопка-сплит или dropdown
5. Расширить `parseOrderId` (уже работает для `tokens_*`)
6. Env-валидация: если `crypto` метод выбран без `NOWPAYMENTS_API_KEY` → graceful error + analytics event
7. **Тесты**: unit для `createInvoice` с моком fetch; integration через MSW не обязательно — лучше прогнать руками через sandbox.
8. Manual test: deploy на preview, реальный sandbox-payment, проверка end-to-end (invoice → IPN → ledger grant)

### Фаза C — Quality of life (отдельный PR, можно после прода)
1. Underpayment guard (`actually_paid` vs `price_amount`)
2. Crypto-подписки (single-period buy, см. §4.4)
3. Provider abstraction (`CryptoProvider` interface) — если решим закладывать OxaPay/BTCPay

---

## 6. Риски и открытые вопросы

| Риск / вопрос | Митигация |
|---|---|
| NOWPayments sandbox != prod: IPN формат может отличаться | Прогнать end-to-end в sandbox **до** активации prod ключа; не объединять PR без manual confirmation |
| Webhook redelivery → дубль гранта | Уже защищено `providerEventId` unique + `idempotencyKey` в `grant()` |
| Юзер заплатил меньше из-за network fees | Underpayment guard в Фазе C; до этого допускаем 2% slippage в коде Фазы B |
| Pricing-audit ломает уже купленные подписки/паки | Изменения в `plans.ts` влияют только на **новые** покупки; существующие `subscriptions.features` snapshot не пересчитываем (это правильно по спеку) |
| Yearly бонус нужно ли менять задним числом | Решить отдельно — обычно нет, but document it |
| Какие монеты показывать в UI | NOWPayments отдаст список через `/v1/currencies` или `/v1/full-currencies` — закэшировать на 1 ч; не хардкодим |
| Vercel preview env vs sandbox: callback URL должен быть стабильным | Использовать `https://<branch>--gfai.vercel.app/...` через `NEXT_PUBLIC_APP_URL`; или отдельный subdomain |

---

## 7. Что нужно от тебя, чтобы двигаться дальше

**Для Фазы A.1 (hot fixes, можно делать сразу без твоих решений):**
- Подтверждение что HOLE-1/2/7 — реальные дыры, а не намеренный design choice
- Решение по TTS-гейту: «премиум-only» (рекомендую) или «free тоже, но с balance≥cost»

**Для Фазы A.2:**
- Утвердить или скорректировать цифры в §2.6 (особенно TTS_COST, VIDEO_COST, новые pack prices, annualUpfrontBonus)
- Решение: Cloudflare Turnstile для guest или хватит cookie+global cap?
- Готов ли менять монтанг tokens packs прайс (`tokens_3000` $99.99 → $129.99) — это затрагивает уже сидед БД, нужен пересеед

**Для Фазы B (NOWPayments):**
1. NOWPayments sandbox creds: API key, IPN secret — кладём в Vercel preview env (мне не показывать, я просто получу через `process.env`)
2. Решение по подпискам: оставляем «crypto = packs only» (рекомендую) или хотим crypto-подписку в первой итерации
3. Кому пинговать при manual-test sandbox payment (тебе самому или мне делать через test card flow на стороне NOWPayments)

После согласования — беру Фазу A.1 в первый PR (узкий, hot-fix), потом A.2, потом B.
