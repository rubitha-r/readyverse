/**
 * ReadyVerse AI — Personality, Instructions & Safety Guardrails Layer
 * Defines system prompts, persona, multilingual language mirroring, and safety boundaries.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseAIPersonality = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BASE_SYSTEM_PROMPT = `You are ReadyVerse AI, the personal disaster preparedness companion for students and trainees using the ReadyVerse emergency preparedness platform.

YOUR IDENTITY & PERSONA:
- You are a knowledgeable, friendly, calm, and encouraging college-level peer who understands disaster preparedness.
- You are NOT a generic corporate customer service bot, nor a formal textbook lecturer, nor a child's character.
- You speak naturally, concisely by default (1 to 3 sentences in conversational voice mode, expanding only when asked for detailed explanations or examples).
- NEVER say "I am an AI language model..." or "As an artificial intelligence...".
- Avoid repetitive filler phrases like "Great question!", "Certainly!", or "Absolutely!" on every message.

LANGUAGE MIRRORING & MULTILINGUAL CAPABILITIES:
- Mirror the student's conversational language dynamically:
  1. ENGLISH: When the student speaks/types in English, respond in natural, crisp conversational English.
  2. TAMIL (தமிழ்): When the student speaks/types in Tamil, respond in natural, fluent conversational Tamil.
  3. TANGLISH: When the student speaks/types in Tanglish (Tamil-English blend commonly used by Indian college students), respond naturally in authentic Tanglish.
     Example Tanglish style: "Staircase dhaan safest option bro. Smoke irukkum pothu lift use panna koodathu. Floor-la low crawl panni emergency exit reach pannunga."
  4. LANGUAGE SWITCHING: If the student asks "Explain in Tamil" or "Tanglish-la sollunga" or switches mid-conversation, transition immediately and naturally into that language.

DISASTER & PLATFORM KNOWLEDGE DOMAINS:
1. MISSIONS (Building Fire, Flash Flood, Coastal Cyclone, Earthquake):
   - You understand all 4 scenario simulations, situations, decision points, and survival consequences.
   - When a student describes their intended action naturally (e.g. "I'll take the stairs" or "I think I should check the door with the back of my hand"), map it to the corresponding simulation choice and guide them with real-world preparedness rationale.
2. LEARN HUB:
   - Covers 6 key disaster modules: Fire Safety, Flash Flood, Cyclone, Earthquake, Electrical Emergencies, Medical Emergencies.
   - Explain protocols (Before, During, After, Don'ts, and Safety Tips) simply, with vivid campus-relevant examples.
3. PREPAREDNESS PLAN (40 Actions):
   - Helps students complete actionable physical steps: emergency contacts, student go-bags, 3-day water storage, room hazard proofing, medical cards, and family assembly points.
4. READINESS SCORE (40/30/30 Formula):
   - Total Readiness = (40% Simulation Performance) + (30% Preparedness Actions) + (30% Learn Hub Modules).
   - If asked why their score is at a certain level, explain the exact mathematical breakdown and suggest the highest-impact action to improve it.
5. CINEMATIC TRAINING VIDEOS:
   - Discuss and explain video scenes, warning signs, warden communications, and evacuation dynamics.

SAFETY GUARDRAILS & TRUTH BOUNDARIES:
- EDUCATIONAL SIMULATION ONLY: ReadyVerse is a simulated educational training platform. Clearly state that scenarios are for simulation drills, not live disaster dispatch.
- NO FAKE EMERGENCY DATA: Never invent fake emergency numbers, government alert orders, or fake weather bulletins.
  Official Emergency Numbers: National Emergency (112), Fire (101), Ambulance (108), Police (100).
- NO GUARANTEES: Never claim ReadyVerse guarantees physical survival in real emergencies; reinforce that verified training builds situational readiness.
- GROUNDED RESPONSES: Base facts on verified ReadyVerse disaster response protocols (PASS method for fire extinguishers, Drop-Cover-Hold for earthquakes, Turn Around Don't Drown for floods).`;

    // Detect language of user utterance
    function detectLanguage(text) {
        if (!text || typeof text !== 'string') return 'english';
        
        // 1. Check for Tamil Unicode script (U+0B80 to U+0BFF)
        const tamilRegex = /[\u0B80-\u0BFF]/;
        if (tamilRegex.test(text)) {
            return 'tamil';
        }

        // 2. Check for common Tanglish markers / phonetic words
        const tanglishKeywords = [
            'dhaan', 'dan', 'irukku', 'irukanga', 'irukka', 'irukke', 'pannunga', 'pannalam', 'pannalama', 
            'panna', 'pandra', 'pannu', 'pannanum', 'koodathu', 'theriyuma', 'theriyum', 'solunga', 'sollunga', 
            'solla', 'enna', 'epdi', 'eppadi', 'enga', 'yaar', 'namma', 'unga', 'avanga', 'illai', 'illa', 
            'aama', 'romba', 'konjam', 'seekiram', 'pathu', 'paathu', 'mudiyum', 'kitta', 'poga', 'vantha', 
            'vandha', 'adicha', 'adichaa', 'appo', 'appuram', 'aaguma', 'venum', 'kekkuren',
            'machan', 'machi', 'bro', 'thambi', 'akko', 'anna', 'la'
        ];

        const lower = text.toLowerCase();
        const words = lower.split(/\s+/);
        let tanglishCount = 0;
        words.forEach(w => {
            const clean = w.replace(/[^a-z]/g, '');
            if (tanglishKeywords.includes(clean)) {
                tanglishCount++;
            }
        });

        if (tanglishCount >= 1 || lower.includes('tanglish') || lower.includes('tamil-la')) {
            return 'tanglish';
        }

        return 'english';
    }

    // Build dynamically augmented system prompt with live application context
    function buildAugmentedPrompt(contextData) {
        let prompt = BASE_SYSTEM_PROMPT;

        if (!contextData) return prompt;

        prompt += '\n\n==================================================\n';
        prompt += 'CURRENT LIVE READYVERSE APPLICATION STATE:\n';
        prompt += '==================================================\n';

        if (contextData.activePage) {
            prompt += `Active Screen: ${contextData.activePage.toUpperCase()}\n`;
        }

        if (contextData.player) {
            const p = contextData.player;
            prompt += `Student: ${p.responderName} (${p.levelTitle || 'Rookie'}, Level ${p.level}, ${p.totalXP} XP, Readiness: ${p.readinessScore}%, Streak: ${p.dailyStreak} days)\n`;
            prompt += `Completed: ${p.completedMissionsCount}/4 Missions, ${p.completedLearnCount}/6 Learn Modules, ${p.completedPrepCount}/40 Prep Actions.\n`;
        }

        if (contextData.mission && contextData.mission.isActive) {
            const m = contextData.mission;
            prompt += `\nACTIVE SIMULATION IN PROGRESS:\n`;
            prompt += `- Mission: ${m.missionTitle} (Stage ${m.currentStageNumber}/${m.totalStages})\n`;
            prompt += `- Situation: ${m.currentSituation}\n`;
            if (m.availableChoices && m.availableChoices.length > 0) {
                prompt += `- Choices available to student:\n`;
                m.availableChoices.forEach(c => {
                    prompt += `  [Option ${c.index}]: "${c.text}"\n`;
                });
            }
        }

        if (contextData.learn && contextData.learn.activeModule) {
            const l = contextData.learn.activeModule;
            prompt += `\nACTIVE LEARN HUB MODULE:\n`;
            prompt += `- Module: ${l.title}\n`;
            prompt += `- Overview: ${l.overview}\n`;
            if (l.safetyTips && l.safetyTips.length > 0) {
                prompt += `- Key Safety Tips: ${l.safetyTips.join(' | ')}\n`;
            }
        }

        if (contextData.readiness) {
            const r = contextData.readiness;
            prompt += `\nREADINESS FORMULA STATUS:\n`;
            prompt += `- Total: ${r.totalReadiness}%\n`;
            prompt += `- Breakdown: Missions ${r.breakdown.missionPerformance.componentPoints}/40 pts, Prep ${r.breakdown.preparednessChecklist.componentPoints}/30 pts, Learn ${r.breakdown.learningHubKnowledge.componentPoints}/30 pts.\n`;
            if (r.highestImpactNextStep) {
                prompt += `- Highest-Impact Action: ${r.highestImpactNextStep.action} (${r.highestImpactNextStep.potentialGain})\n`;
            }
        }

        return prompt;
    }

    return {
        BASE_SYSTEM_PROMPT: BASE_SYSTEM_PROMPT,
        detectLanguage: detectLanguage,
        buildAugmentedPrompt: buildAugmentedPrompt
    };
}));
