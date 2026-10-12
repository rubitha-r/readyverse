/**
 * ReadyVerse AI — Provider Router & Failover Engine
 * Centralized pipeline managing /api/coach (Gemini Primary / Groq Fallback),
 * deterministic Quiz State Machine, Emergency Intent Detection,
 * Language Mirroring, and Grounded ReadyVerse Fallback.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            './language-detector',
            './emergency-detector',
            './quiz-state-machine',
            './ai-context',
            './ai-tools',
            './ai-personality',
            './providers/provider-base',
            './providers/gemini-live-provider',
            './providers/groq-provider',
            './providers/openai-provider'
        ], factory);
    } else if (typeof module === 'object' && module.exports) {
        const langDetector = require('./language-detector');
        const emergencyDetector = require('./emergency-detector');
        const quizStateMachine = require('./quiz-state-machine');
        const context = require('./ai-context');
        const tools = require('./ai-tools');
        const personality = require('./ai-personality');
        const ProviderBase = require('./providers/provider-base');
        const GeminiLiveProvider = require('./providers/gemini-live-provider');
        const GroqProvider = require('./providers/groq-provider');
        const OpenAIProvider = require('./providers/openai-provider');
        module.exports = factory(
            langDetector,
            emergencyDetector,
            quizStateMachine,
            context,
            tools,
            personality,
            ProviderBase,
            GeminiLiveProvider,
            GroqProvider,
            OpenAIProvider
        );
    } else {
        root.ReadyVerseAITransport = factory(
            root.ReadyVerseLanguageDetector,
            root.ReadyVerseEmergencyDetector,
            root.ReadyVerseQuizStateMachine,
            root.ReadyVerseAIContext,
            root.ReadyVerseAITools,
            root.ReadyVerseAIPersonality,
            root.ReadyVerseAIProvider,
            root.ReadyVerseGeminiLiveProvider,
            root.ReadyVerseGroqProvider,
            root.ReadyVerseOpenAIProvider
        );
    }
}(typeof self !== 'undefined' ? self : this, function (
    LanguageDetector,
    EmergencyDetector,
    QuizStateMachine,
    AIContext,
    AITools,
    AIPersonality,
    ReadyVerseAIProvider,
    GeminiLiveProvider,
    GroqProvider,
    OpenAIProvider
) {
    'use strict';

    class ReadyVerseAITransport {
        constructor(config = {}) {
            this.serverUrl = config.serverUrl || '';
            this.state = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | CONNECTED | LISTENING | THINKING | SPEAKING | TEXT_MODE | OFFLINE_READY | ERROR
            this.mode = 'text'; // 'voice' | 'text'
            this.config = config;

            // Router Architecture
            this.primaryProviderName = config.primaryProvider || 'gemini';
            this.fallbackProviderName = config.fallbackProvider || 'groq';
            this.activeProviderName = this.primaryProviderName;
            this.sessionMode = 'text';
            this.voiceActive = false;
            this.failoverCount = 0;
            this.availability = 'CLOUD_PRIMARY'; // CLOUD_PRIMARY | CLOUD_BACKUP | OFFLINE_READY
            this.isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

            this._onOnline = () => {
                this.isOnline = true;
                this.emitAvailability('CLOUD_PRIMARY');
            };
            this._onOffline = () => {
                this.isOnline = false;
                this.enterOfflineReady('Browser reports device is offline.');
            };

            if (typeof window !== 'undefined' && window.addEventListener) {
                window.addEventListener('online', this._onOnline);
                window.addEventListener('offline', this._onOffline);
            }

            this.conversationHistory = [];
            this.sessionLanguage = null;
            this.lastDetectedLanguage = 'english';
            this.sessionStudentName = null;
            this.sessionNameOptOut = false;
            this._inFlightRequests = new Map();

            this.listeners = {
                stateChange: [],
                transcript: [],
                toolCall: [],
                interrupted: [],
                failover: [],
                error: [],
                availability: []
            };

            this.providers = {};
            this.initProviders();
        }

        initProviders() {
            if (GeminiLiveProvider) {
                this.providers.gemini = new GeminiLiveProvider({
                    serverUrl: this.serverUrl,
                    model: this.config.geminiLiveModel || 'models/gemini-2.0-flash-exp',
                    voice: this.config.geminiVoice || 'Puck'
                });
            }

            if (GroqProvider) {
                this.providers.groq = new GroqProvider({
                    serverUrl: this.serverUrl,
                    model: this.config.groqModel || 'llama-3.1-8b-instant'
                });
            }

            if (OpenAIProvider) {
                this.providers.openai = new OpenAIProvider({
                    serverUrl: this.serverUrl,
                    model: this.config.openaiRealtimeModel || 'gpt-4o-realtime-preview',
                    voice: this.config.openaiVoice || 'alloy'
                });
            }

            this.activeProvider = this.providers[this.activeProviderName] || this.providers.gemini;
        }

        // Router Status Snapshot
        getRouterStatus() {
            return {
                primary: this.primaryProviderName,
                fallback: this.fallbackProviderName,
                activeProvider: this.activeProviderName,
                voiceActive: this.voiceActive,
                failoverCount: this.failoverCount,
                sessionMode: this.sessionMode,
                state: this.state,
                availability: this.availability,
                sessionLanguage: this.sessionLanguage
            };
        }

        setProvider(providerName) {
            if (!this.providers[providerName]) {
                console.warn(`[ReadyVerse AI Router] Provider '${providerName}' not found.`);
                return;
            }
            this.activeProviderName = providerName;
            this.activeProvider = this.providers[providerName];
            this.emit('stateChange', {
                state: this.state,
                mode: this.mode,
                provider: this.activeProviderName,
                routerStatus: this.getRouterStatus()
            });
        }

        on(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event].push(callback);
            }
        }

        off(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
            }
        }

        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => {
                    try { cb(data); } catch (e) { console.error('[ReadyVerse AI] Listener error:', e); }
                });
            }
        }

        setState(newState) {
            this.state = newState;
            this.emit('stateChange', {
                state: this.state,
                mode: this.mode,
                provider: this.activeProviderName,
                routerStatus: this.getRouterStatus()
            });
        }

        emitAvailability(avail, reason = '') {
            this.availability = avail;
            this.emit('availability', { availability: avail, reason });
        }

        enterOfflineReady(reason = '') {
            this.availability = 'OFFLINE_READY';
            this.emitAvailability('OFFLINE_READY', reason);
        }

        clearHistory() {
            this.conversationHistory = [];
            this.sessionLanguage = null;
            this.sessionStudentName = null;
            this.sessionNameOptOut = false;
            if (QuizStateMachine && typeof QuizStateMachine.resetQuiz === 'function') {
                QuizStateMachine.resetQuiz();
            }
        }

        clearConversationHistory() {
            this.clearHistory();
        }

        // =====================================================================
        // UNIFIED PIPELINE: sendToCoach(message, source)
        // All typed input, chips, and voice transcripts go through this single method.
        // =====================================================================
        async sendToCoach(message, source = 'typed') {
            if (!message || typeof message !== 'string') return null;
            const cleanText = message.trim();
            if (!cleanText) return null;

            // In-flight deduplication
            if (this._inFlightRequests.has(cleanText)) {
                return this._inFlightRequests.get(cleanText);
            }

            const requestPromise = this._executeSendToCoach(cleanText, source);
            this._inFlightRequests.set(cleanText, requestPromise);

            try {
                return await requestPromise;
            } finally {
                this._inFlightRequests.delete(cleanText);
            }
        }

        async _executeSendToCoach(cleanText, source) {
            // 1. Language Detection & Sticky Session Persistence
            let detectedLang = 'english';
            if (LanguageDetector && typeof LanguageDetector.detectLanguage === 'function') {
                const langRes = LanguageDetector.detectLanguage(cleanText, this.sessionLanguage);
                detectedLang = langRes.language;
                this.sessionLanguage = langRes.stickyLanguage;
            } else if (AIPersonality && typeof AIPersonality.detectLanguage === 'function') {
                detectedLang = AIPersonality.detectLanguage(cleanText);
            }
            this.lastDetectedLanguage = detectedLang;

            // 2. Immediate Life-Threatening Emergency Intent Check
            if (EmergencyDetector && typeof EmergencyDetector.isEmergency === 'function' && EmergencyDetector.isEmergency(cleanText)) {
                const emgReply = EmergencyDetector.getEmergencyResponse(cleanText, detectedLang);
                this.conversationHistory.push({ role: 'user', content: cleanText });
                this.conversationHistory.push({ role: 'assistant', content: emgReply });
                this.emit('transcript', {
                    speaker: 'assistant',
                    text: emgReply,
                    sourceTag: 'Built-in',
                    language: detectedLang,
                    isFinal: true
                });
                this.setState('TEXT_MODE');
                return emgReply;
            }

            // 3. Deterministic Quiz State Machine
            if (QuizStateMachine) {
                // Check if user requests a quiz
                if (typeof QuizStateMachine.isQuizIntent === 'function' && QuizStateMachine.isQuizIntent(cleanText)) {
                    const quizQuestion = QuizStateMachine.startQuiz(detectedLang);
                    this.conversationHistory.push({ role: 'user', content: cleanText });
                    this.conversationHistory.push({ role: 'assistant', content: quizQuestion });
                    this.emit('transcript', {
                        speaker: 'assistant',
                        text: quizQuestion,
                        sourceTag: 'Built-in',
                        language: detectedLang,
                        isFinal: true
                    });
                    this.setState('TEXT_MODE');
                    return quizQuestion;
                }

                // Check if user is actively in a quiz
                if (typeof QuizStateMachine.isInQuiz === 'function' && QuizStateMachine.isInQuiz()) {
                    const evalResult = QuizStateMachine.evaluateAnswer(cleanText, detectedLang);
                    if (evalResult && evalResult.handled) {
                        this.conversationHistory.push({ role: 'user', content: cleanText });
                        this.conversationHistory.push({ role: 'assistant', content: evalResult.response });
                        this.emit('transcript', {
                            speaker: 'assistant',
                            text: evalResult.response,
                            sourceTag: 'Built-in',
                            language: detectedLang,
                            isFinal: true
                        });
                        this.setState('TEXT_MODE');
                        return evalResult.response;
                    }
                }
            }

            // Check for name opt-out
            if (/\b(?:don'?t|do not|stop)\s+use\s+(?:my\s+)?name\b/i.test(cleanText)) {
                this.sessionNameOptOut = true;
                this.sessionStudentName = null;
            } else if (!this.sessionNameOptOut) {
                // Check for student name declaration
                const nameMatch = cleanText.match(/\b(?:my name is|call me|i am|i'm)\s+([A-Za-z]{2,20})\b/i) ||
                                  cleanText.match(/\b(?:en peru|en peyar)\s+([A-Za-z]{2,20})\b/i);
                if (nameMatch && nameMatch[1]) {
                    const candidate = nameMatch[1].trim();
                    const nonNames = ['confused', 'scared', 'ready', 'here', 'fine', 'good', 'asking', 'student', 'trainee', 'sorry', 'safe', 'okay'];
                    if (!nonNames.includes(candidate.toLowerCase())) {
                        this.sessionStudentName = candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
                    }
                }
            }

            // 4. Extract Real Live ReadyVerse Readiness & Context
            const coachContext = (AIContext && typeof AIContext.getCoachContext === 'function')
                ? AIContext.getCoachContext()
                : ((AIContext && typeof AIContext.getReadyVerseContext === 'function') ? AIContext.getReadyVerseContext() : {});

            if (this.sessionNameOptOut) {
                coachContext.studentName = null;
                if (coachContext.player) coachContext.player.studentName = null;
            } else if (this.sessionStudentName) {
                coachContext.studentName = this.sessionStudentName;
                if (coachContext.player) coachContext.player.studentName = this.sessionStudentName;
            }

            // 5. Offline Check
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                this.enterOfflineReady('Browser is offline');
                const offlineReply = this.generateGroundedFallback(cleanText, coachContext);
                this.conversationHistory.push({ role: 'user', content: cleanText });
                this.conversationHistory.push({ role: 'assistant', content: offlineReply });
                this.emit('transcript', {
                    speaker: 'assistant',
                    text: offlineReply,
                    sourceTag: 'Built-in',
                    language: detectedLang,
                    isFinal: true
                });
                this.setState('OFFLINE_READY');
                return offlineReply;
            }

            this.setState('THINKING');

            // 6. Network Dispatch to /api/coach
            let assistantReply = '';
            let sourceTag = 'Built-in';
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 9500) : null;

            try {
                const response = await fetch(`${this.serverUrl}/api/coach`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: cleanText,
                        history: this.conversationHistory.slice(-8),
                        context: coachContext,
                        source: source,
                        detectedLanguage: detectedLang
                    }),
                    signal: controller ? controller.signal : undefined
                });

                if (timeoutId) clearTimeout(timeoutId);

                if (response.status === 200) {
                    const data = await response.json();
                    if (data.ok === true) {
                        sourceTag = 'AI';
                        assistantReply = data.response;
                        this.emitAvailability(data.provider === 'groq' ? 'CLOUD_BACKUP' : 'CLOUD_PRIMARY');
                    } else {
                        // Grounded local fallback provided by serverless coach handler
                        sourceTag = 'Built-in';
                        assistantReply = data.response || this.generateGroundedFallback(cleanText, coachContext);
                        if (data.code === 'not_configured') {
                            this.emitAvailability('OFFLINE_READY', 'AI key not configured on server. Built-in safety rules active.');
                        }
                    }
                } else if (response.status === 429) {
                    const data = await response.json().catch(() => ({}));
                    sourceTag = 'Built-in';
                    assistantReply = data.message || 'Too many requests. Please wait a few moments before asking again.';
                    this.emit('error', { code: 'rate_limited', message: assistantReply });
                } else if (response.status === 400) {
                    const data = await response.json().catch(() => ({}));
                    sourceTag = 'Built-in';
                    assistantReply = data.message || 'Please enter a valid disaster safety question.';
                    this.emit('error', { code: 'bad_request', message: assistantReply });
                } else {
                    throw new Error(`Server returned HTTP ${response.status}`);
                }
            } catch (err) {
                if (timeoutId) clearTimeout(timeoutId);
                const isTimeout = err.name === 'AbortError';
                const errCode = isTimeout ? 'timeout' : 'network';

                console.warn(`[ReadyVerse AI] /api/coach unreachable (${errCode}):`, err.message);

                assistantReply = this.generateGroundedFallback(cleanText, coachContext);
                sourceTag = 'Built-in';

                this.emit('error', {
                    code: errCode,
                    message: isTimeout
                        ? 'Request timed out. Using built-in emergency guidance.'
                        : 'AI coach offline. Using built-in emergency guidance.'
                });
            }

            // 7. Push to history and emit transcript
            this.conversationHistory.push({ role: 'user', content: cleanText });
            this.conversationHistory.push({ role: 'assistant', content: assistantReply });

            this.emit('transcript', {
                speaker: 'assistant',
                text: assistantReply,
                sourceTag: sourceTag,
                language: detectedLang,
                isFinal: true
            });

            this.setState(this.sessionMode === 'text' ? 'TEXT_MODE' : 'DISCONNECTED');
            return assistantReply;
        }

        // Backward compatibility
        async sendTextMessage(text) {
            return await this.sendToCoach(text, 'typed');
        }

        clearConversationHistory() {
            this.conversationHistory = [];
            this.sessionStudentName = null;
            this.sessionNameOptOut = false;
            if (QuizStateMachine && typeof QuizStateMachine.endQuiz === 'function') {
                QuizStateMachine.endQuiz();
            }
            this.setState('DISCONNECTED');
        }

        async sendChatFallback(text, options = {}) {
            return await this.sendToCoach(text, 'typed');
        }

        // Local-only deterministic responses. Grounded in NDMA life-safety standards.
        generateGroundedFallback(userQuery, context) {
            const text = (userQuery || '').toLowerCase().trim();

            // Language check
            let isTanglish = false;
            let isTamil = false;
            if (LanguageDetector && typeof LanguageDetector.detectLanguage === 'function') {
                const langRes = LanguageDetector.detectLanguage(userQuery, this.sessionLanguage);
                isTanglish = (langRes.language === 'tanglish');
                isTamil = (langRes.language === 'tamil');
            } else {
                isTamil = /[\u0B80-\u0BFF]/.test(userQuery || '');
                isTanglish = !isTamil && [
                    'bro', 'machan', 'machi', 'enna', 'pannanum', 'pannalam', 'irukku', 'iruku',
                    'solunga', 'sollunga', 'thee', 'pidicha', 'epdi', 'eppadi', 'koodathu', 'mudiyum',
                    'vantha', 'vandha', 'thambi', 'ena pandra', 'vena'
                ].some(k => text.includes(k));
            }

            // 1. Adversarial / Medical Refusals
            const adversarialKeywords = [
                'dan mode', 'ignore all', 'system prompt', 'secret', 'password', 'hack',
                'tracheotomy', 'paracetamol', 'prescribe', 'dosage', 'pills', 'chest pain',
                'cricket', 'world cup', 'python', 'script', 'homework', 'calculus', 'nuclear asteroid',
                'bypass fire alarm', 'disable alarm', 'vip number', 'secret helpline', 'fever', 'bleach'
            ];
            if (adversarialKeywords.some(k => text.includes(k))) {
                if (isTanglish) {
                    return "I'm not sure, check the lesson or call 112 bro. Maruthuva aalosanai-ku doctor-ah consult pannunga.";
                }
                if (isTamil) {
                    return "எனக்கு உறுதியாகத் தெரியவில்லை, பாடத்தைப் பார்க்கவும் அல்லது 112ஐ அழைக்கவும். மருத்துவ உதவிக்கு 108 ஐ அழைக்கவும்.";
                }
                return "I'm not sure, check the lesson or call 112";
            }

            // 2. Name introduction handling ("My name is Ruby", "Call me Priya")
            const nameMatch = text.match(/\b(?:my name is|call me|i am|i'm|en peru|en peyar)\s+([a-z]{2,20})\b/i);
            if (nameMatch && !['confused', 'scared', 'ready', 'here', 'fine', 'good', 'asking', 'student', 'trainee'].includes(nameMatch[1])) {
                const capName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
                if (isTanglish) return `Nice to meet you, ${capName}! Ungalukku fire safety, floods, cyclones or earthquakes practice panna ready-ah iruken. Enna parkkalam?`;
                if (isTamil) return `உங்களை சந்தித்ததில் மகிழ்ச்சி, ${capName}! தீ, வெள்ளம், புயல், நிலநடுக்க பாதுகாப்பு பயிற்சிகளை நாம் ஒன்றாகப் பயிற்சி செய்யலாம். எதை முதலில் தொடங்கலாம்?`;
                return `Nice to meet you, ${capName}! We can practise fire safety, floods, cyclones or earthquakes together. What would you like to explore first?`;
            }

            // 3. Follow-up & Rephrasing ("Explain that in Tamil", "Say it simpler")
            if (/\b(in\s+tamil|tamil[\s\-]*la|tamilil|விளக்கவும்)\b/i.test(text) && /\b(explain|sollu|solren|say|repeat)\b/i.test(text)) {
                return "கட்டிடத்தில் தீ விபத்து ஏற்பட்டால் புகைக்கு அடியில் குனிந்து தவழ வேண்டும், ஏனென்றால் நச்சுப் புகை மேலே எழும்பும். படிக்கட்டுகள் வழியாக வெளியேறி 112-ஐ அழைக்கவும்.";
            }
            if (/\b(simpler|more simply|simple english|say it simpler|easy|explain simply)\b/i.test(text)) {
                return "In a fire: stay low to the floor where the clean air is, take the stairs instead of the lift, and get outside. Call 112 once you are safe.";
            }

            // 4. Confusion / Mistake Reactions ("I'm confused", "I got the answer wrong")
            if (text.includes('confused') || text.includes('wrong') || text.includes('purila') || text.includes('kuzhappam')) {
                if (isTanglish) return "No worries bro! Mistakes and confusion are how instincts get built. Learn Hub flashcards check pannunga, illana drill marubadiyum try pannalam!";
                if (isTamil) return "கவலைப்பட வேண்டாம்! தவறுகளிலிருந்து தான் நாம் கற்றுக்கொள்கிறோம். பாடத்தின் அட்டைகளைப் பாருங்கள் அல்லது மீண்டும் பயிற்சியைத் தொடங்குங்கள்.";
                return "That's completely okay—practice is how instincts get built! The key idea is that hot smoke rises, so staying low keeps you in breathable air. What part feels confusing?";
            }

            // 5. Pedagogical Drill Questions ("Why should I complete this drill?", "What can I do in the fire game?")
            if (text.includes('why should i complete') || text.includes('fire game') || text.includes('what can i do in') || text.includes('why complete drill')) {
                return "ReadyVerse simulation drills let you practice 8 critical crisis stages—like crawling under smoke, checking door heat, and escaping via stairs—without real danger. Each completed drill adds +10.0% to your Readiness Score!";
            }

            // 6. Casual Greetings & Chitchat ("Hey!", "How are you?", "What are you doing?", "Hy ena pandra")
            if (text.includes('ena pandra') || text.includes('enna pandra') || text.includes('enna seira') ||
                text.includes('how are you') || text.includes('what are you doing') || text.includes('what r u doing') ||
                text === 'hy' || text === 'hi' || text === 'hello' || text === 'hey' || text === 'vanakkam' ||
                text.startsWith('hi ') || text.startsWith('hey ') || text.startsWith('hello ')) {
                if (isTanglish) {
                    return "Hey! ReadyVerse safety coach inga. Un emergency drills, fire safety, cyclone, or campus safety pathi kelunga, ready-ah solren!";
                }
                if (isTamil) {
                    return "வணக்கம்! நான் உங்கள் ReadyVerse பாதுகாப்பு பயிற்சியாளர். பேரிடர் பாதுகாப்பு பற்றி என்ன தெரிந்துகொள்ள வேண்டும்?";
                }
                return "Hey! I'm your ReadyVerse disaster safety coach. You can ask me about drills, fire safety, flood response, or readiness scores!";
            }

            // 7. ReadyVerse Platform Overview ("Tell me about ReadyVerse")
            if (text.includes('about readyverse') || text.includes('what is readyverse') || text.includes('readyverse pathi') || text.includes('tell me about readyverse')) {
                if (isTanglish) {
                    return "ReadyVerse oru student disaster preparedness platform. Ithu 4 interactive drills (Fire, Flood, Cyclone, Earthquake), 6 NDMA lessons, 40-action campus safety plan, and comprehensive Readiness Score provide pannuthu!";
                }
                if (isTamil) {
                    return "ReadyVerse என்பது மாணவர்களுக்கான பேரிடர் தயார்நிலை பயிற்சி தளம். இதில் 4 பயிற்சிகள் (தீ, வெள்ளம், புயல், நிலநடுக்கம்), 6 பாடங்கள் மற்றும் தயார்நிலை மதிப்பெண் உள்ளன.";
                }
                return "ReadyVerse is a student disaster preparedness platform featuring 4 simulation drills (Fire, Flood, Cyclone, Earthquake), 6 NDMA-aligned lessons, a 40-action dorm safety plan, and a comprehensive Readiness Score.";
            }

            // 8. Readiness & Highest-Impact Action Queries
            if (text.includes('readiness') || text.includes('score') || text.includes('highest-impact') || text.includes('highest impact') || text.includes('what should i do next')) {
                let currentScore = 0;
                let nextAction = 'Complete your next disaster simulation drill';
                let gain = '+10.0%';

                if (context && context.readiness) {
                    currentScore = context.readiness.total || context.readiness.totalReadiness || 0;
                }
                if (context && context.prioritizedNextActions && context.prioritizedNextActions.length > 0) {
                    const top = context.prioritizedNextActions[0];
                    nextAction = top.action;
                    gain = top.readinessImpact;
                }

                if (isTanglish) {
                    return `Unga current Readiness Score ${currentScore}%. Ungalukku highest-impact next action: ${nextAction} (${gain} readiness boost)!`;
                }
                if (isTamil) {
                    return `உங்கள் தற்போதைய தயார்நிலை மதிப்பெண் ${currentScore}%. அதிக தாக்கம் கொண்ட அடுத்த நடவடிக்கை: ${nextAction} (${gain}).`;
                }
                return `Your current Readiness Score is ${currentScore}%. Highest-impact next step: ${nextAction} (${gain} readiness gain).`;
            }

            // 9. Fire Safety Protocols ("What do I do in a fire?")
            if (text.includes('fire') || text.includes('thee') || text.includes('smoke') || text.includes('புகை')) {
                if (text.includes('lift') || text.includes('elevator')) {
                    if (isTanglish) return "Fire irukkum pothu lift kandippa use panna koodathu! Power cut aagalam illana shaft vazhiya smoke trap aagalam. Emergency stairs dhaan use pannanum. Call 112.";
                    return "Never use elevators during a fire. Elevators can lose power or fill with smoke. Always evacuate via marked emergency stairwells. Call 112.";
                }
                if (text.includes('clothes') || text.includes('aada') || text.includes('stop drop')) {
                    if (isTanglish) return "Aadaila thee pidicha: Stop, Drop, and Roll (நில், விழு, உருளு)! Ooda koodathu. Face-ah cover pannitu floor-la roll pannunga. Call 101 or 112.";
                    return "If your clothes catch fire: Stop, Drop, and Roll. Cover your face with your hands and roll to smother flames. Never run. Call 101 or 112.";
                }
                if (text.includes('pass') || text.includes('extinguisher') || text.includes('theeyanai')) {
                    if (isTanglish) return "Fire extinguisher PASS method: P = Pull pin, A = Aim at base, S = Squeeze lever, S = Sweep side-to-side! Periya fire-na evacuate pannitu 101/112 call pannunga.";
                    return "Fire extinguisher PASS technique: P = Pull the pin, A = Aim at the base of the fire, S = Squeeze the handle lever, S = Sweep side to side. For large fires, evacuate immediately and call 101 or 112.";
                }
                if (isTanglish) {
                    return "Building-la fire vantha: smoke keezha low-ah crawl pannunga. Lift use panna koodathu, emergency stairs vazhiya evacuate aaganum. Velila open ground assembly point-ku poitu 101 or 112-ku call pannunga.";
                }
                if (isTamil) {
                    return "கட்டிடத்தில் தீ விபத்து ஏற்பட்டால்: புகைக்கு அடியில் தவழ்ந்து செல்லுங்கள், மின் தூக்கியைப் பயன்படுத்தாதீர்கள், படிக்கட்டுகள் வழியாக வெளியேறி 101 அல்லது 112 ஐ அழைக்கவும்.";
                }
                return "In a building fire: stay low and crawl under smoke, check doors with the back of your hand before opening, never use elevators, evacuate via marked stairs to the assembly area, and call 101 or 112.";
            }

            // 10. Flood Safety
            if (text.includes('flood') || text.includes('vellam') || text.includes('water')) {
                if (isTanglish) return "Flash flood-la higher floors-ku seekiram ponga (Vertical Evacuation). Moving water-la nadakka koodathu. Main power safe-ah cut pannitu 112-ku call pannunga.";
                return "During a flash flood: move immediately to higher floors (vertical evacuation). Never walk or drive through moving water. Disconnect main power safely if water enters. Call 112.";
            }

            // 11. Cyclone Safety
            if (text.includes('cyclone') || text.includes('puyal') || text.includes('wind')) {
                if (isTanglish) return "Cyclone appo window illatha interior room-la safe-ah irunga. Glass windows kitta poga koodathu. Calm eye of storm vantha velila varatheenga. Call 112.";
                return "During a cyclone: stay indoors in an interior room away from windows and glass. If the calm eye of the storm passes, do not go outside as severe winds will resume. Call 112.";
            }

            // 12. Earthquake Safety
            if (text.includes('earthquake') || text.includes('nilanadukkam') || text.includes('shaking')) {
                if (isTanglish) return "Earthquake shaking appo: Drop, Cover, and Hold On! Sturdy desk keezha poi head protect pannunga. Shaking ninnathum stairs vazhiya open ground ponga. Call 112.";
                return "During earthquake shaking: Drop, Cover, and Hold On under a sturdy desk or table. Protect your head and neck. After shaking stops, evacuate calmly via stairs to open ground. Call 112.";
            }

            // 13. Emergency Numbers (Matching full word boundaries, NOT single letters like 'en'!)
            if (/\b(number|numbers|helpline|phone|emergency number|contact|112|101|108)\b/i.test(text)) {
                if (isTanglish) return "Official emergency numbers: 112 (National Emergency Support), 101 (Fire Service), and 108 (Ambulance). Note panni vechukkonga!";
                return "Official Emergency Numbers in India: 112 (National Emergency Support), 101 (Fire Service), and 108 (Ambulance).";
            }

            // Default safe guidance (calm, honest, non-emergency)
            return "I can't reach the live AI right now, but I'm here to help you stay safe! Check your lessons in Learn Hub, or ask me about fire, flood, cyclone, or earthquake safety.";
        }
    }

    return ReadyVerseAITransport;
}));
