/**
 * ReadyVerse AI — Provider Base Interface
 * Defines the contract for Realtime Voice & Conversational Intelligence providers.
 * All providers (Gemini Live, Groq, OpenAI, etc.) implement this common interface.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseAIProvider = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class ReadyVerseAIProvider {
        constructor(name, config = {}) {
            this.name = name || 'base';
            this.config = config;
            this.isConnected = false;
        }

        /**
         * Capability Introspection
         */
        supportsVoice() {
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

        getStatus() {
            return {
                name: this.name,
                isConnected: this.isConnected,
                supportsVoice: this.supportsVoice(),
                supportsText: this.supportsText(),
                supportsTools: this.supportsTools()
            };
        }

        /**
         * Connect to realtime voice session (if supported)
         * @param {Object} callbacks - { onStateChange, onTranscript, onAudioChunk, onToolCall, onInterrupted, onError }
         */
        async connectVoice(callbacks = {}) {
            throw new Error(`connectVoice() is not supported by provider: ${this.name}`);
        }

        /**
         * Send raw user audio chunk to active session
         * @param {string} base64Pcm - 16kHz PCM16 audio chunk in base64
         */
        sendUserAudioChunk(base64Pcm) {
            throw new Error(`sendUserAudioChunk() is not supported by provider: ${this.name}`);
        }

        /**
         * Send typed text message inside the active voice session
         * @param {string} text - User message text
         */
        sendTextMessage(text) {
            throw new Error(`sendTextMessage() must be implemented by provider: ${this.name}`);
        }

        /**
         * Send tool execution response back to the provider
         * @param {Object} toolResponse - Tool execution result
         */
        sendToolResponse(toolResponse) {
            throw new Error(`sendToolResponse() must be implemented by provider: ${this.name}`);
        }

        /**
         * Terminate active realtime session & clean up audio
         */
        disconnect() {
            this.isConnected = false;
        }

        /**
         * HTTP REST conversational chat completion
         * @param {Object} options - { messages, tools, systemInstruction, temperature }
         */
        async sendChatFallback(options = {}) {
            throw new Error(`sendChatFallback() must be implemented by provider: ${this.name}`);
        }
    }

    return ReadyVerseAIProvider;
}));
