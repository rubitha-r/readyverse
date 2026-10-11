/**
 * ReadyVerse AI — Provider Router & Failover Engine
 * Centralized provider router managing Gemini Live (Primary Voice/Text),
 * Groq LPU (Fast Conversational Text Backup), and Grounded ReadyVerse Fallback.
 * Preserves 8-domain application context, language mirroring, safety boundaries, and tool safety.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            './ai-context',
            './ai-tools',
            './ai-personality',
            './providers/provider-base',
            './providers/gemini-live-provider',
            './providers/groq-provider',
            './providers/openai-provider'
        ], factory);
    } else if (typeof module === 'object' && module.exports) {
        const context = require('./ai-context');
        const tools = require('./ai-tools');
        const personality = require('./ai-personality');
        const ProviderBase = require('./providers/provider-base');
        const GeminiLiveProvider = require('./providers/gemini-live-provider');
        const GroqProvider = require('./providers/groq-provider');
        const OpenAIProvider = require('./providers/openai-provider');
        module.exports = factory(context, tools, personality, ProviderBase, GeminiLiveProvider, GroqProvider, OpenAIProvider);
    } else {
        root.ReadyVerseAITransport = factory(
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
            this.state = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | CONNECTED | LISTENING | THINKING | SPEAKING | ERROR
            this.mode = 'voice'; // 'voice' | 'text'
            this.config = config;

            // Centralized Router Architecture
            this.primaryProviderName = config.primaryProvider || 'gemini';
            this.fallbackProviderName = config.fallbackProvider || 'groq';
            this.activeProviderName = this.primaryProviderName;
            this.sessionMode = 'voice'; // 'voice' | 'text'
            this.voiceActive = false;
            this.failoverCount = 0;
            this.availability = 'CLOUD_PRIMARY'; // CLOUD_PRIMARY | CLOUD_BACKUP | OFFLINE_READY
            this.isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
            this._onOnline = () => {
                this.isOnline = true;
                this.activeProviderName = this.primaryProviderName;
                this.activeProvider = this.providers[this.primaryProviderName] || this.providers.gemini;
                this.emitAvailability('CLOUD_PRIMARY');
            };
            this._onOffline = () => { this.isOnline = false; this.enterOfflineReady('Browser reports that the device is offline.'); };
            if (typeof window !== 'undefined' && window.addEventListener) {
                window.addEventListener('online', this._onOnline);
                window.addEventListener('offline', this._onOffline);
            }

            this.conversationHistory = [];
            this.lastDetectedLanguage = 'english';
            this._isFailingOver = false;
            this._lastFailoverNoticeTime = 0;

            this.listeners = {
                stateChange: [],
                transcript: [],
                toolCall: [],
                interrupted: [],
                failover: [],
                error: []
            };

            // Provider Registry
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
                    model: this.config.groqModel || 'openai/gpt-oss-120b'
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
                availability: this.availability
            };
        }

        setProvider(providerName) {
            if (!this.providers[providerName]) {
                console.warn(`[ReadyVerse AI Router] Provider '${providerName}' not found. Defaulting to '${this.activeProviderName}'.`);
                return;
            }
            if (this.state !== 'DISCONNECTED') {
                this.disconnect();
            }
            this.activeProviderName = providerName;
            this.activeProvider = this.providers[providerName];
            (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI Router] Active provider switched to: ${providerName.toUpperCase()}`);
            this.emit('stateChange', {
                state: this.state,
                mode: this.mode,
                provider: this.activeProviderName,
                routerStatus: this.getRouterStatus()
            });
        }

        getActiveProvider() {
            return this.activeProvider;
        }

        // Reset session for a new interaction turn (re-attempting primary Gemini Live)
        resetSession() {
            this.activeProviderName = this.primaryProviderName;
            this.activeProvider = this.providers[this.primaryProviderName] || this.providers.gemini;
            this.sessionMode = 'voice';
            this.voiceActive = false;
            this._isFailingOver = false;
            (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI Router] Session reset. Primary provider (${this.primaryProviderName.toUpperCase()}) re-engaged.`);
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
                    try {
                        cb(data);
                    } catch (e) {
                        console.error(`[ReadyVerse AI] Error in listener for ${event}:`, e);
                    }
                });
            }
        }

        emitAvailability(availability, reason) {
            this.availability = availability;
            this.emit('availability', { availability, reason: reason || '', provider: this.activeProviderName });
        }

        enterOfflineReady(reason) {
            this.activeProviderName = 'offline';
            this.activeProvider = null;
            this.sessionMode = 'text';
            this.voiceActive = false;
            this.emitAvailability('OFFLINE_READY', reason);
        }

        setState(newState) {
            if (this.state !== newState) {
                this.state = newState;
                this.emit('stateChange', {
                    state: this.state,
                    mode: this.mode,
                    provider: this.activeProviderName,
                    routerStatus: this.getRouterStatus()
                });
            }
        }

        // 1. Connect Realtime Voice Session via Primary Provider (Gemini Live)
        async connectVoice() {
            this.mode = 'voice';
            if (!this.isOnline) {
                this.enterOfflineReady('Internet connection is unavailable.');
                return false;
            }
            this.setState('CONNECTING');

            const primary = this.providers[this.primaryProviderName] || this.providers.gemini;
            this.activeProvider = primary;
            this.activeProviderName = this.primaryProviderName;
            this.emitAvailability('CLOUD_PRIMARY');

            let hasHandledFailover = false;
            const callbacks = {
                onStateChange: (state) => {
                    if (state === 'CONNECTED' || state === 'LISTENING') {
                        this.voiceActive = true;
                    }
                    this.setState(state);
                },
                onTranscript: (t) => {
                    if (t && t.text && AIPersonality) {
                        const lang = AIPersonality.detectLanguage(t.text);
                        if (lang) this.lastDetectedLanguage = lang;
                    }
                    this.emit('transcript', t);
                },
                onToolCall: (tc) => this.emit('toolCall', tc),
                onInterrupted: () => this.emit('interrupted'),
                onError: (err) => {
                    console.warn('[ReadyVerse AI Router] Primary voice error encountered:', err);
                    if (!hasHandledFailover) {
                        hasHandledFailover = true;
                        this.handleVoiceFailover(err);
                    }
                }
            };

            try {
                await primary.connectVoice(callbacks);
                this.voiceActive = true;
                return true;
            } catch (err) {
                console.warn('[ReadyVerse AI Router] Primary voice connection failed. Initiating failover:', err.message);
                if (!hasHandledFailover) {
                    hasHandledFailover = true;
                    this.handleVoiceFailover(err);
                }
                return false;
            }
        }

        // Automatic Voice-to-Text Failover Transition
        handleVoiceFailover(err) {
            if (this._isFailingOver) {
                return;
            }
            this._isFailingOver = true;

            this.voiceActive = false;
            this.sessionMode = 'text';
            this.mode = 'text';
            this.failoverCount++;

            // Clean up voice connection hardware
            if (this.providers.gemini) {
                try { this.providers.gemini.disconnect(); } catch (e) {}
            }

            // Switch active provider to Groq backup
            this.activeProviderName = this.fallbackProviderName;
            this.activeProvider = this.providers[this.fallbackProviderName] || this.providers.groq;
            (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI Router] Voice-to-Text Failover executed: Active provider is now ${this.activeProviderName.toUpperCase()}`);

            this.setState('TEXT_MODE');
            this.emitAvailability('CLOUD_BACKUP', err && err.message);

            // Emit failover event for telemetry / UI
            this.emit('failover', {
                from: this.primaryProviderName,
                to: this.activeProviderName,
                mode: 'text',
                reason: err ? err.message : 'Voice session interrupted'
            });

            // Show friendly collegiate notification to student (deduplicated)
            const now = Date.now();
            if (now - this._lastFailoverNoticeTime > 1500) {
                this._lastFailoverNoticeTime = now;
                this.emit('transcript', {
                    role: 'assistant',
                    speaker: 'assistant',
                    text: "Voice connection was interrupted. I'm continuing here in text mode — ask me anything!",
                    isSystemNotice: true,
                    isFinal: true
                });
            }

            setTimeout(() => {
                this._isFailingOver = false;
            }, 1000);
        }

        // Disconnect Active Voice Session
        disconnect() {
            this.voiceActive = false;
            if (this.activeProvider) {
                try {
                    this.activeProvider.disconnect();
                } catch (e) {
                    console.warn('[ReadyVerse AI] Error during provider disconnect:', e);
                }
            }
            this.setState('DISCONNECTED');
        }

        // 2. Send Typed Text Message
        async sendTextMessage(text) {
            if (!text || !text.trim()) return false;
            const cleanText = text.trim();

            if (AIPersonality) {
                this.lastDetectedLanguage = AIPersonality.detectLanguage(cleanText);
            }

            // If active in a live voice session with Gemini, send directly through live WebSocket
            if (this.voiceActive && this.activeProvider && this.activeProvider.supportsVoice() && this.state !== 'DISCONNECTED') {
                const sent = this.activeProvider.sendTextMessage(cleanText);
                if (sent) {
                    this.conversationHistory.push({ role: 'user', content: cleanText });
                    this.emit('transcript', { speaker: 'user', text: cleanText, isFinal: true });
                    return true;
                }
            }

            // Otherwise process through chat fallback with automatic failover
            return await this.sendChatFallback(cleanText);
        }

        // 3. Conversational Chat Router with Multi-Level Automatic Failover
        async sendChatFallback(userText, options = {}) {
            if (!userText || !userText.trim()) return null;
            const cleanText = userText.trim();

            this.conversationHistory.push({ role: 'user', content: cleanText });
            this.emit('transcript', { speaker: 'user', text: cleanText, isFinal: true });
            this.setState('THINKING');

            if (AIPersonality) {
                this.lastDetectedLanguage = AIPersonality.detectLanguage(cleanText);
            }

            const contextData = AIContext ? AIContext.getReadyVerseContext() : {};
            if (!this.isOnline) this.enterOfflineReady('Internet connection is unavailable.');
            if (this.availability === 'OFFLINE_READY' || !this.activeProvider) {
                const localReply = this.generateGroundedFallback(cleanText, contextData);
                this.conversationHistory.push({ role: 'assistant', content: localReply });
                this.emit('transcript', { speaker: 'assistant', text: localReply, isFinal: true, mode: 'offline' });
                this.setState('OFFLINE_READY');
                return localReply;
            }
            const systemPrompt = AIPersonality ? AIPersonality.buildAugmentedPrompt(contextData) : '';
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.conversationHistory.slice(-8)
            ];

            const chatOptions = {
                messages: messages,
                systemInstruction: systemPrompt,
                temperature: options.temperature || 0.7,
                ...options
            };

            let assistantReply = '';
            let toolCalls = [];

            // Step A: Attempt Active Provider (Gemini or Groq)
            try {
                const responseData = await this.activeProvider.sendChatFallback(chatOptions);
                this.emitAvailability(this.activeProviderName === this.fallbackProviderName ? 'CLOUD_BACKUP' : 'CLOUD_PRIMARY');
                const parsed = this.parseProviderResponse(responseData);
                if (!parsed.reply && !parsed.toolCalls.length) throw new Error('Provider returned no usable response.');
                assistantReply = parsed.reply;
                toolCalls = parsed.toolCalls;
            } catch (primaryErr) {
                console.warn(`[ReadyVerse AI Router] Provider '${this.activeProviderName}' failed:`, primaryErr.message);

                // Step B: If Primary (Gemini) failed, failover to Backup (Groq)
                if (this.activeProviderName !== this.fallbackProviderName && this.providers[this.fallbackProviderName]) {
                    this.activeProviderName = this.fallbackProviderName;
                    this.activeProvider = this.providers[this.fallbackProviderName];
                    this.failoverCount++;

                    this.emit('failover', {
                        from: this.primaryProviderName,
                        to: this.fallbackProviderName,
                        mode: 'text',
                        reason: primaryErr.message
                    });
                    this.emitAvailability('CLOUD_BACKUP', primaryErr.message);

                    try {
                        (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI Router] Attempting Backup Provider (${this.fallbackProviderName.toUpperCase()})...`);
                        const backupResponse = await this.activeProvider.sendChatFallback(chatOptions);
                        const parsed = this.parseProviderResponse(backupResponse);
                        if (!parsed.reply && !parsed.toolCalls.length) throw new Error('Backup provider returned no usable response.');
                        assistantReply = parsed.reply;
                        toolCalls = parsed.toolCalls;
                    } catch (backupErr) {
                        console.warn('[ReadyVerse AI Router] Backup provider failed, engaging local offline fallback:', backupErr.message);
                        // Step C: Grounded ReadyVerse Fallback
                        assistantReply = this.generateGroundedFallback(cleanText, contextData);
                        this.enterOfflineReady(backupErr.message);
                    }
                } else {
                    // Step C: Grounded ReadyVerse Fallback
                    assistantReply = this.generateGroundedFallback(cleanText, contextData);
                    this.enterOfflineReady(primaryErr.message);
                }
            }

            // Execute any tool calls safely through authoritative ReadyVerse engine
            if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI] Executing tool '${tc.name}':`, tc.args);
                    const toolResult = await AITools.executeTool(tc.name, tc.args);
                    this.emit('toolCall', { name: tc.name, args: tc.args, result: toolResult });
                }
            }

            if (!assistantReply && toolCalls.length > 0) {
    const executedToolNames = toolCalls.map(tc => tc.name);

    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(
        '[ReadyVerse AI] Tool execution completed:',
        executedToolNames
    );

    // Tool calls are internal operations.
    // They must NEVER be shown as the assistant's conversational answer.
    //
    // If the provider returned no final natural-language response,
    // create a short contextual response based on the action performed.
    const hasNavigation = executedToolNames.some(name =>
        name === 'navigate_to_section' ||
        name === 'open_disaster_module' ||
        name === 'start_mission_simulation'
    );

    if (hasNavigation) {
        assistantReply =
            'Done — I’ve opened the requested ReadyVerse section for you.';
    } else {
        assistantReply =
            'Done — I’ve updated the ReadyVerse information. What would you like to know next?';
    }
}
            this.conversationHistory.push({ role: 'assistant', content: assistantReply });
            this.emit('transcript', { speaker: 'assistant', text: assistantReply, isFinal: true });
            this.setState(this.sessionMode === 'text' ? 'TEXT_MODE' : 'LISTENING');

            return assistantReply;
        }

        // Helper to normalize response formats across Gemini, Groq, and OpenAI
        parseProviderResponse(responseData) {
            let reply = '';
            let toolCalls = [];

            if (!responseData) return { reply, toolCalls };

            // Gemini format
            if (responseData.candidates && responseData.candidates[0]) {
                const candidate = responseData.candidates[0];
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text) reply += part.text;
                        if (part.functionCall) {
                            toolCalls.push({
                                name: part.functionCall.name,
                                args: part.functionCall.args || {}
                            });
                        }
                    }
                }
            }
            // Groq & OpenAI standard format
            else if (responseData.choices && responseData.choices[0]) {
                const message = responseData.choices[0].message || {};
                reply = message.content || '';
                if (message.tool_calls && Array.isArray(message.tool_calls)) {
                    message.tool_calls.forEach(tc => {
                        if (tc.function) {
                            let args = {};
                            try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
                            toolCalls.push({ name: tc.function.name, args: args });
                        }
                    });
                }
            } else if (typeof responseData.response === 'string') {
                reply = responseData.response;
            } else if (typeof responseData.reply === 'string') {
                reply = responseData.reply;
            }

            return { reply, toolCalls };
        }

        // Local-only deterministic responses. Grounded in NDMA life-safety standards.
        generateGroundedFallback(userQuery, context) {
            const text = (userQuery || '').toLowerCase().trim();

            // 1. Adversarial / Prompt Injection / Medical Refusals
            const adversarialKeywords = [
                'dan mode', 'ignore all', 'system prompt', 'secret', 'password', 'hack',
                'tracheotomy', 'paracetamol', 'prescribe', 'dosage', 'pills', 'chest pain',
                'cricket', 'world cup', 'python', 'script', 'homework', 'calculus', 'nuclear asteroid',
                'bypass fire alarm', 'disable alarm', 'vip number', 'secret helpline', 'fever'
            ];
            if (adversarialKeywords.some(k => text.includes(k))) {
                if (text.includes('enaku') || text.includes('sollu') || text.includes('iruku')) {
                    return "I'm not sure, check the lesson or call 112. (மருத்துவ ஆலோசனைக்கு மருத்துவரை அணுகவும் அல்லது 108 / 112 எண்ணை அழைக்கவும்).";
                }
                return "I'm not sure, check the lesson or call 112";
            }

            // 2. Readiness & Progress Context Checks
            if ((text.includes('readiness') || text.includes('score')) && context && context.readiness && Number.isFinite(context.readiness.totalReadiness)) {
                return `Your current Readiness Score is ${context.readiness.totalReadiness}%. The AI friend is offline right now, but your drills, lessons, and safety scores are 100% active locally.`;
            }
            if ((text.includes('progress') || text.includes('completed')) && context && context.player) {
                const p = context.player;
                return `You have completed ${p.completedMissionsCount || 0} drills, ${p.completedLearnCount || 0} lessons, and ${p.completedPrepCount || 0} preparedness actions. The AI friend is offline right now. Check the lessons or call 112.`;
            }

            // 3. Quiz Me Request (Authentic lesson quiz question with options)
            if (text.includes('quiz me') || text === 'quiz' || text.includes('quiz-me')) {
                return "Here's a question from our Fire Safety & Evacuation lesson:\n\nWhy is crawling low under smoke essential during a building fire?\n1. It makes you move faster through doorways\n2. Toxic smoke and superheated gases rise, leaving cleaner air near the floor\n3. It prevents falling objects from touching you\n4. It keeps you hidden from outside heat\n\nWhich option is correct? Type 1, 2, 3, or 4!";
            }

            // Quiz Answer Evaluation (Option 2 for Q1)
            if (text === '2' || text === 'option 2' || text.includes('cleaner air') || text.includes('toxic smoke and superheated')) {
                return "Spot on! Toxic smoke and superheated gases rise, leaving cleaner air near the floor. Cooler, breathable air stays in the lower 12-24 inches. +20 XP ready! Tap 'Quiz me' for another question!";
            } else if (text === '1' || text === '3' || text === '4' || text === 'option 1' || text === 'option 3' || text === 'option 4') {
                return "Good try! The correct answer is 2: Toxic smoke and superheated gases rise, leaving cleaner air near the floor. Superheated smoke and lethal gases rise toward the ceiling; cooler, breathable air stays in the lower 12-24 inches. Tap 'Quiz me' to try another!";
            }

            // 4. Tanglish Language Mirroring & Friendly Student Tone
            const isTanglish = [
                'bro', 'machan', 'machi', 'enna', 'pannanum', 'pannalam', 'irukku', 'iruku',
                'lift-a', 'solunga', 'sollunga', 'vantha', 'vandha', 'thee', 'pidicha', 'epdi',
                'eppadi', 'koodathu', 'mudiyum', 'illana', 'aagum', 'pathu', 'tanglish', 'tamil-la',
                'thambi', 'enna panna'
            ].some(m => text.includes(m));

            if (isTanglish) {
                if (text.includes('fire') || text.includes('thee') || text.includes('smoke') || text.includes('elevator') || text.includes('lift')) {
                    if (text.includes('lift') || text.includes('elevator')) {
                        return "Fire irukkum pothu lift kandippa use panna koodathu bro! Power cut aagalam illana smoke trap aagalam. Emergency staircase dhaan safest option.";
                    }
                    if (text.includes('clothes') || text.includes('aada') || text.includes('stop drop')) {
                        return "Aadaila thee pidicha: Stop, Drop, and Roll (நில், விழு, உருளு) bro! Ooda koodathu, floor-la roll panni flames-ah extinguish pannunga.";
                    }
                    if (text.includes('pass') || text.includes('extinguisher') || text.includes('theeyanai')) {
                        return "Fire extinguisher PASS method: P = Pull pin, A = Aim at base, S = Squeeze lever, S = Sweep side-to-side bro! Periya fire-na udane 101 or 112 call pannunga.";
                    }
                    return "Building-la fire vantha: smoke keezha low-ah crawl pannunga bro. Lift use panna koodathu, emergency stairs vazhiya evacuate aaganum. Velila open ground assembly point-ku poitu 101 or 112-ku call pannunga.";
                }
                if (text.includes('flood') || text.includes('vellam') || text.includes('water')) {
                    return "Flash flood-la higher floors-ku seekiram ponga bro (Vertical Evacuation). Moving water-la nadakka koodathu. Main power safe-ah cut pannitu 112-ku call pannunga.";
                }
                if (text.includes('cyclone') || text.includes('puyal') || text.includes('wind')) {
                    return "Cyclone appo window illatha interior room-la safe-ah irunga bro. Glass kitta poga koodathu. Calm eye of storm vantha velila varatheenga. Call 112.";
                }
                if (text.includes('earthquake') || text.includes('nilanadukkam') || text.includes('shaking')) {
                    return "Earthquake shaking appo: Drop, Cover, and Hold On bro! Sturdy desk keezha poi head protect pannunga. Shaking ninnathum stairs vazhiya open ground ponga. Call 112.";
                }
                if (text.includes('number') || text.includes('helpline') || text.includes('phone') || text.includes('call') || text.includes('en')) {
                    return "Bro, official emergency numbers: 112 (National Emergency), 101 (Fire Service), 108 (Ambulance). Note panni vechukkonga!";
                }
                if (text.includes('hi') || text.includes('hello') || text.includes('hey') || text.includes('vanakkam')) {
                    return "Hey bro! Naan unga ReadyVerse safety coach. Fire, flood, cyclone, or campus safety pathi ethu venumnalum kelunga, ready-ah solren!";
                }
            }

            // 5. Standard Safety Directives
            if (text.includes('pass') || text.includes('extinguisher')) {
                return "The PASS protocol for fire extinguishers is: P = Pull the pin, A = Aim at the base of the fire, S = Squeeze the handle lever, S = Sweep side-to-side. For major fires, evacuate and call 101 or 112.";
            }
            if (text.includes('clothes') || text.includes('stop drop')) {
                return "If clothes catch fire: Stop, Drop, and Roll (நில், விழு, உருளு). Cover your face and roll on the ground. Never run. Call 101 or 112.";
            }
            if (text.includes('earthquake') || text.includes('shaking') || text.includes('drop cover')) {
                return "During an earthquake: DROP, COVER, AND HOLD ON under a sturdy table or desk. Protect your head and neck. After shaking stops, evacuate calmly via stairs to an open assembly ground. Call 112.";
            }
            if (text.includes('what do i do in a fire') || text.includes('what to do in a fire') || (text.includes('fire') && (text.includes('do') || text.includes('evacuate') || text.includes('smoke')))) {
                return "In a building fire: stay low and crawl under smoke, check doors with the back of your hand before opening, never use elevators, evacuate via marked emergency stairs, and assemble at the assembly point. Call 101 or 112.";
            }
            if (text.includes('fire') || text.includes('smoke') || text.includes('flood') || text.includes('cyclone')) {
                return "In emergencies: follow NDMA protocols, evacuate immediately via stairs, and call 112 or 101 for fire.";
            }
            return "The AI friend is offline right now. Check the lessons or call 112.";
        }
    }

    return ReadyVerseAITransport;
}));
