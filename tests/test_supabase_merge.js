/**
 * Test Suite: Supabase Integration & Monotonic Conflict Resolution Merge
 * 
 * Verifies (docs/BACKEND_DESIGN.md):
 * 1. Monotonic Total XP: max(local, cloud).
 * 2. Completed Drills & Lessons: Set union (local ∪ cloud).
 * 3. Drill Best Scores: max(local[k], cloud[k]) for each disaster drill.
 * 4. Composite Readiness: Deterministic 40/30/30 recalculation from merged state.
 * 5. Level & Title: Deterministic recalculation from merged XP.
 * 6. Privacy Boundary: Medical and emergency contact data NEVER leaked or overwritten.
 * 7. prepareSyncPayload sanitization: Strips all local-only private fields.
 * 8. Security audit: Zero Supabase service keys in client code or repo.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("\n=======================================================");
console.log("🧪 TESTING SUPABASE SYNC & MONOTONIC MERGE RULES");
console.log("=======================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    }
}

const ProgressModule = require('../js/progress.js');
const SyncModule = require('../js/supabase-client.js');

// =========================================================================
// 1. MONOTONIC XP & LEVEL MERGE
// =========================================================================
console.log("--- 1. Monotonic XP & Level Conflict Resolution ---");

test("Total XP takes maximum between local and cloud (monotonic progress)", () => {
    const local = ProgressModule.createDefaultState();
    local.totalXP = 650;

    const cloudSnapshot = {
        total_xp: 800,
        completed_missions: ['fire', 'flood']
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.totalXP, 800, "Merged XP should take cloud XP when higher");
    assert.strictEqual(merged.completedMissions, 2);
});

test("Local higher XP is never downgraded by older cloud snapshot", () => {
    const local = ProgressModule.createDefaultState();
    local.totalXP = 1200;

    const cloudSnapshot = {
        total_xp: 900
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.totalXP, 1200, "Local higher XP must be preserved");
});

test("Level and title recompute deterministically from merged XP", () => {
    const local = ProgressModule.createDefaultState();
    local.totalXP = 150; // Level 1 Rookie

    const cloudSnapshot = {
        total_xp: 450 // Level 3 Aware (450 / 200 + 1 = 3)
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    const levelInfo = ProgressModule.calculateLevel(merged.totalXP);
    assert.strictEqual(levelInfo.level, 3);
    assert.strictEqual(levelInfo.title, "Aware");
});

// =========================================================================
// 2. SET UNIONS & DRILL SCORE RESOLUTION
// =========================================================================
console.log("\n--- 2. Disjoint Sets & Drill Best Scores ---");

test("Completed missions merges as a set union", () => {
    const local = ProgressModule.createDefaultState();
    local.completedMissionIds = new Set(['fire']);

    const cloudSnapshot = {
        completed_missions: ['flood', 'cyclone']
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert(merged.completedMissionIds.has('fire'));
    assert(merged.completedMissionIds.has('flood'));
    assert(merged.completedMissionIds.has('cyclone'));
    assert.strictEqual(merged.completedMissionIds.size, 3);
    assert.strictEqual(merged.completedMissions, 3);
});

test("Mission best scores take maximum per hazard drill", () => {
    const local = ProgressModule.createDefaultState();
    local.completedMissionIds = new Set(['fire', 'flood']);
    local.missionBestScores = { fire: 100, flood: 60 };

    const cloudSnapshot = {
        completed_missions: ['flood', 'cyclone'],
        mission_best_scores: { flood: 90, cyclone: 85 }
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.missionBestScores.fire, 100, "Fire score 100 preserved");
    assert.strictEqual(merged.missionBestScores.flood, 90, "Flood score 90 (cloud max) retained");
    assert.strictEqual(merged.missionBestScores.cyclone, 85, "Cyclone score 85 added");
    assert.strictEqual(merged.missionBestGrades.flood, 'A', "Grade recalculated from score 90");
});

test("Completed learn modules & preparedness items merge via set union", () => {
    const local = ProgressModule.createDefaultState();
    local.completedLearnIds = new Set(['fire', 'flood']);
    local.completedPrepItemIds = new Set(['action_1', 'action_2']);

    const cloudSnapshot = {
        completed_learn_ids: ['flood', 'cyclone', 'earthquake'],
        completed_prep_item_ids: ['action_2', 'action_3', 'action_4']
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.completedLearnIds.size, 4, "4 unique learn modules");
    assert.strictEqual(merged.completedPrepItemIds.size, 4, "4 unique plan items");
});

test("Readiness Score recomputes deterministically using 40/30/30 formula", () => {
    const local = ProgressModule.createDefaultState();
    local.completedMissionIds = new Set(['fire']);
    local.missionBestScores = { fire: 100 };
    local.completedLearnIds = new Set(['fire', 'flood', 'cyclone']); // 3/6 = 50%
    local.completedPrepItemIds = new Set(Array.from({ length: 20 }, (_, i) => `item_${i}`)); // 20/40 = 50%

    // Simulation score = 100/4 = 25% -> 0.40 * 25 = 10%
    // Learn score = 50% -> 0.30 * 50 = 15%
    // Plan score = 50% -> 0.30 * 50 = 15%
    // Total Readiness = 10 + 15 + 15 = 40%

    const cloudSnapshot = {
        completed_missions: ['fire'],
        mission_best_scores: { fire: 100 },
        completed_learn_ids: ['fire', 'flood', 'cyclone'],
        completed_prep_item_ids: Array.from({ length: 20 }, (_, i) => `item_${i}`)
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.readiness, 40, "Readiness score must equal 40%");
});

// =========================================================================
// 3. PRIVACY BOUNDARY & CLIENT-SIDE SANITIZATION
// =========================================================================
console.log("\n--- 3. Privacy Boundary & Zero-Liability Data Sanitization ---");

test("prepareSyncPayload strictly strips medical notes, phone numbers, and emergency contacts", () => {
    const local = ProgressModule.createDefaultState();
    local.totalXP = 500;
    local.prepProfile.medicalNotes = "Asthma inhaler in desk drawer, allergic to penicillin";
    local.prepProfile.emergencyContact = "Parents +91 9876543210";
    local.prepProfile.campusContact = "Warden +91 9123456780";
    local.responderProfile.studentPhone = "+91 9888877777";
    local.responderProfile.hostelRoom = "Cauvery Hostel, Room 304";

    const payload = ProgressModule.prepareSyncPayload(local);

    assert.strictEqual(payload.total_xp, 500);
    assert.strictEqual(payload.medicalNotes, undefined);
    assert.strictEqual(payload.emergencyContact, undefined);
    assert.strictEqual(payload.studentPhone, undefined);
    assert.strictEqual(payload.hostelRoom, undefined);
    assert(!JSON.stringify(payload).includes("Asthma"), "Payload must not contain medical notes");
    assert(!JSON.stringify(payload).includes("9876543210"), "Payload must not contain emergency contact phone");
    assert(!JSON.stringify(payload).includes("Cauvery Hostel"), "Payload must not contain hostel room");
});

test("Cloud merge never erases or overwrites local medical notes or contact details", () => {
    const local = ProgressModule.createDefaultState();
    local.prepProfile.medicalNotes = "Blood group O+";
    local.responderProfile.studentPhone = "9999988888";

    const cloudSnapshot = {
        total_xp: 1000,
        completed_missions: ['fire']
    };

    const merged = ProgressModule.mergeProgress(local, cloudSnapshot);
    assert.strictEqual(merged.totalXP, 1000);
    assert.strictEqual(merged.prepProfile.medicalNotes, "Blood group O+");
    assert.strictEqual(merged.responderProfile.studentPhone, "9999988888");
});

// =========================================================================
// 4. SECURITY AUDIT: NO SERVICE ROLE KEYS
// =========================================================================
console.log("\n--- 4. Security Audit (No Secret Service Keys) ---");

test("No service_role keys or secret tokens exist in client codebase or repository", () => {
    const filesToAudit = [
        '../js/supabase-client.js',
        '../js/progress.js',
        '../js/script.js',
        '../index.html',
        '../docs/supabase.sql',
        '../docs/BACKEND_DESIGN.md'
    ];

    filesToAudit.forEach(relPath => {
        const fullPath = path.join(__dirname, relPath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            assert(!content.includes("service_role_key"), `File ${relPath} must not contain service_role_key`);
            assert(!content.includes("SUPABASE_SERVICE_KEY"), `File ${relPath} must not contain SUPABASE_SERVICE_KEY`);
            assert(!content.includes("sbp_"), `File ${relPath} must not contain Supabase service tokens`);
        }
    });
});

test("docs/supabase.sql exists and contains valid PostgreSQL DDL with RLS policies", () => {
    const sqlPath = path.join(__dirname, '../docs/supabase.sql');
    assert(fs.existsSync(sqlPath), "docs/supabase.sql must exist");
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert(sql.includes("CREATE TABLE IF NOT EXISTS public.profiles"), "Must create profiles table");
    assert(sql.includes("CREATE TABLE IF NOT EXISTS public.progress_snapshots"), "Must create progress_snapshots table");
    assert(sql.includes("CREATE TABLE IF NOT EXISTS public.drill_attempts"), "Must create drill_attempts table");
    assert(sql.includes("CREATE TABLE IF NOT EXISTS public.classes"), "Must create classes table");
    assert(sql.includes("CREATE TABLE IF NOT EXISTS public.class_members"), "Must create class_members table");
    assert(sql.includes("CREATE OR REPLACE VIEW public.class_leaderboard"), "Must create class_leaderboard view");
    assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "Must enable RLS on tables");
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n=======================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=======================================================\n");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
