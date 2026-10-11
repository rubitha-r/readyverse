/**
 * ReadyVerse - Speech Synthesis & Accessibility Audio Layer (Prompt 6)
 * Pure vanilla Web Speech API (SpeechSynthesis) integration.
 * Supports:
 * - Listening to scenario situations, briefing descriptions, and lesson guidelines.
 * - Language selection (English / தமிழ்).
 * - Friendly microcopy notice when a native voice for the selected language is not installed on the device.
 * - Single-instance audio playback control (stop/pause/resume without overlapping).
 */

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseSpeech = factory();
        root.READYVERSE_SPEECH = root.ReadyVerseSpeech;
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    let activeUtterance = null;
    let activeButton = null;
    let cachedVoices = [];

    function isSupported() {
        return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
    }

    function initVoices() {
        if (!isSupported()) return;
        cachedVoices = window.speechSynthesis.getVoices() || [];
        if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
            window.speechSynthesis.onvoiceschanged = () => {
                cachedVoices = window.speechSynthesis.getVoices() || [];
            };
        }
    }

    if (typeof window !== "undefined") {
        initVoices();
    }

    function findBestVoice(lang = "en") {
        if (!isSupported()) return null;
        if (!cachedVoices.length) {
            cachedVoices = window.speechSynthesis.getVoices() || [];
        }

        const isTamil = lang.toLowerCase().startsWith("ta");
        
        if (isTamil) {
            // Find Tamil voice (ta-IN, ta_IN, ta)
            const taVoice = cachedVoices.find(v => (v.lang && v.lang.toLowerCase().replace("_", "-").startsWith("ta")) || (v.name && v.name.toLowerCase().includes("tamil")));
            return taVoice || null;
        } else {
            // Find Indian English first, then any English
            const enInVoice = cachedVoices.find(v => v.lang && v.lang.toLowerCase().replace("_", "-") === "en-in");
            if (enInVoice) return enInVoice;
            const enVoice = cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith("en"));
            return enVoice || null;
        }
    }

    function hasVoiceForLanguage(lang = "en") {
        if (!isSupported()) return false;
        if (!cachedVoices.length) cachedVoices = window.speechSynthesis.getVoices() || [];
        const isTamil = lang.toLowerCase().startsWith("ta");
        if (isTamil) {
            return !!cachedVoices.some(v => (v.lang && v.lang.toLowerCase().replace("_", "-").startsWith("ta")) || (v.name && v.name.toLowerCase().includes("tamil")));
        }
        return !!cachedVoices.some(v => v.lang && v.lang.toLowerCase().startsWith("en"));
    }

    function cleanTextForSpeech(rawText) {
        if (!rawText) return "";
        // Strip HTML tags and excessive decorative emojis / unicode symbols
        let text = rawText.replace(/<[^>]*>/g, " ");
        text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{2900}-\u{2BFF}]/gu, "");
        text = text.replace(/\s+/g, " ").trim();
        return text;
    }

    function stop() {
        if (isSupported()) {
            window.speechSynthesis.cancel();
        }
        if (activeButton) {
            resetButtonState(activeButton);
            activeButton = null;
        }
        activeUtterance = null;
    }

    function isSpeaking() {
        return isSupported() && window.speechSynthesis.speaking;
    }

    function resetButtonState(button) {
        if (!button) return;
        button.classList.remove("speech-playing");
        button.setAttribute("aria-pressed", "false");
        const label = button.querySelector(".speech-btn-label");
        const icon = button.querySelector(".speech-btn-icon");
        if (label) label.textContent = button.dataset.defaultLabel || "Listen";
        if (icon) icon.textContent = "🔊";
    }

    function setButtonPlayingState(button) {
        if (!button) return;
        button.classList.add("speech-playing");
        button.setAttribute("aria-pressed", "true");
        const label = button.querySelector(".speech-btn-label");
        const icon = button.querySelector(".speech-btn-icon");
        if (label) label.textContent = "Stop";
        if (icon) icon.textContent = "⏹️";
    }

    function speak(options = {}) {
        if (!isSupported()) {
            if (options.onError) options.onError(new Error("Speech synthesis not supported on this browser."));
            return;
        }

        const rawText = options.text || "";
        const text = cleanTextForSpeech(rawText);
        if (!text) return;

        const lang = options.lang || "en";
        const voice = findBestVoice(lang);
        const hasNativeVoice = hasVoiceForLanguage(lang);

        // If currently speaking, stop first
        stop();

        if (options.button) {
            activeButton = options.button;
            setButtonPlayingState(activeButton);
        }

        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.rate = options.rate || (lang.startsWith("ta") ? 0.9 : 1.0);
        utterance.pitch = options.pitch || 1.0;
        utterance.lang = lang.startsWith("ta") ? "ta-IN" : "en-IN";

        if (voice) {
            utterance.voice = voice;
        }

        // Handle missing native voice feedback
        if (lang.startsWith("ta") && !hasNativeVoice && typeof options.onVoiceMissing === "function") {
            options.onVoiceMissing({
                lang: "ta",
                message: "Tamil voice is not available on this device. Install a Tamil speech pack in your OS settings to hear native Tamil audio."
            });
        }

        utterance.onstart = () => {
            if (options.onStart) options.onStart();
        };

        utterance.onend = () => {
            if (options.button) resetButtonState(options.button);
            activeButton = null;
            activeUtterance = null;
            if (options.onEnd) options.onEnd();
        };

        utterance.onerror = (e) => {
            if (options.button) resetButtonState(options.button);
            activeButton = null;
            activeUtterance = null;
            if (options.onError) options.onError(e);
        };

        activeUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    }

    function toggle(options = {}) {
        if (isSpeaking()) {
            stop();
            return false;
        } else {
            speak(options);
            return true;
        }
    }

    return {
        isSupported,
        speak,
        stop,
        toggle,
        isSpeaking,
        hasVoiceForLanguage,
        findBestVoice,
        cleanTextForSpeech
    };
}));
