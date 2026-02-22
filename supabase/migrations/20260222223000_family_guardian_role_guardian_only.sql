-- Normalize family_guardian role values to a single supported value: 'guardian'

UPDATE family_guardian
SET role = 'guardian'
WHERE role IN ('co-parent', 'viewer');

ALTER TABLE family_guardian
  ALTER COLUMN role SET DEFAULT 'guardian';

ALTER TABLE family_guardian
  DROP CONSTRAINT IF EXISTS family_guardian_role_check;

ALTER TABLE family_guardian
  ADD CONSTRAINT family_guardian_role_check CHECK (role = 'guardian');
