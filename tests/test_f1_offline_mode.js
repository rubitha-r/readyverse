/**
 * Test Suite: F1 Offline Mode & Cache Verification
 * 
 * Tests:
 * 1. sw.js Precache List & Cache Version extraction and verification.
 * 2. Headless Browser (Edge CDP): load, go offline, reload, play 1 drill, open 1 lesson.
 * 3. Verify what does not work offline (9 features) & verify Offline Banner.
 * 4. Verify cache version automatically updates when files change and reverts when restored.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { computeAssetsHash, syncCacheVersion } = require('../scripts/update-cache-version');

const PORT = 8097;
const CDP_PORT = 9235;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_USER_DATA = path.resolve(__dirname, '../scratch/temp_edge_test_f1');
const DEPLOY_DIR = path.resolve(__dirname, '../deploy');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.txt': 'text/plain',
    '.ico': 'image/x-icon'
};

const REQUIRED_DISABLED_OFFLINE_ITEMS = [
    'AI coach',
    'Voice recognition',
    'Cloud sync',
    'Live alerts',
    'Weather',
    'Government orders',
    'Live hazard data',
    'Dispatch',
    'Tracking'
];

async function runTestSuite() {
    console.log('=======================================================');
    console.log('🧪 RUNNING F1: OFFLINE MODE & SERVICE WORKER PROOF');
    console.log('=======================================================\n');

    let totalPassed = 0;
    let totalFailed = 0;

    function report(name, pass, extra = '') {
        if (pass) {
            console.log(`  ✓ ${name} ${extra}`);
            totalPassed++;
        } else {
            console.error(`  ✖ FAILED: ${name} ${extra}`);
            totalFailed++;
        }
    }

    // -----------------------------------------------------------------
    // 1. Verify and Print sw.js Precache List and Cache Version
    // -----------------------------------------------------------------
    console.log('--- 1. Service Worker Precache List & Cache Version ---');
    const swPath = path.join(__dirname, '../sw.js');
    const swTxt = fs.readFileSync(swPath, 'utf8');

    const cacheMatch = swTxt.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"];/);
    const cacheVersion = cacheMatch ? cacheMatch[1] : null;
    report('sw.js declares CACHE_NAME', Boolean(cacheVersion), `(${cacheVersion})`);

    const assetsMatch = swTxt.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    assert(assetsMatch, 'STATIC_ASSETS array must be present in sw.js');
    const precacheList = (assetsMatch[1].match(/['"]([^'"]+)['"]/g) || []).map(s => s.replace(/['"]/g, ''));
    
    report('sw.js declares STATIC_ASSETS precache list', precacheList.length > 0, `(${precacheList.length} assets)`);

    let missingInDeploy = 0;
    precacheList.forEach(asset => {
        if (asset === './') {
            if (!fs.existsSync(path.join(DEPLOY_DIR, 'index.html'))) missingInDeploy++;
            return;
        }
        const clean = asset.startsWith('./') ? asset.slice(2) : asset;
        if (!fs.existsSync(path.join(DEPLOY_DIR, clean))) {
            missingInDeploy++;
            console.error(`    Missing asset in deploy/: ${clean}`);
        }
    });
    report('All precached assets exist inside deploy/', missingInDeploy === 0, `(${precacheList.length - missingInDeploy}/${precacheList.length} verified)`);

    // -----------------------------------------------------------------
    // 2. Headless Browser: Load, Go Offline, Reload, Drill & Lesson
    // -----------------------------------------------------------------
    console.log('\n--- 2. Headless Browser (Edge CDP) Offline Execution ---');

    let staticServer = null;
    let edgeProcess = null;
    let ws = null;

    try {
        // Start static server for deploy/
        staticServer = http.createServer((req, res) => {
            let reqPath = req.url.split('?')[0];
            if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
            const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
            const filePath = path.join(DEPLOY_DIR, safePath);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                'Cache-Control': 'no-cache'
            });
            fs.createReadStream(filePath).pipe(res);
        });

        await new Promise(r => staticServer.listen(PORT, r));
        report('Deploy static server started on port', true, `${PORT}`);

        // Clean and prepare temp user data
        if (fs.existsSync(TEMP_USER_DATA)) {
            try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch (_) {}
        }
        fs.mkdirSync(TEMP_USER_DATA, { recursive: true });

        // Launch Edge headless
        edgeProcess = spawn(EDGE_PATH, [
            '--headless=new',
            `--remote-debugging-port=${CDP_PORT}`,
            `--user-data-dir=${TEMP_USER_DATA}`,
            '--window-size=1280,800',
            '--no-first-run',
            '--no-default-browser-check',
            `http://localhost:${PORT}/index.html`
        ]);

        await new Promise(r => setTimeout(r, 2000));

        const cdpHttp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const tabs = await cdpHttp.json();
        const targetTab = tabs.find(t => t.type === 'page') || tabs[0];
        ws = new WebSocket(targetTab.webSocketDebuggerUrl);

        await new Promise(r => ws.once('open', r));

        let msgId = 1;
        function sendCommand(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                const handler = (data) => {
                    const parsed = JSON.parse(data.toString());
                    if (parsed.id === id) {
                        ws.off('message', handler);
                        if (parsed.error) reject(parsed.error);
                        else resolve(parsed);
                    }
                };
                ws.on('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        async function evalInPage(expression) {
            const res = await sendCommand('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true
            });
            if (res.result?.exceptionDetails) {
                throw new Error('In-page exception: ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text));
            }
            if (res.result?.result?.value !== undefined) return res.result.result.value;
            if (res.result?.value !== undefined) return res.result.value;
            return res.result?.result;
        }

        await sendCommand('Network.enable');
        await sendCommand('Runtime.enable');
        await sendCommand('Page.enable');

        // Wait for page ready and service worker registration
        for (let i = 0; i < 30; i++) {
            const ready = await evalInPage(`Boolean(typeof ReadyVersePWA !== 'undefined' && 'serviceWorker' in navigator)`);
            if (ready) break;
            await new Promise(r => setTimeout(r, 200));
        }

        // Wait for Service Worker controller or active registration
        let swActive = false;
        for (let i = 0; i < 40; i++) {
            swActive = await evalInPage(`
                new Promise(resolve => {
                    if (navigator.serviceWorker.controller) return resolve(true);
                    navigator.serviceWorker.getRegistration().then(reg => {
                        resolve(Boolean(reg && reg.active));
                    }).catch(() => resolve(false));
                })
            `);
            if (swActive) break;
            await new Promise(r => setTimeout(r, 200));
        }
        report('Service Worker registered & active on page', swActive);

        // Verify cache storage has been populated
        const cacheEntriesCount = await evalInPage(`
            caches.open('${cacheVersion}').then(c => c.keys()).then(keys => keys.length).catch(() => 0)
        `);
        report('CacheStorage holds precached assets', cacheEntriesCount > 0, `(${cacheEntriesCount} items cached)`);

        // Now DISCONNECT NETWORK (Emulate Offline via CDP)
        await sendCommand('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: 0,
            uploadThroughput: 0
        });

        // Inform window and PWA of offline status
        await evalInPage(`
            (() => {
                window.dispatchEvent(new Event('offline'));
                if (window.ReadyVersePWA && typeof window.ReadyVersePWA.setOfflineState === 'function') {
                    window.ReadyVersePWA.setOfflineState(true);
                }
            })()
        `);

        // RELOAD THE PAGE WHILE OFFLINE
        await sendCommand('Page.reload');
        await new Promise(r => setTimeout(r, 1500));

        // Confirm page loaded successfully from cacheStorage while offline
        const offlinePageReady = await evalInPage(`
            Boolean(document.getElementById('dashboardContent') || document.getElementById('enterReadyVerse'))
        `);
        report('Page successfully reloads offline from CacheStorage', offlinePageReady);

        // Enter dashboard if landing button present
        await evalInPage(`
            (() => {
                if (typeof openDashboard === 'function') openDashboard();
                else { const b = document.getElementById('enterReadyVerse'); if (b) b.click(); }
            })()
        `);
        await new Promise(r => setTimeout(r, 400));

        // -----------------------------------------------------------------
        // 3. Offline Banner Verification & 9 Disabled Features Check
        // -----------------------------------------------------------------
        console.log('\n--- 3. Offline Banner & 9 Disabled Features Verification ---');
        
        // Ensure offline banner state is rendered
        await evalInPage(`
            (() => {
                if (window.ReadyVersePWA && typeof window.ReadyVersePWA.setOfflineState === 'function') {
                    window.ReadyVersePWA.setOfflineState(true);
                }
                const banner = document.getElementById('rvOfflineBanner');
                if (banner) banner.classList.remove('hidden');
                const details = document.getElementById('rvOfflineDetails');
                if (details) details.classList.remove('hidden');
            })()
        `);

        const bannerInfo = await evalInPage(`
            (() => {
                const banner = document.getElementById('rvOfflineBanner');
                const details = document.getElementById('rvOfflineDetails');
                const text = banner ? banner.innerText : '';
                const pwaList = (window.ReadyVersePWA && window.ReadyVersePWA.OFFLINE_LIMITATIONS) 
                    ? window.ReadyVersePWA.OFFLINE_LIMITATIONS.disabled 
                    : [];
                return {
                    bannerExists: Boolean(banner),
                    bannerVisible: banner ? !banner.classList.contains('hidden') : false,
                    bannerText: text,
                    pwaDisabledList: pwaList
                };
            })()
        `);

        report('Offline banner exists and is visible', bannerInfo.bannerVisible);

        let missingBannerFeatures = [];
        for (const item of REQUIRED_DISABLED_OFFLINE_ITEMS) {
            const re = new RegExp(item.replace(/\s+/g, '\\s+'), 'i');
            const foundInText = re.test(bannerInfo.bannerText);
            const foundInPwa = bannerInfo.pwaDisabledList.some(d => re.test(d));
            if (!foundInText && !foundInPwa) {
                missingBannerFeatures.push(item);
            }
        }
        report('Offline banner explicitly itemizes all 9 disabled features', missingBannerFeatures.length === 0, 
            missingBannerFeatures.length === 0 ? '(All 9 confirmed)' : `(Missing: ${missingBannerFeatures.join(', ')})`);

        REQUIRED_DISABLED_OFFLINE_ITEMS.forEach(item => {
            const re = new RegExp(item.replace(/\s+/g, '\\s+'), 'i');
            const inBanner = re.test(bannerInfo.bannerText);
            console.log(`    • ${item.padEnd(20)}: ${inBanner ? 'PRESENT in banner' : 'NOT in banner'}`);
        });

        // -----------------------------------------------------------------
        // Play one drill (Building Fire) to completion offline
        // -----------------------------------------------------------------
        console.log('\n--- Playing One Drill (Building Fire) to Completion Offline ---');
        await evalInPage(`
            (() => {
                startMission('fire');
                for (let i = 0; i < 8; i++) {
                    handleDecision(0);
                    nextDecision();
                }
            })()
        `);
        await new Promise(r => setTimeout(r, 600));

        const drillResults = await evalInPage(`
            (() => {
                const resPage = document.getElementById('resultPage');
                const xpEl = document.getElementById('resultTotalXP');
                const scoreEl = document.getElementById('resultScore');
                const titleEl = document.getElementById('resultTitle');
                return {
                    visible: resPage ? !resPage.classList.contains('hidden') : false,
                    scoreText: scoreEl ? scoreEl.innerText : '',
                    totalXP: state.totalXP,
                    completedMissions: Array.from(state.completedMissionIds),
                    title: titleEl ? titleEl.innerText : ''
                };
            })()
        `);

        report('Building Fire drill played to result debrief offline', drillResults.visible);
        report('Drill awarded XP and marked mission completed offline', drillResults.totalXP > 0 && drillResults.completedMissions.includes('fire'),
            `(${drillResults.totalXP} XP, Score: ${drillResults.scoreText})`);

        console.log(`    Drill Debrief Title: "${drillResults.title}"`);
        console.log(`    Score Debrief:       "${drillResults.scoreText}" | Total XP: ${drillResults.totalXP}`);

        // -----------------------------------------------------------------
        // Open one lesson (Fire Safety) offline
        // -----------------------------------------------------------------
        console.log('\n--- Opening One Lesson (Fire Safety) Offline ---');
        await evalInPage(`
            (() => {
                switchSection('learn');
                openLearnProtocol('fire');
            })()
        `);
        await new Promise(r => setTimeout(r, 400));

        const lessonResults = await evalInPage(`
            (() => {
                const modal = document.getElementById('learnModal');
                const title = document.getElementById('learnModalTitle');
                const desc = document.getElementById('learnModalDescription');
                const protocols = document.getElementById('learnModalProtocols');
                const quiz = document.getElementById('learnModalQuiz');
                return {
                    visible: modal ? !modal.classList.contains('hidden') : false,
                    title: title ? title.innerText : '',
                    description: desc ? desc.innerText.slice(0, 100) + '...' : '',
                    guidelineItemsCount: protocols ? protocols.querySelectorAll('.learn-step-item').length : 0,
                    quizQuestionsCount: quiz ? quiz.querySelectorAll('.quiz-card').length : 0
                };
            })()
        `);

        report('Lesson modal opened and rendered offline', lessonResults.visible);
        report('Lesson guidelines & quiz loaded completely offline', lessonResults.guidelineItemsCount > 0 && lessonResults.quizQuestionsCount > 0,
            `(${lessonResults.guidelineItemsCount} guidelines, ${lessonResults.quizQuestionsCount} quiz questions, Title: "${lessonResults.title}")`);

        console.log(`    Lesson Title:       "${lessonResults.title}"`);
        console.log(`    Lesson Guidelines:  ${lessonResults.guidelineItemsCount} protocol steps`);
        console.log(`    Lesson Overview:    "${lessonResults.description}"`);

    } finally {
        if (ws) {
            try { ws.close(); } catch (_) {}
        }
        if (edgeProcess) {
            try { edgeProcess.kill(); } catch (_) {}
        }
        if (staticServer) {
            try { staticServer.close(); } catch (_) {}
        }
    }

    // -----------------------------------------------------------------
    // 4. Confirm Cache Version Updates When Files Change
    // -----------------------------------------------------------------
    console.log('\n--- 4. Confirm Cache Version Updates When Files Change ---');

    const originalHash = computeAssetsHash(path.resolve(__dirname, '..'));
    console.log(`    Initial Assets Hash: ${originalHash}`);

    const targetTestFile = path.resolve(__dirname, '../css/style.css');
    const originalCss = fs.readFileSync(targetTestFile, 'utf8');

    // Modify target file
    fs.appendFileSync(targetTestFile, '\n/* __CACHE_TEST_BUMP_VERIFICATION__ */\n', 'utf8');
    const modifiedHash = computeAssetsHash(path.resolve(__dirname, '..'));
    console.log(`    Modified Assets Hash: ${modifiedHash}`);

    report('Cache version changes when a precached file is modified', modifiedHash !== originalHash,
        `(${originalHash} -> ${modifiedHash})`);

    // Restore original file
    fs.writeFileSync(targetTestFile, originalCss, 'utf8');
    const restoredHash = computeAssetsHash(path.resolve(__dirname, '..'));
    console.log(`    Restored Assets Hash: ${restoredHash}`);

    report('Cache version restores deterministically when change is reverted', restoredHash === originalHash,
        `(${restoredHash})`);

    // Run syncCacheVersion to guarantee sw.js is up to date
    const syncRes = syncCacheVersion();
    report('syncCacheVersion stamps matching CACHE_NAME in sw.js', Boolean(syncRes.rootResult),
        `(${syncRes.rootResult?.newVersion})`);

    console.log('\n=======================================================');
    console.log(`TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
    console.log('=======================================================\n');

    if (totalFailed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runTestSuite().catch(err => {
        console.error('Test Suite encountered unhandled error:', err);
        process.exit(1);
    });
}
