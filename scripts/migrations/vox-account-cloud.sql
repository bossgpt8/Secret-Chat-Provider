-- Additive schema migration for the existing Oracle-hosted API's Neon database.
-- Run against that database before enabling account sync. No existing data is copied.
CREATE TABLE IF NOT EXISTS account_cloud (
  user_id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 0,
  entries jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
