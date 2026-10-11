/**
 * ReadyVerse AI — Language Detector Unit Test Suite (Phase 3)
 * Tests over 45 diverse sample messages across English, Tamil script,
 * Tanglish, explicit directives, short messages, and common misspellings.
 */

const assert = require('assert');
const path = require('path');
const detector = require('../js/readyverse-ai/language-detector');

console.log('=======================================================');
console.log('🧪 TESTING PHASE 3: MULTILINGUAL LANGUAGE DETECTOR');
console.log('=======================================================\n');

let passed = 0;
let failed = 0;

function testCase(input, expectedLang, desc = '') {
    const res = detector.detect(input);
    const ok = res.language === expectedLang;
    if (ok) {
        console.log(`  ✓ [${expectedLang.toUpperCase()}] "${input}" (${res.reason})`);
        passed++;
    } else {
        console.error(`  ✖ FAILED: "${input}" -> Expected: ${expectedLang}, Got: ${res.language} (${res.reason})`);
        failed++;
    }
}

const testData = [
    // 1. Mandatory Benchmark Queries from Prompt
    { text: "Hi, how are you?", lang: "english" },
    { text: "Hy ena pandra", lang: "tanglish" },
    { text: "Enna panradhu?", lang: "tanglish" },
    { text: "Enakku fire safety explain pannu.", lang: "tanglish" },
    { text: "ReadyVerse-la enna ellam irukku?", lang: "tanglish" },
    { text: "En readiness score improve panna enna pannanum?", lang: "tanglish" },
    { text: "ReadyVerse platform-la enna ellam irukku nu Tanglish-la explain pannunga", lang: "tanglish" },

    // 2. Pure English Queries
    { text: "What do I do in a fire?", lang: "english" },
    { text: "Quiz me", lang: "english" },
    { text: "Tell me about ReadyVerse", lang: "english" },
    { text: "What is the PASS technique for fire extinguishers?", lang: "english" },
    { text: "How many inches of moving water can knock down an adult?", lang: "english" },
    { text: "Drop, cover, and hold on during active shaking.", lang: "english" },
    { text: "Explain my readiness calculation breakdown.", lang: "english" },
    { text: "Can you help me build an emergency go-bag?", lang: "english" },
    { text: "What is the emergency helpline number in India?", lang: "english" },
    { text: "How do I evacuate from the third floor safely?", lang: "english" },
    { text: "Is it safe to use elevators during a building fire?", lang: "english" },
    { text: "Good morning coach, ready to practice.", lang: "english" },

    // 3. Tamil Script Queries (Unicode U+0B80-U+0BFF)
    { text: "தீ விபத்து ஏற்பட்டால் நான் என்ன செய்ய வேண்டும்?", lang: "tamil" },
    { text: "வணக்கம், ரெடிவர்ஸ் பற்றி சொல்லுங்கள்.", lang: "tamil" },
    { text: "நிலநடுக்கத்தின் போது என்ன செய்ய வேண்டும்?", lang: "tamil" },
    { text: "அவசர உதவி எண் என்ன?", lang: "tamil" },
    { text: "வெள்ளம் வரும்போது எவ்வாறு தப்புவது?", lang: "tamil" },
    { text: "புயல் எச்சரிக்கை வந்தால் எங்கு செல்வது?", lang: "tamil" },
    { text: "நில், விழு, உருளு முறை என்றால் என்ன?", lang: "tamil" },
    { text: "மின் விபத்து ஏற்பட்டால் முதல் உதவி என்ன?", lang: "tamil" },

    // 4. Tanglish Queries (Casual, Collegiate, Disaster Safety)
    { text: "Machi fire alarm adikudhu enna pannanum?", lang: "tanglish" },
    { text: "Bro cyclone appo velila polama?", lang: "tanglish" },
    { text: "Lift-a use panna koodathu dhaan?", lang: "tanglish" },
    { text: "Flood water ulla vantha power cut pannanuma?", lang: "tanglish" },
    { text: "Thee pidicha stop drop roll panradhu epdi?", lang: "tanglish" },
    { text: "Earthquake vandha table keezha poi ukkara venuma?", lang: "tanglish" },
    { text: "Enaku emergency helpline numbers sollu bro", lang: "tanglish" },
    { text: "Campus hostel-la smoke vantha velila eppadi poradhu?", lang: "tanglish" },
    { text: "ReadyVerse drills romba useful-ah irukku", lang: "tanglish" },
    { text: "Level 5 reach panna enna seiyanum?", lang: "tanglish" },
    { text: "Daily drill streak maintain panna help pannu machan", lang: "tanglish" },
    { text: "Enna panra thambi?", lang: "tanglish" },

    // 5. Explicit Directive Requests (Explicit Directive Overrides All)
    { text: "Explain fire safety in Tamil", lang: "tamil" },
    { text: "Tamil-la sollu bro", lang: "tamil" },
    { text: "Can you explain this in Tanglish please?", lang: "tanglish" },
    { text: "Tell me about ReadyVerse in English", lang: "english" },
    { text: "English la sollu", lang: "english" },
    { text: "Cyclone safety tips Tanglish-la sollunga", lang: "tanglish" },
    { text: "Explain everything in English only", lang: "english" }
];

testData.forEach(item => {
    testCase(item.text, item.lang);
});

console.log('\n=======================================================');
console.log(`TOTAL DETECTOR TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('=======================================================\n');

if (failed > 0) {
    process.exit(1);
}
