/**
 * ReadyVerse AI — OpenAI Provider (Realtime WebRTC + Chat Completions)
 * Implements the Provider Base Interface for OpenAI Realtime voice and chat completions.
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
        root.ReadyVerseOpenAIProvider = factory(
            root.ReadyVerseAIProvider,
            root.ReadyVerseAIContext,
            root.ReadyVerseAITools,
            root.ReadyVerseAIPersonality
        );
    }
}(typeof self !== 'undefined' ? self : this, function (ReadyVerseAIProvider, AIContext, AITools, AIPersonality) {
    'use strict';

    class OpenAIProvider extends ReadyVerseAIProvider {
        constructor(config = {}) {
            super('openai', config);
            this.serverUrl = config.serverUrl || '';
            this.model = config.model || 'gpt-4o-realtime-preview';
            this.voice = config.voice || 'alloy';
            this.peerConnection = null;
            this.dataChannel = null;
            this.audioStream = null;
            this.remoteAudio = null;
            this.callbacks = {};
            this.activeAssistantTranscript = '';
        }

        async connectVoice(callbacks = {}) {
            this.callbacks = callbacks;
            this.emitState('CONNECTING');

            try {
                // 1. Fetch ephemeral session token from backend
                const sessionRes = await fetch(`${this.serverUrl}/api/realtime/session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instructions: AIPersonality.buildAugmentedPrompt(AIContext ? AIContext.getReadyVerseContext() : {})
                    })
                });

                if (!sessionRes.ok) {
                    const errData = await sessionRes.json().catch(() => ({}));
                    if (errData.error === 'OPENAI_API_KEY_MISSING') {
                        throw new Error('OPENAI_API_KEY_MISSING');
                    }
                    throw new Error(errData.message || 'Failed to initialize OpenAI Realtime voice session.');
                }

                const sessionData = await sessionRes.json();
                const ephemeralKey = sessionData.client_secret ? sessionData.client_secret.value : sessionData.value;
                if (!ephemeralKey) {
                    throw new Error('No ephemeral client key returned from server session endpoint.');
                }

                // 2. Request user microphone
                try {
                    this.audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                } catch (micErr) {
                    console.warn('[ReadyVerse AI / OpenAI] Microphone access denied or unavailable:', micErr);
                    throw new Error('MICROPHONE_DENIED');
                }

                // 3. Setup WebRTC PeerConnection
                this.peerConnection = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });

                if (!this.remoteAudio && typeof document !== 'undefined') {
                    this.remoteAudio = document.createElement('audio');
                    this.remoteAudio.autoplay = true;
                }

                this.peerConnection.ontrack = event => {
                    if (this.remoteAudio && event.streams && event.streams[0]) {
                        this.remoteAudio.srcObject = event.streams[0];
                    }
                };

                this.audioStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.audioStream);
                });

                // 4. Setup Data Channel
                this.dataChannel = this.peerConnection.createDataChannel('oai-events');
                this.setupDataChannel(this.dataChannel);

                // 5. SDP Offer
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                const baseUrl = 'https://api.openai.com/v1/realtime';
                const model = sessionData.model || this.model;
                const sdpRes = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
                    method: 'POST',
                    body: offer.sdp,
                    headers: {
                        'Authorization': `Bearer ${ephemeralKey}`,
                        'Content-Type': 'application/sdp'
                    }
                });

                if (!sdpRes.ok) {
                    throw new Error(`OpenAI WebRTC SDP exchange failed with status ${sdpRes.status}`);
                }

                const answerSdp = await sdpRes.text();
                await this.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: answerSdp
                });

                this.emitState('CONNECTED');
                return true;
            } catch (err) {
                this.emitState('ERROR');
                if (this.callbacks.onError) this.callbacks.onError(err);
                this.disconnect();
                throw err;
            }
        }

        setupDataChannel(dc) {
            dc.onopen = () => {
                (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / OpenAI] Data channel open. Configuring session...');
                this.emitState('LISTENING');

                // Update session with tools and instructions
                const sessionUpdate = {
                    type: 'session.update',
                    session: {
                        instructions: AIPersonality.buildAugmentedPrompt(AIContext ? AIContext.getReadyVerseContext() : {}),
                        tools: AITools ? AITools.TOOL_DEFINITIONS : [],
                        tool_choice: 'auto'
                    }
                };
                dc.send(JSON.stringify(sessionUpdate));
            };

            dc.onmessage = async event => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleRealtimeEvent(data);
                } catch (e) {
                    console.error('[ReadyVerse AI / OpenAI] Error parsing data channel message:', e);
                }
            };

            dc.onerror = err => {
                console.error('[ReadyVerse AI / OpenAI] Data channel error:', err);
                this.emitState('ERROR');
            };

            dc.onclose = () => {
                (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))('[ReadyVerse AI / OpenAI] Data channel closed.');
                this.emitState('DISCONNECTED');
            };
        }

        async handleRealtimeEvent(event) {
            switch (event.type) {
                case 'session.created':
                case 'session.updated':
                    break;

                case 'input_audio_buffer.speech_started':
                    this.emitState('LISTENING');
                    if (this.callbacks.onTranscript) {
                        this.callbacks.onTranscript({ speaker: 'user', text: '', isDelta: true });
                    }
                    break;

                case 'input_audio_buffer.speech_stopped':
                    this.emitState('THINKING');
                    break;

                case 'response.audio_transcript.delta':
                    this.emitState('SPEAKING');
                    this.activeAssistantTranscript += event.delta || '';
                    if (this.callbacks.onTranscript) {
                        this.callbacks.onTranscript({
                            speaker: 'assistant',
                            text: this.activeAssistantTranscript,
                            isDelta: true
                        });
                    }
                    break;

                case 'response.audio_transcript.done':
                    if (this.callbacks.onTranscript) {
                        this.callbacks.onTranscript({
                            speaker: 'assistant',
                            text: event.transcript || this.activeAssistantTranscript,
                            isFinal: true
                        });
                    }
                    this.activeAssistantTranscript = '';
                    break;

                case 'response.function_call_arguments.done':
                    this.emitState('THINKING');
                    await this.handleToolCall(event);
                    break;

                case 'response.done':
                    this.emitState('LISTENING');
                    break;

                case 'error':
                    console.error('[ReadyVerse AI / OpenAI] Realtime error event:', event.error);
                    if (this.callbacks.onError) this.callbacks.onError(event.error);
                    break;
            }
        }

        async handleToolCall(event) {
            const toolName = event.name;
            const callId = event.call_id;
            let args = {};

            try {
                if (event.arguments) {
                    args = JSON.parse(event.arguments);
                }
            } catch (e) {
                console.warn('[ReadyVerse AI / OpenAI] Error parsing tool arguments JSON:', e);
            }

            (typeof rvLog === "function" ? rvLog : (typeof window !== "undefined" && window.rvLog ? window.rvLog : () => {}))(`[ReadyVerse AI / OpenAI] Executing tool '${toolName}':`, args);
            const result = await AITools.executeTool(toolName, args);

            if (this.callbacks.onToolCall) {
                this.callbacks.onToolCall({ name: toolName, args: args, result: result });
            }

            this.sendToolResponse({
                call_id: callId,
                output: JSON.stringify(result)
            });
        }

        sendToolResponse(toolResponse) {
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
                const responseEvent = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: toolResponse.call_id,
                        output: toolResponse.output
                    }
                };
                this.dataChannel.send(JSON.stringify(responseEvent));
                this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
            }
        }

        sendTextMessage(text) {
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                return false;
            }

            const itemCreate = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        { type: 'input_text', text: text }
                    ]
                }
            };
            this.dataChannel.send(JSON.stringify(itemCreate));
            this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
            this.emitState('THINKING');
            return true;
        }

        sendUserAudioChunk(base64Pcm) {
            // WebRTC automatically streams microphone track
        }

        emitState(state) {
            if (this.callbacks && this.callbacks.onStateChange) {
                this.callbacks.onStateChange(state);
            }
        }

        disconnect() {
            if (this.dataChannel) {
                try { this.dataChannel.close(); } catch (e) {}
                this.dataChannel = null;
            }
            if (this.peerConnection) {
                try { this.peerConnection.close(); } catch (e) {}
                this.peerConnection = null;
            }
            if (this.audioStream) {
                try {
                    this.audioStream.getTracks().forEach(t => t.stop());
                } catch (e) {}
                this.audioStream = null;
            }
            this.emitState('DISCONNECTED');
        }

        async sendChatFallback(options = {}) {
            const endpoint = `${this.serverUrl}/api/chat`;
            const payload = {
                provider: 'openai',
                model: options.model || 'gpt-4o-mini',
                messages: options.messages || [],
                tools: options.tools || (AITools ? AITools.TOOL_DEFINITIONS : []),
                temperature: typeof options.temperature === 'number' ? options.temperature : 0.7
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || `Chat request failed with status ${res.status}`);
            }

            return await res.json();
        }
    }

    return OpenAIProvider;
}));
