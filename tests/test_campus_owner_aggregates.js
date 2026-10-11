/**
 * ReadyVerse — Automated Test Suite for Campus Mode Class Owner Aggregates
 * 
 * Requirements Tested:
 * 1. Facilitator / Class Owner Access Control (Owner only vs Student view)
 * 2. Privacy Threshold (k-anonymity): Aggregates unlock ONLY when 5 or more students join
 * 3. Required Aggregate Metrics:
 *    - Students Joined
 *    - Drills Completed This Week
 *    - Average Accuracy Per Drill (Fire, Flood, Cyclone, Earthquake)
 *    - Most-Missed Decisions (Decision ID & Situation Text)
 * 4. Zero Student Names / PII in Aggregate Payload
 * 5. Supabase SQL DDL Procedure & Security Definition
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const progress = require('../js/progress');
const { ReadyVerseSyncEngine } = require('../js/supabase-client');

console.log('\n=======================================================');
console.log('🧪 TESTING CAMPUS MODE CLASS OWNER AGGREGATES');
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
// 1. Class Owner Access Control
// -----------------------------------------------------------------------------
console.log('--- 1. Class Owner / Facilitator Authorization ---');

test('Facilitator / Class Owner can access aggregate analytics', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_test_01',
        name: 'Cauvery Hostel Facilitator Cohort',
        code: 'RV8K2M',
        role: 'facilitator',
        simulatedCount: 6
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.strictEqual(res.isOwner, true, 'Facilitator should be recognized as class owner');
    assert.strictEqual(res.privacyLocked, false, 'Should be unlocked for >= 5 students');
});

test('Student role is denied access to institutional aggregate analytics', async () => {
    const engine = new ReadyVerseSyncEngine();
    const studentState = progress.createDefaultState();
    studentState.campusStudio.activeRole = 'student';
    studentState.activeClass = {
        id: 'cls_test_01',
        name: 'Cauvery Hostel Student Cohort',
        code: 'RV8K2M',
        role: 'student'
    };

    const res = await engine.fetchClassOwnerAggregates(studentState.activeClass.id, studentState);
    assert.strictEqual(res.isOwner, false, 'Regular student must NOT be granted owner access');
    assert.ok(res.error, 'Must provide access denied notice');
});

// -----------------------------------------------------------------------------
// 2. Privacy Threshold (k-anonymity: 5+ Students)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Privacy Threshold (5+ Students Required) ---');

test('Aggregates remain locked when cohort has fewer than 5 students (e.g. 3 students)', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_small_01',
        name: 'Small Cohort',
        code: 'SM8K2M',
        role: 'facilitator',
        simulatedCount: 3 // Less than 5 students
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.strictEqual(res.isOwner, true);
    assert.strictEqual(res.privacyLocked, true, 'Must lock aggregates when < 5 students');
    assert.strictEqual(res.minThreshold, 5, 'Minimum threshold must be 5');
    assert.strictEqual(res.studentsJoined, 3, 'Must report current student count');
    assert.strictEqual(res.averageAccuracyPerDrill, undefined, 'Must NOT leak drill accuracy');
    assert.strictEqual(res.mostMissedDecisions, undefined, 'Must NOT leak missed decisions');
});

test('Aggregates unlock when cohort has exactly 5 students', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_five_01',
        name: 'Five Student Cohort',
        code: 'FV8K2M',
        role: 'facilitator',
        simulatedCount: 5
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.strictEqual(res.isOwner, true);
    assert.strictEqual(res.privacyLocked, false, 'Must unlock aggregates for 5 students');
    assert.strictEqual(res.studentsJoined, 5);
    assert.ok(res.averageAccuracyPerDrill, 'Must provide accuracy stats');
});

test('Aggregates unlock when cohort has more than 5 students (e.g. 7 students)', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_seven_01',
        name: 'Seven Student Cohort',
        code: 'SV8K2M',
        role: 'facilitator',
        simulatedCount: 7
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.strictEqual(res.privacyLocked, false, 'Must unlock aggregates for 7 students');
    assert.strictEqual(res.studentsJoined, 7);
});

// -----------------------------------------------------------------------------
// 3. Aggregate Metrics & Average Accuracy Per Drill
// -----------------------------------------------------------------------------
console.log('\n--- 3. Required Aggregate Metrics ---');

test('Returns students joined, drills this week, and average accuracy across all 4 drills', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_valid_01',
        name: 'Main Campus Cohort',
        code: 'MC8K2M',
        role: 'facilitator',
        simulatedCount: 8
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.strictEqual(res.studentsJoined, 8, 'Students joined must be 8');
    assert.ok(typeof res.drillsCompletedThisWeek === 'number', 'Drills this week must be a number');
    assert.ok(res.drillsCompletedThisWeek > 0, 'Drills this week must be positive');

    // 4 Drills accuracy verification
    const acc = res.averageAccuracyPerDrill;
    assert.ok(acc, 'Accuracy object must exist');
    assert.ok(typeof acc.fire === 'number' && acc.fire >= 0 && acc.fire <= 100, 'Fire accuracy valid');
    assert.ok(typeof acc.flood === 'number' && acc.flood >= 0 && acc.flood <= 100, 'Flood accuracy valid');
    assert.ok(typeof acc.cyclone === 'number' && acc.cyclone >= 0 && acc.cyclone <= 100, 'Cyclone accuracy valid');
    assert.ok(typeof acc.earthquake === 'number' && acc.earthquake >= 0 && acc.earthquake <= 100, 'Earthquake accuracy valid');
});

// -----------------------------------------------------------------------------
// 4. Most-Missed Decisions (Anonymous, ID and Text, NO Names)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Anonymous Most-Missed Decisions ---');

test('Most-missed decisions contains decision ID and text with ZERO student names', async () => {
    const engine = new ReadyVerseSyncEngine();
    const facilitatorState = progress.createDefaultState();
    facilitatorState.campusStudio.activeRole = 'facilitator';
    facilitatorState.activeClass = {
        id: 'cls_valid_02',
        name: 'Cauvery Hostel',
        code: 'CH8K2M',
        role: 'facilitator',
        simulatedCount: 6
    };

    const res = await engine.fetchClassOwnerAggregates(facilitatorState.activeClass.id, facilitatorState);
    assert.ok(Array.isArray(res.mostMissedDecisions) && res.mostMissedDecisions.length > 0);

    res.mostMissedDecisions.forEach(item => {
        // Required fields
        assert.ok(typeof item.decisionId === 'string', 'Must contain decisionId');
        assert.ok(item.decisionId.length >= 4, 'decisionId must be formatted (e.g. fire_03)');
        assert.ok(typeof item.decisionText === 'string', 'Must contain decisionText');
        assert.ok(item.decisionText.length > 15, 'decisionText must be descriptive situation text');
        assert.ok(typeof item.missRatePct === 'number', 'Must contain missRatePct');

        // Privacy assertion: zero names or individual references
        assert.strictEqual(item.studentName, undefined, 'Must NOT contain studentName');
        assert.strictEqual(item.studentId, undefined, 'Must NOT contain studentId');
        assert.strictEqual(item.userId, undefined, 'Must NOT contain userId');
        assert.strictEqual(item.names, undefined, 'Must NOT contain names array');
        assert.strictEqual(item.email, undefined, 'Must NOT contain email');
    });
});

// -----------------------------------------------------------------------------
// 5. Supabase SQL DDL Verification
// -----------------------------------------------------------------------------
console.log('\n--- 5. Supabase DDL Procedure Verification ---');

test('docs/supabase.sql defines get_class_owner_aggregates with owner check and 5+ student threshold', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../docs/supabase.sql'), 'utf-8');

    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.get_class_owner_aggregates'), 'Must define get_class_owner_aggregates');
    assert.ok(sql.includes('v_student_count < 5'), 'Must check student count < 5 in SQL');
    assert.ok(sql.includes('privacy_locked'), 'Must return privacy_locked');
    assert.ok(sql.includes('drills_completed_this_week'), 'Must compute drills_completed_this_week');
    assert.ok(sql.includes('average_accuracy'), 'Must compute average_accuracy');
    assert.ok(sql.includes('most_missed_decisions'), 'Must aggregate most_missed_decisions');
});

console.log('\n=======================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('=======================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}
