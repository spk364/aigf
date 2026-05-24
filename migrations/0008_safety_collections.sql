-- Adds the safety pipeline collections: content_flags (high-volume behavioural
-- flags driving N-strike escalation) and safety_incidents (review-worthy events,
-- 7-year retention for CSAM-class). Part of the T0-1 safety pipeline.
--
-- Matches Payload's auto-generated table conventions so a subsequent
-- PAYLOAD_PUSH_DB=true boot is a no-op. Payload snake_cases the field name AND
-- appends `_id` to every relationship column, so `userId` → `user_id_id`,
-- `relatedMessageId` → `related_message_id_id`, `resolvedBy` → `resolved_by_id`.
-- (Verified against the existing token_transactions table: user_id_id,
-- related_message_id_id, admin_user_id_id.)
--
-- FKs use ON DELETE SET NULL (not CASCADE) so incident records survive user
-- deletion for the retention window — users are soft-deleted anyway.
--
-- Run manually: psql $DATABASE_URL -f migrations/0008_safety_collections.sql

BEGIN;

-- ── enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_content_flags_flag_type') THEN
    CREATE TYPE enum_content_flags_flag_type AS ENUM
      ('blocked_input', 'blocked_output', 'blocked_image', 'rate_limit_hit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_severity') THEN
    CREATE TYPE enum_safety_incidents_severity AS ENUM
      ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_category') THEN
    CREATE TYPE enum_safety_incidents_category AS ENUM
      ('underage_content', 'celebrity_impersonation', 'violence', 'bestiality',
       'non_consent', 'csam_attempt', 'age_classifier_flag',
       'combinatorial_pattern', 'jailbreak_attempt', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_triggered_at') THEN
    CREATE TYPE enum_safety_incidents_triggered_at AS ENUM
      ('input_filter', 'output_filter', 'image_filter', 'apparent_age_classifier',
       'user_report', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_detection_method') THEN
    CREATE TYPE enum_safety_incidents_detection_method AS ENUM
      ('keyword', 'classifier', 'vision_model', 'scoring_system', 'manual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_status') THEN
    CREATE TYPE enum_safety_incidents_status AS ENUM
      ('open', 'investigating', 'resolved', 'false_positive');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_action_taken') THEN
    CREATE TYPE enum_safety_incidents_action_taken AS ENUM
      ('none', 'warning', 'suspension', 'ban', 'content_deletion',
       'reported_to_authorities');
  END IF;
END $$;

-- ── content_flags ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_flags (
  id          serial PRIMARY KEY,
  user_id_id  integer,
  flag_type   enum_content_flags_flag_type NOT NULL,
  context     jsonb,
  updated_at  timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at  timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_flags_user_id_users_id_fk
    FOREIGN KEY (user_id_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_flags_user_id_idx ON content_flags (user_id_id);
CREATE INDEX IF NOT EXISTS content_flags_flag_type_idx ON content_flags (flag_type);
CREATE INDEX IF NOT EXISTS content_flags_user_flagtype_created_idx
  ON content_flags (user_id_id, flag_type, created_at);
CREATE INDEX IF NOT EXISTS content_flags_user_created_idx
  ON content_flags (user_id_id, created_at);
CREATE INDEX IF NOT EXISTS content_flags_updated_at_idx ON content_flags (updated_at);
CREATE INDEX IF NOT EXISTS content_flags_created_at_idx ON content_flags (created_at);

-- ── safety_incidents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_incidents (
  id                      serial PRIMARY KEY,
  user_id_id              integer,
  severity                enum_safety_incidents_severity NOT NULL DEFAULT 'medium',
  category                enum_safety_incidents_category NOT NULL,
  triggered_at            enum_safety_incidents_triggered_at,
  detection_method        enum_safety_incidents_detection_method,
  related_message_id_id   integer,
  related_image_id_id     integer,
  related_character_id_id integer,
  scoring_details         jsonb,
  evidence_snapshot       jsonb,
  status                  enum_safety_incidents_status NOT NULL DEFAULT 'open',
  action_taken            enum_safety_incidents_action_taken DEFAULT 'none',
  resolved_at             timestamp(3) with time zone,
  resolved_by_id_id       integer,
  resolution_notes        text,
  updated_at              timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at              timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT safety_incidents_user_id_users_id_fk
    FOREIGN KEY (user_id_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_related_message_id_messages_id_fk
    FOREIGN KEY (related_message_id_id) REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_related_image_id_media_assets_id_fk
    FOREIGN KEY (related_image_id_id) REFERENCES media_assets(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_related_character_id_characters_id_fk
    FOREIGN KEY (related_character_id_id) REFERENCES characters(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_resolved_by_id_users_id_fk
    FOREIGN KEY (resolved_by_id_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS safety_incidents_user_id_idx ON safety_incidents (user_id_id);
CREATE INDEX IF NOT EXISTS safety_incidents_severity_idx ON safety_incidents (severity);
CREATE INDEX IF NOT EXISTS safety_incidents_category_idx ON safety_incidents (category);
CREATE INDEX IF NOT EXISTS safety_incidents_status_idx ON safety_incidents (status);
CREATE INDEX IF NOT EXISTS safety_incidents_user_created_idx
  ON safety_incidents (user_id_id, created_at);
CREATE INDEX IF NOT EXISTS safety_incidents_status_severity_idx
  ON safety_incidents (status, severity);
CREATE INDEX IF NOT EXISTS safety_incidents_category_created_idx
  ON safety_incidents (category, created_at);
CREATE INDEX IF NOT EXISTS safety_incidents_updated_at_idx ON safety_incidents (updated_at);
CREATE INDEX IF NOT EXISTS safety_incidents_created_at_idx ON safety_incidents (created_at);

-- ── Payload polymorphic rels — add *_id FK columns ───────────────────────────
-- Without these, find() against payload_locked_documents / preferences fails
-- once the collections are registered.
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS content_flags_id integer;
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS safety_incidents_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_content_flags_fk') THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_content_flags_fk
      FOREIGN KEY (content_flags_id) REFERENCES content_flags(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_safety_incidents_fk') THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_safety_incidents_fk
      FOREIGN KEY (safety_incidents_id) REFERENCES safety_incidents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_content_flags_id_idx
  ON payload_locked_documents_rels (content_flags_id);
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_safety_incidents_id_idx
  ON payload_locked_documents_rels (safety_incidents_id);

ALTER TABLE payload_preferences_rels
  ADD COLUMN IF NOT EXISTS content_flags_id integer;
ALTER TABLE payload_preferences_rels
  ADD COLUMN IF NOT EXISTS safety_incidents_id integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_content_flags_fk') THEN
    ALTER TABLE payload_preferences_rels
      ADD CONSTRAINT payload_preferences_rels_content_flags_fk
      FOREIGN KEY (content_flags_id) REFERENCES content_flags(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_safety_incidents_fk') THEN
    ALTER TABLE payload_preferences_rels
      ADD CONSTRAINT payload_preferences_rels_safety_incidents_fk
      FOREIGN KEY (safety_incidents_id) REFERENCES safety_incidents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_preferences_rels_content_flags_id_idx
  ON payload_preferences_rels (content_flags_id);
CREATE INDEX IF NOT EXISTS payload_preferences_rels_safety_incidents_id_idx
  ON payload_preferences_rels (safety_incidents_id);

COMMIT;
