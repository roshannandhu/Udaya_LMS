-- WhatsApp Chats: inbound parent messages (two-way chat inbox).
-- Idempotent — safe to run any time in the Supabase SQL Editor. Identical to the
-- whatsapp_inbox block in schema.sql; provided standalone so an existing
-- deployment can add just this table without re-running the full schema.
CREATE TABLE IF NOT EXISTS whatsapp_inbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id          UUID NOT NULL,
    from_phone          TEXT NOT NULL,
    student_id          UUID,
    student_name        TEXT,
    standard_id         UUID,
    standard_name       TEXT,
    body                TEXT,
    media_url           TEXT,
    media_type          TEXT,
    provider_message_id TEXT,
    read_by_teacher     BOOLEAN DEFAULT false,
    received_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_teacher ON whatsapp_inbox(teacher_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_phone   ON whatsapp_inbox(from_phone);
ALTER TABLE whatsapp_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_wa_inbox" ON whatsapp_inbox;
CREATE POLICY "deny_all_wa_inbox" ON whatsapp_inbox FOR ALL USING (false);
