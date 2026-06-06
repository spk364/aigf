-- Collapse duplicate conversations down to one unified thread per
-- (user, character). Historically every /chat/new tap created a fresh
-- conversation, so "your conversations" showed the same companion many times.
-- The app code now finds-or-reuses the existing thread; this migration repairs
-- the rows already in the database.
--
-- For each (user, character) group of live (non-deleted) conversations with
-- more than one row it:
--   1. picks a canonical thread (most-recently-active, matching the app's
--      find-existing-conversation tiebreak: last_message_at, then created_at, then id),
--   2. re-points every message and memory-entry from the duplicates onto it,
--   3. soft-deletes + archives the now-empty duplicate threads,
--   4. recomputes the canonical's denormalized counters (message_count,
--      last_message_at, last_message_preview, days_active_count,
--      relationship_score — formula per spec §3.7 / relationship-score.ts).
--
-- IDEMPOTENT: a second run finds no live duplicates (they were soft-deleted) and
-- is a no-op. Wrapped in a single transaction.
--
-- Payload Postgres column naming: snake_case(fieldName) + '_id' for relations,
-- so userId -> user_id_id, characterId -> character_id_id,
-- conversationId -> conversation_id_id (see migrations/0008 header).
--
-- Run manually: psql $DATABASE_URL -f migrations/0012_merge_duplicate_conversations.sql
-- Or via script: pnpm migrate:conversations
--
-- Dry-run (inspect affected groups without writing):
--   SELECT user_id_id, character_id_id, count(*) AS threads
--   FROM conversations WHERE deleted_at IS NULL
--   GROUP BY user_id_id, character_id_id HAVING count(*) > 1
--   ORDER BY threads DESC;

BEGIN;

-- 1. Rank live conversations within each (user, character) group and capture the
--    canonical (rank 1) id alongside every row.
CREATE TEMP TABLE conv_canonical ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    c.id,
    row_number() OVER w  AS rn,
    first_value(c.id) OVER w AS canonical_id
  FROM conversations c
  WHERE c.deleted_at IS NULL
  WINDOW w AS (
    PARTITION BY c.user_id_id, c.character_id_id
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id DESC
  )
)
SELECT id, canonical_id, rn FROM ranked;

-- Duplicate -> canonical map (only groups that actually have more than one thread).
CREATE TEMP TABLE conv_merge_map ON COMMIT DROP AS
SELECT id AS dup_id, canonical_id
FROM conv_canonical
WHERE rn > 1;

-- 2a. Re-point messages from duplicates onto the canonical thread.
UPDATE messages m
SET conversation_id_id = mm.canonical_id
FROM conv_merge_map mm
WHERE m.conversation_id_id = mm.dup_id;

-- 2b. Re-point memory entries from duplicates onto the canonical thread.
UPDATE memory_entries me
SET conversation_id_id = mm.canonical_id
FROM conv_merge_map mm
WHERE me.conversation_id_id = mm.dup_id;

-- 3. Soft-delete + archive the now-empty duplicate conversations.
UPDATE conversations c
SET deleted_at = now(), status = 'archived'
FROM conv_merge_map mm
WHERE c.id = mm.dup_id
  AND c.deleted_at IS NULL;

-- 4. Recompute denormalized counters on canonicals that absorbed duplicates,
--    from the unified message set (user/assistant rows, non-deleted).
WITH affected AS (
  SELECT DISTINCT canonical_id AS conv_id FROM conv_merge_map
),
agg AS (
  SELECT
    m.conversation_id_id AS conv_id,
    count(*)            AS msg_count,
    max(m.created_at)   AS last_at,
    count(DISTINCT (m.created_at AT TIME ZONE 'UTC')::date) AS days_active
  FROM messages m
  WHERE m.deleted_at IS NULL
    AND m.role IN ('user', 'assistant')
    AND m.conversation_id_id IN (SELECT conv_id FROM affected)
  GROUP BY m.conversation_id_id
),
last_preview AS (
  SELECT DISTINCT ON (m.conversation_id_id)
    m.conversation_id_id AS conv_id,
    left(coalesce(m.content, ''), 120) AS preview
  FROM messages m
  WHERE m.deleted_at IS NULL
    AND m.role IN ('user', 'assistant')
    AND m.conversation_id_id IN (SELECT conv_id FROM affected)
  ORDER BY m.conversation_id_id, m.created_at DESC
)
UPDATE conversations c
SET
  message_count        = coalesce(agg.msg_count, 0),
  last_message_at      = coalesce(agg.last_at, c.last_message_at),
  last_message_preview = coalesce(lp.preview, c.last_message_preview),
  days_active_count    = coalesce(agg.days_active, 0),
  -- score = min(100, max(0, round(msgs*0.1 + daysActive*2 - daysSinceLast*0.5)))
  relationship_score = LEAST(100, GREATEST(0, round(
    coalesce(agg.msg_count, 0) * 0.1
    + coalesce(agg.days_active, 0) * 2
    - CASE
        WHEN coalesce(agg.last_at, c.last_message_at) IS NULL THEN 0
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - coalesce(agg.last_at, c.last_message_at))) / 86400.0) * 0.5
      END
  )))
FROM affected a
LEFT JOIN agg         ON agg.conv_id = a.conv_id
LEFT JOIN last_preview lp ON lp.conv_id = a.conv_id
WHERE c.id = a.conv_id;

COMMIT;
