/**
 * ReadyVerse AI — Gemini Live Provider
 * Implements bidirectional realtime voice streaming, natural conversation,
 * 16kHz PCM audio capture, 24kHz native audio playback, turn-taking,
 * live interruptions, function calling, and HTTP chat fallback using Google Gemini Live API.
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
        root.ReadyVerseGeminiLiveProvider = factory(
            root.ReadyVerseAIProvider,
            root.ReadyVerseAIContext,
            root.ReadyVerseAITools,
            root.ReadyVerseAIPersonality
        );
    }
}(typeof self !== 'undefined' ? self : this, function (ReadyVerseAIProvider, AIContext, AITools, AIPersonality) {
    'use strict';

    class GeminiLiveProvider extends ReadyVerseAIProvider {
        constructor(config = {}) {
            super('gemini', config);
            this.serverUrl = config.serverUrl || '';
            this.model = config.model || 'models/gemini-2.0-flash-exp';
            this.chatModel = config.chatModel || 'gemini-3.5-flash-lite';
            this.voice = config.voice || 'Puck'; // Puck, Charon, Kore, Fenrir, Aoede
            this.ws = null;
            this.audioCtx = null;
            this.micStream = null;
            this.micProcessor = null;
            this.micSource = null;
            this.callbacks = {};
            this.activeSources = [];
            this.nextPlayTime = 0;
            this.isPlaying = false;
            this.isConnected = false;
        }

        supportsVoice() {
            return true;
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
            this.callbacks = callbacks;
            this.emitState('CONNECTING');

            // 1. Request microphone access early
            try {
                if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
                    this.micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                }
            } catch (err) {
                console.warn('[ReadyVerse AI / Gemini] Microphone access denied or unavailable:', err);
                if (this.callbacks.onError) {
                    this.callbacks.onError({
                        error: 'MICROPHONE_DENIED',
                        message: 'Microphone access is required for realtime voice conversation.'
                    });
                }
                this.emitState('ERROR');
                throw new Error('MICROPHONE_DENIED');
            }

            // 2. Establish WebSocket connection to backend proxy
            return new Promise((resolve, reject) => {
                let wsUrl = '';
                if (this.serverUrl) {
                    wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/gemini-live';
                } else if (typeof window !== 'undefined' && window.location) {
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    wsUrl = `${protocol}//${window.location.host}/api/gemini-live`;
                } else {
                    wsUrl = 'ws://localhost:3000/api/gemini-live';
                }

                try {
                    const WsClass = (typeof WebSocket !== 'undefined') ? WebSocket : (typeof globalThis !== 'undefined' ? globalThis.WebSocket : null);
                    if (!WsClass) {
                        throw new Error('WebSocket is not supported in this environment');
                    }
                    this.ws = new WsClass(wsUrl);
                } catch (wsErr) {
                    this.emitState('ERROR');
                    if (this.callbacks.onError) this.callbacks.onError(wsErr);
                    return reject(wsErr);
                }

                this.ws.onopen = () => {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] Connected to Gemini Live WebSocket proxy.');
                    this.isConnected = true;
                    this.emitState('CONNECTED');

                    // Send Setup Message with ReadyVerse Personality, Context, and 10 Tools
                    this.sendSetupMessage();
                    this.startAudioCapture();
                    resolve(true);
                };

                this.ws.onmessage = async (event) => {
                    try {
                        let data;
                        if (typeof event.data === 'string') {
                            data = JSON.parse(event.data);
                        } else if (event.data instanceof Blob) {
                            const text = await event.data.text();
                            data = JSON.parse(text);
                        }
                        if (data) {
                            this.handleServerMessage(data);
                        }
                    } catch (e) {
                        console.error('[ReadyVerse AI / Gemini] Error parsing server message:', e);
                    }
                };

                let hasHandledError = false;
                this.ws.onerror = (err) => {
                    console.error('[ReadyVerse AI / Gemini] WebSocket error:', err);
                    if (!hasHandledError) {
                        hasHandledError = true;
                        this.emitState('ERROR');
                        if (this.callbacks.onError) {
                            this.callbacks.onError({
                                error: 'GEMINI_CONNECTION_ERROR',
                                message: 'Could not establish real-time connection with Gemini Live API.'
                            });
                        }
                    }
                    reject(err);
                };

                this.ws.onclose = (event) => {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] WebSocket closed:', event.code, event.reason);
                    this.cleanupAudio();
                    this.isConnected = false;
                    if (!hasHandledError && event.code !== 1000 && event.code !== 1005) {
                        hasHandledError = true;
                        this.emitState('DISCONNECTED');
                        if (this.callbacks.onError) {
                            this.callbacks.onError({
                                error: 'WS_CLOSED',
                                message: event.reason || 'Voice connection closed unexpectedly.'
                            });
                        }
                    } else {
                        this.emitState('DISCONNECTED');
                    }
                };
            });
        }

        sendSetupMessage() {
            if (!this.ws || this.ws.readyState !== 1) return;

            const systemPrompt = AIPersonality ? AIPersonality.buildAugmentedPrompt(AIContext ? AIContext.getReadyVerseContext() : {}) : '';
            const functionDeclarations = AITools && typeof AITools.getGeminiFunctionDeclarations === 'function' 
                ? AITools.getGeminiFunctionDeclarations() 
                : [];

            const setupMessage = {
                setup: {
                    model: this.model,
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: this.voice
                                }
                            }
                        }
                    },
                    systemInstruction: {
                        parts: [
                            { text: systemPrompt }
                        ]
                    },
                    tools: [
                        {
                            functionDeclarations: functionDeclarations
                        }
                    ]
                }
            };

            this.ws.send(JSON.stringify(setupMessage));
            (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] Sent session setup with 10 tools and ReadyVerse context.');
        }

        startAudioCapture() {
            if (!this.micStream || typeof window === 'undefined') return;

            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtxClass) return;

                if (!this.audioCtx) {
                    this.audioCtx = new AudioCtxClass();
                }

                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
                // Use ScriptProcessorNode to buffer and downsample audio to 16kHz mono
                const bufferSize = 4096;
                this.micProcessor = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

                this.micProcessor.onaudioprocess = (e) => {
                    if (!this.isConnected || !this.ws || this.ws.readyState !== 1) return;

                    const inputData = e.inputBuffer.getChannelData(0);
                    const sampleRate = e.inputBuffer.sampleRate;
                    
                    // Downsample to 16kHz PCM16
                    const pcm16Data = this.downsampleTo16kHzPCM(inputData, sampleRate);
                    const base64Audio = this.arrayBufferToBase64(pcm16Data.buffer);

                    const audioMessage = {
                        realtimeInput: {
                            mediaChunks: [
                                {
                                    mimeType: 'audio/pcm;rate=16000',
                                    data: base64Audio
                                }
                            ]
                        }
                    };

                    this.ws.send(JSON.stringify(audioMessage));
                };

                this.micSource.connect(this.micProcessor);
                this.micProcessor.connect(this.audioCtx.destination);
                this.emitState('LISTENING');
            } catch (err) {
                console.error('[ReadyVerse AI / Gemini] Error setting up audio capture:', err);
            }
        }

        downsampleTo16kHzPCM(inputSamples, inputSampleRate) {
            const targetSampleRate = 16000;
            if (inputSampleRate === targetSampleRate) {
                const pcm16 = new Int16Array(inputSamples.length);
                for (let i = 0; i < inputSamples.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputSamples[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                return pcm16;
            }

            const ratio = inputSampleRate / targetSampleRate;
            const newLength = Math.round(inputSamples.length / ratio);
            const pcm16 = new Int16Array(newLength);

            for (let i = 0; i < newLength; i++) {
                const originalIndex = Math.floor(i * ratio);
                const s = Math.max(-1, Math.min(1, inputSamples[originalIndex]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            return pcm16;
        }

        arrayBufferToBase64(buffer) {
            let binary = '';
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
        }

        base64ToFloat32(base64Str, targetSampleRate = 24000) {
            const binary = typeof atob !== 'undefined' ? atob(base64Str) : Buffer.from(base64Str, 'base64').toString('binary');
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768.0;
            }
            return float32;
        }

        async handleServerMessage(data) {
            // 1. Setup complete confirmation
            if (data.setupComplete) {
                (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] Setup complete received from Gemini.');
                this.emitState('LISTENING');
                return;
            }

            // 2. Structured error from backend proxy
            if (data.error) {
                console.error('[ReadyVerse AI / Gemini] Server reported error:', data.error, data.message);
                if (this.callbacks.onError) {
                    this.callbacks.onError(data);
                }
                this.emitState('ERROR');
                return;
            }

            // 3. Server content stream (audio, text, turn completions, interruptions)
            if (data.serverContent) {
                const content = data.serverContent;

                if (content.interrupted) {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] Interruption received! Halting audio playback.');
                    this.stopPlaybackQueue();
                    this.emitState('LISTENING');
                    if (this.callbacks.onInterrupted) this.callbacks.onInterrupted();
                    return;
                }

                if (content.modelTurn && content.modelTurn.parts) {
                    for (const part of content.modelTurn.parts) {
                        // Native audio chunk from Gemini (24kHz PCM)
                        if (part.inlineData && part.inlineData.data) {
                            this.emitState('SPEAKING');
                            this.queueAudioPlayback(part.inlineData.data, 24000);
                        }

                        // Text transcript chunk
                        if (part.text) {
                            if (this.callbacks.onTranscript) {
                                this.callbacks.onTranscript({
                                    speaker: 'assistant',
                                    text: part.text,
                                    isDelta: true
                                });
                            }
                        }
                    }
                }

                if (content.turnComplete) {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / Gemini] Turn complete.');
                    if (this.callbacks.onTranscript) {
                        this.callbacks.onTranscript({
                            speaker: 'assistant',
                            text: '',
                            isFinal: true
                        });
                    }
                }
            }

            // 4. Tool/Function Calls from Gemini
            if (data.toolCall && data.toolCall.functionCalls) {
                this.emitState('THINKING');
                for (const call of data.toolCall.functionCalls) {
                    (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI / Gemini] Executing tool: ${call.name}`, call.args);
                    let result;
                    try {
                        result = await AITools.executeTool(call.name, call.args || {});
                    } catch (toolErr) {
                        result = { error: toolErr.message || 'Tool execution failed' };
                    }

                    if (this.callbacks.onToolCall) {
                        this.callbacks.onToolCall({
                            name: call.name,
                            args: call.args,
                            result: result
                        });
                    }

                    // Return tool response to Gemini
                    this.sendToolResponse({
                        name: call.name,
                        id: call.id,
                        result: result
                    });
                }
            }
        }

        queueAudioPlayback(base64Audio, sampleRate = 24000) {
            if (typeof window === 'undefined') return;

            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (!this.audioCtx && AudioCtxClass) {
                    this.audioCtx = new AudioCtxClass();
                }

                if (!this.audioCtx) return;
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                const float32Samples = this.base64ToFloat32(base64Audio, sampleRate);
                if (float32Samples.length === 0) return;

                const audioBuffer = this.audioCtx.createBuffer(1, float32Samples.length, sampleRate);
                audioBuffer.getChannelData(0).set(float32Samples);

                const source = this.audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.audioCtx.destination);

                const now = this.audioCtx.currentTime;
                const startTime = Math.max(now, this.nextPlayTime);
                source.start(startTime);
                this.nextPlayTime = startTime + audioBuffer.duration;

                this.activeSources.push(source);
                source.onended = () => {
                    this.activeSources = this.activeSources.filter(s => s !== source);
                    if (this.activeSources.length === 0 && this.audioCtx && this.audioCtx.currentTime >= this.nextPlayTime) {
                        this.emitState('LISTENING');
                    }
                };
            } catch (err) {
                console.error('[ReadyVerse AI / Gemini] Error playing audio chunk:', err);
            }
        }

        stopPlaybackQueue() {
            if (this.activeSources && this.activeSources.length > 0) {
                this.activeSources.forEach(source => {
                    try {
                        source.stop();
                        source.disconnect();
                    } catch (e) {}
                });
                this.activeSources = [];
            }
            if (this.audioCtx) {
                this.nextPlayTime = this.audioCtx.currentTime;
            }
        }

        sendTextMessage(text) {
            if (!this.ws || this.ws.readyState !== 1) {
                console.warn('[ReadyVerse AI / Gemini] Cannot send text; WebSocket is not open.');
                return false;
            }

            const clientContentMsg = {
                clientContent: {
                    turns: [
                        {
                            role: 'user',
                            parts: [
                                { text: text }
                            ]
                        }
                    ],
                    turnComplete: true
                }
            };

            this.ws.send(JSON.stringify(clientContentMsg));
            this.emitState('THINKING');
            return true;
        }

        sendToolResponse(toolResponse) {
            if (!this.ws || this.ws.readyState !== 1) return;

            const responseMsg = {
                toolResponse: {
                    functionResponses: [
                        {
                            name: toolResponse.name,
                            id: toolResponse.id,
                            response: {
                                output: toolResponse.result
                            }
                        }
                    ]
                }
            };

            this.ws.send(JSON.stringify(responseMsg));
        }

        sendUserAudioChunk(base64Pcm) {
            if (!this.ws || this.ws.readyState !== 1) return;

            const msg = {
                realtimeInput: {
                    mediaChunks: [
                        {
                            mimeType: 'audio/pcm;rate=16000',
                            data: base64Pcm
                        }
                    ]
                }
            };
            this.ws.send(JSON.stringify(msg));
        }

        emitState(state) {
            if (this.callbacks && this.callbacks.onStateChange) {
                this.callbacks.onStateChange(state);
            }
        }

        cleanupAudio() {
            this.stopPlaybackQueue();
            if (this.micProcessor) {
                try { this.micProcessor.disconnect(); } catch (e) {}
                this.micProcessor = null;
            }
            if (this.micSource) {
                try { this.micSource.disconnect(); } catch (e) {}
                this.micSource = null;
            }
            if (this.micStream) {
                try {
                    this.micStream.getTracks().forEach(t => t.stop());
                } catch (e) {}
                this.micStream = null;
            }
        }

        disconnect() {
            this.cleanupAudio();
            if (this.ws) {
                try {
                    this.ws.close();
                } catch (e) {}
                this.ws = null;
            }
            this.isConnected = false;
            this.emitState('DISCONNECTED');
        }

        async sendChatFallback(options = {}) {
            const endpoint = `${this.serverUrl}/api/chat`;
            const systemPrompt = options.systemInstruction || 
                (AIPersonality ? AIPersonality.buildAugmentedPrompt(AIContext ? AIContext.getReadyVerseContext() : {}) : '');

            const payload = {
                provider: 'gemini',
                model: options.model || this.chatModel || 'gemini-3.5-flash-lite',
                messages: options.messages || [],
                systemInstruction: systemPrompt,
                tools: options.tools || (AITools && typeof AITools.getGeminiFunctionDeclarations === 'function' ? AITools.getGeminiFunctionDeclarations() : []),
                temperature: typeof options.temperature === 'number' ? options.temperature : 0.7
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || `Gemini Chat request failed with status ${res.status}`);
            }

            return await res.json();
        }
    }

    return GeminiLiveProvider;
}));
