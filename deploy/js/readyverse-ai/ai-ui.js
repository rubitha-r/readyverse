/**
 * ReadyVerse AI — Universal User Interface Layer
 * Manages floating trigger, voice/chat modal, waveform visualizer,
 * live transcripts, contextual suggestion chips, mobile viewport pinning,
 * voice recognition (SpeechRecognition) & read-aloud (SpeechSynthesis).
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./ai-context', './ai-transport'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const context = require('./ai-context');
        const transport = require('./ai-transport');
        module.exports = factory(context, transport);
    } else {
        root.ReadyVerseAIUI = factory(root.ReadyVerseAIContext, root.ReadyVerseAITransport);
    }
}(typeof self !== 'undefined' ? self : this, function (AIContext, AITransportClass) {
    'use strict';

    class ReadyVerseAIUI {
        constructor() {
            this.transport = new AITransportClass();
            this.isOpen = false;
            this.isVoiceActive = false;
            this.isListening = false;
            this.speechLang = 'en-IN';
            this.isTtsEnabled = false;
            this._lastUserMessage = '';

            try {
                this.isTtsEnabled = localStorage.getItem('readyverse_ai_tts_enabled') === 'true';
            } catch (_) {}

            this.dom = {};
            this.init();
        }

        init() {
            if (typeof document === 'undefined') return;

            this.createDOM();
            this.bindEvents();
            this.setupTransportListeners();
            this.scheduleCoachmark();
            this.setupViewportListener();
        }

        createDOM() {
            // 1. Floating Trigger Button
            const trigger = document.createElement('button');
            trigger.id = 'rvAiFloatingTrigger';
            trigger.className = 'rv-ai-floating-trigger';
            trigger.setAttribute('aria-label', 'Ask ReadyVerse AI. Open chat or talk.');
            trigger.setAttribute('aria-haspopup', 'dialog');
            trigger.setAttribute('aria-controls', 'rvAiModalOverlay');
            trigger.innerHTML = `
                <div class="rv-ai-trigger-orb">🤖</div>
                <div class="rv-ai-trigger-label">
                    <span class="title">Ask ReadyVerse AI (Beta)</span>
                    <span class="sub">Chat or Talk</span>
                </div>
            `;
            document.body.appendChild(trigger);
            this.dom.trigger = trigger;

            const coachmark = document.createElement('div');
            coachmark.id = 'rvAiCoachmark';
            coachmark.className = 'rv-ai-coachmark';
            coachmark.setAttribute('role', 'tooltip');
            coachmark.innerHTML = '<span>Meet your ReadyVerse AI (Beta)</span><span>Ask or speak about any part of ReadyVerse.</span><button type="button" aria-label="Dismiss introduction">×</button>';
            document.body.appendChild(coachmark);
            trigger.setAttribute('aria-describedby', 'rvAiCoachmark');
            this.dom.coachmark = coachmark;

            // 2. Modal Overlay & Window
            const overlay = document.createElement('div');
            overlay.id = 'rvAiModalOverlay';
            overlay.className = 'rv-ai-modal-overlay';
            overlay.innerHTML = `
                <div class="rv-ai-window" role="dialog" aria-modal="true" aria-labelledby="rvAiHeaderTitle">
                    <!-- Header -->
                    <div class="rv-ai-header">
                        <div class="rv-ai-header-left">
                            <div class="rv-ai-avatar">🛡️</div>
                            <div class="rv-ai-title-wrap">
                                <h3 id="rvAiHeaderTitle">ReadyVerse AI (Beta)</h3>
                                <div class="rv-ai-status-pill">
                                    <span class="rv-ai-status-dot" id="rvAiStatusDot"></span>
                                    <span id="rvAiStatusText">Ready</span>
                                </div>
                            </div>
                        </div>
                        <div class="rv-ai-header-actions">
                            <button class="rv-ai-clear-btn" id="rvAiClearBtn" title="Clear chat conversation" aria-label="Clear chat">Clear</button>
                            <button class="rv-ai-tts-toggle-btn" id="rvAiTtsToggleBtn" title="Toggle AI voice replies read-aloud" aria-label="Toggle voice output" aria-pressed="false">
                                <span class="tts-icon">🔇</span>
                                <span class="tts-label">Voice: OFF</span>
                            </button>
                            <button class="rv-ai-close-btn" id="rvAiCloseBtn" title="Close Companion" aria-label="Close ReadyVerse AI">&times;</button>
                        </div>
                    </div>

                    <!-- Error Alert Banner -->
                    <div class="rv-ai-error-banner" id="rvAiErrorBanner" style="display: none;">
                        <span id="rvAiErrorIcon">ℹ️</span>
                        <span id="rvAiErrorMessage">ReadyVerse AI is ready to help with your safety drills.</span>
                    </div>

                    <!-- Voice Waveform Stage -->
                    <div class="rv-ai-visualizer-bar">
                        <div class="rv-ai-waveform" id="rvAiWaveform">
                            <div class="rv-ai-waveform-bar"></div>
                            <div class="rv-ai-waveform-bar"></div>
                            <div class="rv-ai-waveform-bar"></div>
                            <div class="rv-ai-waveform-bar"></div>
                            <div class="rv-ai-waveform-bar"></div>
                        </div>
                        <div class="rv-ai-mode-tags">
                            <span class="rv-ai-tag active">EN / தமிழ் / Tanglish</span>
                            <button type="button" class="rv-ai-tag rv-ai-lang-pill" id="rvAiLangPill" title="Tap to toggle speech recognition language (en-IN / ta-IN)" aria-label="Toggle voice language">Mic: en-IN</button>
                            <span class="rv-ai-tag" id="rvAiActiveContextTag">Command Center</span>
                        </div>
                    </div>

                    <!-- Transcript Stream -->
                    <div class="rv-ai-transcript" id="rvAiTranscript">
                        <div class="rv-ai-bubble-wrap assistant initial-welcome">
                            <div class="rv-ai-bubble">
                                Hey! I'm your ReadyVerse disaster preparedness AI coach (Beta). You can speak or chat with me in English, Tamil, or Tanglish about your drills, fire safety, flood response, or emergency protocols. How can I help right now?
                            </div>
                            <div class="rv-ai-bubble-meta-row">
                                <span class="rv-ai-bubble-meta">ReadyVerse AI · Coach (Beta)</span>
                                <span class="rv-ai-source-badge builtin">Built-in</span>
                            </div>
                        </div>
                    </div>

                    <!-- Contextual Suggestion Chips -->
                    <div class="rv-ai-chips-wrap" id="rvAiChipsWrap"></div>

                    <!-- Controls & Text Input -->
                    <div class="rv-ai-footer">
                        <button class="rv-ai-mic-btn" id="rvAiMicBtn" title="Start voice input" aria-label="Talk to ReadyVerse AI">
                            🎙️
                        </button>
                        <div class="rv-ai-input-wrap">
                            <input type="text" class="rv-ai-input" id="rvAiTextInput" aria-label="Chat with ReadyVerse AI" placeholder="Chat in English, Tamil, or Tanglish..." autocomplete="off">
                            <button class="rv-ai-send-btn" id="rvAiSendBtn" title="Send message" aria-label="Send chat message">➔</button>
                        </div>
                    </div>

                    <!-- AI COACH DISCLAIMER & LIMITATIONS -->
                    <div class="rv-ai-disclaimer" id="rvAiDisclaimer">
                        ⚠️ <strong>Beta AI Coach:</strong> Voice recognition and the AI coach need internet. Spoken audio depends on voices installed on the phone. Answers strictly grounded in ReadyVerse disaster lessons. Never invent steps or medical advice. In an emergency, call <strong>112</strong> immediately.
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            this.dom.overlay = overlay;
            this.dom.statusDot = overlay.querySelector('#rvAiStatusDot');
            this.dom.statusText = overlay.querySelector('#rvAiStatusText');
            this.dom.errorBanner = overlay.querySelector('#rvAiErrorBanner');
            if (this.dom.errorBanner) this.dom.errorBanner.style.display = 'none';
            this.dom.errorMessage = overlay.querySelector('#rvAiErrorMessage');
            this.dom.waveform = overlay.querySelector('#rvAiWaveform');
            this.dom.contextTag = overlay.querySelector('#rvAiActiveContextTag');
            this.dom.transcript = overlay.querySelector('#rvAiTranscript');
            this.dom.chipsWrap = overlay.querySelector('#rvAiChipsWrap');
            this.dom.micBtn = overlay.querySelector('#rvAiMicBtn');
            this.dom.ttsToggleBtn = overlay.querySelector('#rvAiTtsToggleBtn');
            this.dom.clearBtn = overlay.querySelector('#rvAiClearBtn');
            this.dom.langPill = overlay.querySelector('#rvAiLangPill');
            this.dom.textInput = overlay.querySelector('#rvAiTextInput');
            this.dom.sendBtn = overlay.querySelector('#rvAiSendBtn');
            this.dom.closeBtn = overlay.querySelector('#rvAiCloseBtn');
            this.dom.window = overlay.querySelector('.rv-ai-window');

            this.initSpeechRecognition();
            this.updateTtsToggleUI();
        }

        bindEvents() {
            // Open / Close Modal
            this.dom.trigger.addEventListener('click', () => this.open());
            this.dom.coachmark.querySelector('button').addEventListener('click', () => this.dismissCoachmark());
            this.dom.closeBtn.addEventListener('click', () => this.close());
            this.dom.overlay.addEventListener('click', e => {
                if (e.target === this.dom.overlay) {
                    this.close();
                }
            });

            // Clear Chat
            if (this.dom.clearBtn) {
                this.dom.clearBtn.addEventListener('click', () => this.clearChat());
            }

            // Voice Output (SpeechSynthesis) Toggle
            if (this.dom.ttsToggleBtn) {
                this.dom.ttsToggleBtn.addEventListener('click', () => this.toggleTts());
            }

            // Voice Input Language Toggle (en-IN / ta-IN)
            if (this.dom.langPill) {
                this.dom.langPill.addEventListener('click', () => this.toggleSpeechLang());
            }

            // Microphone Toggle
            this.dom.micBtn.addEventListener('click', () => this.toggleVoiceInput());

            // Text Send
            this.dom.sendBtn.addEventListener('click', () => this.handleTextSubmit());
            this.dom.textInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleTextSubmit();
                }
            });

            // Delegate Retry Clicks in Transcript
            if (this.dom.transcript) {
                this.dom.transcript.addEventListener('click', e => {
                    const retryBtn = e.target.closest('.rv-ai-retry-btn');
                    if (retryBtn) {
                        const retryText = retryBtn.dataset.retryText;
                        if (retryText) {
                            retryBtn.remove();
                            this.sendToCoach(retryText, 'retry');
                        }
                    }
                });
            }

            // ESC key to close
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                    this.dom.trigger.focus();
                } else if (e.key === 'Tab' && this.isOpen) {
                    const items = Array.from(this.dom.window.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
                    if (!items.length) return;
                    const first = items[0], last = items[items.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            });
        }

        setupViewportListener() {
            if (typeof window !== 'undefined' && window.visualViewport) {
                const onResize = () => {
                    if (!this.isOpen || !this.dom.window) return;
                    if (window.innerWidth <= 480) {
                        const vv = window.visualViewport;
                        this.dom.window.style.height = `${vv.height}px`;
                        this.dom.window.style.transform = `translateY(0)`;
                        this.scrollToBottom();
                    }
                };
                window.visualViewport.addEventListener('resize', onResize);
                window.visualViewport.addEventListener('scroll', onResize);
            }
        }

        setupTransportListeners() {
            this.transport.on('stateChange', ({ state, mode, provider, routerStatus }) => {
                this.updateStateUI(state, mode);
            });

            this.transport.on('transcript', item => {
                this.appendTranscript(item);
            });

            this.transport.on('error', err => {
                this.showError(err.message);
                if (this._lastUserMessage) {
                    this.showRetryOption(this._lastUserMessage);
                }
            });

            this.transport.on('availability', ({ availability, reason }) => {
                this.updateAvailabilityUI(availability, reason);
            });

            this.transport.on('failover', ({ from, to, mode, reason }) => {
                this.isVoiceActive = false;
                this.dom.micBtn.classList.remove('active');
                this.dom.micBtn.innerHTML = '🎙️';
                this.updateStateUI('TEXT_MODE', 'text');
            });
        }

        open() {
            this.isOpen = true;
            this.dismissCoachmark();
            this.dom.trigger.classList.remove('attention-once');
            this.dom.overlay.classList.add('active');
            this.updateContextualChips();
            this.clearError();
            if (window.innerWidth <= 480 && window.visualViewport) {
                this.dom.window.style.height = `${window.visualViewport.height}px`;
            }
            setTimeout(() => this.dom.textInput.focus(), 150);
        }

        close() {
            this.isOpen = false;
            this.dom.overlay.classList.remove('active');
            if (this.dom.window) {
                this.dom.window.style.height = '';
            }
            if (this.isListening) {
                this.stopVoiceInput();
            }
            if (this.isVoiceActive) {
                this.stopVoice();
            }
            if (typeof ReadyVerseSpeech !== 'undefined') {
                ReadyVerseSpeech.stop();
            }
            this.dom.trigger.focus();
        }

        clearChat() {
            if (this.transport && typeof this.transport.clearConversationHistory === 'function') {
                this.transport.clearConversationHistory();
            } else if (this.transport && typeof this.transport.clearHistory === 'function') {
                this.transport.clearHistory();
            }
            this.dom.transcript.innerHTML = `
                <div class="rv-ai-bubble-wrap assistant initial-welcome">
                    <div class="rv-ai-bubble">
                        Conversation cleared. How can I assist you with your disaster drills or campus safety today?
                    </div>
                    <div class="rv-ai-bubble-meta-row">
                        <span class="rv-ai-bubble-meta">ReadyVerse AI · Coach (Beta)</span>
                        <span class="rv-ai-source-badge builtin">Built-in</span>
                    </div>
                </div>
            `;
            this.clearError();
            this.updateContextualChips();
        }

        scheduleCoachmark() {
            if (this.coachmarkTimer) return;
            try {
                if (localStorage.getItem('readyverse_ai_intro_seen_v1') === 'true') return;
            } catch (_) { return; }

            const isInsideApp = () => {
                const landing = document.getElementById('landingPage');
                if (!landing) return true;
                return landing.classList.contains('hidden') || landing.style.display === 'none';
            };

            const trySchedule = () => {
                try {
                    if (localStorage.getItem('readyverse_ai_intro_seen_v1') === 'true') return;
                } catch (_) { return; }

                if (isInsideApp() && !this.coachmarkTimer) {
                    this.coachmarkTimer = setTimeout(() => {
                        try {
                            if (localStorage.getItem('readyverse_ai_intro_seen_v1') !== 'true' && isInsideApp() && !this.isOpen) {
                                if (this.dom && this.dom.coachmark) this.dom.coachmark.classList.add('visible');
                                if (this.dom && this.dom.trigger) this.dom.trigger.classList.add('attention-once');
                            }
                        } catch (_) {}
                    }, 8000);
                }
            };

            window.addEventListener('readyverse:app-entered', () => trySchedule());
            document.addEventListener('click', (e) => {
                if (e.target && (e.target.id === 'enterReadyVerse' || e.target.closest('#enterReadyVerse') || e.target.classList?.contains('landing-header-enter-btn') || e.target.getAttribute('onclick')?.includes('openDashboard'))) {
                    setTimeout(trySchedule, 300);
                }
            });

            if (isInsideApp()) {
                trySchedule();
            }
        }

        dismissCoachmark() {
            if (this.coachmarkTimer) {
                clearTimeout(this.coachmarkTimer);
                this.coachmarkTimer = null;
            }
            if (this.dom && this.dom.coachmark) {
                this.dom.coachmark.classList.remove('visible');
            }
            if (this.dom && this.dom.trigger) {
                this.dom.trigger.removeAttribute('aria-describedby');
                this.dom.trigger.classList.remove('attention-once');
            }
            try { localStorage.setItem('readyverse_ai_intro_seen_v1', 'true'); } catch (_) {}
        }

        updateAvailabilityUI(availability, reason = '') {
            if (availability === 'OFFLINE_READY') {
                this.dom.statusText.textContent = 'Offline Ready Mode';
                this.dom.statusDot.className = 'rv-ai-status-dot offline';
                if (reason) {
                    this.showError(reason);
                }
            } else if (availability === 'CLOUD_BACKUP') {
                this.clearError();
                this.dom.statusText.textContent = 'Active · Groq Backup';
                this.dom.statusDot.className = 'rv-ai-status-dot text-mode';
            } else {
                this.clearError();
                this.dom.statusText.textContent = 'Ready';
                this.dom.statusDot.className = 'rv-ai-status-dot';
            }
        }

        initSpeechRecognition() {
            const SpeechRecClass = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
            if (!SpeechRecClass) {
                if (this.dom.micBtn) {
                    this.dom.micBtn.style.display = 'none';
                    this.dom.micBtn.setAttribute('aria-hidden', 'true');
                }
                if (this.dom.langPill) {
                    this.dom.langPill.style.display = 'none';
                }
                return;
            }

            if (this.dom.micBtn) {
                this.dom.micBtn.style.display = '';
                this.dom.micBtn.removeAttribute('aria-hidden');
            }
            if (this.dom.langPill) {
                this.dom.langPill.style.display = '';
            }
            this.updateLangPillUI();
        }

        getSpeechLanguage() {
            if (this.speechLang === 'ta-IN') return 'ta-IN';
            if (this.speechLang === 'en-IN') return 'en-IN';
            return 'en-IN';
        }

        toggleSpeechLang() {
            const current = this.getSpeechLanguage();
            this.speechLang = (current === 'ta-IN') ? 'en-IN' : 'ta-IN';
            this.updateLangPillUI();
            return this.speechLang;
        }

        updateLangPillUI() {
            if (this.dom.langPill) {
                const active = this.getSpeechLanguage();
                this.dom.langPill.textContent = active === 'ta-IN' ? 'Mic: தமிழ் (ta-IN)' : 'Mic: EN (en-IN)';
            }
        }

        toggleVoiceInput() {
            if (this.isListening) {
                this.stopVoiceInput();
            } else {
                this.startVoiceInput();
            }
        }

        startVoiceInput() {
            const SpeechRecClass = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
            if (!SpeechRecClass) {
                this.showError('Speech recognition is not supported on this browser. Please chat via text.');
                return;
            }

            if (typeof ReadyVerseSpeech !== 'undefined' && ReadyVerseSpeech.isSpeaking()) {
                ReadyVerseSpeech.stop();
            }

            try {
                if (this.recognition) {
                    try { this.recognition.abort(); } catch (_) {}
                    this.recognition = null;
                }

                this.recognition = new SpeechRecClass();
                this.recognition.continuous = false;
                this.recognition.interimResults = true;
                const activeLang = this.getSpeechLanguage();
                this.recognition.lang = activeLang;

                this.recognition.onstart = () => {
                    this.isListening = true;
                    if (this.dom.micBtn) {
                        this.dom.micBtn.classList.add('active', 'recording');
                        this.dom.micBtn.innerHTML = '⏹️';
                        this.dom.micBtn.setAttribute('aria-pressed', 'true');
                        this.dom.micBtn.setAttribute('title', 'Stop listening');
                    }
                    if (this.dom.statusText) {
                        this.dom.statusText.textContent = `Listening (${activeLang === 'ta-IN' ? 'தமிழ்' : 'English'})...`;
                    }
                    if (this.dom.statusDot) {
                        this.dom.statusDot.className = 'rv-ai-status-dot listening';
                    }
                    if (this.dom.waveform) {
                        this.dom.waveform.classList.add('listening');
                    }
                    this.clearError();
                };

                let finalTranscript = '';
                this.recognition.onresult = (event) => {
                    let interimTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }

                    const display = (finalTranscript || interimTranscript).trim();
                    if (display && this.dom.textInput) {
                        this.dom.textInput.value = display;
                    }

                    if (finalTranscript.trim()) {
                        this.stopVoiceInput();
                        this.sendToCoach(finalTranscript.trim(), 'voice');
                    }
                };

                this.recognition.onerror = (event) => {
                    this.stopVoiceInput();
                    const err = event.error;
                    if (err === 'not-allowed' || err === 'service-not-allowed') {
                        this.showError('Microphone permission was denied. You can continue chatting using text.');
                    } else if (err === 'no-speech') {
                        this.showError('No speech was detected. Tap the mic to try again, or type below.');
                    } else if (err === 'network') {
                        this.showError('Speech recognition network error. Please check your connection or type below.');
                    } else if (err === 'audio-capture') {
                        this.showError('No microphone was detected on this device. You can chat using text.');
                    } else if (err !== 'aborted') {
                        this.showError(`Speech recognition issue (${err}). You can continue typing.`);
                    }
                };

                this.recognition.onend = () => {
                    this.stopVoiceInput();
                };

                this.recognition.start();
            } catch (err) {
                this.stopVoiceInput();
                this.showError('Could not start speech recognition. You can continue typing in text.');
            }
        }

        stopVoiceInput() {
            this.isListening = false;
            if (this.recognition) {
                try { this.recognition.stop(); } catch (_) {}
                this.recognition = null;
            }
            if (this.dom.micBtn) {
                this.dom.micBtn.classList.remove('active', 'recording');
                this.dom.micBtn.innerHTML = '🎙️';
                this.dom.micBtn.setAttribute('aria-pressed', 'false');
                this.dom.micBtn.setAttribute('title', 'Start voice input');
            }
            if (this.dom.waveform) {
                this.dom.waveform.classList.remove('listening');
            }
            this.updateStateUI('DISCONNECTED', 'text');
        }

        toggleTts() {
            this.isTtsEnabled = !this.isTtsEnabled;
            try {
                localStorage.setItem('readyverse_ai_tts_enabled', String(this.isTtsEnabled));
            } catch (_) {}
            this.updateTtsToggleUI();
            if (!this.isTtsEnabled && typeof ReadyVerseSpeech !== 'undefined') {
                ReadyVerseSpeech.stop();
            }
        }

        updateTtsToggleUI() {
            if (!this.dom.ttsToggleBtn) return;
            const icon = this.dom.ttsToggleBtn.querySelector('.tts-icon');
            const label = this.dom.ttsToggleBtn.querySelector('.tts-label');
            if (this.isTtsEnabled) {
                this.dom.ttsToggleBtn.classList.add('active');
                this.dom.ttsToggleBtn.setAttribute('aria-pressed', 'true');
                if (icon) icon.textContent = '🔊';
                if (label) label.textContent = 'Voice: ON';
            } else {
                this.dom.ttsToggleBtn.classList.remove('active');
                this.dom.ttsToggleBtn.setAttribute('aria-pressed', 'false');
                if (icon) icon.textContent = '🔇';
                if (label) label.textContent = 'Voice: OFF';
            }
        }

        cleanTextForSpeech(text) {
            if (!text || typeof text !== 'string') return '';
            return text
                // Remove Markdown links [text](url) -> text
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                // Remove URLs
                .replace(/https?:\/\/\S+/gi, '')
                // Remove bold/italics/code/headers/blockquotes/bullets markdown formatting
                .replace(/[*_#`~>]/g, '')
                .replace(/^[\s-–—*+•]+\s*/gm, '')
                // Remove emojis, pictographs, and variation selectors
                .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '')
                // Normalize multiple spaces / line breaks
                .replace(/\s+/g, ' ')
                .trim();
        }

        speakAssistantReply(text, language) {
            const hasSpeech = (typeof ReadyVerseSpeech !== 'undefined' && ReadyVerseSpeech.isSupported()) ||
                              (typeof window !== 'undefined' && 'speechSynthesis' in window);
            if (!hasSpeech) {
                this.showError('Speech synthesis is not supported on this browser. Reply is displayed in text above.');
                return;
            }

            const cleanText = this.cleanTextForSpeech(text);
            if (!cleanText) return;

            const lang = (language === 'tamil') ? 'ta' : 'en';
            let hasVoice = false;
            if (typeof ReadyVerseSpeech !== 'undefined') {
                hasVoice = ReadyVerseSpeech.hasVoiceForLanguage(lang);
            } else if (typeof window !== 'undefined' && window.speechSynthesis) {
                const voices = window.speechSynthesis.getVoices() || [];
                hasVoice = voices.some(v => v.lang && v.lang.toLowerCase().startsWith(lang));
            }

            if (!hasVoice) {
                const langLabel = (lang === 'ta') ? 'Tamil' : 'English';
                this.showError(`A suitable ${langLabel} voice is not available on this device. Reply is displayed in text above.`);
                return;
            }

            if (typeof ReadyVerseSpeech !== 'undefined') {
                ReadyVerseSpeech.speak({
                    text: cleanText,
                    lang: lang,
                    onStart: () => {
                        if (this.dom.waveform) this.dom.waveform.classList.add('speaking');
                    },
                    onEnd: () => {
                        if (this.dom.waveform) this.dom.waveform.classList.remove('speaking');
                    },
                    onError: () => {
                        if (this.dom.waveform) this.dom.waveform.classList.remove('speaking');
                        this.showError('Spoken audio playback encountered an issue. Reply is displayed in text above.');
                    }
                });
            }
        }

        async handleTextSubmit() {
            const text = this.dom.textInput.value;
            if (!text || !text.trim()) return;
            this.dom.textInput.value = '';
            this.clearError();
            await this.sendToCoach(text, 'typed');
        }

        // =====================================================================
        // UNIFIED UI ENTRY POINT: sendToCoach(message, source)
        // =====================================================================
        async sendToCoach(message, source = 'typed') {
            if (!message || !message.trim()) return;
            const cleanText = message.trim();
            this._lastUserMessage = cleanText;

            // Render user bubble immediately
            this.appendTranscript({
                speaker: 'user',
                text: cleanText,
                isFinal: true
            });

            this.updateStateUI('THINKING', 'text');
            this.clearError();

            try {
                const reply = await this.transport.sendToCoach(cleanText, source);
                return reply;
            } catch (err) {
                console.error('[ReadyVerse AI UI] sendToCoach failed:', err);
                this.showError(err.message || 'Chat request failed. Check your network or provider settings.');
                this.showRetryOption(cleanText);
            }
        }

        showRetryOption(failedText) {
            const lastWrap = this.dom.transcript.querySelector('.rv-ai-bubble-wrap:last-child');
            if (lastWrap && !lastWrap.querySelector('.rv-ai-retry-btn')) {
                const retryBtn = document.createElement('button');
                retryBtn.className = 'rv-ai-retry-btn';
                retryBtn.type = 'button';
                retryBtn.dataset.retryText = failedText;
                retryBtn.innerHTML = '↻ Retry message';
                lastWrap.appendChild(retryBtn);
                this.scrollToBottom();
            }
        }

        updateStateUI(state, mode) {
            this.dom.waveform.className = 'rv-ai-waveform';
            this.dom.statusDot.className = 'rv-ai-status-dot';

            if (this.transport.availability === 'OFFLINE_READY') {
                this.dom.statusText.textContent = 'Offline Ready Mode';
                this.dom.statusDot.classList.add('offline');
                return;
            }

            if (state === 'THINKING') {
                this.dom.statusText.textContent = 'Thinking...';
                this.dom.statusDot.classList.add('thinking');
            } else if (state === 'ERROR') {
                this.dom.statusText.textContent = 'Alert';
                this.dom.statusDot.classList.add('error');
            } else {
                this.dom.statusText.textContent = 'Ready';
            }
        }

        appendTranscript(item) {
            if (!item || !item.text) return;
            const text = item.text;
            const role = item.role || item.speaker || 'assistant';
            const language = item.language || (this.transport && this.transport.lastDetectedLanguage) || 'english';
            const isFinal = item.isFinal !== false;
            const isSystemNotice = Boolean(item.isSystemNotice);
            const sourceTag = item.sourceTag || (role === 'user' ? null : 'Built-in');

            const wrap = document.createElement('div');
            wrap.className = `rv-ai-bubble-wrap ${role}${isSystemNotice ? ' system-notice' : ''}`;

            const langBadge = language === 'tamil' ? 'தமிழ்' : (language === 'tanglish' ? 'Tanglish' : 'EN');
            const authorName = role === 'user' ? 'You' : (isSystemNotice ? 'ReadyVerse System' : 'ReadyVerse AI');

            if (isSystemNotice) {
                wrap.innerHTML = `
                    <div class="rv-ai-bubble rv-ai-bubble-system">
                        <span class="rv-ai-notice-icon">ℹ️</span>
                        <span>${this.escapeHTML(text)}</span>
                    </div>
                    <span class="rv-ai-bubble-meta">${authorName}</span>
                `;
            } else if (role === 'user') {
                wrap.innerHTML = `
                    <div class="rv-ai-bubble">${this.escapeHTML(text)}</div>
                    <span class="rv-ai-bubble-meta">${authorName}</span>
                `;
            } else {
                const tagClass = sourceTag === 'AI' ? 'ai' : 'builtin';
                wrap.innerHTML = `
                    <div class="rv-ai-bubble">${this.escapeHTML(text)}</div>
                    <div class="rv-ai-bubble-meta-row">
                        <span class="rv-ai-bubble-meta">${authorName} · ${langBadge}</span>
                        <span class="rv-ai-source-badge ${tagClass}">${sourceTag}</span>
                    </div>
                `;
            }

            this.dom.transcript.appendChild(wrap);
            this.scrollToBottom();

            // Voice Output: Read assistant response aloud if Voice Output toggle is ON
            if (this.isTtsEnabled && role === 'assistant' && !isSystemNotice && isFinal) {
                this.speakAssistantReply(text, language);
            }
        }

        updateContextualChips() {
            const context = AIContext.getReadyVerseContext();
            const activePage = context.activePage || 'dashboard';

            let chips = [];
            let contextLabel = 'Command Center';

            switch (activePage) {
                case 'simulation':
                    contextLabel = `Mission: ${(context.mission && context.mission.missionTitle) || 'Active'}`;
                    chips = [
                        { label: 'What is the safest option?', text: 'What is the safest option in this current situation and why?' },
                        { label: 'Why avoid the lift?', text: 'Why should I avoid using the lift in this situation?' },
                        { label: 'Explain in Tanglish', text: 'Intha situation-la enna pannanum nu Tanglish-la sollunga.' },
                        { label: 'Why crawl low under smoke?', text: 'Why is crawling low under smoke necessary during evacuation?' }
                    ];
                    break;
                case 'learningHub':
                    contextLabel = `Learn: ${(context.learn && context.learn.activeModule && context.learn.activeModule.title) || 'Catalog'}`;
                    chips = [
                        { label: 'Explain this simply', text: 'Can you explain the main safety rules of this module simply like I am a first-year student?' },
                        { label: 'Give a real campus example', text: 'Give me a realistic campus example of this emergency protocol.' },
                        { label: 'Tamil-la explain pannunga', text: 'Intha module safety rules pathi Tamil-la explain pannunga.' },
                        { label: 'Ask me a practice question', text: 'Ask me a realistic disaster check question to test my understanding.' }
                    ];
                    break;
                case 'preparedness':
                    contextLabel = 'Preparedness Plan';
                    chips = [
                        { label: 'What should I complete next?', text: 'What preparedness action should I complete next for maximum readiness?' },
                        { label: 'How to make a student go-bag?', text: 'What essential items should I pack in my student emergency go-bag?' },
                        { label: 'Which category am I weakest in?', text: 'Which preparedness category do I have the lowest completion in?' },
                        { label: 'Explain in Tanglish', text: 'Emergency contacts eppadi ready pannanum nu Tanglish-la sollunga.' }
                    ];
                    break;
                case 'passport':
                    contextLabel = 'Readiness Passport';
                    chips = [
                        { label: 'Why is my readiness score this?', text: 'Why is my readiness score at this current percentage? Break down the calculation.' },
                        { label: 'How to reach Level 5?', text: 'What do I need to complete to reach Level 5 and unlock new responder gear?' },
                        { label: 'What is my next milestone?', text: 'What is my next major capability milestone in ReadyVerse?' }
                    ];
                    break;
                case 'campusStudio':
                    contextLabel = 'Campus Studio';
                    chips = [
                        { label: 'Explain tabletop scenario', text: 'Explain the current campus tabletop emergency scenario and key objectives.' },
                        { label: 'What is an assembly point?', text: 'How should a campus designated assembly point be managed during a mass evacuation?' }
                    ];
                    break;
                default:
                    contextLabel = 'Command Center';
                    chips = [
                        { label: 'What should I do next?', text: 'What is the highest-impact action I should do next to improve my readiness?' },
                        { label: 'Explain my readiness score', text: 'Explain how my readiness score is calculated using the 40/30/30 formula.' },
                        { label: 'Tanglish overview', text: 'ReadyVerse platform-la enna ellam irukku nu Tanglish-la explain pannunga.' },
                        { label: 'Tell me about Building Fire', text: 'Tell me about the Building Fire simulation and what instincts it trains.' }
                    ];
                    break;
            }

            // Mandatory E2 suggested chips: "What do I do in a fire?" and "Quiz me"
            chips.unshift(
                { label: 'What do I do in a fire?', text: 'What do I do in a fire?' },
                { label: 'Quiz me', text: 'Quiz me' }
            );

            this.dom.contextTag.textContent = contextLabel;
            this.dom.chipsWrap.innerHTML = '';

            chips.forEach(c => {
                const btn = document.createElement('button');
                btn.className = 'rv-ai-chip';
                btn.type = 'button';
                btn.textContent = c.label;
                btn.addEventListener('click', () => {
                    this.sendToCoach(c.text, 'chip');
                });
                this.dom.chipsWrap.appendChild(btn);
            });
        }

        showError(message) {
            this.dom.errorBanner.style.display = 'flex';
            this.dom.errorMessage.textContent = message || 'The AI friend is offline right now. Check the lessons or call 112.';
        }

        clearError() {
            this.dom.errorBanner.style.display = 'none';
            this.dom.errorMessage.textContent = '';
        }

        scrollToBottom() {
            this.dom.transcript.scrollTop = this.dom.transcript.scrollHeight;
        }

        escapeHTML(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    // Auto-instantiate when DOM is ready
    let instance = null;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                instance = new ReadyVerseAIUI();
                window.readyVerseAI = instance;
            });
        } else {
            instance = new ReadyVerseAIUI();
            window.readyVerseAI = instance;
        }
    }

    return ReadyVerseAIUI;
}));
