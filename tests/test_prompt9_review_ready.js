/**
 * ReadyVerse - Test Suite for Prompt 9: Review-Ready Public Build
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=======================================================');
console.log('🧪 TESTING PROMPT 9: REVIEW-READY PUBLIC BUILD & AUDIT');
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
// 1. robots.txt & Public Crawler Verification
// -------------------------------------------------------------
console.log('--- 1. robots.txt & Crawler Accessibility ---');

const robotsPath = path.join(__dirname, '../robots.txt');

runTest('robots.txt exists and allows all crawlers', () => {
    assert.ok(fs.existsSync(robotsPath), 'robots.txt must exist');
    const content = fs.readFileSync(robotsPath, 'utf8');
    assert.ok(content.includes('User-agent: *'), 'Must specify User-agent: *');
    assert.ok(content.includes('Allow: /'), 'Must specify Allow: /');
});

// -------------------------------------------------------------
// 2. Static /review.html Page Integrity (Zero JS Required)
// -------------------------------------------------------------
console.log('\n--- 2. Static /review.html Page Content ---');

const reviewPath = path.join(__dirname, '../review.html');
const reviewHtml = fs.readFileSync(reviewPath, 'utf8');

runTest('review.html exists and contains app metadata', () => {
    assert.ok(fs.existsSync(reviewPath), 'review.html must exist');
    assert.ok(reviewHtml.includes('ReadyVerse'), 'Must contain app name ReadyVerse');
    assert.ok(reviewHtml.includes('v1.0.0') || reviewHtml.includes('Version'), 'Must contain version');
    assert.ok(reviewHtml.includes('2026-10-07') || reviewHtml.includes('Build Date'), 'Must contain build date');
});

runTest('review.html contains feature table marked Built / Beta / Planned', () => {
    assert.ok(reviewHtml.includes('Built'), 'Must include Built features');
    assert.ok(reviewHtml.includes('Beta'), 'Must include Beta features');
    assert.ok(reviewHtml.includes('Planned'), 'Must include Planned features');
});

runTest('review.html lists all 4 drills with 8 decisions each', () => {
    assert.ok(reviewHtml.includes('Building Fire Drill') && reviewHtml.includes('8 decisions'), 'Building fire drill decisions');
    assert.ok(reviewHtml.includes('Flash Flood Drill') && reviewHtml.includes('8 decisions'), 'Flash flood drill decisions');
    assert.ok(reviewHtml.includes('Cyclone Emergency Drill') && reviewHtml.includes('8 decisions'), 'Cyclone drill decisions');
    assert.ok(reviewHtml.includes('Earthquake Response Drill') && reviewHtml.includes('8 decisions'), 'Earthquake drill decisions');
});

runTest('review.html lists all 6 lessons with authoritative source labels', () => {
    assert.ok(reviewHtml.includes('Fire Safety') && reviewHtml.includes('NDMA'), 'Fire safety citation');
    assert.ok(reviewHtml.includes('Flash Flood') && reviewHtml.includes('NDMA'), 'Flash flood citation');
    assert.ok(reviewHtml.includes('Cyclone') && reviewHtml.includes('NDMA'), 'Cyclone citation');
    assert.ok(reviewHtml.includes('Earthquake') && reviewHtml.includes('NDMA'), 'Earthquake citation');
    assert.ok(reviewHtml.includes('Electrical') && (reviewHtml.includes('CEA') || reviewHtml.includes('NIDM')), 'Electrical citation');
    assert.ok(reviewHtml.includes('First Aid') && (reviewHtml.includes('Red Cross') || reviewHtml.includes('NIDM')), 'First aid citation');
});

runTest('review.html contains XP award rules and level-title ranges', () => {
    assert.ok(reviewHtml.includes('FIRE_MISSION_MAX') || reviewHtml.includes('XP_RULES') || reviewHtml.includes('+200 XP'), 'Must show XP rules');
    assert.ok(reviewHtml.includes('Rookie') && reviewHtml.includes('0 – 399 XP'), 'Must show Rookie range');
    assert.ok(reviewHtml.includes('Aware') && reviewHtml.includes('400 – 799 XP'), 'Must show Aware range');
    assert.ok(reviewHtml.includes('Prepared') && reviewHtml.includes('800 – 1,399 XP'), 'Must show Prepared range');
    assert.ok(reviewHtml.includes('Responder') && reviewHtml.includes('1,400 – 1,999 XP'), 'Must show Responder range');
    assert.ok(reviewHtml.includes('Guardian') && reviewHtml.includes('2,000+ XP'), 'Must show Guardian range');
});

runTest('review.html contains readiness formula and all 4 benchmark verification results', () => {
    assert.ok(reviewHtml.includes('0.40 * simulationScore + 0.30 * learningScore + 0.30 * planScore'), 'Must contain formula');
    assert.ok(reviewHtml.includes('Brand New Student') && reviewHtml.includes('0%'), 'Benchmark 1: 0%');
    assert.ok(reviewHtml.includes('1 Perfect Fire Drill') && reviewHtml.includes('10%'), 'Benchmark 2: 10%');
    assert.ok(reviewHtml.includes('1 Weak Fire Drill') && reviewHtml.includes('2%'), 'Benchmark 3: 2%');
    assert.ok(reviewHtml.includes('100% Preparedness Master') && reviewHtml.includes('100%'), 'Benchmark 4: 100%');
});

runTest('review.html lists automated test results and Known Issues', () => {
    assert.ok(reviewHtml.includes('test_prompt8_pwa_offline.js'), 'Must list test suites');
    assert.ok(reviewHtml.includes('PASSED'), 'Must show passed status');
    assert.ok(reviewHtml.includes('Known Limitations') || reviewHtml.includes('Known Issues'), 'Must show Known Issues');
});

// -------------------------------------------------------------
// 3. Mock Screenshot Gallery Verification
// -------------------------------------------------------------
console.log('\n--- 3. Screenshot Gallery Verification (docs/screenshots/) ---');

const screenshotsDir = path.join(__dirname, '../docs/screenshots');

const expectedScreenshots = [
    // 360px Mobile
    '360-landing-light.png', '360-landing-dark.png',
    '360-home-light.png', '360-home-dark.png',
    '360-drill-in-progress-light.png', '360-drill-in-progress-dark.png',
    '360-drill-result-share-light.png', '360-drill-result-share-dark.png',
    '360-learn-light.png', '360-learn-dark.png',
    '360-plan-light.png', '360-plan-dark.png',
    '360-profile-light.png', '360-profile-dark.png',
    // 1280px Desktop
    '1280-landing-light.png', '1280-landing-dark.png',
    '1280-home-light.png', '1280-home-dark.png',
    '1280-drill-in-progress-light.png', '1280-drill-in-progress-dark.png',
    '1280-drill-result-share-light.png', '1280-drill-result-share-dark.png',
    '1280-learn-light.png', '1280-learn-dark.png',
    '1280-plan-light.png', '1280-plan-dark.png',
    '1280-profile-light.png', '1280-profile-dark.png'
];

runTest(`docs/screenshots/ contains all ${expectedScreenshots.length} required PNG images`, () => {
    assert.ok(fs.existsSync(screenshotsDir), 'docs/screenshots directory must exist');
    expectedScreenshots.forEach(file => {
        const filePath = path.join(screenshotsDir, file);
        assert.ok(fs.existsSync(filePath), `Missing screenshot: ${file}`);
        const stat = fs.statSync(filePath);
        assert.ok(stat.size > 1000, `Screenshot ${file} must be a valid non-empty PNG`);
    });
});

// -------------------------------------------------------------
// 4. System Status & Technical Documentation Files
// -------------------------------------------------------------
console.log('\n--- 4. System Status & Technical Documentation ---');

const statusPath = path.join(__dirname, '../docs/STATUS.md');
const contextPath = path.join(__dirname, '../PROJECT_CONTEXT.md');
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

runTest('docs/STATUS.md exists with What Works, What Does Not, and What Is Next', () => {
    assert.ok(fs.existsSync(statusPath), 'docs/STATUS.md must exist');
    const content = fs.readFileSync(statusPath, 'utf8');
    assert.ok(content.includes('What Works'), 'Must detail What Works');
    assert.ok(content.includes('What Does Not Work'), 'Must detail What Does Not Work');
    assert.ok(content.includes('What Is Next'), 'Must detail What Is Next');
});

runTest('PROJECT_CONTEXT.md and CHANGELOG.md are updated', () => {
    assert.ok(fs.existsSync(contextPath), 'PROJECT_CONTEXT.md must exist');
    assert.ok(fs.existsSync(changelogPath), 'CHANGELOG.md must exist');
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    assert.ok(changelog.includes('Stage 9') || changelog.includes('Review-Ready'), 'CHANGELOG must document Stage 9');
});

// -------------------------------------------------------------
// 5. Zero Secret Leakage Audit
// -------------------------------------------------------------
console.log('\n--- 5. Security & Secret Leakage Audit ---');

runTest('Public files contain zero hardcoded API keys or secrets', () => {
    const publicFiles = [
        reviewPath,
        statusPath,
        robotsPath,
        path.join(__dirname, '../manifest.json'),
        path.join(__dirname, '../sw.js'),
        path.join(__dirname, '../js/pwa.js'),
        path.join(__dirname, '../js/script.js'),
        path.join(__dirname, '../js/progress.js'),
        path.join(__dirname, '../js/speech.js'),
        path.join(__dirname, '../js/data/sources.js'),
        path.join(__dirname, '../js/data/tamil-translations.js')
    ];

    const secretPatterns = [
        /AIzaSy[0-9A-Za-z_-]{33}/, // Google Gemini key
        /gsk_[0-9A-Za-z]{32,}/,   // Groq API key
        /sk-[0-9A-Za-z]{32,}/     // OpenAI key
    ];

    publicFiles.forEach(file => {
        if (fs.existsSync(file)) {
            const txt = fs.readFileSync(file, 'utf8');
            secretPatterns.forEach(pat => {
                assert.ok(!pat.test(txt), `Secret key leak detected in ${path.basename(file)}!`);
            });
        }
    });
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
