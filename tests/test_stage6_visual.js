/**
 * ReadyVerse — Stage 6 Acceptance Tests: Visual and Tone Pass
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(`    ${err.message}`);
    }
}

console.log('=== RUNNING STAGE 6 ACCEPTANCE TESTS ===\n');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const aiCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'readyverse-ai.css'), 'utf8');
const aiUiJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'readyverse-ai', 'ai-ui.js'), 'utf8');
const scriptJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'script.js'), 'utf8');

// CHECK 1: AI coachmark 8-second post-entry delay and landing page exclusion
runTest('Check 1: AI Coachmark is not displayed on landing page and uses 8s post-entry delay', () => {
    assert(!aiUiJs.includes("coachmark.classList.add('visible')\n"), 'Coachmark must not be made visible synchronously on initial load');
    assert(aiUiJs.includes('scheduleCoachmark'), 'ai-ui.js must include scheduleCoachmark method');
    assert(aiUiJs.includes('8000'), 'ai-ui.js must use at least 8000ms delay for coachmark');
    assert(aiUiJs.includes('readyverse:app-entered'), 'ai-ui.js must listen for readyverse:app-entered');
    assert(aiUiJs.includes('readyverse_ai_intro_seen_v1'), 'ai-ui.js must check and persist readyverse_ai_intro_seen_v1');
});

// CHECK 2: Floating "Ask ReadyVerse AI" button on <= 480px
runTest('Check 2: Floating AI button is compact round button on mobile <= 480px above mobile nav', () => {
    assert(aiCss.includes('@media (max-width: 480px)'), 'readyverse-ai.css must have max-width: 480px media query');
    assert(aiCss.includes('rv-ai-trigger-label') && aiCss.includes('display: none !important'), 'Label must be hidden on mobile <= 480px');
    assert(aiCss.includes('border-radius: 50%'), 'Trigger must be round on mobile <= 480px');
    assert(aiCss.includes('bottom: 96px'), 'Trigger must be positioned at bottom: 96px on mobile');
});

// CHECK 3: Landing header on mobile <= 640px
runTest('Check 3: Landing header hides audience badge, system status, and header enter button on <= 640px', () => {
    assert(styleCss.includes('@media (max-width: 640px)'), 'style.css must have max-width: 640px query');
    assert(styleCss.includes('.top-nav .audience-badge'), 'style.css must hide audience badge on mobile header');
    assert(styleCss.includes('.top-nav .system-status'), 'style.css must hide system status on mobile header');
    assert(styleCss.includes('safe-area-inset-top'), 'style.css must support safe-area-inset-top');
    assert(styleCss.includes('.landing-page') && styleCss.includes('padding-bottom: 104px'), 'Landing page must have bottom padding on mobile');
});

// CHECK 4: Color system & button contrast
runTest('Check 4: CSS color variables and high contrast primary buttons', () => {
    assert(styleCss.includes('--primary:') || styleCss.includes('--purple:'), 'Root color system must define brand primaries');
    assert(styleCss.includes('[data-theme="light"]'), 'Light theme styles must be present');
    assert(styleCss.includes('[data-theme="dark"]'), 'Dark theme styles must be present');
    assert(styleCss.includes('.primary-button') && styleCss.includes('color: #ffffff'), 'Primary button must have white text #ffffff for WCAG contrast');
});

// CHECK 5: Unified hazard icons
runTest('Check 5: Hazard icons 🔥 🌊 🌪️ 🌍 are unified across cards and preview strips', () => {
    assert(html.includes('<span class="pill-icon">🔥</span>') && html.includes('Building Fire'), 'Building fire icon is 🔥');
    assert(html.includes('<span class="pill-icon">🌊</span>') && html.includes('Flash Flood'), 'Flash flood icon is 🌊');
    assert(html.includes('<span class="pill-icon">🌪️</span>') && html.includes('Cyclone Emergency'), 'Cyclone icon is 🌪️');
    assert(html.includes('<span class="pill-icon">🌍</span>') && html.includes('Earthquake Response'), 'Earthquake icon is 🌍');
});

// CHECK 6: Copy cleanup (zero "simulation mission", zero "trainee" in visible labels, 08 decisions stat)
runTest('Check 6: Copy cleanup eliminates simulation mission, trainee greetings, and updates landing stats', () => {
    assert(!html.includes('begin your first simulation mission today'), 'Landing CTA must not say begin your first simulation mission');
    assert(html.includes('start your first drill today'), 'Landing CTA must say start your first drill today');
    assert(!html.includes('100%') || !html.includes('CAMPUS<br>READINESS'), 'Landing stats must not show 100% CAMPUS READINESS');
    assert(html.includes('4 DRILLS ·<br>6 LESSONS') || html.includes('4 drills · 6 lessons'), 'Landing stats must show 4 drills · 6 lessons');
    assert(!html.includes('ID: RV-TRAINEE'), 'Profile ID badge must not say RV-TRAINEE');
    assert(html.includes('ID: RV-STUDENT'), 'Profile ID badge must say ID: RV-STUDENT');
});

// CHECK 7: Solid purple hero headline
runTest('Check 7: Hero headline Prepare. Decide. Act. is solid purple with no text stroke', () => {
    assert(styleCss.includes('.hero-title strong {') && styleCss.includes('color: #818cf8'), 'Dark mode hero title strong must be solid #818cf8');
    assert(styleCss.includes('[data-theme="light"] .hero-title strong') && styleCss.includes('color: #6c4cf1'), 'Light mode hero title strong must be solid #6c4cf1');
    assert(styleCss.includes('-webkit-text-stroke: 0'), 'Hero title strong must have 0 text stroke');
});

// CHECK 8: Startup console logs & inline SVG favicon & sessionStorage loading screen
runTest('Check 8: Startup console logs gated by RV_DEBUG, inline SVG favicon in head, and sessionStorage loading screen', () => {
    assert(scriptJs.includes('const RV_DEBUG = false;'), 'script.js must define const RV_DEBUG = false');
    assert(html.includes('<link rel="icon" href="data:image/svg+xml,'), 'index.html must have inline SVG favicon');
    assert(scriptJs.includes('readyverse_loading_seen'), 'script.js must gate loading screen with sessionStorage readyverse_loading_seen');
});

console.log(`\nTests Completed: ${passedTests} / ${totalTests} passed.`);
if (passedTests !== totalTests) {
    process.exit(1);
}
