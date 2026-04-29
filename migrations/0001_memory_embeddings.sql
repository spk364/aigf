-- Supplemental migration: add vector embedding column to memory_entries.
-- Must run AFTER `pnpm payload:migrate` has created the memory_entries table.
-- Requires pgvector extension (migrations/0000_pgvector.sql must run first).
--
-- Run manually: psql $DATABASE_URL -f migrations/0001_memory_embeddings.sql
-- Or via script: pnpm migrate:memory

ALTER TABLE memory_entries
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for cosine similarity search (spec §3.6 top-5 retrieval).
-- m=16, ef_construction=64 are conservative defaults suitable for < 1M rows.
CREATE INDEX IF NOT EXISTS memory_entries_embedding_hnsw
  ON memory_entries
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
