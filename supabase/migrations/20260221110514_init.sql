-- 1. Create a table to store the app state
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state_data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert an initial row
INSERT INTO app_state (id, state_data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;

-- Set up Row Level Security (RLS)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since no auth yet)
DROP POLICY IF EXISTS "Allow public read access" ON app_state;
CREATE POLICY "Allow public read access" ON app_state FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update access" ON app_state;
CREATE POLICY "Allow public update access" ON app_state FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON app_state;
CREATE POLICY "Allow public insert access" ON app_state FOR INSERT WITH CHECK (true);

-- 2. Create a table to store file metadata
CREATE TABLE IF NOT EXISTS file_metadata (
  id TEXT PRIMARY KEY,
  meta_data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Set up Row Level Security (RLS)
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
DROP POLICY IF EXISTS "Allow public read access on file_metadata" ON file_metadata;
CREATE POLICY "Allow public read access on file_metadata" ON file_metadata FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update access on file_metadata" ON file_metadata;
CREATE POLICY "Allow public update access on file_metadata" ON file_metadata FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert access on file_metadata" ON file_metadata;
CREATE POLICY "Allow public insert access on file_metadata" ON file_metadata FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete access on file_metadata" ON file_metadata;
CREATE POLICY "Allow public delete access on file_metadata" ON file_metadata FOR DELETE USING (true);

-- 3. Create the storage bucket for audio/video files
INSERT INTO storage.buckets (id, name, public) VALUES ('dance-files', 'dance-files', true) ON CONFLICT (id) DO NOTHING;

-- Create policies for the storage bucket to allow public uploads/downloads
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