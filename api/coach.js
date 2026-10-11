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
OFFICIAL READYVERSE DISASTER PREPAREDNESS & PLATFORM KNOWLEDGE BASE:

1. READYVERSE PLATFORM SPECIFICATION (REAL CODE & UI ARCHITECTURE):
- Purpose: ReadyVerse is a student-focused disaster preparedness and crisis decision-training web platform. It is a training and simulation tool; it does not replace official government alerts or emergency dispatch.
- Official Standards: Safety content follows National Disaster Management Authority (NDMA), National Institute of Disaster Management (NIDM), and UNDRR guidelines.
- 4 Simulation Drills (interactive decision-tree crises):
  * Building Fire Evacuation: 8 stages (smoke alarm, crawling under smoke, checking door heat with back of hand, avoiding elevators, stair descent, PASS extinguisher, Stop Drop Roll, outdoor assembly).
  * Flash Flood Safety: 8 stages (vertical evacuation to upper floors, avoiding 6-inch swiftwater, electrical shutoff from dry area, communication, water hazards).
  * Cyclone Emergency & Tracking: 8 stages (securing loose items, interior room sheltering, staying inside during the calm Eye of the Storm, avoiding downed power lines).
  * Earthquake Response: 8 stages (Drop, Cover, and Hold On during active shaking, avoiding doorways and windows, evacuating via stairs after shaking stops, expecting aftershocks).
  * 60-Second Daily Drill: 3 rapid crisis decisions to maintain daily habit and earn +50 XP.
- 6 Learn Hub Modules (with interactive flashcards and 5-question quizzes):
  * Fire Safety & Evacuation
  * Flood Safety & Rising Waters
  * Cyclone Preparedness & Storm Tracking
  * Earthquake Safety & Seismic Protocol
  * Electrical Emergency
  * Medical Emergency & First Aid Essentials
- 40-Action Dorm & Campus Preparedness Plan:
  * Across 5 categories: Core Essentials (8), Building Fire (8), Flash Flood (8), Cyclone (8), Earthquake (8).
- Readiness Score Formula (Single Source of Truth in ReadyVerseProgress):
  Readiness = round(0.40 * simulationScore + 0.30 * learningScore + 0.30 * planScore)
  * simulationScore: Average of best accuracy percentage across 4 drills (fire, flood, cyclone, earthquake). Uncompleted drills count as 0%. Each unplayed drill adds up to +10.0% readiness!
  * learningScore: (modules passed / 6) * 100. Each passed module adds +5.0% readiness.
  * planScore: (completed actions / 40) * 100. Each verified plan action adds +0.75% readiness.
- Gamification & Ranks:
  * XP Rewards: Drills (+200 to +300 XP), Daily Drill (+50 XP), Lesson Quizzes (+100 XP), Plan Actions (+15 XP).
  * 11 Levels: L1-2 Rookie, L3-4 Aware, L5-7 Prepared, L8-10 Responder, L11+ Guardian.
  * Badges, Streaks, Offline PWA mode, light/dark themes, and Campus Mode.

2. BUILDING FIRE SAFETY & EVACUATION (NDMA / NBC 2016 Part 4):
- Alarms & Smoke: Smoke rises and creates a toxic thermal layer. Stay low and crawl under smoke where air is cleaner.
- Closed Doors: Check doors and doorknobs with the BACK of your hand for heat before opening. If hot, do NOT open; find an alternative exit.
- Evacuation: NEVER use elevators during a fire (risk of power failure or chimney smoke trap). Use marked emergency stairwells.
- PASS Extinguisher Protocol: P = Pull the pin, A = Aim nozzle at the base of the fire, S = Squeeze the handle lever, S = Sweep side-to-side.
- Clothes on Fire: Stop, Drop, and Roll (நில், விழு, உருளு). Cover your face with your hands and roll on the ground. Never run.
- After Exit: Assemble at the designated open-ground Assembly Point. Never re-enter a burning building for belongings.
- Emergency Helplines: Fire Service 101, National Emergency Number 112.

3. FLASH FLOOD PREPAREDNESS & SAFETY (NDMA Floods 2008):
- Immediate Action: Move immediately to higher ground or upper floors (Vertical Evacuation).
- Moving Water Hazards: 6 inches of rapidly moving water can sweep an adult off their feet; 12 inches can carry away a car. Never walk, swim, or drive through floodwater.
- Electrical Hazard: If floodwater enters, turn off main electrical breaker only if you can do so safely from a dry area. Never touch electrical equipment with wet hands or standing in water.
- Stranded Persons: Do not jump into swiftwater. Throw a rope, branch, or flotation device and call 112.
- Communication: Send short SMS to family to preserve phone battery and network bandwidth.
- All-Clear: Wait for official all-clear before returning; floodwater weakens foundations and creates hidden sinkholes.
- Emergency Helpline: 112.

4. CYCLONE EMERGENCY & TRACKING (NDMA Cyclones 2008 / IMD):
- Preparation: Secure loose outdoor items (sheet roofing, pots), store drinking water, emergency light/torch, batteries, and first-aid kit.
- Sheltering: Stay indoors in a central, windowless interior room or hallway on the lower floor. Keep away from glass windows and doors.
- Power Outage: Use battery-powered torches or lanterns. Never use open flame candles near drafts.
- Eye of the Storm: A sudden lull or calm during a cyclone is the 'eye' of the storm. DO NOT go outside; severe winds will suddenly resume from the opposite direction.
- Post-Cyclone: Keep at least 10 meters away from fallen electrical wires or poles. Report downed power lines to 112 / electricity board.
- Emergency Helpline: 112.

5. EARTHQUAKE RESPONSE (NDMA Earthquakes 2007 / UNDRR):
- During Shaking: DROP, COVER, AND HOLD ON (நில், விழு, பிடி). Drop to hands and knees, take cover under a sturdy desk/table, and hold onto it firmly while protecting head and neck.
- If No Desk: Crouch against an interior wall away from windows, tall furniture, and mirrors.
- Movement: DO NOT run outside or use elevators while the ground is actively shaking (falling debris/glass causes most injuries).
- After Shaking Stops: Evacuate calmly via stairs to an open outdoor space away from buildings, power lines, and trees.
- Gas / Fire: If you smell gas, do not operate electrical switches, matchsticks, or lighters. Evacuate immediately and report to 112.
- Aftershocks: Expect aftershocks. If shaking resumes outdoors, stay in the open and crouch.
- Emergency Helpline: 112.

6. ELECTRICAL SAFETY & FIRST AID ESSENTIALS (CEA 2010 / Red Cross / NDMA):
- Electrical Shock: Never touch a person who is in contact with a live electrical current. Shut off main power immediately or push them away using dry, non-conductive wood/plastic.
- Bleeding: Apply direct, continuous pressure on the wound with a clean cloth. Elevate if possible without aggravating fractures.
- Unconscious Breathing Victim: Place in Recovery Position (on their side) to keep airways clear.
- Critical Rule: NEVER give liquids, food, or medication to an unconscious or semi-conscious person.
- Medical Emergency Helpline: Ambulance 108, National Emergency Helpline 112.

7. OFFICIAL LESSON QUIZ QUESTIONS (AUTHENTIC BANK):
- Q1 (Fire): "Why is crawling low under smoke essential during a building fire?" Options: 1) It makes you move faster through doorways 2) Toxic smoke and superheated gases rise, leaving cleaner air near the floor 3) It prevents falling objects from touching you 4) It keeps you hidden from outside heat. [Correct: 2]
- Q2 (Fire): "What should you do before opening a closed door during an evacuation?" Options: 1) Kick the door open quickly 2) Feel the door handle and door surface with the back of your hand 3) Open the door slightly to peek inside 4) Knock loudly and wait for a response. [Correct: 2]
- Q3 (Fire): "What is the correct protocol if your clothing catches fire?" Options: 1) Run rapidly toward the nearest exit 2) Wave your arms to blow out the fire 3) Stop, Drop to the ground, and Roll to smother the flames 4) Look for a towel to fan the flames. [Correct: 3]
- Q4 (Flood): "How many inches of rapidly moving water are required to knock down an adult?" Options: 1) 2 inches 2) 6 inches 3) 18 inches 4) 24 inches. [Correct: 2]
- Q5 (Earthquake): "What is the internationally proven protocol during active earthquake shaking?" Options: 1) Stand under a doorway and shout 2) Drop, Cover, and Hold On 3) Run outside into the street immediately 4) Climb onto the roof of the building. [Correct: 2]
- Q6 (Cyclone): "What is the calm, low-pressure center of a cyclone called?" Options: 1) The Tail 2) The Eye of the Storm 3) The Wind Core 4) The Rain Shield. [Correct: 2]
`;

function buildSystemPrompt(userContext = null) {
    let contextStr = '';
    if (userContext && typeof userContext === 'object') {
        const r = userContext.readiness || {};
        const p = userContext.player || {};
        const next = userContext.prioritizedNextActions || [];
        contextStr = `
STUDENT LIVE PROGRESS CONTEXT (AUTHORITATIVE NUMBERS):
- Current Readiness Score: ${r.total !== undefined ? r.total : 0}%
- Breakdown: Simulation Drills: ${r.simulationScore || 0}% (weighted: ${r.breakdown?.simWeighted || 0}/40), Learn Hub: ${r.learningScore || 0}% (weighted: ${r.breakdown?.learnWeighted || 0}/30), Preparedness Plan: ${r.planScore || 0}% (weighted: ${r.breakdown?.planWeighted || 0}/30)
- Player Level: ${p.level || 1} (${p.levelTitle || 'Rookie'}) | Total XP: ${p.totalXP || 0} | Streak: ${p.dailyStreak || 0} days
- Completed Drills: ${p.drillsCompletedCount || 0} / 4 | Completed Lessons: ${p.lessonsPassedCount || 0} / 6 | Completed Plan Items: ${p.planActionsDoneCount || 0} / 40
- Highest-Impact Next Action: ${next[0]?.action || 'Start your first drill: Building Fire'} (${next[0]?.readinessImpact || '+10.0% readiness'})
`;
    }

    return `
You are the ReadyVerse AI Coach (Beta), a student-friendly disaster preparedness and life-safety tutor for college students.

TONE & PERSONALITY:
- Warm, collegiate, supportive, clear, and trustworthy (like a knowledgeable senior peer or campus safety lead).
- Natural and authentic, not robotic or bureaucratic.
- Brief light humour is fine only during casual greetings; stay calm, serious, and concise during emergencies; provide details only when asked.
- Concise: keep responses direct and under 100-120 words (2-4 sentences) unless the student explicitly asks for a step-by-step breakdown.

WHAT YOU ANSWER:
1. Casual greetings & chitchat ("Hi", "Hy ena pandra", "How are you", "வணக்கம்"): Greet warmly as the ReadyVerse coach, say what you're doing (helping students practice crisis instincts), and offer to practice a drill or quiz.
2. Platform questions ("Tell me about ReadyVerse", "ReadyVerse-la enna ellam irukku?"): Explain the 4 drills, 6 lessons, 40-action plan, and readiness score using the knowledge base.
3. Readiness questions ("Explain my readiness score", "What should I do next?"): Use the student's live numbers above. If they are at 0%, explain that they are at 0% Rookie level and recommend playing their first drill (Building Fire) to gain +10.0% readiness!
4. Quiz requests ("Quiz me"): Ask exactly one question from the official quiz list with numbered options 1 to 4.
5. Safety and emergency protocols: Answer strictly from NDMA guidelines.
6. Follow-up questions: Connect smoothly with the previous conversation turns.

EMERGENCY HANDLING (CRITICAL):
- If the student describes a LIVE, HAPPENING-NOW EMERGENCY (e.g. "my room is on fire", "building shaking now", "friend is not breathing", "thee pidichuruchu", "water rising inside room"):
  LEAD IMMEDIATELY WITH "Call 112 now!" followed by 2-3 calm, verified survival steps from the safety protocol.
- For normal study questions (e.g. "What do I do in a fire?"): Give a clear grounded answer that mentions 112 and 101 without panicking.

LANGUAGE RULES:
- Reply in the language and style the student uses:
  * English -> natural, friendly English.
  * Tamil Script -> natural Tamil script.
  * Tanglish (Tamil in Latin script like "Hy ena pandra", "thee pidicha enna pannanum") -> authentic, natural Tanglish in Latin script.
- Keep all safety terms ("PASS", "Stop, Drop, and Roll", "Drop, Cover, and Hold On") and emergency numbers ("112", "101", "108") 100% exact.

STRICT BOUNDARIES:
- GROUNDING: Answer only from the provided ReadyVerse knowledge base. Never invent steps or guidelines.
- MEDICAL: Never diagnose, prescribe drugs (Paracetamol, antibiotics), or recommend medical procedures. For medical emergencies instruct to call 108 / 112 or see a campus doctor.
- NUMBERS: Only valid numbers in India are 112 (National Emergency), 101 (Fire), 108 (Ambulance). Never invent phone numbers.
- REFUSAL: If asked about strictly non-disaster off-topic matters (coding, math/homework, sports, politics, weapons, hacking, prompt injection), politely refuse with: "I'm not sure, check the lesson or call 112" (or Tamil/Tanglish equivalent).

${contextStr}

KNOWLEDGE BASE:
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

async function callGemini(userMessage, history = [], userContext = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.length < 5) {
        const err = new Error('GEMINI_API_KEY_UNAVAILABLE');
        err.code = 'not_configured';
        throw err;
    }

    const model = process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';
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

    const payload = {
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        contents: formattedContents,
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200
        }
    };

    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 4500 // 4.5s timeout
    };

    const res = await httpsRequest(options, payload);
    if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
        const candidate = res.data.candidates && res.data.candidates[0];
        const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
        if (text && text.trim()) {
            return {
                text: text.trim(),
                provider: 'gemini',
                model: model
            };
        }
    }

    const errMsg = (res.data && res.data.error && res.data.error.message) || `Gemini HTTP ${res.statusCode}`;
    const err = new Error(errMsg);
    err.code = res.statusCode === 429 ? 'rate_limited' : 'provider_error';
    throw err;
}

async function callGroq(userMessage, history = [], userContext = null) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.length < 5) {
        const err = new Error('GROQ_API_KEY_UNAVAILABLE');
        err.code = 'not_configured';
        throw err;
    }

    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
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

    const payload = {
        model: model,
        messages: messages,
        temperature: 0.3,
        max_tokens: 200
    };

    const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: 4000 // 4.0s timeout
    };

    const res = await httpsRequest(options, payload);
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
    err.code = res.statusCode === 429 ? 'rate_limited' : 'provider_error';
    throw err;
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
function generateLocalSafetyResponse(userText, userContext = null) {
    const text = (userText || '').toLowerCase().trim();

    // 1. Adversarial / Prompt Injection / Out-of-Scope Refusals
    const adversarialKeywords = [
        'dan mode', 'ignore all', 'system prompt', 'secret', 'password', 'hack',
        'tracheotomy', 'paracetamol', 'prescribe', 'dosage', 'pills', 'chest pain',
        'cricket', 'world cup', 'python', 'script', 'homework', 'calculus', 'nuclear asteroid',
        'bypass fire alarm', 'disable alarm', 'vip number', 'secret helpline', 'fever'
    ];

    if (adversarialKeywords.some(k => text.includes(k))) {
        if (text.includes('enaku') || text.includes('sollu') || text.includes('iruku') || text.includes('tanglish')) {
            return "I'm not sure, check the lesson or call 112. (மருத்துவ ஆலோசனைக்கு மருத்துவரை அணுகவும் அல்லது 108 / 112 எண்ணை அழைக்கவும்).";
        }
        return "I'm not sure, check the lesson or call 112";
    }

    // 2. Casual Chitchat & Greetings
    const isGreeting = /^(hi|hello|hey|vanakkam|hy|hlo)\b/i.test(text) || text.includes('ena pandra') || text.includes('enna pandra');
    const isTanglish = /\b(ena|enna|pandra|panra|panna|sollu|solren|machan|machi|bro|thambi|irukku|iruku|epdi|eppadi)\b/i.test(text);

    if (isGreeting) {
        if (isTanglish) {
            return "Hey machan! ReadyVerse emergency coach inga iruken. Crisis decisions practice panna ready-ah? Fire, flood, cyclone pathi kelunga, illana 'Quiz me' try pannunga!";
        }
        return "Hey there! I'm your ReadyVerse disaster preparedness coach. You can ask me about building fires, flood safety, cyclone tracking, or type 'Quiz me' to test your instincts!";
    }

    // 3. ReadyVerse Platform Overview
    if (text.includes('readyverse') || text.includes('about readyverse') || text.includes('platform')) {
        if (isTanglish) {
            return "ReadyVerse-la 4 disaster drills (Fire, Flood, Cyclone, Earthquake), 6 Learn Hub lessons with quizzes, and 40-action campus preparedness plan irukku bro. Drills complete panni Readiness score improve pannalam!";
        }
        return "ReadyVerse is an interactive disaster preparedness platform for college students. It features 4 crisis simulation drills (Fire, Flood, Cyclone, Earthquake), 6 Learn Hub lessons with quizzes, a 40-action Dorm Preparedness Plan, and a personalized Readiness Score!";
    }

    // 4. Readiness Score & Highest Impact Step
    if (text.includes('readiness') || text.includes('score') || text.includes('next action') || text.includes('highest-impact') || text.includes('highest impact')) {
        const score = userContext?.readiness?.total ?? 0;
        const nextAction = userContext?.prioritizedNextActions?.[0]?.action || 'Start your first drill: Building Fire';
        const impact = userContext?.prioritizedNextActions?.[0]?.readinessImpact || '+10.0%';

        if (isTanglish) {
            return `Unga current Readiness Score: ${score}%. Highest-impact next step: ${nextAction} (${impact} readiness gain). ReadyVerseProgress formula: 40% drills + 30% lessons + 30% plan actions!`;
        }
        return `Your current Readiness Score is ${score}%. The highest-impact step you can take right now is: ${nextAction} (adds ${impact} to your readiness score). ReadyVerse formula: 40% drills + 30% lessons + 30% plan actions.`;
    }

    // 5. Quiz Me Request
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


    // 6. Fire Evacuation / Elevators
    if (text.includes('fire') || text.includes('thee') || text.includes('smoke')) {
        if (text.includes('lift') || text.includes('elevator')) {
            if (isTanglish) return "Fire irukkum pothu lift kandippa use panna koodathu bro! Power cut aagalam illana smoke chimney trap aagalam. Emergency staircase dhaan safe.";
            return "NEVER use elevators during a building fire due to electrical failure and smoke chimney effects. Evacuate calmly via marked emergency stairwells and call 101 or 112.";
        }
        if (text.includes('clothes') || text.includes('stop drop') || text.includes('aada') || text.includes('aadai')) {
            if (isTanglish) return "Aadaila thee pidicha: Stop, Drop, and Roll (நில், விழு, உருளு) bro! Ooda koodathu. Floor-la roll panni flames smother pannunga.";
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

    // 7. Flood Safety
    if (text.includes('flood') || text.includes('vellam') || text.includes('water')) {
        if (isTanglish) return "Flash flood vantha seekiram upper floors-ku ponga (Vertical Evacuation). 6 inches moving water kooda sweep pannidum. Dry place-la irundhu main breaker off pannitu 112 call pannunga.";
        return "During flash floods: execute vertical evacuation to upper floors. Just 6 inches of moving water can sweep an adult away. Turn off power safely from a dry area and call 112.";
    }

    // 8. Cyclone Safety
    if (text.includes('cyclone') || text.includes('puyal') || text.includes('wind')) {
        if (isTanglish) return "Cyclone appo window illatha interior room-la safe-ah irunga. Eye of the storm calm aanaalum velila varatheenga. Downed wires kitta pogatheenga. Call 112.";
        return "During a cyclone: shelter in a windowless central interior room away from glass. Do not go outside during the calm Eye of the Storm. Keep at least 10m away from downed power lines. Call 112.";
    }

    // 9. Earthquake Safety
    if (text.includes('earthquake') || text.includes('nilanadukkam') || text.includes('shaking')) {
        if (isTanglish) return "Earthquake shaking appo: DROP, COVER, AND HOLD ON bro! Sturdy desk keezha poi head protect pannunga. Shaking mudinjathum stairs vazhiya open space ponga. Call 112.";
        return "During earthquake shaking: DROP, COVER, AND HOLD ON under a sturdy desk or table. Protect head and neck. After shaking stops, evacuate via stairs to open ground. Call 112.";
    }

    // 10. Emergency Numbers (Must match full words, not single letters like 'en'!)
    if (/\b(number|numbers|helpline|phone|emergency number|contact|112|101|108)\b/i.test(text)) {
        return "Official Emergency Numbers in India: 112 (National Emergency Support), 101 (Fire Service), and 108 (Ambulance).";
    }

    // Default safety guidance
    return "I'm not sure, check the lesson or call 112";
}

// =========================================================================
// 6. MAIN SERVERLESS REQUEST HANDLER
// =========================================================================
async function handleCoachRequest(reqData, clientIp = 'anonymous') {
    // 0. Health check request
    if (reqData && (reqData.health === true || reqData.checkHealth === true)) {
        const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5);
        const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 5);
        return {
            statusCode: 200,
            body: {
                ok: true,
                status: 'ready',
                geminiConfigured: hasGemini,
                groqConfigured: hasGroq,
                primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'gemini',
                fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'groq',
                supportedLanguages: ['english', 'tamil', 'tanglish']
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
    const localReply = generateLocalSafetyResponse(userMessage, userContext);
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
        const healthRes = await handleCoachRequest({ health: true }, 'health-check');
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
module.exports.generateLocalSafetyResponse = generateLocalSafetyResponse;
module.exports.checkRateLimit = checkRateLimit;
module.exports.buildSystemPrompt = buildSystemPrompt;
module.exports.READYVERSE_KNOWLEDGE_CONTEXT = READYVERSE_KNOWLEDGE_CONTEXT;
module.exports.AUTHENTIC_QUIZ_QUESTIONS = AUTHENTIC_QUIZ_QUESTIONS;
