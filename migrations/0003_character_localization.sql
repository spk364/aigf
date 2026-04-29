-- Migration: Switch characters collection to Payload localization.
-- Collapses 3 language rows per persona into 1 row + characters_locales table.
--
-- Run manually: psql $DATABASE_URL -f migrations/0003_character_localization.sql
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
--
-- After applying: restart the app so Payload syncs any remaining schema details,
-- then run `pnpm seed` to re-seed preset characters via the new locale-aware seed.

BEGIN;

-- ── 1. Create locales table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters_locales (
  id          serial      PRIMARY KEY,
  _locale     varchar(10) NOT NULL,
  _parent_id  integer     NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name        varchar,
  tagline     varchar,
  short_bio   text,
  system_prompt text,
  communication_style jsonb,
  backstory   jsonb,
  CONSTRAINT characters_locales_unique UNIQUE (_locale, _parent_id)
);

-- ── 2. Populate locales from EN preset rows (canonical) ───────────────────────
INSERT INTO characters_locales
  (_locale, _parent_id, name, tagline, short_bio, system_prompt, communication_style, backstory)
SELECT
  'en',
  id,
  name,
  tagline,
  short_bio,
  system_prompt,
  communication_style,
  backstory
FROM characters
WHERE kind = 'preset' AND language = 'en'
ON CONFLICT (_locale, _parent_id) DO NOTHING;

-- ── 3. Populate RU and ES locales, matched to EN canonical via locale_group_id ─
INSERT INTO characters_locales
  (_locale, _parent_id, name, tagline, short_bio, system_prompt, communication_style, backstory)
SELECT
  c_lang.language,
  c_en.id,
  c_lang.name,
  c_lang.tagline,
  c_lang.short_bio,
  c_lang.system_prompt,
  c_lang.communication_style,
  c_lang.backstory
FROM characters c_lang
JOIN characters c_en
  ON c_en.locale_group_id = c_lang.locale_group_id
 AND c_en.language = 'en'
 AND c_en.kind = 'preset'
WHERE c_lang.kind = 'preset'
  AND c_lang.language IN ('ru', 'es')
ON CONFLICT (_locale, _parent_id) DO NOTHING;

-- ── 4. Populate locales for custom characters (single language each) ───────────
INSERT INTO characters_locales
  (_locale, _parent_id, name, tagline, short_bio, system_prompt, communication_style, backstory)
SELECT
  COALESCE(language, 'en'),
  id,
  name,
  tagline,
  short_bio,
  system_prompt,
  communication_style,
  backstory
FROM characters
WHERE kind = 'custom'
ON CONFLICT (_locale, _parent_id) DO NOTHING;

-- ── 5. Fix EN preset slugs: strip the '-en' suffix ───────────────────────────
UPDATE characters
SET slug = REGEXP_REPLACE(slug, '-en$', '')
WHERE kind = 'preset'
  AND language = 'en'
  AND slug LIKE '%-en';

-- ── 6. Reroute conversations from RU/ES preset rows → EN canonical ────────────
UPDATE conversations
SET character_id_id = c_en.id
FROM characters c_lang
JOIN characters c_en
  ON c_en.locale_group_id = c_lang.locale_group_id
 AND c_en.language = 'en'
 AND c_en.kind = 'preset'
WHERE conversations.character_id_id = c_lang.id
  AND c_lang.kind = 'preset'
  AND c_lang.language IN ('ru', 'es');

-- ── 7. Delete non-canonical (RU, ES) preset rows ─────────────────────────────
DELETE FROM characters
WHERE kind = 'preset'
  AND language IN ('ru', 'es');

-- ── 8. Drop localized columns from main table ─────────────────────────────────
ALTER TABLE characters DROP COLUMN IF EXISTS name;
ALTER TABLE characters DROP COLUMN IF EXISTS tagline;
ALTER TABLE characters DROP COLUMN IF EXISTS short_bio;
ALTER TABLE characters DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE characters DROP COLUMN IF EXISTS communication_style;
ALTER TABLE characters DROP COLUMN IF EXISTS backstory;
ALTER TABLE characters DROP COLUMN IF EXISTS language;
ALTER TABLE characters DROP COLUMN IF EXISTS locale_group_id;

-- ── 9. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS characters_locales_parent_idx ON characters_locales (_parent_id);
CREATE INDEX IF NOT EXISTS characters_locales_locale_idx  ON characters_locales (_locale);

COMMIT;
