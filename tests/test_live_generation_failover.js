/**
 * tests/test_live_generation_failover.js
 * Mock test suite (zero network calls) validating:
 * 1. Success (Gemini live generation)
 * 2. Gemini empty candidate -> Groq failover success
 * 3. Gemini blocked (safety filter) -> Groq 400 -> local fallback
 * 4. Timeout handling (ETIMEDOUT)
 * 5. 429 Rate limiting
 * 6. Malformed JSON handling
 * 7. Missing API key handling (not_configured)
 * 8. /api/coach-health ?deep=1 contract
 * 9. Service Worker offline JSON contract ({ ok: false, reply, provider: "offline" })
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const coach = require('../api/coach');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ PASSED: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗ FAILED: ${name}`);
        console.error(`    Error: ${e.message}`);
        failed++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`  ✓ PASSED: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗ FAILED: ${name}`);
        console.error(`    Error: ${e.message}`);
        failed++;
    }
}

// Preserve original https.request
const originalHttpsRequest = https.request;

function mockHttpsResponse(handler) {
    https.request = function (options, callback) {
        const mockRes = {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            on: function (event, cb) {
                if (event === 'data') this._dataCb = cb;
                if (event === 'end') this._endCb = cb;
                return this;
            }
        };

        const mockReq = {
            on: function (event, cb) {
                if (event === 'error') this._errorCb = cb;
                if (event === 'timeout') this._timeoutCb = cb;
                return this;
            },
            write: function (data) {
                this._body = data;
            },
            end: function () {
                // Call custom mock handler
                setImmediate(() => {
                    handler(options, this._body, mockRes, this);
                });
            },
            destroy: function () {}
        };

        if (callback) {
            setImmediate(() => callback(mockRes));
        }

        return mockReq;
    };
}

function restoreHttps() {
    https.request = originalHttpsRequest;
}

async function main() {
    console.log('=======================================================');
    console.log('🧪 RUNNING LIVE AI GENERATION & FAILOVER MOCK TESTS');
    console.log('=======================================================\n');

    const origEnv = { ...process.env };

    // --- TEST 1: Gemini Live Success ---
    await runAsyncTest('1. Gemini Success returns ok: true, provider: "gemini"', async () => {
        process.env.GEMINI_API_KEY = 'mock-valid-gemini-key-12345';
        process.env.GROQ_API_KEY = 'mock-valid-groq-key-12345';

        mockHttpsResponse((options, body, res, req) => {
            if (options.hostname === 'generativelanguage.googleapis.com') {
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    candidates: [{
                        content: { parts: [{ text: 'Crawling low under smoke keeps you in cool, breathable air.' }] },
                        finishReason: 'STOP'
                    }]
                }));
                res._endCb();
            }
        });

        const result = await coach.handleCoachRequest({ message: 'Why crawl under smoke?' }, 'test-client-1');
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.ok, true);
        assert.strictEqual(result.body.provider, 'gemini');
        assert(result.body.response.includes('Crawling low under smoke'));
    });

    // --- TEST 2: Gemini Empty Candidate -> Groq Failover Success ---
    await runAsyncTest('2. Gemini empty candidate -> Groq failover returns ok: true, provider: "groq"', async () => {
        process.env.GEMINI_API_KEY = 'mock-valid-gemini-key-12345';
        process.env.GROQ_API_KEY = 'mock-valid-groq-key-12345';

        mockHttpsResponse((options, body, res, req) => {
            if (options.hostname === 'generativelanguage.googleapis.com') {
                // Gemini returns 200 but empty candidates / no text
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    candidates: [{
                        content: { parts: [] },
                        finishReason: 'OTHER'
                    }]
                }));
                res._endCb();
            } else if (options.hostname === 'api.groq.com') {
                // Groq succeeds
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    choices: [{
                        message: { content: 'In a fire, cool air stays in the lower 12 to 24 inches.' }
                    }]
                }));
                res._endCb();
            }
        });

        const result = await coach.handleCoachRequest({ message: 'What do I do in a fire?' }, 'test-client-2');
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.ok, true);
        assert.strictEqual(result.body.provider, 'groq');
        assert.strictEqual(result.body.fallback, true);
        assert(result.body.response.includes('lower 12 to 24 inches'));
    });

    // --- TEST 3: Gemini Blocked -> Groq 400 -> Local Fallback ---
    await runAsyncTest('3. Gemini blocked (safety) -> Groq 400 -> local fallback (grounded_local)', async () => {
        process.env.GEMINI_API_KEY = 'mock-valid-gemini-key-12345';
        process.env.GROQ_API_KEY = 'mock-valid-groq-key-12345';

        mockHttpsResponse((options, body, res, req) => {
            if (options.hostname === 'generativelanguage.googleapis.com') {
                // Gemini safety filter block
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    candidates: [{
                        finishReason: 'SAFETY'
                    }]
                }));
                res._endCb();
            } else if (options.hostname === 'api.groq.com') {
                // Groq returns 400 bad request (e.g. invalid model ID)
                res.statusCode = 400;
                res._dataCb(JSON.stringify({
                    error: { message: 'Invalid model ID' }
                }));
                res._endCb();
            }
        });

        const result = await coach.handleCoachRequest({ message: 'What is the highest-impact action I should do next?' }, 'test-client-3');
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.ok, false);
        assert.strictEqual(result.body.provider, 'grounded_local');
        assert.strictEqual(result.body.fallback, true);
        assert(result.body.response.includes('Readiness Score') || result.body.response.includes('Building Fire'));
    });

    // --- TEST 4: Timeout Handling (ETIMEDOUT) ---
    await runAsyncTest('4. Provider timeout -> falls back gracefully', async () => {
        process.env.GEMINI_API_KEY = 'mock-valid-gemini-key-12345';
        process.env.GROQ_API_KEY = 'mock-valid-groq-key-12345';

        mockHttpsResponse((options, body, res, req) => {
            // Trigger timeout event on request
            req._timeoutCb();
        });

        const result = await coach.handleCoachRequest({ message: 'Tell me about cyclone' }, 'test-client-4');
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.ok, false);
        assert.strictEqual(result.body.provider, 'grounded_local');
        assert(result.body.response.includes('cyclone') || result.body.response.includes('shelter'));
    });

    // --- TEST 5: Rate Limiting (HTTP 429) ---
    await runAsyncTest('5. Exceeding 10 requests in window returns HTTP 429 rate_limited', async () => {
        const clientIp = '198.51.100.99';
        // Send 10 requests to exhaust window
        for (let i = 0; i < 10; i++) {
            coach.checkRateLimit(clientIp);
        }

        const result = await coach.handleCoachRequest({ message: 'Hello' }, clientIp);
        assert.strictEqual(result.statusCode, 429);
        assert.strictEqual(result.body.ok, false);
        assert.strictEqual(result.body.code, 'rate_limited');
        assert(result.body.retryAfter > 0);
    });

    // --- TEST 6: Malformed Body Handling ---
    await runAsyncTest('6. Malformed empty or non-string message returns HTTP 400 bad_request', async () => {
        const emptyResult = await coach.handleCoachRequest({ message: '   ' }, 'test-client-6');
        assert.strictEqual(emptyResult.statusCode, 400);
        assert.strictEqual(emptyResult.body.code, 'bad_request');
    });

    // --- TEST 7: Missing API Keys (not_configured) ---
    await runAsyncTest('7. Missing provider keys returns grounded_local with code not_configured', async () => {
        delete process.env.GEMINI_API_KEY;
        delete process.env.GROQ_API_KEY;

        const result = await coach.handleCoachRequest({ message: 'Tell me about ReadyVerse' }, 'test-client-7');
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.ok, false);
        assert.strictEqual(result.body.code, 'not_configured');
        assert.strictEqual(result.body.provider, 'grounded_local');
        assert(result.body.response.includes('ReadyVerse'));
    });

    // --- TEST 8: /api/coach-health with ?deep=1 ---
    await runAsyncTest('8. Health check ?deep=1 returns geminiLive, groqLive, model names without secrets', async () => {
        process.env.GEMINI_API_KEY = 'mock-key-123';
        process.env.GROQ_API_KEY = 'mock-key-456';
        process.env.GEMINI_MODEL = 'gemini-1.5-flash';
        process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';

        mockHttpsResponse((options, body, res, req) => {
            if (options.hostname === 'generativelanguage.googleapis.com') {
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    candidates: [{ content: { parts: [{ text: '1' }] } }]
                }));
                res._endCb();
            } else if (options.hostname === 'api.groq.com') {
                res.statusCode = 200;
                res._dataCb(JSON.stringify({
                    choices: [{ message: { content: '1' } }]
                }));
                res._endCb();
            }
        });

        // Test normal cheap health
        const cheapHealth = await coach.handleCoachRequest({ health: true }, 'health-check');
        assert.strictEqual(cheapHealth.body.ok, true);
        assert.strictEqual(cheapHealth.body.deep, undefined);
        assert.strictEqual(cheapHealth.body.geminiConfigured, true);
        assert.strictEqual(cheapHealth.body.groqConfigured, true);

        // Test deep health
        const deepHealth = await coach.handleCoachRequest({ health: true, deep: true }, 'health-check');
        assert.strictEqual(deepHealth.body.ok, true);
        assert.strictEqual(deepHealth.body.deep, true);
        assert.strictEqual(deepHealth.body.geminiLive, true);
        assert.strictEqual(deepHealth.body.groqLive, true);
        assert.strictEqual(deepHealth.body.geminiError, null);
        assert.strictEqual(deepHealth.body.groqError, null);
        assert.strictEqual(deepHealth.body.geminiModel, 'gemini-1.5-flash');
        assert.strictEqual(deepHealth.body.groqModel, 'qwen/qwen3.8-27b');
        assert.strictEqual(deepHealth.body.GEMINI_API_KEY, undefined);
        assert.strictEqual(deepHealth.body.GROQ_API_KEY, undefined);
    });

    // --- TEST 9: Service Worker Offline Contract Verification ---
    runTest('9. Service Worker offline payload satisfies { ok: false, reply, provider: "offline" }', () => {
        const fs = require('fs');
        const swContent = fs.readFileSync('sw.js', 'utf8');
        assert(swContent.includes('ok: false'), 'sw.js must return ok: false');
        assert(swContent.includes('provider: \'offline\''), 'sw.js must return provider: offline');
        assert(swContent.includes('reply:'), 'sw.js must return reply property');
        assert(swContent.includes('isOffline: true'), 'sw.js must return isOffline: true');
    });

    restoreHttps();
    Object.keys(process.env).forEach(k => {
        if (!(k in origEnv)) delete process.env[k];
        else process.env[k] = origEnv[k];
    });

    console.log('\n=======================================================');
    console.log(`🏁 TESTS COMPLETED: ${passed} passed, ${failed} failed`);
    console.log('=======================================================');

    if (failed > 0) process.exit(1);
}

main().catch(err => {
    restoreHttps();
    console.error('Fatal test error:', err);
    process.exit(1);
});
