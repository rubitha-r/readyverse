# ReadyVerse — Backend Architecture & Database Design
**Target Infrastructure:** Supabase (PostgreSQL + RLS + GoTrue Auth) + Netlify Serverless Functions  
**Design Philosophy:** Local-First, Privacy-Preserving, Zero-Knowledge for Sensitive Data, 100% Offline Resilience

---

## 1. Executive Summary & Architecture Overview

ReadyVerse is built as a **local-first, privacy-first disaster preparedness training platform**. The backend provides optional cloud synchronization, institutional campus aggregation, and multiplayer classroom leaderboards without ever compromising student privacy or offline emergency accessibility.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT APPLICATION (PWA / BROWSER)                    │
│                                                                             │
│   ┌─────────────────────────┐               ┌───────────────────────────┐   │
│   │   Authoritative State   │               │   Sensitive Local Data    │   │
│   │   (localStorage / IDB)  │               │   (NEVER SYNCS TO CLOUD)  │   │
│   │  • XP, Levels, Badges   │               │  • Medical/Allergy Notes  │   │
│   │  • Completed Missions   │               │  • Personal Phone Numbers │   │
│   │  • Readiness Score      │               │  • Family / Hostel Info   │   │
│   └────────────┬────────────┘               └───────────────────────────┘   │
└────────────────┼────────────────────────────────────────────────────────────┘
                 │ (Encrypted HTTPS / Bearer JWT)
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 SERVERLESS LAYER (Netlify Edge & Functions)                 │
│                                                                             │
│   • /api/sync/push  (Sanitizes payloads & reconciles client state)          │
│   • /api/sync/pull  (Fetches latest server snapshot)                         │
│   • /api/class/join (Rate-limited classroom code enrollment)                │
│   • /api/coach      (Strictly-grounded disaster AI tutor endpoint)          │
└────────────────┼────────────────────────────────────────────────────────────┘
                 │ (PostgreSQL Connection Pooler)
                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE MANAGED POSTGRESQL + RLS                      │
│                                                                             │
│   ┌───────────────────┐  ┌───────────────────────┐  ┌───────────────────┐   │
│   │     profiles      │  │  progress_snapshots   │  │  drill_attempts   │   │
│   └─────────┬─────────┘  └───────────┬───────────┘  └─────────┬─────────┘   │
│             │                        │                        │             │
│             └───────────────┬────────┴────────────────────────┘             │
│                             ▼                                               │
│   ┌───────────────────┐  ┌───────────────────────┐  ┌───────────────────┐   │
│   │      classes      │  │     class_members     │  │ class_leaderboard │   │
│   └───────────────────┘  └───────────────────────┘  │  (Secure View)    │   │
│                                                     └───────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema (Tables & Columns)

All tables use PostgreSQL UUID primary keys, enforce strict foreign key constraints, and utilize UTC ISO-8601 timestamps (`TIMESTAMPTZ`).

### 2.1. `profiles`
Represents public user identity and account settings linked to Supabase Auth (`auth.users`).

```sql
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL CHECK (char_length(first_name) >= 1 AND char_length(first_name) <= 50),
    avatar_emoji TEXT DEFAULT '🧑‍🚒' CHECK (char_length(avatar_emoji) <= 8),
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'facilitator', 'campus_admin')),
    campus_name TEXT DEFAULT 'Campus Community' CHECK (char_length(campus_name) <= 120),
    department TEXT DEFAULT NULL CHECK (char_length(department) <= 100),
    theme_preference TEXT DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 2.2. `progress_snapshots`
Stores the single-source-of-truth gamification, leveling, readiness, and capability progression for each student.

```sql
CREATE TABLE public.progress_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    title TEXT NOT NULL DEFAULT 'Rookie',
    readiness_score INTEGER NOT NULL DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
    daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
    longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    completed_missions JSONB NOT NULL DEFAULT '[]'::jsonb,
    mission_best_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_learn_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_prep_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    unlocked_achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
    unlocked_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_active_date DATE DEFAULT NULL,
    last_sync_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    schema_version INTEGER NOT NULL DEFAULT 2
);
```

### 2.3. `drill_attempts`
Immutable telemetry record of completed disaster simulations, speed drills, and peer challenges.

```sql
CREATE TABLE public.drill_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    drill_id TEXT NOT NULL CHECK (drill_id IN ('fire', 'flood', 'cyclone', 'earthquake', 'daily')),
    drill_type TEXT NOT NULL CHECK (drill_type IN ('standard', 'daily_drill', 'challenge')),
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    xp_earned INTEGER NOT NULL CHECK (xp_earned >= 0),
    grade TEXT NOT NULL CHECK (grade IN ('A+', 'A', 'B', 'C', '--')),
    decisions_count INTEGER NOT NULL CHECK (decisions_count > 0),
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
    duration_seconds INTEGER DEFAULT NULL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ta')),
    challenge_id TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 2.4. `classes`
Classroom or hostel groups created by campus safety facilitators or professors.

```sql
CREATE TABLE public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 100),
    campus_name TEXT NOT NULL CHECK (char_length(campus_name) >= 2 AND char_length(campus_name) <= 120),
    join_code TEXT NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z0-9]{6}$'),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN NOT NULL DEFAULT true
);
```

### 2.5. `class_members`
Association table linking students to campus classes.

```sql
CREATE TABLE public.class_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'facilitator')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(class_id, user_id)
);
```

---

## 3. Row-Level Security (RLS) & Leaderboard Privacy

PostgreSQL Row-Level Security is enabled on every table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### 3.1. Standard Privacy Rules
1. **`profiles` Table**:
   - `SELECT`: A user can read their own profile (`auth.uid() = id`).
   - `INSERT`: Triggered automatically on user signup via Postgres trigger.
   - `UPDATE`: A user can only update their own profile (`auth.uid() = id`).
2. **`progress_snapshots` Table**:
   - `SELECT`: A user can read only their own snapshot (`auth.uid() = user_id`).
   - `INSERT / UPDATE`: A user can mutate only their own record (`auth.uid() = user_id`).
3. **`drill_attempts` Table**:
   - `SELECT`: A user can read only their own past attempts (`auth.uid() = user_id`).
   - `INSERT`: A user can insert only records where `user_id = auth.uid()`.
4. **`classes` & `class_members`**:
   - Facilitators manage classes where `created_by = auth.uid()`.
   - Students can enroll via validated `join_code` and view classes they are members of.

### 3.2. Privacy-Safe Class Leaderboard (Postgres Security View)
To protect students from identity exfiltration, peer snooping, or personal tracking, the class leaderboard **NEVER** exposes user IDs, email addresses, departments, or timestamps.

```sql
-- Secure Public View for Classroom / Campus Leaderboards
CREATE OR REPLACE VIEW public.class_leaderboard WITH (security_invoker = true) AS
SELECT 
    cm.class_id,
    p.first_name,
    p.avatar_emoji,
    ps.level,
    ps.title,
    ps.total_xp,
    ps.readiness_score,
    ps.daily_streak,
    RANK() OVER (PARTITION BY cm.class_id ORDER BY ps.total_xp DESC, ps.readiness_score DESC) as rank
FROM public.class_members cm
JOIN public.profiles p ON p.id = cm.user_id
JOIN public.progress_snapshots ps ON ps.user_id = cm.user_id
WHERE EXISTS (
    -- Caller must be a fellow member of the same class
    SELECT 1 FROM public.class_members my_membership 
    WHERE my_membership.class_id = cm.class_id 
    AND my_membership.user_id = auth.uid()
);
```

---

## 4. Absolute Privacy Boundary: Never Stored in the Cloud

ReadyVerse enforces a **Zero-Knowledge Cloud Boundary**. The following sensitive student fields **STAY PERMANENTLY ON THE LOCAL DEVICE** in browser `localStorage` and are strictly excluded from API synchronization payloads:

| Field Name | Description | Reason for Absolute Local Retention |
| :--- | :--- | :--- |
| **Medical & Allergy Notes** (`responderProfile.medicalNotes`) | Asthma inhaler location, blood group, chronic conditions | Strict medical privacy; zero HIPAA/GDPR health data liability. |
| **Personal Phone Numbers** (`responderProfile.studentPhone`) | Student's mobile number | Anti-doxxing; prevents harassment or campus data leaks. |
| **Family / Emergency Contacts** (`responderProfile.emergencyContact`) | Parents' names and home telephone numbers | Child/family safety; strictly offline for the student's emergency view. |
| **Campus Warden / Hostel Room** (`responderProfile.hostelRoom`) | Exact hostel building, wing, and room number | Physical safety; prevents physical location tracking by unauthorized peers. |
| **Precise GPS Coordinates** | Device location latitude/longitude | Anti-tracking; hazard guides rely on static campus maps. |
| **AI Raw Chat Transcripts** | Full conversational dialogue logs | Conversation confidentiality between student and safety assistant. |

### Client-Side Sanitization Before Sync
Before transmitting any sync payload to `/api/sync/push`, the client executes a deterministic sanitizer:
```javascript
function prepareSyncPayload(localState) {
    const sanitized = { ...localState };
    // Strip all sensitive private identifiers
    delete sanitized.medicalNotes;
    delete sanitized.emergencyContact;
    delete sanitized.studentPhone;
    delete sanitized.hostelRoom;
    delete sanitized.roommateContact;
    delete sanitized.privateNotes;
    return sanitized;
}
```

---

## 5. Local-First Synchronization & Conflict Resolution Protocol

When a student plays offline across multiple devices (e.g. mobile phone during a campus drill, laptop in classroom), syncing is resolved using **deterministic, monotonic progression rules** (no data loss, no accidental level downgrades).

```
                      ┌────────────────────────────┐
                      │    LOCAL STATE (Device)    │
                      │  • Total XP: 650           │
                      │  • Fire: 100%, Flood: 0%   │
                      │  • Badges: [First Drill]   │
                      └─────────────┬──────────────┘
                                    │
                                    ▼  SYNC TRIGGER (Network Connected)
                      ┌────────────────────────────┐
                      │    CLOUD STATE (Server)    │
                      │  • Total XP: 500           │
                      │  • Fire: 0%, Flood: 90%    │
                      │  • Badges: [Flood Master]  │
                      └─────────────┬──────────────┘
                                    │
                                    ▼  DETERMINISTIC CONFLICT RESOLUTION
                      ┌──────────────────────────────────────────────┐
                      │              MERGED OUTCOME                  │
                      │  • Total XP: max(650, 500) = 650             │
                      │  • Fire: max(100%, 0%) = 100%                │
                      │  • Flood: max(0%, 90%) = 90%                 │
                      │  • Badges: [First Drill] ∪ [Flood Master]    │
                      │  • Readiness: Recomputed via 40/30/30        │
                      └──────────────────────────────────────────────┘
```

### 5.1. Specific Conflict Resolution Algorithms

1. **Total XP (`totalXP`)**:
   $$\text{Merged XP} = \max(\text{Local XP}, \text{Cloud XP})$$
   *Rule: XP is strictly monotonic and can never decrease.*

2. **Completed Drills & Lessons (`completedMissionIds`, `completedLearnIds`, `completedPrepItemIds`)**:
   $$\text{Merged Set} = \text{Local Set} \cup \text{Cloud Set}$$
   *Rule: A completed module or safety action on any device is permanently preserved.*

3. **Drill Best Scores (`missionBestScores`)**:
   $$\text{Merged Score}[k] = \max(\text{Local Score}[k], \text{Cloud Score}[k]) \quad \forall k \in \{\text{fire, flood, cyclone, earthquake}\}$$
   *Rule: The student's highest demonstrated crisis competence is retained.*

4. **Achievements & Capabilities (`unlockedAchievements`, `unlockedCapabilities`)**:
   $$\text{Merged Achievements} = \text{Local Achievements} \cup \text{Cloud Achievements}$$

5. **Readiness Score (`readiness`)**:
   *Rule: The composite Readiness Score is never synced as a raw independent integer. It is recomputed deterministically from the merged state using the official formula:*
   $$\text{Readiness} = \text{round}\left(0.40 \cdot \frac{\sum \text{Best Scores}}{4} + 0.30 \cdot \frac{|\text{Learn Modules}|}{6} \cdot 100 + 0.30 \cdot \frac{|\text{Plan Actions}|}{40} \cdot 100\right)$$

6. **Daily Streak (`dailyStreak`, `longestStreak`)**:
   - Compares `lastActiveDate` with current local calendar date.
   - Preserves $\max(\text{Local Streak}, \text{Cloud Streak})$ if timestamps represent contiguous calendar days.

---

## 6. Offline Architecture & Resilience

ReadyVerse functions **100% offline by default**. The application shell, drills, checklists, audio reader, and localized translations are precached on the device.

1. **Zero Network Blocking**:
   - All gameplay, quiz submissions, action completions, and badge awards update local `localStorage` and `IndexedDB` synchronously in $0\text{ms}$.
   - The UI never displays a blocking loading spinner while waiting for cloud confirmation.
2. **Offline Mutation Sync Queue (`readyverse_sync_queue`)**:
   - If a sync push fails due to airplane mode or loss of cell signal, the pending delta snapshot is appended to an in-memory / `IndexedDB` sync queue.
3. **Background Auto-Reconnection**:
   - The PWA listens for `window.addEventListener('online')` and `navigator.onLine`.
   - Upon network restoration, the sync engine drains the queue with exponential backoff ($2\text{s}, 4\text{s}, 8\text{s}$) and presents a subtle, non-intrusive toast: *"Training synced with cloud ✓"*.
4. **Offline Visual Indicators**:
   - A discreet offline badge appears in the header.
   - The AI assistant displays its clear, pre-configured notice explaining that live voice intelligence requires internet while all 4 disaster drills and 6 learn modules remain fully available.

---

## 7. Netlify Serverless Functions API Specifications

| Endpoint | Method | Authentication | Function & Purpose |
| :--- | :--- | :--- | :--- |
| `/.netlify/functions/sync-push` | `POST` | Bearer JWT (Supabase) | Sanitizes client payload, performs server-side conflict resolution, and persists new `progress_snapshots` row. |
| `/.netlify/functions/sync-pull` | `GET` | Bearer JWT (Supabase) | Returns latest cloud progress snapshot and class memberships. |
| `/.netlify/functions/class-join` | `POST` | Bearer JWT (Supabase) | Validates 6-character alphanumeric join code, enforces 5 req/min rate limit, and enrolls student in `class_members`. |
| `/.netlify/functions/coach` | `POST` | Optional / Anonymous | High-speed grounded emergency assistant with per-IP rate limiting (10 req/min) and NDMA knowledge bounds. |

---

## 8. Summary of Architectural Guarantees

- **Student Privacy Guaranteed:** No medical, telephone, or hostel location data ever touches the cloud database.
- **Offline Resilience Guaranteed:** Full disaster preparedness training functions seamlessly without connectivity.
- **Fair Classroom Competition:** Class leaderboards display verified gamification ranks while obfuscating private user data.
- **Zero Framework Complexity:** Clean REST/JSON contracts compatible with vanilla JavaScript.
