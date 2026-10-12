/**
 * scripts/check-providers.js
 * Plain Node script to check available models and test 1-token generation
 * Reads keys from local .env (gitignored). Never prints keys. Redacts any secrets.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Safe .env loader
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.substring(0, idx).trim();
                let val = trimmed.substring(idx + 1).trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                if (!process.env[key]) process.env[key] = val;
            }
        });
    }
}

loadEnv();

const geminiKey = process.env.GEMINI_API_KEY || '';
const groqKey = process.env.GROQ_API_KEY || '';
const configuredGeminiModel = process.env.GEMINI_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
const configuredGroqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

function redactSecrets(str) {
    if (typeof str !== 'string') {
        str = JSON.stringify(str, null, 2);
    }
    let redacted = str;
    if (geminiKey && geminiKey.length > 5) {
        redacted = redacted.split(geminiKey).join('[REDACTED_GEMINI_KEY]');
    }
    if (groqKey && groqKey.length > 5) {
        redacted = redacted.split(groqKey).join('[REDACTED_GROQ_KEY]');
    }
    return redacted;
}

function httpsRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(body);
                } catch (_) {
                    parsed = body;
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: body, data: parsed });
            });
        });
        req.on('error', err => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function checkGemini() {
    console.log('\n=======================================================');
    console.log('🔍 CHECKING GOOGLE GEMINI PROVIDER');
    console.log('=======================================================');
    if (!geminiKey) {
        console.log('❌ GEMINI_API_KEY not found in .env');
        return { availableModels: [], generationTest: { status: 'NOT_RUN', reason: 'No key' } };
    }
    console.log(`Configured Model in .env: ${configuredGeminiModel}`);

    // 1. List models
    console.log('\n--- 1. Fetching Gemini Available Models List ---');
    let models = [];
    try {
        const listRes = await httpsRequest({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models?key=${geminiKey}`,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            timeout: 10000
        });

        if (listRes.statusCode === 200 && listRes.data && listRes.data.models) {
            models = listRes.data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace(/^models\//, ''));
            console.log(`✅ Available Gemini Models (${models.length} generateContent models):`);
            models.forEach(m => console.log(`   - ${m}`));
        } else {
            console.log(`❌ Failed to list Gemini models. Status: ${listRes.statusCode}`);
            console.log('Response body:', redactSecrets(listRes.rawBody));
        }
    } catch (e) {
        console.log('❌ Error listing Gemini models:', redactSecrets(e.message));
    }

    // 2. 1-token generation call with configured model
    console.log(`\n--- 2. 1-Token Generation Call with Configured Model: "${configuredGeminiModel}" ---`);
    let genResult = null;
    try {
        // Strip any "models/" prefix if present
        const modelPath = configuredGeminiModel.replace(/^models\//, '');
        const payload = {
            contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
            generationConfig: { maxOutputTokens: 1, temperature: 0.1 }
        };

        const genRes = await httpsRequest({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${modelPath}:generateContent?key=${geminiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        }, payload);

        console.log(`HTTP Status: ${genRes.statusCode}`);
        console.log('Raw Response Body (redacted):');
        console.log(redactSecrets(genRes.rawBody));
        genResult = {
            statusCode: genRes.statusCode,
            data: genRes.data,
            rawBody: redactSecrets(genRes.rawBody)
        };
    } catch (e) {
        console.log('❌ Generation request failed:', redactSecrets(e.message));
        genResult = { error: redactSecrets(e.message) };
    }

    return { availableModels: models, generationTest: genResult };
}

async function checkGroq() {
    console.log('\n=======================================================');
    console.log('🔍 CHECKING GROQ PROVIDER');
    console.log('=======================================================');
    if (!groqKey) {
        console.log('❌ GROQ_API_KEY not found in .env');
        return { availableModels: [], generationTest: { status: 'NOT_RUN', reason: 'No key' } };
    }
    console.log(`Configured Model in .env: ${configuredGroqModel}`);

    // 1. List models
    console.log('\n--- 1. Fetching Groq Available Models List ---');
    let models = [];
    try {
        const listRes = await httpsRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/models',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        if (listRes.statusCode === 200 && listRes.data && listRes.data.data) {
            models = listRes.data.data.map(m => m.id).sort();
            console.log(`✅ Available Groq Models (${models.length} models):`);
            models.forEach(m => console.log(`   - ${m}`));
        } else {
            console.log(`❌ Failed to list Groq models. Status: ${listRes.statusCode}`);
            console.log('Response body:', redactSecrets(listRes.rawBody));
        }
    } catch (e) {
        console.log('❌ Error listing Groq models:', redactSecrets(e.message));
    }

    // 2. 1-token generation call with configured model
    console.log(`\n--- 2. 1-Token Generation Call with Configured Model: "${configuredGroqModel}" ---`);
    let genResult = null;
    try {
        const payload = {
            model: configuredGroqModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1,
            temperature: 0.1
        };

        const genRes = await httpsRequest({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }, payload);

        console.log(`HTTP Status: ${genRes.statusCode}`);
        console.log('Raw Response Body (redacted):');
        console.log(redactSecrets(genRes.rawBody));
        genResult = {
            statusCode: genRes.statusCode,
            data: genRes.data,
            rawBody: redactSecrets(genRes.rawBody)
        };
    } catch (e) {
        console.log('❌ Generation request failed:', redactSecrets(e.message));
        genResult = { error: redactSecrets(e.message) };
    }

    return { availableModels: models, generationTest: genResult };
}

async function main() {
    const gemini = await checkGemini();
    const groq = await checkGroq();
    console.log('\n=======================================================');
    console.log('🏁 CHECK COMPLETE');
    console.log('=======================================================');
}

main().catch(err => console.error(err));
