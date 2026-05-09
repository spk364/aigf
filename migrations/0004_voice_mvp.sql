-- Voice MVP: add voice catalog id + cached greeting clip to characters,
-- audio_asset_id to messages, and accept new media-asset kinds.
--
-- Run manually: psql $DATABASE_URL -f migrations/0004_voice_mvp.sql
-- Safe to re-run (uses IF NOT EXISTS guards).

BEGIN;

-- ── characters: voice config + cached greeting ───────────────────────────────
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS voice_id text;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS greeting_audio_asset_id_id integer
    REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS characters_voice_id_idx
  ON characters (voice_id) WHERE voice_id IS NOT NULL;

-- ── messages: cached TTS asset ───────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS audio_asset_id_id integer
    REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_audio_asset_idx
  ON messages (audio_asset_id_id) WHERE audio_asset_id_id IS NOT NULL;

-- The `type` column is a Postgres enum in some Payload setups and a plain
-- text/varchar in others (Payload v3 picks based on whether `enumName` is
-- set). Try both — first the enum path, then the no-op for varchar.
DO $$
BEGIN
  -- Add 'voice' to messages.type enum if it exists.
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_messages_type'
      AND NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = t.oid AND enumlabel = 'voice'
      )
    LIMIT 1
  ) THEN
    ALTER TYPE enum_messages_type ADD VALUE IF NOT EXISTS 'voice';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- enum doesn't exist → varchar column, no-op needed
  NULL;
END$$;

-- Same dance for media_assets.kind enum.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'enum_media_assets_kind'
    LIMIT 1
  ) THEN
    ALTER TYPE enum_media_assets_kind ADD VALUE IF NOT EXISTS 'voice_preview';
    ALTER TYPE enum_media_assets_kind ADD VALUE IF NOT EXISTS 'character_voice_greeting';
    ALTER TYPE enum_media_assets_kind ADD VALUE IF NOT EXISTS 'voice_message';
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END$$;

COMMIT;
