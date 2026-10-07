# ReadyVerse — Interactive Campus Disaster Preparedness Platform

> **Prepare. Decide. Act.**  
> ReadyVerse is an open-source, mobile-first emergency preparedness training web application built for college students, university faculties, and campus communities. Through interactive branch-and-consequence crisis simulations, bite-sized survival modules, and actionable safety planning, ReadyVerse equips students to make split-second, life-saving decisions during sudden disasters.

---

## 📸 Screenshots

| Home & Action Feed | Interactive Crisis Drills |
| :---: | :---: |
| *(Screenshot Placeholder: Home Tab with Daily Streak, Level, Readiness Score, and Next Action)* | *(Screenshot Placeholder: Building Fire 3D/Isometric Scenario Decision Grid)* |

| Learn Hub & Quizzes | Personal Safety Record & Plan |
| :---: | :---: |
| *(Screenshot Placeholder: 6 Bite-Sized Disaster Preparedness Modules & Knowledge Checks)* | *(Screenshot Placeholder: 40-Action Checklist, Emergency Contacts, and Digital Passport)* |

---

## ⚡ Core Features: Built vs. Planned

### ✅ Features Built (100% Functional Offline & Statically)
- **4 Interactive Crisis Drills (32 Scenario Decisions)**:
  - 🔥 **Building Fire Drill**: Electrical lab fire, smoke layer navigation, stairwell vs. elevator choice, assembly protocols.
  - 🌊 **Flash Flood Drill**: Monsoon torrents, low-lying ground escape, electrical hazard avoidance, safe roof ascent.
  - 🌪️ **Cyclone Emergency Drill**: Severe storm warnings, structural window reinforcement, sheltering in interior corridors.
  - 🌍 **Earthquake Response Drill**: Rapid *Drop, Cover, and Hold On*, aftershock preparedness, open-ground evacuation.
- **⚡ 60-Second Daily Drill**:
  - Deterministic rotation by date: 3 quick decisions picked from the 4 disaster drills so all students receive the same synchronized daily challenge.
  - 60-second countdown timer, instant one-line corrective feedback after each choice, key lesson learned extraction, daily streak progression, and +50 XP reward.
- **Single Source of Truth Progression System (`readyverse:v2`)**:
  - Deterministic XP reward table (Drills: up to +200–300 XP, Quizzes: +100 XP, Plan Actions: +15 XP).
  - 200 XP per level with 5 collegiate tiers (*Rookie, Aware, Prepared, Responder, Guardian*).
  - Authoritative **Readiness Score** formula:
    $$\text{Readiness Score} = 0.40 \times \text{Drill Score} + 0.30 \times \text{Learn Score} + 0.30 \times \text{Plan Score}$$
- **Learn Hub (6 Disaster Modules & Quizzes)**:
  - Structured lessons covering Fire Dynamics, Hydrology & Floods, Wind Speeds & Cyclones, Seismic Waves, First Aid Triage, and Campus Evacuation.
  - 10-question mastery checks with instant remedial feedback.
- **Actionable 40-Point Personal Preparedness Plan**:
  - Emergency grab-bag checklist, medical note storage, campus warden contacts, and roommate rendezvous points.
- **5-Tab Responsive Navigation**:
  - Clean, accessible layout across desktop (sidebar) and mobile (bottom navigation bar, touch targets $\ge 44\text{px}$, body text $\ge 16\text{px}$, responsive down to $360\text{px}$).
- **Campus Mode (Institutional Tabletop Toolkit)**:
  - Multi-hazard vulnerability auditor, simulated crisis decision trainer, and facility safety checklists.
- **Offline Data Backup & Privacy**:
  - 100% client-side `localStorage` persistence.
  - Encrypted JSON Export & Import utility with backward compatibility.
- **ReadyVerse AI Companion (Dual Mode)**:
  - **Static Mode**: Grounded deterministic safety guidance, emergency drill routing, and readiness calculations.
  - **Full Server Mode**: Real-time Gemini Live voice WebSocket companion with automated Groq LPU text failover.

### 🧭 Features Planned (Roadmap)
- 🗄️ Multi-user live campus leaderboards backed by secure school SSO / OAuth.
- 📡 Integration with national early-warning disaster alert feeds (CAP / RSS).
- 📜 Verifiable PDF Certificate generation for certified campus safety ambassadors.
- 🗺️ Custom interactive campus 2D map builder for floor warden placement.

---

## 🛠️ Tech Stack

- **Front-End**: Vanilla HTML5, Modern CSS3 (Custom Properties / Variables, Responsive Flexbox & Grid, Dark/Light Themes), Vanilla ES6+ JavaScript.
- **Audio & Media**: HTML5 Canvas, Web Audio API, Inline SVG vector icons.
- **Client Storage**: `localStorage` (Schema v2 with auto-migration and JSON serialization).
- **Backend (Optional for Cloud AI)**: Lightweight Node.js server (`server.js`), `ws` WebSocket proxy for Gemini BidiGenerateContent, Groq REST failover router.
- **Zero Client Dependencies**: Runs purely in any modern web browser without npm bundles, Webpack, or framework runtimes.

---

## 📖 Authoritative Guidelines & Sources

The drill scenarios, emergency protocols, and learning materials in ReadyVerse are grounded in internationally recognized disaster risk management frameworks:
1. **NDMA** (National Disaster Management Authority, Government of India) — *Standard Operating Procedures for School & College Safety, Fire Safety, and Natural Hazards*.
2. **NIDM** (National Institute of Disaster Management) — *Campus Disaster Management Planning & First Responder Training Modules*.
3. **UNDRR** (United Nations Office for Disaster Risk Reduction) — *Sendai Framework for Disaster Risk Reduction (2015–2030)*.
4. **Red Cross & Red Crescent Movement** — *Emergency First Aid, Burns Treatment, and Triage Protocols*.

---

## ⚠️ Disclaimer & Limitations

### Disclaimer
> **ReadyVerse is an educational simulation and training tool.**  
> It is designed solely to build emergency awareness, spatial familiarity, and split-second crisis decision-making habits. Completion of drills, quizzes, or achieving a 100% Readiness Score does **not** constitute an official government certification, fire warden license, medical accreditation, or guaranteed safety during an actual disaster. In an actual crisis, always follow the real-time commands of campus marshals, local police, fire departments, and municipal emergency services.

### Limitations
- **Synthetic Scenarios**: Branching scenario trees are simplified models designed to teach core safety principles. They cannot simulate the chaotic unpredictability, psychological stress, or physical dynamics (e.g., toxic gas migration, structural collapse) of real disasters.
- **Static Public Hosting**: When hosted statically (e.g., on Vercel or Netlify without the Node.js backend), the app runs in **Static Mode**. Realtime generative voice streaming and cloud LLMs are gracefully disabled; all drills, quizzes, readiness scores, and local safety tools remain 100% operational.
- **Local Storage Scope**: User progress is stored in the local browser. Clearing browser cache or switching devices will reset progress unless exported to a backup JSON file via *Profile $\rightarrow$ Backup & Data*.

---

## 🔒 Security: API Keys & Credentials

> 🚨 **CRITICAL: NEVER COMMIT API KEYS TO SOURCE CONTROL.**

- All private API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`) belong strictly in your local `.env` file.
- The `.gitignore` file is pre-configured to ignore `.env`, `.env.local`, and test logs.
- Never hardcode secrets in client-side JS or HTML files.

---

## 🚀 How to Run Locally

### Option 1: Static Mode (No Node.js Backend Required)
You can run the full front-end using any local HTTP static server:

```bash
# Using Python
python -m http.server 8080

# Using Node / npx
npx serve .

# Using VS Code
# Install the 'Live Server' extension and click 'Go Live'
```
Open `http://localhost:8080` in your web browser.

---

### Option 2: Full Mode (With ReadyVerse AI Voice & Cloud Fallback)
To enable the Gemini Live Realtime Voice assistant and Groq LPU text failover:

1. **Clone the Repository & Install Dependencies**:
   ```bash
   git clone https://github.com/your-username/readyverse.git
   cd readyverse
   npm install
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Open `.env` in your text editor and add your API keys:
   ```ini
   GEMINI_API_KEY=your_google_ai_studio_gemini_api_key_here
   GROQ_API_KEY=your_groq_cloud_api_key_here
   PORT=3000
   ```

3. **Start the ReadyVerse Server**:
   ```bash
   npm start
   ```

4. **Open Application**:
   Navigate to `http://localhost:3000` in Google Chrome or Microsoft Edge (recommended for Web Audio / Microphone permissions).

---

## 🌐 Free Public Deployment (Step-by-Step)

ReadyVerse is 100% static-ready and can be hosted for free on **Vercel** or **Netlify** in under 2 minutes.

### Deploying to Vercel

#### Method A: Via Git (Recommended)
1. Push your ReadyVerse repository to GitHub or GitLab. *(Ensure `.env` is ignored by `.gitignore`)*.
2. Log in to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your ReadyVerse repository.
4. Keep the default settings:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Build Command**: *(leave empty)*
   - **Output Directory**: `./`
5. Click **Deploy**. Vercel will detect `vercel.json` and deploy your site to `https://your-project.vercel.app`.

#### Method B: Via Vercel CLI
```bash
npm i -g vercel
vercel
```

---

### Deploying to Netlify

#### Method A: Via Git
1. Push your repository to GitHub / GitLab.
2. Log in to [netlify.com](https://netlify.com) and click **"Add new site"** $\rightarrow$ **"Import an existing project"**.
3. Select your repository.
4. Netlify will automatically detect `netlify.toml`:
   - **Publish directory**: `.`
5. Click **Deploy ReadyVerse**. Your live site will be ready at `https://your-site.netlify.app`.

#### Method B: Drag & Drop (Instant)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop the `ReadyVerse` project folder directly into your browser window.
3. Your app will be live immediately!

---

## 🧪 Automated Testing

ReadyVerse includes 9 comprehensive test suites verifying daily drill rotation, progression math, non-blocking catalogs, student UX labels, navigation routing, responsive layouts, and syntax parsing:

```bash
# Run all test suites
node tests/test_daily_drill.js
node tests/test_stage1_progress.js
node tests/test_stage2_locks.js
node tests/test_stage2_navigation.js
node tests/test_stage3_renaming.js
node tests/test_stage4_navigation.js
node tests/test_stage5_home.js
node tests/test_stage6_visual.js
node tests/check_syntax.js
```

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and distribute for campus safety programs and educational initiatives.
