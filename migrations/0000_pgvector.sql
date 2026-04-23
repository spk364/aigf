-- This migration must run before any pgvector column migration.
-- Run via: pnpm payload:migrate (or psql manually before first deploy)
CREATE EXTENSION IF NOT EXISTS vector;
