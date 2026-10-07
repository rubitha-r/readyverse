# ReadyVerse — Project Architecture & Technical Context

---

## 1. Executive Summary & Mission
**ReadyVerse** is an interactive, student-focused disaster preparedness web platform designed for college students, hostel residents, classrooms, and campuses. Unlike traditional passive safety lectures, ReadyVerse teaches students how to **Prepare, Decide, and Act** through:
- **Interactive Crisis Decision Drills** (8 critical real-world choices per hazard).
- **Comprehensive Learn Hub** (6 disaster modules with knowledge check quizzes).
- **Personalized Action Plan** (40 structured campus safety actions).
- **Single Source of Truth Progress Engine** (`js/progress.js`).
- **Conversational Intelligence Layer** (**ReadyVerse AI** with voice and text capabilities).

---

## 2. Technology Stack & Frameworks

- **Client Runtime:**
  - Vanilla **HTML5**, modern **CSS3** (custom properties design system, flexbox, CSS grid), and **ES6+ JavaScript**.
  - **No external heavy frameworks** (React/Vue/Angular) or build bundlers (Webpack/Vite); runs natively in modern desktop and mobile browsers.
  - Zero external UI libraries or CDN dependencies for core app operation.

- **Server Runtime:**
  - **Node.js** lightweight backend server in [`server.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/server.js).
  - Native Node.js `http` module for static asset delivery and REST API endpoints (`/api/health`, `/api/chat`, `/api/realtime/session`).
  - Native `ws` WebSocket proxy server for real-time bidirectional audio streaming with Gemini Live and WebRTC endpoints.

- **ReadyVerse AI Architecture:**
  - Client-side modular architecture in `js/readyverse-ai/`:
    - Context extractor (`ai-context.js` across 8 application domains).
    - Deterministic tool handler (`ai-tools.js` with 10 structured tools).
    - Multilingual system prompt and safety guardrails (`ai-personality.js`).
    - Multi-provider transport & failover (`ai-transport.js`).
    - Accessible floating trigger & voice/text modal (`ai-ui.js`).

---

## 3. Directory & File Structure

```
ReadyVerse/
├── index.html                   # Core single-page application markup & modals
├── server.js                    # Node.js backend server, WebSocket proxy, and API router
├── package.json                 # Node dependencies (ws) and scripts
├── .env / .env.example          # Server environment secrets (Gemini & Groq keys)
├── PROJECT_CONTEXT.md           # Technical documentation and system architecture
├── CHANGELOG.md                 # Complete history of refactoring stages & verification
├── css/
│   ├── style.css                # Main design system, layout, responsive styling, themes
│   └── readyverse-ai.css        # AI companion widget styling and high-contrast dark mode
├── js/
│   ├── progress.js              # Authoritative Single Source of Truth progress engine
│   ├── script.js                # Core monolithic application state, missions, learn hub, plan, passport
│   └── readyverse-ai/
│       ├── ai-context.js        # 8-domain application state extraction
│       ├── ai-personality.js    # System instructions & prompt grounding
│       ├── ai-tools.js          # Deterministic tool definitions & execution handlers
│       ├── ai-transport.js      # Multi-provider routing, failover, and chat fallback
│       ├── ai-ui.js             # Floating AI widget, speech capture, audio playback
│       └── providers/           # Provider drivers (Gemini Live, Groq LPU, OpenAI)
├── assets/                      # Icons, SVG avatars, emergency badges, cinematic media
└── tests/                       # Complete automated regression test suites (8 suites)
    ├── test_stage1_progress.js
    ├── test_stage2_locks.js
    ├── test_stage2_navigation.js
    ├── test_stage3_renaming.js
    ├── test_stage4_navigation.js
    ├── test_stage5_home.js
    ├── test_stage6_visual.js
    └── check_syntax.js
```

---

## 4. Single Source of Truth Progress Engine (`js/progress.js`)

All gamification, progress tracking, and score metrics are centralized in `ReadyVerseProgress` and saved under `localStorage` key `readyverse_player_progress_v2`.

### 4.1. XP Awards Constants
```javascript
XP_RULES = {
    FIRE_MISSION_MAX: 200,      // Building Fire (up to +200 XP based on accuracy)
    FLOOD_MISSION_MAX: 250,     // Flash Flood (up to +250 XP based on accuracy)
    CYCLONE_MISSION_MAX: 300,   // Cyclone Emergency (up to +300 XP based on accuracy)
    QUAKE_MISSION_MAX: 300,     // Earthquake Response (up to +300 XP based on accuracy)
    QUIZ_PASS: 100,             // Learn Hub Module Quiz Pass (flat +100 XP)
    PLAN_ACTION: 15             // Preparedness Plan Checklist Action (flat +15 XP)
}
```

### 4.2. Level Formula & Title Progression
- **Leveling Formula**: `Level = Math.floor(totalXP / 200) + 1` (200 XP per level).
- **Approved Title Ranges**:
  - **Levels 1–2**: `Rookie` (0–399 XP)
  - **Levels 3–4**: `Aware` (400–799 XP)
  - **Levels 5–7**: `Prepared` (800–1,399 XP)
  - **Levels 8–10**: `Responder` (1,400–1,999 XP)
  - **Levels 11+**: `Guardian` (2,000+ XP)

### 4.3. Readiness Score Formula
Readiness is calculated as a weighted composite score ($\mathbf{0\%\text{ to }100\%}$):
$$\text{Readiness} = \text{round}\Big(0.40 \times \text{simulationScore} + 0.30 \times \text{learningScore} + 0.30 \times \text{planScore}\Big)$$
- **Simulation Score (40%)**:
  $$\text{simulationScore} = \frac{\text{completedMissions}}{4} \times \text{averageMissionAccuracy}$$
  *(Uncompleted drills contribute 0% to the average accuracy).*
- **Learning Score (30%)**:
  $$\text{learningScore} = \frac{\text{completedLearnModules}}{6} \times 100$$
- **Plan Score (30%)**:
  $$\text{planScore} = \frac{\text{completedPlanActions}}{40} \times 100$$

### 4.4. Drill Scoring & Readiness Calculations (Worked Examples)
- **Decision XP & Accuracy Formula**:
  - Each decision awards `earnedXP = Number(selectedOption.xp || 0)`.
  - Question decision score: `decisionScore = Math.round((earnedXP / maxQuestionXP) * 100)`.
  - Final drill accuracy: `percentage = Math.round((sum(decisionScore) / (totalQuestions * 100)) * 100)`.
  - Drill XP earned: `missionXP = sum(earnedXP)`.
  - Total XP: `state.totalXP += state.missionXP`.

- **Worked Example 1: Perfect Building Fire Run** (8/8 optimal decisions):
  - **XP Earned**: 25 XP × 8 decisions = **200 XP**.
  - **Accuracy**: $(800 / 800) \times 100 = \mathbf{100\%}$.
  - **Level & Title**: $\lfloor 200 / 200 \rfloor + 1 = \mathbf{\text{Level } 2\text{ Rookie}}$.
  - **Readiness**: $\text{round}\left(0.40 \times \left(\frac{1}{4} \times 100\%\right)\right) = \text{round}(0.40 \times 25\%) = \mathbf{10\%}$.

- **Worked Example 2: Weak Building Fire Run** (Sub-optimal partial choices):
  - **XP Earned**: $4 + 6 + 4 + 10 + 4 + 6 + 8 + 5 = \mathbf{47\text{ XP}}$.
  - **Accuracy**: Question scores sum to 188 / 800 $\rightarrow \text{round}\left(\frac{188}{800} \times 100\right) = \mathbf{24\%}$.
  - **Level & Title**: $\lfloor 47 / 200 \rfloor + 1 = \mathbf{\text{Level } 1\text{ Rookie}}$.
  - **Readiness**: $\text{round}\left(0.40 \times \left(\frac{1}{4} \times 24\%\right)\right) = \text{round}(0.40 \times 6\%) = \text{round}(2.4\%) = \mathbf{2\%}$.

### 4.5. State Reset Protocol
`ReadyVerseProgress.resetProgress(state)`:
- **Resets**: `totalXP`, `completedMissions`, `decisionsMade`, `readiness`, `correctDecisions`, `completedMissionIds`, `missionBestScores`, `missionBestGrades`, `completedLearnIds`, `learnQuizScores`, `completedPrepItemIds`, `prepChecklistState`, `dailyStreak`, `longestStreak`, `unlockedAchievements`, `rewardedAchievements`, `unlockedCapabilities`, `performanceHistory`, `lastResult`.
- **Preserves**: Saved responder profile (`name`, `college`, `emergencyContact`, `campusContact`, `notes`), `themePreference`, `campusStudio` data, and `readyverse_ai_intro_seen_v1` flag.

---

## 5. Navigation Architecture (5-Tab Mobile-First Model)

Main navigation provides exactly 5 tabs on both mobile (fixed bottom tab bar) and desktop (sidebar/header):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN NAVIGATION (5 TABS)                        │
├─────────────┬─────────────┬─────────────┬──────────────┬───────────────┤
│    HOME     │   DRILLS    │    LEARN    │   MY PLAN    │    PROFILE    │
│ (dashboard) │ (missions)  │   (learn)   │(preparedness)│ (profileHub)  │
└─────────────┴─────────────┴─────────────┴──────────────┴───────────────┘
                                                                │
                                    ┌───────────────────────────┴───────────────────────────┐
                                    │               PROFILE SUB-NAVIGATION TABS             │
                                    ├───────────────────────────────────────────────────────┤
                                    │ 1. My Stats (performance telemetry & history)         │
                                    │ 2. My Safety Record (readiness passport)              │
                                    │ 3. Rewards (unlocked capabilities catalog)            │
                                    │ 4. Proof Levels (evidence classification)             │
                                    │ 5. Campus Mode (campus preparedness studio)           │
                                    │ 6. Responder Identity (outfits, titles, borders)      │
                                    │ 7. Reset Progress & Danger Zone                       │
                                    └───────────────────────────────────────────────────────┘
```

- **Container Mapping**:
  - **Home**: `#dashboardPage` / `#dashboardContent`
  - **Drills**: `#missionsSection`
  - **Learn**: `#learnSection`
  - **My Plan**: `#prepSection`
  - **Profile**: `#profileHubSection`

---

## 6. Playable Disaster Drills

All 4 disaster response drills are completely unlocked and accessible from Day 1:
1. 🔥 **Building Fire**: Corridor smoke crawl, fire alarm activation, PASS extinguisher technique, exit identification, and sports field roll call.
2. 🌊 **Flash Flood**: Monsoon warning awareness, elevation of electronic equipment, rapid hostel evacuation, and avoidance of moving floodwaters.
3. 🌪️ **Cyclone Emergency**: Pre-storm window taping, secure indoor shelter, wind lull awareness (eye of the storm), and post-cyclone hazard avoidance.
4. 🌍 **Earthquake Response**: Drop, Cover, and Hold Under sturdy furniture, staying away from windows/glass, aftershock preparation, and open assembly.

Each drill features **8 distinct decision nodes** with individual XP point allocations based on response efficacy.

---

## 7. ReadyVerse AI Voice & Chat Companion

- **Primary Cloud Provider**: Google Gemini Live API via WebSocket proxy.
- **Failover Cloud Provider**: Groq LPU API for ultra-fast conversational text generation.
- **Serverless Endpoint**: `/api/coach` (`api/coach.js` / Netlify function) with per-user rate limiting (max 10 req/min).
- **Strict Guardrails**: Refuses off-topic questions, prompt injections, and medical prescriptions with *"I'm not sure, check the lesson or call 112"*.
- **Language Support**: English, Tamil, and Tanglish (spontaneous language mirroring).
- **Trigger & Coachmark**:
  - Compact round floating trigger button on mobile ($\le 480\text{px}$).
  - Non-intrusive coachmark that delays rendering until 8 seconds after entering the app, positioned safely above the bottom tab bar.

---

## 8. Progressive Web App (PWA) & Offline Infrastructure

- **Web App Manifest**: [`manifest.json`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/manifest.json) declaring `standalone` mode, `#6C4CF1` theme, and icon assets.
- **Service Worker**: [`sw.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/sw.js) pre-caching App Shell, stylesheets, scripts, and media assets with Stale-While-Revalidate strategy.
- **Offline Mode Detection**: Sticky `#rvOfflineBanner` automatically informs students of available offline vs. online features.
- **JSON Progress Backup**: Client-side backup and restore under `readyverse:v2` schema.

---

## 9. Multilingual Support, Speech & Official Citations

- **Tamil Safety Localization**: [`js/data/tamil-translations.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/data/tamil-translations.js) providing verified Tamil translations for Daily Drill and Building Fire.
- **Authoritative Citations**: [`js/data/sources.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/data/sources.js) mapping NDMA, NIDM, UNDRR, and CEA guidelines to all lessons and drill debriefs.
- **Speech Synthesis (TTS)**: [`js/speech.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/speech.js) for voice readout of situations and guidelines.

