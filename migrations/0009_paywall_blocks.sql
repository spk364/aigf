-- Migration for the paywall_blocks collection (added on main in PR #86 without
-- an accompanying SQL migration — main relies on PAYLOAD_PUSH_DB to auto-create
-- the schema, which leaves any DB without push broken). Adds the missing
-- tables + the paywall_blocks_id polymorphic-rels columns so Payload's
-- generated locked-documents query stops failing on environments where push is
-- off (every API write triggers that join).
--
-- Mirrors Payload's table conventions verified against banners + the safety
-- collections in 0008. Relationship column rule: snake_case(fieldName) + '_id'
-- (so `image` → `image_id`).
--
-- Run manually: psql $DATABASE_URL -f migrations/0009_paywall_blocks.sql

BEGIN;

-- ── enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_paywall_blocks_surface') THEN
    CREATE TYPE enum_paywall_blocks_surface AS ENUM
      ('exit_intent', 'chat_paywall_quota', 'chat_paywall_tokens', 'chat_paywall_premium');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_paywall_blocks_discount_plan_key') THEN
    CREATE TYPE enum_paywall_blocks_discount_plan_key AS ENUM
      ('premium_monthly', 'premium_yearly', 'premium_plus_monthly', 'premium_plus_yearly');
  END IF;
END $$;

-- ── main paywall_blocks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paywall_blocks (
  id                  serial PRIMARY KEY,
  internal_name       varchar NOT NULL,
  surface             enum_paywall_blocks_surface NOT NULL,
  is_active           boolean DEFAULT true,
  image_id            integer,
  image_url           varchar,
  discount_percent    numeric,
  discount_plan_key   enum_paywall_blocks_discount_plan_key,
  promo_code          varchar,
  expires_in_hours    numeric DEFAULT 24,
  updated_at          timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at          timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT paywall_blocks_image_id_media_assets_id_fk
    FOREIGN KEY (image_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS paywall_blocks_surface_idx ON paywall_blocks (surface);
CREATE INDEX IF NOT EXISTS paywall_blocks_is_active_idx ON paywall_blocks (is_active);
CREATE INDEX IF NOT EXISTS paywall_blocks_surface_active_idx ON paywall_blocks (surface, is_active);
CREATE INDEX IF NOT EXISTS paywall_blocks_image_idx ON paywall_blocks (image_id);
CREATE INDEX IF NOT EXISTS paywall_blocks_updated_at_idx ON paywall_blocks (updated_at);
CREATE INDEX IF NOT EXISTS paywall_blocks_created_at_idx ON paywall_blocks (created_at);

-- ── locales table (localized text fields per locale) ─────────────────────────
CREATE TABLE IF NOT EXISTS paywall_blocks_locales (
  id                       serial PRIMARY KEY,
  _locale                  varchar(10) NOT NULL,
  _parent_id               integer NOT NULL,
  badge                    varchar,
  headline                 varchar,
  subheadline              text,
  primary_cta              varchar,
  secondary_cta            varchar,
  decline_cta              varchar,
  price_per_period_label   varchar,
  expires_in_label         varchar,
  CONSTRAINT paywall_blocks_locales_locale_parent_id_unique UNIQUE (_locale, _parent_id),
  CONSTRAINT paywall_blocks_locales_parent_fk
    FOREIGN KEY (_parent_id) REFERENCES paywall_blocks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS paywall_blocks_locales_locale_parent_idx
  ON paywall_blocks_locales (_locale, _parent_id);

-- ── perks (localized array — rows per locale) ────────────────────────────────
CREATE TABLE IF NOT EXISTS paywall_blocks_perks (
  id          serial PRIMARY KEY,
  _order      integer NOT NULL,
  _parent_id  integer NOT NULL,
  _locale     varchar(10) NOT NULL,
  text        varchar,
  CONSTRAINT paywall_blocks_perks_parent_fk
    FOREIGN KEY (_parent_id) REFERENCES paywall_blocks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS paywall_blocks_perks_order_idx ON paywall_blocks_perks (_order);
CREATE INDEX IF NOT EXISTS paywall_blocks_perks_parent_idx ON paywall_blocks_perks (_parent_id);
CREATE INDEX IF NOT EXISTS paywall_blocks_perks_locale_parent_idx
  ON paywall_blocks_perks (_locale, _parent_id);

-- ── Payload polymorphic rels — add paywall_blocks_id FK column ───────────────
-- THIS is the column whose absence makes the locked-documents JOIN fail in
-- production-like environments (push=false). Adding it is the critical fix.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS paywall_blocks_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_paywall_blocks_fk') THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_paywall_blocks_fk
      FOREIGN KEY (paywall_blocks_id) REFERENCES paywall_blocks(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_paywall_blocks_id_idx
  ON payload_locked_documents_rels (paywall_blocks_id);

ALTER TABLE payload_preferences_rels
  ADD COLUMN IF NOT EXISTS paywall_blocks_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_paywall_blocks_fk') THEN
    ALTER TABLE payload_preferences_rels
      ADD CONSTRAINT payload_preferences_rels_paywall_blocks_fk
      FOREIGN KEY (paywall_blocks_id) REFERENCES paywall_blocks(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_preferences_rels_paywall_blocks_id_idx
  ON payload_preferences_rels (paywall_blocks_id);

COMMIT;
