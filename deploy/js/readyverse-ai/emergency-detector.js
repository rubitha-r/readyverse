/**
 * ReadyVerse AI — Emergency Intent Detector (Phase 2)
 * Distinguishes between "HAPPENING NOW" live crises vs "STUDY / CURRICULUM" safety inquiries.
 * Works across English, Tamil script, and Tanglish.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseEmergencyDetector = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Patterns indicating a real-time crisis happening right now
    const LIVE_EMERGENCY_PATTERNS = [
        // English
        /\b(my room is on fire|building is on fire|we are trapped|trapped inside|room on fire|actively burning|clothes caught fire|my clothes are on fire)\b/i,
        /\b(earthquake now|ground is shaking now|building is shaking now|roof is collapsing|walls cracking)\b/i,
        /\b(flood water entering|water is rising fast|water inside room|drowning|swept away)\b/i,
        /\b(friend is not breathing|not breathing|unconscious|heavy bleeding|bleeding heavily|electrocuted|heart attack|chest pain)\b/i,
        /\b(help me now|emergency now|call 112 now|save me|fire now|cyclone roof blown)\b/i,

        // Tamil Script
        /(தீப்பற்றி எரிகிறது|தீ விபத்து இப்போது|நாங்கள் மாட்டிக்கொண்டோம்|சுவாசிக்கவில்லை|மயங்கி விழுந்தார்|அவசரமாக வாருங்கள்|உடனடியாக காப்பாற்றுங்கள்)/,

        // Tanglish
        /\b(thee pidichuruchu|thee pidichirukku|room-la thee|hostel-la thee|thee pathikichu|thee eriyudhu)\b/i,
        /\b(earthquake ippo|shaking ippo|building aaduradhu|wall crack aagudhu)\b/i,
        /\b(vellam ulla varudhu|water mela varudhu|room-kulla thanni|thanni kulla maatikittom)\b/i,
        /\b(swasam illa|moochu vidala|unconscious aagitaan|blood kottudhu|current shock adichudhu)\b/i,
        /\b(udane vaanga|ippo help venum|kaapathunga|maatikittom)\b/i
    ];

    // Study / educational indicator patterns
    const STUDY_PATTERNS = [
        /\b(what do i do in a fire|what to do in a fire|explain|how does|what is|protocol|technique|guidelines|steps for|tell me about|quiz|lesson)\b/i,
        /\b(pass protocol|pass technique|stop drop and roll|drop cover and hold|vertical evacuation)\b/i,
        /(எவ்வாறு தப்புவது|முறை என்ன|விளக்கவும்|பாடக்குறிப்பு)/,
        /\b(epdi|eppadi|enna pannanum|explain pannu|solren|solla mudiyuma|steps sollu)\b/i
    ];

    class EmergencyDetector {
        /**
         * Evaluates whether a query represents a happening-now crisis.
         * @param {string} text 
         * @returns {object} { isLiveEmergency: boolean, hazard: string, confidence: number }
         */
        detect(text) {
            if (!text || typeof text !== 'string') {
                return { isLiveEmergency: false, hazard: null, confidence: 0 };
            }

            const clean = text.trim();
            const lower = clean.toLowerCase();

            // Check if study indicators dominate without urgent panic words
            const hasStudyIntent = STUDY_PATTERNS.some(p => p.test(clean));
            const hasLiveEmergency = LIVE_EMERGENCY_PATTERNS.some(p => p.test(clean));

            // If it explicitly asks "what do I do in a fire" or "explain", it is study, NOT a live emergency
            if (hasStudyIntent && !hasLiveEmergency) {
                return { isLiveEmergency: false, hazard: this.identifyHazard(lower), confidence: 0.1 };
            }

            if (hasLiveEmergency) {
                return {
                    isLiveEmergency: true,
                    hazard: this.identifyHazard(lower),
                    confidence: 0.95
                };
            }

            return { isLiveEmergency: false, hazard: this.identifyHazard(lower), confidence: 0 };
        }

        isEmergency(text) {
            const res = this.detect(text);
            return Boolean(res && res.isLiveEmergency);
        }

        getEmergencyResponse(text, lang = 'english') {
            const hazard = this.identifyHazard((text || '').toLowerCase());
            if (lang === 'tamil') {
                if (hazard === 'fire') {
                    return "உடனடியாக 112 அல்லது 101 ஐ அழைக்கவும்! புகைக்குக் கீழே குனிந்து தவழ்ந்து சென்று, லிஃப்டை பயன்படுத்தாமல் படிக்கட்டுகள் வழியே உடனடியாக வெளியேறவும்!";
                }
                return "உடனடியாக 112 அல்லது 108 ஐ அழைக்கவும்! பாதிக்கப்பட்டவரை பாதுகாப்பான இடத்திற்கு நகர்த்தி, சுவாசம் உள்ளதா என சோதிக்கவும். உதவி வரும் வரை அமைதியாக இருங்கள்.";
            }
            if (lang === 'tanglish') {
                if (hazard === 'fire') {
                    return "Call 112 now! Smoke keezha crawl pannitu emergency stairs vazhiya udane velila ponga bro! Lift kandippa use panna koodathu!";
                }
                return "Call 112 now! Ambulance-ku 108 call pannunga. Victim-ah recovery position-la vainga, breath irukannu check pannunga. Help vara varaikum koodave irunga bro.";
            }
            // English default
            if (hazard === 'fire') {
                return "Call 112 now! Evacuate immediately via marked stairs, stay low under smoke, and never use elevators.";
            }
            return "Call 112 now! Check airways, place the victim in the lateral recovery position if unconscious, and call 108 for an ambulance immediately.";
        }

        identifyHazard(text) {
            if (/fire|thee|smoke|burn|extinguish|alarm|தீ/.test(text)) return 'fire';
            if (/flood|water|vellam|swim|swiftwater|வெள்ளம்/.test(text)) return 'flood';
            if (/cyclone|wind|storm|puyal|eye of the storm|புயல்/.test(text)) return 'cyclone';
            if (/earthquake|shaking|drop cover|nilanadukkam|நிலநடுக்கம்/.test(text)) return 'earthquake';
            if (/electrical|shock|wire|breaker|current/.test(text)) return 'electrical';
            if (/medical|breathing|bleeding|wound|unconscious|recovery position/.test(text)) return 'medical';
            return 'general';
        }
    }

    const defaultInstance = new EmergencyDetector();
    defaultInstance.EmergencyDetector = EmergencyDetector;
    return defaultInstance;
}));
