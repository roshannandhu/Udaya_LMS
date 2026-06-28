-- Restore the in-app notification and Android push infrastructure.
-- Safe to run repeatedly against an existing Supabase project.

CREATE TABLE IF NOT EXISTS notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id   UUID NOT NULL,
    recipient_type TEXT NOT NULL,
    type           TEXT NOT NULL,
    title          TEXT,
    body           TEXT,
    data           JSONB NOT NULL DEFAULT '{}'::jsonb,
    read           BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON notifications(recipient_id, created_at DESC) WHERE read = false;

CREATE TABLE IF NOT EXISTS device_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    platform   TEXT NOT NULL DEFAULT 'android',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);

CREATE TABLE IF NOT EXISTS live_class_reminders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
    offset_min    INTEGER NOT NULL,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (live_class_id, offset_min)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_class_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_notifications" ON notifications;
CREATE POLICY "deny_anon_notifications" ON notifications
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_anon_device_tokens" ON device_tokens;
CREATE POLICY "deny_anon_device_tokens" ON device_tokens
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_anon_live_class_reminders" ON live_class_reminders;
CREATE POLICY "deny_anon_live_class_reminders" ON live_class_reminders
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
