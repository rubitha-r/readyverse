/**
 * ReadyVerse — Automated Test Suite for Class Codes & Real Classroom Leaderboard
 * 
 * Tests:
 * 1. 6-Character Class Code Generation & Format Validation (^[A-Z0-9]{6}$)
 * 2. Warden / Faculty Class Creation & Facilitator Enrollment
 * 3. Student Enrollment via 6-Character Join Code
 * 4. Privacy-Preserving Leaderboard Roster (First name, level, XP, streak ONLY)
 * 5. Timeframe Switching: Weekly vs All-Time Sorting & Ranking
 * 6. "Sample data" Notice Visibility (Shown when not in class, hidden when in class)
 * 7. "Leave Class" Action & Reversion to Sample Community Leaderboard
 * 8. Validation Rejection for Invalid Join Code Formats
 * 9. Supabase DDL & RLS Test Checklist Completeness
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const progress = require('../js/progress');
const { ReadyVerseSyncEngine } = require('../js/supabase-client');

console.log('\n=======================================================');
console.log('🧪 TESTING CLASS CODES & REAL CLASSROOM LEADERBOARDS');
console.log('=======================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✖ FAILED: ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// -----------------------------------------------------------------------------
// 1. 6-Character Class Code Generation
// -----------------------------------------------------------------------------
console.log('--- 1. 6-Character Code Generation & Validation ---');

test('6-character code matches alphanumeric uppercase regex ^[A-Z0-9]{6}$', () => {
    const engine = new ReadyVerseSyncEngine();
    for (let i = 0; i < 20; i++) {
        const code = engine.generateClassCode();
        assert.strictEqual(code.length, 6, 'Code must be exactly 6 characters');
        assert.strictEqual(/^[A-Z0-9]{6}$/.test(code), true, `Code ${code} must match ^[A-Z0-9]{6}$`);
    }
});

test('Rejects invalid code formats (too short, too long, special characters)', async () => {
    const engine = new ReadyVerseSyncEngine();
    const testState = progress.createDefaultState();

    const shortRes = await engine.joinClassByCode('RV8K', testState);
    assert.strictEqual(Boolean(shortRes.error), true, 'Must reject < 6 characters');

    const longRes = await engine.joinClassByCode('RV8K2M9', testState);
    assert.strictEqual(Boolean(longRes.error), true, 'Must reject > 6 characters');

    const symbolRes = await engine.joinClassByCode('RV8-2M', testState);
    assert.strictEqual(Boolean(symbolRes.error), true, 'Must reject symbols');
});

// -----------------------------------------------------------------------------
// 2. Class Creation by Warden / Faculty
// -----------------------------------------------------------------------------
console.log('\n--- 2. Faculty / Warden Class Creation ---');

test('Warden / Faculty creates class and receives valid 6-character code', async () => {
    const engine = new ReadyVerseSyncEngine();
    const testState = progress.createDefaultState();
    testState.prepProfile.college = 'SNS Campus';

    const res = await engine.createClass({ name: 'Cauvery Hostel Wing A' }, testState);
    assert.strictEqual(res.error, null, 'Creation should succeed');
    assert.ok(res.data, 'Must return class data');
    assert.strictEqual(res.data.name, 'Cauvery Hostel Wing A');
    assert.strictEqual(res.data.role, 'facilitator');
    assert.strictEqual(/^[A-Z0-9]{6}$/.test(res.data.code), true, 'Code must be 6 alphanumeric characters');
    assert.deepStrictEqual(testState.activeClass.code, res.data.code, 'State activeClass must be updated');
});

test('Rejects class name with less than 3 characters', async () => {
    const engine = new ReadyVerseSyncEngine();
    const testState = progress.createDefaultState();

    const res = await engine.createClass({ name: 'AB' }, testState);
    assert.strictEqual(Boolean(res.error), true, 'Must reject class name < 3 characters');
});

// -----------------------------------------------------------------------------
// 3. Student Joining Class with 6-Character Code
// -----------------------------------------------------------------------------
console.log('\n--- 3. Student Joining via Class Code ---');

test('Student joins class with 6-character code and enrolls with student role', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.prepProfile.name = 'Rahul Sharma';

    const joinCode = 'RV8K2M';
    const res = await engine.joinClassByCode(joinCode, studentState);
    assert.strictEqual(res.error, null, 'Join should succeed');
    assert.ok(res.data, 'Must return joined class data');
    assert.strictEqual(res.data.code, 'RV8K2M');
    assert.strictEqual(res.data.role, 'student');
    assert.strictEqual(studentState.activeClass.code, 'RV8K2M');
});

// -----------------------------------------------------------------------------
// 4. Privacy-Preserving Class Leaderboard Roster
// -----------------------------------------------------------------------------
console.log('\n--- 4. Privacy Boundary in Class Leaderboard ---');

test('Leaderboard strictly exposes ONLY first name, level, XP, streak, avatar', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.totalXP = 450;
    studentState.dailyStreak = 3;
    studentState.prepProfile.name = 'Priya Ramanathan';
    studentState.prepProfile.medicalNotes = 'Carries EpiPen for severe peanut allergy';
    studentState.prepProfile.emergencyContact = '9876543210';
    studentState.prepProfile.hostelRoom = 'Cauvery Block B Room 304';
    studentState.activeClass = { id: 'cls_123', name: 'Cauvery Hostel', code: 'RV8K2M', role: 'student' };

    const leaderboardRes = await engine.fetchClassLeaderboard(studentState.activeClass.id, 'all-time', studentState);
    assert.strictEqual(leaderboardRes.inClass, true);
    assert.ok(Array.isArray(leaderboardRes.members) && leaderboardRes.members.length > 0);

    leaderboardRes.members.forEach(member => {
        // Required gamification fields
        assert.ok(typeof member.firstName === 'string', 'Must have firstName');
        assert.ok(typeof member.level === 'number', 'Must have level');
        assert.ok(typeof member.totalXP === 'number', 'Must have totalXP');
        assert.ok(typeof member.streak === 'number', 'Must have streak');

        // Sensitive student PII must NEVER be exposed
        assert.strictEqual(member.medicalNotes, undefined, 'Must not expose medicalNotes');
        assert.strictEqual(member.emergencyContact, undefined, 'Must not expose emergencyContact');
        assert.strictEqual(member.studentPhone, undefined, 'Must not expose studentPhone');
        assert.strictEqual(member.hostelRoom, undefined, 'Must not expose hostelRoom');
        assert.strictEqual(member.email, undefined, 'Must not expose email');
        
        // Full name check: must be first name only
        if (member.isUser) {
            assert.strictEqual(member.firstName, 'PRIYA', 'User first name should be extracted without surname');
        }
    });
});

// -----------------------------------------------------------------------------
// 5. Weekly vs All-Time Leaderboard Timeframe
// -----------------------------------------------------------------------------
console.log('\n--- 5. Weekly vs All-Time Timeframe Ranking ---');

test('All-Time leaderboard sorts descending by totalXP', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.totalXP = 2500;
    studentState.activeClass = { id: 'cls_123', name: 'Cauvery Hostel', code: 'RV8K2M', role: 'student' };

    const res = await engine.fetchClassLeaderboard(studentState.activeClass.id, 'all-time', studentState);
    for (let i = 0; i < res.members.length - 1; i++) {
        assert.ok(res.members[i].totalXP >= res.members[i + 1].totalXP, 'All-time members must be sorted by totalXP DESC');
    }
});

test('Weekly leaderboard sorts descending by weeklyXP', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.totalXP = 2500;
    studentState.activeClass = { id: 'cls_123', name: 'Cauvery Hostel', code: 'RV8K2M', role: 'student' };

    const res = await engine.fetchClassLeaderboard(studentState.activeClass.id, 'weekly', studentState);
    for (let i = 0; i < res.members.length - 1; i++) {
        assert.ok(res.members[i].weeklyXP >= res.members[i + 1].weeklyXP, 'Weekly members must be sorted by weeklyXP DESC');
    }
});

// -----------------------------------------------------------------------------
// 6. "Leave Class" Action & Reversion to Sample Data
// -----------------------------------------------------------------------------
console.log('\n--- 6. Leave Class & Sample Data Fallback ---');

test('Leave class clears activeClass in state and reverts to sample leaderboard', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.activeClass = { id: 'cls_123', name: 'Cauvery Hostel', code: 'RV8K2M', role: 'student' };

    const leaveRes = await engine.leaveClass(studentState.activeClass.id, studentState);
    assert.strictEqual(leaveRes.success, true);
    assert.strictEqual(studentState.activeClass, null, 'activeClass must be cleared to null');

    const leaderboardRes = await engine.fetchClassLeaderboard(null, 'all-time', studentState);
    assert.strictEqual(leaderboardRes.inClass, false, 'Must report inClass: false when not enrolled');
});

// -----------------------------------------------------------------------------
// 7. HTML Markup & UI Structure Checks
// -----------------------------------------------------------------------------
console.log('\n--- 7. UI Controls & Sample Notice in index.html ---');

test('index.html contains class join code input, create class form, leave button, and sample notice', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8');

    assert.ok(indexHtml.includes('id="classJoinCodeInput"'), 'Must have classJoinCodeInput');
    assert.ok(indexHtml.includes('id="joinClassSubmitBtn"'), 'Must have joinClassSubmitBtn');
    assert.ok(indexHtml.includes('id="createClassNameInput"'), 'Must have createClassNameInput');
    assert.ok(indexHtml.includes('id="leaveClassBtn"'), 'Must have leaveClassBtn');
    assert.ok(indexHtml.includes('id="activeClassBanner"'), 'Must have activeClassBanner');
    assert.ok(indexHtml.includes('id="timeframeAllTimeBtn"'), 'Must have timeframeAllTimeBtn');
    assert.ok(indexHtml.includes('id="timeframeWeeklyBtn"'), 'Must have timeframeWeeklyBtn');
    assert.ok(indexHtml.includes('Sample data — real leaderboard arrives with accounts'), 'Must maintain Sample data notice');
});

// -----------------------------------------------------------------------------
// 8. Supabase SQL & RLS Verification Matrix
// -----------------------------------------------------------------------------
console.log('\n--- 8. Supabase DDL & RLS Test Checklist ---');

test('docs/supabase.sql contains complete class code procedures and secure class_leaderboard view', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../docs/supabase.sql'), 'utf-8');

    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.generate_class_code'), 'Must define generate_class_code()');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.create_class'), 'Must define create_class()');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.join_class_by_code'), 'Must define join_class_by_code()');
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.leave_class'), 'Must define leave_class()');
    assert.ok(sql.includes('CREATE OR REPLACE VIEW public.class_leaderboard'), 'Must define class_leaderboard view');
    assert.ok(sql.includes('COALESCE(w.weekly_xp, 0) as weekly_xp'), 'Must compute weekly_xp in view');
    assert.ok(sql.includes('DROP POLICY IF EXISTS "Users can leave a class" ON public.class_members'), 'Must have RLS policy to leave class');
});

test('docs/RLS_TEST_CHECKLIST.md exists and covers all multi-tenant and class cohort test scenarios', () => {
    const rlsDoc = fs.readFileSync(path.join(__dirname, '../docs/RLS_TEST_CHECKLIST.md'), 'utf-8');

    assert.ok(rlsDoc.includes('Multi-Tenant Profile Isolation'), 'Must cover profile isolation');
    assert.ok(rlsDoc.includes('Monotonic Progress Snapshot Isolation'), 'Must cover snapshot isolation');
    assert.ok(rlsDoc.includes('Classroom Creation & 6-Character Join Code'), 'Must cover 6-char class code');
    assert.ok(rlsDoc.includes('Student Joining with 6-Character Code'), 'Must cover join code');
    assert.ok(rlsDoc.includes('Student Leaves Class'), 'Must cover leave class');
    assert.ok(rlsDoc.includes('Zero-PII Leaderboard View'), 'Must cover zero PII leaderboard');
});

console.log('\n=======================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('=======================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}
