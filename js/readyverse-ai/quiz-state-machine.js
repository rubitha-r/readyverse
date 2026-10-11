/**
 * ReadyVerse AI — Deterministic Quiz State Machine (Phase 4)
 * Manages quiz session state: { quizActive, questionId, expectedAnswer, askedIds }
 * Contains all 30 authentic NDMA lesson questions (5 per 6 lessons).
 * Evaluates correctness purely in deterministic code (never leaves correctness to LLM).
 * Recognizes option numbers, letters, option text, Tamil, and Tanglish numerals.
 * 
 * Enforces PRACTICE ONLY (no XP granted) to prevent double-awarding XP.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseQuizMachine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // 100% Authentic Quiz Bank extracted from learnModules (NDMA / NIDM grounded) - 30 questions
    const AUTHENTIC_QUIZ_BANK = [
        {
                "id": "fire_q0",
                "moduleId": "fire",
                "moduleTitle": "Fire Safety & Evacuation",
                "q": "Why is crawling low under smoke essential during a building fire?",
                "options": [
                        "It makes you move faster through doorways",
                        "Toxic smoke and superheated gases rise, leaving cleaner air near the floor",
                        "It prevents falling objects from touching you",
                        "It keeps you hidden from outside heat"
                ],
                "answer": 1,
                "explanation": "Superheated smoke and lethal gases rise toward the ceiling; cooler, breathable air stays in the lower 12-24 inches."
        },
        {
                "id": "fire_q1",
                "moduleId": "fire",
                "moduleTitle": "Fire Safety & Evacuation",
                "q": "What should you do before opening a closed door during an evacuation?",
                "options": [
                        "Kick the door open quickly",
                        "Feel the door handle and door surface with the back of your hand",
                        "Open the door slightly to peek inside",
                        "Knock loudly and wait for a response"
                ],
                "answer": 1,
                "explanation": "The back of your hand is sensitive to heat; if the door or handle feels warm, fire is directly on the other side."
        },
        {
                "id": "fire_q2",
                "moduleId": "fire",
                "moduleTitle": "Fire Safety & Evacuation",
                "q": "What is the correct protocol if your clothing catches fire?",
                "options": [
                        "Run rapidly toward the nearest exit",
                        "Wave your arms to blow out the fire",
                        "Stop, Drop to the ground, and Roll to smother the flames",
                        "Look for a towel to fan the flames"
                ],
                "answer": 2,
                "explanation": "Running fans the flames; stopping, dropping, and rolling smothers oxygen and extinguishes the fire."
        },
        {
                "id": "fire_q3",
                "moduleId": "fire",
                "moduleTitle": "Fire Safety & Evacuation",
                "q": "What does the fire extinguisher acronym 'PASS' stand for?",
                "options": [
                        "Push, Aim, Spray, Stop",
                        "Pull the pin, Aim at base, Squeeze lever, Sweep side-to-side",
                        "Prepare, Activate, Spread, Secure",
                        "Point, Arm, Squeeze, Stand back"
                ],
                "answer": 1,
                "explanation": "PASS: Pull the safety pin, Aim nozzle at the base of fire, Squeeze the trigger, Sweep side-to-side."
        },
        {
                "id": "fire_q4",
                "moduleId": "fire",
                "moduleTitle": "Fire Safety & Evacuation",
                "q": "Why should elevators NEVER be used during a building fire evacuation?",
                "options": [
                        "Elevators move too slowly during emergencies",
                        "Elevator shafts draw smoke and power loss can trap occupants between floors",
                        "Elevator doors lock automatically when fire alarms ring",
                        "Elevators are reserved exclusively for building management"
                ],
                "answer": 1,
                "explanation": "Elevator shafts act as chimneys drawing smoke, and sudden power cuts can trap passengers in lethal heat zones."
        },
        {
                "id": "flood_q0",
                "moduleId": "flood",
                "moduleTitle": "Flood Safety & Rising Waters",
                "q": "How much fast-moving floodwater is required to knock an adult off their feet?",
                "options": [
                        "24 inches (2 feet)",
                        "18 inches",
                        "6 inches",
                        "12 inches (1 foot)"
                ],
                "answer": 2,
                "explanation": "Just 6 inches of fast-moving water exerts tremendous kinetic force that easily sweeps adults off their feet."
        },
        {
                "id": "flood_q1",
                "moduleId": "flood",
                "moduleTitle": "Flood Safety & Rising Waters",
                "q": "What is the primary rule when approaching a water-covered road while driving?",
                "options": [
                        "Drive through quickly to avoid getting stuck",
                        "Turn Around, Don't Drown — find an alternate safe route",
                        "Follow closely behind the vehicle ahead",
                        "Shift into high gear and accelerate"
                ],
                "answer": 1,
                "explanation": "Most flood fatalities occur in vehicles; road surfaces under water may be completely collapsed or swept away."
        },
        {
                "id": "flood_q2",
                "moduleId": "flood",
                "moduleTitle": "Flood Safety & Rising Waters",
                "q": "What critical home utility should be disconnected before floodwaters enter?",
                "options": [
                        "Internet router only",
                        "Main electrical circuit breaker panel",
                        "Air conditioning filter",
                        "Television antenna"
                ],
                "answer": 1,
                "explanation": "Submerged electrical panels and outlets create lethal underwater shock zones throughout the structure."
        },
        {
                "id": "flood_q3",
                "moduleId": "flood",
                "moduleTitle": "Flood Safety & Rising Waters",
                "q": "If floodwaters trap you inside a building, what is the safest vertical action?",
                "options": [
                        "Climb into a sealed attic with no roof hatch",
                        "Move to upper floors with access to roof escape points",
                        "Hide in the basement or ground-floor bathroom",
                        "Open ground-floor windows to let water flow through"
                ],
                "answer": 1,
                "explanation": "Ascend to upper floors with accessible roof escape paths; never trap yourself in attics without exit tools."
        },
        {
                "id": "flood_q4",
                "moduleId": "flood",
                "moduleTitle": "Flood Safety & Rising Waters",
                "q": "Why must standing floodwaters always be treated with extreme caution after a storm?",
                "options": [
                        "Floodwater cools down too rapidly",
                        "It frequently contains raw sewage, toxic chemicals, submerged debris, and live wires",
                        "It evaporates too quickly causing humidity",
                        "It attracts wild birds"
                ],
                "answer": 1,
                "explanation": "Standing floodwaters carry disease-causing pathogens, industrial runoff, glass shards, and energized downed lines."
        },
        {
                "id": "cyclone_q0",
                "moduleId": "cyclone",
                "moduleTitle": "Cyclone Preparedness & Storm Tracking",
                "q": "What is the calm, low-pressure center of a cyclone called?",
                "options": [
                        "The Tail",
                        "The Eye of the Storm",
                        "The Wind Core",
                        "The Rain Shield"
                ],
                "answer": 1,
                "explanation": "The Eye is the calm center of a tropical cyclone, surrounded by the most violent eyewall winds."
        },
        {
                "id": "cyclone_q1",
                "moduleId": "cyclone",
                "moduleTitle": "Cyclone Preparedness & Storm Tracking",
                "q": "What dangerous phenomenon occurs when the Eye of the Storm finishes passing?",
                "options": [
                        "The storm ends completely with clear skies",
                        "Violent hurricane-force winds suddenly resume from the opposite direction",
                        "A tsunami immediately forms",
                        "Temperatures drop below freezing"
                ],
                "answer": 1,
                "explanation": "When the eye passes, the opposite eyewall strikes instantly with maximum ferocious winds from reverse direction."
        },
        {
                "id": "cyclone_q2",
                "moduleId": "cyclone",
                "moduleTitle": "Cyclone Preparedness & Storm Tracking",
                "q": "Where is the safest place to take shelter inside a residence during a cyclone?",
                "options": [
                        "Under large glass windows in the living room",
                        "On the open balcony to monitor storm progress",
                        "In a small interior windowless room, hallway, or bathroom on the lowest floor",
                        "In the attic directly under the roof rafters"
                ],
                "answer": 2,
                "explanation": "Interior windowless rooms shield occupants from flying shattered glass and roof projectile debris."
        },
        {
                "id": "cyclone_q3",
                "moduleId": "cyclone",
                "moduleTitle": "Cyclone Preparedness & Storm Tracking",
                "q": "How many days of emergency food and potable water should be prepared for a cyclone?",
                "options": [
                        "At least 72 hours (3 days)",
                        "12 hours only",
                        "30 days",
                        "2 hours"
                ],
                "answer": 0,
                "explanation": "72 hours is the standard international supply target while relief and emergency access routes are cleared."
        },
        {
                "id": "cyclone_q4",
                "moduleId": "cyclone",
                "moduleTitle": "Cyclone Preparedness & Storm Tracking",
                "q": "Why are candles discouraged during post-cyclone power blackouts?",
                "options": [
                        "Candles attract flying insects",
                        "Candles generate excessive room heat",
                        "Open flames can ignite leaking natural gas or propane from ruptured lines",
                        "Candles burn too quickly in humid weather"
                ],
                "answer": 2,
                "explanation": "Storm damage frequently ruptures residential gas lines; open candle flames cause fatal structural explosions."
        },
        {
                "id": "earthquake_q0",
                "moduleId": "earthquake",
                "moduleTitle": "Earthquake Safety & Seismic Protocol",
                "q": "What is the internationally proven protocol during active earthquake shaking?",
                "options": [
                        "Stand under a doorway and shout",
                        "Drop, Cover, and Hold On",
                        "Run outside into the street immediately",
                        "Climb onto the roof of the building"
                ],
                "answer": 1,
                "explanation": "Drop to hands and knees, Cover head/neck under sturdy furniture, and Hold On until ground shaking stops."
        },
        {
                "id": "earthquake_q1",
                "moduleId": "earthquake",
                "moduleTitle": "Earthquake Safety & Seismic Protocol",
                "q": "Why should you avoid standing in modern doorways during an earthquake?",
                "options": [
                        "Doorways are magnetic",
                        "Modern interior doors are not load-bearing and do not protect against falling objects",
                        "Doorways have electrical wires",
                        "Doors swing open and trap your hands"
                ],
                "answer": 1,
                "explanation": "Modern doorframes are purely decorative and offer zero overhead protection compared to a heavy desk or table."
        },
        {
                "id": "earthquake_q2",
                "moduleId": "earthquake",
                "moduleTitle": "Earthquake Safety & Seismic Protocol",
                "q": "What is the greatest danger to people running outside during an earthquake?",
                "options": [
                        "Wind gusts",
                        "Falling glass, bricks, masonry, and architectural facade debris",
                        "Rain and cold weather",
                        "Slippery sidewalks"
                ],
                "answer": 1,
                "explanation": "Exterior facades, windows, and parapets collapse outward during shaking; staying inside under cover is far safer."
        },
        {
                "id": "earthquake_q3",
                "moduleId": "earthquake",
                "moduleTitle": "Earthquake Safety & Seismic Protocol",
                "q": "What secondary seismic events typically occur following a major earthquake?",
                "options": [
                        "Solar eclipses",
                        "Strong aftershocks, gas line fires, and falling weakened debris",
                        "Tornado formations",
                        "Hailstorms"
                ],
                "answer": 1,
                "explanation": "Aftershocks can trigger secondary collapses of compromised structures and spark gas fires across the zone."
        },
        {
                "id": "earthquake_q4",
                "moduleId": "earthquake",
                "moduleTitle": "Earthquake Safety & Seismic Protocol",
                "q": "If you are driving when earthquake shaking begins, what should you do?",
                "options": [
                        "Speed up to outrun the tremor",
                        "Stop under a large highway overpass",
                        "Safely pull over away from overpasses, bridges, and power lines, and set the parking brake",
                        "Exit the car and lie in the road"
                ],
                "answer": 2,
                "explanation": "Pulling over in clear open road areas away from falling elevated structures keeps occupants safely protected."
        },
        {
                "id": "electrical_q0",
                "moduleId": "electrical",
                "moduleTitle": "Electrical Emergency",
                "q": "What is your immediate first step upon seeing someone actively experiencing an electric shock?",
                "options": [
                        "Grab their hand and pull them away",
                        "Turn off the main power breaker / disconnect the power source",
                        "Pour water over the appliance",
                        "Check their pulse while they are connected to the wire"
                ],
                "answer": 1,
                "explanation": "Cutting the power source immediately halts current; touching the victim directly turns you into a second victim."
        },
        {
                "id": "electrical_q1",
                "moduleId": "electrical",
                "moduleTitle": "Electrical Emergency",
                "q": "Why must you NEVER throw water onto an active electrical fire?",
                "options": [
                        "Water causes the fire to smell bad",
                        "Water conducts electricity, causing severe shock, electrocution, and explosions",
                        "Water cools down the fire too quickly",
                        "Water evaporates and creates fog"
                ],
                "answer": 1,
                "explanation": "Water is an electrical conductor; throwing water conducts lethal voltage back to the person holding the hose or bucket."
        },
        {
                "id": "electrical_q2",
                "moduleId": "electrical",
                "moduleTitle": "Electrical Emergency",
                "q": "What type of non-conductive object can safely separate a shock victim from a live wire?",
                "options": [
                        "A metal crowbar",
                        "A damp bath towel",
                        "A dry wooden broomstick or thick plastic pipe",
                        "An aluminum pole"
                ],
                "answer": 2,
                "explanation": "Dry wood, fiberglass, and rigid plastic are electrical insulators that do not conduct dangerous current."
        },
        {
                "id": "electrical_q3",
                "moduleId": "electrical",
                "moduleTitle": "Electrical Emergency",
                "q": "What is the minimum safe distance you must maintain from a downed high-voltage power line?",
                "options": [
                        "At least 35 feet (10 meters)",
                        "2 feet",
                        "5 feet",
                        "10 inches"
                ],
                "answer": 0,
                "explanation": "High-voltage current energizes the surrounding soil in radiating ripples; stay at least 35 feet (10m) away."
        },
        {
                "id": "electrical_q4",
                "moduleId": "electrical",
                "moduleTitle": "Electrical Emergency",
                "q": "What is the life-saving function of a GFCI (Ground Fault Circuit Interrupter) outlet?",
                "options": [
                        "It doubles electrical voltage for faster charging",
                        "It instantly cuts power in milliseconds when current leaks to water or a person",
                        "It acts as a battery during power outages",
                        "It prevents lightning strikes on the roof"
                ],
                "answer": 1,
                "explanation": "GFCIs detect microscopic electrical leaks to ground and cut circuits within 1/40th of a second to prevent electrocution."
        },
        {
                "id": "medical_q0",
                "moduleId": "medical",
                "moduleTitle": "Medical Emergency",
                "q": "What is the very first priority when arriving at any emergency medical scene?",
                "options": [
                        "Perform CPR immediately",
                        "Assess the scene to ensure it is completely safe for yourself and the victim",
                        "Take photos for hospital records",
                        "Move the victim to a different room"
                ],
                "answer": 1,
                "explanation": "Scene safety is paramount; if the responder becomes a casualty, they cannot help the victim."
        },
        {
                "id": "medical_q1",
                "moduleId": "medical",
                "moduleTitle": "Medical Emergency",
                "q": "How should severe arterial bleeding from an extremity be controlled immediately?",
                "options": [
                        "Wash the wound with hot water",
                        "Apply direct, continuous, firm pressure with sterile gauze or clean cloth",
                        "Apply a loose bandage and wait",
                        "Elevate the feet above the head"
                ],
                "answer": 1,
                "explanation": "Direct manual pressure compresses severed blood vessels, initiating rapid clot formation and halting hemorrhage."
        },
        {
                "id": "medical_q2",
                "moduleId": "medical",
                "moduleTitle": "Medical Emergency",
                "q": "Why should an object embedded deep in a wound NEVER be removed at the scene?",
                "options": [
                        "It will get lost",
                        "The object is acting as a plug for damaged arteries; removing it causes catastrophic bleeding",
                        "Removing it hurts the responder's hands",
                        "It must be cleaned before removal"
                ],
                "answer": 1,
                "explanation": "Embedded objects tamponade damaged blood vessels; removal must only occur in a sterile surgical operating theater."
        },
        {
                "id": "medical_q3",
                "moduleId": "medical",
                "moduleTitle": "Medical Emergency",
                "q": "Why is the Recovery Position used for unconscious, breathing casualties?",
                "options": [
                        "It helps them sleep comfortably",
                        "It keeps their airway open and prevents them from choking on tongue or vomit",
                        "It lowers body temperature",
                        "It helps broken bones heal"
                ],
                "answer": 1,
                "explanation": "The Recovery Position utilizes gravity to keep the tongue from blocking the trachea and allows fluids to drain safely."
        },
        {
                "id": "medical_q4",
                "moduleId": "medical",
                "moduleTitle": "Medical Emergency",
                "q": "What is the recommended chest compression rate during hands-only CPR?",
                "options": [
                        "20 to 30 compressions per minute",
                        "100 to 120 compressions per minute",
                        "200 to 250 compressions per minute",
                        "60 compressions per hour"
                ],
                "answer": 1,
                "explanation": "100-120 compressions/min (to the rhythm of 'Stayin' Alive') maintains vital blood flow to the brain and heart."
        }
];

    class QuizStateMachine {
        constructor() {
            this.state = {
                quizActive: false,
                currentQuestion: null,
                expectedAnswer: null, // 0-indexed
                askedIds: []
            };
        }

        getState() {
            return { ...this.state };
        }

        isQuizActive() {
            return this.state.quizActive && this.state.currentQuestion !== null;
        }

        isInQuiz() {
            return this.isQuizActive();
        }

        getCurrentQuestion() {
            return this.state.currentQuestion;
        }

        getAllQuestions() {
            return [...AUTHENTIC_QUIZ_BANK];
        }

        resetQuiz() {
            this.endQuiz();
        }

        isQuizIntent(rawText) {
            const t = (rawText || '').toLowerCase().trim();
            if (t.includes('quiz me') || t === 'quiz' || t === 'quiz-me' || t.includes('quiz podu') || t.includes('quiz vai')) return true;
            if (t.includes('kelvi kelu') || t.includes('kelvi kettu') || t.includes('கேள்வி கேள்') || t.includes('வினாடி வினா')) return true;
            if (t.includes('practice question') || t.includes('quiz question') || t.includes('test my understanding')) return true;
            return false;
        }

        /**
         * Selects the next authentic question from the bank
         */
        startNextQuestion(preferredModuleId = null) {
            let candidates = AUTHENTIC_QUIZ_BANK.filter(q => !this.state.askedIds.includes(q.id));
            if (candidates.length === 0) {
                // Reset asked list when entire bank is exhausted
                this.state.askedIds = [];
                candidates = [...AUTHENTIC_QUIZ_BANK];
            }

            if (preferredModuleId) {
                const modCandidates = candidates.filter(q => q.moduleId === preferredModuleId);
                if (modCandidates.length > 0) candidates = modCandidates;
            }

            // Pick candidate
            const qObj = candidates[Math.floor(Math.random() * candidates.length)];
            this.state.quizActive = true;
            this.state.currentQuestion = qObj;
            this.state.expectedAnswer = qObj.answer;
            this.state.askedIds.push(qObj.id);

            return {
                quizActive: true,
                questionId: qObj.id,
                moduleTitle: qObj.moduleTitle,
                q: qObj.q,
                options: qObj.options,
                expectedAnswer: qObj.answer,
                formattedPrompt: `Here is a practice question from ${qObj.moduleTitle}:\n\n${qObj.q}\n\n1. ${qObj.options[0]}\n2. ${qObj.options[1]}\n3. ${qObj.options[2]}\n4. ${qObj.options[3]}\n\nWhich option is correct? (Reply 1, 2, 3, or 4)`
            };
        }

        startQuiz(lang = 'english') {
            const next = this.startNextQuestion();
            if (lang === 'tamil') {
                return `இதோ ${next.moduleTitle} பாடத்தில் இருந்து ஒரு பயிற்சி கேள்வி:\n\n${next.q}\n\n1. ${next.options[0]}\n2. ${next.options[1]}\n3. ${next.options[2]}\n4. ${next.options[3]}\n\nஎந்த விருப்பம் சரியானது? (1, 2, 3, அல்லது 4 என்று பதிலளிக்கவும்)`;
            }
            if (lang === 'tanglish') {
                return `Here is a practice question from ${next.moduleTitle} bro:\n\n${next.q}\n\n1. ${next.options[0]}\n2. ${next.options[1]}\n3. ${next.options[2]}\n4. ${next.options[3]}\n\nIntha options-la ethu correct bro? (Reply 1, 2, 3, or 4)`;
            }
            return next.formattedPrompt;
        }

        /**
         * Validates a student's answer deterministically
         * @param {string} rawInput 
         * @param {string} lang
         * @returns {object} { handled: boolean, isAnswerAttempt: boolean, isCorrect: boolean, response: string, explanation: string }
         */
        evaluateAnswer(rawInput, lang = 'english') {
            if (!this.isQuizActive()) {
                return { handled: false, isAnswerAttempt: false };
            }

            const input = (rawInput || '').toLowerCase().trim();
            const current = this.state.currentQuestion;
            const expectedIdx = current.answer; // 0-indexed

            let chosenIdx = -1;

            // Direct index / number / letter matching
            // 1 / Option 1 / A / First / onnu / முதல்
            if (/^(1|option\s*1|opt\s*1|a|option\s*a|opt\s*a|first|1st|onnu|ondru|mudhal|முதல்)$/i.test(input)) chosenIdx = 0;
            else if (/^(2|option\s*2|opt\s*2|b|option\s*b|opt\s*b|second|2nd|rendu|erandu|erandavathu|இரண்டாவது)$/i.test(input)) chosenIdx = 1;
            else if (/^(3|option\s*3|opt\s*3|c|option\s*c|opt\s*c|third|3rd|moonu|moondru|moondravathu|மூன்றாவது)$/i.test(input)) chosenIdx = 2;
            else if (/^(4|option\s*4|opt\s*4|d|option\s*d|opt\s*d|fourth|4th|naalu|naangu|naangavathu|நான்காவது)$/i.test(input)) chosenIdx = 3;

            // Option text substring matching if whole phrase or key terms given
            if (chosenIdx === -1) {
                for (let i = 0; i < current.options.length; i++) {
                    const optText = current.options[i].toLowerCase();
                    if (input.length >= 6 && optText.includes(input)) {
                        chosenIdx = i;
                        break;
                    }
                }
            }

            // If not recognized as an answer attempt
            if (chosenIdx === -1) {
                return {
                    handled: false,
                    isAnswerAttempt: false,
                    message: "That doesn't seem to be an option (1, 2, 3, or 4). Would you like to answer this question or end the quiz?"
                };
            }

            const isCorrect = chosenIdx === expectedIdx;
            const chosenOptionText = current.options[chosenIdx];
            const correctOptionText = current.options[expectedIdx];

            // Close the active question
            this.state.quizActive = false;
            this.state.currentQuestion = null;
            this.state.expectedAnswer = null;

            let responseText = '';
            if (lang === 'tamil') {
                responseText = isCorrect
                    ? `மிகச் சரி! விருப்பம் ${expectedIdx + 1} (${correctOptionText}) சரியானது. ${current.explanation}`
                    : `நல்ல முயற்சி! சரியான விடை விருப்பம் ${expectedIdx + 1} (${correctOptionText}). ${current.explanation}`;
            } else if (lang === 'tanglish') {
                responseText = isCorrect
                    ? `Spot on bro! Option ${expectedIdx + 1} (${correctOptionText}) dhaan correct answer. ${current.explanation}`
                    : `Good try bro! Correct answer Option ${expectedIdx + 1} (${correctOptionText}). ${current.explanation}`;
            } else {
                responseText = isCorrect
                    ? `Correct! Option ${expectedIdx + 1} (${correctOptionText}) is correct. ${current.explanation}`
                    : `Good try! The correct answer is Option ${expectedIdx + 1} (${correctOptionText}). ${current.explanation}`;
            }

            return {
                handled: true,
                isAnswerAttempt: true,
                isCorrect: isCorrect,
                chosenIndex: chosenIdx,
                expectedIndex: expectedIdx,
                chosenOptionText: chosenOptionText,
                correctOptionText: correctOptionText,
                explanation: current.explanation,
                feedback: responseText,
                response: responseText
            };
        }

        endQuiz() {
            this.state.quizActive = false;
            this.state.currentQuestion = null;
            this.state.expectedAnswer = null;
        }
    }

    const defaultInstance = new QuizStateMachine();
    defaultInstance.QuizStateMachine = QuizStateMachine;
    defaultInstance.AUTHENTIC_QUIZ_BANK = AUTHENTIC_QUIZ_BANK;
    return defaultInstance;
}));
