-- Adds the 'spend_character_creation' value to the token-transactions type enum
-- so finalizing a custom character can debit tokens through the ledger.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on some
-- Postgres versions, so this migration is intentionally NOT wrapped in
-- BEGIN/COMMIT. IF NOT EXISTS makes it idempotent.
--
-- Run manually: psql $DATABASE_URL -f migrations/0011_token_tx_character_creation.sql

ALTER TYPE enum_token_transactions_type ADD VALUE IF NOT EXISTS 'spend_character_creation';
