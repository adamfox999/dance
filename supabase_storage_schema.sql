-- Create a table to store file metadata
CREATE TABLE file_metadata (
  id TEXT PRIMARY KEY,
  meta_data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Set up Row Level Security (RLS)
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since no auth yet)
CREATE POLICY "Allow public read access on file_metadata" ON file_metadata FOR SELECT USING (true);
CREATE POLICY "Allow public update access on file_metadata" ON file_metadata FOR UPDATE USING (true);
CREATE POLICY "Allow public insert access on file_metadata" ON file_metadata FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete access on file_metadata" ON file_metadata FOR DELETE USING (true);

-- Create storage bucket for audio/video files
INSERT INTO storage.buckets (id, name, public)
VALUES ('dance-files', 'dance-files', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket-specific policies on storage.objects
DROP POLICY IF EXISTS "dance_files_public_select" ON storage.objects;
CREATE POLICY "dance_files_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'dance-files');

DROP POLICY IF EXISTS "dance_files_public_insert" ON storage.objects;
CREATE POLICY "dance_files_public_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'dance-files');

DROP POLICY IF EXISTS "dance_files_public_update" ON storage.objects;
CREATE POLICY "dance_files_public_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'dance-files')
WITH CHECK (bucket_id = 'dance-files');

DROP POLICY IF EXISTS "dance_files_public_delete" ON storage.objects;
CREATE POLICY "dance_files_public_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'dance-files');
