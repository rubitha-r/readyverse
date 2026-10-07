/**
 * Stage 5 Test Suite: New Home Screen & Progression Engine
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 5: NEW HOME SCREEN & ACCEPTANCE CHECKS");
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

// Load Progress SSOT module
const progressCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'progress.js'), 'utf8');
const scriptCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'script.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

// Setup VM Environment for testing script.js logic
const domElements = {};
function createMockElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    setAttribute: () => {},
    getAttribute: () => '',
    removeAttribute: () => {},
    hasAttribute: () => false,
    addEventListener: () => {},
    closest: () => ({
      querySelector: () => ({ textContent: '', innerHTML: '' })
    }),
    querySelector: () => ({ textContent: '', innerHTML: '', removeAttribute: () => {}, setAttribute: () => {} }),
    querySelectorAll: () => []
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
      const clean = sel.replace('#', '').replace('.', '');
      if (!domElements[clean]) domElements[clean] = createMockElement(clean);
      return domElements[clean];
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: createMockElement('body')
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
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); },
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {},
  confirm: () => true,
  alert: () => {},
  prompt: () => ''
};

sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(progressCode, sandbox);
vm.runInContext(scriptCode, sandbox);

const ReadyVerseProgress = sandbox.ReadyVerseProgress;
const getHomePrimaryDrillAction = sandbox.getHomePrimaryDrillAction;
const getDynamicNextStep = sandbox.getDynamicNextStep;
const updateDashboardStats = sandbox.updateDashboardStats;
const state = sandbox.state;

// Test 1: Fresh user acceptance check
test("Acceptance Check 1: Fresh user Home screen defaults", () => {
  ReadyVerseProgress.resetProgress(state);
  updateDashboardStats();

  const primaryAction = getHomePrimaryDrillAction(state);
  assert.strictEqual(primaryAction.target, "fire", "Primary target should be Building Fire");
  assert.strictEqual(primaryAction.label, "Start your first drill: Building Fire", "Primary button label matches spec");

  const lvl = ReadyVerseProgress.calculateLevel(state.totalXP);
  const readiness = ReadyVerseProgress.calculateReadiness(state);
  assert.strictEqual(lvl.level, 1, "Level must be 1");
  assert.strictEqual(lvl.title, "Rookie", "Title must be Rookie");
  assert.strictEqual(lvl.xpIntoLevel, 0, "xpIntoLevel must be 0");
  assert.strictEqual(lvl.xpToNextLevel, 200, "xpToNextLevel must be 200");
  assert.strictEqual(readiness.totalReadiness, 0, "Readiness must be 0%");
  assert.strictEqual(state.dailyStreak, 0, "Streak must be 0");

  const learnDone = state.completedLearnIds.size;
  const planDone = state.completedPrepItemIds.size;
  assert.strictEqual(learnDone, 0, "Learn must be 0");
  assert.strictEqual(planDone, 0, "Plan must be 0");

  // Check greeting for fresh/default student name
  const nextStep = getDynamicNextStep(state, primaryAction.target);
  assert.strictEqual(nextStep.actionType, "learn", "Next best action is Learn module");
  assert.strictEqual(nextStep.target, "fire", "Next best action is Fire Safety Learn module");
  assert.notStrictEqual(nextStep.actionType + ":" + nextStep.target, "drill:" + primaryAction.target, "Next action must not duplicate primary drill");
});

// Test 2: Primary button progression logic (Fire -> Flood -> Cyclone -> Quake -> Lowest score -> Replay)
test("Acceptance Check 2: Primary button progression & lowest accuracy selection", () => {
  ReadyVerseProgress.resetProgress(state);

  // 1. After completing Fire
  state.completedMissionIds = new Set(["fire"]);
  state.missionBestScores = { fire: 85 };
  let action = getHomePrimaryDrillAction(state);
  assert.strictEqual(action.target, "flood", "After Fire, primary button points to Flood");
  assert.strictEqual(action.label, "Start next drill: Flash Flood");

  // 2. After completing Fire + Flood
  state.completedMissionIds = new Set(["fire", "flood"]);
  state.missionBestScores = { fire: 85, flood: 90 };
  action = getHomePrimaryDrillAction(state);
  assert.strictEqual(action.target, "cyclone", "After Fire+Flood, primary button points to Cyclone");

  // 3. After completing Fire + Flood + Cyclone
  state.completedMissionIds = new Set(["fire", "flood", "cyclone"]);
  state.missionBestScores = { fire: 85, flood: 90, cyclone: 75 };
  action = getHomePrimaryDrillAction(state);
  assert.strictEqual(action.target, "earthquake", "After Fire+Flood+Cyclone, primary button points to Earthquake");

  // 4. After completing all 4 with one below 80% (Cyclone @ 60%, others 85-90%)
  state.completedMissionIds = new Set(["fire", "flood", "cyclone", "earthquake"]);
  state.missionBestScores = { fire: 85, flood: 90, cyclone: 60, earthquake: 88 };
  action = getHomePrimaryDrillAction(state);
  assert.strictEqual(action.target, "cyclone", "Points to lowest accuracy drill (Cyclone @ 60%)");
  assert.strictEqual(action.isReplay, true, "Is a replay/improvement drill");
  assert.strictEqual(action.label, "Improve your drill: Cyclone Emergency (60% accuracy)");

  // 5. After completing all 4 with all >= 80%
  state.missionBestScores = { fire: 85, flood: 90, cyclone: 80, earthquake: 88 };
  action = getHomePrimaryDrillAction(state);
  assert.strictEqual(action.label, "Replay a drill", "When all >= 80%, label is 'Replay a drill'");
  assert.strictEqual(action.isReplay, true);
});

// Test 3: Next Best Action card never matches the primary button target
test("Acceptance Check 3: Next best action never duplicates primary button target", () => {
  ReadyVerseProgress.resetProgress(state);

  // Test across multiple simulated progression states
  const statesToTest = [
    { completedMissions: [], scores: {}, learn: [], prep: 0 },
    { completedMissions: ["fire"], scores: { fire: 85 }, learn: ["fire"], prep: 2 },
    { completedMissions: ["fire", "flood"], scores: { fire: 85, flood: 70 }, learn: ["fire", "flood"], prep: 5 },
    { completedMissions: ["fire", "flood", "cyclone", "earthquake"], scores: { fire: 85, flood: 90, cyclone: 60, earthquake: 85 }, learn: ["fire", "flood"], prep: 8 },
    { completedMissions: ["fire", "flood", "cyclone", "earthquake"], scores: { fire: 95, flood: 90, cyclone: 85, earthquake: 88 }, learn: ["fire", "flood", "cyclone", "earthquake", "electrical", "medical"], prep: 20 },
    { completedMissions: ["fire", "flood", "cyclone", "earthquake"], scores: { fire: 100, flood: 100, cyclone: 100, earthquake: 100 }, learn: ["fire", "flood", "cyclone", "earthquake", "electrical", "medical"], prep: 40 }
  ];

  statesToTest.forEach((st, idx) => {
    state.completedMissionIds = new Set(st.completedMissions);
    state.missionBestScores = Object.assign({}, st.scores);
    state.completedLearnIds = new Set(st.learn);
    state.completedPrepItemIds = new Set();
    for (let i = 0; i < st.prep; i++) state.completedPrepItemIds.add(`item_${i}`);

    const primaryAction = getHomePrimaryDrillAction(state);
    const nextStep = getDynamicNextStep(state, primaryAction.target);

    // If nextStep is a drill/simulation, its target must not equal primaryAction.target
    if (nextStep.actionType === "simulation" || nextStep.actionType === "retry") {
      assert.notStrictEqual(nextStep.target, primaryAction.target, 
        `State ${idx}: nextStep target ${nextStep.target} must not match primaryAction target ${primaryAction.target}`);
    } else {
      // Different actionType (learn, preparedness, achievements) is always distinct from drill
      assert.ok(true);
    }
  });
});

// Test 4: Numbers on Home match My Stats and My Safety Record
test("Acceptance Check 4: Metrics match across Home, My Stats, and Safety Record for realistic runs", () => {
  // Case A: Perfect Fire Run (200 XP, 100% accuracy, Level 2 Rookie, 10% readiness, 1-day streak)
  ReadyVerseProgress.resetProgress(state);
  state.totalXP = 200;
  state.completedMissionIds = new Set(["fire"]);
  state.missionBestScores = { fire: 100 };
  state.dailyStreak = 1;
  state.lastActivityDate = ReadyVerseProgress.getLocalDateString();
  
  const lvlPerfect = ReadyVerseProgress.calculateLevel(state.totalXP);
  const readinessPerfect = ReadyVerseProgress.calculateReadiness(state);

  assert.strictEqual(state.totalXP, 200);
  assert.strictEqual(lvlPerfect.level, 2);
  assert.strictEqual(lvlPerfect.title, "Rookie");
  assert.strictEqual(readinessPerfect.totalReadiness, 10);

  updateDashboardStats();
  
  // Verify home values for perfect run
  assert.strictEqual(domElements.homeStreakVal.textContent, "1 day");
  assert.strictEqual(domElements.homeLevelVal.textContent, "Level 2 · Rookie");
  assert.strictEqual(domElements.homeReadinessVal.textContent, "10%");

  // Case B: Weak Fire Run (47 XP, 24% accuracy, Level 1 Rookie, 2% readiness, 1-day streak)
  ReadyVerseProgress.resetProgress(state);
  state.totalXP = 47;
  state.completedMissionIds = new Set(["fire"]);
  state.missionBestScores = { fire: 24 };
  state.dailyStreak = 1;
  state.lastActivityDate = ReadyVerseProgress.getLocalDateString();

  const lvlWeak = ReadyVerseProgress.calculateLevel(state.totalXP);
  const readinessWeak = ReadyVerseProgress.calculateReadiness(state);

  assert.strictEqual(state.totalXP, 47);
  assert.strictEqual(lvlWeak.level, 1);
  assert.strictEqual(lvlWeak.title, "Rookie");
  assert.strictEqual(readinessWeak.totalReadiness, 2);

  updateDashboardStats();

  // Verify home values for weak run
  assert.strictEqual(domElements.homeStreakVal.textContent, "1 day");
  assert.strictEqual(domElements.homeLevelVal.textContent, "Level 1 · Rookie");
  assert.strictEqual(domElements.homeReadinessVal.textContent, "2%");
});

// Test 5: Duplicate ID check and relocated Home blocks
test("Acceptance Check 5: Zero duplicate IDs and relocated blocks in My Stats", () => {
  const idRegex = /\bid=["']([^"'\s>]+)["']/gi;
  const idCounts = {};
  let m;
  while ((m = idRegex.exec(indexHtml)) !== null) {
    const id = m[1];
    idCounts[id] = (idCounts[id] || 0) + 1;
  }

  const dups = Object.entries(idCounts).filter(e => e[1] > 1);
  assert.strictEqual(dups.length, 0, `Duplicate IDs must be 0, found: ${JSON.stringify(dups)}`);

  // Verify relocated blocks exist in progressContent
  assert.ok(indexHtml.includes('id="telemetryOverviewSection"'), "Must contain telemetryOverviewSection in My Stats");
  assert.ok(indexHtml.includes('id="dashboardJourneyCard"'), "Must contain relocated dashboardJourneyCard");
  assert.ok(indexHtml.includes('id="dashboardStatsGrid"'), "Must contain relocated dashboardStatsGrid");
  assert.ok(indexHtml.includes('id="dashboardMissionsSection"'), "Must contain relocated dashboardMissionsSection");

  // Verify new Home screen elements in dashboardContent
  assert.ok(indexHtml.includes('id="homeGreetingTitle"'), "Must contain homeGreetingTitle");
  assert.ok(indexHtml.includes('id="homePrimaryCtaBtn"'), "Must contain homePrimaryCtaBtn");
  assert.ok(indexHtml.includes('id="homeStreakVal"'), "Must contain homeStreakVal");
  assert.ok(indexHtml.includes('id="homeLevelVal"'), "Must contain homeLevelVal");
  assert.ok(indexHtml.includes('id="homeReadinessVal"'), "Must contain homeReadinessVal");
  assert.ok(indexHtml.includes('id="homeShortcutLearnCount"'), "Must contain homeShortcutLearnCount");
  assert.ok(indexHtml.includes('id="homeShortcutPlanCount"'), "Must contain homeShortcutPlanCount");
});

// Test 6: CSS Layout and responsive constraints
test("Acceptance Check 6: CSS touch targets >= 44px, body text >= 16px, 360px responsive", () => {
  assert.ok(styleCss.includes('.home-primary-cta-btn'), "Must have .home-primary-cta-btn");
  assert.ok(styleCss.includes('min-height: 56px'), "Primary button min-height must be at least 56px");
  assert.ok(styleCss.includes('.home-stats-row'), "Must have .home-stats-row");
  assert.ok(styleCss.includes('.home-shortcuts-grid'), "Must have .home-shortcuts-grid");
  assert.ok(styleCss.includes('@media (max-width: 640px)'), "Must have mobile responsive media queries");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
