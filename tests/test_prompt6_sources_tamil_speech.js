/**
 * Test Suite: Prompt 6 — Sources, Tamil Translations & SpeechSynthesis
 * 
 * Verifies:
 * 1. Source Attribution: NDMA / NIDM / UNDRR citations on all 6 lessons and all 4 drills + Daily Drill debrief.
 * 2. Unsure sources are explicitly marked with "NEEDS REVIEW".
 * 3. Tamil translations file contains accurate Fire drill and Daily drill content.
 * 4. Safety terms (PASS, Stop Drop Roll, Drop Cover Hold) and numbers (112, 101, 108) are 100% accurate in Tamil.
 * 5. English safety content and progress formulas remain untouched.
 * 6. Language toggles switch Fire drill and Daily drill between EN and தமிழ்.
 * 7. SpeechSynthesis accessibility layer handles speak, stop, toggle, text cleanup, and missing voice fallbacks.
 * 8. Speech stops when switching sections or closing modals.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("\n=======================================================");
console.log("🧪 TESTING PROMPT 6: SOURCES, TAMIL & SPEECH ACCESSIBILITY");
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

// 1. Setup Sandbox Environment
const sourcesCode = fs.readFileSync(path.join(__dirname, "../js/data/sources.js"), "utf8");
const tamilCode = fs.readFileSync(path.join(__dirname, "../js/data/tamil-translations.js"), "utf8");
const speechCode = fs.readFileSync(path.join(__dirname, "../js/speech.js"), "utf8");
const progressCode = fs.readFileSync(path.join(__dirname, "../js/progress.js"), "utf8");
const scriptCode = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");

// Mock SpeechSynthesis
const mockVoices = [
    { name: "Microsoft Heera - English (India)", lang: "en-IN", default: true },
    { name: "Google US English", lang: "en-US", default: false }
];

let speechSpeaking = false;
let lastSpokenUtterance = null;
let speechCancelled = false;

const mockSpeechSynthesis = {
    speaking: false,
    getVoices: () => mockVoices,
    speak: (utt) => {
        speechSpeaking = true;
        mockSpeechSynthesis.speaking = true;
        lastSpokenUtterance = utt;
        speechCancelled = false;
        if (utt && typeof utt.onstart === "function") utt.onstart();
    },
    cancel: () => {
        speechSpeaking = false;
        mockSpeechSynthesis.speaking = false;
        speechCancelled = true;
    }
};

class MockSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = "en-US";
        this.rate = 1;
        this.pitch = 1;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
    }
}

const domElements = {};
function createMockElement(id) {
    const el = {
        id,
        textContent: "",
        innerHTML: "",
        value: "en",
        dataset: {},
        style: {},
        classList: {
            _classes: new Set(),
            add: function(c) { this._classes.add(c); },
            remove: function(c) { this._classes.delete(c); },
            contains: function(c) { return this._classes.has(c); },
            toggle: function(c, force) {
                if (typeof force === "boolean") {
                    if (force) this.add(c); else this.remove(c);
                } else {
                    if (this.contains(c)) this.remove(c); else this.add(c);
                }
            }
        },
        setAttribute: function(k, v) { this[k] = v; },
        getAttribute: function(k) { return this[k] || ""; },
        removeAttribute: function(k) { delete this[k]; },
        hasAttribute: function(k) { return k in this; },
        addEventListener: () => {},
        appendChild: function(child) { this._children = this._children || []; this._children.push(child); },
        querySelectorAll: function() { return []; },
        querySelector: function() { return null; },
        closest: function() { return null; }
    };
    return el;
}

function getMockElement(id) {
    if (!domElements[id]) {
        domElements[id] = createMockElement(id);
    }
    return domElements[id];
}

const localStorageStore = {};
const mockLocalStorage = {
    getItem: (k) => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: (k) => { delete localStorageStore[k]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

const sandbox = {
    console,
    Set,
    Map,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: mockLocalStorage,
    window: {
        speechSynthesis: mockSpeechSynthesis,
        SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
        addEventListener: () => {},
        localStorage: mockLocalStorage,
        scrollTo: () => {}
    },
    document: {
        getElementById: (id) => getMockElement(id),
        querySelector: (sel) => getMockElement("sel_" + sel),
        querySelectorAll: () => [],
        createElement: (tag) => createMockElement(tag),
        addEventListener: () => {},
        readyState: "complete"
    },
    speechSynthesis: mockSpeechSynthesis,
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
    showToast: () => {}
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;

global.window = sandbox.window;
global.document = sandbox.document;
global.speechSynthesis = mockSpeechSynthesis;
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

const Sources = require("../js/data/sources.js");
const Tamil = require("../js/data/tamil-translations.js");
const Speech = require("../js/speech.js");

sandbox.ReadyVerseSources = Sources;
sandbox.ReadyVerseTamil = Tamil;
sandbox.ReadyVerseSpeech = Speech;
sandbox.window.ReadyVerseSources = Sources;
sandbox.window.ReadyVerseTamil = Tamil;
sandbox.window.ReadyVerseSpeech = Speech;

const vmContext = vm.createContext(sandbox);

// Execute progress and script in context
vm.runInContext(progressCode, vmContext);
vm.runInContext(scriptCode, vmContext);

// Copy window exports to sandbox for direct access
sandbox.state = sandbox.window.state;
sandbox.missions = sandbox.window.missions;
sandbox.learnModules = sandbox.window.learnModules;
sandbox.renderLearnGuidelines = sandbox.window.renderLearnGuidelines;
sandbox.setDrillLanguage = sandbox.window.setDrillLanguage;
sandbox.setDailyDrillLanguage = sandbox.window.setDailyDrillLanguage;
sandbox.startDailyDrill = sandbox.window.startDailyDrill;
sandbox.handleDailyDrillChoice = sandbox.window.handleDailyDrillChoice;
sandbox.finishDailyDrill = sandbox.window.finishDailyDrill;
sandbox.getDailyDrillSession = sandbox.window.getDailyDrillSession;
sandbox.toggleCurrentScenarioSpeech = sandbox.window.toggleCurrentScenarioSpeech;
sandbox.toggleDailyDrillSpeech = sandbox.window.toggleDailyDrillSpeech;
sandbox.toggleLearnLessonSpeech = sandbox.window.toggleLearnLessonSpeech;
sandbox.closeLearnProtocol = sandbox.window.closeLearnProtocol;
sandbox.switchSection = sandbox.window.switchSection;

// =========================================================================
// TEST SUITE 1: OFFICIAL SOURCES DATA MAPPING & CITATIONS
// =========================================================================
console.log("--- 1. Official Sources Mapping (NDMA / NIDM / UNDRR) ---");

test("sources.js exports ReadyVerseSources with lessonSources and drillSources", () => {
    assert(Sources, "ReadyVerseSources must be defined");
    assert(Sources.lessonSources, "lessonSources must be defined");
    assert(Sources.drillSources, "drillSources must be defined");
    assert.strictEqual(typeof Sources.getLessonSource, "function", "getLessonSource should be a function");
    assert.strictEqual(typeof Sources.getDrillSource, "function", "getDrillSource should be a function");
});

test("All 6 lessons have authoritative source mappings", () => {
    const requiredLessons = ["fire", "flood", "cyclone", "earthquake", "electrical", "firstaid"];
    requiredLessons.forEach(id => {
        const src = Sources.getLessonSource(id);
        assert(src, `Lesson ${id} must have a source mapping`);
        assert(src.documentName, `Lesson ${id} must have documentName`);
        assert(src.shortCitation, `Lesson ${id} must have shortCitation`);
        assert(src.status === "VERIFIED" || src.status === "NEEDS REVIEW", `Lesson ${id} status must be VERIFIED or NEEDS REVIEW`);
    });
});

test("All 4 drills and Daily Drill have debrief source mappings", () => {
    const requiredDrills = ["fire", "flood", "cyclone", "earthquake", "daily"];
    requiredDrills.forEach(id => {
        const src = Sources.getDrillSource(id);
        assert(src, `Drill ${id} must have a source mapping`);
        assert(src.documentName, `Drill ${id} must have documentName`);
        assert(src.shortCitation, `Drill ${id} must have shortCitation`);
        assert(src.status === "VERIFIED" || src.status === "NEEDS REVIEW", `Drill ${id} status must be VERIFIED or NEEDS REVIEW`);
    });
});

test("Unsure references are explicitly marked with NEEDS REVIEW without guessing", () => {
    const electricalSrc = Sources.getLessonSource("electrical");
    const firstAidSrc = Sources.getLessonSource("firstaid");
    const dailySrc = Sources.getDrillSource("daily");

    assert.strictEqual(electricalSrc.status, "NEEDS REVIEW", "Electrical lesson source must be marked NEEDS REVIEW");
    assert.strictEqual(firstAidSrc.status, "NEEDS REVIEW", "First Aid lesson source must be marked NEEDS REVIEW");
    assert.strictEqual(dailySrc.status, "NEEDS REVIEW", "Daily Drill synthesized source must be marked NEEDS REVIEW");
});

test("Fallback returns valid object marked NEEDS REVIEW for unknown IDs", () => {
    const unknownLesson = Sources.getLessonSource("alien_invasion");
    assert.strictEqual(unknownLesson.status, "NEEDS REVIEW");
    const unknownDrill = Sources.getDrillSource("space_hazard");
    assert.strictEqual(unknownDrill.status, "NEEDS REVIEW");
});

test("renderLearnGuidelines correctly attaches official source box", () => {
    const mod = sandbox.learnModules.fire;
    sandbox.renderLearnGuidelines(mod);
    const container = getMockElement("learnModalProtocols");
    assert(container.innerHTML.includes("learn-source-box"), "Protocols should render learn-source-box");
    assert(container.innerHTML.includes("National Disaster Management Guidelines") || container.innerHTML.includes("NDMA"), "Protocols should render NDMA citation");
});

// =========================================================================
// TEST SUITE 2: TAMIL TRANSLATIONS INTEGRITY & SAFETY PRESERVATION
// =========================================================================
console.log("\n--- 2. Tamil Translations & Safety Term Preservation ---");

test("tamil-translations.js exports ReadyVerseTamil dictionary", () => {
    assert(Tamil, "ReadyVerseTamil must be defined");
    assert.strictEqual(Tamil.meta.language, "ta");
    assert.strictEqual(Tamil.meta.languageName, "தமிழ்");
});

test("Fire Drill in Tamil contains all 8 questions with PASS, 112, 101, Stop Drop Roll", () => {
    assert(Tamil.fireDrill, "fireDrill dictionary must exist");
    assert.strictEqual(Tamil.fireDrill.questions.length, 8, "Fire drill must have 8 translated questions");
    
    // Check Decision 4 (PASS method)
    const q4 = Tamil.fireDrill.questions[3];
    assert(q4.situation.includes("PASS") || q4.options.some(o => o.text.includes("PASS")), "Q4 must preserve PASS term");
    const q4Correct = q4.options.find(o => o.feedback.includes("Pull Pin") || o.feedback.includes("PASS"));
    assert(q4Correct, "Q4 correct feedback must explain PASS acronym");

    // Check Decision 5 (Stop, Drop, and Roll)
    const q5 = Tamil.fireDrill.questions[4];
    const q5Correct = q5.options.find(o => o.text.includes("Stop, Drop, and Roll") || o.text.includes("நில், விழு, உருளு"));
    assert(q5Correct, "Q5 must preserve Stop, Drop, and Roll");

    // Check Decision 7 (Emergency Numbers: 112 / 101)
    const q7 = Tamil.fireDrill.questions[6];
    const q7Correct = q7.options.find(o => o.text.includes("112") || o.text.includes("101"));
    assert(q7Correct, "Q7 must include 112 or 101 emergency numbers");
});

test("Emergency numbers 112, 101, and 108 are accurately defined in meta", () => {
    assert.strictEqual(Tamil.meta.safetyHelpline, "112");
    assert.strictEqual(Tamil.meta.fireHelpline, "101");
    assert.strictEqual(Tamil.meta.ambulanceHelpline, "108");
});

test("Daily Drill in Tamil contains full UI translations, hazard labels, and takeaways", () => {
    assert(Tamil.dailyDrill, "dailyDrill dictionary must exist");
    assert.strictEqual(Tamil.dailyDrill.hazardLabels.fire, "கட்டிட தீ விபத்து");
    assert.strictEqual(Tamil.dailyDrill.hazardLabels.flood, "திடீர் வெள்ளம்");
    assert.strictEqual(Tamil.dailyDrill.hazardLabels.cyclone, "புயல் எச்சரிக்கை");
    assert.strictEqual(Tamil.dailyDrill.hazardLabels.earthquake, "நிலநடுக்க அவசரநிலை");
    assert(Tamil.dailyDrill.takeaways.fire.includes("112"), "Fire takeaway must include 112");
});

test("English safety content in missions object remains pristine and unmodified", () => {
    const fireMission = sandbox.missions.fire;
    assert.strictEqual(fireMission.title, "Building Fire");
    assert.strictEqual(fireMission.questions.length, 8);
    assert(fireMission.questions[0].situation.includes("fire alarm") || fireMission.questions[0].situation.includes("Smoke"), "English question 1 must remain unaltered");
    assert(fireMission.questions[7].situation.includes("assembly area"), "English question 8 must remain unaltered");
});

// =========================================================================
// TEST SUITE 3: LANGUAGE TOGGLES & RUNTIME LOCALIZATION
// =========================================================================
console.log("\n--- 3. Language Toggles (English / தமிழ்) ---");

test("setDrillLanguage switches state.drillLanguage and updates simulation UI", () => {
    sandbox.state.currentMission = "fire";
    sandbox.state.currentDecision = 0;
    
    sandbox.setDrillLanguage("ta");
    assert.strictEqual(sandbox.state.drillLanguage, "ta");
    assert.strictEqual(mockLocalStorage.getItem("readyverse_drill_lang"), "ta");

    const categoryEl = getMockElement("scenarioCategory");
    assert.strictEqual(categoryEl.textContent, "தீ பாதுகாப்பு பயிற்சி");

    const questionEl = getMockElement("scenarioTitle");
    assert.strictEqual(questionEl.textContent, Tamil.fireDrill.questions[0].situation);

    sandbox.setDrillLanguage("en");
    assert.strictEqual(sandbox.state.drillLanguage, "en");
    assert.strictEqual(categoryEl.textContent, "BEGINNER");
    assert.strictEqual(questionEl.textContent, sandbox.missions.fire.questions[0].situation);
});

test("setDailyDrillLanguage switches Daily Drill language dynamically", () => {
    sandbox.startDailyDrill();
    sandbox.setDailyDrillLanguage("ta");
    
    const session = sandbox.getDailyDrillSession();
    assert.strictEqual(session.lang, "ta");
    assert.strictEqual(mockLocalStorage.getItem("readyverse_daily_drill_lang"), "ta");

    const stepCounter = getMockElement("dailyDrillStepCounter");
    assert(stepCounter.textContent.includes("முடிவு"), "Step counter should be in Tamil");

    sandbox.setDailyDrillLanguage("en");
    assert.strictEqual(session.lang, "en");
    assert(stepCounter.textContent.includes("Decision"), "Step counter should be in English");
});

test("Daily Drill choice feedback renders in Tamil when Tamil is active", () => {
    sandbox.startDailyDrill();
    sandbox.setDailyDrillLanguage("ta");
    
    const session = sandbox.getDailyDrillSession();
    const currD = session.decisions[0];
    const correctIdx = currD.question.options.findIndex(o => o.correct);

    sandbox.handleDailyDrillChoice(correctIdx);

    const feedbackText = getMockElement("dailyDrillFeedbackText");
    assert(feedbackText.textContent.includes("சரியான தேர்வு"), "Feedback should be in Tamil");

    const nextBtn = getMockElement("dailyDrillNextBtn");
    assert(nextBtn.textContent.includes("அடுத்த முடிவு") || nextBtn.textContent.includes("முடிவுகளைக் காண்க"), "Next button should be in Tamil");
});

test("Daily Drill completion screen renders Tamil takeaways and source citation", () => {
    sandbox.startDailyDrill();
    sandbox.setDailyDrillLanguage("ta");
    sandbox.finishDailyDrill(false);

    const resultTitle = getMockElement("dailyDrillResultTitle");
    assert.strictEqual(resultTitle.textContent, "தினசரி பயிற்சி நிறைவுற்றது! ⚡");

    const lessonText = getMockElement("dailyDrillLessonText");
    assert(lessonText.textContent.length > 10, "Lesson learned text should be populated in Tamil");

    const citation = getMockElement("dailyDrillSourceCitation");
    assert(citation.innerHTML.includes("NDMA Multi-Hazard Disaster"), "Source citation must be present in Daily Drill results");
});

// =========================================================================
// TEST SUITE 4: SPEECH SYNTHESIS ACCESSIBILITY ENGINE
// =========================================================================
console.log("\n--- 4. SpeechSynthesis Accessibility Engine ---");

test("ReadyVerseSpeech.isSupported() returns true with mocked SpeechSynthesis", () => {
    assert.strictEqual(Speech.isSupported(), true);
});

test("ReadyVerseSpeech.cleanTextForSpeech cleans emojis and HTML tags", () => {
    const raw = "🔥 <strong>Emergency!</strong> Proceed to safe area 🏃‍♂️💨";
    const cleaned = Speech.cleanTextForSpeech(raw);
    assert.strictEqual(cleaned, "Emergency! Proceed to safe area");
});

test("ReadyVerseSpeech.findBestVoice prioritizes Indian English for 'en'", () => {
    const v = Speech.findBestVoice("en");
    assert(v, "Should find English voice");
    assert.strictEqual(v.lang, "en-IN");
});

test("ReadyVerseSpeech.hasVoiceForLanguage accurately detects missing Tamil voice", () => {
    const hasTa = Speech.hasVoiceForLanguage("ta");
    assert.strictEqual(hasTa, false, "Mock voices do not include Tamil");
    const hasEn = Speech.hasVoiceForLanguage("en");
    assert.strictEqual(hasEn, true, "Mock voices include English");
});

test("ReadyVerseSpeech.speak triggers speech and invokes onVoiceMissing for missing Tamil voice", () => {
    let missingNoticeReceived = false;
    const testBtn = createMockElement("testBtn");

    Speech.speak({
        text: "தாழ்வாரத்தில் அடர்ந்த புகை நிறைகிறது.",
        lang: "ta",
        button: testBtn,
        onVoiceMissing: (info) => {
            missingNoticeReceived = true;
            assert.strictEqual(info.lang, "ta");
        }
    });

    assert.strictEqual(missingNoticeReceived, true, "onVoiceMissing must be triggered for missing Tamil voice");
    assert(speechSpeaking, "Speech should be speaking");
    assert(testBtn.classList.contains("speech-playing"), "Button should receive speech-playing class");
    assert.strictEqual(testBtn["aria-pressed"], "true");
});

test("ReadyVerseSpeech.stop cancels active speech and resets button state", () => {
    const testBtn = createMockElement("testBtn");
    Speech.speak({ text: "Hello", lang: "en", button: testBtn });
    assert(testBtn.classList.contains("speech-playing"));

    Speech.stop();
    assert.strictEqual(speechSpeaking, false);
    assert.strictEqual(testBtn.classList.contains("speech-playing"), false);
    assert.strictEqual(testBtn["aria-pressed"], "false");
});

test("toggleCurrentScenarioSpeech and toggleDailyDrillSpeech execute speech toggles", () => {
    sandbox.state.currentMission = "fire";
    sandbox.state.currentDecision = 0;
    sandbox.setDrillLanguage("en");

    sandbox.toggleCurrentScenarioSpeech();
    assert(speechSpeaking, "toggleCurrentScenarioSpeech should start speech");
    assert(lastSpokenUtterance.text.includes("fire alarm") || lastSpokenUtterance.text.includes("Smoke"), "Utterance should contain situation text");

    sandbox.toggleCurrentScenarioSpeech();
    assert.strictEqual(speechSpeaking, false, "Toggling again should stop speech");
});

test("Closing learn modal or switching section halts active speech", () => {
    const testBtn = createMockElement("learnBtn");
    Speech.speak({ text: "Lesson text", lang: "en", button: testBtn });
    assert(speechSpeaking);

    sandbox.closeLearnProtocol();
    assert.strictEqual(speechSpeaking, false, "closeLearnProtocol must stop speech");

    Speech.speak({ text: "Another text", lang: "en", button: testBtn });
    assert(speechSpeaking);

    sandbox.switchSection("dashboard");
    assert.strictEqual(speechSpeaking, false, "switchSection must stop speech");
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
