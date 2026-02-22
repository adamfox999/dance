-- Make invited_email nullable so token-based (link) shares work without an email
ALTER TABLE dance_share ALTER COLUMN invited_email DROP NOT NULL;
