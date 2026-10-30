-- Memory v2 (see src/features/memory/memory-job.ts):
--
-- 1. memory_profiles — one always-in-prompt "core memory" document per
--    (user, character) pair, rewritten by the background memory job.
-- 2. memory_entries.embedding: vector(1536) → halfvec(512). text-embedding-3-small
--    supports shortened output (`dimensions: 512`) with little retrieval loss,
--    and halfvec stores 2 bytes per dimension: ~1 KB per fact instead of ~6 KB.
--    Existing vectors are DISCARDED (they're the wrong size);
--    re-embed with `pnpm backfill:memory-embeddings` afterwards.
-- 3. The HNSW index from 0001 is dropped — see the note at the bottom.
--
-- Supersedes 0001_memory_embeddings.sql: it creates the column itself if
-- missing, so a fresh database needs only 0000_pgvector.sql + this file.
-- Don't re-run 0001 after this one — its CREATE INDEX uses vector_cosine_ops,
-- which fails on a halfvec column.
--
-- Matches Payload's auto-generated table conventions so a subsequent
-- PAYLOAD_PUSH_DB=true boot is a no-op. Requires pgvector >= 0.7 (halfvec).
--
-- Run: pnpm migrate:memory   (or psql $DATABASE_URL -f migrations/0012_memory_v2.sql)

BEGIN;

-- ── memory_profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_profiles (
  id                serial PRIMARY KEY,
  user_id_id        integer NOT NULL,
  character_id_id   integer NOT NULL,
  profile           varchar,
  updated_at        timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at        timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT memory_profiles_user_id_id_users_id_fk
    FOREIGN KEY (user_id_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT memory_profiles_character_id_id_characters_id_fk
    FOREIGN KEY (character_id_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS memory_profiles_user_id_idx ON memory_profiles (user_id_id);
CREATE INDEX IF NOT EXISTS memory_profiles_character_id_idx ON memory_profiles (character_id_id);
CREATE INDEX IF NOT EXISTS memory_profiles_updated_at_idx ON memory_profiles (updated_at);
CREATE INDEX IF NOT EXISTS memory_profiles_created_at_idx ON memory_profiles (created_at);
-- One profile per pair — the job relies on this to resolve a create race.
-- Table-prefixed on purpose: index names are schema-wide, and the name Payload
-- would generate for a compound index here ("userId_characterId_idx") is
-- already taken by conversations — CREATE ... IF NOT EXISTS would then
-- silently skip it and leave the pair non-unique.
CREATE UNIQUE INDEX IF NOT EXISTS memory_profiles_user_character_unique
  ON memory_profiles (user_id_id, character_id_id);

-- Payload's locked-documents rels table needs a column per collection, or every
-- admin-panel find() fails with `column ... memory_profiles_id does not exist`.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS memory_profiles_id integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_memory_profiles_fk'
  ) THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_memory_profiles_fk
      FOREIGN KEY (memory_profiles_id) REFERENCES memory_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_memory_profiles_id_idx
  ON payload_locked_documents_rels (memory_profiles_id);

-- ── memory_entries.embedding → halfvec(512) ──────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_entries' AND column_name = 'embedding' AND udt_name = 'vector'
  ) THEN
    DROP INDEX IF EXISTS memory_entries_embedding_hnsw;
    ALTER TABLE memory_entries ALTER COLUMN embedding TYPE halfvec(512) USING NULL;
    UPDATE memory_entries SET embedding_model = NULL;
  END IF;
END $$;

ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS embedding halfvec(512);

-- No ANN index on purpose. Every search is filtered to one (user, character)
-- pair, which the job caps at a few hundred rows, and the btree index on
-- (user_id_id, character_id_id, deleted_at) narrows to those rows first — an
-- exact scan over them is cheap and has perfect recall. HNSW would only add
-- write cost and size, and with a selective WHERE pgvector's HNSW scan can
-- return fewer than LIMIT rows (it filters AFTER the ef_search candidates).
DROP INDEX IF EXISTS memory_entries_embedding_hnsw;

COMMIT;
