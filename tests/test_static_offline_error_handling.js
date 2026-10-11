/**
 * Test Suite: Static Deploy & Offline Error Handling
 * 
 * Verifies:
 * 1. Plain static server serving deploy/ (no server.js, zero Node API).
 * 2. Headless browser navigates Home, Drills, Learn, My Plan, Profile with ZERO blank screens.
 * 3. Plays a full 8-decision drill to completion and verifies debrief score screen.
 * 4. Opens "Ask ReadyVerse AI (Beta)", submits queries when /api/coach and /api/chat are 404.
 * 5. Student receives friendly guidance ("The AI friend is offline right now. Check the lessons or call 112." or grounded safety advice).
 * 6. ZERO red console.error messages and ZERO uncaught exceptions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8098;
const CDP_PORT = 9231;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_USER_DATA = path.resolve(__dirname, '../scratch/temp_edge_test_static2');
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

console.log('\n=======================================================');
console.log('🧪 TESTING STATIC DEPLOY & OFFLINE ERROR HANDLING');
console.log('=======================================================\n');

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

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    }
}

// 1. Unit Tests for AITransport offline error resilience
const AITransportClass = require('../js/readyverse-ai/ai-transport');

test('AITransport generateGroundedFallback provides friendly offline student message', () => {
    const transport = new AITransportClass();
    const fallbackMsg = transport.generateGroundedFallback('Hello, can you help me?');
    assert(fallbackMsg.includes('The AI friend is offline right now') || fallbackMsg.includes('112'), 
        `Expected friendly offline message, got: "${fallbackMsg}"`);
});

test('AITransport generateGroundedFallback provides grounded PASS guidance offline', () => {
    const transport = new AITransportClass();
    const passMsg = transport.generateGroundedFallback('What is the PASS protocol for fire extinguishers?');
    assert(passMsg.includes('Pull') && passMsg.includes('Aim') && passMsg.includes('112'),
        `Expected PASS guidance, got: "${passMsg}"`);
});

async function runHeadlessBrowserSuite() {
    if (!fs.existsSync(EDGE_PATH)) {
        console.log(`  ⚠ Edge binary not found at ${EDGE_PATH}, skipping browser CDP test.`);
        return;
    }

    // Plain static server serving strictly deploy/
    const staticServer = http.createServer((req, res) => {
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

    if (fs.existsSync(TEMP_USER_DATA)) {
        try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch (_) {}
    }
    fs.mkdirSync(TEMP_USER_DATA, { recursive: true });

    const edgeProcess = spawn(EDGE_PATH, [
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
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);

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
        if (res.result?.result?.value !== undefined) {
            return res.result.result.value;
        }
        if (res.result?.value !== undefined) {
            return res.result.value;
        }
        return res.result?.result;
    }

    const consoleErrors = [];
    const uncaughtExceptions = [];
    const failedNetworkRequests = [];

    ws.on('message', (data) => {
        try {
            const evt = JSON.parse(data.toString());
            if (evt.method === 'Network.responseReceived') {
                const status = evt.params.response.status;
                const url = evt.params.response.url;
                if (status >= 400) {
                    failedNetworkRequests.push({ url, status });
                }
            } else if (evt.method === 'Runtime.consoleAPICalled') {
                if (evt.params.type === 'error') {
                    const args = (evt.params.args || []).map(a => a.value !== undefined ? a.value : a.description);
                    consoleErrors.push(args.join(' '));
                }
            } else if (evt.method === 'Runtime.exceptionThrown') {
                uncaughtExceptions.push(evt.params.exceptionDetails.text);
            }
        } catch (_) {}
    });

    await sendCommand('Network.enable');
    await sendCommand('Runtime.enable');
    await sendCommand('Page.enable');

    // Wait for page ready
    for (let i = 0; i < 30; i++) {
        const ready = await evalInPage(`Boolean(typeof ReadyVerseProgress !== 'undefined' && typeof window.switchSection === 'function')`);
        if (ready) break;
        await new Promise(r => setTimeout(r, 200));
    }

    // Step 1: Enter dashboard
    await evalInPage(`
        (() => {
            if (typeof openDashboard === 'function') openDashboard();
            else { const b = document.getElementById('enterReadyVerse'); if (b) b.click(); }
        })()
    `);
    await new Promise(r => setTimeout(r, 500));

    // Step 2: Navigate Home, Drills, Learn, My Plan, Profile
    await asyncTest('Headless navigation through 5 main tabs with zero blank screens', async () => {
        const sections = [
            { tab: 'dashboard', domId: 'dashboardContent' },
            { tab: 'missions', domId: 'missionsContent' },
            { tab: 'learn', domId: 'learnContent' },
            { tab: 'preparedness', domId: 'preparednessContent' },
            { tab: 'profile', domId: 'profileContent' }
        ];

        for (const sec of sections) {
            const val = await evalInPage(`
                (() => {
                    switchSection('${sec.tab}');
                    const el = document.getElementById('${sec.domId}');
                    return {
                        exists: Boolean(el),
                        visible: el ? !el.classList.contains('hidden') : false,
                        hasContent: el ? el.innerHTML.trim().length > 50 : false
                    };
                })()
            `);
            assert(val.exists, `Section element #${sec.domId} must exist`);
            assert(val.visible, `Section #${sec.domId} must be visible when navigated`);
            assert(val.hasContent, `Section #${sec.domId} must have non-empty content`);
        }
    });

    // Step 3: Play Building Fire drill through all 8 questions
    await asyncTest('Plays Building Fire drill to the end and reaches result debrief', async () => {
        await evalInPage(`
            (() => {
                startMission('fire');
                for (let i = 0; i < 8; i++) {
                    handleDecision(0);
                    nextDecision();
                }
            })()
        `);
        await new Promise(r => setTimeout(r, 800));

        const val = await evalInPage(`
            (() => {
                const resPage = document.getElementById('resultPage');
                const xpEl = document.getElementById('resultTotalXP');
                const scoreEl = document.getElementById('resultScore');
                return {
                    resultPageVisible: resPage ? !resPage.classList.contains('hidden') : false,
                    xp: state.totalXP,
                    completed: state.completedMissionIds.has('fire')
                };
            })()
        `);
        assert(val.resultPageVisible, 'Result page must be visible upon drill completion');
        assert(val.xp > 0, 'Total XP must be awarded and greater than 0');
        assert(val.completed === true, 'Fire drill must be registered as completed in progress state');
    });

    // Step 4: Open "Ask ReadyVerse AI (Beta)" and send message when /api/coach is unavailable
    await asyncTest('Opens AI Coach modal, handles 404 /api/coach with friendly message', async () => {
        await evalInPage(`
            (() => {
                if (window.readyVerseAI) window.readyVerseAI.open();
                const input = document.getElementById('rvAiTextInput');
                if (input) input.value = "What is the emergency helpline number?";
                const sendBtn = document.getElementById('rvAiSendBtn');
                if (sendBtn) sendBtn.click();
            })()
        `);

        // Wait for failover
        await new Promise(r => setTimeout(r, 2500));

        const val = await evalInPage(`
            (() => {
                const transcript = document.getElementById('rvAiTranscript');
                const bubbles = Array.from(transcript ? transcript.querySelectorAll('.rv-ai-bubble') : []).map(b => b.innerText);
                const statusText = document.getElementById('rvAiStatusText')?.innerText;
                return {
                    bubbles,
                    statusText
                };
            })()
        `);

        const lastBubble = val.bubbles[val.bubbles.length - 1] || '';
        assert(lastBubble.includes('offline right now') || lastBubble.includes('112'),
            `Student must receive friendly offline message or 112 guidance. Got: "${lastBubble}"`);
        assert(val.statusText === 'Offline Ready Mode' || val.statusText.includes('Offline'),
            `Status indicator must show offline mode. Got: "${val.statusText}"`);
    });

    // Step 5: Check zero console errors and zero uncaught exceptions
    test('Zero red console errors (console.error) during static navigation, drill play, and AI fallback', () => {
        assert.strictEqual(consoleErrors.length, 0, `Expected 0 console.error logs, got: ${JSON.stringify(consoleErrors)}`);
    });

    test('Zero uncaught JavaScript runtime exceptions', () => {
        assert.strictEqual(uncaughtExceptions.length, 0, `Expected 0 exceptions, got: ${JSON.stringify(uncaughtExceptions)}`);
    });

    ws.close();
    edgeProcess.kill();
    staticServer.close();
    if (fs.existsSync(TEMP_USER_DATA)) {
        try { fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true }); } catch (_) {}
    }
}

async function run() {
    await runHeadlessBrowserSuite();

    console.log('\n=======================================================');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('=======================================================\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

run();
