-- Collapse duplicate conversations down to one unified thread per
-- (user, character). Historically every /chat/new tap created a fresh
-- conversation, so "your conversations" showed the same companion many times.
-- The app code now finds-or-reuses the existing thread; this migration repairs
-- the rows already in the database.
--
-- For each (user, character) group of live (non-deleted) conversations with
-- more than one row it:
--   1. re-points every message from the duplicates onto the canonical thread,
--   2. re-points every memory-entry the same way,
--   3. recomputes the canonical's denormalized counters (message_count,
--      last_message_at, last_message_preview, days_active_count,
--      relationship_score — formula per spec §3.7 / relationship-score.ts),
--   4. soft-deletes + archives the now-empty duplicate threads.
-- Canonical = most-recently-active (last_message_at, then created_at, then id),
-- matching the app's find-existing-conversation tiebreak.
--
-- NO TEMP TABLES: each statement recomputes the duplicate->canonical map via an
-- inline CTE so this runs identically in the Supabase/Neon SQL editor (which
-- auto-commits per statement and would drop ON COMMIT DROP temp tables), via
-- psql, and via the pg runner. Statement order matters: re-point (1,2) and
-- recompute (3) all run while the duplicates are still live (so the map is
-- non-empty and recompute sees the moved messages); the soft-delete (4) is last.
--
-- IDEMPOTENT: after a full run the duplicates are soft-deleted, so every group
-- has a single live row, the map is empty, and a re-run touches 0 rows.
--
-- Payload Postgres column naming: snake_case(fieldName) + '_id' for relations,
-- so userId -> user_id_id, characterId -> character_id_id,
-- conversationId -> conversation_id_id (see migrations/0008 header).
--
-- Run manually: psql $DATABASE_URL -f migrations/0012_merge_duplicate_conversations.sql
-- Or via script: pnpm migrate:conversations
-- Or paste this whole file into the Supabase/Neon SQL editor and run.
--
-- Dry-run (inspect affected groups without writing):
--   SELECT user_id_id, character_id_id, count(*) AS threads
--   FROM conversations WHERE deleted_at IS NULL
--   GROUP BY user_id_id, character_id_id HAVING count(*) > 1
--   ORDER BY threads DESC;

BEGIN;

-- 1. Re-point messages from duplicates onto the canonical thread.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER w       AS rn,
    first_value(id) OVER w    AS canonical_id
  FROM conversations
  WHERE deleted_at IS NULL
  WINDOW w AS (
    PARTITION BY user_id_id, character_id_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  )
),
merge_map AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
UPDATE messages m
SET conversation_id_id = mm.canonical_id
FROM merge_map mm
WHERE m.conversation_id_id = mm.dup_id;

-- 2. Re-point memory entries from duplicates onto the canonical thread.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER w       AS rn,
    first_value(id) OVER w    AS canonical_id
  FROM conversations
  WHERE deleted_at IS NULL
  WINDOW w AS (
    PARTITION BY user_id_id, character_id_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  )
),
merge_map AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
UPDATE memory_entries me
SET conversation_id_id = mm.canonical_id
FROM merge_map mm
WHERE me.conversation_id_id = mm.dup_id;

-- 3. Recompute denormalized counters on canonicals that absorbed duplicates,
--    from the unified message set (user/assistant rows, non-deleted). Runs
--    before the soft-delete so the canonical set is still discoverable and the
--    moved messages (committed in steps 1-2) are visible.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER w       AS rn,
    first_value(id) OVER w    AS canonical_id
  FROM conversations
  WHERE deleted_at IS NULL
  WINDOW w AS (
    PARTITION BY user_id_id, character_id_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  )
),
affected AS (
  SELECT DISTINCT canonical_id AS conv_id FROM ranked WHERE rn > 1
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

-- 4. Soft-delete + archive the now-empty duplicate conversations (last, so the
--    map above stays non-empty for steps 1-3).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER w       AS rn,
    first_value(id) OVER w    AS canonical_id
  FROM conversations
  WHERE deleted_at IS NULL
  WINDOW w AS (
    PARTITION BY user_id_id, character_id_id
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  )
),
merge_map AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
UPDATE conversations c
SET deleted_at = now(), status = 'archived'
FROM merge_map mm
WHERE c.id = mm.dup_id
  AND c.deleted_at IS NULL;

COMMIT;
