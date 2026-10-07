/**
 * ReadyVerse AI — Groq Backup Provider
 * High-speed text conversational AI provider powered by Groq LPU inference.
 * Serves as reliable, fast backup when primary voice/realtime services encounter failures.
 * Preserves ReadyVerse personality, 8-domain context awareness, language mirroring, and tool execution.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./provider-base', '../ai-context', '../ai-tools', '../ai-personality'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const ProviderBase = require('./provider-base');
        const context = require('../ai-context');
        const tools = require('../ai-tools');
        const personality = require('../ai-personality');
        module.exports = factory(ProviderBase, context, tools, personality);
    } else {
        root.ReadyVerseGroqProvider = factory(
            root.ReadyVerseAIProvider,
            root.ReadyVerseAIContext,
            root.ReadyVerseAITools,
            root.ReadyVerseAIPersonality
        );
    }
}(typeof self !== 'undefined' ? self : this, function (ReadyVerseAIProvider, AIContext, AITools, AIPersonality) {
    'use strict';

    class GroqProvider extends ReadyVerseAIProvider {
        constructor(config = {}) {
            super('groq', config);
            this.serverUrl = config.serverUrl || '';
            this.model = config.model || 'openai/gpt-oss-120b';
            this.isConnected = true;
        }

        supportsVoice() {
            // Groq is optimized for fast text conversational AI, not native audio streaming
            return false;
        }

        supportsText() {
            return true;
        }

        supportsTools() {
            return true;
        }

        supportsStreaming() {
            return true;
        }

        async connectVoice(callbacks = {}) {
            const err = new Error('Groq provider operates in fast text conversational mode. Realtime voice streaming is not supported.');
            err.code = 'VOICE_UNSUPPORTED';
            if (callbacks.onError) callbacks.onError(err);
            throw err;
        }

        sendUserAudioChunk(base64Pcm) {
            console.warn('[ReadyVerse AI / Groq] Audio streaming not supported in Groq text mode.');
        }

        async sendTextMessage(text) {
            return await this.sendChatFallback({
                messages: [{ role: 'user', content: text }]
            });
        }

        async sendChatFallback(options = {}) {
            const endpoint = `${this.serverUrl}/api/chat`;
            const systemPrompt = options.systemInstruction || 
                (AIPersonality ? AIPersonality.buildAugmentedPrompt(AIContext ? AIContext.getReadyVerseContext() : {}) : '');

            const messages = [];
            if (systemPrompt) {
                messages.push({ role: 'system', content: systemPrompt });
            }

            if (options.messages && Array.isArray(options.messages)) {
                options.messages.forEach(msg => {
                    if (msg.role !== 'system') {
                        messages.push({ role: msg.role, content: msg.content });
                    }
                });
            }

            const payload = {
                provider: 'groq',
                model: options.model || this.model,
                messages: messages,
                systemInstruction: systemPrompt,
                tools: options.tools || (AITools && typeof AITools.getOpenAIFunctionDeclarations === 'function' ? AITools.getOpenAIFunctionDeclarations() : (AITools ? AITools.TOOL_DEFINITIONS : [])),
                temperature: typeof options.temperature === 'number' ? options.temperature : 0.6,
                max_tokens: options.max_tokens || 800
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                const err = new Error(errJson.message || `Groq Chat request failed with status ${res.status}`);
                err.code = errJson.error || 'GROQ_REQUEST_FAILED';
                err.status = res.status;
                throw err;
            }

            const responseData = await res.json();
            return responseData;
        }
    }

    return GroqProvider;
}));
