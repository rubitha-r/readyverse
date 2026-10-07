/**
 * ReadyVerse - Stage 6 Follow-Up (Prompt 5): Engagement Layer Tests
 * Pure vanilla JavaScript verification of:
 * 1. 3-Screen First-Run Onboarding (Name, Goal, Start Daily Drill)
 * 2. Celebration Moments (Canvas Confetti, Level-up, Badge unlock, Perfect drill, prefers-reduced-motion)
 * 3. Visible Streak Flame & Evening "Streak at Risk" Alert
 * 4. Weekly Progress Ring & Next Badge Hint Calculation
 * 5. Friendly Student Microcopy & Error Handling
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("\n=======================================================");
console.log("🧪 TESTING ENGAGEMENT LAYER & FIRST-RUN ONBOARDING (PROMPT 5)");
console.log("=======================================================\n");

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ ${message}`);
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        process.exitCode = 1;
    }
}

// 1. Load source files
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const styleCss = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
const progressJs = fs.readFileSync(path.join(__dirname, "../js/progress.js"), "utf8");
const scriptJs = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
const aiUiJs = fs.readFileSync(path.join(__dirname, "../js/readyverse-ai/ai-ui.js"), "utf8");

function createMockEnvironment(options = {}) {
    const storage = options.storage || {};
    let reducedMotion = Boolean(options.reducedMotion);
    let mockHour = options.hour !== undefined ? options.hour : 12;

    const mockCanvasContext = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        fillRect: () => {},
        clearRect: () => {},
        translate: () => {},
        rotate: () => {},
        globalAlpha: 1,
        fillStyle: "#000000"
    };

    const elementsMap = {};
    function getOrCreateElement(id, tagName = "div") {
        if (!elementsMap[id]) {
            const classSet = new Set();
            const attrMap = {};
            elementsMap[id] = {
                id,
                tagName: tagName.toUpperCase(),
                classList: {
                    add: (c) => classSet.add(c),
                    remove: (c) => classSet.delete(c),
                    toggle: (c, force) => {
                        if (force === undefined) {
                            if (classSet.has(c)) { classSet.delete(c); return false; }
                            classSet.add(c); return true;
                        } else if (force) {
                            classSet.add(c); return true;
                        } else {
                            classSet.delete(c); return false;
                        }
                    },
                    contains: (c) => classSet.has(c)
                },
                style: {},
                textContent: "",
                value: "",
                innerHTML: "",
                dataset: {},
                appendChild: () => {},
                removeChild: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                setAttribute: (k, v) => { attrMap[k] = String(v); },
                getAttribute: (k) => attrMap[k] || null,
                removeAttribute: (k) => { delete attrMap[k]; },
                focus: () => {},
                getContext: (type) => (type === "2d" ? mockCanvasContext : null),
                closest: () => null,
                querySelector: () => null,
                querySelectorAll: () => []
            };
        }
        return elementsMap[id];
    }

    const documentMock = {
        getElementById: (id) => getOrCreateElement(id),
        querySelector: (sel) => {
            if (sel.startsWith("#")) return getOrCreateElement(sel.slice(1));
            return getOrCreateElement("mockElem");
        },
        querySelectorAll: () => [],
        createElement: (tag) => getOrCreateElement(`mock_${tag}_${Math.random().toString(36).substr(2, 5)}`, tag),
        body: getOrCreateElement("body", "body"),
        addEventListener: () => {},
        removeEventListener: () => {},
        readyState: "complete"
    };

    const RealDate = Date;
    function MockDate(...args) {
        if (args.length === 0) {
            const d = new RealDate(2026, 9, 7, mockHour, 30, 0);
            d.getHours = () => mockHour;
            return d;
        }
        return new RealDate(...args);
    }
    MockDate.now = () => new RealDate(2026, 9, 7, mockHour, 30, 0).getTime();
    MockDate.UTC = RealDate.UTC;
    MockDate.parse = RealDate.parse;

    const sandbox = {
        console,
        document: documentMock,
        window: {
            innerWidth: 1024,
            innerHeight: 768,
            scrollTo: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            matchMedia: (query) => ({
                matches: query.includes("prefers-reduced-motion") && reducedMotion,
                media: query,
                addListener: () => {},
                removeListener: () => {}
            }),
            requestAnimationFrame: (cb) => setTimeout(cb, 16),
            cancelAnimationFrame: (id) => clearTimeout(id)
        },
        localStorage: {
            getItem: (k) => (storage[k] !== undefined ? storage[k] : null),
            setItem: (k, v) => { storage[k] = String(v); },
            removeItem: (k) => { delete storage[k]; },
            clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
        },
        Date: MockDate,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
        cancelAnimationFrame: (id) => clearTimeout(id),
        URL: {
            createObjectURL: () => "blob:mock",
            revokeObjectURL: () => {}
        }
    };

    sandbox.window.document = documentMock;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.Date = sandbox.Date;

    vm.createContext(sandbox);

    // Run progress.js then script.js
    vm.runInContext(progressJs, sandbox);
    vm.runInContext(scriptJs, sandbox);

    sandbox.state = sandbox.window.state;

    return { 
        sandbox, 
        elementsMap, 
        storage, 
        getOrCreateElement,
        setHour: (h) => { mockHour = h; }, 
        setReducedMotion: (rm) => { reducedMotion = rm; } 
    };
}

console.log("Section 1: HTML & CSS Structure Verification for Engagement Layer");

assert(indexHtml.includes('id="onboardingModal"'), "index.html contains #onboardingModal overlay");
assert(indexHtml.includes('id="onboardingStep1"'), "index.html contains #onboardingStep1 (First Name)");
assert(indexHtml.includes('id="onboardingStep2"'), "index.html contains #onboardingStep2 (Training Goal)");
assert(indexHtml.includes('id="onboardingStep3"'), "index.html contains #onboardingStep3 (Launch Daily Drill)");
assert(indexHtml.includes('id="goalCardDaily"'), "index.html contains daily goal choice card");
assert(indexHtml.includes('id="goalCardWeekly"'), "index.html contains 3/week goal choice card");
assert(indexHtml.includes('id="celebrationCanvas"'), "index.html contains #celebrationCanvas overlay");
assert(indexHtml.includes('id="homeStreakFlame"'), "index.html contains #homeStreakFlame inside streak tile");
assert(indexHtml.includes('id="homeWeeklyTrackerCard"'), "index.html contains #homeWeeklyTrackerCard");
assert(indexHtml.includes('id="homeWeeklyRingFill"'), "index.html contains SVG weekly circular progress ring");
assert(indexHtml.includes('id="homeNextBadgeCard"'), "index.html contains Next Badge hint card");

assert(styleCss.includes(".onboarding-modal-card"), "CSS contains onboarding modal card styling");
assert(styleCss.includes(".onboarding-goal-card.selected"), "CSS contains goal selection highlight styling");
assert(styleCss.includes(".celebration-canvas"), "CSS contains celebration canvas overlay rules");
assert(styleCss.includes(".streak-at-risk"), "CSS contains streak-at-risk visual pulse styling");
assert(styleCss.includes(".weekly-progress-ring"), "CSS contains circular SVG progress ring styling");
assert(styleCss.includes("@media (prefers-reduced-motion: reduce)"), "CSS respects prefers-reduced-motion for animations and flame pulse");

console.log("\nSection 2: 3-Screen Onboarding Flow & First-Run Logic");

{
    const env = createMockEnvironment({ storage: {} });
    const { sandbox, elementsMap, storage } = env;

    // Fresh user check
    assert(sandbox.window.isOnboardingCompleted() === false, "Fresh user reports isOnboardingCompleted() as false");

    // Open onboarding
    sandbox.window.showOnboardingModal();
    const modal = elementsMap["onboardingModal"];
    assert(!modal.classList.contains("hidden"), "showOnboardingModal displays modal");

    // Step 1: Name entry (test privacy / first name extraction)
    const nameInput = elementsMap["onboardingFirstNameInput"];
    nameInput.value = "Priya Sharma";
    sandbox.window.goToOnboardingStep(2);

    assert(sandbox.window.state.prepProfile.name === "Priya", "Step 1 extracts strictly first name 'Priya' (privacy protection)");
    assert(sandbox.window.state.responderProfile.name === "Priya", "Step 1 syncs first name with responderProfile");

    // Step 2: Goal selection
    sandbox.window.selectTrainingGoal("weekly_3");
    assert(sandbox.window.state.trainingGoal === "weekly_3", "Goal selection updates state.trainingGoal to 'weekly_3'");
    assert(storage["readyverse_training_goal"] === "weekly_3", "Goal selection persists to localStorage");

    sandbox.window.selectTrainingGoal("daily");
    assert(sandbox.window.state.trainingGoal === "daily", "Goal selection updates state.trainingGoal to 'daily'");
    assert(storage["readyverse_training_goal"] === "daily", "Goal selection persists 'daily' to localStorage");

    // Step 3: Complete and launch daily drill
    let dailyDrillLaunched = false;
    sandbox.window.startDailyDrill = () => { dailyDrillLaunched = true; };

    sandbox.window.completeOnboardingAndStartDrill();
    assert(sandbox.window.state.onboardingCompleted === true, "completeOnboardingAndStartDrill marks state.onboardingCompleted as true");
    assert(storage["readyverse_onboarding_completed"] === "true", "completeOnboardingAndStartDrill persists to localStorage");
    assert(sandbox.window.isOnboardingCompleted() === true, "isOnboardingCompleted() now returns true");
    assert(modal.classList.contains("hidden"), "Onboarding modal is closed");
}

console.log("\nSection 3: Celebration Moments (Level-up, Badge Unlock, Perfect Drill)");

{
    const env = createMockEnvironment();
    const { sandbox, getOrCreateElement } = env;

    const toastMsgEl = getOrCreateElement("toastMessage");

    // 1. Level-up celebration
    sandbox.window.triggerCelebration("level_up", { level: 3, title: "Prepared" });
    assert(toastMsgEl.textContent.includes("Level 3 · Prepared"), "Level-up celebration displays kind encouraging level-up message");

    // 2. Badge unlock celebration
    sandbox.window.triggerCelebration("badge_unlock", { badgeName: "Flood Survivor" });
    assert(toastMsgEl.textContent.includes("Flood Survivor"), "Badge unlock celebration displays badge name and kind message");

    // 3. Perfect drill celebration
    sandbox.window.triggerCelebration("perfect_drill", { drillName: "Flash Flood" });
    assert(toastMsgEl.textContent.includes("Flash Flood") && toastMsgEl.textContent.includes("Perfect 100%"), "Perfect drill celebration displays kind message for flawless run");

    // 4. prefers-reduced-motion check
    env.setReducedMotion(true);
    let confettiLaunched = false;
    sandbox.window.launchCanvasConfetti = () => { confettiLaunched = true; };
    sandbox.window.triggerCelebration("perfect_drill", { drillName: "Hostel Fire" });
    assert(confettiLaunched === false, "Canvas confetti particle loop is skipped when prefers-reduced-motion is true");
}

console.log("\nSection 4: Visible Streak Flame & Evening 'Streak at Risk' Alert");

{
    // Afternoon (14:00) with active streak: no risk
    const envDay = createMockEnvironment({ hour: 14 });
    envDay.sandbox.window.state.dailyStreak = 4;
    envDay.sandbox.window.state.lastActivityDate = "2026-10-06"; // yesterday
    envDay.sandbox.window.state.lastDailyDrillDate = "2026-10-06"; // not played today
    envDay.sandbox.window.updateDashboardStats();

    const streakTileDay = envDay.getOrCreateElement("homeStreakTile");
    const streakSubDay = envDay.getOrCreateElement("homeStreakSub");
    assert(!streakTileDay.classList.contains("streak-at-risk"), "Afternoon drill does not mark streak as at-risk");
    assert(streakSubDay.textContent.includes("Play today's drill to grow your streak"), "Shows friendly afternoon reminder");

    // Evening (19:00 / 7 PM) without playing today: STREAK AT RISK
    const envNight = createMockEnvironment({ hour: 19 });
    envNight.sandbox.window.state.dailyStreak = 5;
    envNight.sandbox.window.state.lastActivityDate = "2026-10-06";
    envNight.sandbox.window.state.lastDailyDrillDate = "2026-10-06"; // not played today
    envNight.sandbox.window.updateDashboardStats();

    const streakTileNight = envNight.getOrCreateElement("homeStreakTile");
    const streakSubNight = envNight.getOrCreateElement("homeStreakSub");
    assert(streakTileNight.classList.contains("streak-at-risk"), "Evening (19:00) with unplayed drill triggers .streak-at-risk class");
    assert(streakSubNight.textContent.includes("⚠️ Streak at risk! Play before midnight to save your 5-day streak"), "Shows specific evening streak-at-risk countdown warning");

    // Evening (20:00) with drill ALREADY PLAYED today: STREAK PROTECTED
    const todayStr = "2026-10-07";
    envNight.sandbox.window.state.lastDailyDrillDate = todayStr;
    envNight.sandbox.window.state.lastActivityDate = todayStr;
    envNight.sandbox.window.updateDashboardStats();
    assert(!streakTileNight.classList.contains("streak-at-risk"), "Completed daily drill removes streak-at-risk class");
    assert(streakTileNight.classList.contains("streak-active"), "Completed daily drill activates .streak-active status");
    assert(streakSubNight.textContent.includes("Streak protected for today"), "Shows reassuring protection message");
}

console.log("\nSection 5: Weekly Progress Ring & Next Badge Distance Hint");

{
    const env = createMockEnvironment();
    const { sandbox, getOrCreateElement } = env;

    sandbox.window.state.trainingGoal = "weekly_3";
    sandbox.window.state.completedMissions = 2;
    sandbox.window.state.totalXP = 250; // Level 2, 50 XP into level (150 XP to Level 3)
    sandbox.window.updateDashboardStats();

    const ringFill = getOrCreateElement("homeWeeklyRingFill");
    const doneEl = getOrCreateElement("homeWeeklyDrillsDone");
    const goalEl = getOrCreateElement("homeWeeklyDrillsGoal");
    const goalPill = getOrCreateElement("homeWeeklyGoalPill");
    const nextBadgeTitle = getOrCreateElement("homeNextBadgeTitle");
    const nextBadgeDist = getOrCreateElement("homeNextBadgeDistance");

    assert(doneEl.textContent === "2", "Weekly tracker displays 2 drills done");
    assert(goalEl.textContent === "/3", "Weekly tracker displays goal target /3");
    assert(goalPill.textContent === "3 DRILLS / WK", "Weekly goal pill reflects weekly_3 mode");
    assert(ringFill.style.strokeDashoffset !== undefined, "SVG progress ring computes dynamic strokeDashoffset");

    assert(nextBadgeTitle.textContent.includes("Level 3"), "Next badge card targets next level (Level 3)");
    assert(nextBadgeDist.textContent === "150 XP away", "Next badge card calculates accurate remaining XP (150 XP away)");
}

console.log("\nSection 6: Friendly Microcopy & Graceful Fallbacks");

{
    const env = createMockEnvironment();
    const { sandbox, getOrCreateElement } = env;

    // 1. Personal activity ledger empty state
    sandbox.window.state.performanceHistory = [];
    sandbox.window.state.completedMissionIds = new Set();
    sandbox.window.state.completedPrepItemIds = new Set();
    sandbox.window.state.unlockedAchievements = new Set();
    sandbox.window.state.campusStudio = {};
    sandbox.window.renderPersonalActivityLedger();

    const ledger = getOrCreateElement("passportActivityLedger");
    assert(ledger.innerHTML.includes("No drills played yet! Complete your first 60-second crisis drill"), "Activity ledger provides friendly, jargon-free student empty state");

    // 2. AI offline state microcopy
    assert(aiUiJs.includes("Offline Mode: AI chat is currently resting. Your crisis drills, progress tracking, and emergency guides are all working normally!"), "AI offline state provides encouraging, jargon-free microcopy");
}

console.log("\n=======================================================");
console.log(`🎉 ENGAGEMENT LAYER TEST SUMMARY: ${passedTests}/${totalTests} PASSED`);
console.log("=======================================================\n");

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
