-- Parent WhatsApp notifications: store the PARENT's contact number per student.
-- `students.phone` stays the student's own number; `parent_phone` is the recipient
-- used by the parent-notification endpoints (/api/whatsapp/send-*).
-- Safe to run repeatedly against an existing Supabase project.

ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
