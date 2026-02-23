-- Allow accepted dance-share recipients to read normalized data for the owner's dance

CREATE OR REPLACE FUNCTION public.is_share_recipient_of(check_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dance_share ds
    WHERE ds.owner_user_id = check_owner_id
      AND ds.status = 'accepted'
      AND (
        ds.invited_user_id = auth.uid()
        OR (
          ds.invited_user_id IS NULL
          AND ds.invited_email = (auth.jwt() ->> 'email')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_share_recipient_for_routine(
  check_owner_id uuid,
  check_routine_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dance_share ds
    WHERE ds.owner_user_id = check_owner_id
      AND ds.status = 'accepted'
      AND (
        ds.routine_id IS NULL
        OR ds.routine_id = check_routine_id::text
      )
      AND (
        ds.invited_user_id = auth.uid()
        OR (
          ds.invited_user_id IS NULL
          AND ds.invited_email = (auth.jwt() ->> 'email')
        )
      )
  );
$$;

CREATE POLICY discipline_select_share ON discipline
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY discipline_element_select_share ON discipline_element
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY grade_history_select_share ON grade_history
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY routine_select_share ON routine
  FOR SELECT TO public
  USING (public.is_share_recipient_for_routine(owner_id, id));

CREATE POLICY choreography_version_select_share ON choreography_version
  FOR SELECT TO public
  USING (public.is_share_recipient_for_routine(owner_id, routine_id));

CREATE POLICY practice_video_select_share ON practice_video
  FOR SELECT TO public
  USING (public.is_share_recipient_for_routine(owner_id, routine_id));

CREATE POLICY session_select_share ON session
  FOR SELECT TO public
  USING (
    routine_id IS NOT NULL
    AND public.is_share_recipient_for_routine(owner_id, routine_id)
  );

CREATE POLICY event_select_share ON event
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY event_entry_select_share ON event_entry
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY scrapbook_entry_select_share ON scrapbook_entry
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY sticker_select_share ON sticker
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY practice_log_select_share ON practice_log
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY dancer_profile_select_share ON dancer_profile
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY dancer_goal_select_share ON dancer_goal
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY file_metadata_select_share ON file_metadata
  FOR SELECT TO public
  USING (public.is_share_recipient_of(owner_id));

CREATE POLICY dance_files_user_select_share ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND public.is_share_recipient_of(split_part(name, '/', 2)::uuid)
  );
