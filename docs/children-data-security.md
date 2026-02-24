# Children Data Security & Compliance Baseline

This document defines the baseline controls for handling children’s photos, videos, and calendar data.

## Scope

- Child media (photos/videos) in `storage.objects` (`dance-files`) and related metadata in `public.file_metadata`.
- Calendar and event data in `public.session`, `public.event`, `public.event_entry`, `public.scrapbook_entry`.
- Child profile data in `public.kid_profile` and related sharing/guardian structures.

## Access Model (Current)

- **Owner**: full access to their own family data.
- **Guardian (accepted)**: access constrained by guardian assignments and family-unit logic.
- **Routine share recipient (accepted)**: read access only to data tied to shared routines.

## Security Controls

1. **RLS everywhere for child-related data**
   - All child-sensitive tables and storage objects must keep RLS enabled with deny-by-default behavior.
2. **Private storage path scoping**
   - Storage access is scoped to owner folders (`users/{owner_id}/...`) through `storage.objects` policies.
3. **No public bucket/media URLs**
   - Avoid public URL patterns for child media; use authenticated download flows only.
4. **Least-privilege sharing**
   - Share recipients only receive data required by accepted share scope.
5. **Auditability**
   - Privileged and operational access should be logged and periodically reviewed.
6. **Retention + deletion**
   - Child media and calendar data should have defined retention periods and hard-delete support.

## Legal/Regulatory Baseline (Non-legal advice)

### UK

- **UK GDPR + Data Protection Act 2018**:
  - Lawful basis required for all processing.
  - Data minimisation, purpose limitation, storage limitation, integrity/confidentiality.
  - Data protection by design/default and security of processing.
- **Children’s Code (ICO Age Appropriate Design Code)**:
  - Best interests of the child, high privacy by default, transparency, minimisation.
  - Extra caution for profiling, geolocation, and sharing.
- **PECR** (where applicable):
  - If non-essential cookies/trackers are used, consent and transparency obligations apply.

### EU

- **EU GDPR** (including Art. 8 child consent for ISS where consent is the lawful basis).

### US

- **COPPA** for under-13 users where applicable.
- **State privacy laws** (for example, CPRA/CCPA) depending on applicability thresholds.

### Other common regimes

- **Canada (PIPEDA + provincial laws)** and **Australia (Privacy Act)** often require equivalent safeguards for child data and robust security controls.

## Operational Requirements

- Restrict service-role credentials and enforce key rotation.
- Enforce break-glass process for exceptional access requests.
- Maintain incident response and breach notification runbook.
- Maintain RoPA and DPIA for child-related processing.

## Implementation Notes

- Migration `20260224123000_harden_share_calendar_visibility.sql` narrows share-recipient read access for calendar/event data to routine-linked records.
- Migration `20260224130000_harden_media_share_scope.sql` narrows share-recipient media visibility to files with routine-linked metadata (`meta_data.routineId`/`routine_id`) and matching shared-routine access.
- Migration `20260224133000_backfill_file_metadata_routine_ids.sql` safely backfills routine linkage for existing media metadata where mapping is high-confidence (routine cover paths, `practice_video.video_key`, and `session.rehearsal_video_key`).
