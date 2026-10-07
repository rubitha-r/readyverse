/**
 * Test Suite: Stage 1 — Single Source of Truth for Progress & Progression
 */

const assert = require("assert");
const ReadyVerseProgress = require("../js/progress.js");

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 1: SINGLE SOURCE OF TRUTH (PROGRESS.JS)");
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

// 1. XP Constants Table
test("XP constants match required table", () => {
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.mission.fire, 200);
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.mission.flood, 250);
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.mission.cyclone, 300);
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.mission.earthquake, 300);
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.learnQuizPass, 100);
    assert.strictEqual(ReadyVerseProgress.XP_REWARDS.planAction, 15);
    assert.strictEqual(ReadyVerseProgress.XP_PER_LEVEL, 200);
});

// 2. Level Calculation & Titles (200 XP per level)
test("Level titles and leveling formula", () => {
    // L1-2: Rookie
    let lvl0 = ReadyVerseProgress.calculateLevel(0);
    assert.strictEqual(lvl0.level, 1);
    assert.strictEqual(lvl0.title, "Rookie");
    assert.strictEqual(lvl0.xpIntoLevel, 0);
    assert.strictEqual(lvl0.xpToNextLevel, 200);

    let lvl199 = ReadyVerseProgress.calculateLevel(199);
    assert.strictEqual(lvl199.level, 1);
    assert.strictEqual(lvl199.title, "Rookie");

    let lvl200 = ReadyVerseProgress.calculateLevel(200);
    assert.strictEqual(lvl200.level, 2);
    assert.strictEqual(lvl200.title, "Rookie");

    // L3-4: Aware
    let lvl400 = ReadyVerseProgress.calculateLevel(400);
    assert.strictEqual(lvl400.level, 3);
    assert.strictEqual(lvl400.title, "Aware");

    let lvl600 = ReadyVerseProgress.calculateLevel(600);
    assert.strictEqual(lvl600.level, 4);
    assert.strictEqual(lvl600.title, "Aware");

    // L5-7: Prepared
    let lvl800 = ReadyVerseProgress.calculateLevel(800);
    assert.strictEqual(lvl800.level, 5);
    assert.strictEqual(lvl800.title, "Prepared");

    let lvl1200 = ReadyVerseProgress.calculateLevel(1200);
    assert.strictEqual(lvl1200.level, 7);
    assert.strictEqual(lvl1200.title, "Prepared");

    // L8-10: Responder
    let lvl1400 = ReadyVerseProgress.calculateLevel(1400);
    assert.strictEqual(lvl1400.level, 8);
    assert.strictEqual(lvl1400.title, "Responder");

    let lvl1800 = ReadyVerseProgress.calculateLevel(1800);
    assert.strictEqual(lvl1800.level, 10);
    assert.strictEqual(lvl1800.title, "Responder");

    // L11+: Guardian
    let lvl2000 = ReadyVerseProgress.calculateLevel(2000);
    assert.strictEqual(lvl2000.level, 11);
    assert.strictEqual(lvl2000.title, "Guardian");

    let lvl2400 = ReadyVerseProgress.calculateLevel(2400);
    assert.strictEqual(lvl2400.level, 13);
    assert.strictEqual(lvl2400.title, "Guardian");
});

// 3. Readiness Formula (40% Sim + 30% Learn + 30% Plan, 0% uncompleted fallback)
test("Readiness formula: 40/30/30 with 0% uncompleted fallback", () => {
    // Empty state
    const emptyState = ReadyVerseProgress.createDefaultState();
    const r0 = ReadyVerseProgress.calculateReadiness(emptyState);
    assert.strictEqual(r0.totalReadiness, 0);
    assert.strictEqual(r0.simulationScore, 0);
    assert.strictEqual(r0.learningScore, 0);
    assert.strictEqual(r0.planScore, 0);

    // 1 mission at 100%: simScore = 100/4 = 25. simComponent = 0.40 * 25 = 10%
    const state1 = {
        completedMissionIds: new Set(["fire"]),
        missionBestScores: { fire: 100 },
        completedLearnIds: new Set(),
        completedPrepItemIds: new Set()
    };
    const r1 = ReadyVerseProgress.calculateReadiness(state1);
    assert.strictEqual(r1.totalReadiness, 10);
    assert.strictEqual(r1.simulationScore, 25);

    // 4 missions at 100%: simScore = 100. simComponent = 40%
    const stateAllMissions = {
        completedMissionIds: new Set(["fire", "flood", "cyclone", "earthquake"]),
        missionBestScores: { fire: 100, flood: 100, cyclone: 100, earthquake: 100 },
        completedLearnIds: new Set(),
        completedPrepItemIds: new Set()
    };
    const rMissions = ReadyVerseProgress.calculateReadiness(stateAllMissions);
    assert.strictEqual(rMissions.totalReadiness, 40);

    // 6 Learn modules: learnScore = 100. learnComponent = 30%
    const stateAllLearn = {
        completedMissionIds: new Set(),
        completedLearnIds: new Set(["fire", "flood", "cyclone", "earthquake", "electrical", "medical"]),
        completedPrepItemIds: new Set()
    };
    const rLearn = ReadyVerseProgress.calculateReadiness(stateAllLearn);
    assert.strictEqual(rLearn.totalReadiness, 30);

    // 40 Plan actions: planScore = 100. planComponent = 30%
    const prep40 = new Set();
    for (let i = 0; i < 40; i++) prep40.add(`item_${i}`);
    const stateAllPlan = {
        completedMissionIds: new Set(),
        completedLearnIds: new Set(),
        completedPrepItemIds: prep40
    };
    const rPlan = ReadyVerseProgress.calculateReadiness(stateAllPlan);
    assert.strictEqual(rPlan.totalReadiness, 30);

    // Full mastery: 40 + 30 + 30 = 100%
    const stateFull = {
        completedMissionIds: new Set(["fire", "flood", "cyclone", "earthquake"]),
        missionBestScores: { fire: 100, flood: 100, cyclone: 100, earthquake: 100 },
        completedLearnIds: new Set(["fire", "flood", "cyclone", "earthquake", "electrical", "medical"]),
        completedPrepItemIds: prep40
    };
    const rFull = ReadyVerseProgress.calculateReadiness(stateFull);
    assert.strictEqual(rFull.totalReadiness, 100);
});

// 4. Acceptance Check 1: Defaults
test("Acceptance Check 1: Brand new user defaults (0 XP, L1 Rookie, 0% readiness, streak 0)", () => {
    const defaults = ReadyVerseProgress.createDefaultState();
    assert.strictEqual(defaults.totalXP, 0);
    assert.strictEqual(defaults.readiness, 0);
    assert.strictEqual(defaults.dailyStreak, 0);
    assert.strictEqual(defaults.longestStreak, 0);
    assert.strictEqual(defaults.completedMissions, 0);
    assert.strictEqual(defaults.completedMissionIds.size, 0);

    const level = ReadyVerseProgress.calculateLevel(defaults.totalXP);
    assert.strictEqual(level.level, 1);
    assert.strictEqual(level.title, "Rookie");
});

// 5. Acceptance Check 2: Realistic Drill Runs (Perfect and Weak Runs)
test("Acceptance Check 2: Realistic Fire Runs -> Perfect: 200 XP, L2 Rookie, 10% readiness; Weak: 47 XP, L1 Rookie, 2% readiness", () => {
    // Perfect Fire run: 100% accuracy, +200 XP
    const statePerfect = ReadyVerseProgress.createDefaultState();
    statePerfect.completedMissionIds.add("fire");
    statePerfect.missionBestScores = { fire: 100 };
    statePerfect.totalXP = 200;
    
    const readinessPerfect = ReadyVerseProgress.calculateReadiness(statePerfect);
    const levelPerfect = ReadyVerseProgress.calculateLevel(statePerfect.totalXP);

    assert.strictEqual(statePerfect.totalXP, 200);
    assert.strictEqual(levelPerfect.level, 2);
    assert.strictEqual(levelPerfect.title, "Rookie");
    // 0.40 * (100 / 4) = 10%
    assert.strictEqual(readinessPerfect.totalReadiness, 10);

    // Weak Fire run: 24% accuracy, 47 XP
    const stateWeak = ReadyVerseProgress.createDefaultState();
    stateWeak.completedMissionIds.add("fire");
    stateWeak.missionBestScores = { fire: 24 };
    stateWeak.totalXP = 47;

    const readinessWeak = ReadyVerseProgress.calculateReadiness(stateWeak);
    const levelWeak = ReadyVerseProgress.calculateLevel(stateWeak.totalXP);

    assert.strictEqual(stateWeak.totalXP, 47);
    assert.strictEqual(levelWeak.level, 1);
    assert.strictEqual(levelWeak.title, "Rookie");
    // 0.40 * (24 / 4) = 2.4 -> round(2.4) = 2%
    assert.strictEqual(readinessWeak.totalReadiness, 2);
});

// 6. Non-Destructive Migration
test("Migration from v1 storage key preserves profiles and resets progress fields", () => {
    // Mock localStorage
    const storage = {};
    global.localStorage = {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v); },
        removeItem: (k) => { delete storage[k]; }
    };

    // Set legacy v1 data
    const legacyData = {
        totalXP: 5400,
        completedMissions: 4,
        readiness: 88,
        completedMissionIds: ["fire", "flood"],
        prepProfile: {
            name: "Cadet Ruby",
            college: "SNS College of Technology",
            emergencyContact: "+91 9876543210",
            campusContact: "Warden 104",
            priorityHazard: "flood",
            medicalNotes: "Blood O+"
        },
        responderProfile: {
            name: "Cadet Ruby",
            titleId: "flood_specialist",
            outfitId: "flood_gear",
            frameId: "flood_frame"
        },
        campusStudio: {
            activeRole: "facilitator",
            campusProfile: {
                name: "SNS Campus East",
                type: "Hostel Block A",
                hazard: "cyclone",
                assemblyPoint: "Sports Ground 2",
                emergencyContact: "112"
            },
            tabletopStep: 2,
            aarRecords: [{ id: "aar_1", scenarioId: "campus_flood" }]
        }
    };
    storage[ReadyVerseProgress.STORAGE_KEY_V1] = JSON.stringify(legacyData);

    const loadedState = ReadyVerseProgress.loadState();

    // Progress fields must be reset
    assert.strictEqual(loadedState.totalXP, 0);
    assert.strictEqual(loadedState.readiness, 0);
    assert.strictEqual(loadedState.completedMissions, 0);
    assert.strictEqual(loadedState.completedMissionIds.size, 0);

    // Profile data must be preserved!
    assert.strictEqual(loadedState.prepProfile.name, "Cadet Ruby");
    assert.strictEqual(loadedState.prepProfile.college, "SNS College of Technology");
    assert.strictEqual(loadedState.prepProfile.emergencyContact, "+91 9876543210");
    assert.strictEqual(loadedState.responderProfile.titleId, "flood_specialist");
    assert.strictEqual(loadedState.campusStudio.activeRole, "facilitator");
    assert.strictEqual(loadedState.campusStudio.campusProfile.name, "SNS Campus East");
    assert.strictEqual(loadedState.campusStudio.aarRecords.length, 1);

    // Legacy v1 key removed and v2 saved
    assert.strictEqual(storage[ReadyVerseProgress.STORAGE_KEY_V1], undefined);
    assert.ok(storage[ReadyVerseProgress.STORAGE_KEY]);
});

// 7. Reset Progress preserves profiles
test("resetProgress resets progress metrics while preserving profile configurations", () => {
    const st = ReadyVerseProgress.createDefaultState();
    st.totalXP = 1500;
    st.readiness = 75;
    st.completedMissionIds.add("fire");
    st.prepProfile.name = "Custom Student";
    st.responderProfile.titleId = "storm_commander";

    ReadyVerseProgress.resetProgress(st);

    assert.strictEqual(st.totalXP, 0);
    assert.strictEqual(st.readiness, 0);
    assert.strictEqual(st.completedMissionIds.size, 0);
    assert.strictEqual(st.prepProfile.name, "Custom Student");
    assert.strictEqual(st.responderProfile.titleId, "storm_commander");
});

// 8. JSON Export / Import with Schema Versioning
test("JSON Export and Import with v2 schema", () => {
    const st = ReadyVerseProgress.createDefaultState();
    st.totalXP = 600;
    st.completedMissionIds.add("fire");
    st.missionBestScores = { fire: 100 };
    st.prepProfile.name = "Export Student";

    const jsonStr = ReadyVerseProgress.exportBackup(st);
    assert.ok(jsonStr.includes('"version": 2'));
    assert.ok(jsonStr.includes('"Export Student"'));

    const newState = ReadyVerseProgress.createDefaultState();
    const result = ReadyVerseProgress.importBackup(jsonStr, newState);
    assert.strictEqual(result.success, true);
    assert.strictEqual(newState.totalXP, 600);
    assert.strictEqual(newState.prepProfile.name, "Export Student");
    assert.strictEqual(newState.completedMissionIds.has("fire"), true);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
