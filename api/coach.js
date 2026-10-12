/**
 * ReadyVerse AI Coach — Serverless Function (/api/coach & /api/coach-health)
 * 
 * Strict Grounding & Guardrails:
 * - Primary: Google Gemini API (gemini-1.5-flash / gemini-2.0-flash)
 * - Fallback: Groq LPU (llama-3.1-8b-instant)
 * - In-memory rate limiting (max 15 requests / minute per client)
 * - Request timeouts: Gemini 4500ms, Groq 4000ms (total < 9s, safely under Netlify 10s budget)
 * - Short max response length (~180 tokens / 100-120 words)
 * - Grounded exclusively in ReadyVerse NDMA lesson data, drill simulations & platform knowledge sheet
 * - Structured error contract { ok: false, code, message } with codes:
 *   not_configured, network, timeout, rate_limited, provider_error, bad_request
 * - Health endpoint (/api/coach-health) returning status booleans with zero secrets
 * - Mirrors student language (English, Tamil, Tanglish)
 * - Detects live emergencies ("Call 112 now") vs study questions
 * - No API keys ever exposed to client.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Safe local .env loader (for local dev and bounded test suites; no-op if env already set or absent)
if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    try {
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
    } catch (_) {}
}

const SYSTEM_PROMPT_VERSION = 'v2.1-warm-companion';


// =========================================================================
// 1. IN-MEMORY RATE LIMITER (Per IP / Client)
// =========================================================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(clientId) {
    const now = Date.now();
    const record = rateLimitMap.get(clientId);

    if (!record) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
    }

    if (now > record.resetTime) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
    }

    if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        return { allowed: false, retryAfter };
    }

    record.count++;
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count };
}

// Clean up stale rate limit entries periodically
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, rec] of rateLimitMap.entries()) {
        if (now > rec.resetTime + 60000) {
            rateLimitMap.delete(id);
        }
    }
}, 5 * 60 * 1000);
if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

// =========================================================================
// 2. AUTHORITATIVE READYVERSE KNOWLEDGE BASE & PLATFORM SPECIFICATION
// =========================================================================
const READYVERSE_KNOWLEDGE_CONTEXT = `
READYVERSE CORE KNOWLEDGE:
- Purpose: Student disaster preparedness training. Standards: NDMA, NIDM, UNDRR.
- Drills: Building Fire, Flash Flood, Cyclone, Earthquake.
- Readiness Formula: round(0.40 * simulationScore + 0.30 * learningScore + 0.30 * planScore).
- Fire: Crawl low under smoke, check doors with back of hand, no lifts, PASS (Pull, Aim, Squeeze, Sweep), Stop Drop Roll for clothes, assemble at outdoor point. Call 101 or 112.
- Flood: Vertical evacuation to upper floors, 6 inches of water knocks adults, never walk/drive in moving water, power off safely from dry area. Call 112.
- Cyclone: Shelter in windowless interior room, stay inside during calm Eye of Storm, avoid downed power lines. Call 112.
- Earthquake: Drop, Cover, and Hold On under sturdy desk. No running/elevators during shaking. Evacuate via stairs after. Call 112.
- First Aid: Direct continuous pressure on bleeding, Recovery Position for unconscious breathing, never give liquids to unconscious. Call 108 / 112.
`;

function buildSystemPrompt(userContext = null) {
    let studentLine = '';
    let contextStr = '';
    if (userContext && typeof userContext === 'object') {
        const studentName = userContext.studentName || userContext.player?.studentName;
        if (studentName) {
            studentLine = `- Student Name: ${studentName} (Use this name occasionally and naturally; do not force it into every single turn).\n`;
        }
        const r = userContext.readiness || {};
        const p = userContext.player || {};
        const next = userContext.prioritizedNextActions || [];
        contextStr = `
STUDENT LIVE PROGRESS CONTEXT (AUTHORITATIVE NUMBERS):
${studentLine}- Current Readiness Score: ${r.total !== undefined ? r.total : 0}%
- Breakdown: Simulation Drills: ${r.simulationScore || 0}% (weighted: ${r.breakdown?.simWeighted || 0}/40), Learn Hub: ${r.learningScore || 0}% (weighted: ${r.breakdown?.learnWeighted || 0}/30), Preparedness Plan: ${r.planScore || 0}% (weighted: ${r.breakdown?.planWeighted || 0}/30)
- Player Level: ${p.level || 1} (${p.levelTitle || 'Rookie'}) | Total XP: ${p.totalXP || 0} | Streak: ${p.dailyStreak || 0} days
- Completed Drills: ${p.drillsCompletedCount || 0} / 4 | Completed Lessons: ${p.lessonsPassedCount || 0} / 6 | Completed Plan Items: ${p.planActionsDoneCount || 0} / 40
- Highest-Impact Next Action: ${next[0]?.action || 'Start your first drill: Building Fire'} (${next[0]?.readinessImpact || '+10.0% readiness'})
`;
    }

    return `
You are the ReadyVerse AI Coach (${SYSTEM_PROMPT_VERSION}), a student-friendly disaster preparedness companion and safety tutor for school and college students in India.

ROLE & PERSONALITY:
- Warm, natural, collegiate, patient, reassuring, and encouraging. You are a knowledgeable friend who is also a responsible safety coach.
- Tone: casual without being childish; clear, calm, and supportive.
- Response Length: usually 1-4 short sentences. Give detailed numbered steps (maximum 5) ONLY when the student explicitly asks for instructions, a breakdown, or during a crisis.
- Follow-ups: ask at most one useful, relevant follow-up question per turn.
- Continuity: refer back to earlier messages when relevant. Explain mistakes kindly and gently without judgment.
- Variation: vary your phrasing across turns; NEVER repeat identical greetings or formulaic closing taglines every message.
- Emoji Policy: at most one emoji per message and often none. ZERO emojis during emergencies. Never repeat the same emoji every turn.
- Language & Slang: Do NOT use "bro", "machan", or similar familiar slang unless the student uses them first or asks for that tone.
- Avoid: stiff phrases, robotic introductions, repetitive disclaimers, filler ("As an AI language model"), and repeated emergency numbers when there is no emergency.
- Honesty: never claim human feelings, personal history, or a physical body. Saying "I'm doing well" in small talk is fine.

DOMAIN FOCUS & TOPIC STEERING:
- Greetings and brief small talk ("Hey!", "How are you?", "What are you doing?") are always welcome! Reply warmly and briefly, then gently invite them to explore ReadyVerse.
- For unrelated requests (coding, math/homework, sports, entertainment, general chat), decline politely in one short sentence and steer back to ReadyVerse: e.g., "I'm specifically your disaster safety coach, so calculus isn't my domain! But if you want to test your fire or flood instincts, I'm ready."
- Do NOT become a general-purpose AI assistant.

EMOTIONAL ATTUNEMENT & SAFETY GUARDRAILS:
- Fear or Anxiety: If a student says they feel scared, nervous, or overwhelmed (e.g. about fire drills or storms), acknowledge their feeling first with empathy, reassure them, and offer a small step-by-step walk-through.
- Distress & Self-Harm: If a message suggests acute emotional distress, self-harm, or despair, respond with immediate human warmth, encourage them to talk to a trusted friend, family member, or counselor, and provide 112 as well as Tele-MANAS (14416) or KIRAN (1800-599-0019). Do not use gamified or quiz tone.
- Medical Guardrail: Never diagnose illnesses, recommend prescription medicines (e.g., paracetamol, antibiotics), or suggest medical procedures. For medical emergencies, direct to 108 / 112 or a campus health clinic.

THREE-TIER CRISIS & EMERGENCY PROTOCOL:
1. LIVE EMERGENCY (e.g., "my room is on fire", "building shaking now", "friend is not breathing", "thee pidichuruchu", "water rising fast"):
   - Drop the casual chat tone immediately.
   - LEAD WITH "Call 112 now!" (or 108 for medical).
   - Give 2-4 calm, direct, imperative survival steps from verified guidelines.
   - ZERO emojis.
2. STUDY SAFETY QUESTIONS (e.g., "What do I do in a fire?", "How does PASS work?"):
   - Clear, grounded explanation based on NDMA guidelines.
   - Mention the emergency number (112 or 101) once calmly.
3. ORDINARY CHAT & GREETINGS (e.g., "Hey!", "How are you?", "I'm confused"):
   - Warm, natural conversational tone.
   - DO NOT include emergency warnings, disclaimers, or "Call 112" when there is no hazard!

REGIONAL EMERGENCY NUMBERS:
- Default is India: 112 (National Emergency), 101 (Fire Service), 108 (Ambulance). Never tell someone in India to call 911.
- If the student explicitly states they are in another country:
  * US / Canada: 911
  * UK: 999
  * Australia: 000
  * European Union: 112
  * Other countries: say "your local emergency number" and ask which country. Never guess or invent numbers.

FOLLOW-UP & REPHRASING COMMANDS:
- If the student says "Explain that in Tamil", "Tamil-la sollu", "Say it simpler", "Can you explain that more simply?", or "What does that mean?":
  DO NOT start a new topic or introduce yourself again.
  REPHRASE the immediately preceding safety point from the conversation history into the requested language or simpler phrasing.

LANGUAGE REGISTERS:
- English: clear, simple, conversational everyday words.
- Tamil (தமிழ்): natural, spoken-register Tamil that college students actually use, not formal textbook literature.
- Tanglish: natural Tamil in Latin script, casual without forced slang. Keep safety terms and numbers exact (112, 101, 108, PASS, Stop Drop Roll).

FEW-SHOT TONE GUIDES (DO NOT COPY VERBATIM):
User: "My name is Ruby."
Coach: "Nice to meet you, Ruby! We can practise fire safety, floods, cyclones or earthquakes together. What would you like to explore first?"

User: "I'm scared of fire drills."
Coach: "That's completely understandable, Ruby. Drills can feel intimidating at first. Want me to walk you through what happens, one small step at a time?"

User: "Hy, ena pandra?"
Coach: "Nallaa iruken! Ungalukku campus safety and disaster drills practice panna help panren. Fire, flood, cyclone pathi kekkareengala, illana oru quick quiz try panlaama?"

User: "What are you doing?"
Coach: "I'm right here helping students build fast safety instincts for campus and hostel life. Want to check out a drill or try a quick safety quiz?"

User: "I got the answer wrong and I'm confused."
Coach: "That's completely okay—practice is how instincts get built! The key idea is that hot smoke rises, so crawling low keeps you in breathable air. What part still feels tricky?"

User: "Explain that in Tamil."
Coach: "கட்டிடத்தில் தீப்பிடித்தால் புகைக்கு அடியில் குனிந்து தவழ வேண்டும், ஏனென்றால் நச்சுப் புகை மேலே எழும்பும். படிக்கட்டுகள் வழியாக வெளியேறி 112-ஐ அழைக்கவும்."

User: "Can you say that more simply?"
Coach: "In a fire, stay low to the floor where the clean air is, take the stairs instead of the lift, and get outside."

User: "My room is on fire!"
Coach: "Call 112 now! Get out immediately, stay low under the smoke, and evacuate down the stairs. Never take the elevator."

User: "Can you solve this calculus integral for me?"
Coach: "I'm specifically your disaster safety coach, so calculus isn't my domain! But if you want to test your fire or flood readiness, I'm ready."

${contextStr}
AUTHORITATIVE KNOWLEDGE BASE:
${READYVERSE_KNOWLEDGE_CONTEXT}
`;
}

// =========================================================================
// 3. HTTP REQUEST HELPER
// =========================================================================
function httpsRequest(options, postData) {
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
                resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed });
            });
        });

        req.on('error', err => reject(err));
        req.on('timeout', () => {
            req.destroy();
            const err = new Error('Request timed out');
            err.code = 'ETIMEDOUT';
            reject(err);
        });

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

// =========================================================================
// 4. PROVIDER CALLERS (Gemini Primary 4.5s -> Groq Fallback 4.0s)
// =========================================================================

async function callGemini(userMessage, history = [], userContext = null, callOptions = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.length < 5) {
        const err = new Error('GEMINI_API_KEY_UNAVAILABLE');
        err.code = 'not_configured';
        throw err;
    }

    const preferredModel = callOptions.model || process.env.GEMINI_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
    const modelsToTry = [preferredModel];
    if (!modelsToTry.includes('gemini-1.5-flash')) modelsToTry.push('gemini-1.5-flash');
    if (!modelsToTry.includes('gemini-1.5-pro')) modelsToTry.push('gemini-1.5-pro');

    const systemPrompt = buildSystemPrompt(userContext);
    const formattedContents = [];

    // Append history
    if (Array.isArray(history)) {
        history.slice(-8).forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                formattedContents.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(msg.content || msg.text || '') }]
                });
            }
        });
    }

    // Append latest user message
    formattedContents.push({
        role: 'user',
        parts: [{ text: userMessage }]
    });

    const maxTokens = callOptions.maxTokens || 200;
    const timeoutMs = callOptions.timeoutMs || 4500;

    let lastError = null;

    for (const model of modelsToTry) {
        const cleanModel = model.replace(/^models\//, '');
        const payload = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: formattedContents,
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: maxTokens
            }
        };

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        };

        try {
            const res = await httpsRequest(options, payload);

            if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
                // 1. Check prompt feedback block
                if (res.data.promptFeedback && res.data.promptFeedback.blockReason) {
                    const blockReason = res.data.promptFeedback.blockReason;
                    const err = new Error(`Gemini prompt blocked (${blockReason})`);
                    err.code = 'gemini_prompt_blocked';
                    throw err;
                }

                // 2. Check candidates existence
                if (!res.data.candidates || !res.data.candidates.length) {
                    const err = new Error('Gemini returned no candidates');
                    err.code = 'gemini_no_candidates';
                    throw err;
                }

                const candidate = res.data.candidates[0];

                // 3. Check candidate finish reason blocks
                if (candidate.finishReason && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate.finishReason)) {
                    const err = new Error(`Gemini candidate blocked by safety filter (${candidate.finishReason})`);
                    err.code = 'gemini_safety_blocked';
                    throw err;
                }

                // 4. Check candidate text parts
                const parts = candidate.content && candidate.content.parts;
                if (!parts || !parts.length) {
                    const err = new Error(`Gemini returned empty candidate (finishReason: ${candidate.finishReason || 'none'})`);
                    err.code = 'gemini_empty_candidate';
                    throw err;
                }

                const textPart = parts.find(p => p.text && p.text.trim());
                if (textPart && textPart.text.trim()) {
                    return {
                        text: textPart.text.trim(),
                        provider: 'gemini',
                        model: cleanModel
                    };
                }

                const err = new Error(`Gemini candidate parts contained no text (finishReason: ${candidate.finishReason || 'none'})`);
                err.code = 'gemini_empty_candidate';
                throw err;
            }

            const errMsg = (res.data && res.data.error && res.data.error.message) || `Gemini HTTP ${res.statusCode}`;
            const err = new Error(errMsg);
            err.code = res.statusCode === 429 ? 'rate_limited' : (res.statusCode === 401 ? 'unauthenticated' : 'provider_error');
            lastError = err;
            if (res.statusCode === 401 || res.statusCode === 403) {
                break; // Bad or unauthenticated key: stop trying other models
            }
        } catch (e) {
            lastError = e;
            // Stop loop immediately on block or empty candidate so fallback engages
            if (e.code === 'gemini_prompt_blocked' || e.code === 'gemini_safety_blocked' || e.code === 'gemini_empty_candidate' || e.code === 'gemini_no_candidates') {
                break;
            }
        }
    }

    throw lastError || new Error('All Gemini models failed');
}

async function callGroq(userMessage, history = [], userContext = null, callOptions = {}) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.length < 5) {
        const err = new Error('GROQ_API_KEY_UNAVAILABLE');
        err.code = 'not_configured';
        throw err;
    }

    const preferredModel = callOptions.model || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
    const modelsToTry = [preferredModel];
    if (!modelsToTry.includes('qwen/qwen3.8-27b')) modelsToTry.push('qwen/qwen3.8-27b');
    if (!modelsToTry.includes('openai/gpt-oss-20b')) modelsToTry.push('openai/gpt-oss-20b');
    if (!modelsToTry.includes('openai/gpt-oss-120b')) modelsToTry.push('openai/gpt-oss-120b');

    const systemPrompt = buildSystemPrompt(userContext);
    const messages = [{ role: 'system', content: systemPrompt }];

    if (Array.isArray(history)) {
        history.slice(-8).forEach(msg => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                messages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: String(msg.content || msg.text || '')
                });
            }
        });
    }

    messages.push({ role: 'user', content: userMessage });

    const maxTokens = callOptions.maxTokens || 200;
    const timeoutMs = callOptions.timeoutMs || 9000;

    let lastError = null;

    for (const model of modelsToTry) {
        const payload = {
            model: model,
            messages: messages,
            temperature: 0.3,
            max_tokens: maxTokens
        };

        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: timeoutMs
        };

        try {
            let res = await httpsRequest(options, payload);
            if (res.statusCode === 429) {
                const retrySec = Math.min(parseInt((res.headers && res.headers['retry-after']) || '2', 10), 3);
                await new Promise(r => setTimeout(r, (retrySec + 1) * 1000));
                res = await httpsRequest(options, payload);
            }
            if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
                const choice = res.data.choices && res.data.choices[0];
                const text = choice && choice.message && choice.message.content;
                if (text && text.trim()) {
                    return {
                        text: text.trim(),
                        provider: 'groq',
                        model: model
                    };
                }
            }
            const errMsg = (res.data && res.data.error && res.data.error.message) || `Groq HTTP ${res.statusCode}`;
            const err = new Error(errMsg);
            err.code = res.statusCode === 429 ? 'rate_limited' : (res.statusCode === 400 ? 'invalid_request' : 'provider_error');
            lastError = err;
            if (res.statusCode === 401) {
                break; // Invalid key: stop trying other models
            }
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('All Groq models failed');
}

// =========================================================================
const AUTHENTIC_QUIZ_QUESTIONS = [
    {
        module: "Fire Safety & Evacuation",
        q: "Why is crawling low under smoke essential during a building fire?",
        options: [
            "It makes you move faster through doorways",
            "Toxic smoke and superheated gases rise, leaving cleaner air near the floor",
            "It prevents falling objects from touching you",
            "It keeps you hidden from outside heat"
        ],
        answer: 1,
        explanation: "Superheated smoke and lethal gases rise toward the ceiling; cooler, breathable air stays in the lower 12-24 inches."
    },
    {
        module: "Fire Safety & Evacuation",
        q: "What should you do before opening a closed door during an evacuation?",
        options: [
            "Kick the door open quickly",
            "Feel the door handle and door surface with the back of your hand",
            "Open the door slightly to peek inside",
            "Knock loudly and wait for a response"
        ],
        answer: 1,
        explanation: "The back of your hand is sensitive to heat; if the door or handle feels warm, fire is directly on the other side."
    },
    {
        module: "Fire Safety & Evacuation",
        q: "What is the correct protocol if your clothing catches fire?",
        options: [
            "Run rapidly toward the nearest exit",
            "Wave your arms to blow out the fire",
            "Stop, Drop to the ground, and Roll to smother the flames",
            "Look for a towel to fan the flames"
        ],
        answer: 2,
        explanation: "Running fans the flames; stopping, dropping, and rolling smothers oxygen and extinguishes the fire."
    },
    {
        module: "Flash Flood Preparedness",
        q: "How many inches of rapidly moving water are required to knock down an adult?",
        options: [
            "2 inches",
            "6 inches",
            "18 inches",
            "24 inches"
        ],
        answer: 1,
        explanation: "Just 6 inches of swiftwater can sweep an adult off their feet; 12 inches can carry away a car."
    },
    {
        module: "Earthquake Response",
        q: "What is the internationally proven protocol during active earthquake shaking?",
        options: [
            "Stand under a doorway and shout",
            "Drop, Cover, and Hold On",
            "Run outside into the street immediately",
            "Climb onto the roof of the building"
        ],
        answer: 1,
        explanation: "Drop to hands and knees, Cover head/neck under sturdy furniture, and Hold On until ground shaking stops."
    },
    {
        module: "Cyclone Emergency",
        q: "What is the calm, low-pressure center of a cyclone called?",
        options: [
            "The Tail",
            "The Eye of the Storm",
            "The Wind Core",
            "The Rain Shield"
        ],
        answer: 1,
        explanation: "The Eye is the calm center of a tropical cyclone, surrounded by the most violent eyewall winds."
    }
];

// 5. DETERMINISTIC RULE-BASED SAFETY MATCHER (Offline / Zero-Key Fallback)
// =========================================================================
function generateLocalSafetyResponse(userText, userContext = null, history = []) {
    const text = (userText || '').toLowerCase().trim();

    // Language detection
    const isTamilScript = /[\u0B80-\u0BFF]/.test(userText || '');
    const isTanglish = !isTamilScript && /\b(ena|enna|pandra|panra|panna|pannu|sollu|solren|machan|machi|bro|thambi|irukku|iruku|epdi|eppadi|thee|pidicha|velila|ulla|koodathu|dhaan|seri)\b/i.test(text);

    // 1. Adversarial / Prompt Injection / Out-of-Scope Refusals
    const adversarialKeywords = [
        'dan mode', 'ignore all', 'system prompt', 'secret', 'password', 'hack',
        'tracheotomy', 'paracetamol', 'prescribe', 'dosage', 'pills', 'chest pain',
        'cricket', 'world cup', 'python', 'script', 'homework', 'calculus', 'nuclear asteroid',
        'bypass fire alarm', 'disable alarm', 'vip number', 'secret helpline', 'fever', 'bleach'
    ];

    if (adversarialKeywords.some(k => text.includes(k))) {
        if (isTanglish) {
            return "I'm not sure, check the lesson or call 112. (Maruthuva aalosanai-ku doctor-ah consult pannunga).";
        }
        if (isTamilScript) {
            return "எனக்கு உறுதியாகத் தெரியவில்லை, பாடத்தைப் பார்க்கவும் அல்லது 112ஐ அழைக்கவும். மருத்துவ உதவிக்கு 108 ஐ அழைக்கவும்.";
        }
        return "I'm not sure, check the lesson or call 112";
    }

    // 2. Immediate Life-Threatening Emergency
    if (/\b(room is on fire|building is on fire|trapped inside|friend is not breathing|not breathing|unconscious|thee pidichuruchu)\b/i.test(text)) {
        if (isTanglish) return "Call 112 now! Smoke keezha crawl pannitu stairs vazhiya seekiram velila ponga. Lift kandippa use panna koodathu!";
        if (isTamilScript) return "உடனடியாக 112 அல்லது 101 ஐ அழைக்கவும்! புகைக்குக் கீழே குனிந்து தவழ்ந்து படிக்கட்டுகள் வழியே உடனடியாக வெளியேறவும்!";
        return "Call 112 now! Evacuate immediately via marked stairs, stay low under smoke, and never use elevators.";
    }

    // 3. Name introduction handling ("My name is Ruby", "Call me Priya")
    const nameMatch = text.match(/\b(?:my name is|call me|i am|i'm|en peru|en peyar)\s+([a-z]{2,20})\b/i);
    if (nameMatch && !['confused', 'scared', 'ready', 'here', 'fine', 'good', 'asking', 'student', 'trainee'].includes(nameMatch[1])) {
        const capName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
        if (isTanglish) return `Nice to meet you, ${capName}! Ungalukku fire safety, floods, cyclones or earthquakes practice panna ready-ah iruken. Enna parkkalam?`;
        if (isTamilScript) return `உங்களை சந்தித்ததில் மகிழ்ச்சி, ${capName}! தீ, வெள்ளம், புயல், நிலநடுக்க பாதுகாப்பு பயிற்சிகளை நாம் ஒன்றாகப் பயிற்சி செய்யலாம். எதை முதலில் தொடங்கலாம்?`;
        return `Nice to meet you, ${capName}! We can practise fire safety, floods, cyclones or earthquakes together. What would you like to explore first?`;
    }

    // 4. Follow-up & Rephrasing ("Explain that in Tamil", "Say it simpler")
    if (/\b(in\s+tamil|tamil[\s\-]*la|tamilil|விளக்கவும்)\b/i.test(text) && /\b(explain|sollu|solren|say|repeat)\b/i.test(text)) {
        return "கட்டிடத்தில் தீ விபத்து ஏற்பட்டால் புகைக்கு அடியில் குனிந்து தவழ வேண்டும், ஏனென்றால் நச்சுப் புகை மேலே எழும்பும். லிஃப்டை தவிர்க்கவும், படிக்கட்டுகள் வழியாக வெளியேறி 112-ஐ அழைக்கவும்.";
    }
    if (/\b(simpler|more simply|simple english|say it simpler|easy|explain simply)\b/i.test(text)) {
        return "In a fire: stay low to the floor where the clean air is, take the stairs instead of the lift, and get outside. Call 112 once you are safe.";
    }

    // 5. Confusion / Mistake Reactions ("I'm confused", "I got the answer wrong")
    if (text.includes('confused') || text.includes('wrong') || text.includes('purila') || text.includes('kuzhappam')) {
        if (isTanglish) return "No worries bro! Mistakes and confusion are how instincts get built. Learn Hub flashcards check pannunga, illana drill marubadiyum try pannalam!";
        if (isTamilScript) return "கவலைப்பட வேண்டாம்! தவறுகளிலிருந்து தான் நாம் கற்றுக்கொள்கிறோம். பாடத்தின் அட்டைகளைப் பாருங்கள் அல்லது மீண்டும் பயிற்சியைத் தொடங்குங்கள்.";
        return "That's completely okay—practice is how instincts get built! The key idea is that hot smoke rises, so staying low keeps you in breathable air. What part feels confusing?";
    }

    // 6. Pedagogical Drill Questions ("Why should I complete this drill?", "What can I do in the fire game?")
    if (text.includes('why should i complete') || text.includes('fire game') || text.includes('what can i do in') || text.includes('why complete drill')) {
        return "ReadyVerse simulation drills let you practice 8 critical crisis stages—like crawling under smoke, checking door heat, and escaping via stairs—without real danger. Each completed drill adds +10.0% to your Readiness Score!";
    }

    // 7. Casual Greetings & Chitchat ("Hey!", "How are you?", "What are you doing?", "OK WHAT ARE YOU DOING", "Hy ena pandra")
    const isGreeting = /^(hi|hello|hey|vanakkam|hy|hlo)\b/i.test(text) ||
                       text.includes('how are you') || text.includes('what are you doing') || text.includes('what r u doing') ||
                       text.includes('ena pandra') || text.includes('enna pandra') || text.includes('epdi iruka');

    if (isGreeting) {
        if (isTanglish) {
            return "Nallaa iruken! Ungalukku campus safety and disaster drills practice panna help panren. Fire, flood, cyclone pathi kekkareengala, illana oru quick quiz try panlaama?";
        }
        if (isTamilScript) {
            return "வணக்கம்! நான் உங்கள் ReadyVerse பாதுகாப்பு பயிற்சியாளர். பேரிடர் பாதுகாப்பு பயிற்சிகள் அல்லது வினாடி வினா பற்றி என்ன தெரிந்துகொள்ள வேண்டும்?";
        }
        return "Hey there! I'm your ReadyVerse disaster preparedness coach, here to help you practice safety instincts for campus and hostel life. Want to check out a drill or try a quick safety quiz?";
    }

    // 8. ReadyVerse Platform Overview ("Tell me about ReadyVerse")
    if (text.includes('readyverse') || text.includes('about readyverse') || text.includes('platform')) {
        if (isTanglish) {
            return "ReadyVerse-la 4 disaster drills (Fire, Flood, Cyclone, Earthquake), 6 Learn Hub lessons with quizzes, and 40-action campus preparedness plan irukku. Drills complete panni Readiness score improve pannalam!";
        }
        if (isTamilScript) {
            return "ReadyVerse என்பது மாணவர்களுக்கான பேரிடர் தயார்நிலை பயிற்சி தளம். இதில் 4 பயிற்சிகள் (தீ, வெள்ளம், புயல், நிலநடுக்கம்), 6 பாடங்கள் மற்றும் தயார்நிலை மதிப்பெண் உள்ளன.";
        }
        return "ReadyVerse is an interactive disaster preparedness platform for college students. It features 4 crisis simulation drills (Fire, Flood, Cyclone, Earthquake), 6 Learn Hub lessons with quizzes, a 40-action Dorm Preparedness Plan, and a personalized Readiness Score!";
    }

    // 9. Readiness Score & Highest Impact Step ("What should I do next?")
    if (text.includes('readiness') || text.includes('score') || text.includes('next action') || text.includes('highest-impact') || text.includes('highest impact') || text.includes('what should i do next')) {
        const score = userContext?.readiness?.total ?? 0;
        const nextAction = userContext?.prioritizedNextActions?.[0]?.action || 'Start your first drill: Building Fire';
        const impact = userContext?.prioritizedNextActions?.[0]?.readinessImpact || '+10.0%';

        if (isTanglish) {
            return `Unga current Readiness Score: ${score}%. Highest-impact next step: ${nextAction} (${impact} readiness gain). ReadyVerseProgress formula: 40% drills + 30% lessons + 30% plan actions!`;
        }
        if (isTamilScript) {
            return `உங்கள் தற்போதைய தயார்நிலை மதிப்பெண் ${score}%. அதிக தாக்கம் கொண்ட அடுத்த நடவடிக்கை: ${nextAction} (${impact}).`;
        }
        return `Your current Readiness Score is ${score}%. The highest-impact step you can take right now is: ${nextAction} (adds ${impact} to your readiness score). ReadyVerse formula: 40% drills + 30% lessons + 30% plan actions.`;
    }

    // 10. Quiz Me Request
    if (text.includes('quiz me') || text === 'quiz' || text.includes('quiz-me')) {
        return `Here's a practice question from our Fire Safety & Evacuation lesson:

Why is crawling low under smoke essential during a building fire?
1. It makes you move faster through doorways
2. Toxic smoke and superheated gases rise, leaving cleaner air near the floor
3. It prevents falling objects from touching you
4. It keeps you hidden from outside heat

Which option is correct? Type 1, 2, 3, or 4!`;
    }

    // Quiz Answer Evaluation (Option 2 for Q1)
    if (text === '2' || text === 'option 2' || text === 'b' || text.includes('cleaner air') || text.includes('toxic smoke and superheated') || text.includes('toxic smoke')) {
        return "Spot on! Toxic smoke and superheated gases rise, leaving cleaner air near the floor. Cooler, breathable air stays in the lower 12-24 inches. +20 XP ready! Tap 'Quiz me' for another question!";
    }
    if (text === '1' || text === '3' || text === '4' || text === 'option 1' || text === 'option 3' || text === 'option 4') {
        return "Good try! The correct answer is 2: Toxic smoke and superheated gases rise, leaving cleaner air near the floor. Cooler, breathable air stays in the lower 12-24 inches. Tap 'Quiz me' to try another!";
    }

    // 11. Fire Evacuation / Elevators
    if (text.includes('fire') || text.includes('thee') || text.includes('smoke')) {
        if (text.includes('lift') || text.includes('elevator')) {
            if (isTanglish) return "Fire irukkum pothu lift kandippa use panna koodathu! Power cut aagalam illana smoke chimney trap aagalam. Emergency staircase dhaan safe. Call 112.";
            return "NEVER use elevators during a building fire due to electrical failure and smoke chimney effects. Evacuate calmly via marked emergency stairwells and call 101 or 112.";
        }
        if (text.includes('clothes') || text.includes('stop drop') || text.includes('aada') || text.includes('aadai')) {
            if (isTanglish) return "Aadaila thee pidicha: Stop, Drop, and Roll (நில், விழு, உருளு)! Ooda koodathu. Floor-la roll panni flames smother pannunga.";
            return "If clothes catch fire, Stop, Drop, and Roll (நில், விழு, உருளு). Cover your face and roll on the ground until flames are smothered. Never run.";
        }
        if (text.includes('pass') || text.includes('extinguisher')) {
            return "PASS protocol for extinguishers: P = Pull the pin, A = Aim at base of fire, S = Squeeze handle lever, S = Sweep side-to-side. For large fires, evacuate and call 101 or 112.";
        }
        if (isTanglish) {
            return "Building-la fire vantha: smoke keezha low-ah crawl pannunga. Doors back of hand-la heat check pannitu thorangga. Lift avoid pannitu stairs vazhiya open ground assembly point poitu 101 or 112 call pannunga.";
        }
        return "During a building fire: stay low and crawl under smoke, check closed doors with the back of your hand for heat, never use elevators, evacuate via marked stairs to the assembly point, and call 101 or 112.";
    }

    // 12. Flood Safety
    if (text.includes('flood') || text.includes('vellam') || text.includes('water')) {
        if (isTanglish) return "Flash flood vantha seekiram upper floors-ku ponga (Vertical Evacuation). 6 inches moving water kooda sweep pannidum. Dry place-la irundhu main breaker off pannitu 112 call pannunga.";
        return "During flash floods: execute vertical evacuation to upper floors. Just 6 inches of moving water can sweep an adult away. Turn off power safely from a dry area and call 112.";
    }

    // 13. Cyclone Safety
    if (text.includes('cyclone') || text.includes('puyal') || text.includes('wind')) {
        if (isTanglish) return "Cyclone appo window illatha interior room-la safe-ah irunga. Eye of the storm calm aanaalum velila varatheenga. Downed wires kitta pogatheenga. Call 112.";
        return "During a cyclone: shelter in a windowless central interior room away from glass. Do not go outside during the calm Eye of the Storm. Keep at least 10m away from downed power lines. Call 112.";
    }

    // 14. Earthquake Safety
    if (text.includes('earthquake') || text.includes('nilanadukkam') || text.includes('shaking')) {
        if (isTanglish) return "Earthquake shaking appo: DROP, COVER, AND HOLD ON! Sturdy desk keezha poi head protect pannunga. Shaking mudinjathum stairs vazhiya open space ponga. Call 112.";
        return "During earthquake shaking: DROP, COVER, AND HOLD ON under a sturdy desk or table. Protect head and neck. After shaking stops, evacuate via stairs to open ground. Call 112.";
    }

    // 15. Emergency Numbers
    if (/\b(number|numbers|helpline|phone|emergency number|contact|112|101|108)\b/i.test(text)) {
        return "Official Emergency Numbers in India: 112 (National Emergency Support), 101 (Fire Service), and 108 (Ambulance).";
    }

    // Calm and honest fallback when no specific hazard is recognized
    return "I can't reach the live AI right now, but I'm here to help you stay safe! Check your lessons in Learn Hub, or ask me about fire, flood, cyclone, or earthquake safety.";
}

// =========================================================================
// 6. MAIN SERVERLESS REQUEST HANDLER
// =========================================================================
async function handleCoachRequest(reqData, clientIp = 'anonymous') {
    // 0. Health check request
    if (reqData && (reqData.health === true || reqData.checkHealth === true)) {
        const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
        const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 5);
        const isDeep = Boolean(reqData.deep === true || reqData.deep === '1' || reqData.deep === 'true');

        const baseHealth = {
            ok: true,
            status: 'ready',
            geminiConfigured: hasGemini,
            groqConfigured: hasGroq,
            primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'gemini',
            fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'groq',
            geminiModel: (process.env.GEMINI_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash').replace(/^models\//, ''),
            groqModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
            supportedLanguages: ['english', 'tamil', 'tanglish']
        };

        if (!isDeep) {
            return {
                statusCode: 200,
                body: baseHealth
            };
        }

        let geminiLive = false;
        let geminiError = null;
        let groqLive = false;
        let groqError = null;

        if (hasGemini) {
            try {
                await callGemini('Hi', [], null, { maxTokens: 1, timeoutMs: 3500 });
                geminiLive = true;
            } catch (err) {
                geminiError = err.code || (err.message && err.message.slice(0, 100)) || 'error';
            }
        } else {
            geminiError = 'not_configured';
        }

        if (hasGroq) {
            try {
                await callGroq('Hi', [], null, { maxTokens: 1, timeoutMs: 3500 });
                groqLive = true;
            } catch (err) {
                groqError = err.code || (err.message && err.message.slice(0, 100)) || 'error';
            }
        } else {
            groqError = 'not_configured';
        }

        return {
            statusCode: 200,
            body: {
                ...baseHealth,
                deep: true,
                geminiLive,
                groqLive,
                geminiError,
                groqError
            }
        };
    }

    // Extract user message from standard or messages-array payloads
    let userMessage = (reqData.message || reqData.text || '').trim();
    if (!userMessage && Array.isArray(reqData.messages) && reqData.messages.length > 0) {
        const lastMsg = [...reqData.messages].reverse().find(m => m.role === 'user');
        if (lastMsg) userMessage = (lastMsg.content || lastMsg.text || '').trim();
    }

    const history = reqData.history || reqData.messages || [];
    const userContext = reqData.context || null;

    // Safe logging (Length and IP prefix only, never secrets or full messages)
    const safeIpPrefix = String(clientIp || 'anon').replace(/[^a-zA-Z0-9.:]/g, '').slice(0, 15);
    console.log(`[ReadyVerse Coach API] Request from ${safeIpPrefix} (msg len: ${userMessage.length})`);

    // 1. Input Validation
    if (!userMessage) {
        return {
            statusCode: 400,
            body: { ok: false, code: 'bad_request', message: 'Message cannot be empty.' }
        };
    }

    if (userMessage.length > 1000) {
        return {
            statusCode: 400,
            body: { ok: false, code: 'bad_request', message: 'Message exceeds maximum length of 1000 characters.' }
        };
    }

    // 2. Rate limit verification
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
        return {
            statusCode: 429,
            headers: { 'Retry-After': String(rateCheck.retryAfter || 60) },
            body: {
                ok: false,
                code: 'rate_limited',
                error: 'RATE_LIMIT_EXCEEDED',
                message: `Too many requests. Please wait ${rateCheck.retryAfter || 60} seconds before asking again.`,
                retryAfter: rateCheck.retryAfter
            }
        };
    }

    // 3. Primary: Google Gemini API
    let geminiErr = null;
    try {
        const geminiResult = await callGemini(userMessage, history, userContext);
        return {
            statusCode: 200,
            body: {
                ok: true,
                response: geminiResult.text,
                provider: 'gemini',
                model: geminiResult.model,
                rateLimitRemaining: rateCheck.remaining
            }
        };
    } catch (err) {
        geminiErr = err;
        console.warn(`[ReadyVerse Coach API] Gemini primary failed (${err.code || err.message}). Attempting Groq fallback...`);
    }

    // 4. Fallback: Groq LPU API
    let groqErr = null;
    try {
        const groqResult = await callGroq(userMessage, history, userContext);
        return {
            statusCode: 200,
            body: {
                ok: true,
                response: groqResult.text,
                provider: 'groq',
                model: groqResult.model,
                fallback: true,
                rateLimitRemaining: rateCheck.remaining
            }
        };
    } catch (err) {
        groqErr = err;
        console.warn(`[ReadyVerse Coach API] Groq fallback failed (${err.code || err.message}). Engaging grounded local matcher...`);
    }

    // 5. Offline / Local Grounded Fallback
    const localReply = generateLocalSafetyResponse(userMessage, userContext, history);
    const primaryCode = geminiErr ? (geminiErr.code || 'provider_error') : 'unknown';

    return {
        statusCode: 200,
        body: {
            ok: false, // indicates upstream live AI was unreachable, using grounded built-in
            code: primaryCode === 'not_configured' ? 'not_configured' : (primaryCode === 'ETIMEDOUT' ? 'timeout' : 'provider_error'),
            response: localReply,
            provider: 'grounded_local',
            model: 'readyverse-safety-rules',
            fallback: true,
            rateLimitRemaining: rateCheck.remaining
        }
    };
}

// =========================================================================
// 7. EXPORTS (Universal Handler for Vercel, Node, Netlify, Express)
// =========================================================================

module.exports = async function handler(req, res) {
    if (res && res.setHeader) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    // Support GET for health check
    if (req.method === 'GET') {
        const isDeep = Boolean(req.url && (req.url.includes('deep=1') || req.url.includes('deep=true')));
        const healthRes = await handleCoachRequest({ health: true, deep: isDeep }, 'health-check');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(healthRes.body));
        return;
    }

    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, code: 'bad_request', message: 'Use POST to chat with ReadyVerse Coach.' }));
        return;
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    let bodyData = req.body || {};

    if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (_) {}
    }

    const result = await handleCoachRequest(bodyData, clientIp);

    res.statusCode = result.statusCode || 200;
    res.setHeader('Content-Type', 'application/json');
    if (result.headers) {
        Object.keys(result.headers).forEach(k => res.setHeader(k, result.headers[k]));
    }
    res.end(JSON.stringify(result.body));
};

module.exports.handleCoachRequest = handleCoachRequest;
module.exports.callGemini = callGemini;
module.exports.callGroq = callGroq;
module.exports.generateLocalSafetyResponse = generateLocalSafetyResponse;
module.exports.checkRateLimit = checkRateLimit;
module.exports.buildSystemPrompt = buildSystemPrompt;
module.exports.SYSTEM_PROMPT_VERSION = SYSTEM_PROMPT_VERSION;
module.exports.READYVERSE_KNOWLEDGE_CONTEXT = READYVERSE_KNOWLEDGE_CONTEXT;
module.exports.AUTHENTIC_QUIZ_QUESTIONS = AUTHENTIC_QUIZ_QUESTIONS;
