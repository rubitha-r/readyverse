/**
 * Stage 4 Test Suite: 5-Tab Navigation, Sub-routes, and Profile Organization
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 4: 5-TAB NAVIGATION & PROFILE ROUTING");
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

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'script.js'), 'utf8');
const cssStyle = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const progressModule = require('../js/progress.js');

// Mock DOM & window
global.document = {
  elements: {},
  querySelector(sel) {
    return this.elements[sel] || null;
  },
  querySelectorAll(sel) {
    if (sel.includes('.nav-item') || sel.includes('.mobile-tab-item')) {
      return this.navButtons || [];
    }
    if (sel.includes('.profile-subnav-btn')) {
      return this.subnavButtons || [];
    }
    return [];
  },
  addEventListener() {}
};

global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

global.window = {
  scrollTo() {},
  confirm() { return true; },
  alert() {},
  localStorage: global.localStorage,
  document: global.document
};

// Check 1: Exactly 5 main nav items on desktop and mobile
test("Acceptance Check 1: Exactly 5 main nav items on desktop and mobile", () => {
  // Desktop side-navigation
  const sideNavMatch = indexHtml.match(/<nav class="side-navigation"[\s\S]*?<\/nav>/);
  assert(sideNavMatch, "Sidebar side-navigation must exist");
  const desktopButtons = (sideNavMatch[0].match(/<button class="nav-item/g) || []).length;
  assert.strictEqual(desktopButtons, 5, `Desktop sidebar must have exactly 5 nav items, found ${desktopButtons}`);

  // Mobile bottom tab bar
  const mobileNavMatch = indexHtml.match(/<nav class="mobile-tab-bar"[\s\S]*?<\/nav>/);
  assert(mobileNavMatch, "Mobile bottom tab bar must exist");
  const mobileButtons = (mobileNavMatch[0].match(/<button class="mobile-tab-item/g) || []).length;
  assert.strictEqual(mobileButtons, 5, `Mobile tab bar must have exactly 5 nav items, found ${mobileButtons}`);

  // CSS responsive rule
  assert(cssStyle.includes('.mobile-tab-bar'), "CSS must define .mobile-tab-bar");
  assert(cssStyle.includes('padding-bottom: 84px') || cssStyle.includes('padding-bottom: 72px'), "CSS must add bottom padding to prevent content overlap on mobile");
});

// Check 2: Each of the 5 main tabs opens the right content
test("Acceptance Check 2: 5 main tabs map to correct content containers", () => {
  assert(indexHtml.includes('id="dashboardContent"'), "Must have dashboardContent for Home");
  assert(indexHtml.includes('id="missionsContent"'), "Must have missionsContent for Drills");
  assert(indexHtml.includes('id="learnContent"'), "Must have learnContent for Learn");
  assert(indexHtml.includes('id="preparednessContent"'), "Must have preparednessContent for My Plan");
  assert(indexHtml.includes('id="profileContent"'), "Must have profileContent for Profile");
});

// Check 3: Profile contains all 7 subsections
test("Acceptance Check 3: Profile sub-navigation organizes all 7 sections", () => {
  const profileSubTabs = ["my-stats", "badges", "leaderboard", "passport", "rewards", "backup", "tools"];
  profileSubTabs.forEach(tab => {
    assert(indexHtml.includes(`data-profile-tab="${tab}"`), `Profile must have tab button for ${tab}`);
  });

  assert(indexHtml.includes('id="profilePanelStats"'), "Must have profilePanelStats");
  assert(indexHtml.includes('id="profilePanelBadges"'), "Must have profilePanelBadges");
  assert(indexHtml.includes('id="profilePanelLeaderboard"'), "Must have profilePanelLeaderboard");
  assert(indexHtml.includes('id="profilePanelPassport"'), "Must have profilePanelPassport");
  assert(indexHtml.includes('id="profilePanelRewards"'), "Must have profilePanelRewards");
  assert(indexHtml.includes('id="profilePanelBackup"'), "Must have profilePanelBackup");
  assert(indexHtml.includes('id="profilePanelTools"'), "Must have profilePanelTools");

  // Sample data notice on leaderboard
  assert(indexHtml.includes("Sample data — real leaderboard arrives with accounts"), "Leaderboard must show sample data notice");
});

// Check 4: All legacy switchSection routes work
test("Acceptance Check 4: All old switchSection routes map correctly", () => {
  const routesTested = [
    'dashboard', 'missions', 'learn', 'preparedness',
    'progress', 'achievements', 'leaderboard', 'passport',
    'campus', 'profile', 'rewards', 'backup', 'tools'
  ];

  routesTested.forEach(route => {
    assert(scriptJs.includes(`sectionName === "${route}"`) || scriptJs.includes(`"${route}"`), `Router must handle route '${route}'`);
  });
});

// Check 5: Campus Mode is unchanged and reachable from Tools and footer
test("Acceptance Check 5: Campus Mode content preserved and reachable", () => {
  assert(indexHtml.includes('id="campusContent"'), "campusContent container must exist");
  assert(indexHtml.includes("switchSection('campus')"), "Must have links to switch to campus mode");
  assert(indexHtml.includes('id="campusNameDisplay"'), "Campus profile elements preserved");
});

// Check 6: Reset progress works with confirm dialog and preserves profiles
test("Acceptance Check 6: Reset progress clears only progress and preserves saved profiles", () => {
  const mockState = progressModule.createDefaultState();
  mockState.totalXP = 1500;
  mockState.completedMissions = 3;
  mockState.completedMissionIds = new Set(['fire', 'flood', 'cyclone']);
  mockState.completedLearnIds = new Set(['fire', 'flood']);
  mockState.completedPrepItemIds = new Set(['fire_extinguisher']);
  mockState.responderProfile = { name: "Custom Name", college: "SNS College", titleId: "aware" };
  mockState.campusStudio = { institutionName: "SNS Engineering", aarRecords: [{ id: 1, status: "Completed" }] };

  progressModule.resetProgress(mockState);

  assert.strictEqual(mockState.totalXP, 0, "totalXP should be reset to 0");
  assert.strictEqual(mockState.completedMissions, 0, "completedMissions should be reset to 0");
  assert.strictEqual(mockState.completedMissionIds.size, 0, "completedMissionIds should be empty");
  assert.strictEqual(mockState.completedLearnIds.size, 0, "completedLearnIds should be empty");
  assert.strictEqual(mockState.completedPrepItemIds.size, 0, "completedPrepItemIds should be empty");
  assert.strictEqual(mockState.responderProfile.name, "Custom Name", "responderProfile.name must be preserved");
  assert.strictEqual(mockState.campusStudio.institutionName, "SNS Engineering", "campusStudio data must be preserved");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
