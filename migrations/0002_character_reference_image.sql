-- Add reference image fields to characters table.
-- reference_image_id: FK to media_assets, holds the reference portrait.
-- reference_image_url: denormalized public URL for fast access in generation.
--
-- Run manually: psql $DATABASE_URL -f migrations/0002_character_reference_image.sql
-- Or via: pnpm payload:migrate (once the tsx/ESM resolution issue is fixed)

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS reference_image_id integer REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS reference_image_url text;
