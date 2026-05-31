-- Adds users.purged_at — set by the GDPR purge cron once a soft-deleted
-- account's 90-day grace window passes and its personal data is hard-deleted +
-- anonymized. Distinct from deleted_at (the soft-delete marker).
--
-- Additive + idempotent (IF NOT EXISTS) so a PAYLOAD_PUSH_DB boot is a no-op.
--
-- Run manually: psql $DATABASE_URL -f migrations/0010_user_purged_at.sql

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS purged_at timestamp(3) with time zone;

CREATE INDEX IF NOT EXISTS users_purged_at_idx ON users (purged_at);

COMMIT;
