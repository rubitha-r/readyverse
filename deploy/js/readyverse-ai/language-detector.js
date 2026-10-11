/**
 * ReadyVerse AI — Multilingual Intent & Language Detector (Phase 3)
 * Classifies input into: 'english' | 'tamil' | 'tanglish'
 * Supports sticky session language, explicit language overrides,
 * Tamil Unicode script detection, and Tamil-lexicon Latin tokenization.
 * 
 * Works universally in Browser and Node.js.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseLanguageDetector = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Tamil Unicode Block: U+0B80 to U+0BFF
    const TAMIL_SCRIPT_REGEX = /[\u0B80-\u0BFF]/;

    // Explicit request patterns (highest priority)
    const EXPLICIT_PATTERNS = [
        { lang: 'tamil', regex: /\b(in\s+tamil|tamil[\s\-]*la|tamilil|tamizh)\b/i },
        { lang: 'tanglish', regex: /\b(in\s+tanglish|tanglish[\s\-]*la|tanglishil)\b/i },
        { lang: 'english', regex: /\b(in\s+english|english[\s\-]*la|englishil|angilathil)\b/i }
    ];

    // Core Tanglish lexicon tokens (stems, particles, question words, verbs)
    const TANGLISH_TOKENS = new Set([
        'ena', 'enna', 'pandra', 'panra', 'panna', 'pannu', 'pannunga', 'panradhu', 'pannalam',
        'irukku', 'iruku', 'irukkum', 'irundha', 'iruntha',
        'sollu', 'solunga', 'sollunga', 'solren', 'solla',
        'epdi', 'eppadi', 'yeppadi', 'enakku', 'enaku', 'unnakku', 'unakku',
        'venum', 'vendum', 'vendam', 'venam', 'theva',
        'ellam', 'yellam', 'romba', 'seri', 'sari', 'aama', 'aamam', 'illa', 'illai',
        'nu', 'la', 'ku', 'dhaan', 'than', 'dhan', 'kooda', 'koodathu', 'kudathu',
        'aagum', 'aagathu', 'illana', 'illanna', 'pathu', 'paathu',
        'vantha', 'vandha', 'thee', 'theeyanai', 'pidicha', 'pidithal',
        'ooda', 'odatheenga', 'nikkanum', 'keezha', 'mela', 'velila', 'ulla',
        'machi', 'machan', 'thambi', 'nanba', 'nanbane', 'thala', 'bro'
    ]);

    // Tanglish suffixes commonly joined with hyphens or trailing
    const TANGLISH_SUFFIX_REGEX = /-(la|ku|a|oda|kitta|um)$/i;

    class LanguageDetector {
        constructor() {
            this.sessionLanguage = 'english';
        }

        resetSession() {
            this.sessionLanguage = 'english';
        }

        setSessionLanguage(lang) {
            if (['english', 'tamil', 'tanglish'].includes(lang)) {
                this.sessionLanguage = lang;
            }
        }

        getSessionLanguage() {
            return this.sessionLanguage;
        }

        /**
         * Detects language of a text message.
         * @param {string} text - Message to classify
         * @param {object} options - { useSticky: boolean, currentSessionLang: string }
         * @returns {object} { language: 'english'|'tamil'|'tanglish', confidence: number, reason: string }
         */
        detect(text, options = {}) {
            if (!text || typeof text !== 'string') {
                return {
                    language: options.currentSessionLang || this.sessionLanguage || 'english',
                    confidence: 0,
                    reason: 'empty_input'
                };
            }

            const clean = text.trim();
            const lower = clean.toLowerCase();

            // 1. Explicit directive in text (Highest Priority)
            for (const item of EXPLICIT_PATTERNS) {
                if (item.regex.test(clean)) {
                    if (options.useSticky !== false) {
                        this.sessionLanguage = item.lang;
                    }
                    return {
                        language: item.lang,
                        confidence: 0.99,
                        reason: `explicit_request:${item.lang}`
                    };
                }
            }

            // 2. Tamil Script Detection (Unicode U+0B80-U+0BFF)
            let tamilCharCount = 0;
            let latinCharCount = 0;
            for (let i = 0; i < clean.length; i++) {
                const code = clean.charCodeAt(i);
                if (code >= 0x0B80 && code <= 0x0BFF) {
                    tamilCharCount++;
                } else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
                    latinCharCount++;
                }
            }

            if (tamilCharCount > 0) {
                if (tamilCharCount >= latinCharCount || tamilCharCount >= 2) {
                    if (options.useSticky !== false) this.sessionLanguage = 'tamil';
                    return {
                        language: 'tamil',
                        confidence: 0.95,
                        reason: 'tamil_script'
                    };
                }
            }

            // 3. Tanglish Lexicon & Token Analysis
            // Normalize words: split by whitespace and common punctuation
            const rawTokens = lower.replace(/[^a-z0-9\-\s]/g, ' ').split(/\s+/).filter(Boolean);
            let tanglishScore = 0;
            let matchedTokens = [];

            for (const token of rawTokens) {
                // Check direct token match
                if (TANGLISH_TOKENS.has(token)) {
                    tanglishScore += 1;
                    matchedTokens.push(token);
                    continue;
                }

                // Check suffix match (e.g. readyverse-la -> readyverse + la)
                if (TANGLISH_SUFFIX_REGEX.test(token)) {
                    tanglishScore += 0.8;
                    matchedTokens.push(token);
                    continue;
                }

                // Suffixes without hyphen: word ending with -la or -ku if stem is > 2 chars
                if ((token.endsWith('la') || token.endsWith('ku')) && token.length > 4) {
                    tanglishScore += 0.6;
                    matchedTokens.push(token);
                    continue;
                }
            }

            // Decision threshold for Tanglish:
            // Short messages (1-4 words) need only 1 solid token (e.g. "Hy ena pandra", "Enna panradhu?", "solren")
            // Longer messages need proportional score
            const tokenCount = rawTokens.length || 1;
            const tanglishRatio = tanglishScore / tokenCount;

            const isTanglish = (tokenCount <= 4 && tanglishScore >= 1) ||
                               (tokenCount > 4 && (tanglishScore >= 2 || tanglishRatio >= 0.25));

            if (isTanglish) {
                if (options.useSticky !== false) this.sessionLanguage = 'tanglish';
                return {
                    language: 'tanglish',
                    confidence: Math.min(0.95, 0.5 + (tanglishScore * 0.15)),
                    reason: `tanglish_lexicon:${matchedTokens.slice(0, 3).join(',')}`
                };
            }

            // 4. Default to English (or sticky session language if text is ambiguous single word like "ok")
            const ambiguousShort = ['ok', 'yes', 'no', 'cool', 'thanks', 'sure', 'super'].includes(lower);
            if (ambiguousShort && this.sessionLanguage && this.sessionLanguage !== 'english') {
                return {
                    language: this.sessionLanguage,
                    confidence: 0.6,
                    reason: 'sticky_session'
                };
            }

            if (options.useSticky !== false) {
                this.sessionLanguage = 'english';
            }
            return {
                language: 'english',
                confidence: 0.9,
                reason: 'english_default'
            };
        }
    }

    const defaultInstance = new LanguageDetector();
    defaultInstance.LanguageDetector = LanguageDetector;
    return defaultInstance;
}));
