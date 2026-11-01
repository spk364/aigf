-- Admins become their own auth collection (src/payload/collections/admins.ts)
-- instead of `users` rows carrying roles: ['admin']. /admin signs in against
-- this table only (payload.config.ts `admin.user`).
--
-- Statements are the ones Payload's own drizzle schema generates for the
-- collection (admins, admins_sessions, and the admins_id columns Payload adds
-- to its polymorphic preferences / locked-documents relation tables), so a
-- later PAYLOAD_PUSH_DB=true boot is a no-op. Additive only: safe to apply
-- while the previous code is still deployed.
--
-- After applying, create the first admin on a LOCAL dev server (it shares this
-- database): http://localhost:3000/admin shows "create first user" while the
-- table is empty. Do that BEFORE deploying the code, or the production /admin
-- offers the same form to anyone.
--
-- Run: psql $DATABASE_URL -f migrations/0013_admins.sql

BEGIN;

CREATE TABLE IF NOT EXISTS admins (
  id                         serial PRIMARY KEY NOT NULL,
  display_name               varchar,
  updated_at                 timestamp(3) with time zone DEFAULT now() NOT NULL,
  created_at                 timestamp(3) with time zone DEFAULT now() NOT NULL,
  email                      varchar NOT NULL,
  reset_password_token       varchar,
  reset_password_expiration  timestamp(3) with time zone,
  salt                       varchar,
  hash                       varchar,
  login_attempts             numeric DEFAULT 0,
  lock_until                 timestamp(3) with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_idx ON admins USING btree (email);
CREATE INDEX IF NOT EXISTS admins_updated_at_idx ON admins USING btree (updated_at);
CREATE INDEX IF NOT EXISTS admins_created_at_idx ON admins USING btree (created_at);

CREATE TABLE IF NOT EXISTS admins_sessions (
  _order       integer NOT NULL,
  _parent_id   integer NOT NULL,
  id           varchar PRIMARY KEY NOT NULL,
  created_at   timestamp(3) with time zone,
  expires_at   timestamp(3) with time zone NOT NULL,
  CONSTRAINT admins_sessions_parent_id_fk FOREIGN KEY (_parent_id)
    REFERENCES public.admins(id) ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS admins_sessions_order_idx ON admins_sessions USING btree (_order);
CREATE INDEX IF NOT EXISTS admins_sessions_parent_id_idx ON admins_sessions USING btree (_parent_id);

ALTER TABLE payload_preferences_rels ADD COLUMN IF NOT EXISTS admins_id integer;
ALTER TABLE payload_preferences_rels DROP CONSTRAINT IF EXISTS payload_preferences_rels_admins_fk;
ALTER TABLE payload_preferences_rels ADD CONSTRAINT payload_preferences_rels_admins_fk
  FOREIGN KEY (admins_id) REFERENCES public.admins(id) ON DELETE cascade ON UPDATE no action;
CREATE INDEX IF NOT EXISTS payload_preferences_rels_admins_id_idx
  ON payload_preferences_rels USING btree (admins_id);

ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS admins_id integer;
ALTER TABLE payload_locked_documents_rels DROP CONSTRAINT IF EXISTS payload_locked_documents_rels_admins_fk;
ALTER TABLE payload_locked_documents_rels ADD CONSTRAINT payload_locked_documents_rels_admins_fk
  FOREIGN KEY (admins_id) REFERENCES public.admins(id) ON DELETE cascade ON UPDATE no action;
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_admins_id_idx
  ON payload_locked_documents_rels USING btree (admins_id);

COMMIT;
