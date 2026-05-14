-- Adds the Banners collection used by HeroBanner on the public catalog pages
-- (/, /ai-girlfriend, /ai-anime, /ai-boyfriend). Each banner can target one
-- or several pages via the `pages` multi-select.
--
-- Matches Payload's auto-generated table conventions so a subsequent
-- PAYLOAD_PUSH_DB=true boot is a no-op.
--
-- Run manually: psql $DATABASE_URL -f migrations/0007_banners.sql

BEGIN;

-- ── enum for pages multi-select ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_banners_pages') THEN
    CREATE TYPE enum_banners_pages AS ENUM ('home', 'girls', 'anime', 'boys');
  END IF;
END $$;

-- ── main banners table (non-localized scalar fields) ─────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id              serial PRIMARY KEY,
  internal_name   varchar NOT NULL,
  image_id        integer,
  image_url       varchar,
  cta_href        varchar,
  hue_a           numeric DEFAULT 320,
  hue_b           numeric DEFAULT 280,
  display_order   numeric DEFAULT 0,
  is_active       boolean DEFAULT true,
  starts_at       timestamp(3) with time zone,
  ends_at         timestamp(3) with time zone,
  deleted_at      timestamp(3) with time zone,
  updated_at      timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at      timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT banners_image_id_media_assets_id_fk
    FOREIGN KEY (image_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS banners_image_idx
  ON banners (image_id);

CREATE INDEX IF NOT EXISTS banners_is_active_idx
  ON banners (is_active);

CREATE INDEX IF NOT EXISTS banners_deleted_at_idx
  ON banners (deleted_at);

CREATE INDEX IF NOT EXISTS banners_is_active_display_order_idx
  ON banners (is_active, display_order);

CREATE INDEX IF NOT EXISTS banners_updated_at_idx
  ON banners (updated_at);

CREATE INDEX IF NOT EXISTS banners_created_at_idx
  ON banners (created_at);

-- ── locales table (localized text fields per locale) ─────────────────────────
CREATE TABLE IF NOT EXISTS banners_locales (
  id          serial PRIMARY KEY,
  _locale     varchar(10) NOT NULL,
  _parent_id  integer NOT NULL,
  eyebrow     varchar,
  title       varchar,
  subtitle    text,
  cta_label   varchar,
  CONSTRAINT banners_locales_locale_parent_id_unique UNIQUE (_locale, _parent_id),
  CONSTRAINT banners_locales_parent_fk
    FOREIGN KEY (_parent_id) REFERENCES banners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS banners_locales_locale_parent_idx
  ON banners_locales (_locale, _parent_id);

-- ── pages multi-select array table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners_pages (
  "order"   integer NOT NULL,
  parent_id integer NOT NULL,
  value     enum_banners_pages,
  id        serial PRIMARY KEY,
  CONSTRAINT banners_pages_parent_fk
    FOREIGN KEY (parent_id) REFERENCES banners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS banners_pages_order_idx
  ON banners_pages ("order");

CREATE INDEX IF NOT EXISTS banners_pages_parent_idx
  ON banners_pages (parent_id);

COMMIT;
