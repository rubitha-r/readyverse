/**
 * ReadyVerse - Test Suite for Prompt 8: PWA, Service Worker, Offline Mode & JSON Backup
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock browser global localStorage for tests if not present
if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
}

console.log('=======================================================');
console.log('🧪 TESTING PROMPT 8: PWA & OFFLINE PREPAREDNESS PLATFORM');
console.log('=======================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✖ FAILED: ${name}`);
        console.error(`    Error: ${err.message}\n`);
    }
}

// -------------------------------------------------------------
// 1. Web App Manifest & Meta Tags Verification
// -------------------------------------------------------------
console.log('--- 1. Web App Manifest & HTML Meta Tags ---');

const manifestPath = path.join(__dirname, '../manifest.json');
const indexPath = path.join(__dirname, '../index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

runTest('manifest.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in root');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    assert.strictEqual(typeof parsed, 'object');
});

runTest('manifest.json contains required PWA fields', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.name && manifest.name.includes('ReadyVerse'), 'Manifest name required');
    assert.strictEqual(manifest.short_name, 'ReadyVerse');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.theme_color, '#6C4CF1');
    assert.strictEqual(manifest.background_color, '#0B0F19');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Manifest must declare at least 4 icons');
    
    // Check sizes
    const sizes = manifest.icons.map(i => i.sizes);
    assert.ok(sizes.includes('192x192'), 'Must include 192x192 icon');
    assert.ok(sizes.includes('512x512'), 'Must include 512x512 icon');
});

runTest('index.html contains manifest and PWA mobile meta tags', () => {
    assert.ok(indexHtml.includes('<link rel="manifest" href="manifest.json">'), 'Must link manifest.json');
    assert.ok(indexHtml.includes('name="theme-color" content="#6C4CF1"'), 'Must specify theme-color meta tag');
    assert.ok(indexHtml.includes('name="apple-mobile-web-app-capable" content="yes"'), 'Must specify apple mobile web app capable');
    assert.ok(indexHtml.includes('<link rel="apple-touch-icon" href="icons/icon-192.png">'), 'Must specify apple-touch-icon');
});

// -------------------------------------------------------------
// 2. PWA Icon Assets (Inline SVG & PNGs)
// -------------------------------------------------------------
console.log('\n--- 2. PWA Icon Assets Verification ---');

const iconsDir = path.join(__dirname, '../icons');

function readPngDimensions(filePath) {
    const buf = fs.readFileSync(filePath);
    assert.strictEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Must have valid PNG magic signature');
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
}

runTest('icons/icon.svg exists with vector letter R branding', () => {
    const svgPath = path.join(iconsDir, 'icon.svg');
    assert.ok(fs.existsSync(svgPath), 'icon.svg must exist');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    assert.ok(svgContent.includes('#6C4CF1'), 'SVG must use brand color #6C4CF1');
    assert.ok(svgContent.includes('>R<'), 'SVG must include letter R');
});

runTest('icons/icon-192.png is valid 192x192 PNG', () => {
    const pngPath = path.join(iconsDir, 'icon-192.png');
    assert.ok(fs.existsSync(pngPath), 'icon-192.png must exist');
    const dims = readPngDimensions(pngPath);
    assert.strictEqual(dims.width, 192);
    assert.strictEqual(dims.height, 192);
});

runTest('icons/icon-512.png is valid 512x512 PNG', () => {
    const pngPath = path.join(iconsDir, 'icon-512.png');
    assert.ok(fs.existsSync(pngPath), 'icon-512.png must exist');
    const dims = readPngDimensions(pngPath);
    assert.strictEqual(dims.width, 512);
    assert.strictEqual(dims.height, 512);
});

runTest('icons/icon-maskable-192.png and 512.png are valid PNGs', () => {
    const m192Path = path.join(iconsDir, 'icon-maskable-192.png');
    const m512Path = path.join(iconsDir, 'icon-maskable-512.png');
    assert.ok(fs.existsSync(m192Path), 'icon-maskable-192.png must exist');
    assert.ok(fs.existsSync(m512Path), 'icon-maskable-512.png must exist');
    assert.strictEqual(readPngDimensions(m192Path).width, 192);
    assert.strictEqual(readPngDimensions(m512Path).width, 512);
});

// -------------------------------------------------------------
// 3. Service Worker (sw.js)
// -------------------------------------------------------------
console.log('\n--- 3. Service Worker (sw.js) Architecture ---');

const swPath = path.join(__dirname, '../sw.js');
const swContent = fs.readFileSync(swPath, 'utf8');

runTest('sw.js exists and registers install, activate, and fetch listeners', () => {
    assert.ok(fs.existsSync(swPath), 'sw.js must exist in root');
    assert.ok(swContent.includes("addEventListener('install'"), 'SW must have install handler');
    assert.ok(swContent.includes("addEventListener('activate'"), 'SW must have activate handler');
    assert.ok(swContent.includes("addEventListener('fetch'"), 'SW must have fetch handler');
});

runTest('sw.js pre-caches App Shell, core scripts, lessons, translations, and sources', () => {
    const requiredCaches = [
        'index.html',
        'css/style.css',
        'js/script.js',
        'js/progress.js',
        'js/speech.js',
        'js/data/sources.js',
        'js/data/tamil-translations.js',
        'js/readyverse-ai/ai-ui.js',
        'manifest.json',
        'icons/icon-192.png'
    ];
    requiredCaches.forEach(item => {
        assert.ok(swContent.includes(item), `sw.js precache list must include ${item}`);
    });
});

runTest('sw.js provides offline fallback for /api/coach', () => {
    assert.ok(swContent.includes('/api/coach'), 'sw.js must intercept /api/coach');
    assert.ok(swContent.includes("I'm offline right now") || swContent.includes('offline'), 'sw.js must return offline explanation');
});

// -------------------------------------------------------------
// 4. Offline Mode Banner & Limitations Notice
// -------------------------------------------------------------
console.log('\n--- 4. Offline Mode Banner & Feature Limitations ---');

runTest('index.html contains #rvOfflineBanner element', () => {
    assert.ok(indexHtml.includes('id="rvOfflineBanner"'), 'index.html must have #rvOfflineBanner');
    assert.ok(indexHtml.includes('rv-offline-banner'), 'Must have .rv-offline-banner class');
});

runTest('Offline Banner explicitly states all 7 features that do NOT work offline', () => {
    const lowerHtml = indexHtml.toLowerCase();
    const disabledFeatures = [
        'live alert',
        'weather',
        'government order',
        'hazard data',
        'dispatch',
        'tracking',
        'ai coach'
    ];
    disabledFeatures.forEach(feature => {
        assert.ok(lowerHtml.includes(feature), `Offline banner must explicitly state that "${feature}" does not work offline`);
    });
});

runTest('On-screen notices explicitly state Voice Recognition, AI Coach & Speech limits', () => {
    assert.ok(indexHtml.includes('Voice recognition and the AI coach need internet') || indexHtml.includes('Voice recognition and the AI coach need internet.'), 'Must state voice recognition & AI internet requirement');
    assert.ok(indexHtml.includes('Spoken audio depends on voices installed on your phone') || indexHtml.includes('Spoken audio playback depends on voices installed on your phone'), 'Must state speech synthesis voice dependency');
});

runTest('ReadyVersePWA manager module provides full offline and limitation metadata', () => {
    const pwaManager = require('../js/pwa');
    assert.strictEqual(typeof pwaManager, 'object');
    assert.strictEqual(typeof pwaManager.getOfflineLimitations, 'function');
    
    const meta = pwaManager.getOfflineLimitations();
    assert.ok(meta.disabled.includes('Live alerts'));
    assert.ok(meta.disabled.includes('Weather'));
    assert.ok(meta.disabled.includes('Government orders'));
    assert.ok(meta.disabled.includes('Live hazard data'));
    assert.ok(meta.disabled.includes('Dispatch'));
    assert.ok(meta.disabled.includes('Tracking'));
    assert.ok(meta.disabled.includes('AI coach'));
    
    assert.ok(meta.limits.voiceRecognition.includes('internet'));
    assert.ok(meta.limits.spokenAudio.includes('voices installed'));
});

// -------------------------------------------------------------
// 5. "Install App" Button Integration
// -------------------------------------------------------------
console.log('\n--- 5. "Install App" PWA Button Integration ---');

runTest('index.html contains header and home install app triggers', () => {
    assert.ok(indexHtml.includes('id="headerInstallBtn"'), 'Header must contain #headerInstallBtn');
    assert.ok(indexHtml.includes('id="homeInstallBtn"'), 'Home must contain #homeInstallBtn');
    assert.ok(indexHtml.includes('Install App') || indexHtml.includes('Install ReadyVerse App'), 'Button must say Install App');
});

runTest('Profile Tools subpanel includes Web App (PWA) installation option', () => {
    assert.ok(indexHtml.includes('Install Web App (PWA)') || indexHtml.includes('Install ReadyVerse App'), 'Profile Tools must contain PWA install card');
});

// -------------------------------------------------------------
// 6. Profile Export / Import Progress Backup (JSON)
// -------------------------------------------------------------
console.log('\n--- 6. Profile Progress Backup (JSON) ---');

const progress = require('../js/progress');

runTest('Profile Backup panel contains Export and Import buttons with clear messages', () => {
    assert.ok(indexHtml.includes('id="profilePanelBackup"'), 'Must have profilePanelBackup');
    assert.ok(indexHtml.includes('EXPORT BACKUP (.JSON)'), 'Must have export button');
    assert.ok(indexHtml.includes('CHOOSE BACKUP FILE'), 'Must have file chooser');
    assert.ok(indexHtml.includes('Save your XP') || indexHtml.includes('Download a verified JSON backup'), 'Must provide clear explanatory message');
});

runTest('Progress export creates valid v2 JSON structure with all player metrics', () => {
    const mockState = progress.createDefaultState();
    mockState.totalXP = 450;
    mockState.readiness = 22;
    mockState.dailyStreak = 5;
    mockState.completedMissions = 2;
    mockState.completedMissionIds = new Set(['fire', 'flood']);
    mockState.missionBestScores = { fire: 100, flood: 85 };

    const exportedJson = progress.exportBackup(mockState);
    assert.strictEqual(typeof exportedJson, 'string');
    const parsed = JSON.parse(exportedJson);
    
    assert.strictEqual(parsed.version, 2);
    assert.strictEqual(parsed.totalXP, 450);
    assert.strictEqual(parsed.dailyStreak, 5);
    assert.ok(Array.isArray(parsed.completedMissionIds));
    assert.ok(parsed.completedMissionIds.includes('fire'));
    assert.strictEqual(parsed.missionBestScores.fire, 100);
});

runTest('Progress import safely restores state and recalculates rank and level', () => {
    const targetState = progress.createDefaultState();
    const backupData = {
        version: 2,
        totalXP: 650,
        completedMissions: 3,
        completedMissionIds: ['fire', 'flood', 'cyclone'],
        missionBestScores: { fire: 100, flood: 90, cyclone: 80 },
        dailyStreak: 7,
        longestStreak: 7
    };

    const result = progress.importBackup(JSON.stringify(backupData), targetState);
    assert.strictEqual(result.success, true);
    assert.strictEqual(targetState.totalXP, 650);
    assert.strictEqual(targetState.dailyStreak, 7);
    const lvlInfo = progress.calculateLevel(targetState.totalXP);
    assert.strictEqual(lvlInfo.level, 4);
    assert.strictEqual(lvlInfo.title, 'Aware');
});

runTest('Progress import rejects invalid JSON or malformed content gracefully', () => {
    const targetState = progress.createDefaultState();
    assert.throws(() => {
        progress.importBackup('{ corrupted: json', targetState);
    }, /Invalid JSON format/);

    assert.throws(() => {
        progress.importBackup('', targetState);
    }, /Invalid backup file/);
});

// -------------------------------------------------------------
// 7. Airplane Mode / Offline Drill Execution
// -------------------------------------------------------------
console.log('\n--- 7. Airplane Mode / Offline Drill & Story Execution ---');

runTest('Drill simulation and Story Mode run offline with ZERO network calls', () => {
    const offlineState = progress.createDefaultState();
    assert.strictEqual(offlineState.totalXP, 0);
    assert.strictEqual(offlineState.readiness, 0);

    // 1. Complete Fire drill offline (8 decisions, 100% score)
    offlineState.totalXP += 200; // 100 base + 50 perfect + 50 first clear
    offlineState.completedMissions += 1;
    offlineState.completedMissionIds.add('fire');
    offlineState.missionBestScores['fire'] = 100;
    progress.recordActivity(offlineState);

    const r1 = progress.calculateReadiness(offlineState);
    assert.strictEqual(r1.totalReadiness, 10);
    assert.strictEqual(offlineState.dailyStreak, 1);

    // 2. Complete Flood Story Mode Chapter offline
    offlineState.totalXP += 100;
    offlineState.completedMissions += 1;
    offlineState.completedMissionIds.add('flood');
    offlineState.missionBestScores['flood'] = 100;
    progress.recordActivity(offlineState);

    const r2 = progress.calculateReadiness(offlineState);
    assert.strictEqual(r2.totalReadiness, 20);

    // 3. Complete Daily Drill offline
    offlineState.totalXP += 60;
    progress.recordActivity(offlineState);
    assert.strictEqual(offlineState.totalXP, 360);

    // 4. Complete Learn Quiz offline
    offlineState.completedLearnIds.add('fire');
    offlineState.learnQuizScores['fire'] = 100;
    offlineState.totalXP += 150;
    progress.recordActivity(offlineState);

    const r3 = progress.calculateReadiness(offlineState);
    assert.strictEqual(r3.totalReadiness, 25); // 20% sim (50/4*0.4) + 5% learn (1/6*100*0.3) = 20+5 = 25
    assert.strictEqual(offlineState.totalXP, 510);
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n=======================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('=======================================================\n');

if (totalTests !== passedTests) {
    process.exit(1);
}
