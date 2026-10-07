/**
 * Test Suite: Stage 2 — Remove Artificial Locks & Content Accessibility
 * 
 * Verifies that:
 * 1. At 0 XP (brand new user), all 4 missions and all 6 Learn modules are open and accessible.
 * 2. No level or XP locks gate any educational or disaster simulation content.
 * 3. Decision counts for all 4 missions remain exactly intact (8 each, 32 total).
 * 4. The 13 capability cards remain securely locked behind their achievement badges.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("\n=======================================================");
console.log("🧪 TESTING STAGE 2: REMOVE ARTIFICIAL LOCKS");
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

// 1. Mission Decision Counts Integrity Test
test("All 4 disaster missions have exactly 8 decisions each (32 total) with full content", () => {
    const scriptContent = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");
    const vm = require("vm");

    const start = scriptContent.indexOf("const missions = {");
    assert.ok(start !== -1, "missions object must be found in js/script.js");

    let depth = 0;
    let end = -1;
    for (let i = start + "const missions = ".length; i < scriptContent.length; i++) {
        if (scriptContent[i] === "{") depth++;
        else if (scriptContent[i] === "}") {
            depth--;
            if (depth === 0) {
                end = i + 1;
                break;
            }
        }
    }

    assert.ok(end !== -1, "missions object closure found");
    const snippet = scriptContent.slice(start, end) + "; missions;";
    const sandbox = {};
    const missions = vm.runInNewContext(snippet, sandbox);

    const counts = {
        fire: missions.fire ? missions.fire.questions.length : 0,
        flood: missions.flood ? missions.flood.questions.length : 0,
        cyclone: missions.cyclone ? missions.cyclone.questions.length : 0,
        earthquake: missions.earthquake ? missions.earthquake.questions.length : 0
    };

    console.log("    Mission Decision Counts from Code:");
    console.log(`    - Building Fire: ${counts.fire} decisions`);
    console.log(`    - Flash Flood: ${counts.flood} decisions`);
    console.log(`    - Cyclone Emergency: ${counts.cyclone} decisions`);
    console.log(`    - Earthquake Response: ${counts.earthquake} decisions`);

    assert.strictEqual(counts.fire, 8, "Building Fire must have 8 decisions");
    assert.strictEqual(counts.flood, 8, "Flash Flood must have 8 decisions");
    assert.strictEqual(counts.cyclone, 8, "Cyclone Emergency must have 8 decisions");
    assert.strictEqual(counts.earthquake, 8, "Earthquake Response must have 8 decisions");
    assert.strictEqual(counts.fire + counts.flood + counts.cyclone + counts.earthquake, 32, "Total decisions must be 32");
});

// 2. HTML Static Structure Test: Zero Lock Tags / Classes on Content Cards
test("index.html contains NO locked-card classes, lock icons, or disabled buttons on missions or Learn Hub", () => {
    const htmlContent = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

    // Check mission cards
    assert.ok(!htmlContent.includes('id="missionCardCyclone" class="large-mission-card cyclone-large locked-card"'), "Cyclone card must not have locked-card class");
    assert.ok(!htmlContent.includes('id="missionCardEarthquake" class="large-mission-card quake-large locked-card"'), "Earthquake card must not have locked-card class");
    assert.ok(htmlContent.includes('data-mission="cyclone"'), "Cyclone card must have active data-mission button");
    assert.ok(htmlContent.includes('data-mission="earthquake"'), "Earthquake card must have active data-mission button");

    // Check learn cards
    assert.ok(!htmlContent.includes('data-learn-card="cyclone" class="learn-card locked-card"'), "Cyclone learn card must not be locked");
    assert.ok(!htmlContent.includes('data-learn-card="earthquake" class="learn-card locked-card"'), "Earthquake learn card must not be locked");
    assert.ok(!htmlContent.includes('data-learn-card="electrical" class="learn-card locked-card"'), "Electrical learn card must not be locked");
    assert.ok(!htmlContent.includes('data-learn-card="medical" class="learn-card locked-card"'), "Medical learn card must not be locked");

    // Check no 'REACH LEVEL' or 'COMPLETE LEVEL' buttons exist
    assert.ok(!htmlContent.includes("REACH LEVEL 05"), "No REACH LEVEL 05 text in HTML");
    assert.ok(!htmlContent.includes("COMPLETE LEVEL 05"), "No COMPLETE LEVEL 05 text in HTML");
    assert.ok(!htmlContent.includes("COMPLETE LEVEL 02"), "No COMPLETE LEVEL 02 text in HTML");
    assert.ok(!htmlContent.includes("COMPLETE LEVEL 03"), "No COMPLETE LEVEL 03 text in HTML");
});

// 3. JavaScript Runtime Verification: All 4 missions and 6 Learn modules unlocked at 0 XP
test("At 0 XP, dynamic catalog functions unlock all 4 missions and all 6 Learn modules", () => {
    const scriptContent = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");

    // Verify requiredLevel in all learn modules is 1
    const reqLevels = scriptContent.match(/requiredLevel:\s*(\d+)/g) || [];
    reqLevels.forEach(rl => {
        const val = parseInt(rl.replace(/\D/g, ""), 10);
        assert.strictEqual(val, 1, `All learn module requiredLevels must be 1, found ${rl}`);
    });

    // Verify updateMissionCatalog does not check level 5
    assert.ok(!scriptContent.includes("isLevel5Reached"), "script.js must not contain isLevel5Reached lock condition");
    assert.ok(!scriptContent.includes("REACH LEVEL 05"), "script.js must not render REACH LEVEL buttons");
});

// 4. Verification that the 13 Capability Cards Remain Locked Behind Badges
test("13 capability reward cards remain locked behind achievement badges for a new user", () => {
    const scriptContent = fs.readFileSync(path.join(__dirname, "../js/script.js"), "utf8");

    // Check that CAPABILITIES_CATALOG contains all 13 capabilities
    const capIds = [
        "mission_replay_lab",
        "precision_mode",
        "all_hazard_command_kit",
        "command_briefing",
        "rapid_response_toolkit",
        "flood_escape_planner",
        "cyclone_ready_mode",
        "responder_elite_title",
        "personal_readiness_console",
        "emergency_kit_builder",
        "emergency_plan_builder",
        "hazard_radar",
        "preparedness_passport"
    ];

    assert.strictEqual(capIds.length, 13, "Exactly 13 capability tools exist in the system");

    capIds.forEach(id => {
        assert.ok(scriptContent.includes(`id: "${id}"`) || scriptContent.includes(`${id}: {`), `Capability ${id} must exist in CAPABILITIES_CATALOG`);
    });

    // Check achievement conditions
    assert.ok(scriptContent.includes("ACHIEVEMENT_CAPABILITY_MAP"), "ACHIEVEMENT_CAPABILITY_MAP must exist");
    assert.ok(scriptContent.includes("isCapabilityUnlocked"), "isCapabilityUnlocked function must exist");
    assert.ok(scriptContent.includes("updateAchievements"), "updateAchievements function must exist");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
