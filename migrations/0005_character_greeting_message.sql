-- Adds a localized greeting message to characters. Stored on the locales
-- table because the column is `localized: true` in Payload. The greeting
-- is shown as the first assistant message when a new conversation starts,
-- generated once per character (per locale) so users see the same opener.
--
-- Run manually: psql $DATABASE_URL -f migrations/0005_character_greeting_message.sql

BEGIN;

ALTER TABLE characters_locales
  ADD COLUMN IF NOT EXISTS greeting_message text;

COMMIT;
