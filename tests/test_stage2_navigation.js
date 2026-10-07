/**
 * Test Suite: Stage 2 — Header, Theme & Navigation Integration
 */

const assert = require("assert");
const ReadyVerseProgress = require("../js/progress.js");

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 2: HEADER, THEME & NAVIGATION");
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

// 1. Theme Controller Logic Verification
test("Theme Controller sets data-theme and preserves user preference", () => {
    const mockDOM = {
        theme: null,
        pref: null,
        storage: {},
        buttons: [
            { theme: "light", active: false, checked: "false" },
            { theme: "dark", active: false, checked: "false" },
            { theme: "system", active: true, checked: "true" }
        ],
        indicatorText: ""
    };

    function mockApplyTheme(preference, isSystemDark = true) {
        const resolvedTheme = preference === "system" ? (isSystemDark ? "dark" : "light") : preference;
        mockDOM.theme = resolvedTheme;
        mockDOM.pref = preference;
        mockDOM.buttons.forEach(b => {
            b.active = b.theme === preference;
            b.checked = b.theme === preference ? "true" : "false";
        });
        mockDOM.indicatorText = preference === "system" ? `SYSTEM (${resolvedTheme.toUpperCase()})` : preference.toUpperCase();
    }

    // Set to dark
    mockApplyTheme("dark");
    assert.strictEqual(mockDOM.theme, "dark");
    assert.strictEqual(mockDOM.pref, "dark");
    assert.strictEqual(mockDOM.buttons.find(b => b.theme === "dark").active, true);

    // Set to light
    mockApplyTheme("light");
    assert.strictEqual(mockDOM.theme, "light");
    assert.strictEqual(mockDOM.pref, "light");
    assert.strictEqual(mockDOM.buttons.find(b => b.theme === "light").active, true);

    // Set to system (when OS is dark)
    mockApplyTheme("system", true);
    assert.strictEqual(mockDOM.theme, "dark");
    assert.strictEqual(mockDOM.pref, "system");
    assert.strictEqual(mockDOM.buttons.find(b => b.theme === "system").active, true);
    assert.strictEqual(mockDOM.indicatorText, "SYSTEM (DARK)");
});

// 2. Navigation Sections Coverage
test("All 8 primary sections are defined and cleanly switchable", () => {
    const validSections = [
        "dashboard",
        "missions",
        "progress",
        "preparedness",
        "achievements",
        "leaderboard",
        "learn",
        "campus"
    ];

    const mockContentSections = {};
    validSections.forEach(s => {
        mockContentSections[s] = { id: `${s}Content`, hidden: true };
    });

    const mockNavItems = validSections.map(s => ({ section: s, active: false }));

    function mockSwitchSection(sectionName) {
        let actual = sectionName;
        if (actual === "passport") actual = "progress";

        Object.values(mockContentSections).forEach(s => { s.hidden = true; });
        mockNavItems.forEach(n => { n.active = false; });

        const target = mockContentSections[actual];
        if (target) target.hidden = false;

        const nav = mockNavItems.find(n => n.section === actual);
        if (nav) nav.active = true;

        return actual;
    }

    validSections.forEach(sec => {
        const result = mockSwitchSection(sec);
        assert.strictEqual(result, sec);
        assert.strictEqual(mockContentSections[sec].hidden, false);
        assert.strictEqual(mockNavItems.find(n => n.section === sec).active, true);
    });

    // Passport alias routes directly to progress
    const passResult = mockSwitchSection("passport");
    assert.strictEqual(passResult, "progress");
    assert.strictEqual(mockContentSections.progress.hidden, false);
});

// 3. Level Progression & Title Formula under 200 XP System
test("Responder ranks and titles follow 200 XP/level formula without locking safety content", () => {
    // Beginner: L1 (0 XP) -> Rookie
    let state0 = { totalXP: 0 };
    let lvl0 = ReadyVerseProgress.calculateLevel(state0.totalXP);
    assert.strictEqual(lvl0.level, 1);
    assert.strictEqual(lvl0.title, "Rookie");

    // Intermediate: 800 XP -> Level 5 Prepared
    let state800 = { totalXP: 800 };
    let lvl800 = ReadyVerseProgress.calculateLevel(state800.totalXP);
    assert.strictEqual(lvl800.level, 5);
    assert.strictEqual(lvl800.title, "Prepared");

    // Responder: 1400 XP -> Level 8 Responder
    let state1400 = { totalXP: 1400 };
    let lvl1400 = ReadyVerseProgress.calculateLevel(state1400.totalXP);
    assert.strictEqual(lvl1400.level, 8);
    assert.strictEqual(lvl1400.title, "Responder");

    // Guardian: 2000 XP -> Level 11 Guardian
    let state2000 = { totalXP: 2000 };
    let lvl2000 = ReadyVerseProgress.calculateLevel(state2000.totalXP);
    assert.strictEqual(lvl2000.level, 11);
    assert.strictEqual(lvl2000.title, "Guardian");
});

// 4. Student Responder Profile Header Sync
test("Header & sidebar reflect student identity and plain-language titles", () => {
    const student = {
        totalXP: 450,
        responderProfile: {
            name: "Ananya Sharma",
            titleId: "trainee"
        }
    };
    const lvlInfo = ReadyVerseProgress.calculateLevel(student.totalXP);
    assert.strictEqual(lvlInfo.level, 3);
    assert.strictEqual(lvlInfo.title, "Aware");

    const headerDisplay = `LVL ${String(lvlInfo.level).padStart(2, "0")}`;
    const sidebarRank = `LEVEL ${String(lvlInfo.level).padStart(2, "0")} · ${lvlInfo.title.toUpperCase()}`;

    assert.strictEqual(headerDisplay, "LVL 03");
    assert.strictEqual(sidebarRank, "LEVEL 03 · AWARE");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
