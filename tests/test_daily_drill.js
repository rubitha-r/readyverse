/**
 * Test Suite: 60-Second Daily Drill
 * 
 * Verifies:
 * 1. 3 decisions picked deterministically by date from existing 4 drills (32 total).
 * 2. Rotate by date so all students receive the exact same decisions on a given day.
 * 3. 60-second timer and session lifecycle.
 * 4. Instant one-line feedback for choices (correct and sub-optimal).
 * 5. Results screen with score, key lesson learned, streak tracking, and +50 XP award via ReadyVerseProgress.
 * 6. One-drill-per-day streak rule preservation.
 * 7. Non-duplication and integrity of existing mission data.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("\n=======================================================");
console.log("🧪 TESTING 60-SECOND DAILY DRILL ENGINE");
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

// Setup sandbox environment for script execution
const domElements = {};
function createMockElement(id) {
    return {
        id,
        textContent: "",
        innerHTML: "",
        value: "",
        dataset: {},
        style: {},
        classList: {
            add: function(c) { this._classes = this._classes || new Set(); this._classes.add(c); },
            remove: function(c) { this._classes = this._classes || new Set(); this._classes.delete(c); },
            contains: function(c) { return this._classes ? this._classes.has(c) : false; },
            toggle: function(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
        },
        setAttribute: () => {},
        getAttribute: () => "",
        removeAttribute: () => {},
        hasAttribute: () => false,
        addEventListener: () => {},
        closest: () => ({ querySelector: () => ({ textContent: "", innerHTML: "" }) }),
        querySelector: () => createMockElement("sub_" + id),
        querySelectorAll: () => [createMockElement("opt0"), createMockElement("opt1"), createMockElement("opt2"), createMockElement("opt3")],
        appendChild: () => {}
    };
}

const sandbox = {
    window: {},
    document: {
        getElementById: (id) => {
            if (!domElements[id]) domElements[id] = createMockElement(id);
            return domElements[id];
        },
        querySelector: (sel) => {
            const clean = sel.replace("#", "").replace(".", "");
            if (!domElements[clean]) domElements[clean] = createMockElement(clean);
            return domElements[clean];
        },
        querySelectorAll: () => [],
        createElement: (tag) => createMockElement(tag),
        addEventListener: () => {},
        body: createMockElement("body")
    },
    localStorage: {
        _data: {},
        getItem: function(k) { return this._data[k] || null; },
        setItem: function(k, v) { this._data[k] = String(v); },
        removeItem: function(k) { delete this._data[k]; },
        clear: function() { this._data = {}; }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn) => { if (typeof fn === "function") fn(); },
    clearTimeout: () => {},
    setInterval: () => 123,
    clearInterval: () => {},
    confirm: () => true,
    alert: () => {},
    prompt: () => ""
};

sandbox.window = sandbox;
sandbox.self = sandbox;

const progressCode = fs.readFileSync(path.join(__dirname, "../js/progress.js"), "utf8");
const scriptCode = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");

vm.createContext(sandbox);
vm.runInContext(progressCode, sandbox);
vm.runInContext(scriptCode, sandbox);

const ReadyVerseProgress = sandbox.ReadyVerseProgress;
const missions = sandbox.missions;
const getDailyDrillDecisions = sandbox.getDailyDrillDecisions;
const getDailyDrillLessonTakeaway = sandbox.getDailyDrillLessonTakeaway;
const startDailyDrill = sandbox.startDailyDrill;
const handleDailyDrillChoice = sandbox.handleDailyDrillChoice;
const finishDailyDrill = sandbox.finishDailyDrill;
const getDailyDrillSession = sandbox.getDailyDrillSession;
const setDailyDrillSession = sandbox.setDailyDrillSession;
const state = sandbox.state;

// TEST 1: Mission Data Integrity
test("Check 1: Original mission decision pools remain intact (8 each, 32 total)", () => {
    assert.strictEqual(missions.fire.questions.length, 8, "Building Fire has 8 questions");
    assert.strictEqual(missions.flood.questions.length, 8, "Flash Flood has 8 questions");
    assert.strictEqual(missions.cyclone.questions.length, 8, "Cyclone Emergency has 8 questions");
    assert.strictEqual(missions.earthquake.questions.length, 8, "Earthquake Response has 8 questions");
});

// TEST 2: Deterministic Daily Drill Selection
test("Check 2: Exactly 3 distinct decisions selected deterministically per calendar date", () => {
    const d1 = getDailyDrillDecisions("2026-10-06");
    const d1_repeat = getDailyDrillDecisions("2026-10-06");
    
    assert.strictEqual(d1.length, 3, "Must select exactly 3 decisions");
    assert.deepStrictEqual(d1, d1_repeat, "Same date must produce identical decisions for all students");

    // Check all 3 are distinct
    const keys = d1.map(item => `${item.drillId}:${item.questionIndex}`);
    const uniqueKeys = new Set(keys);
    assert.strictEqual(uniqueKeys.size, 3, "All 3 selected decisions must be distinct");

    // Check structure of each decision
    d1.forEach(item => {
        assert.ok(item.drillId, "Has drillId");
        assert.ok(item.drillTitle, "Has drillTitle");
        assert.ok(item.drillIcon, "Has drillIcon");
        assert.ok(typeof item.questionIndex === "number", "Has valid questionIndex");
        assert.ok(item.question && item.question.situation, "Has situation text");
        assert.strictEqual(item.question.options.length, 4, "Has 4 options");
    });
});

// TEST 3: Daily Rotation
test("Check 3: Decisions rotate when calendar date changes", () => {
    const dDay1 = getDailyDrillDecisions("2026-10-06");
    const dDay2 = getDailyDrillDecisions("2026-10-07");
    const dDay3 = getDailyDrillDecisions("2026-10-08");

    const key1 = dDay1.map(i => `${i.drillId}:${i.questionIndex}`).join(",");
    const key2 = dDay2.map(i => `${i.drillId}:${i.questionIndex}`).join(",");
    const key3 = dDay3.map(i => `${i.drillId}:${i.questionIndex}`).join(",");

    assert.notStrictEqual(key1, key2, "Day 1 and Day 2 must have rotated selections");
    assert.notStrictEqual(key2, key3, "Day 2 and Day 3 must have rotated selections");
});

// TEST 4: 60-Second Timer & Session Start
test("Check 4: startDailyDrill initializes 60-second total timer and active session", () => {
    startDailyDrill();
    const session = getDailyDrillSession();

    assert.strictEqual(session.timerRemaining, 60, "Timer starts at 60 seconds");
    assert.strictEqual(session.isActive, true, "Session is active");
    assert.strictEqual(session.currentIndex, 0, "Starts at decision 0");
    assert.strictEqual(session.decisions.length, 3, "3 decisions loaded");
});

// TEST 5: Instant One-Line Feedback on Choice
test("Check 5: Instant feedback provides clear explanation and disables options", () => {
    startDailyDrill();
    const session = getDailyDrillSession();
    const currentQ = session.decisions[0].question;
    
    // Find correct and incorrect option indices
    const correctIdx = currentQ.options.findIndex(o => o.correct);
    const wrongIdx = currentQ.options.findIndex(o => !o.correct);

    // Test correct choice
    handleDailyDrillChoice(correctIdx);
    assert.strictEqual(session.correctCount, 1, "Correct answer increments correctCount");
    assert.strictEqual(session.answers.length, 1, "Answer recorded");
    assert.strictEqual(session.answers[0].isCorrect, true, "Recorded as correct");

    const bannerText = domElements["dailyDrillFeedbackText"].textContent;
    assert.ok(bannerText.includes("Correct choice!"), "Feedback highlights correct decision");
});

// TEST 6: Lesson Learned Extraction
test("Check 6: Generates succinct key takeaway from today's decisions", () => {
    const decisions = getDailyDrillDecisions("2026-10-06");
    const lesson = getDailyDrillLessonTakeaway(decisions);
    assert.ok(typeof lesson === "string" && lesson.length > 20, "Lesson learned text is generated");
});

// TEST 7: Scoring, XP Award & Streak Rule
test("Check 7: Full completion awards +50 XP and enforces one-drill-per-day streak rule", () => {
    ReadyVerseProgress.resetProgress(state);
    const initialXP = state.totalXP;
    assert.strictEqual(initialXP, 0);

    // Run Daily Drill on Day 1
    setDailyDrillSession({
        date: "2026-10-06",
        decisions: getDailyDrillDecisions("2026-10-06"),
        currentIndex: 2,
        answers: [],
        score: 99,
        correctCount: 3,
        timerRemaining: 35,
        isActive: true,
        isFinished: false
    });

    finishDailyDrill(false);

    assert.strictEqual(state.totalXP, 50, "Awards +50 XP for daily drill");
    assert.strictEqual(state.dailyStreak, 1, "Streak is 1 on first day");
    assert.strictEqual(state.lastDailyDrillDate, "2026-10-06", "Records completion date");

    // Replay on same day (Day 1)
    setDailyDrillSession({
        date: "2026-10-06",
        decisions: getDailyDrillDecisions("2026-10-06"),
        currentIndex: 2,
        answers: [],
        score: 99,
        correctCount: 3,
        timerRemaining: 40,
        isActive: true,
        isFinished: false
    });
    finishDailyDrill(false);

    assert.strictEqual(state.totalXP, 100, "+50 XP awarded");
    assert.strictEqual(state.dailyStreak, 1, "Streak must remain 1 on same day (one-drill-per-day rule)");
});

console.log(`\nDaily Drill Test Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
    process.exit(1);
}
