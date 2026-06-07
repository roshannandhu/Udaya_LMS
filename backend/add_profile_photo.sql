-- Migration to add teacher profile photo column
ALTER TABLE teacher_branding ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
