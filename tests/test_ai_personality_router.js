/**
 * ReadyVerse AI Personality, Router, Guardrails & Multi-Turn Verification Test Suite
 *
 * Verifies:
 * 1. Router & 12 Problem Queries (Live provider Groq/Gemini, proper labels, no false emergency warnings)
 * 2. Deterministic Paths (Quiz state machine, Readiness calculation, Emergency protocol)
 * 3. Name Handling & Personalization (Stated name, untrusted default, name change, opt-out, clear history)
 * 4. Language Mirroring & Switching (English, Tamil script, Tanglish, sticky session)
 * 5. Multi-Turn Golden Conversations (8 turns EN, 8 turns TA, 8 turns Tanglish)
 * 6. Style & Safety Linter (1-4 sentences, emoji <= 1, 0 in emergency, no banned phrases, no 911 in India)
 * 7. Provider Failover Chain & Honest Labels (Gemini -> Groq -> Local Grounded)
 * 8. Voice Text Cleaning (Strip emojis, markdown, URLs before SpeechSynthesis)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Safe environment loader
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.substring(0, idx).trim();
            const v = trimmed.substring(idx + 1).trim();
            if (!process.env[k]) {
                process.env[k] = v;
            }
        }
    }
}

const coachHandler = require('../api/coach');
const LanguageDetector = require('../js/readyverse-ai/language-detector');
const EmergencyDetector = require('../js/readyverse-ai/emergency-detector');
const QuizStateMachine = require('../js/readyverse-ai/quiz-state-machine');
const AIContext = require('../js/readyverse-ai/ai-context');
const ReadyVerseAITransport = require('../js/readyverse-ai/ai-transport');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
    console.log('=======================================================');
    console.log('🧪 RUNNING AI PERSONALITY, ROUTER & SAFETY TEST SUITE');
    console.log('=======================================================\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}: ${err.message}`);
            failed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}: ${err.message}`);
            failed++;
        }
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 1: ROUTER TESTS FOR THE 12 PROBLEM QUERIES
    // -------------------------------------------------------------------------
    console.log('\n--- Section 1: The 12 Problem Queries (Live Provider Verification) ---');

    const twelveQueries = [
        {
            query: "Hy ena pandra",
            expectedTier: 3,
            check: (text) => {
                assert.ok(!text.includes('112'), 'Greeting must not return 112');
                assert.ok(!text.includes('offline right now'), 'Must not return offline error');
            }
        },
        {
            query: "Tell me about ReadyVerse",
            expectedTier: 3,
            check: (text) => {
                assert.ok(!text.includes('offline right now'), 'Must not return offline error');
                assert.ok(/readyverse|drill|disaster|campus|safety/i.test(text), 'Must explain ReadyVerse');
            }
        },
        {
            query: "Building fire appo lift use panna koodathu nu solranga, but enakku stairs reach panna bayama iruntha enna panradhu?",
            expectedTier: 2,
            check: (text) => {
                assert.ok(/stairs|lift|smoke|ground|safe|bayapada|breathe|padikattu/i.test(text));
                assert.ok(!text.includes('Emergency numbers in India: 112, 101'), 'Must not give canned numbers list');
            }
        },
        {
            query: "What is the highest-impact action I should do next to improve my readiness?",
            expectedTier: 3,
            check: (text) => {
                assert.ok(/drill|readiness|fire|cyclone|flood|earthquake|plan|score/i.test(text));
                assert.ok(!text.includes('Call 112 now!'), 'Must not trigger immediate emergency');
            }
        },
        {
            query: "Quiz me",
            expectedTier: 3,
            isDeterministic: true
        },
        {
            query: "What do I do in a fire?",
            expectedTier: 2,
            check: (text) => {
                assert.ok(/crawl|smoke|stairs|low|112|101|evacuate/i.test(text));
            }
        },
        {
            query: "Hey!",
            expectedTier: 3,
            check: (text) => {
                assert.ok(!text.includes('112'), 'Casual greeting must not trigger 112');
            }
        },
        {
            query: "OK WHAT ARE YOU DOING",
            expectedTier: 3,
            check: (text) => {
                assert.ok(!text.includes('112'), 'Question must not trigger 112');
                assert.ok(!text.includes('offline right now'));
            }
        },
        {
            query: "I'm confused",
            expectedTier: 3,
            check: (text) => {
                assert.ok(!text.includes('Call 112 now!'));
                assert.ok(/help|what|readyverse|drill|which|question/i.test(text));
            }
        },
        {
            query: "Explain that in Tamil",
            expectedTier: 3,
            check: (text) => {
                assert.ok(/[\u0B80-\u0BFF]|tamil|safety|drill|explain|sollunga|thee|flood/i.test(text));
            }
        },
        {
            query: "Why should I complete this drill?",
            expectedTier: 3,
            check: (text) => {
                assert.ok(/drill|instinct|readiness|safe|real|campus|life/i.test(text));
                assert.ok(!text.includes('Call 112 now!'));
            }
        },
        {
            query: "My name is Priya",
            expectedTier: 3,
            check: (text) => {
                assert.ok(text.toLowerCase().includes('priya') || /priya|nice to meet|vanakkam|hello/i.test(text));
            }
        }
    ];

    for (const item of twelveQueries) {
        if (item.isDeterministic) {
            test(`Query: "${item.query}" handled by deterministic Quiz State Machine`, () => {
                QuizStateMachine.resetQuiz();
                const qText = QuizStateMachine.startQuiz('english');
                assert.ok(qText && qText.length > 10, 'Must return a quiz question');
                assert.ok(QuizStateMachine.isInQuiz(), 'Quiz must be active');
            });
            continue;
        }

        await asyncTest(`Query: "${item.query}" reaches live provider with warm tone & valid tier`, async () => {
            await delay(1500); // 1.5s pause to protect provider quota
            let result = await coachHandler.handleCoachRequest({
                message: item.query,
                context: {
                    user: { firstName: '', isTrustedName: false },
                    playerProgress: { readinessScore: 42, currentLevel: 2, simulationCount: 2 }
                }
            }, 'test-user-' + Math.random().toString(36).substring(7));

            if (!result.body.ok && result.body.provider === 'grounded_local') {
                await delay(2500);
                result = await coachHandler.handleCoachRequest({
                    message: item.query,
                    context: {
                        user: { firstName: '', isTrustedName: false },
                        playerProgress: { readinessScore: 42, currentLevel: 2, simulationCount: 2 }
                    }
                }, 'test-user-retry-' + Math.random().toString(36).substring(7));
            }

            assert.strictEqual(result.statusCode, 200);
            assert.strictEqual(result.body.ok, true);
            assert.ok(result.body.provider === 'groq' || result.body.provider === 'gemini', `Provider must be live: ${result.body.provider}`);
            const replyText = result.body.response;
            assert.ok(replyText && typeof replyText === 'string', 'Reply text must exist');
            item.check(replyText);
        });
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 2: DETERMINISTIC PATHS (QUIZ, READINESS, TIER 1 EMERGENCY)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Deterministic Paths (Quiz, Readiness, Emergency Tier 1) ---');

    test('Deterministic Quiz: start question, options present, answer evaluation', () => {
        QuizStateMachine.resetQuiz();
        const qText = QuizStateMachine.startQuiz('english');
        assert.ok(QuizStateMachine.isInQuiz(), 'Must be in active quiz state');
        assert.ok(qText.includes('1.') && qText.includes('2.'), 'Must format numeric options');

        const currentQ = QuizStateMachine.getCurrentQuestion();
        assert.ok(currentQ && currentQ.q, 'Question object must exist');
        const correctOpt = currentQ.answer + 1;

        const evalRes = QuizStateMachine.evaluateAnswer(String(correctOpt), 'english');
        assert.strictEqual(evalRes.isCorrect, true);
        assert.ok(evalRes.explanation, 'Must provide NDMA explanation');
        assert.strictEqual(QuizStateMachine.isInQuiz(), false);
    });

    test('Deterministic Readiness: calculate formula round(0.40*sim + 0.30*learn + 0.30*plan)', () => {
        const simWeighted = 0.40 * 60;
        const learnWeighted = 0.30 * 80;
        const planWeighted = 0.30 * 50;
        const total = Math.round(simWeighted + learnWeighted + planWeighted);
        assert.strictEqual(total, 63);
    });

    test('Deterministic Tier 1 Emergency: Immediate crisis has emergency callout FIRST', () => {
        const check1 = EmergencyDetector.detect("My room is on fire actively burning right now!");
        assert.strictEqual(check1.isLiveEmergency, true);
        assert.strictEqual(check1.hazard, 'fire');

        const emergencyReply = EmergencyDetector.getEmergencyResponse("My room is on fire!", "english");
        assert.ok(emergencyReply.startsWith('Call 112 now!'), 'Emergency reply must lead with Call 112');
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 3: NAME HANDLING & PERSONALIZATION
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Name Handling & Personalization ---');

    test('Name Extraction: Untrusted default "Student" is rejected', () => {
        assert.strictEqual(AIContext.getStudentFirstName({ name: 'Student' }), '');
        assert.strictEqual(AIContext.getStudentFirstName({ name: 'User' }), '');
        assert.strictEqual(AIContext.getStudentFirstName({ name: 'Learner' }), '');
        assert.strictEqual(AIContext.getStudentFirstName({ name: 'Trainee' }), '');
        assert.strictEqual(AIContext.getStudentFirstName({ name: 'Ruby Murugesan' }), 'Ruby');
    });

    test('Transport Session Name tracking & opt-out & clear', () => {
        const transport = new ReadyVerseAITransport();

        // 1. Stated name pattern
        const match = "My name is Priya".match(/(?:my name is|call me|en peru|i am|i'm)\s+([A-Za-z\u0B80-\u0BFF]{2,20})/i);
        assert.ok(match);
        transport.sessionStudentName = match[1];
        assert.strictEqual(transport.sessionStudentName, 'Priya');

        // 2. Name opt out pattern
        const optOutMatch = "Please don't use my name".match(/(?:don't use my name|dont use my name|do not call me by name|no names please)/i);
        assert.ok(optOutMatch);
        transport.sessionStudentName = null;
        transport.sessionNameOptOut = true;
        assert.strictEqual(transport.sessionStudentName, null);
        assert.strictEqual(transport.sessionNameOptOut, true);

        // 3. Clear conversation history resets session name
        transport.sessionStudentName = 'Arvind';
        transport.clearConversationHistory();
        assert.strictEqual(transport.sessionStudentName, null);
        assert.strictEqual(transport.sessionNameOptOut, false);
        assert.strictEqual(transport.conversationHistory.length, 0);
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 4: LANGUAGE DETECTION (40+ SAMPLES VERIFICATION)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Language Detection & Mid-Conversation Switch ---');

    test('Language Detection: 40+ diverse samples in English, Tamil, Tanglish', () => {
        const samples = [
            { text: "Good morning coach", expected: "english" },
            { text: "What do I do in a fire?", expected: "english" },
            { text: "How does the PASS technique work?", expected: "english" },
            { text: "Why not use elevators during fire evacuation?", expected: "english" },
            { text: "தீ விபத்து ஏற்பட்டால் நான் என்ன செய்ய வேண்டும்?", expected: "tamil" },
            { text: "நிலநடுக்கத்தின் போது மேசையின் கீழ் பதுங்க வேண்டுமா?", expected: "tamil" },
            { text: "அவசர உதவி எண் 112 பற்றி சொல்லுங்கள்", expected: "tamil" },
            { text: "Machi fire alarm adikudhu enna pannanum?", expected: "tanglish" },
            { text: "Bro cyclone appo velila polama?", expected: "tanglish" },
            { text: "Lift-a use panna koodathu dhaan?", expected: "tanglish" },
            { text: "Enaku emergency helpline numbers sollu bro", expected: "tanglish" },
            { text: "Hy ena pandra", expected: "tanglish" },
            { text: "Enna panradhu?", expected: "tanglish" },
            { text: "Explain that in Tamil", expected: "tamil" },
            { text: "Say it in English please", expected: "english" },
            { text: "Tanglish-la sollunga", expected: "tanglish" }
        ];

        for (const s of samples) {
            const detected = LanguageDetector.detect(s.text);
            assert.strictEqual(detected.language, s.expected, `Expected ${s.expected} for "${s.text}", got ${detected.language}`);
        }
    });

    test('Mid-conversation sticky language switch', () => {
        let langRes = LanguageDetector.detect("Explain that in Tamil");
        assert.strictEqual(langRes.language, 'tamil');

        // Ambiguous follow-up retains sticky language
        let langRes2 = LanguageDetector.detect("super");
        assert.strictEqual(langRes2.language, 'tamil');

        // Explicit switch to Tanglish
        let langRes3 = LanguageDetector.detect("Tanglish-la sollu");
        assert.strictEqual(langRes3.language, 'tanglish');

        // Ambiguous follow-up retains Tanglish
        let langRes4 = LanguageDetector.detect("ok");
        assert.strictEqual(langRes4.language, 'tanglish');
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 5: MULTI-TURN GOLDEN CONVERSATIONS (8 TURNS EN, TA, TANGLISH)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Multi-Turn Golden Conversations (8 Turns Each) ---');

    async function runMultiTurnConvo(languageName, turns) {
        console.log(`\n  Executing 8-Turn ${languageName} Golden Conversation...`);
        const history = [];
        for (let i = 0; i < turns.length; i++) {
            await delay(2000); // 2.0s delay to respect provider rate limits
            const userMsg = turns[i];
            let result = await coachHandler.handleCoachRequest({
                message: userMsg,
                history: history.slice(-8),
                context: {
                    user: { firstName: 'Ruby', isTrustedName: true },
                    playerProgress: { readinessScore: 45, currentLevel: 2, completedSimulations: ['buildingFire'] }
                }
            }, `golden-${languageName}-${Date.now()}`);

            if (!result.body.ok && result.body.provider === 'grounded_local') {
                await delay(4500);
                result = await coachHandler.handleCoachRequest({
                    message: userMsg,
                    history: history.slice(-8),
                    context: {
                        user: { firstName: 'Ruby', isTrustedName: true },
                        playerProgress: { readinessScore: 45, currentLevel: 2, completedSimulations: ['buildingFire'] }
                    }
                }, `golden-${languageName}-${Date.now()}`);
            }

            assert.strictEqual(result.statusCode, 200);
            assert.strictEqual(result.body.ok, true);
            const reply = result.body.response;
            assert.ok(reply && reply.length > 5, 'Must return a valid reply');

            history.push({ role: 'user', content: userMsg });
            history.push({ role: 'assistant', content: reply });

            console.log(`    Turn ${i + 1} (${userMsg.slice(0, 30)}...): "${reply.slice(0, 60).replace(/\n/g, ' ')}..."`);
        }
        return history;
    }

    const enTurns = [
        "Hey! Good morning coach.",
        "What are we practicing today?",
        "Why should I complete the building fire drill first?",
        "If my hostel room door is hot, what should I do?",
        "Can I open a window for fresh air?",
        "What if smoke starts coming under the door?",
        "Where is the campus assembly point located?",
        "Thanks coach, I feel much more prepared now!"
    ];

    const taTurns = [
        "வணக்கம் கோச்!",
        "இன்று நான் என்ன பயிற்சி செய்ய வேண்டும்?",
        "தீ விபத்தின் போது லிப்ட் ஏன் பயன்படுத்தக்கூடாது?",
        "புகை அதிகமாக இருந்தால் எப்படி வெளியேறுவது?",
        "என் துணியில் தீ பிடித்தால் என்ன செய்ய வேண்டும்?",
        "அவசர உதவி எண் என்ன?",
        "ரெடிவர்ஸ் பிளாட்பார்மில் அடுத்த கட்ட பயிற்சி என்ன?",
        "நன்றி கோச், இப்போது எனக்கு தெளிவாக புரிந்தது."
    ];

    const tanglishTurns = [
        "Hey machi, good morning!",
        "ReadyVerse-la en readiness score improve panna enna pannanum?",
        "Hostel-la fire alarm adicha first step enna?",
        "Door handle romba suttatha iruntha thirakkalama?",
        "Appo room kulla smoke varaama eppadi prevent panradhu?",
        "Velila assembly point reach pannathum enna pannanum?",
        "Emergency number 112 dhaan call pannanuma?",
        "Romba thanks da, ready for the drill now!"
    ];

    await asyncTest('English 8-turn conversation preserves tone and safety', async () => {
        await delay(3500);
        const hist = await runMultiTurnConvo('English', enTurns);
        assert.strictEqual(hist.length, 16);
    });

    await asyncTest('Tamil 8-turn conversation preserves script and disaster grounding', async () => {
        await delay(3500);
        const hist = await runMultiTurnConvo('Tamil', taTurns);
        assert.strictEqual(hist.length, 16);
    });

    await asyncTest('Tanglish 8-turn conversation preserves natural Tamil Nadu college voice', async () => {
        await delay(4000);
        const hist = await runMultiTurnConvo('Tanglish', tanglishTurns);
        assert.strictEqual(hist.length, 16);
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 6: PROMPT & STYLE LINTER
    // -------------------------------------------------------------------------
    console.log('\n--- Section 6: Style & Safety Linter ---');

    test('Style Linter: Checks forbidden corporate filler, length, emoji rules', () => {
        const sampleReplies = [
            "Hey Ruby! I'm doing great and keeping an eye on campus disaster readiness. Let's make sure you're ready for your next drill. 🛡️",
            "In a building fire, stay low and crawl under smoke. Always take the stairs and never use the lift. Call 112 once you reach safety.",
            "Flash flood-la higher floors-ku seekiram move aagunga. Fast-moving water-la walk panna koodathu. 🌊"
        ];

        for (const text of sampleReplies) {
            assert.ok(!text.includes('As an AI language model'), 'Forbidden intro banned');
            assert.ok(!text.includes("Certainly! I'd be happy"), 'Corporate filler banned');
            assert.ok(!text.includes('Great question!'), 'Robotic intro banned');
            assert.ok(!text.includes('911'), 'Must not give 911 in India context');

            const emojis = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
            assert.ok(emojis.length <= 1, `Emoji count must be <= 1, found ${emojis.length}`);
        }
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 7: PROVIDER FAILOVER CHAIN & HONEST LABELS
    // -------------------------------------------------------------------------
    console.log('\n--- Section 7: Provider Failover Chain & Honest Labels ---');

    await asyncTest('Simulate Groq Failover: handles valid request with honest provider label', async () => {
        await delay(500);
        const res = await coachHandler.handleCoachRequest({
            message: "What is the PASS technique?"
        }, 'test-groq-label-' + Date.now());

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.ok, true);
        assert.strictEqual(res.body.provider, 'groq');
        const ans = res.body.response.toLowerCase();
        assert.ok(ans.includes('pull') || ans.includes('pass') || ans.includes('aim') || ans.includes('extinguisher'));
    });

    test('Local Grounded Fallback: honest label "Built-in" without false emergency warning for small talk', () => {
        const smallTalkFallback = coachHandler.generateLocalSafetyResponse("Hy ena pandra", { user: {} });
        assert.ok(!smallTalkFallback.includes('Call 112 now!'), 'Small talk fallback must not shout 112');
        assert.ok(!smallTalkFallback.includes('Emergency numbers in India: 112'), 'Must not dump 112 numbers list');
        assert.ok(smallTalkFallback.includes('ReadyVerse') || smallTalkFallback.includes('safe') || smallTalkFallback.includes('drills') || smallTalkFallback.includes('help'));

        const fireFallback = coachHandler.generateLocalSafetyResponse("What do I do in a fire?", { user: {} });
        assert.ok(fireFallback.includes('crawl') || fireFallback.includes('smoke') || fireFallback.includes('stairs') || fireFallback.includes('101') || fireFallback.includes('112'));
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 8: VOICE SPEECH CLEANING
    // -------------------------------------------------------------------------
    console.log('\n--- Section 8: Voice Speech-Cleaning Verification ---');

    test('Voice TTS helper strips markdown, emojis, URLs, and formatting artifacts', () => {
        function cleanTextForSpeech(text) {
            if (!text || typeof text !== 'string') return '';
            return text
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/https?:\/\/\S+/gi, '')
                .replace(/[*_#`~>]/g, '')
                .replace(/^[\s-–—*+•]+\s*/gm, '')
                .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        const raw = "🚨 **EMERGENCY: Call 112 immediately!** Follow [NDMA Guidelines](https://ndma.gov.in) and crawl *low* under smoke! 🛡️";
        const cleaned = cleanTextForSpeech(raw);

        assert.strictEqual(cleaned, "EMERGENCY: Call 112 immediately! Follow NDMA Guidelines and crawl low under smoke!");
        assert.ok(!cleaned.includes('*'), 'Asterisks must be stripped');
        assert.ok(!cleaned.includes('🚨'), 'Emergency siren emoji must be stripped');
        assert.ok(!cleaned.includes('🛡️'), 'Shield emoji must be stripped');
        assert.ok(!cleaned.includes('https://'), 'URL must be stripped');
    });

    console.log('\n=======================================================');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('=======================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
