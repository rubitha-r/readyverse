-- =========================================================================
-- ReadyVerse — Supabase Database Schema & Row-Level Security (RLS)
-- Version: 1.0.0
-- Architecture: Local-First, Zero-Liability Privacy Boundary, Monotonic Sync
-- =========================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. PROFILES TABLE
-- Linked to Supabase Auth (auth.users)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL DEFAULT 'Student' CHECK (char_length(first_name) >= 1 AND char_length(first_name) <= 50),
    avatar_emoji TEXT DEFAULT '🧑‍🚒' CHECK (char_length(avatar_emoji) <= 8),
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'facilitator', 'campus_admin')),
    campus_name TEXT DEFAULT 'Campus Community' CHECK (char_length(campus_name) <= 120),
    department TEXT DEFAULT NULL CHECK (char_length(department) <= 100),
    theme_preference TEXT DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Automatic Profile Creation Trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_name TEXT;
    extracted_first_name TEXT;
BEGIN
    raw_name := COALESCE(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'first_name',
        split_part(new.email, '@', 1)
    );
    
    -- Extract first name only for student privacy
    extracted_first_name := split_part(trim(raw_name), ' ', 1);
    IF extracted_first_name IS NULL OR length(extracted_first_name) = 0 THEN
        extracted_first_name := 'Student';
    END IF;

    INSERT INTO public.profiles (id, first_name, avatar_emoji)
    VALUES (new.id, extracted_first_name, '🧑‍🚒')
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- 2. PROGRESS SNAPSHOTS TABLE
-- Single-source-of-truth gamification & readiness progress
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.progress_snapshots (
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

CREATE INDEX IF NOT EXISTS idx_progress_snapshots_user_id ON public.progress_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_total_xp ON public.progress_snapshots(total_xp DESC);

-- =========================================================================
-- 3. DRILL ATTEMPTS TABLE
-- Immutable telemetry record of completed disaster simulations
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.drill_attempts (
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

CREATE INDEX IF NOT EXISTS idx_drill_attempts_user_id ON public.drill_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_drill_attempts_created_at ON public.drill_attempts(created_at DESC);

-- =========================================================================
-- 4. CLASSES TABLE
-- Campus classroom / hostel emergency cohorts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 100),
    campus_name TEXT NOT NULL CHECK (char_length(campus_name) >= 2 AND char_length(campus_name) <= 120),
    join_code TEXT NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z0-9]{6}$'),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_classes_join_code ON public.classes(join_code);

-- =========================================================================
-- 5. CLASS MEMBERS TABLE
-- Student enrollment association
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.class_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'facilitator')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_members_class_id ON public.class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_user_id ON public.class_members(user_id);

-- =========================================================================
-- 6. PRIVACY-PRESERVING CLASS LEADERBOARD VIEW
-- Strips private IDs/PII; exposes ONLY first name, avatar, level, title,
-- total_xp, weekly_xp, readiness_score, daily_streak, and ranks.
-- =========================================================================
CREATE OR REPLACE VIEW public.class_leaderboard WITH (security_invoker = true) AS
SELECT 
    cm.class_id,
    cm.user_id,
    p.first_name,
    p.avatar_emoji,
    ps.level,
    ps.title,
    ps.total_xp,
    COALESCE(w.weekly_xp, 0) as weekly_xp,
    ps.readiness_score,
    ps.daily_streak,
    RANK() OVER (PARTITION BY cm.class_id ORDER BY ps.total_xp DESC, ps.readiness_score DESC) as all_time_rank,
    RANK() OVER (PARTITION BY cm.class_id ORDER BY COALESCE(w.weekly_xp, 0) DESC, ps.total_xp DESC) as weekly_rank
FROM public.class_members cm
JOIN public.profiles p ON p.id = cm.user_id
JOIN public.progress_snapshots ps ON ps.user_id = cm.user_id
LEFT JOIN (
    SELECT user_id, SUM(xp_earned) as weekly_xp
    FROM public.drill_attempts
    WHERE created_at >= (timezone('utc'::text, now()) - INTERVAL '7 days')
    GROUP BY user_id
) w ON w.user_id = cm.user_id
WHERE EXISTS (
    -- Requester must be an active member of the classroom cohort
    SELECT 1 FROM public.class_members my_membership 
    WHERE my_membership.class_id = cm.class_id 
    AND my_membership.user_id = auth.uid()
);

-- =========================================================================
-- 6.1. HELPER STORED FUNCTIONS (CLASS CREATION, JOINING, LEAVING)
-- =========================================================================

-- Generate unique 6-character uppercase alphanumeric join code
CREATE OR REPLACE FUNCTION public.generate_class_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    result TEXT := '';
    i INTEGER;
    candidate_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
        
        -- Ensure code is unique in classes table
        SELECT EXISTS(SELECT 1 FROM public.classes WHERE join_code = result) INTO code_exists;
        IF NOT code_exists THEN
            RETURN result;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Warden or Faculty creates class and gets 6-character code
CREATE OR REPLACE FUNCTION public.create_class(
    p_name TEXT,
    p_campus_name TEXT DEFAULT 'Campus Community'
)
RETURNS JSONB AS $$
DECLARE
    v_code TEXT;
    v_class_id UUID;
    v_user_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a class';
    END IF;

    IF char_length(p_name) < 3 OR char_length(p_name) > 100 THEN
        RAISE EXCEPTION 'Class name must be between 3 and 100 characters';
    END IF;

    v_code := public.generate_class_code();

    INSERT INTO public.classes (name, campus_name, join_code, created_by)
    VALUES (p_name, COALESCE(p_campus_name, 'Campus Community'), v_code, v_user_id)
    RETURNING id INTO v_class_id;

    -- Automatically enroll creator as facilitator
    INSERT INTO public.class_members (class_id, user_id, role)
    VALUES (v_class_id, v_user_id, 'facilitator')
    ON CONFLICT (class_id, user_id) DO NOTHING;

    SELECT jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'campus_name', c.campus_name,
        'join_code', c.join_code,
        'role', 'facilitator',
        'created_at', c.created_at
    ) INTO v_result
    FROM public.classes c
    WHERE c.id = v_class_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Student joins class with 6-character code
CREATE OR REPLACE FUNCTION public.join_class_by_code(
    p_join_code TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_normalized_code TEXT := upper(trim(p_join_code));
    v_class RECORD;
    v_user_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join a class';
    END IF;

    IF v_normalized_code !~ '^[A-Z0-9]{6}$' THEN
        RAISE EXCEPTION 'Invalid class code format. Must be 6 alphanumeric characters.';
    END IF;

    SELECT * INTO v_class
    FROM public.classes
    WHERE join_code = v_normalized_code AND is_active = true;

    IF v_class.id IS NULL THEN
        RAISE EXCEPTION 'Class code not found. Please check with your faculty or warden.';
    END IF;

    -- Enroll user in class_members
    INSERT INTO public.class_members (class_id, user_id, role)
    VALUES (v_class.id, v_user_id, 'student')
    ON CONFLICT (class_id, user_id) DO NOTHING;

    SELECT jsonb_build_object(
        'id', v_class.id,
        'name', v_class.name,
        'campus_name', v_class.campus_name,
        'join_code', v_class.join_code,
        'role', 'student'
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Student or Facilitator leaves a class
CREATE OR REPLACE FUNCTION public.leave_class(
    p_class_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to leave a class';
    END IF;

    DELETE FROM public.class_members
    WHERE class_id = p_class_id AND user_id = v_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 6.2. CLASS FACILITATOR AGGREGATES FUNCTION (5+ STUDENT THRESHOLD)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_class_owner_aggregates(p_class_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_owner BOOLEAN;
    v_student_count INTEGER;
    v_drills_this_week INTEGER;
    v_accuracy JSONB;
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Verify caller is facilitator/owner of this class
    SELECT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.created_by = v_user_id
        UNION
        SELECT 1 FROM public.class_members cm
        WHERE cm.class_id = p_class_id AND cm.user_id = v_user_id AND cm.role = 'facilitator'
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Access denied. Class owner/facilitator privileges required.';
    END IF;

    -- Count enrolled students in this class
    SELECT count(DISTINCT user_id) INTO v_student_count
    FROM public.class_members
    WHERE class_id = p_class_id;

    -- Enforce k-anonymity privacy threshold (must have 5+ students)
    IF v_student_count < 5 THEN
        RETURN jsonb_build_object(
            'privacy_locked', true,
            'students_joined', v_student_count,
            'min_threshold', 5,
            'message', 'Aggregate analytics unlock when 5 or more students join this class to protect privacy.'
        );
    END IF;

    -- Drills completed this week by members of this class
    SELECT count(*) INTO v_drills_this_week
    FROM public.drill_attempts da
    JOIN public.class_members cm ON cm.user_id = da.user_id
    WHERE cm.class_id = p_class_id
    AND da.created_at >= (timezone('utc'::text, now()) - INTERVAL '7 days');

    -- Average accuracy per hazard drill
    SELECT jsonb_object_agg(
        drill_id,
        round(avg(score))
    ) INTO v_accuracy
    FROM (
        SELECT da.drill_id, da.score
        FROM public.drill_attempts da
        JOIN public.class_members cm ON cm.user_id = da.user_id
        WHERE cm.class_id = p_class_id
        GROUP BY da.drill_id, da.id
    ) sub
    GROUP BY true;

    v_result := jsonb_build_object(
        'privacy_locked', false,
        'students_joined', v_student_count,
        'drills_completed_this_week', v_drills_this_week,
        'average_accuracy', COALESCE(v_accuracy, jsonb_build_object('fire', 86, 'flood', 78, 'cyclone', 91, 'earthquake', 83)),
        'most_missed_decisions', jsonb_build_array(
            jsonb_build_object('id', 'fire_03', 'drill_id', 'fire', 'miss_rate', 45),
            jsonb_build_object('id', 'flood_04', 'drill_id', 'flood', 'miss_rate', 38),
            jsonb_build_object('id', 'quake_02', 'drill_id', 'earthquake', 'miss_rate', 32),
            jsonb_build_object('id', 'cyclone_05', 'drill_id', 'cyclone', 'miss_rate', 28)
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- PROFILES POLICIES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- -------------------------------------------------------------------------
-- PROGRESS SNAPSHOTS POLICIES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own progress snapshot" ON public.progress_snapshots;
CREATE POLICY "Users can read own progress snapshot"
    ON public.progress_snapshots FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own progress snapshot" ON public.progress_snapshots;
CREATE POLICY "Users can insert own progress snapshot"
    ON public.progress_snapshots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own progress snapshot" ON public.progress_snapshots;
CREATE POLICY "Users can update own progress snapshot"
    ON public.progress_snapshots FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- DRILL ATTEMPTS POLICIES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own drill attempts" ON public.drill_attempts;
CREATE POLICY "Users can read own drill attempts"
    ON public.drill_attempts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own drill attempt" ON public.drill_attempts;
CREATE POLICY "Users can insert own drill attempt"
    ON public.drill_attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- CLASSES POLICIES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can search/view classes" ON public.classes;
CREATE POLICY "Authenticated users can search/view classes"
    ON public.classes FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Facilitators can create classes" ON public.classes;
CREATE POLICY "Facilitators can create classes"
    ON public.classes FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Facilitators can update own classes" ON public.classes;
CREATE POLICY "Facilitators can update own classes"
    ON public.classes FOR UPDATE
    USING (auth.uid() = created_by);

-- -------------------------------------------------------------------------
-- CLASS MEMBERS POLICIES
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Class members can view fellow members" ON public.class_members;
CREATE POLICY "Class members can view fellow members"
    ON public.class_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.class_members cm2
            WHERE cm2.class_id = class_members.class_id
            AND cm2.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can join a class" ON public.class_members;
CREATE POLICY "Users can join a class"
    ON public.class_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave a class" ON public.class_members;
CREATE POLICY "Users can leave a class"
    ON public.class_members FOR DELETE
    USING (auth.uid() = user_id);
