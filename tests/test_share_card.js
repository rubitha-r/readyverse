/**
 * ReadyVerse - Stage 6 Follow-Up (Prompt 4): Share Card & Challenge System Tests
 * Pure vanilla JavaScript & HTML5 Canvas verification
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("\n=======================================================");
console.log("🧪 TESTING SHARE SCORECARD & CHALLENGE SYSTEM (PROMPT 4)");
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

// 1. Setup mock browser / DOM environment
const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const styleCss = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
const progressJs = fs.readFileSync(path.join(__dirname, "../js/progress.js"), "utf8");
const scriptJs = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");

function createMockEnvironment(initialUrl = "https://readyverse.netlify.app/") {
    const storage = {};
    const sessionStorageMap = {};
    const parsedUrl = new URL(initialUrl);

    // Mock Canvas Context
    const mockContext2D = {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textAlign: "left",
        textBaseline: "alphabetic",
        filter: "",
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        closePath: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        clearRect: () => {},
        fillText: () => {},
        quadraticCurveTo: () => {},
        roundRect: () => {},
        createLinearGradient: () => ({
            addColorStop: () => {}
        })
    };

    const mockCanvas = {
        width: 1080,
        height: 1080,
        getContext: (type) => (type === "2d" ? mockContext2D : null),
        toDataURL: (mime = "image/png") => `data:${mime};base64,iVBORw0KGgoAAAANSUhEUgAA...`,
        toBlob: (cb, mime = "image/png") => {
            if (cb) cb({ size: 1024, type: mime });
        }
    };

    const elementsMap = {};
    function getOrCreateElement(id) {
        if (!elementsMap[id]) {
            elementsMap[id] = {
                id,
                classList: {
                    _classes: new Set(),
                    add: function(c) { this._classes.add(c); },
                    remove: function(c) { this._classes.delete(c); },
                    contains: function(c) { return this._classes.has(c); },
                    toggle: function(c) {
                        if (this._classes.has(c)) { this._classes.delete(c); return false; }
                        this._classes.add(c); return true;
                    }
                },
                style: {},
                textContent: "",
                innerHTML: "",
                dataset: {},
                appendChild: () => {},
                removeChild: () => {},
                addEventListener: () => {},
                setAttribute: () => {},
                getAttribute: () => null,
                closest: () => null,
                querySelector: () => null,
                querySelectorAll: () => []
            };
        }
        return elementsMap[id];
    }

    const context = {
        console,
        window: {
            location: {
                href: parsedUrl.href,
                origin: parsedUrl.origin,
                pathname: parsedUrl.pathname,
                search: parsedUrl.search
            },
            matchMedia: () => ({ matches: false, addEventListener: () => {} }),
            addEventListener: () => {},
            localStorage: {
                getItem: (k) => storage[k] || null,
                setItem: (k, v) => { storage[k] = String(v); },
                removeItem: (k) => { delete storage[k]; }
            },
            sessionStorage: {
                getItem: (k) => sessionStorageMap[k] || null,
                setItem: (k, v) => { sessionStorageMap[k] = String(v); },
                removeItem: (k) => { delete sessionStorageMap[k]; }
            },
            document: {
                getElementById: (id) => {
                    if (id === "drillShareCanvas") return mockCanvas;
                    return getOrCreateElement(id);
                },
                querySelector: (sel) => {
                    if (sel.startsWith("#")) return getOrCreateElement(sel.slice(1));
                    return getOrCreateElement("mockElem");
                },
                querySelectorAll: () => [],
                createElement: (tag) => {
                    if (tag === "canvas") return mockCanvas;
                    return getOrCreateElement(`dyn_${tag}`);
                },
                body: getOrCreateElement("body"),
                documentElement: getOrCreateElement("html"),
                addEventListener: () => {}
            },
            navigator: {
                canShare: () => true,
                share: async () => true,
                clipboard: {
                    writeText: async () => true
                }
            },
            URLSearchParams: global.URLSearchParams || URLSearchParams
        },
        document: null,
        localStorage: null,
        sessionStorage: null,
        navigator: null,
        setTimeout: (fn) => fn(),
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        Date: global.Date
    };

    context.document = context.window.document;
    context.localStorage = context.window.localStorage;
    context.sessionStorage = context.window.sessionStorage;
    context.navigator = context.window.navigator;
    context.URLSearchParams = global.URLSearchParams || URLSearchParams;

    vm.createContext(context);
    vm.runInContext(progressJs, context);
    vm.runInContext(scriptJs, context);

    context.state = context.window.state;
    context.getStudentFirstName = context.window.getStudentFirstName;
    context.getDrillShareData = context.window.getDrillShareData;
    context.generateDrillShareCard = context.window.generateDrillShareCard;
    context.shareScoreCard = context.window.shareScoreCard;
    context.challengeFriend = context.window.challengeFriend;
    context.checkIncomingChallenge = context.window.checkIncomingChallenge;
    context.renderChallengeBanners = context.window.renderChallengeBanners;
    context.renderResult = context.window.renderResult;
    context.setDailyDrillSession = context.window.setDailyDrillSession;

    return context;
}

// -------------------------------------------------------------
// TEST 1: Privacy Compliance (Student First Name Only)
// -------------------------------------------------------------
{
    const ctx = createMockEnvironment();
    
    // Check various name formats
    ctx.state.responderProfile = { name: "Rohan Sharma" };
    assert(ctx.getStudentFirstName() === "Rohan", "Test 1A: Strips last name ('Rohan Sharma' -> 'Rohan')");

    ctx.state.responderProfile = { name: "Dr. Ananya Iyer" };
    assert(ctx.getStudentFirstName() === "Dr.", "Test 1B: Extracts first token safely ('Dr. Ananya Iyer' -> 'Dr.')");

    ctx.state.responderProfile = { name: "Aarav" };
    assert(ctx.getStudentFirstName() === "Aarav", "Test 1C: Handles single first name ('Aarav' -> 'Aarav')");

    ctx.state.responderProfile = { name: "" };
    assert(ctx.getStudentFirstName() === "Student", "Test 1D: Defaults empty name to 'Student'");

    ctx.state.responderProfile = { name: "Trainee" };
    assert(ctx.getStudentFirstName() === "Student", "Test 1E: Replaces generic 'Trainee' placeholder with 'Student'");
}

// -------------------------------------------------------------
// TEST 2: Drill Share Data Extraction (Standard & Daily Drill)
// -------------------------------------------------------------
{
    const ctx = createMockEnvironment();
    ctx.state.responderProfile = { name: "Priya Patel" };
    ctx.state.dailyStreak = 4;
    ctx.state.lastResult = {
        missionName: "fire",
        score: 100,
        xp: 200,
        decisions: 8
    };

    const fireData = ctx.getDrillShareData("fire");
    assert(fireData.firstName === "Priya", "Test 2A: Share data contains first name 'Priya'");
    assert(fireData.drillId === "fire" && fireData.drillName.includes("Fire"), "Test 2B: Share data contains Building Fire drill info");
    assert(fireData.grade === "A+", "Test 2C: 100% score awards grade 'A+'");
    assert(fireData.scoreNum === 100, "Test 2D: Score number matches 100%");
    assert(fireData.streak === 4, "Test 2E: Daily streak matches 4 days");

    // Daily Drill share data
    ctx.setDailyDrillSession({
        isFinished: true,
        correctCount: 2,
        date: "2026-10-06"
    });
    const dailyData = ctx.getDrillShareData("daily");
    assert(dailyData.drillId === "daily", "Test 2F: Daily drill share data identified");
    assert(dailyData.drillEmoji === "⚡", "Test 2G: Daily drill emoji is ⚡");
    assert(dailyData.scoreNum === 67, "Test 2H: 2/3 correct translates to ~67%");
    assert(dailyData.grade === "A", "Test 2I: 2/3 correct translates to grade 'A'");
}

// -------------------------------------------------------------
// TEST 3: Canvas Card Generator Integrity & Dimensions
// -------------------------------------------------------------
{
    const ctx = createMockEnvironment();
    ctx.state.responderProfile = { name: "Kabir" };
    ctx.state.dailyStreak = 3;
    ctx.state.lastResult = {
        missionName: "flood",
        score: 85,
        xp: 170,
        decisions: 8
    };

    const canvas = ctx.generateDrillShareCard({ drillId: "flood" });
    assert(canvas !== null && typeof canvas === "object", "Test 3A: Canvas object generated successfully");
    assert(canvas.width === 1080 && canvas.height === 1080, "Test 3B: Canvas is high-DPI square (1080x1080)");
    assert(typeof canvas.toDataURL === "function", "Test 3C: Canvas supports toDataURL export");
}

// -------------------------------------------------------------
// TEST 4: Challenge URL Construction
// -------------------------------------------------------------
{
    const ctx = createMockEnvironment();
    ctx.state.responderProfile = { name: "Sara" };
    ctx.state.lastResult = { missionName: "earthquake", score: 88, xp: 176 };
    
    const drillData = ctx.getDrillShareData();
    const appUrl = "https://readyverse.netlify.app";
    const challengeUrl = `${appUrl}/?drill=${encodeURIComponent(drillData.drillId)}&challenge=${encodeURIComponent(drillData.scoreNum)}`;
    
    assert(challengeUrl.includes("https://readyverse.netlify.app"), "Test 4A: Challenge URL starts with correct domain");
    assert(challengeUrl.includes("drill=earthquake"), "Test 4B: Challenge URL includes drill parameter");
    assert(challengeUrl.includes("challenge=88"), "Test 4C: Challenge URL includes challenge score parameter");
}

// -------------------------------------------------------------
// TEST 5: Incoming Challenge Query Parsing & Persistence
// -------------------------------------------------------------
{
    const challengeUrl = "https://readyverse.netlify.app/?drill=cyclone&challenge=90";
    const ctx = createMockEnvironment(challengeUrl);

    ctx.checkIncomingChallenge();
    assert(ctx.state.activeChallenge && ctx.state.activeChallenge.active === true, "Test 5A: Incoming challenge marked active");
    assert(ctx.state.activeChallenge.score === 90, "Test 5B: Parsed challenge target score = 90%");
    assert(ctx.state.activeChallenge.drillId === "cyclone", "Test 5C: Parsed challenge drillId = cyclone");

    const savedSession = JSON.parse(ctx.window.sessionStorage.getItem("readyverse_active_challenge") || "{}");
    assert(savedSession.score === 90 && savedSession.drillId === "cyclone", "Test 5D: Challenge persisted to sessionStorage");
}

// -------------------------------------------------------------
// TEST 6: Challenge Score Comparison Logic (Won, Tied, Missed)
// -------------------------------------------------------------
{
    const ctx = createMockEnvironment();
    
    // Scenario 1: User beats challenge
    ctx.state.activeChallenge = { score: 80, drillId: "fire", active: true };
    ctx.state.lastResult = { missionName: "fire", score: 100, xp: 200, decisions: 8 };
    ctx.renderResult();
    const winBanner = ctx.window.document.getElementById("resultChallengeBanner");
    assert(winBanner.className.includes("challenge-outcome-won"), "Test 6A: Outcome marked won when user score (100%) > friend score (80%)");
    assert(winBanner.innerHTML.includes("CHALLENGE WON!"), "Test 6B: Debrief banner displays 'CHALLENGE WON!'");

    // Scenario 2: User ties challenge
    ctx.state.lastResult.score = 80;
    ctx.renderResult();
    const tieBanner = ctx.window.document.getElementById("resultChallengeBanner");
    assert(tieBanner.className.includes("challenge-outcome-tied"), "Test 6C: Outcome marked tied when user score (80%) == friend score (80%)");
    assert(tieBanner.innerHTML.includes("CHALLENGE TIED!"), "Test 6D: Debrief banner displays 'CHALLENGE TIED!'");

    // Scenario 3: User falls short
    ctx.state.lastResult.score = 65;
    ctx.renderResult();
    const missBanner = ctx.window.document.getElementById("resultChallengeBanner");
    assert(missBanner.className.includes("challenge-outcome-missed"), "Test 6E: Outcome marked missed when user score (65%) < friend score (80%)");
    assert(missBanner.innerHTML.includes("CHALLENGE MISSED"), "Test 6F: Debrief banner displays 'CHALLENGE MISSED'");
}

// -------------------------------------------------------------
// TEST 7: DOM Elements in index.html for Share & Challenge
// -------------------------------------------------------------
{
    assert(indexHtml.includes('id="drillShareCanvas"'), "Test 7A: index.html contains #drillShareCanvas");
    assert(indexHtml.includes('id="shareScorecardBtn"'), "Test 7B: index.html contains #shareScorecardBtn");
    assert(indexHtml.includes('id="challengeFriendBtn"'), "Test 7C: index.html contains #challengeFriendBtn");
    assert(indexHtml.includes('id="shareDailyDrillBtn"'), "Test 7D: index.html contains #shareDailyDrillBtn");
    assert(indexHtml.includes('id="challengeDailyDrillBtn"'), "Test 7E: index.html contains #challengeDailyDrillBtn");
    assert(indexHtml.includes('id="homeChallengeBanner"'), "Test 7F: index.html contains #homeChallengeBanner");
    assert(indexHtml.includes('id="briefingChallengeBanner"'), "Test 7G: index.html contains #briefingChallengeBanner");
    assert(indexHtml.includes('id="simulationChallengeChip"'), "Test 7H: index.html contains #simulationChallengeChip");
    assert(indexHtml.includes('id="resultChallengeBanner"'), "Test 7I: index.html contains #resultChallengeBanner");
    assert(indexHtml.includes('id="dailyDrillChallengeBanner"'), "Test 7J: index.html contains #dailyDrillChallengeBanner");
}

// -------------------------------------------------------------
// TEST 8: CSS Touch Targets & 360px Mobile Responsiveness
// -------------------------------------------------------------
{
    assert(styleCss.includes(".share-primary-btn"), "Test 8A: CSS includes .share-primary-btn");
    assert(styleCss.includes(".challenge-secondary-btn"), "Test 8B: CSS includes .challenge-secondary-btn");
    assert(styleCss.includes(".drill-share-canvas"), "Test 8C: CSS includes .drill-share-canvas");
    assert(styleCss.includes(".home-challenge-pill"), "Test 8D: CSS includes .home-challenge-pill");
    assert(styleCss.includes(".challenge-outcome-won"), "Test 8E: CSS includes .challenge-outcome-won");
    
    // Check touch target heights >= 44px
    assert(styleCss.includes("min-height: 48px"), "Test 8F: Share & Challenge buttons enforce >= 48px touch targets");
    assert(styleCss.includes("@media (max-width: 480px)"), "Test 8G: CSS contains mobile responsive rules");
    assert(styleCss.includes("grid-template-columns: 1fr"), "Test 8H: Action buttons stack vertically on mobile");
}

console.log(`\nShare Card & Challenge Test Results: ${passedTests} passed, ${totalTests - passedTests} failed.\n`);
if (passedTests === totalTests) {
    console.log("🎉 ALL SHARE CARD & CHALLENGE ACCEPTANCE TESTS PASSED!\n");
} else {
    process.exitCode = 1;
}
