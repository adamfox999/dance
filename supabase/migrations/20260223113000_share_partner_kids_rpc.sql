-- Secure helper to update partner_kid_ids on accepted dance shares.
-- Allows:
--  - owner of the share
--  - invited recipient (matched by invited_user_id or invited_email)
-- Enforces that kid IDs belong to the invited parent.

CREATE OR REPLACE FUNCTION public.set_share_partner_kids(
  p_share_id uuid,
  p_partner_kid_ids uuid[]
)
RETURNS public.dance_share
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.dance_share;
  caller_id uuid := auth.uid();
  caller_email text := auth.jwt() ->> 'email';
  normalized_kids uuid[] := coalesce(p_partner_kid_ids, ARRAY[]::uuid[]);
  invalid_count integer;
  can_update boolean;
BEGIN
  SELECT *
  INTO share_row
  FROM public.dance_share
  WHERE id = p_share_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Share not found';
  END IF;

  IF share_row.status <> 'accepted' THEN
    RAISE EXCEPTION 'Can only tag kids on accepted shares';
  END IF;

  can_update := (
    share_row.owner_user_id = caller_id
    OR (
      share_row.invited_user_id = caller_id
      OR (
        share_row.invited_user_id IS NULL
        AND share_row.invited_email IS NOT NULL
        AND share_row.invited_email = caller_email
      )
    )
  );

  IF NOT can_update THEN
    RAISE EXCEPTION 'Not allowed to update this share';
  END IF;

  IF cardinality(normalized_kids) > 0 THEN
    SELECT count(*)
    INTO invalid_count
    FROM unnest(normalized_kids) AS kid_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.kid_profile kp
      WHERE kp.id = kid_id
        AND kp.parent_user_id = share_row.invited_user_id
    );

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'One or more selected kids are not valid for this share partner';
    END IF;
  END IF;

  UPDATE public.dance_share ds
  SET partner_kid_ids = normalized_kids
  WHERE ds.id = p_share_id
  RETURNING ds.* INTO share_row;

  RETURN share_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_share_partner_kids(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_share_partner_kids(uuid, uuid[]) TO authenticated;
