# Sharing & Family Units Strategy

## Overview

The Dance Tracker supports two distinct sharing models: **Family Units** (full co-ownership) and **Dance Shares** (read-only, per-routine). Family Units are the primary mechanism for multi-parent households and extended family access.

---

## 1. Family Units

A **Family Unit** is a named group that defines which children a set of adults can collectively manage. One user **owns** the unit; additional adults are **guardians** invited via link.

### Key Concepts

- A user can **create multiple** family units (e.g. one for each household).
- A user can be **invited into** other people's family units as a guardian.
- Each unit has its own **subset of children** — the owner picks which kids belong to each unit.
- **Guardians are co-owners**: they can read and write all dance data, upload photos/videos, and manage sessions for the children in their unit.

### Example Scenarios

#### Scenario 1: Two-Parent Household

> Adam and Cara share all their children.

| Unit: "Our Family" |          |
|---------------------|----------|
| Adam (owner)        | Adult    |
| Cara (guardian)     | Adult    |
| Kid 1               | Child    |
| Kid 2               | Child    |

Both Adam and Cara see Kid 1 and Kid 2's dances, timelines, scrapbooks, and can add sessions or media.

#### Scenario 2: Blended Family

> Adam has a second family unit for his ex-wife, who should only see Kid 1.

| Unit: "Kid 1's Family" |          |
|--------------------------|----------|
| Adam (owner)             | Adult    |
| Ex-wife (guardian)       | Adult    |
| Kid 1                    | Child    |

The ex-wife only sees Kid 1. Adam still sees both kids (via "Our Family" unit which has both).

#### Scenario 3: Extended Family

> Grandparents want to follow along.

| Unit: "Extended Family" |          |
|--------------------------|----------|
| Adam (owner)             | Adult    |
| Grandma (guardian)       | Adult    |
| Grandpa (guardian)       | Adult    |
| Kid 1                    | Child    |
| Kid 2                    | Child    |

Multiple guardians can be invited to the same unit. Grandparents get full visibility into both kids.

#### Scenario 4: Being Invited

> A dance teacher creates a unit and invites Adam.

| Unit: "Dance Class 2026" |          |
|----------------------------|----------|
| Teacher (owner)            | Adult    |
| Adam (guardian)            | Adult    |
| Student A                  | Child    |

Adam appears as a guardian in someone else's unit. He can see the children assigned to that unit.

### Visibility Rules

- The **owner** always sees **all** their own children, regardless of unit membership.
- A **guardian** only sees the children assigned to units they belong to.
- Children can appear in **multiple units** — the same child can be in "Our Family" and "Extended Family".
- The profile switcher shows a **deduplicated merge** of own children + guardian-accessible children.

---

## 2. Database Schema

### `family_unit`

| Column          | Type       | Description                              |
|-----------------|------------|------------------------------------------|
| `id`            | uuid (PK)  | Auto-generated                           |
| `owner_user_id` | uuid (FK)  | References `auth.users(id)`              |
| `name`          | text       | Display name (e.g. "Our Family")         |
| `kid_profile_ids` | uuid[]   | Which children belong to this unit       |
| `created_at`    | timestamptz| Auto-set                                 |

### `family_guardian`

| Column            | Type       | Description                              |
|-------------------|------------|------------------------------------------|
| `id`              | uuid (PK)  | Auto-generated                           |
| `owner_user_id`   | uuid (FK)  | The user who created the invite          |
| `guardian_user_id` | uuid (FK) | The user who accepted (null until accepted) |
| `guardian_email`   | text      | Set on accept                            |
| `family_unit_id`  | uuid (FK)  | Links to `family_unit.id`                |
| `kid_profile_ids` | uuid[]     | Legacy — used when `family_unit_id` is null |
| `role`            | text       | Always `'guardian'`                      |
| `status`          | text       | `pending` → `accepted` (or `revoked`)   |
| `invite_token`    | text       | One-time use token, cleared on accept    |
| `created_at`      | timestamptz|                                          |

### Relationships

```
family_unit (1) ──── (*) family_guardian (invite per adult)
     │
     └── kid_profile_ids[] ──── kid_profile (which kids are visible)
```

---

## 3. Row-Level Security (RLS)

### `family_unit` table

- **Owner**: Full CRUD on their own units.
- **Guardian**: SELECT only, on units where they have an accepted `family_guardian` row.

### `kid_profile` table

- **Parent**: Full access to own kids.
- **Guardian**: SELECT access to kids that appear in `family_unit.kid_profile_ids` for units they belong to.

### `dance` table

- **Owner**: Full CRUD on own dance row.
- **Guardian**: UPDATE access via `is_guardian_of(owner_id)` helper function.

### `file_metadata` table

- **Owner**: Full CRUD.
- **Guardian**: Full CRUD via `is_guardian_of(owner_id)`.

### `storage.objects` (dance-files bucket)

- **Owner**: Full access to `dance-files/{user_id}/*`.
- **Guardian**: Full access to owner's folder via `is_guardian_of()`.

### `is_guardian_of()` Helper

```sql
CREATE FUNCTION public.is_guardian_of(check_owner_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_guardian fg
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fg.owner_user_id = check_owner_id
  )
$$;
```

---

## 4. Co-Ownership (App-Level)

When a guardian signs in, the app detects they don't own a dance row but have access to one via `family_guardian`. The app then:

1. **Sets `_danceOwnerId`** to the actual owner's user ID.
2. **All file operations** (upload, download, delete, list) use the owner's ID as the storage path prefix.
3. **Save operations** write back to the **owner's** dance row — no duplicate rows are created.
4. **IndexedDB** file cache is scoped to the owner's ID so both parents share the same local cache namespace.

This means both parents edit the same data. Last-write-wins applies if both edit simultaneously.

---

## 5. Dance Shares (Separate Feature)

Dance Shares are a **lightweight, read-only** sharing mechanism for individual routines. They are unrelated to Family Units.

| Feature        | Family Unit              | Dance Share              |
|----------------|--------------------------|--------------------------|
| Scope          | All dances for assigned kids | One specific routine    |
| Access         | Full read/write          | Read-only                |
| Invite method  | Link (token-based)       | Link (token-based)       |
| Table          | `family_guardian` + `family_unit` | `dance_share`      |
| Use case       | Parents, grandparents    | Dance partner's parents  |

---

## 6. Invite Flow

### Creating

1. Owner creates a Family Unit (name + select children).
2. Owner clicks "Invite Adult" on a unit card.
3. A `family_guardian` row is created with `status: 'pending'`, a random `invite_token`, and `family_unit_id`.
4. A link is generated: `https://app.example.com/?invite={token}`.

### Accepting

1. Invited user opens the link while signed in.
2. App calls `acceptGuardianByToken(token)`.
3. The `family_guardian` row updates: `status: 'accepted'`, `guardian_user_id` set, `invite_token` cleared.
4. Guardian now sees the unit's children and can co-manage all their data.

### Revoking

1. Owner clicks ✕ on an accepted guardian or pending invite.
2. The `family_guardian` row is updated to `status: 'revoked'`.
3. RLS immediately prevents further access.

---

## 7. Settings UI Structure

```
┌─ Your Profile ──────────────────────────┐
│  👤 Adam               [Edit]           │
│     adam@example.com                     │
└─────────────────────────────────────────┘

┌─ Your Children ─────────────────────────┐
│  💃 Kid 1              [Edit] [✕]       │
│  🩰 Kid 2              [Edit] [✕]       │
│  [+ Add Child]                          │
└─────────────────────────────────────────┘

┌─ Our Family ────────────────── [Edit][✕]┐
│  👤 Adam           You                  │
│  💃 Kid 1          Your child           │
│  🩰 Kid 2          Your child           │
│  👤 Cara           Parent / Guardian    │
│  ─────────────────────────────          │
│  [🔗 Invite Adult]                      │
└─────────────────────────────────────────┘

┌─ Kid 1's Family ──────────────[Edit][✕] ┐
│  👤 Adam           You                  │
│  💃 Kid 1          Your child           │
│  ─────────────────────────────          │
│  🔗 Pending invite                [✕]   │
│  [🔗 Invite Adult]                      │
└─────────────────────────────────────────┘

┌─ Dance Class 2026 ──────────── Guardian ┐
│  👤 Teacher        Owner                │
│  👤 Adam           You (guardian)        │
│  💃 Student A      Child                │
└─────────────────────────────────────────┘

[+ Create Family Unit]
```
