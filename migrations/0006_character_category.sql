-- Adds a `category` column to characters that drives which public catalog page
-- a character appears on: /ai-girlfriend (girls), /ai-anime (anime), /ai-boyfriend (boys).
-- Backfills existing rows: anime art style → 'anime', everything else → 'girls'.
-- The Boys catalog starts empty and gets populated by seed-boy-characters.
--
-- Run manually: psql $DATABASE_URL -f migrations/0006_character_category.sql

BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'girls';

UPDATE characters
  SET category = 'anime'
  WHERE art_style = 'anime';

CREATE INDEX IF NOT EXISTS characters_category_is_published_display_order_idx
  ON characters (category, is_published, display_order);

COMMIT;
