/**
 * ReadyVerse Real Readiness Coach Test Suite (Phase 5)
 * Verifies that AI context extracts real live progress state through ReadyVerseProgress API,
 * accurately computes Readiness = round(0.40*sim + 0.30*learn + 0.30*plan),
 * prioritizes highest-impact next actions (+10% drill, +5% lesson, +0.75% plan action),
 * and handles dual storage keys (readyverse:v2 and readyverse_player_progress_v2).
 */

const assert = require('assert');
const progress = require('../js/progress');
const aiContext = require('../js/readyverse-ai/ai-context');

function runReadinessCoachTests() {
    console.log('=======================================================');
    console.log('🧪 RUNNING REAL READINESS COACH CONTEXT TESTS');
    console.log('=======================================================\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Fresh Student (0% Readiness)
    try {
        const freshState = {
            completedMissionIds: new Set(),
            missionBestScores: {},
            completedLearnIds: new Set(),
            completedPrepItemIds: new Set(),
            totalXP: 0,
            dailyStreak: 0
        };

        const ctx = aiContext.getCoachContext(freshState);
        assert.strictEqual(ctx.readiness.total, 0, 'Fresh state readiness must be 0%');
        assert.strictEqual(ctx.readiness.simulationScore, 0, 'Sim score must be 0');
        assert.strictEqual(ctx.readiness.learningScore, 0, 'Learn score must be 0');
        assert.strictEqual(ctx.readiness.planScore, 0, 'Plan score must be 0');
        assert.strictEqual(ctx.prioritizedNextActions[0].priority, 1);
        assert.strictEqual(ctx.prioritizedNextActions[0].domain, 'drill');
        assert.strictEqual(ctx.prioritizedNextActions[0].readinessImpact, '+10.0%');
        console.log('  ✓ Test 1 Passed: Fresh student context evaluates to 0% readiness and recommends +10% unplayed drill.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 1 Failed:', e.message);
        failed++;
    }

    // Test 2: Partial Progress Student
    try {
        const partialState = {
            completedMissionIds: new Set(['fire', 'flood']),
            missionBestScores: { fire: 80, flood: 80 }, // sum 160 / 4 = 40 avg. 40 * 0.40 = 16 pts
            completedLearnIds: new Set(['fire_safety', 'flood_basics', 'cyclone_prep']), // 3 / 6 = 50%. 50 * 0.30 = 15 pts
            completedPrepItemIds: new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']), // 10 / 40 = 25%. 25 * 0.30 = 7.5 pts
            totalXP: 450,
            dailyStreak: 3
        };

        const ctx = aiContext.getCoachContext(partialState);
        // Formula: round(16 + 15 + 7.5) = round(38.5) = 39%
        assert.strictEqual(ctx.readiness.total, 39, 'Partial readiness must equal 39%');
        assert.strictEqual(ctx.player.drillsCompletedCount, 2, '2 drills completed');
        assert.strictEqual(ctx.player.lessonsPassedCount, 3, '3 lessons completed');
        assert.strictEqual(ctx.player.planActionsDoneCount, 10, '10 plan actions completed');

        // Top next action must be unplayed cyclone drill (+10%)
        assert.strictEqual(ctx.prioritizedNextActions[0].domain, 'drill');
        assert.strictEqual(ctx.prioritizedNextActions[0].target, 'cyclone');
        assert.strictEqual(ctx.prioritizedNextActions[0].readinessImpact, '+10.0%');
        console.log('  ✓ Test 2 Passed: Partial progress student correctly evaluated to 39% readiness with cyclone drill recommended.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 2 Failed:', e.message);
        failed++;
    }

    // Test 3: Master / Completed Student (100% Readiness)
    try {
        const prep40 = new Set();
        for (let i = 1; i <= 40; i++) prep40.add('item_' + i);

        const completeState = {
            completedMissionIds: new Set(['fire', 'flood', 'cyclone', 'earthquake']),
            missionBestScores: { fire: 100, flood: 100, cyclone: 100, earthquake: 100 },
            completedLearnIds: new Set(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']),
            completedPrepItemIds: prep40,
            totalXP: 2500,
            dailyStreak: 15
        };

        const ctx = aiContext.getCoachContext(completeState);
        assert.strictEqual(ctx.readiness.total, 100, 'Complete readiness must be 100%');
        assert.strictEqual(ctx.prioritizedNextActions[0].domain, 'mastery');
        assert.strictEqual(ctx.prioritizedNextActions[0].readinessImpact, '100% Maximum Readiness');
        console.log('  ✓ Test 3 Passed: 100% master readiness correctly detected with mastery action.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 3 Failed:', e.message);
        failed++;
    }

    // Test 4: Dual Storage Key Support in ReadyVerseProgress
    try {
        // Mock localStorage
        const store = {};
        global.localStorage = {
            getItem: (k) => store[k] || null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        };

        // Case A: Save with legacy key, load reads it seamlessly
        store['readyverse:v2'] = JSON.stringify({
            totalXP: 300,
            completedMissionIds: ['fire'],
            completedLearnIds: ['fire_safety'],
            completedPrepItemIds: ['item_1'],
            dailyStreak: 2
        });

        const loadedA = progress.loadState();
        assert.strictEqual(loadedA.totalXP, 300, 'Loaded state from legacy key readyverse:v2');
        assert.ok(loadedA.completedMissionIds.has('fire'), 'Contains fire drill');

        // Case B: Save state writes to BOTH keys
        progress.saveState(loadedA);
        assert.ok(store['readyverse:v2'], 'Saved to readyverse:v2');
        assert.ok(store['readyverse_player_progress_v2'], 'Saved to readyverse_player_progress_v2');

        console.log('  ✓ Test 4 Passed: Dual storage keys (readyverse:v2 & readyverse_player_progress_v2) supported seamlessly without data loss.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 4 Failed:', e.message);
        failed++;
    }

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED\n`);
    if (failed > 0) process.exit(1);
}

runReadinessCoachTests();
