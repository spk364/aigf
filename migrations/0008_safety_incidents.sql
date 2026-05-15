-- Layer 3 (input safety filter) and future Layers 5/6/7 write safety events
-- here. One row per blocked turn / flagged generation. Used by the admin
-- panel for review and by the escalation logic (3 attempts → 24h suspend,
-- 5 → permanent ban; CSAM-class → permanent ban + report). See
-- docs/ai-companion-spec.md §3.10.
--
-- Matches Payload's auto-generated table conventions so a subsequent
-- PAYLOAD_PUSH_DB=true boot is a no-op.
--
-- Run manually: psql $DATABASE_URL -f migrations/0008_safety_incidents.sql

BEGIN;

-- ── enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_layer') THEN
    CREATE TYPE enum_safety_incidents_layer AS ENUM ('input', 'output', 'image', 'builder');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_safety_incidents_severity') THEN
    CREATE TYPE enum_safety_incidents_severity AS ENUM ('soft_block', 'hard_block', 'critical');
  END IF;
END $$;

-- ── main table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_incidents (
  id                serial PRIMARY KEY,
  user_id           integer,
  conversation_id   integer,
  message_id        integer,
  character_id      integer,
  layer             enum_safety_incidents_layer NOT NULL,
  severity          enum_safety_incidents_severity NOT NULL,
  category          varchar NOT NULL,
  matched           jsonb,
  input_snippet     text,
  locale            varchar,
  ip_address        varchar,
  user_agent        varchar,
  metadata          jsonb,
  updated_at        timestamp(3) with time zone NOT NULL DEFAULT now(),
  created_at        timestamp(3) with time zone NOT NULL DEFAULT now(),
  CONSTRAINT safety_incidents_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_conversation_id_conversations_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_message_id_messages_id_fk
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT safety_incidents_character_id_characters_id_fk
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS safety_incidents_user_id_idx
  ON safety_incidents (user_id);

CREATE INDEX IF NOT EXISTS safety_incidents_conversation_id_idx
  ON safety_incidents (conversation_id);

CREATE INDEX IF NOT EXISTS safety_incidents_message_id_idx
  ON safety_incidents (message_id);

CREATE INDEX IF NOT EXISTS safety_incidents_character_id_idx
  ON safety_incidents (character_id);

CREATE INDEX IF NOT EXISTS safety_incidents_category_idx
  ON safety_incidents (category);

CREATE INDEX IF NOT EXISTS safety_incidents_user_created_idx
  ON safety_incidents (user_id, created_at);

CREATE INDEX IF NOT EXISTS safety_incidents_layer_category_created_idx
  ON safety_incidents (layer, category, created_at);

CREATE INDEX IF NOT EXISTS safety_incidents_severity_created_idx
  ON safety_incidents (severity, created_at);

CREATE INDEX IF NOT EXISTS safety_incidents_updated_at_idx
  ON safety_incidents (updated_at);

CREATE INDEX IF NOT EXISTS safety_incidents_created_at_idx
  ON safety_incidents (created_at);

-- ── Payload polymorphic rels — add safety_incidents_id FK column ──────────
ALTER TABLE payload_locked_documents_rels
  ADD COLUMN IF NOT EXISTS safety_incidents_id integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_safety_incidents_fk'
  ) THEN
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_safety_incidents_fk
      FOREIGN KEY (safety_incidents_id) REFERENCES safety_incidents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_safety_incidents_id_idx
  ON payload_locked_documents_rels (safety_incidents_id);

ALTER TABLE payload_preferences_rels
  ADD COLUMN IF NOT EXISTS safety_incidents_id integer;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payload_preferences_rels_safety_incidents_fk'
  ) THEN
    ALTER TABLE payload_preferences_rels
      ADD CONSTRAINT payload_preferences_rels_safety_incidents_fk
      FOREIGN KEY (safety_incidents_id) REFERENCES safety_incidents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payload_preferences_rels_safety_incidents_id_idx
  ON payload_preferences_rels (safety_incidents_id);

COMMIT;
