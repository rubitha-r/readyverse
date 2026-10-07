/**
 * Stage 3 Test Suite: UI Text Renaming (Plain-Language Student Terms)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 3: UI TEXT RENAMING (STUDENT LABELS)");
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

// Test 1: Confirm plain-language terms are present in index.html
test("index.html uses plain-language headings and labels", () => {
  assert(indexHtml.includes("LOADING READYVERSE..."), "Should have student loading text");
  assert(indexHtml.includes("HOME") || indexHtml.includes("Home"), "Should have Home heading");
  assert(indexHtml.includes("READINESS SCORE"), "Should have Readiness Score label");
  assert(indexHtml.includes("DRILL BRIEFING"), "Should have Drill Briefing modal header");
  assert(indexHtml.includes("START DRILL"), "Should have Start Drill button label");
  assert(indexHtml.includes("DRILL DEBRIEF"), "Should have Drill Debrief header");
  assert(indexHtml.includes("MY STATS") || indexHtml.includes("My Stats"), "Should have My Stats label");
  assert(indexHtml.includes("Activity History") || indexHtml.includes("ACTIVITY HISTORY"), "Should have Activity History label");
});

// Test 2: Confirm military/tactical jargon terms have been removed from user-visible UI
test("No tactical/military jargon in user-visible headings or labels", () => {
  const disallowedLabels = [
    "INITIALIZING TRAINING SYSTEM",
    "TACTICAL READINESS",
    "REAL-TIME TACTICAL LEDGER",
    "MISSION BRIEFING",
    "MISSION SUCCESSFUL",
    "OPERATIONAL / REFINED TRAINING NEEDED",
    "TACTICAL MASTERY",
    "TACTICAL PROGRESSION",
    "DAILY STREAK & TELEMETRY"
  ];
  disallowedLabels.forEach(term => {
    assert(!indexHtml.includes(term), `index.html should not contain '${term}'`);
    assert(!scriptJs.includes(`"${term}"`) && !scriptJs.includes(`'${term}'`), `script.js should not contain literal string '${term}'`);
  });
});

// Test 3: Confirm script.js uses friendly debrief and next-step badges
test("script.js uses student-friendly debrief and dynamic next step terms", () => {
  assert(scriptJs.includes('statusText = "DRILL COMPLETED"'), "Should set statusText to DRILL COMPLETED");
  assert(scriptJs.includes('badge: "DRILL PROGRESSION · NEXT SCENARIO"'), "Should have DRILL PROGRESSION badge");
  assert(scriptJs.includes('badge: "SAFETY MASTERY · 100% READY"'), "Should have SAFETY MASTERY badge");
  assert(scriptJs.includes('h3.textContent = "High Readiness"'), "Should display High Readiness");
  assert(scriptJs.includes('h3.textContent = "Moderate Preparedness"'), "Should display Moderate Preparedness");
  assert(scriptJs.includes('showToast("✔ Reflection recorded in your drill debrief.")'), "Should record in drill debrief");
});

// Test 4: Verify code identifiers, element IDs, and routes are strictly preserved
test("Code identifiers, element IDs, data-attributes, and routes are preserved", () => {
  const requiredIds = [
    'briefingModal', 'closeBriefing', 'beginSimulation', 'quitSimulation',
    'scenarioTitle', 'simulationStep',
    'aarGradeBadge', 'aarStatusPill', 'resultHeading', 'resultMessage',
    'simulationPage', 'resultPage', 'readinessScore'
  ];
  requiredIds.forEach(id => {
    assert(indexHtml.includes(`id="${id}"`), `index.html must retain id="${id}"`);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
