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
                        console.error('[ReadyVerse AI Router] Backup provider also failed:', backupErr.message);
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

        // Local-only deterministic responses. Never synthesize emergency or hazard advice here.
        generateGroundedFallback(userQuery, context) {
            const lower = (userQuery || '').toLowerCase();
            if ((lower.includes('readiness') || lower.includes('score')) && context && context.readiness && Number.isFinite(context.readiness.totalReadiness)) {
                return `Static/Offline Mode (local ReadyVerse data): Your current Readiness Score is ${context.readiness.totalReadiness}%. Cloud AI is not connected on this static build, but your drills, lessons, and safety scores are 100% active locally.`;
            }
            if ((lower.includes('progress') || lower.includes('completed')) && context && context.player) {
                const p = context.player;
                return `Static/Offline Mode (local ReadyVerse data): You have completed ${p.completedMissionsCount || 0} drills, ${p.completedLearnCount || 0} Learn Hub modules, and ${p.completedPrepCount || 0} preparedness actions. All progress is saved in your browser.`;
            }
            if (lower.includes('fire') || lower.includes('flood') || lower.includes('cyclone') || lower.includes('earthquake')) {
                return `Static/Offline Mode: Realtime cloud AI is inactive on this static build. You can practice our interactive emergency drills anytime in the Drills tab (Building Fire, Flash Flood, Cyclone, and Earthquake), or study the Learn modules for step-by-step guidance!`;
            }
            if (lower.includes('plan') || lower.includes('kit') || lower.includes('contact') || lower.includes('checklist')) {
                return `Static/Offline Mode: Your personal preparedness plan and emergency contacts are saved locally on your device in the My Plan tab. Fill out your action items to boost your Readiness Score!`;
            }
            return 'ReadyVerse AI (Static Mode): Realtime voice and generative cloud AI require running the Node.js backend server with API keys (see README to run locally). All interactive drills, lessons, safety checklists, and badges work 100% offline in this static build!';
        }
    }

    return ReadyVerseAITransport;
}));
