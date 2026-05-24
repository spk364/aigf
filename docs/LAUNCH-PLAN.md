# Launch Plan — путь до конкурентоспособного запуска

Дата: 2026-05-24. Бенчмарк: candy.ai / joi.com / ourdream.ai.

Цель документа — единая «карта» оставшейся работы до публичного запуска, сгруппированная по приоритету. Каждый блок самодостаточен (отдельный PR / feature branch). Статусы обновляются по мере реализации.

Принципы (из спеки, не нарушаем):
- Safety готов **до** first user, не после. Apparent-age классификатор — не опциональный.
- Финансовая корректность: любые $-операции через ledger + atomic tx + идемпотентность.
- Snapshot consistency у conversations. Multilingual (en/ru/es) с первого дня.

Легенда: ⬜ не начато · 🟡 частично · ✅ готово

---

## Что уже работает (baseline на 2026-05-24)

- ✅ Auth + age gate + email verify + Google OAuth
- ✅ Чат: SSE-стриминг (DeepSeek V3), память (pgvector), relationship score
- ✅ Картинки в чате: intent-detection → fal/Atlas → R2, FLUX schnell по умолчанию
- ✅ Билдер персонажей (4 шага) + гостевой билдер
- ✅ TTS-сообщения (MiniMax) со списанием токенов + дневной кап
- ✅ Каталог/лендинг, категорийные страницы, CMS-баннеры, 19 персон × 3 языка
- ✅ Токеномика: ledger, 4 плана, token packs, единый `cost.ts`
- ✅ NOWPayments крипто-чекаут; CCBill (пока mock/sandbox)
- ✅ Observability: PostHog, Sentry, Pino; крон валидатора баланса в `vercel.json`

---

## 🔴 TIER 0 — Блокеры запуска (нельзя пускать живых платящих юзеров)

### T0-1. Safety pipeline (САМЫЙ ВАЖНЫЙ) 🟡 в основном готово
Было: `src/shared/ai/safety.ts` — заглушка. Реализовано в ветке `feat/safety-pipeline`.

Сделано:
- ✅ **Input-scoring движок** `src/features/safety/scoring.ts` — мультиязычный (en/ru/es), hard blocks (underage/age-числа/school+sexual/family+sexual/bestiality/non-consent/celebrity+sexual) + combinatorial (youth vs adult), Unicode word-boundary матчинг. 19 тестов.
- ✅ **Коллекции** `content-flags` + `safety-incidents` + регистрация + миграция `0008`.
- ✅ **Incident/flag recording + escalation** (`incidents.ts`, `escalation.ts`): 3 блока/24ч → suspend, 5/7д → ban, severe (CSAM) → мгновенный ban; пишет в `users.status` + `audit-logs`.
- ✅ **Apparent-age классификатор** `src/shared/ai/apparent-age.ts` (fal-hosted VLM, moondream по умолчанию, env-override). `classifyImageSafety` блокирует apparent-minor / < 21; **fail-closed в prod**, fail-open в dev. 6 тестов парсинга.
- ✅ **Input/output фильтры врезаны** в `/api/chat` (pre-LLM до квоты, post-LLM с `replace`-событием) и `/api/chat/regenerate`.
- ✅ **Enforcement статуса** `account-status.ts` — забаненный/suspended юзер получает 403 в chat-роутах (7 тестов).
- ✅ **Age-гейт превью билдера** (authed sync + poll, guest) через `image-age-gate.ts`.

Осталось перед мерджем/прод:
- ⏳ **Применить миграцию `0008`** (`psql -f` или `PAYLOAD_PUSH_DB=true` один раз) — таблицы должны появиться в БД.
- ⏳ **Верифицировать `AGE_CLASSIFIER_FAL_ENDPOINT`** против живого fal-вызова (точный slug moondream + форма ответа) — единственное, что требует реальной проверки. До этого в prod все картинки будут блокироваться (fail-closed).
- ⏳ **Free-text scoring в полях билдера** (looks/personality/custom occupation) — defense-in-depth; output age-gate уже покрывает главный риск. `validateName` уже есть.
- ⏳ Крон авто-сброса истёкших suspension (сейчас `getAccountState` авто-разблокирует по времени, статус в БД остаётся `suspended` — косметика для админки).

### T0-2. Real CCBill ⬜
Сейчас checkout отдаёт mock URL, MD5-подпись вебхука — stub, DataLink cancel только локально.

Scope: реальный MD5 digest вебхука (`src/app/api/webhooks/ccbill/route.ts`), реальный FlexForm ID в `checkout.ts`, DataLink API cancel в manage-флоу.
Acceptance: подделанный вебхук отклоняется; отмена доходит до CCBill; sandbox end-to-end проходит.

### T0-3. GDPR export + delete ⬜
Scope: `/settings/account` → «Export my data» (JSON dump всех user-rows) + «Delete account» (soft-delete `deletedAt` + cascade через 90 дней).
Acceptance: экспорт отдаёт полный дамп; удаление помечает аккаунт и запускает отложенный cascade.

### T0-4. Вебхуки через Inngest (надёжность денег) ⬜
Сейчас вебхуки обрабатываются синхронно в запросе. Идемпотентность по `providerEventId` есть, ретраев нет.
Scope: вынести обработку CCBill/NOWPayments в Inngest-функции (save-first → async process с ретраями). Туда же memory-extraction (сейчас fire-and-forget).
Acceptance: упавшая обработка вебхука ретраится; дубли не создают двойной grant.

---

## 🟠 TIER 1 — Паритет с конкурентами (есть у всех троих, у нас нет)

### T1-1. Галерея на персонажа ⬜ (высокий ROI, низкая сложность)
Данные уже в `media-assets`. Нужен UI + запрос. Картинки сейчас живут только в ленте чата.
Scope: route `/[locale]/chat/[id]/gallery` (или таб на странице персонажа), grid из всех `media-assets` пары (user, character), лайтбокс, blur для free-tier.
Acceptance: все сгенерированные фото персонажа листаются в одной сетке; работает на mobile.

### T1-2. Settings / Profile хаб ⬜ (распланировано в ROADMAP-dashboard.md M2)
`users.nsfwEnabled` есть в схеме, UI-тумблера нет.
Scope: `/[locale]/settings` с подстраницами profile / content (NSFW toggle) / account (смена пароля, удаление → связать с T0-3). Левый rail + контент.
Acceptance: 5 подстраниц рендерятся и persist'ят через Payload; в хедере появляется «Settings».

### T1-3. Явные affordances запроса медиа в чате ⬜
Сейчас только regex intent-detection.
Scope: кнопки «попроси фото / селфи», quick-выбор позы/наряда/локации → подставляются в scene description. Boost-quality toggle (+токены, `IMAGE_STANDARD_COST`).
Acceptance: клик по «селфи» инициирует генерацию без печати текста; boost даёт премиум-эндпоинт за доп. токены.

### T1-4. Face / character consistency аудит ⬜
Дефолт ушёл на Atlas/FLUX без face-lock; IP-Adapter только на fal. Проверить, держится ли лицо между фото.
Scope: тест-прогон 10 генераций одного персонажа; если лицо плывёт — вернуть IP-Adapter путь или reference-image conditioning на дефолтном пайплайне.
Acceptance: лицо персонажа узнаваемо между разными сценами.

---

## 🟢 TIER 2 — Дифференциация и retention (игра на рост после запуска)

### T2-1. Видео для юзеров ⬜
Генерация видео есть только в admin-роуте; `VIDEO_TOKEN_COST=20` заведён.
Scope: юзерский путь image-to-video (Premium+), квота `monthlyVideoQuota`, spend через ledger, врезка safety (T0-1) на видео-выход.

### T2-2. Retention-механики ⬜
Scope: daily login bonus (free токены), proactive messages («персонаж пишет первым»), referral program. Сильнейший D7-retention.

### T2-3. Telegram-бот MVP ⬜ (план в telegram-integration-plan.md, этап 1)
Для CIS-рынка (таргет #1) — потенциальный козырь против западных конкурентов.
Scope: grammY webhook, deep-link линковка `telegramId ↔ userId`, текстовый чат через тот же pipeline, единый ledger.

### T2-4. Voice call (real-time) ⬜ (самый дорогой, самый сильный апсейл)
У candy/ourdream — флагманская премиум-фича. У нас TTS-сообщения есть, звонка (STT + TTS loop) нет.
Scope: STT (Whisper) + TTS loop, premium-gate, спенд через ledger.

---

## Рекомендуемая последовательность

```
Спринт 1 (блокеры):     T0-1 safety → T0-2 CCBill → T0-3 GDPR → T0-4 Inngest
Спринт 2 (паритет):     T1-1 галерея → T1-2 settings → T1-3 media-кнопки → T1-4 face-аудит
Спринт 3 (рост):        T2-1 видео → T2-2 retention → T2-3 Telegram → T2-4 voice call
```

Старт работы: **T0-1 Safety pipeline** — единственный пункт, без которого запуск юридически невозможен.
