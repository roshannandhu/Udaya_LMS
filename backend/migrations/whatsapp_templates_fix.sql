-- Ensure whatsapp_templates has every column the create/edit endpoints write.
-- A table created before these columns were added to schema.sql would be missing
-- header_type / variables / etc., making template save fail. Safe to run repeatedly.

ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS category             TEXT DEFAULT 'utility';
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS language             TEXT DEFAULT 'en';
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS header_type          TEXT DEFAULT 'none';
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS variables            JSONB DEFAULT '[]'::jsonb;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS provider_template_id TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'draft';
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_url            TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_type           TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_name           TEXT;
