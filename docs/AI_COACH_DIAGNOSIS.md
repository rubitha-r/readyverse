# ReadyVerse AI Coach — Comprehensive Phase 0 Diagnostic Report

**Date:** 2026-10-11  
**Project:** ReadyVerse Disaster Preparedness Platform  
**Target:** Ask ReadyVerse AI (Beta) & Serverless Coach Architecture  

---

## 1. Executive Summary

A comprehensive investigation into the Ask ReadyVerse AI (Beta) pipeline identified **two interconnected root causes** that fully explain why suggested chips and canned responses sometimes work while typed messages repeatedly return *"The AI friend is offline right now. Check the lessons or call 112."*:

1. **Client-Server Disconnect on Netlify:**
   - The frontend provider modules ([`js/readyverse-ai/providers/gemini-live-provider.js:565`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/providers/gemini-live-provider.js#L565) and [`js/readyverse-ai/providers/groq-provider.js:71`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/providers/groq-provider.js#L71)) dispatch HTTP POST requests to `/api/chat`.
   - On Netlify, `/api/chat` maps to `/.netlify/functions/chat`, which **does not exist** (only [`netlify/functions/coach.js`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/netlify/functions/coach.js) exists). `/api/chat` returns **HTTP 404 Not Found**.
   - The frontend never called `/api/coach`.
   - When the network request fails with 404, the router falls back to local client-side pattern matching ([`js/readyverse-ai/ai-transport.js:532-625`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-transport.js#L532-L625)).

2. **Flawed Client-Side Fallback Rules & Prompt Boundary Over-Refusal:**
   - In [`js/readyverse-ai/ai-transport.js:532-625`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-transport.js#L532-L625), chips like `"What do I do in a fire?"` and `"Quiz me"` had exact string matches, creating the illusion that chips worked.
   - Freeform typed input like `"Hy ena pandra"` and `"Tell me about ReadyVerse"` failed every keyword rule and hit the catch-all line 624: `"The AI friend is offline right now. Check the lessons or call 112."`
   - In [`js/readyverse-ai/ai-transport.js:600`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-transport.js#L600), the check `text.includes('en')` greedily matched any Tamil/Tanglish message containing the substring `"en"` (e.g. `"ReadyVerse-la enna ellam irukku"`, `"content"`, `"friend"`), short-circuiting to an unrelated emergency numbers response.
   - Even when `/api/coach` is called directly, the backend system prompt in [`api/coach.js:125-127`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/api/coach.js#L125-L127) strictly instructed the model to refuse anything outside disaster safety with `"I'm not sure, check the lesson or call 112"`. Because ReadyVerse platform questions and casual greetings were omitted from the knowledge base, Gemini correctly followed instructions and refused them with the canned phrase.
   - Readiness questions reported 0% because `state.readiness` was read from an uncalculated property on `window.state` rather than invoking `ReadyVerseProgress.calculateReadiness()`.

---

## 2. End-to-End Trace of a Typed Message

When a student types a message in the chat input and taps send or presses Enter:

1. **Input Handler (`js/readyverse-ai/ai-ui.js:199-205, 598-614`):**
   - User types in `#rvAiTextInput` and triggers `handleTextSubmit()`.
   - Clears input, hides error banner.
   - Checks if voice is active (`isVoiceActive`). If false (default text mode), calls `this.transport.sendChatFallback(text)`.
2. **Intent & Language Detection (`js/readyverse-ai/ai-transport.js:344, 371`):**
   - Calls `AIPersonality.detectLanguage(cleanText)`.
   - Note: In current code, `detectLanguage` only sets `this.lastDetectedLanguage` for logging; it does not route intents or language styles.
3. **Request Construction (`js/readyverse-ai/ai-transport.js:383-394`):**
   - Builds `systemPrompt = AIPersonality.buildAugmentedPrompt(contextData)`.
   - Assembles messages: `[{ role: 'system', content: systemPrompt }, ...history.slice(-8)]`.
   - Wraps in `chatOptions = { messages, systemInstruction, temperature: 0.7 }`.
4. **Transport / Provider Module (`js/readyverse-ai/ai-transport.js:401-406`):**
   - Dispatches to active provider (`GeminiLiveProvider` or `GroqProvider`).
   - Invokes `this.activeProvider.sendChatFallback(chatOptions)`.
5. **Network Call (`js/readyverse-ai/providers/gemini-live-provider.js:565-585`):**
   - Endpoint target: `${this.serverUrl}/api/chat`.
   - Issues `fetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) })`.
   - **FAILURE POINT:** In Netlify production, `/api/chat` does not exist (`404 Not Found`).
   - `res.ok` is false; throws `Error('Gemini chat error HTTP 404')`.
6. **Provider Failover (`js/readyverse-ai/ai-transport.js:410-436`):**
   - Catches `primaryErr`. Logs warning.
   - Attempts backup provider: `GroqProvider.sendChatFallback()`.
   - Target: `fetch('/api/chat')`.
   - **FAILURE POINT:** Backup also fails with **HTTP 404 Not Found**.
7. **Local Fallback Short-Circuit (`js/readyverse-ai/ai-transport.js:434-436`):**
   - Catches `backupErr`.
   - Calls `this.generateGroundedFallback(cleanText, contextData)`.
   - Calls `this.enterOfflineReady(backupErr.message)`.
8. **Fallback Keyword Evaluation (`js/readyverse-ai/ai-transport.js:532-625`):**
   - If user input does not match PASS, Stop Drop Roll, Earthquake, Flood, Cyclone, or the exact text of suggested chips, it falls through to line 624:
   - Returns: `"The AI friend is offline right now. Check the lessons or call 112."`
9. **UI Rendering (`js/readyverse-ai/ai-ui.js:679-740`):**
   - Appends message to `#rvAiTranscript` as assistant bubble.
   - Shows banner: `"The AI friend is offline right now. Check the lessons or call 112."`
   - Sets status pill to `Offline Ready Mode`.

---

## 3. Investigation of Candidate Causes (1 to 9)

| # | Candidate Cause | Verdict | Evidence & File Location |
|---|----------------|---------|--------------------------|
| **1** | Frontend calls an endpoint that exists only in `server.js` (or WebSocket) and does not exist on Netlify (404/405). | **FAIL (Primary Root Cause)** | [`gemini-live-provider.js:565`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/providers/gemini-live-provider.js#L565) and [`groq-provider.js:71`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/providers/groq-provider.js#L71) call `/api/chat`. In `netlify/functions/`, only `coach.js` exists. `/api/chat` returns HTTP 404 on Netlify. Netlify Functions cannot hold WebSockets ([`gemini-live-provider.js:98`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/providers/gemini-live-provider.js#L98)). |
| **2** | Missing or misnamed environment variables in Netlify dashboard; provider key not configured. | **FAIL (Secondary Root Cause)** | In [`api/coach.js:173, 236`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/api/coach.js#L173), the function checks `process.env.GEMINI_API_KEY` and `process.env.GROQ_API_KEY`. Without these configured in the Netlify Dashboard, the function throws `GEMINI_API_KEY_UNAVAILABLE` and falls back to canned strings. |
| **3** | `netlify.toml` redirects/function paths, HTTP method mismatch, wrong request or response schema, JSON parsing errors. | **FAIL (Secondary Root Cause)** | [`netlify.toml:6-9`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/netlify.toml#L6-L9) redirects `/api/coach` to `/.netlify/functions/coach`. However, [`api/coach.js:491`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/api/coach.js#L491) expects `{ message: "..." }`, while `ai-transport.js` sends `{ messages: [...] }`. If `/api/chat` was redirected to `coach.js`, it would error with `400 INVALID_REQUEST (Message cannot be empty)`. |
| **4** | Function timeout or provider timeout; rate limits or quota errors (429). | **FAIL (Contributing Factor)** | In [`api/coach.js:215, 272`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/api/coach.js#L215), Gemini timeout is 7000ms and Groq timeout is 7000ms. If Gemini stalls, 7s + 7s = 14s, which exceeds Netlify's 10-second default execution limit, causing Netlify 502/504 gateway timeouts. In [`api/coach.js:23`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/api/coach.js#L23), rate limiting is set to 10 req/min. |
| **5** | CORS or deployment configuration errors. | **FAIL (Contributing Factor)** | When `/api/chat` returns 404 from Netlify, it returns an HTML error page without CORS headers, causing browser console CORS error noise. |
| **6** | Local intent matcher or language detector short-circuits free text into canned answers, or sends unmatched messages down an error path. | **FAIL (Primary Root Cause)** | [`ai-transport.js:600`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-transport.js#L600) contains `text.includes('en')`. Since `"en"` is a common substring in Tamil, Tanglish, and English words, any sentence containing `"en"` gets routed to the emergency helpline string. "Hy ena pandra" and "Tell me about ReadyVerse" do not match any keywords, so they hit line 624: "The AI friend is offline right now...". |
| **7** | Catch-all error handler maps every failure (404, 500, timeout, parse error, offline) to the same "AI friend is offline" message. | **FAIL (Primary Root Cause)** | [`ai-ui.js:826`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-ui.js#L826), [`ai-ui.js:335`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-ui.js#L335), and [`ai-transport.js:624`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-transport.js#L624) map every network error, 404, 500, and unmatched input to the identical text `"The AI friend is offline right now. Check the lessons or call 112."`. |
| **8** | Chips use a different code path from typed input. | **PASS (Mechanism Clarified)** | Both chips and typed input invoke `handleTextSubmit()` ([`ai-ui.js:199, 818`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-ui.js#L199)). However, the chips submit exact strings (`"What do I do in a fire?"`, `"Quiz me"`), which match hardcoded rules in `generateGroundedFallback()`. Typed text fails the keyword rules and returns the offline string. |
| **9** | Readiness read from a stale object, wrong storage key, or a default instead of live `ReadyVerseProgress` state. | **FAIL (Primary Root Cause)** | [`ai-context.js:94, 331`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/readyverse-ai/ai-context.js#L94) reads `state.readiness`, which is initialized to 0 and not recalculated live on query. Furthermore, `ReadyVerseProgress.calculateReadiness()` was never invoked by `getCoachContext()`. In [`progress.js:43`](file:///c:/Users/Ruby/OneDrive/Desktop/ReadyVerse/js/progress.js#L43), the storage key is `"readyverse:v2"`, while documentation and user expectation referenced `"readyverse_player_progress_v2"`. |

---

## 4. Local Reproduction Evidence & Captured Status Codes

### A. Without API Keys Configured (Simulating Netlify Fresh Deploy)
```javascript
// Invoking api/coach.js handleCoachRequest locally without keys:
1. "Hy ena pandra"
   -> Status: 200, Provider: grounded_local
   -> Response: "I'm not sure, check the lesson or call 112"
2. "Tell me about ReadyVerse"
   -> Status: 200, Provider: grounded_local
   -> Response: "I'm not sure, check the lesson or call 112"
3. "ReadyVerse platform-la enna ellam irukku nu Tanglish-la explain pannunga"
   -> Status: 200, Provider: grounded_local
   -> Response: "Bro, official emergency numbers: 112 (National Emergency), 101 (Fire Service), 108 (Ambulance). Note panni vechukkonga!"
4. "What is the highest-impact action I should do next to improve my readiness?"
   -> Status: 200, Provider: grounded_local
   -> Response: "I'm not sure, check the lesson or call 112"
```

### B. With API Keys Configured (Direct Gemini Call to api/coach.js)
```javascript
// Invoking api/coach.js handleCoachRequest with GEMINI_API_KEY:
1. "Hy ena pandra"
   -> Status: 200, Provider: gemini
   -> Response: "I'm not sure, check the lesson or call 112"
   -> REASON: Rule 4 in system prompt instructed Gemini to refuse all non-disaster chitchat.
2. "Tell me about ReadyVerse"
   -> Status: 200, Provider: gemini
   -> Response: "I'm not sure, check the lesson or call 112"
   -> REASON: The system prompt context had no knowledge sheet explaining ReadyVerse features.
3. "What is the highest-impact action I should do next to improve my readiness?"
   -> Status: 200, Provider: gemini
   -> Response: "I'm not sure, check the lesson or call 112"
   -> REASON: The request did not include user progress context, so the model had nothing to ground its answer.
```

### C. Client-Side HTTP Call to /api/chat
```
POST http://localhost:8098/api/chat
Status: 404 Not Found (on static deploy and Netlify)
Console Error: POST /api/chat 404 (Not Found)
Router Failover: Provider 'gemini' failed -> Provider 'groq' failed -> Grounded ReadyVerse Fallback engaged.
Output: "The AI friend is offline right now. Check the lessons or call 112."
```

---

## 5. Architectural Alignment & Implementation Plan

No third-party architectural changes, paid services, or new providers are required. The fix will:

1. **Unify Client Transport:**
   - Eliminate `/api/chat` references in client providers.
   - Route all typed text, chip clicks, and voice transcript submissions through **one shared pipeline**: `sendToCoach(message, source)`.
   - Make all requests target `/api/coach` with unified request schema `{ message, history, context, languageHint }`.
2. **Harmonize Server Function (`api/coach.js` & `netlify/functions/coach.js`):**
   - Accept `{ message, text, history, context }` cleanly.
   - Adjust timeout: Gemini 5000ms, Groq 4000ms (total < 9.5s, well within Netlify's 10s budget).
   - Add `/api/coach-health` endpoint returning reachable status and configured boolean (zero secrets).
   - Implement structured error response `{ ok: false, code, message }` with distinct codes: `not_configured`, `network`, `timeout`, `rate_limited`, `provider_error`, `bad_request`.
3. **Enhance System Prompt & ReadyVerse Knowledge Base:**
   - Add collegiate chitchat handling and warm greetings in English, Tamil, and Tanglish.
   - Add a verified ReadyVerse knowledge sheet (4 drills, 6 lessons, 40 actions, XP, readiness formula).
   - Ground readiness questions in the student's live numbers passed in `context`.
4. **Implement Deterministic Multilingual Detector (Phase 3):**
   - Explicit tags ("in Tamil", "Tanglish-la"), Tamil script regex `[\u0B80-\u0BFF]`, and comprehensive Tanglish lexicon tokenizer.
5. **Implement Deterministic Quiz State Machine (Phase 4):**
   - Code-level validation of answers against answer key options (no LLM hallucinations).
6. **Implement Real Live Readiness Context (Phase 5):**
   - Call `ReadyVerseProgress.calculateReadiness()` on live state.
   - Support both `readyverse:v2` and `readyverse_player_progress_v2` storage keys.
7. **Refine Two-Way Voice & UI Polish (Phases 6 & 7):**
   - Voice state machine, clear tags ("AI" vs "Built-in"), mobile viewport pinning, accessible live regions.
