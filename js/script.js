"use strict";

const RV_DEBUG = false;
const rvLog = (typeof window !== "undefined" && typeof window.rvLog === "function")
    ? window.rvLog
    : function(...args) {
        try {
            if (typeof window !== "undefined" && (window.RV_DEBUG === true || RV_DEBUG === true || (typeof localStorage !== "undefined" && localStorage.getItem("rv_debug") === "1"))) {
                console.log(...args);
            }
        } catch (_) {}
    };

/* =========================================================
   READYVERSE — APPLICATION STATE
   ========================================================= */

const state = (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.createDefaultState === "function")
    ? ReadyVerseProgress.createDefaultState()
    : {
        currentMission: null,
        currentDecision: 0,
        score: 0,
        missionXP: 0,
        totalXP: 0,
        completedMissions: 0,
        decisionsMade: 0,
        readiness: 0,
        correctDecisions: 0,
        answered: false,
        completionRecorded: false,
        completedMissionIds: new Set(),
        missionBestScores: {},
        missionBestGrades: {},
        completedLearnIds: new Set(),
        learnQuizScores: {},
        prepProfile: {
            name: "Student",
            college: "Campus Community",
            emergencyContact: "",
            campusContact: "",
            priorityHazard: "all",
            medicalNotes: ""
        },
        prepChecklistState: {},
        completedPrepItemIds: new Set(),
        dailyStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        unlockedAchievements: new Set(),
        rewardedAchievements: new Set(),
        unlockedCapabilities: new Set(),
        performanceHistory: [],
        lastResult: null,
        themePreference: "system",
        responderProfile: {
            name: "Student",
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        },
        campusStudio: {
            activeRole: "student",
            campusProfile: {
                name: "SNS Campus",
                type: "Engineering College & Hostel Block",
                hazard: "flood",
                assemblyPoint: "Main Sports Ground",
                emergencyContact: "Not configured"
            },
            tabletopStep: 0,
            selectedScenarioId: "campus_flood",
            tabletopAnswers: [],
            aarRecords: []
        }
    };

/* =========================================
   CALENDAR DATE & STREAK UTILITIES
   ========================================= */

function getLocalDateString(d = new Date()) {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.getLocalDateString === "function") {
        return ReadyVerseProgress.getLocalDateString(d);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getCalendarDayDiff(dateStr1, dateStr2) {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.getCalendarDayDiff === "function") {
        return ReadyVerseProgress.getCalendarDayDiff(dateStr1, dateStr2);
    }
    if (!dateStr1 || !dateStr2) return null;
    const [y1, m1, d1] = dateStr1.split("-").map(Number);
    const [y2, m2, d2] = dateStr2.split("-").map(Number);
    const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
    const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((date2.getTime() - date1.getTime()) / msPerDay);
}

function recordDailyActivity() {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.recordActivity === "function") {
        ReadyVerseProgress.recordActivity(state);
        return;
    }
    const today = getLocalDateString();
    if (!state.lastActivityDate) {
        state.dailyStreak = 1;
        state.lastActivityDate = today;
    } else if (state.lastActivityDate === today) {
        if (!state.dailyStreak || state.dailyStreak < 1) {
            state.dailyStreak = 1;
        }
    } else {
        const dayDiff = getCalendarDayDiff(state.lastActivityDate, today);
        if (dayDiff === 1) {
            state.dailyStreak = (state.dailyStreak || 0) + 1;
            state.lastActivityDate = today;
        } else if (dayDiff > 1) {
            state.dailyStreak = 1;
            state.lastActivityDate = today;
        } else {
            state.lastActivityDate = today;
        }
    }
    if (!state.longestStreak || state.dailyStreak > state.longestStreak) {
        state.longestStreak = state.dailyStreak || 1;
    }
}

/* =========================================
   READYVERSE — PERSISTENT PLAYER PROGRESS
   ========================================= */

const STORAGE_KEY = (typeof ReadyVerseProgress !== "undefined" && ReadyVerseProgress.STORAGE_KEY)
    ? ReadyVerseProgress.STORAGE_KEY
    : "readyverse:v2";


/* =========================================
   CALCULATE LEVEL HELPER
   ========================================= */

function calculateLevel(xp = 0) {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.calculateLevel === "function") {
        return ReadyVerseProgress.calculateLevel(xp);
    }
    const xpVal = Math.max(0, Math.floor(Number(xp) || 0));
    const level = Math.floor(xpVal / 200) + 1;
    const xpIntoLevel = xpVal % 200;
    const title = level <= 2 ? "Rookie" : (level <= 4 ? "Aware" : (level <= 7 ? "Prepared" : (level <= 10 ? "Responder" : "Guardian")));
    return {
        level: level,
        title: title,
        totalXP: xpVal,
        xpPerLevel: 200,
        xpIntoLevel: xpIntoLevel,
        xpToNextLevel: 200 - xpIntoLevel,
        remainingXP: 200 - xpIntoLevel,
        levelStartXP: (level - 1) * 200,
        nextLevelXP: level * 200,
        progressPct: Math.min(100, Math.max(0, (xpIntoLevel / 200) * 100))
    };
}

const RESPONDER_CUSTOMIZATIONS = {
    titles: [
        { id: "trainee", name: "Student", icon: "🏷️", reqAchievement: null, desc: "Default cadet responder identity." },
        { id: "emergency_learner", name: "Emergency Learner", icon: "🎓", reqAchievement: "First Mission Completed", desc: "Awarded for completing your first digital disaster drill." },
        { id: "rapid_responder", name: "Rapid Responder", icon: "⚡", reqAchievement: "Quick Thinker", desc: "Awarded for decisive action under crisis pressure." },
        { id: "flood_specialist", name: "Flood Specialist", icon: "🌊", reqAchievement: "Flood Survivor", desc: "Awarded for clearing Flash Flood drill with 80%+ score." },
        { id: "storm_commander", name: "Storm Commander", icon: "🌪️", reqAchievement: "Storm Master", desc: "Awarded for mastering severe cyclone protocols." },
        { id: "crisis_operator", name: "Crisis Operator", icon: "🎖️", reqAchievement: "Level 5 Achieved", desc: "Awarded for reaching Level 5 field leadership." },
        { id: "multi_hazard", name: "Multi-Hazard Responder", icon: "🌐", reqAchievement: "All 4 Missions Completed", desc: "Awarded for mastering all 4 core disaster scenarios." },
        { id: "elite_responder", name: "Elite Responder", icon: "♛", reqAchievement: "Leaderboard Champion", desc: "Awarded for reaching top 3 community standing." },
        { id: "readyverse_master", name: "ReadyVerse Master", icon: "👑", reqAchievement: "Preparedness Master", desc: "Awarded for completing all 40 structured preparedness records." }
    ],
    outfits: [
        { id: "responder_standard", name: "Standard Cadet Vest", icon: "🧑‍🚒", cssClass: "outfit-standard", reqAchievement: null, desc: "High-visibility cadet field safety vest." },
        { id: "flood_gear", name: "Swiftwater Response Gear", icon: "🌊", cssClass: "outfit-flood", reqAchievement: "Flood Survivor", desc: "Reflective waterproof protective gear." },
        { id: "storm_gear", name: "Storm Weather Gear", icon: "🌪️", cssClass: "outfit-storm", reqAchievement: "Storm Master", desc: "Heavy-duty wind and rain outer shell." },
        { id: "campus_safety_gear", name: "Campus Safety Gear", icon: "🦺", cssClass: "outfit-medic", reqAchievement: "Preparedness Starter", desc: "Campus safety volunteer uniform and utility pouch." },
        { id: "incident_lead", name: "Incident Leader Vest", icon: "🎖️", cssClass: "outfit-lead", reqAchievement: "Level 5 Achieved", desc: "Campus response vest for leadership-themed training identity." }
    ],
    frames: [
        { id: "standard_frame", name: "Standard Cadet Border", cssClass: "frame-standard", reqAchievement: null, desc: "Clean metallic training border." },
        { id: "flood_frame", name: "Hydrological Border", cssClass: "frame-flood", reqAchievement: "Flood Survivor", desc: "Cyan flood-resilience border." },
        { id: "storm_frame", name: "Cyclone Alert Border", cssClass: "frame-storm", reqAchievement: "Storm Master", desc: "Amber storm warning border." },
        { id: "precision_frame", name: "Precision Gold Border", cssClass: "frame-precision", reqAchievement: "Perfect Response", desc: "Gold frame for flawless drill decision-making." },
        { id: "elite_frame", name: "Responder Elite Platinum", cssClass: "frame-elite", reqAchievement: "Leaderboard Champion", desc: "Platinum frame for top-tier responders." }
    ]
};

function saveProgress() {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.saveState === "function") {
        ReadyVerseProgress.saveState(state);
        return;
    }

    const progress = {
        totalXP: state.totalXP,
        completedMissions: state.completedMissions,
        decisionsMade: state.decisionsMade,
        readiness: state.readiness,
        correctDecisions: state.correctDecisions,
        completedMissionIds: Array.from(state.completedMissionIds),
        missionBestScores: state.missionBestScores,
        missionBestGrades: state.missionBestGrades,
        completedLearnIds: Array.from(state.completedLearnIds || []),
        learnQuizScores: state.learnQuizScores || {},
        prepProfile: state.prepProfile || {},
        prepChecklistState: state.prepChecklistState || {},
        completedPrepItemIds: Array.from(state.completedPrepItemIds || []),
        dailyStreak: state.dailyStreak,
        longestStreak: state.longestStreak,
        lastActivityDate: state.lastActivityDate,
        unlockedAchievements: Array.from(state.unlockedAchievements),
        rewardedAchievements: Array.from(state.rewardedAchievements || []),
        unlockedCapabilities: Array.from(state.unlockedCapabilities || []),
        performanceHistory: state.performanceHistory,
        lastResult: state.lastResult,
        themePreference: state.themePreference || "system",
        responderProfile: state.responderProfile || {},
        campusStudio: state.campusStudio || {}
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function loadProgress() {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.loadState === "function") {
        ReadyVerseProgress.loadState(state);
        applyTheme(state.themePreference || (localStorage.getItem("readyverse_theme_preference") || "system"));
        return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
        applyTheme(state.themePreference || (localStorage.getItem("readyverse_theme_preference") || "system"));
        return;
    }

    try {
        const progress = JSON.parse(saved);

        state.totalXP = progress.totalXP ?? state.totalXP;
        state.completedMissions =
            progress.completedMissions ?? state.completedMissions;

        state.decisionsMade =
            progress.decisionsMade ?? state.decisionsMade;

        state.readiness =
            progress.readiness ?? state.readiness;

        state.correctDecisions =
            progress.correctDecisions ?? state.correctDecisions;

        state.completedMissionIds =
            new Set(progress.completedMissionIds ?? []);

        state.missionBestScores =
            progress.missionBestScores ?? {};

        state.missionBestGrades =
            progress.missionBestGrades ?? {};

        state.completedLearnIds =
            new Set(progress.completedLearnIds ?? []);

        state.learnQuizScores =
            progress.learnQuizScores ?? {};

        state.prepProfile =
            Object.assign({
                name: "Student",
                college: "Campus Community",
                emergencyContact: "",
                campusContact: "",
                priorityHazard: "all",
                medicalNotes: ""
            }, progress.prepProfile || {});

        if (progress.prepProfile && progress.prepProfile.householdCount && !state.prepProfile.college) {
            state.prepProfile.college = "Campus Community";
        }

        state.prepChecklistState =
            progress.prepChecklistState ?? {};

        state.completedPrepItemIds =
            new Set(progress.completedPrepItemIds ?? []);

        state.dailyStreak =
            progress.dailyStreak ?? state.dailyStreak;

        state.longestStreak =
            progress.longestStreak ?? Math.max(state.dailyStreak, 1);

        state.lastActivityDate =
            progress.lastActivityDate ?? state.lastActivityDate;

        state.unlockedAchievements =
            new Set(progress.unlockedAchievements ?? []);

        state.rewardedAchievements =
            new Set(progress.rewardedAchievements ?? []);

        state.unlockedCapabilities =
            new Set(progress.unlockedCapabilities ?? []);

        state.performanceHistory =
            progress.performanceHistory ?? [];

        state.lastResult =
            progress.lastResult ?? state.lastResult;

        state.themePreference =
            progress.themePreference ?? (localStorage.getItem("readyverse_theme_preference") || "system");

        state.responderProfile = Object.assign({
            name: state.prepProfile?.name || "Student",
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        }, progress.responderProfile || {});

        state.campusStudio = Object.assign({
            activeRole: "student",
            campusProfile: {
                name: "SNS Campus",
                type: "Engineering College & Hostel Block",
                hazard: "flood",
                assemblyPoint: "Main Sports Ground",
                emergencyContact: "Not configured"
            },
            tabletopStep: 0,
            selectedScenarioId: "campus_flood",
            tabletopAnswers: [],
            aarRecords: []
        }, progress.campusStudio || {});

    } catch (error) {
        console.error("Could not load ReadyVerse progress:", error);
    }

    applyTheme(state.themePreference);
}

/* =========================================================
   THEME CONTROLLER (LIGHT / DARK / SYSTEM)
   ========================================================= */

function getSystemTheme() {
    try {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch(e) {
        return "dark";
    }
}

function applyTheme(preference = "system") {
    const resolvedTheme = preference === "system" ? getSystemTheme() : preference;
    if (typeof document !== "undefined" && document.documentElement && typeof document.documentElement.setAttribute === "function") {
        document.documentElement.setAttribute("data-theme", resolvedTheme);
        document.documentElement.setAttribute("data-theme-preference", preference);
    }

    // Update active state on all theme buttons in DOM
    if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
        document.querySelectorAll(".theme-option-btn, .theme-compact-btn").forEach(btn => {
            if (typeof btn.getAttribute === "function" && btn.classList) {
                const btnTheme = btn.getAttribute("data-theme");
                const isActive = btnTheme === preference;
                btn.classList.toggle("active", isActive);
                if (typeof btn.setAttribute === "function") {
                    btn.setAttribute("aria-checked", isActive ? "true" : "false");
                }
            }
        });
    }

    const statusIndicator = typeof $ === "function" ? $("themeStatusIndicator") : null;
    if (statusIndicator) {
        if (preference === "system") {
            statusIndicator.textContent = `SYSTEM (${resolvedTheme.toUpperCase()})`;
        } else {
            statusIndicator.textContent = preference.toUpperCase();
        }
    }
}

function setTheme(preference) {
    if (!["light", "dark", "system"].includes(preference)) return;
    state.themePreference = preference;
    try {
        localStorage.setItem("readyverse_theme_preference", preference);
    } catch (e) {}
    saveProgress();
    applyTheme(preference);
    showToast(`Theme: ${preference.toUpperCase()}`, preference === "light" ? "☀" : (preference === "dark" ? "☾" : "⚙"));
}

// React to OS color scheme changes if in System mode
if (typeof window !== "undefined" && window.matchMedia) {
    try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (state.themePreference === "system") {
                applyTheme("system");
            }
        });
    } catch (e) {}
}

// Global theme switcher button delegation
if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".theme-option-btn, .theme-compact-btn");
        if (btn) {
            const theme = btn.getAttribute("data-theme");
            if (theme) {
                setTheme(theme);
            }
        }
    });
}

/* Load saved progress when the application starts */
loadProgress();

/* =========================================================
   HELPER
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


function formatNumber(number) {
    return Number(number).toLocaleString("en-IN");
}


/* =========================================================
   TOAST & RANK HELPERS
   ========================================================= */

let toastTimeout = null;

function showToast(message, icon = "⚡") {
    const toast = $("toast");
    const toastMsg = $("toastMessage");
    const toastIcn = $("toastIcon");
    if (!toast || !toastMsg) return;

    if (toastIcn) toastIcn.textContent = icon;
    toastMsg.textContent = message;
    toast.classList.remove("hidden");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

function getResponderRank(xp) {
    const lvlInfo = typeof calculateLevel === "function" 
        ? calculateLevel(xp) 
        : { level: 1, title: "Rookie" };
    return {
        level: lvlInfo.level,
        title: lvlInfo.title,
        tag: lvlInfo.title.toUpperCase()
    };
}

/* =========================================================
   DYNAMIC WEIGHTED READINESS SCORE (40% / 30% / 30%)
   ========================================================= */

function calculateReadiness() {
    if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.calculateReadiness === "function") {
        const result = ReadyVerseProgress.calculateReadiness(state);
        state.readiness = result.totalReadiness;
        return state.readiness;
    }

    // Fallback: 40% Simulation + 30% Learning + 30% Preparedness (0% fallback for uncompleted)
    const missionKeys = ["fire", "flood", "cyclone", "earthquake"];
    let missionSum = 0;
    missionKeys.forEach(k => {
        if (state.completedMissionIds && state.completedMissionIds.has(k)) {
            missionSum += (state.missionBestScores && state.missionBestScores[k]) || 0;
        }
    });
    const missionAvg = missionSum / missionKeys.length;
    const missionComponent = 0.40 * missionAvg;

    const learnCompletedCount = state.completedLearnIds ? state.completedLearnIds.size : 0;
    const learnPct = (learnCompletedCount / 6) * 100;
    const learningComponent = 0.30 * learnPct;

    const prepCompletedCount = state.completedPrepItemIds ? state.completedPrepItemIds.size : 0;
    const prepPct = (prepCompletedCount / 40) * 100;
    const checklistComponent = 0.30 * prepPct;

    const totalReadiness = Math.round(missionComponent + checklistComponent + learningComponent);
    state.readiness = Math.max(0, Math.min(100, totalReadiness));
    return state.readiness;
}


/* =========================================================
   PAGE REFERENCES
   ========================================================= */

const loadingScreen = $("loadingScreen");

const landingPage = $("landingPage");
const dashboardPage = $("dashboardPage");
const simulationPage = $("simulationPage");
const resultPage = $("resultPage");


/* =========================================================
   PAGE SWITCHING
   ========================================================= */

function showPage(page) {

    const pages = [
        landingPage,
        dashboardPage,
        simulationPage,
        resultPage
    ];

    pages.forEach(element => {
        if (element) {
            element.classList.add("hidden");
        }
    });

    if (page) {
        page.classList.remove("hidden");
    }

    if (page && page !== landingPage) {
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            try {
                window.dispatchEvent(new CustomEvent("readyverse:app-entered"));
            } catch (_) {}
        }
    }

    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

}


/* =========================================================
   LOADING SCREEN
   ========================================================= */

window.addEventListener("load", () => {
    let seen = false;
    try {
        seen = sessionStorage.getItem("readyverse_loading_seen") === "true";
    } catch (_) {}

    const delay = seen ? 0 : 900;
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.classList.add("loaded");
        }
        try {
            sessionStorage.setItem("readyverse_loading_seen", "true");
        } catch (_) {}
    }, delay);
});


/* =========================================================
   PROMPT 5: 3-SCREEN ONBOARDING & CELEBRATION ENGINE
   ========================================================= */

let celebrationAnimationId = null;

function triggerCelebration(type = "general", details = {}) {
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let message = "🎉 Great job on your crisis drill!";
    let icon = "🎉";

    if (type === "level_up") {
        const lvl = details.level || 2;
        const title = details.title || "First Responder";
        message = `Level Up! You reached Level ${lvl} · ${title}! Outstanding campus safety dedication.`;
        icon = "⚡";
    } else if (type === "badge_unlock") {
        const name = details.badgeName || "Safety Badge";
        message = `New Safety Badge Unlocked: ${name}! Your emergency capability grew.`;
        icon = "🏅";
    } else if (type === "perfect_drill") {
        const drill = details.drillName || "Emergency Drill";
        message = `Flawless Crisis Instincts! Perfect 100% score achieved in ${drill}!`;
        icon = "🌟";
    }

    // Kind toast notification
    showToast(message, icon);

    // If reduced motion is requested, respect preference and skip moving canvas particles
    if (prefersReducedMotion) {
        return;
    }

    launchCanvasConfetti();
}

function launchCanvasConfetti() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const canvas = $("celebrationCanvas");
    if (!canvas || typeof canvas.getContext !== "function") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (celebrationAnimationId) {
        cancelAnimationFrame(celebrationAnimationId);
        celebrationAnimationId = null;
    }

    const width = window.innerWidth || 800;
    const height = window.innerHeight || 600;
    canvas.width = width;
    canvas.height = height;
    canvas.classList.remove("hidden");

    const colors = ["#6C4CF1", "#818CF8", "#F59E0B", "#FBBF24", "#22C55E", "#34D399", "#06B6D4", "#F87171"];
    const particleCount = 75;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: width * 0.5 + (Math.random() - 0.5) * (width * 0.5),
            y: height * 0.35 + (Math.random() - 0.5) * 80,
            vx: (Math.random() - 0.5) * 10,
            vy: -Math.random() * 8 - 3,
            size: Math.random() * 8 + 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
            gravity: 0.16 + Math.random() * 0.08,
            drag: 0.98,
            opacity: 1,
            shape: Math.random() > 0.4 ? "rect" : "circle"
        });
    }

    let frames = 0;
    const maxFrames = 140;

    function renderConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frames++;

        let aliveCount = 0;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= p.drag;
            p.rotation += p.rotSpeed;

            if (frames > 70) {
                p.opacity = Math.max(0, 1 - (frames - 70) / (maxFrames - 70));
            }

            if (p.opacity > 0 && p.y < height + 40) {
                aliveCount++;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;

                if (p.shape === "rect") {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        if (aliveCount > 0 && frames < maxFrames) {
            celebrationAnimationId = requestAnimationFrame(renderConfetti);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.classList.add("hidden");
            celebrationAnimationId = null;
        }
    }

    celebrationAnimationId = requestAnimationFrame(renderConfetti);
}

function isOnboardingCompleted() {
    try {
        if (typeof state !== "undefined" && state.onboardingCompleted) return true;
        if (typeof localStorage !== "undefined") {
            return localStorage.getItem("readyverse_onboarding_completed") === "true";
        }
    } catch (_) {}
    return false;
}

function showOnboardingModal() {
    const modal = $("onboardingModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    goToOnboardingStep(1);
    const input = $("onboardingFirstNameInput");
    if (input) {
        const currentFirst = getStudentFirstName();
        if (currentFirst && currentFirst !== "Student") {
            input.value = currentFirst;
        }
        setTimeout(() => input.focus(), 150);
    }
}

function closeOnboardingModal() {
    const modal = $("onboardingModal");
    if (modal) modal.classList.add("hidden");
}

function goToOnboardingStep(step) {
    if (step === 2) {
        const input = $("onboardingFirstNameInput");
        const raw = input ? input.value.trim() : "";
        const cleanFirst = raw.split(/\s+/)[0].replace(/[^\p{L}\p{N}._-]/gu, "");
        const firstName = cleanFirst || "Student";
        if (typeof state !== "undefined") {
            if (!state.prepProfile) state.prepProfile = {};
            if (!state.responderProfile) state.responderProfile = {};
            state.prepProfile.name = firstName;
            state.responderProfile.name = firstName;
            if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.saveState === "function") {
                ReadyVerseProgress.saveState(state);
            }
        }
    }

    const step1 = $("onboardingStep1");
    const step2 = $("onboardingStep2");
    const step3 = $("onboardingStep3");
    if (step1) step1.classList.toggle("hidden", step !== 1);
    if (step2) step2.classList.toggle("hidden", step !== 2);
    if (step3) step3.classList.toggle("hidden", step !== 3);

    const dot1 = $("onboardingDot1");
    const dot2 = $("onboardingDot2");
    const dot3 = $("onboardingDot3");
    if (dot1) dot1.classList.toggle("active", step >= 1);
    if (dot2) dot2.classList.toggle("active", step >= 2);
    if (dot3) dot3.classList.toggle("active", step >= 3);
}

function nextOnboardingStep(step) {
    goToOnboardingStep(step);
}

function selectTrainingGoal(goal) {
    if (typeof state !== "undefined") {
        state.trainingGoal = goal;
    }
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("readyverse_training_goal", goal);
        }
    } catch (_) {}

    const cardDaily = $("goalCardDaily");
    const cardWeekly = $("goalCardWeekly");
    if (cardDaily) {
        cardDaily.classList.toggle("selected", goal === "daily");
        cardDaily.setAttribute("aria-checked", goal === "daily" ? "true" : "false");
    }
    if (cardWeekly) {
        cardWeekly.classList.toggle("selected", goal === "weekly_3");
        cardWeekly.setAttribute("aria-checked", goal === "weekly_3" ? "true" : "false");
    }
}

function completeOnboardingAndStartDrill() {
    if (typeof state !== "undefined") {
        state.onboardingCompleted = true;
        if (!state.trainingGoal) state.trainingGoal = "daily";
        if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.saveState === "function") {
            ReadyVerseProgress.saveState(state);
        }
    }
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem("readyverse_onboarding_completed", "true");
            localStorage.setItem("readyverse_training_goal", (state && state.trainingGoal) || "daily");
        }
    } catch (_) {}

    closeOnboardingModal();
    showPage(dashboardPage);
    switchSection("dashboard");
    updateAllUI();

    if (typeof startDailyDrill === "function") {
        setTimeout(() => startDailyDrill(), 200);
    }
}


/* =========================================================
   LANDING PAGE
   ========================================================= */

const enterReadyVerse =
    $("enterReadyVerse");

const exploreButton =
    $("exploreButton");


function openDashboard(bypassOnboarding = false) {

    if (!bypassOnboarding && !isOnboardingCompleted()) {
        showOnboardingModal();
        return;
    }

    showPage(dashboardPage);

    switchSection("dashboard");

    updateAllUI();

}


/* ENTER READYVERSE */

if (enterReadyVerse) {

    enterReadyVerse.addEventListener(
        "click",
        () => {
            if (!isOnboardingCompleted()) {
                showOnboardingModal();
            } else {
                startFullscreenCinematicExperience();
            }
        }
    );

}


/* EXPLORE / SEE HOW IT WORKS */

if (exploreButton) {

    exploreButton.addEventListener(
        "click",
        () => {
            const target = $("whyReadyVerse");
            if (target) {
                target.scrollIntoView({ behavior: "smooth" });
            } else {
                openDashboard();
            }
        }
    );

}

/* =========================================================
   FULLSCREEN CINEMATIC EMERGENCY & DECISION EXPERIENCE
   ========================================================= */

const cinematicModal = $("cinematicExperienceModal");
const fullscreenVideo = $("fullscreenCinematicVideo");
const cinematicSkipBtn = $("cinematicSkipBtn");
const stageVideo = $("cinematicStageVideo");
const stageDecision = $("cinematicStageDecision");
const stageFeedback = $("cinematicStageFeedback");
const stageWelcome = $("cinematicStageWelcome");
const feedbackTag = $("cinematicFeedbackTag");
const feedbackTitle = $("cinematicFeedbackTitle");
const feedbackBody = $("cinematicFeedbackBody");
const consequenceText = $("cinematicConsequenceText");
const feedbackContinueBtn = $("cinematicFeedbackContinueBtn");
const welcomeEnterBtn = $("cinematicWelcomeEnterBtn");

function startFullscreenCinematicExperience() {
    if (!cinematicModal) {
        openDashboard();
        return;
    }

    // Reset stages
    cinematicModal.classList.remove("hidden");
    if (stageVideo) stageVideo.classList.remove("hidden");
    if (stageDecision) stageDecision.classList.add("hidden");
    if (stageFeedback) stageFeedback.classList.add("hidden");
    if (stageWelcome) stageWelcome.classList.add("hidden");

    if (fullscreenVideo) {
        fullscreenVideo.currentTime = 0;
        fullscreenVideo.muted = false;
        fullscreenVideo.volume = 1.0;

        if (typeof fullscreenVideo.play === "function") {
            try {
                const p = fullscreenVideo.play();
                if (p !== undefined) {
                    p.catch(e => {
                        console.warn("Unmuted playback blocked, falling back to muted:", e);
                        fullscreenVideo.muted = true;
                        fullscreenVideo.play().catch(err => {
                            console.warn("Fullscreen video playback fallback error:", err);
                        });
                    });
                }
            } catch (e) {
                console.warn("Fullscreen video play exception:", e);
            }
        }
    }
}

let cinematicTimerInterval = null;
let cinematicTimeRemaining = 10;

function startCinematicTimer() {
    clearCinematicTimer();
    cinematicTimeRemaining = 10;
    const timerElem = $("cinematicCountdown");
    const badgeElem = $("cinematicDecisionTimer");
    if (timerElem) {
        timerElem.textContent = "10s";
        timerElem.classList.remove("timer-urgent", "timer-expired");
    }
    if (badgeElem) {
        badgeElem.classList.remove("urgent", "expired");
    }

    cinematicTimerInterval = setInterval(() => {
        cinematicTimeRemaining--;
        if (timerElem) {
            timerElem.textContent = `${cinematicTimeRemaining}s`;
            if (cinematicTimeRemaining <= 3 && cinematicTimeRemaining > 0) {
                timerElem.classList.add("timer-urgent");
                if (badgeElem) badgeElem.classList.add("urgent");
            }
        }
        if (cinematicTimeRemaining <= 0) {
            clearCinematicTimer();
            if (timerElem) {
                timerElem.textContent = "EXPIRED";
                timerElem.classList.add("timer-expired");
            }
            if (badgeElem) badgeElem.classList.add("expired");
            handleCinematicDecision("timeout", true);
        }
    }, 1000);
}

function clearCinematicTimer() {
    if (cinematicTimerInterval) {
        clearInterval(cinematicTimerInterval);
        cinematicTimerInterval = null;
    }
}

function transitionToDecisionStage() {
    if (fullscreenVideo) {
        if (typeof fullscreenVideo.pause === "function") {
            fullscreenVideo.pause();
        }
    }
    if (stageVideo) stageVideo.classList.add("hidden");
    if (stageDecision) stageDecision.classList.remove("hidden");
    if (stageFeedback) stageFeedback.classList.add("hidden");
    if (stageWelcome) stageWelcome.classList.add("hidden");

    startCinematicTimer();
}

function handleCinematicDecision(choice, isTimeout = false) {
    clearCinematicTimer();
    if (!stageFeedback) return;

    if (stageDecision) stageDecision.classList.add("hidden");
    stageFeedback.classList.remove("hidden");

    let tag = "DECISION EVALUATION";
    let title = "Good decision.";
    let outcome = "OPTIMAL ACTION";
    let recorded = "RAISE THE ALARM AND HELP OTHERS EVACUATE";
    let consequence = "";
    let whyMatters = "";

    if (isTimeout) {
        tag = "TIME EXPIRED · HESITATION RISK";
        title = "Decision Window Expired (+0 XP)";
        outcome = "TIME EXPIRED — HAZARD ESCALATION";
        recorded = "No action selected within the 10-second decision window.";
        consequence = "In a building fire, smoke spreads within seconds. Hesitation reduces evacuation time for you and your peers.";
        whyMatters = "Raising the alarm and moving immediately towards marked exits prevents toxic inhalation and ensures hostel residents evacuate safely.";
    } else if (choice === "2") {
        // Optimal Option B: Raise alarm and help others evacuate
        tag = "OPTIMAL ACTION · LIFE-SAFETY PRIORITY";
        title = "Life-Safety Protocol Confirmed (+50 XP)";
        outcome = "OPTIMAL ACTION · LIFE-SAFETY PRIORITY";
        recorded = "RAISE THE ALARM AND HELP OTHERS EVACUATE";
        consequence = "Corridor residents safely alerted. Hostel Block A successfully begins orderly evacuation to Assembly Ground.";
        whyMatters = "Good decision. Raising the alarm and immediately evacuating gives others a chance to respond while keeping you away from spreading smoke and toxic gases.";
        state.totalXP += 50;
        calculateReadiness();
    } else if (choice === "1") {
        // Option A: Run to nearest exit
        tag = "PARTIALLY EFFECTIVE ACTION";
        title = "Direct Evacuation (+25 XP)";
        outcome = "PARTIALLY SAFE WITH DELAY";
        recorded = "RUN TO THE NEAREST EXIT";
        consequence = "You reached the stairwell quickly, but students in adjacent rooms remained unaware until the smoke deepened.";
        whyMatters = "Direct evacuation protects you immediately, but alerting neighbors in the corridor before exiting can prevent trapped students.";
        state.totalXP += 25;
    } else if (choice === "3") {
        // Option C: Use fire extinguisher if safe
        tag = "CONDITIONAL PROTOCOL";
        title = "Suppression Attempt (+20 XP)";
        outcome = "CONDITIONAL PROTOCOL";
        recorded = "USE A FIRE EXTINGUISHER IF IT IS SAFE";
        consequence = "Smoke density increased while attempting to assess the equipment. Evacuation was delayed but completed.";
        whyMatters = "Only attempt fire suppression if the flame is small (wastebasket size), you are trained in the PASS technique, and your exit route is 100% clear. In corridor smoke, evacuation is primary.";
        state.totalXP += 20;
    } else {
        // Option D: Wait and see
        tag = "HIGH RISK / DANGEROUS HESITATION";
        title = "Dangerous Inaction (+0 XP)";
        outcome = "CRITICAL RISK";
        recorded = "WAIT AND SEE WHAT HAPPENS";
        consequence = "Corridor visibility dropped to near zero within 90 seconds. Delayed evacuation required crawling under heavy smoke.";
        whyMatters = "Dangerous hesitation. In enclosed college corridors, smoke and toxic gases build up in under 60 seconds. Waiting dramatically increases entrapment risk.";
    }

    if (feedbackTag) feedbackTag.textContent = tag;
    if (feedbackTitle) feedbackTitle.textContent = title;
    if (feedbackBody) {
        feedbackBody.innerHTML = `
            <div class="feedback-hierarchy-block">
                <div class="feedback-row"><span class="f-label">DECISION RECORDED:</span> <span class="f-val">${recorded}</span></div>
                <div class="feedback-row"><span class="f-label">OUTCOME:</span> <span class="f-val">${outcome}</span></div>
                <div class="feedback-row"><span class="f-label">WHY THIS MATTERS:</span> <span class="f-val">${whyMatters}</span></div>
            </div>
        `;
    }
    if (consequenceText) consequenceText.textContent = consequence;

    saveProgress();
    updateAllUI();
}

function transitionToWelcomeStage() {
    clearCinematicTimer();
    if (stageFeedback) stageFeedback.classList.add("hidden");
    if (stageWelcome) stageWelcome.classList.remove("hidden");
}

function finishCinematicAndEnterPlatform() {
    clearCinematicTimer();
    if (cinematicModal) {
        cinematicModal.classList.add("hidden");
    }
    openDashboard();
}

// Bind video ended and error events
if (fullscreenVideo) {
    fullscreenVideo.addEventListener("ended", transitionToDecisionStage);
    fullscreenVideo.addEventListener("error", (e) => {
        console.warn("Fullscreen video playback error or format unsupported:", e);
        transitionToDecisionStage();
    });
}

// Bind Skip button
if (cinematicSkipBtn) {
    cinematicSkipBtn.addEventListener("click", transitionToDecisionStage);
}

// Bind decision cards
document.querySelectorAll(".decision-action-card").forEach(card => {
    card.addEventListener("click", () => {
        const choice = card.dataset.choice;
        handleCinematicDecision(choice);
    });
});

// Bind Continue button from Feedback
if (feedbackContinueBtn) {
    feedbackContinueBtn.addEventListener("click", transitionToWelcomeStage);
}

// Bind Enter Command Center from Welcome
if (welcomeEnterBtn) {
    welcomeEnterBtn.addEventListener("click", finishCinematicAndEnterPlatform);
}


/* =========================================================
   DASHBOARD NAVIGATION (5 MAIN TABS + SUB-ROUTES)
   ========================================================= */

const navItems =
    document.querySelectorAll(".nav-item, .mobile-tab-item");


const contentSections = {
    dashboard: $("dashboardContent"),
    missions: $("missionsContent"),
    learn: $("learnContent"),
    preparedness: $("preparednessContent"),
    profile: $("profileContent"),
    progress: $("progressContent"),
    achievements: $("achievementsContent"),
    leaderboard: $("leaderboardContent"),
    campus: $("campusContent")
};


/* =========================================================
   PROFILE SUB-SECTION NAVIGATION
   ========================================================= */

function switchProfileSubTab(subTabName) {
    const validTabs = ["my-stats", "badges", "leaderboard", "passport", "rewards", "backup", "tools"];
    const activeTab = validTabs.includes(subTabName) ? subTabName : "my-stats";

    document.querySelectorAll(".profile-subnav-btn").forEach(btn => {
        if (btn.dataset.profileTab === activeTab) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const panels = {
        "my-stats": $("profilePanelStats"),
        "badges": $("profilePanelBadges"),
        "leaderboard": $("profilePanelLeaderboard"),
        "passport": $("profilePanelPassport"),
        "rewards": $("profilePanelRewards"),
        "backup": $("profilePanelBackup"),
        "tools": $("profilePanelTools")
    };

    Object.entries(panels).forEach(([name, el]) => {
        if (el) {
            if (name === activeTab) {
                el.classList.remove("hidden");
            } else {
                el.classList.add("hidden");
            }
        }
    });

    if (activeTab === "passport") {
        const target = $("readinessPassportSection");
        if (target && typeof target.scrollIntoView === "function") {
            setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 100);
        }
    }

    if (typeof updateAchievements === "function") {
        updateAchievements();
    }
}


/* =========================================================
   SWITCH SECTION & ROUTING
   ========================================================= */

function switchSection(sectionName, subTab = null) {

    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }

    clearSimulationDecisionTimer();
    clearCinematicTimer();

    let mainTab = sectionName;
    let targetProfileSubTab = subTab;

    if (sectionName === "dashboard" || sectionName === "home") {
        mainTab = "dashboard";
    } else if (sectionName === "missions" || sectionName === "drills") {
        mainTab = "missions";
    } else if (sectionName === "learn") {
        mainTab = "learn";
    } else if (sectionName === "preparedness" || sectionName === "plan") {
        mainTab = "preparedness";
    } else if (sectionName === "profile") {
        mainTab = "profile";
    } else if (sectionName === "progress") {
        mainTab = "profile";
        targetProfileSubTab = "my-stats";
    } else if (sectionName === "achievements") {
        mainTab = "profile";
        targetProfileSubTab = "badges";
    } else if (sectionName === "leaderboard") {
        mainTab = "profile";
        targetProfileSubTab = "leaderboard";
    } else if (sectionName === "passport") {
        mainTab = "profile";
        targetProfileSubTab = "passport";
    } else if (sectionName === "rewards" || sectionName === "myUnlocks") {
        mainTab = "profile";
        targetProfileSubTab = "rewards";
    } else if (sectionName === "backup") {
        mainTab = "profile";
        targetProfileSubTab = "backup";
    } else if (sectionName === "tools") {
        mainTab = "profile";
        targetProfileSubTab = "tools";
    } else if (sectionName === "campus") {
        mainTab = "campus";
    }

    // Hide all top-level sections
    const topLevelSections = [
        $("dashboardContent"),
        $("missionsContent"),
        $("learnContent"),
        $("preparednessContent"),
        $("profileContent"),
        $("campusContent")
    ];

    topLevelSections.forEach(sec => {
        if (sec) {
            sec.classList.add("hidden");
        }
    });

    // Update active nav links across desktop sidebar and mobile tab bar
    const allNavButtons = document.querySelectorAll(".nav-item, .mobile-tab-item");
    allNavButtons.forEach(item => {
        item.classList.remove("active");
    });

    const activeNavElements = document.querySelectorAll(`[data-section="${mainTab}"]`);
    activeNavElements.forEach(item => {
        item.classList.add("active");
    });

    if (mainTab === "profile") {
        const profSec = $("profileContent");
        if (profSec) {
            profSec.classList.remove("hidden");
        }
        switchProfileSubTab(targetProfileSubTab || "my-stats");
    } else if (mainTab === "campus") {
        if (!contentSections.campus) {
            contentSections.campus = $("campusContent");
        }
        const campusSec = $("campusContent");
        if (campusSec) {
            campusSec.classList.remove("hidden");
        }
        if (typeof renderCampusStudio === "function") {
            renderCampusStudio();
        }
    } else {
        const targetSec = $(`${mainTab}Content`) || contentSections[mainTab];
        if (targetSec) {
            targetSec.classList.remove("hidden");
        }
    }

    if (typeof updateAllUI === "function") {
        updateAllUI();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });

}


/* =========================================================
   NAVIGATION CLICK EVENTS & DELEGATION
   ========================================================= */

document.querySelectorAll(".nav-item, .mobile-tab-item").forEach(item => {
    item.addEventListener("click", () => {
        const sec = item.dataset.section;
        if (sec) {
            switchSection(sec);
        }
    });
});

/* Global [data-section] and action trigger delegation */
document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-section]");
    if (btn && !btn.classList.contains("nav-item")) {
        const section = btn.getAttribute("data-section");
        if (section) {
            switchSection(section);
            if (btn.getAttribute("data-action") === "complete-next-action" || btn.id === "dashCompleteNextAction") {
                setTimeout(() => {
                    const next = typeof getNextBestAction === "function" ? getNextBestAction() : null;
                    if (next) {
                        const el = $(`prepCard_${next.id}`);
                        if (el) {
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                            el.classList.add("highlight-pulse");
                            setTimeout(() => el.classList.remove("highlight-pulse"), 2500);
                        }
                    }
                }, 100);
            }
        }
    }
});


/* =========================================================
   EXIT TRAINING
   ========================================================= */

const exitTraining =
    $("exitTraining");


if (exitTraining) {

    exitTraining.addEventListener(
        "click",
        () => {

            showPage(
                landingPage
            );

        }
    );

}


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {

            const modal =
                $("briefingModal");


            if (
                modal &&
                !modal.classList.contains("hidden")
            ) {

                modal.classList.add(
                    "hidden"
                );

            }

        }

    }
);
/* =========================================================
   READYVERSE — MISSION DATABASE
   ========================================================= */
const missions = {

    /* =====================================================
       🔥 BUILDING FIRE
       ===================================================== */

    fire: {
        id: "fire",
        title: "Building Fire",
        icon: "🔥",
        category: "BEGINNER",
        difficulty: "BEGINNER",
        xp: 200,
        time: "06 MIN",
        missionDuration: 75,
        description:
            "A fire has broken out inside a multi-floor building. Make critical decisions, evacuate safely and help others without increasing your own risk.",
        objective:
            "Evacuate safely, reduce exposure to smoke and help others reach safety.",

        questions: [

            {
                situation:
                    "The fire alarm suddenly sounds while you are on the second floor. Smoke is beginning to appear in the corridor. What should you do first?",

                options: [
                    {
                        text: "Use the elevator immediately.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Elevators may become unsafe during a fire. Use designated evacuation routes."
                    },
                    {
                        text: "Stay calm, check for the safest marked exit and begin evacuation.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Your first priority is to move toward a safe evacuation route."
                    },
                    {
                        text: "Return to your room and collect your belongings.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Do not delay evacuation for personal belongings."
                    },
                    {
                        text: "Run directly through the smoke.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid unnecessary exposure to smoke and look for a safer route."
                    }
                ]
            },

            {
                situation:
                    "The main corridor is becoming increasingly smoky. You can see an emergency exit sign leading toward a stairwell.",

                options: [
                    {
                        text: "Follow the marked emergency exit if the route is safe.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Use designated emergency evacuation routes."
                    },
                    {
                        text: "Take the elevator because it is faster.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid elevators during a fire unless emergency personnel specifically direct you."
                    },
                    {
                        text: "Go back to your room and wait.",
                        correct: false,
                        xp: 6,
                        feedback:
                            "If a safe evacuation route is available, delaying unnecessarily increases risk."
                    },
                    {
                        text: "Open random doors to find another way.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Do not unnecessarily expose yourself to potentially dangerous areas."
                    }
                ]
            },

            {
                situation:
                    "Smoke is now heavier near the ceiling and visibility is decreasing. You need to move through the corridor.",

                options: [
                    {
                        text: "Stay as low as practical and move toward the safe exit.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Smoke can accumulate higher in a room, so staying lower can reduce exposure while evacuating."
                    },
                    {
                        text: "Stand upright and run as fast as possible.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Running upright through dense smoke can increase smoke exposure."
                    },
                    {
                        text: "Stop and wait in the middle of the corridor.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Do not block an evacuation route."
                    },
                    {
                        text: "Return toward the fire to find another route.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Never move toward the fire unless directed by trained emergency personnel."
                    }
                ]
            },

            {
                situation:
                    "You see a classmate who appears confused and is moving toward the wrong corridor.",

                options: [
                    {
                        text: "Ignore them and continue alone.",
                        correct: false,
                        xp: 10,
                        feedback:
                            "When it is safe to do so, helping others reach the evacuation route is valuable."
                    },
                    {
                        text: "Clearly direct them toward the safe evacuation route while continuing toward safety.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Help others without placing yourself in unnecessary danger."
                    },
                    {
                        text: "Go back inside to search for everyone.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Do not unnecessarily move deeper into a dangerous building."
                    },
                    {
                        text: "Tell them to hide in the nearest room.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "If a safe evacuation route is available, evacuation is generally preferable."
                    }
                ]
            },

            {
                situation:
                    "The stairwell is available, but several people are rushing and pushing toward the exit.",

                options: [
                    {
                        text: "Push through everyone so you can escape first.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Pushing can cause falls and injuries during an evacuation."
                    },
                    {
                        text: "Stay calm, maintain orderly movement and follow the evacuation route.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Calm and orderly evacuation reduces the chance of secondary injuries."
                    },
                    {
                        text: "Leave the stairwell and return to the corridor.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Do not abandon a safe evacuation route without a clear reason."
                    },
                    {
                        text: "Stop on the stairs to use your phone.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Do not obstruct the evacuation flow."
                    }
                ]
            },

            {
                situation:
                    "You reach the ground floor. The main entrance is crowded, while another marked emergency exit is available.",

                options: [
                    {
                        text: "Use the safer available marked exit.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Use an available safe evacuation route and avoid unnecessary congestion."
                    },
                    {
                        text: "Wait inside until the crowd disappears.",
                        correct: false,
                        xp: 6,
                        feedback:
                            "Do not remain inside unnecessarily during an active fire."
                    },
                    {
                        text: "Return upstairs.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Moving back into the building increases your exposure."
                    },
                    {
                        text: "Break a window and climb out immediately.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Use designated exits whenever a safe route is available."
                    }
                ]
            },

            {
                situation:
                    "You are now outside. Someone suggests going back inside to retrieve a phone and bag.",

                options: [
                    {
                        text: "Go back with them quickly.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Never re-enter a dangerous building to retrieve belongings."
                    },
                    {
                        text: "Tell them to stay outside and wait for emergency personnel.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Do not re-enter an unsafe building."
                    },
                    {
                        text: "Wait near the entrance for them.",
                        correct: false,
                        xp: 8,
                        feedback:
                            "Stay clear of emergency access areas."
                    },
                    {
                        text: "Ask someone else to go inside.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "No untrained person should be encouraged to re-enter a burning building."
                    }
                ]
            },

            {
                situation:
                    "You have reached the assembly area. Emergency responders are arriving and people are being accounted for.",

                options: [
                    {
                        text: "Remain at the assembly area and report your status.",
                        correct: true,
                        xp: 25,
                        feedback:
                            "Correct. Staying accounted for helps emergency responders determine who is safe."
                    },
                    {
                        text: "Return to the building once the crowd becomes smaller.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Do not re-enter until authorities declare it safe."
                    },
                    {
                        text: "Stand near the entrance to watch.",
                        correct: false,
                        xp: 5,
                        feedback:
                            "Keep emergency access routes clear."
                    },
                    {
                        text: "Leave without informing anyone.",
                        correct: false,
                        xp: 8,
                        feedback:
                            "Reporting your status supports effective emergency management."
                    }
                ]
            }
        ]
    },


    /* =====================================================
       🌊 FLASH FLOOD
       ===================================================== */

    flood: {
        id: "flood",
        title: "Flash Flood",
        icon: "🌊",
        category: "INTERMEDIATE",
        difficulty: "INTERMEDIATE",
        xp: 250,
        time: "06 MIN",
        missionDuration: 90,

    description:
        "Rapidly rising water is threatening the area. Assess hazards, choose safe routes, and make decisions before escape paths disappear.",

    objective:
        "Reach safety, avoid moving water, and make decisions that protect yourself and others.",

    questions: [

        /* =================================================
           DECISION 1
        ================================================= */

        {
            situation:
                "Heavy rainfall has caused water levels to rise rapidly near your area. What should you do first?",

            options: [

                {
                    text:
                        "Move toward higher ground using a safe route.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Excellent decision. Moving to higher ground early reduces the risk of becoming trapped by rising water."
                },

                {
                    text:
                        "Wait until the water reaches the road before deciding.",

                    correct: false,

                    xp: 12,

                    feedback:
                        "Waiting can reduce your available escape options as floodwater rises."
                },

                {
                    text:
                        "Go outside to check how deep the water is.",

                    correct: false,

                    xp: 6,

                    feedback:
                        "Entering or approaching floodwater to judge its depth can expose you to hidden hazards."
                },

                {
                    text:
                        "Continue your normal activities because the rain may stop soon.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Ignoring a rapidly developing flood situation can leave you without enough time to evacuate."
                }

            ]
        },


        /* =================================================
           DECISION 2
        ================================================= */

        {
            situation:
                "Your usual road is now covered by rapidly moving water. You still have another route toward higher ground. What should you do?",

            options: [

                {
                    text:
                        "Try to cross quickly before the water rises further.",

                    correct: false,

                    xp: 4,

                    feedback:
                        "Fast-moving floodwater can sweep people away and hide dangerous obstacles."
                },

                {
                    text:
                        "Wait beside the flooded road until someone else crosses it.",

                    correct: false,

                    xp: 8,

                    feedback:
                        "Waiting beside moving floodwater still leaves you exposed to changing conditions."
                },

                {
                    text:
                        "Drive through the water because your destination is nearby.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Flooded roads can conceal damaged surfaces, debris, and rapidly changing water levels."
                },

                {
                    text:
                        "Use the alternative safe route toward higher ground.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Correct. Avoid flooded routes and use a safer available path toward higher ground."
                }

            ]
        },


        /* =================================================
           DECISION 3
        ================================================= */

        {
            situation:
                "You are inside a building and receive an official evacuation warning because flooding is worsening. What is the best response?",

            options: [

                {
                    text:
                        "Follow the official evacuation instructions and leave using the designated safe route.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Correct. Official evacuation instructions should be followed promptly when conditions are worsening."
                },

                {
                    text:
                        "Stay inside until the water enters the building.",

                    correct: false,

                    xp: 5,

                    feedback:
                        "Waiting until flooding enters the building can make evacuation much more difficult."
                },

                {
                    text:
                        "Go downstairs to watch the water level.",

                    correct: false,

                    xp: 2,

                    feedback:
                        "Moving toward lower areas during a flood can increase your exposure to rising water."
                },

                {
                    text:
                        "Ignore the warning because your building has not flooded yet.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Flood conditions can deteriorate quickly. Waiting for water to enter the building is unsafe."
                }

            ]
        },


        /* =================================================
           DECISION 4
        ================================================= */

        {
            situation:
                "You notice an electrical appliance near an area where floodwater is entering. What should you do?",

            options: [

                {
                    text:
                        "Touch the appliance with wet hands and move it away.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Water and electricity create a serious shock hazard."
                },

                {
                    text:
                        "Stand in the water and unplug the appliance immediately.",

                    correct: false,

                    xp: 2,

                    feedback:
                        "Entering floodwater near electrical equipment can be extremely dangerous."
                },

                {
                    text:
                        "Avoid the water and electrical equipment and follow safe emergency instructions.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Excellent decision. Avoid electrical hazards and do not enter floodwater to handle appliances."
                },

                {
                    text:
                        "Pour more water around the appliance to cool it down.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Adding water around electrical equipment can increase the danger of electric shock."
                }

            ]
        },


        /* =================================================
           DECISION 5
        ================================================= */

        {
            situation:
                "You are moving to safety and see a person stranded near moving floodwater. What is the safest response?",

            options: [

                {
                    text:
                        "Enter the water and physically pull the person out.",

                    correct: false,

                    xp: 2,

                    feedback:
                        "Entering moving floodwater can put both you and the stranded person at serious risk."
                },

                {
                    text:
                        "Keep yourself safe and contact emergency responders, giving them the person's location.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Correct. Alert trained responders and provide the person's location rather than entering dangerous water yourself."
                },

                {
                    text:
                        "Tell the person to swim toward you.",

                    correct: false,

                    xp: 7,

                    feedback:
                        "Encouraging someone to enter or move through floodwater can increase their danger."
                },

                {
                    text:
                        "Ignore the person because helping others is never allowed during a flood.",

                    correct: false,

                    xp: 10,

                    feedback:
                        "You should alert emergency responders when someone is in danger, while avoiding unnecessary personal risk."
                }

            ]
        },


        /* =================================================
           DECISION 6
        ================================================= */

        {
            situation:
                "You have reached an elevated safe location. The rain is still heavy and the floodwater continues rising. What should you do next?",

            options: [

                {
                    text:
                        "Return to your home to collect important belongings.",

                    correct: false,

                    xp: 4,

                    feedback:
                        "Leaving a safe location can expose you to worsening flood conditions."
                },

                {
                    text:
                        "Walk toward the flooded area to check whether the water is decreasing.",

                    correct: false,

                    xp: 2,

                    feedback:
                        "Approaching floodwater unnecessarily increases your exposure to hazards."
                },

                {
                    text:
                        "Leave the safe location without informing anyone.",

                    correct: false,

                    xp: 8,

                    feedback:
                        "Keeping others informed about your status can assist emergency coordination."
                },

                {
                    text:
                        "Stay in the safe location and monitor official emergency instructions.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Correct. Remain in a safe location and follow updated instructions from authorities."
                }

            ]
        },


        /* =================================================
           DECISION 7
        ================================================= */

        {
            situation:
                "Your phone still has battery and you are safe, but communication networks are becoming busy. What is the most useful action?",

            options: [

                {
                    text:
                        "Make repeated calls to friends to discuss the situation.",

                    correct: false,

                    xp: 5,

                    feedback:
                        "Repeated non-essential calls can consume battery and contribute to network congestion."
                },

                {
                    text:
                        "Use the phone mainly for important emergency communication and official updates.",

                    correct: false,

                    xp: 20,

                    feedback:
                        "This is a reasonable approach, but preserving battery and prioritising critical communication is even more important."
                },

                {
                    text:
                        "Conserve battery while using the phone for essential emergency communication and official alerts.",

                    correct: true,

                    xp: 32,

                    feedback:
                        "Excellent decision. Battery conservation and essential communication are important during prolonged emergencies."
                },

                {
                    text:
                        "Turn the phone off permanently and stop monitoring emergency information.",

                    correct: false,

                    xp: 7,

                    feedback:
                        "Completely disconnecting can prevent you from receiving important emergency instructions."
                }

            ]
        },


        /* =================================================
           DECISION 8
        ================================================= */

        {
            situation:
                "Authorities announce that the immediate danger has reduced, but some roads remain flooded. What should you do?",

            options: [

                {
                    text:
                        "Return only when authorities confirm that the route is safe.",

                    correct: true,

                    xp: 26,

                    feedback:
                        "Excellent. Do not assume that reduced flooding means every road is safe."
                },

                {
                    text:
                        "Return immediately because the rain has stopped.",

                    correct: false,

                    xp: 5,

                    feedback:
                        "Flood hazards can remain even after rainfall stops."
                },

                {
                    text:
                        "Take a shortcut through remaining floodwater.",

                    correct: false,

                    xp: 0,

                    feedback:
                        "Remaining floodwater may conceal hazards and should not be crossed unnecessarily."
                },

                {
                    text:
                        "Ask an untrained person whether the road looks safe and return.",

                    correct: false,

                    xp: 8,

                    feedback:
                        "Visual inspection or informal advice is not a reliable substitute for official safety information."
                }

            ]
        }

    ]

},


    /* =====================================================
       🌪️ CYCLONE
       ===================================================== */

    cyclone: {
        id: "cyclone",
        title: "Cyclone Emergency",
        icon: "🌪️",
        category: "INTERMEDIATE",
        difficulty: "INTERMEDIATE",
        xp: 300,
        time: "07 MIN",
        missionDuration: 90,
        description:
            "A severe cyclone is approaching. Prepare early, secure yourself indoors and respond correctly as conditions deteriorate.",
        objective:
            "Prepare before impact, shelter safely and respond to changing conditions.",

        questions: [

            {
                situation:
                    "Authorities announce that a severe cyclone is expected to reach your region later today.",

                options: [
                    {
                        text: "Begin preparations immediately and monitor official updates.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Early preparation provides more time to respond safely."
                    },
                    {
                        text: "Wait until the strongest winds begin.",
                        correct: false,
                        xp: 8,
                        feedback:
                            "Waiting reduces the time available for preparation."
                    },
                    {
                        text: "Go outside to observe the weather.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Avoid unnecessary exposure as severe weather approaches."
                    },
                    {
                        text: "Ignore official warnings.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Official warnings provide important safety information."
                    }
                ]
            },

            {
                situation:
                    "You are preparing your home before the cyclone arrives.",

                options: [
                    {
                        text: "Leave furniture and objects outside.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Loose objects can become projectiles."
                    },
                    {
                        text: "Secure loose outdoor objects and prepare essential supplies.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Loose objects can become dangerous during strong winds."
                    },
                    {
                        text: "Open all windows.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Follow official guidance for securing the building instead."
                    },
                    {
                        text: "Go to the beach to watch the waves.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Coastal areas can become extremely dangerous during cyclones."
                    }
                ]
            },

            {
                situation:
                    "The cyclone warning level increases and authorities announce an evacuation for your area.",

                options: [
                    {
                        text: "Stay because your house looks strong.",
                        correct: false,
                        xp: 5,
                        feedback:
                            "Personal judgement should not override an official evacuation order."
                    },
                    {
                        text: "Wait until roads become flooded.",
                        correct: false,
                        xp: 8,
                        feedback:
                            "Delayed evacuation can make routes more dangerous."
                    },
                    {
                        text: "Follow the evacuation order and move to the designated shelter.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Evacuation orders should be taken seriously."
                    },
                    {
                        text: "Go outside to check wind speed.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid unnecessary outdoor exposure."
                    }
                ]
            },

            {
                situation:
                    "You are sheltering indoors and the wind becomes extremely strong.",

                options: [
                    {
                        text: "Stand near the window to observe the storm.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Windows can break and expose you to debris."
                    },
                    {
                        text: "Go onto the roof.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Do not expose yourself to severe winds."
                    },
                    {
                        text: "Open windows to feel the wind direction.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid unnecessary exposure and follow official shelter guidance."
                    },
                    {
                        text: "Stay away from windows and move to a safer interior area.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Interior areas away from windows can reduce exposure to flying debris."
                    }
                ]
            },

            {
                situation:
                    "Power suddenly goes out during the cyclone.",

                options: [
                    {
                        text: "Use safe emergency lighting and avoid unnecessary electrical risks.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Use appropriate emergency lighting and remain cautious around electrical systems."
                    },
                    {
                        text: "Touch exposed electrical wires to check whether they are live.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Never touch potentially live electrical equipment or wires."
                    },
                    {
                        text: "Go outside to inspect the power line.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Stay sheltered during dangerous conditions."
                    },
                    {
                        text: "Use candles next to flammable materials.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Open flames can create additional hazards."
                    }
                ]
            },

            {
                situation:
                    "The wind suddenly becomes calm after hours of extreme weather.",

                options: [
                    {
                        text: "Immediately go outside.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Dangerous conditions may return suddenly."
                    },
                    {
                        text: "Remain sheltered and continue monitoring official information.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. A temporary calm can occur during the eye of a cyclone."
                    },
                    {
                        text: "Begin cleaning outside.",
                        correct: false,
                        xp: 5,
                        feedback:
                            "Wait until authorities confirm conditions are safe."
                    },
                    {
                        text: "Travel around the neighborhood.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Remain sheltered until the danger has passed."
                    }
                ]
            },

            {
                situation:
                    "After the storm, you see fallen electrical wires on a nearby road.",

                options: [
                    {
                        text: "Move the wire away yourself.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Never handle potentially live electrical wires."
                    },
                    {
                        text: "Walk over the wire carefully.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Keep away from electrical hazards."
                    },
                    {
                        text: "Keep away and report the hazard to the appropriate authorities.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Treat fallen electrical wires as potentially live."
                    },
                    {
                        text: "Ask children to stay nearby and watch.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Keep everyone away from dangerous electrical hazards."
                    }
                ]
            },

            {
                situation:
                    "The cyclone has passed and authorities have not yet declared the area safe.",

                options: [
                    {
                        text: "Explore damaged buildings.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Damaged structures may collapse unexpectedly."
                    },
                    {
                        text: "Drive through unknown flooded roads.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Flooded roads can hide serious hazards."
                    },
                    {
                        text: "Return to unsafe areas immediately.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Wait for official clearance."
                    },
                    {
                        text: "Remain in the safe location and follow official instructions.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Post-cyclone hazards can remain even after the storm ends."
                    }
                ]
            }
        ]
    },


    /* =====================================================
       🌎 EARTHQUAKE
       ===================================================== */

    earthquake: {
        id: "earthquake",
        title: "Earthquake Response",
        icon: "🌎",
        category: "INTERMEDIATE",
        difficulty: "INTERMEDIATE",
        xp: 300,
        time: "07 MIN",
        missionDuration: 60,
        description:
            "A powerful earthquake strikes without warning. Make rapid decisions during shaking and navigate the aftermath safely.",
        objective:
            "Protect yourself during shaking and make safe decisions after the earthquake.",

        questions: [

            {
                situation:
                    "You are indoors when strong shaking suddenly begins.",

                options: [
                    {
                        text: "Drop, cover and hold on.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Protect yourself from falling objects during the shaking."
                    },
                    {
                        text: "Run immediately toward the stairs.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Moving during strong shaking can increase your risk of falling or being struck."
                    },
                    {
                        text: "Stand beside a window.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Glass can break during an earthquake."
                    },
                    {
                        text: "Use the elevator.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Do not use elevators during an earthquake."
                    }
                ]
            },

            {
                situation:
                    "Objects are falling from shelves while the shaking continues.",

                options: [
                    {
                        text: "Run around moving objects out of the way.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Moving during strong shaking can expose you to falling objects."
                    },
                    {
                        text: "Stand under a glass shelf.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid areas where objects or glass may fall."
                    },
                    {
                        text: "Stay protected and hold your position until the shaking stops.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Continue protecting yourself from falling objects."
                    },
                    {
                        text: "Go outside immediately while everything is shaking.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Do not rush through potentially dangerous areas during active shaking."
                    }
                ]
            },

            {
                situation:
                    "The shaking stops. The building appears damaged.",

                options: [
                    {
                        text: "Check yourself for injuries, assess immediate hazards and follow evacuation guidance if needed.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Assess immediate safety before moving."
                    },
                    {
                        text: "Immediately use the elevator.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Elevators may be damaged or unsafe."
                    },
                    {
                        text: "Return to damaged rooms for belongings.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Do not enter unsafe areas for property."
                    },
                    {
                        text: "Stand beside damaged walls.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Damaged structures may collapse."
                    }
                ]
            },

            {
                situation:
                    "A strong aftershock begins while you are outside.",

                options: [
                    {
                        text: "Run back inside.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Do not move toward potentially damaged structures."
                    },
                    {
                        text: "Stand underneath a damaged balcony.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Damaged structures can shed debris."
                    },
                    {
                        text: "Move to a safer open area away from buildings, glass and other hazards.",
                        correct: true,
                        xp: 38,
                        feedback:
                            "Correct. Stay away from structures and falling-object hazards."
                    },
                    {
                        text: "Go near power lines.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Stay away from electrical hazards."
                    }
                ]
            },

            {
                situation:
                    "You smell gas inside a damaged building.",

                options: [
                    {
                        text: "Turn electrical switches on and off to investigate.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Electrical sparks can create an ignition hazard."
                    },
                    {
                        text: "Leave the area and avoid creating sparks or flames; report the hazard.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. A suspected gas leak requires immediate caution."
                    },
                    {
                        text: "Light a match to locate the leak.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Never use flames to investigate a suspected gas leak."
                    },
                    {
                        text: "Ignore the smell.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "A gas smell after an earthquake should be treated seriously."
                    }
                ]
            },

            {
                situation:
                    "You see broken glass and debris blocking the usual exit.",

                options: [
                    {
                        text: "Walk barefoot through the debris.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Broken glass and debris can cause serious injuries."
                    },
                    {
                        text: "Climb over unstable rubble.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Unstable rubble can collapse."
                    },
                    {
                        text: "Return deeper into the building.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid moving deeper into a potentially damaged structure."
                    },
                    {
                        text: "Use a safer available route and avoid unstable debris.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Avoid hazardous debris and use a safe alternative route."
                    }
                ]
            },

            {
                situation:
                    "A friend wants to enter a damaged building to retrieve a laptop.",

                options: [
                    {
                        text: "Tell them not to enter until authorities confirm it is safe.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Damaged buildings may collapse or contain hidden hazards."
                    },
                    {
                        text: "Go with them.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Do not enter a potentially unstable building."
                    },
                    {
                        text: "Tell them to enter quickly.",
                        correct: false,
                        xp: 2,
                        feedback:
                            "Speed does not eliminate structural hazards."
                    },
                    {
                        text: "Ask them to inspect the building first.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Untrained people should not enter potentially unsafe structures."
                    }
                ]
            },

            {
                situation:
                    "Authorities establish an emergency assembly area and request that people remain there.",

                options: [
                    {
                        text: "Return home immediately.",
                        correct: false,
                        xp: 4,
                        feedback:
                            "Your home may have unseen structural hazards."
                    },
                    {
                        text: "Explore damaged buildings nearby.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Avoid damaged structures."
                    },
                    {
                        text: "Remain at the assembly area and follow official instructions.",
                        correct: true,
                        xp: 37,
                        feedback:
                            "Correct. Follow emergency coordination instructions."
                    },
                    {
                        text: "Ignore further warnings.",
                        correct: false,
                        xp: 0,
                        feedback:
                            "Aftershocks and secondary hazards may continue."
                    }
                ]
            }
        ]
    }
};


/* =========================================================
   VERIFY MISSION DATA
   ========================================================= */

rvLog("ReadyVerse missions loaded:",
    Object.keys(missions)
);

Object.values(missions).forEach(mission => {
    rvLog(`${mission.title}: ${mission.questions.length} decisions`
    );
});

/* =========================================================
   READYVERSE — MISSION BRIEFING
   ========================================================= */

let selectedMissionName = null;


/* =========================================================
   BRIEFING ELEMENTS
   ========================================================= */

const briefingModal =
    $("briefingModal");

const closeBriefing =
    $("closeBriefing");

const briefingTitle =
    $("briefingTitle");

const briefingIcon =
    $("briefingIcon");

const briefingDescription =
    $("briefingDescription");

const briefingObjective =
    $("briefingObjective");

const beginSimulation =
    $("beginSimulation");


/* =========================================================
   MISSION BUTTONS
   ========================================================= */

/* =========================================================
   OPEN MISSION BRIEFING
   ========================================================= */

function openMissionBriefing(missionName) {

    const mission =
        missions[missionName];


    if (!mission) {

        console.error(
            "Mission not found:",
            missionName
        );

        return;

    }


    selectedMissionName =
        missionName;


    /* Mission icon */

    if (briefingIcon) {

        briefingIcon.textContent =
            mission.icon;

    }


    /* Mission title */

    if (briefingTitle) {

        briefingTitle.textContent =
            mission.title;

    }


    /* Description */

    if (briefingDescription) {

        briefingDescription.textContent =
            mission.description;

    }


    /* Objective */

    if (briefingObjective) {

        briefingObjective.textContent =
            mission.objective;

    }

    const briefingChallengeBanner = $("briefingChallengeBanner");
    if (briefingChallengeBanner) {
        if (state.activeChallenge && state.activeChallenge.active && (state.activeChallenge.drillId === missionName || !state.activeChallenge.drillId)) {
            briefingChallengeBanner.textContent = `🏆 FRIEND CHALLENGE: Beat ${state.activeChallenge.score}% to win!`;
            briefingChallengeBanner.classList.remove("hidden");
        } else {
            briefingChallengeBanner.classList.add("hidden");
        }
    }


    /* Open briefing */

    if (briefingModal) {

        briefingModal.classList.remove(
            "hidden"
        );

    }

}


/* Event delegation for all mission buttons */
document.addEventListener("click", event => {

    const button =
        event.target.closest("[data-mission]");


    if (!button || button.disabled) {

        return;

    }


    const missionName =
        button.dataset.mission;


    if (missionName) {

        openMissionBriefing(missionName);

    }

});


/* =========================================================
   CLOSE BRIEFING
   ========================================================= */

function closeMissionBriefing() {

    if (briefingModal) {

        briefingModal.classList.add(
            "hidden"
        );

    }

}


/* Close button */

if (closeBriefing) {

    closeBriefing.addEventListener(
        "click",
        closeMissionBriefing
    );

}


/* Click outside modal */

if (briefingModal) {

    briefingModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                briefingModal
            ) {

                closeMissionBriefing();

            }

        }
    );

}


/* =========================================================
   BEGIN SIMULATION
   ========================================================= */

if (beginSimulation) {

    beginSimulation.addEventListener(
        "click",
        () => {

            startMission(
                selectedMissionName ||
                "fire"
            );

        }
    );

}



/* =========================================================
   PHASE 5C: SIMULATION AUDIO ENGINE (WEB AUDIO API PROCEDURAL)
   ========================================================= */

const SimulationAudio = {
    ctx: null,
    isMuted: true, // Default muted for student/lab environments

    init() {
        if (!this.ctx && typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();
            } catch (e) {
                console.warn("Web Audio API not supported:", e);
            }
        }
        if (state && typeof state.simAudioMuted !== "undefined") {
            this.isMuted = state.simAudioMuted;
        }
        this.updateHUD();
    },

    resume() {
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (state) state.simAudioMuted = this.isMuted;
        if (!this.isMuted) {
            this.init();
            this.resume();
            this.playClick();
        }
        this.updateHUD();
        return !this.isMuted;
    },

    updateHUD() {
        const icon = $("simAudioIcon");
        const label = $("simAudioLabel");
        const btn = $("simAudioToggle");
        if (icon) icon.textContent = this.isMuted ? "🔇" : "🔊";
        if (label) label.textContent = this.isMuted ? "AUDIO: OFF" : "AUDIO: ON";
        if (btn) {
            btn.classList.toggle("audio-active", !this.isMuted);
            btn.setAttribute("aria-pressed", (!this.isMuted).toString());
        }
    },

    playTone(freq, duration, type = "sine", gainVal = 0.08) {
        if (this.isMuted || !this.ctx) return;
        try {
            this.resume();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    },

    playAlarm() {
        if (this.isMuted || !this.ctx) return;
        try {
            this.playTone(780, 0.15, "triangle", 0.06);
            setTimeout(() => this.playTone(620, 0.2, "triangle", 0.06), 160);
        } catch (e) {}
    },

    playClick() {
        this.playTone(1200, 0.05, "sine", 0.04);
    },

    playSafeCue() {
        if (this.isMuted || !this.ctx) return;
        try {
            this.playTone(523.25, 0.15, "sine", 0.08);
            setTimeout(() => this.playTone(659.25, 0.18, "sine", 0.08), 120);
            setTimeout(() => this.playTone(783.99, 0.28, "sine", 0.09), 240);
        } catch (e) {}
    },

    playDangerCue() {
        if (this.isMuted || !this.ctx) return;
        try {
            this.playTone(280, 0.18, "sawtooth", 0.07);
            setTimeout(() => this.playTone(160, 0.35, "sawtooth", 0.08), 160);
        } catch (e) {}
    },

    cleanup() {
        // Safe release
    }
};

function toggleSimulationAudio() {
    SimulationAudio.toggleMute();
}

/* =========================================================
   PHASE 5C: BUILDING FIRE INTERACTIVE SIMULATION ENGINE
   ========================================================= */

function renderTraineeAvatarSVG(posture, x, y) {
    const outfit = state?.profile?.outfit || "standard";
    
    let vestColor = "#6366f1";
    if (outfit === "flood_gear") vestColor = "#0ea5e9";
    if (outfit === "storm_jacket") vestColor = "#f59e0b";
    if (outfit === "medic_vest") vestColor = "#10b981";
    if (outfit === "incident_lead") vestColor = "#8b5cf6";

    if (posture === "crouch") {
        return '<g class="sim-avatar-character sim-avatar-crouch" transform="translate(' + x + ', ' + y + ')">' +
            '<circle cx="20" cy="18" r="8" fill="#fed7aa"/>' +
            '<path d="M 12,14 Q 20,8 28,14" stroke="#451a03" stroke-width="4" fill="none"/>' +
            '<rect x="12" y="24" width="35" height="18" rx="4" fill="' + vestColor + '" stroke="#ffffff" stroke-width="1"/>' +
            '<line x1="16" y1="36" x2="6" y2="44" stroke="#fed7aa" stroke-width="4"/>' +
            '<line x1="38" y1="36" x2="48" y2="44" stroke="#fed7aa" stroke-width="4"/>' +
            '<rect x="42" y="26" width="24" height="10" rx="3" fill="#1e293b"/>' +
            '<rect x="62" y="28" width="10" height="8" rx="2" fill="#0f172a"/>' +
            '<rect x="0" y="2" width="60" height="12" rx="3" fill="rgba(0,0,0,0.75)"/>' +
            '<text x="30" y="10" text-anchor="middle" fill="#a5b4fc" font-size="7" font-weight="bold">YOU (LOW CRAWL)</text>' +
        '</g>';
    }

    if (posture === "guiding") {
        return '<g class="sim-avatar-character sim-avatar-guiding" transform="translate(' + x + ', ' + y + ')">' +
            '<circle cx="15" cy="10" r="9" fill="#fed7aa"/>' +
            '<path d="M 6,7 Q 15,1 24,7" stroke="#451a03" stroke-width="4" fill="none"/>' +
            '<rect x="5" y="19" width="20" height="34" rx="4" fill="' + vestColor + '" stroke="#ffffff" stroke-width="1"/>' +
            '<line x1="20" y1="26" x2="48" y2="24" stroke="' + vestColor + '" stroke-width="5"/>' +
            '<polygon points="46,21 54,24 46,27" fill="#fed7aa"/>' +
            '<line x1="8" y1="24" x2="2" y2="42" stroke="' + vestColor + '" stroke-width="4"/>' +
            '<rect x="7" y="53" width="7" height="32" fill="#1e293b"/>' +
            '<rect x="16" y="53" width="7" height="32" fill="#1e293b"/>' +
            '<rect x="-10" y="-12" width="50" height="12" rx="3" fill="rgba(0,0,0,0.75)"/>' +
            '<text x="15" y="-4" text-anchor="middle" fill="#a5b4fc" font-size="7" font-weight="bold">YOU (GUIDING)</text>' +
        '</g>';
    }

    // Default upright / alert / stairs / assembled posture
    return '<g class="sim-avatar-character sim-avatar-upright" transform="translate(' + x + ', ' + y + ')">' +
        '<circle cx="15" cy="10" r="9" fill="#fed7aa"/>' +
        '<path d="M 6,7 Q 15,1 24,7" stroke="#451a03" stroke-width="4" fill="none"/>' +
        '<rect x="5" y="19" width="20" height="34" rx="4" fill="' + vestColor + '" stroke="#ffffff" stroke-width="1"/>' +
        '<line x1="5" y1="24" x2="-2" y2="42" stroke="' + vestColor + '" stroke-width="4"/>' +
        '<line x1="25" y1="24" x2="32" y2="42" stroke="' + vestColor + '" stroke-width="4"/>' +
        '<rect x="7" y="53" width="7" height="32" fill="#1e293b"/>' +
        '<rect x="16" y="53" width="7" height="32" fill="#1e293b"/>' +
        '<rect x="-5" y="-12" width="40" height="12" rx="3" fill="rgba(0,0,0,0.75)"/>' +
        '<text x="15" y="-4" text-anchor="middle" fill="#a5b4fc" font-size="7" font-weight="bold">STUDENT</text>' +
    '</g>';
}


/* =========================================================
   PHASE 5C: REAL PLAYABLE EMERGENCY SIMULATION ENGINE
   GOLD-STANDARD PROTOTYPE: BUILDING FIRE
   ========================================================= */

const PlayableFireSimulation = {
    canvas: null,
    ctx: null,
    container: null,
    isRunning: false,
    animFrameId: null,
    lastTime: 0,
    currentZoneIdx: 0,

    player: {
        x: 140,
        y: 220,
        r: 14,
        speed: 170,
        crouchSpeed: 95,
        vx: 0,
        vy: 0,
        targetX: null,
        targetY: null,
        facing: "down",
        posture: "upright", // "upright" | "crouch"
        walkCycle: 0,
        isMoving: false,
        vestColor: "#6366f1"
    },

    keys: {
        w: false,
        a: false,
        s: false,
        d: false,
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        e: false,
        c: false
    },

    particles: {
        fire: [],
        smoke: [],
        embers: []
    },

    nearestInteractable: null,
    strobeTimer: 0,
    strobeAlpha: 0,
    toastTimer: null,

    // 8 RICH PLAYABLE ARCHITECTURAL ZONES MAPPED 1:1 TO BUILDING FIRE DECISIONS
    zones: [
        // ZONE 0: Academic Block Dormitory Room (Decision 1: Alarm & Smoke Detection)
        {
            title: "Dormitory Room & Hallway",
            location: "ACADEMIC WING · FLOOR 2 (EAST)",
            objective: "Emergency alarm is sounding. Exit room immediately into main corridor.",
            threat: "THREAT: ACTIVE FIRE ALARM · INITIAL SMOKE CEILING DRIFT",
            width: 800,
            height: 440,
            playerStart: { x: 140, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 }, // Top outer
                { x: 20, y: 380, w: 760, h: 20 }, // Bottom outer
                { x: 20, y: 40, w: 20, h: 360 }, // Left outer
                { x: 760, y: 40, w: 20, h: 360 }, // Right outer
                { x: 340, y: 40, w: 16, h: 140 }, // Dorm partition upper
                { x: 340, y: 260, w: 16, h: 140 }, // Dorm partition lower
                { x: 580, y: 160, w: 16, h: 240 }  // Elevator wall partition
            ],
            interactables: [
                {
                    id: "door_corridor",
                    name: "Hallway Exit Door",
                    type: "door",
                    icon: "🚪",
                    x: 340,
                    y: 180,
                    w: 20,
                    h: 80,
                    prompt: "Open Door & Evacuate to Hallway",
                    optIdx: 1, // Decision 1 Option B (Correct)
                    isCorrect: true,
                    feedback: "Evacuate room immediately without hesitation."
                },
                {
                    id: "elevator_panel",
                    name: "Elevator Call Panel",
                    type: "elevator",
                    icon: "🛗",
                    x: 620,
                    y: 70,
                    w: 60,
                    h: 50,
                    prompt: "Call Elevator (Hazard)",
                    optIdx: 0, // Decision 1 Option A
                    isCorrect: false,
                    feedback: "Never use elevators during fires. They can stall or fill with toxic smoke."
                },
                {
                    id: "dorm_desk",
                    name: "Desk & Laptop",
                    type: "belongings",
                    icon: "🎒",
                    x: 80,
                    y: 80,
                    w: 70,
                    h: 50,
                    prompt: "Search & Pack Personal Belongings",
                    optIdx: 2, // Decision 1 Option C
                    isCorrect: false,
                    feedback: "Do not delay evacuation for personal belongings."
                },
                {
                    id: "smoke_vent",
                    name: "Ceiling Vent Drift",
                    type: "investigate",
                    icon: "🔍",
                    x: 230,
                    y: 80,
                    w: 50,
                    h: 40,
                    prompt: "Stay Inside to Investigate Smoke Source",
                    optIdx: 3, // Decision 1 Option D
                    isCorrect: false,
                    feedback: "Do not investigate fire origins. Evacuate immediately."
                }
            ],
            hazards: [
                { x: 500, y: 60, r: 25, type: "smoke_vent" },
                { x: 700, y: 220, r: 35, type: "strobe" }
            ],
            ambientProps: [
                { type: "bed", x: 70, y: 270, w: 90, h: 55, label: "Bed" },
                { type: "extinguisher", x: 380, y: 55, w: 14, h: 25, label: "Extinguisher" },
                { type: "sign_exit", x: 340, y: 155, w: 40, h: 18, label: "EXIT →" }
            ]
        },

        // ZONE 1: Mid-Hallway Junction (Decision 2: Route Selection — Stairs vs Elevator)
        {
            title: "Corridor Junction & Route Choice",
            location: "CENTRAL INTERSECTION · ELEVATOR & STAIRWELL LOBBY",
            objective: "Smoke is thickening in the corridor. Choose your primary evacuation route.",
            threat: "THREAT: SMOKE SPREAD IN CORRIDOR · ROUTE DECISION CRITICAL",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 },
                { x: 300, y: 60, w: 16, h: 100 },
                { x: 300, y: 280, w: 16, h: 120 }
            ],
            interactables: [
                {
                    id: "stairwell_exit_door",
                    name: "Fire Exit Stairwell",
                    type: "stair_door",
                    icon: "🚪",
                    x: 720,
                    y: 170,
                    w: 24,
                    h: 100,
                    prompt: "Enter Fire Exit Stairwell",
                    optIdx: 0, // Decision 2 Option A (Correct)
                    isCorrect: true,
                    feedback: "Fire exit stairs provide fire-rated, pressurized, smoke-protected egress."
                },
                {
                    id: "elevator_shaft",
                    name: "Main Elevator Bank",
                    type: "elevator",
                    icon: "🛗",
                    x: 480,
                    y: 60,
                    w: 80,
                    h: 50,
                    prompt: "Press Elevator Call Button",
                    optIdx: 1, // Decision 2 Option B
                    isCorrect: false,
                    feedback: "Elevator shafts act as chimneys during fires and power can fail suddenly."
                },
                {
                    id: "return_dorm",
                    name: "Return to Dorm Room",
                    type: "door_back",
                    icon: "↩️",
                    x: 40,
                    y: 180,
                    w: 20,
                    h: 80,
                    prompt: "Turn Back to Dorm Room",
                    optIdx: 2, // Decision 2 Option C
                    isCorrect: false,
                    feedback: "Do not return to rooms once evacuation has commenced."
                },
                {
                    id: "roof_ladder",
                    name: "Roof Access Hatch",
                    type: "ladder",
                    icon: "🪜",
                    x: 480,
                    y: 330,
                    w: 60,
                    h: 50,
                    prompt: "Climb Roof Access Hatch",
                    optIdx: 3, // Decision 2 Option D
                    isCorrect: false,
                    feedback: "Roof egress traps occupants; always evacuate downward toward ground."
                }
            ],
            hazards: [
                { x: 260, y: 100, r: 40, type: "smoke" },
                { x: 740, y: 150, r: 25, type: "strobe" }
            ],
            ambientProps: [
                { type: "sign_exit_large", x: 700, y: 140, w: 50, h: 22, label: "EMERGENCY EXIT" },
                { type: "arrow_floor", x: 380, y: 220, w: 40, h: 14, label: ">>>" }
            ]
        },

        // ZONE 2: Dense Smoke Stratification (Decision 3: Airway Protection & Low Crawl)
        {
            title: "Thermal Smoke Stratification Zone",
            location: "NORTH CORRIDOR · THERMAL SMOKE PASSAGE",
            objective: "Dense toxic smoke bank ceiling layer. Drop low and crawl beneath smoke.",
            threat: "THREAT: HIGH THERMAL SMOKE DENSITY · RESPIRATORY HAZARD",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 }
            ],
            interactables: [
                {
                    id: "low_crawl_passage",
                    name: "Low Crawl Smoke Clearance Zone",
                    type: "crawl_zone",
                    icon: "🧎",
                    x: 350,
                    y: 190,
                    w: 120,
                    h: 70,
                    prompt: "Drop Low to Floor & Crawl Beneath Smoke (Key: C)",
                    optIdx: 0, // Decision 3 Option A (Correct)
                    isCorrect: true,
                    feedback: "Clean breathable air remains in the bottom 30-60 cm of smoke-filled corridors."
                },
                {
                    id: "walk_upright",
                    name: "Walk Upright Through Smoke",
                    type: "upright_hazard",
                    icon: "🚶",
                    x: 350,
                    y: 90,
                    w: 100,
                    h: 60,
                    prompt: "Walk Quickly Upright in Smoke",
                    optIdx: 1, // Decision 3 Option B
                    isCorrect: false,
                    feedback: "Walking upright exposes your lungs to toxic gases (CO/HCN) and superheated air."
                },
                {
                    id: "open_windows",
                    name: "Open Hallway Window",
                    type: "window",
                    icon: "🪟",
                    x: 580,
                    y: 50,
                    w: 70,
                    h: 30,
                    prompt: "Break / Open Hallway Windows",
                    optIdx: 2, // Decision 3 Option C
                    isCorrect: false,
                    feedback: "Opening windows can feed fresh oxygen to flashover fires."
                },
                {
                    id: "sprint_upright",
                    name: "Hold Breath & Sprint Upright",
                    type: "sprint_hazard",
                    icon: "🏃",
                    x: 350,
                    y: 290,
                    w: 100,
                    h: 60,
                    prompt: "Hold Breath & Sprint Upright",
                    optIdx: 3, // Decision 3 Option D
                    isCorrect: false,
                    feedback: "Deep exertion causes involuntary gasping of superheated toxic fumes."
                }
            ],
            hazards: [
                { x: 380, y: 120, r: 80, type: "heavy_smoke" },
                { x: 550, y: 100, r: 70, type: "heavy_smoke" }
            ],
            ambientProps: [
                { type: "smoke_ceiling_layer", x: 40, y: 60, w: 720, h: 100, label: "TOXIC SMOKE BANK" }
            ]
        },

        // ZONE 3: Stairwell Vestibule (Decision 4: Guiding Disoriented Classmate)
        {
            title: "Stairwell Vestibule & Peer Guidance",
            location: "EAST VESTIBULE · DISORIENTED PEER ENCOUNTER",
            objective: "A confused classmate is heading toward a dead-end. Guide them to safety.",
            threat: "THREAT: DISORIENTED STUDENT · RISK OF DEAD-END TRAPPING",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 },
                { x: 480, y: 40, w: 16, h: 140 }, // Dead-end partition
                { x: 480, y: 270, w: 16, h: 130 }
            ],
            interactables: [
                {
                    id: "confused_classmate",
                    name: "Disoriented Classmate (Alex)",
                    type: "peer_npc",
                    icon: "🧑‍🎓",
                    x: 420,
                    y: 200,
                    w: 50,
                    h: 50,
                    prompt: "Direct & Guide Classmate to Fire Exit",
                    optIdx: 1, // Decision 4 Option B (Correct, 25 XP)
                    isCorrect: true,
                    feedback: "Clear verbal and physical guidance prevents peer disorientation and panic."
                },
                {
                    id: "shout_far",
                    name: "Shout Directions from Distance",
                    type: "shout",
                    icon: "📢",
                    x: 240,
                    y: 200,
                    w: 60,
                    h: 50,
                    prompt: "Shout Instructions from a Distance",
                    optIdx: 0, // Decision 4 Option A (Partial, 10 XP)
                    isCorrect: false,
                    feedback: "Shouting through fire alarms and smoke is difficult to hear; direct guidance is safer."
                },
                {
                    id: "leave_peer",
                    name: "Leave Classmate Behind",
                    type: "ignore",
                    icon: "🏃",
                    x: 700,
                    y: 200,
                    w: 50,
                    h: 60,
                    prompt: "Leave Classmate & Evacuate Alone",
                    optIdx: 2, // Decision 4 Option C
                    isCorrect: false,
                    feedback: "Abandoning confused peers increases casualty risks when help can be given quickly."
                },
                {
                    id: "search_closet",
                    name: "Search Utility Closet",
                    type: "closet",
                    icon: "🚪",
                    x: 520,
                    y: 80,
                    w: 60,
                    h: 40,
                    prompt: "Search Dead-end Utility Closet",
                    optIdx: 3, // Decision 4 Option D
                    isCorrect: false,
                    feedback: "Do not enter dead-end utility spaces during active fire conditions."
                }
            ],
            hazards: [
                { x: 560, y: 100, r: 40, type: "smoke" }
            ],
            ambientProps: [
                { type: "sign_exit", x: 710, y: 155, w: 40, h: 18, label: "EXIT" }
            ]
        },

        // ZONE 4: Emergency Stairwell Ingress (Decision 5: Egress Flow & Crowd Order)
        {
            title: "Emergency Fire Stairwell Descent",
            location: "FIRE EXIT STAIRWELL · ENCLOSED DESCENT SHAFT",
            objective: "Evacuating downward in stairwell. Maintain safe single-file flow on the right.",
            threat: "THREAT: ENCLOSED DESCENT · CRUSH & TRIPPING HAZARD",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 140 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 },
                { x: 20, y: 220, w: 600, h: 16 } // Center railing partition
            ],
            interactables: [
                {
                    id: "orderly_descent",
                    name: "Single-File Descent (Right Railing)",
                    type: "stairs_right",
                    icon: "🪜",
                    x: 640,
                    y: 280,
                    w: 90,
                    h: 70,
                    prompt: "Descend Orderly on Right Side with Handrail",
                    optIdx: 1, // Decision 5 Option B (Correct)
                    isCorrect: true,
                    feedback: "Staying on the right with handrail contact maintains flow and leaves left side for emergency responders."
                },
                {
                    id: "rush_crowd",
                    name: "Push Past Slower Evacuees",
                    type: "push_hazard",
                    icon: "⚡",
                    x: 320,
                    y: 110,
                    w: 80,
                    h: 60,
                    prompt: "Rush & Push Past Slower Students",
                    optIdx: 0, // Decision 5 Option A
                    isCorrect: false,
                    feedback: "Pushing in stairwells causes fatal bottleneck stampedes and stair falls."
                },
                {
                    id: "landing_phone",
                    name: "Stop on Landing for Phone / Video",
                    type: "phone_hazard",
                    icon: "📱",
                    x: 640,
                    y: 110,
                    w: 80,
                    h: 60,
                    prompt: "Stop on Landing to Film or Text",
                    optIdx: 2, // Decision 5 Option C
                    isCorrect: false,
                    feedback: "Stopping on landings blocks hundreds of evacuees behind you."
                },
                {
                    id: "turn_upstairs",
                    name: "Turn Around Upstairs",
                    type: "turn_hazard",
                    icon: "⬆️",
                    x: 180,
                    y: 110,
                    w: 70,
                    h: 60,
                    prompt: "Turn Around and Head Back Upstairs",
                    optIdx: 3, // Decision 5 Option D
                    isCorrect: false,
                    feedback: "Never move counter-flow up an active evacuation stairwell."
                }
            ],
            hazards: [],
            ambientProps: [
                { type: "stair_steps", x: 100, y: 240, w: 520, h: 120, label: "Stairwell Steps (Downward →)" }
            ]
        },

        // ZONE 5: Ground Floor Main Foyer (Decision 6: Alternate Panic Exit Selection)
        {
            title: "Ground Floor Foyer & Exit Selection",
            location: "GROUND FLOOR FOYER · EXTERIOR EGRESS CORRIDOR",
            objective: "Main revolving doors are crowded. Locate secondary push-bar emergency exit.",
            threat: "THREAT: MAIN ENTRANCE CONGESTION · SMOKE SPILLOVER",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 },
                { x: 500, y: 40, w: 16, h: 120 },
                { x: 500, y: 280, w: 16, h: 120 }
            ],
            interactables: [
                {
                    id: "push_bar_exit",
                    name: "Secondary Push-Bar Emergency Exit",
                    type: "push_bar",
                    icon: "🚪",
                    x: 720,
                    y: 280,
                    w: 24,
                    h: 80,
                    prompt: "Push Panic Hardware Exit Door",
                    optIdx: 0, // Decision 6 Option A (Correct)
                    isCorrect: true,
                    feedback: "Emergency push-bar exit doors provide instant unobstructed egress when main doors crowd."
                },
                {
                    id: "revolving_doors",
                    name: "Main Revolving Glass Entrance",
                    type: "revolving",
                    icon: "🔄",
                    x: 720,
                    y: 80,
                    w: 24,
                    h: 80,
                    prompt: "Join Crowd at Revolving Door",
                    optIdx: 1, // Decision 6 Option B
                    isCorrect: false,
                    feedback: "Revolving doors jam under panic load; always seek wide panic hardware doors."
                },
                {
                    id: "return_stairs",
                    name: "Return Back Up Stairwell",
                    type: "back_stairs",
                    icon: "↩️",
                    x: 40,
                    y: 180,
                    w: 20,
                    h: 80,
                    prompt: "Return to Stairwell",
                    optIdx: 2, // Decision 6 Option C
                    isCorrect: false,
                    feedback: "You have reached the ground floor; exit immediately into the open air."
                },
                {
                    id: "wait_reception",
                    name: "Wait Near Reception Desk",
                    type: "reception",
                    icon: "🛋️",
                    x: 320,
                    y: 80,
                    w: 80,
                    h: 60,
                    prompt: "Wait in Lobby for Announcement",
                    optIdx: 3, // Decision 6 Option D
                    isCorrect: false,
                    feedback: "Lobbies fill with descending smoke; do not linger inside."
                }
            ],
            hazards: [
                { x: 200, y: 80, r: 35, type: "smoke" }
            ],
            ambientProps: [
                { type: "sign_exit_large", x: 680, y: 255, w: 60, h: 20, label: "PANIC EXIT" }
            ]
        },

        // ZONE 6: Building Exterior Plaza (Decision 7: Anti-Re-Entry Safety Line)
        {
            title: "Campus Plaza & Safety Perimeter",
            location: "EXTERIOR PERIMETER · CAMPUS PLAZA SAFETY BOUNDARY",
            objective: "Outside in open air. Peer considers re-entering. Maintain safe perimeter.",
            threat: "THREAT: BUILDING SMOKE VENTING · RISK OF ILL-ADVISED RE-ENTRY",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 }
            ],
            interactables: [
                {
                    id: "safe_perimeter",
                    name: "Safety Cordon Line & Assembly Waypoint",
                    type: "cordon",
                    icon: "🛑",
                    x: 640,
                    y: 180,
                    w: 90,
                    h: 90,
                    prompt: "Move Past Cordon to Open Assembly Field",
                    optIdx: 1, // Decision 7 Option B (Correct)
                    isCorrect: true,
                    feedback: "Never re-enter a burning building under any circumstances. Firefighters handle search."
                },
                {
                    id: "reenter_building",
                    name: "Building Entrance Doors (Re-entry)",
                    type: "reentry",
                    icon: "🔥",
                    x: 40,
                    y: 180,
                    w: 20,
                    h: 80,
                    prompt: "Re-enter Building for Laptop / Belongings",
                    optIdx: 0, // Decision 7 Option A
                    isCorrect: false,
                    feedback: "Re-entering accounts for over 30% of residential fire fatalities."
                },
                {
                    id: "glass_facade",
                    name: "Stand Beneath Glass Windows",
                    type: "facade",
                    icon: "🏢",
                    x: 340,
                    y: 60,
                    w: 90,
                    h: 40,
                    prompt: "Stand Directly Beneath Upper Windows",
                    optIdx: 2, // Decision 7 Option C
                    isCorrect: false,
                    feedback: "Falling thermal glass shards and venting flames create perimeter strike zones."
                },
                {
                    id: "truck_lane",
                    name: "Emergency Vehicle Access Lane",
                    type: "lane",
                    icon: "🚒",
                    x: 340,
                    y: 320,
                    w: 90,
                    h: 40,
                    prompt: "Stand in Fire Engine Access Lane",
                    optIdx: 3, // Decision 7 Option D
                    isCorrect: false,
                    feedback: "Keep emergency vehicle approach paths 100% unobstructed."
                }
            ],
            hazards: [
                { x: 80, y: 100, r: 60, type: "exterior_smoke" }
            ],
            ambientProps: [
                { type: "cordon_tape", x: 520, y: 60, w: 10, h: 320, label: "SAFETY CORDON LINE" },
                { type: "fire_truck", x: 420, y: 270, w: 90, h: 45, label: "Fire Engine 01" }
            ]
        },

        // ZONE 7: Sports Field Assembly Point (Decision 8: Accountability & Roll Call)
        {
            title: "Campus Assembly Ground & Roll Call",
            location: "DESIGNATED ASSEMBLY AREA · MAIN SPORTS FIELD",
            objective: "Evacuation complete! Report to Safety Floor Marshal to log attendance.",
            threat: "THREAT: FINAL STAGE · STUDENT ACCOUNTABILITY & ROLL CALL",
            width: 800,
            height: 440,
            playerStart: { x: 80, y: 220 },
            walls: [
                { x: 20, y: 40, w: 760, h: 20 },
                { x: 20, y: 380, w: 760, h: 20 },
                { x: 20, y: 40, w: 20, h: 360 },
                { x: 760, y: 40, w: 20, h: 360 }
            ],
            interactables: [
                {
                    id: "safety_marshal",
                    name: "Safety Floor Marshal (Roster / Headcount)",
                    type: "marshal_npc",
                    icon: "📋",
                    x: 600,
                    y: 190,
                    w: 70,
                    h: 70,
                    prompt: "Report to Safety Marshal & Log Status",
                    optIdx: 0, // Decision 8 Option A (Correct)
                    isCorrect: true,
                    feedback: "Logging headcount prevents unnecessary first responder searches into danger."
                },
                {
                    id: "leave_campus",
                    name: "Leave Campus Immediately",
                    type: "leave",
                    icon: "🚶",
                    x: 720,
                    y: 80,
                    w: 30,
                    h: 70,
                    prompt: "Leave Campus Without Telling Anyone",
                    optIdx: 1, // Decision 8 Option B
                    isCorrect: false,
                    feedback: "Leaving without checking in flags you as 'missing' inside the burning building."
                },
                {
                    id: "parking_lot",
                    name: "Move to Car Parking Area",
                    type: "parking",
                    icon: "🚗",
                    x: 300,
                    y: 70,
                    w: 80,
                    h: 50,
                    prompt: "Go to Car Parking Lot",
                    optIdx: 2, // Decision 8 Option C
                    isCorrect: false,
                    feedback: "Parking lots block emergency vehicle turnaround and are not assembly points."
                },
                {
                    id: "cafeteria",
                    name: "Go to Cafeteria",
                    type: "food",
                    icon: "☕",
                    x: 300,
                    y: 310,
                    w: 80,
                    h: 50,
                    prompt: "Disperse to Cafeteria",
                    optIdx: 3, // Decision 8 Option D
                    isCorrect: false,
                    feedback: "Never disperse from the assembly point until the official 'All Clear' is sounded."
                }
            ],
            hazards: [],
            ambientProps: [
                { type: "assembly_sign", x: 580, y: 130, w: 110, h: 35, label: "ASSEMBLY POINT 01" },
                { type: "grass_field", x: 40, y: 60, w: 720, h: 320, label: "Sports Field" }
            ]
        }
    ],

    init(containerId = "simInteractiveStage") {
        this.container = document.getElementById(containerId) || (typeof $ === "function" ? $(containerId) : null);
        if (!this.container) return false;

        this.container.style.display = "block";
        this.container.innerHTML = `
            <div class="sim-playable-wrapper">
                <div class="sim-playable-hud">
                    <div class="hud-left">
                        <span class="hud-zone-pill" id="simZonePill">ZONE 1 / 8</span>
                        <span class="hud-location" id="simLocationText">ACADEMIC WING · FLOOR 2</span>
                    </div>
                    <div class="hud-center">
                        <span class="hud-objective-label">OBJECTIVE:</span>
                        <span class="hud-objective-text" id="simObjectiveText">Evacuate room immediately into main corridor.</span>
                    </div>
                    <div class="hud-right">
                        <span class="hud-keys-badge">⌨️ WASD/ARROWS: MOVE · E: INTERACT · C: CRAWL</span>
                    </div>
                </div>

                <div class="sim-canvas-container" id="simCanvasContainer">
                    <canvas id="simCanvas" width="800" height="440" tabindex="0" aria-label="ReadyVerse Fire Simulation Environment"></canvas>
                    <div class="sim-touch-dpad" id="simTouchDpad" aria-hidden="true">
                        <button type="button" class="dpad-btn dpad-up" data-dir="up">▲</button>
                        <div class="dpad-middle-row">
                            <button type="button" class="dpad-btn dpad-left" data-dir="left">◀</button>
                            <div class="dpad-center"></div>
                            <button type="button" class="dpad-btn dpad-right" data-dir="right">▶</button>
                        </div>
                        <button type="button" class="dpad-btn dpad-down" data-dir="down">▼</button>
                    </div>
                    <button type="button" class="sim-touch-action-btn" id="simTouchActionBtn" aria-label="Interact Action">
                        <span>⚡ [E]</span>
                        <small>ACTION</small>
                    </button>
                    <div class="sim-feedback-toast hidden" id="simFeedbackToast"></div>
                </div>
            </div>
        `;

        this.canvas = document.getElementById("simCanvas");
        if (!this.canvas) return false;
        this.ctx = this.canvas.getContext("2d");

        // Hide legacy feeds and cards if in fire mission
        const simFeed = typeof $ === "function" ? $("simCinematicFeed") : null;
        if (simFeed) simFeed.style.display = "none";

        // Setup input bindings
        this.bindEvents();

        // Initialize audio
        if (typeof SimulationAudio !== "undefined" && SimulationAudio.init) {
            SimulationAudio.init();
        }

        // Start game loop
        this.currentZoneIdx = 0;
        this.loadZone(0);
        this.isRunning = true;
        this.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.gameLoop = this.gameLoop.bind(this);
        if (typeof requestAnimationFrame !== "undefined") {
            this.animFrameId = requestAnimationFrame(this.gameLoop);
        }

        return true;
    },

    bindEvents() {
        this.keydownHandler = (e) => {
            if (!this.isRunning) return;
            const key = e.key;

            if (["w", "W", "ArrowUp"].includes(key)) { this.keys.w = true; this.keys.ArrowUp = true; }
            if (["a", "A", "ArrowLeft"].includes(key)) { this.keys.a = true; this.keys.ArrowLeft = true; }
            if (["s", "S", "ArrowDown"].includes(key)) { this.keys.s = true; this.keys.ArrowDown = true; }
            if (["d", "D", "ArrowRight"].includes(key)) { this.keys.d = true; this.keys.ArrowRight = true; }
            
            if (["e", "E", " ", "Enter"].includes(key)) {
                if (e.preventDefault) e.preventDefault();
                this.interact();
            }

            if (["c", "C"].includes(key)) {
                this.player.posture = this.player.posture === "crouch" ? "upright" : "crouch";
                this.showToast(this.player.posture === "crouch" ? "🧎 LOW CRAWL ACTIVE" : "🚶 UPRIGHT POSTURE", "#6366f1");
            }
        };

        this.keyupHandler = (e) => {
            if (!this.isRunning) return;
            const key = e.key;

            if (["w", "W", "ArrowUp"].includes(key)) { this.keys.w = false; this.keys.ArrowUp = false; }
            if (["a", "A", "ArrowLeft"].includes(key)) { this.keys.a = false; this.keys.ArrowLeft = false; }
            if (["s", "S", "ArrowDown"].includes(key)) { this.keys.s = false; this.keys.ArrowDown = false; }
            if (["d", "D", "ArrowRight"].includes(key)) { this.keys.d = false; this.keys.ArrowRight = false; }
        };

        if (typeof window !== "undefined" && window.addEventListener) {
            window.addEventListener("keydown", this.keydownHandler);
            window.addEventListener("keyup", this.keyupHandler);
        }

        // Click / Touch to move & interact
        if (this.canvas && this.canvas.addEventListener) {
            this.canvas.addEventListener("click", (e) => {
                if (!this.canvas.getBoundingClientRect) return;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / (rect.width || 800);
                const scaleY = this.canvas.height / (rect.height || 440);
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                // Check if clicked directly on an interactable
                const zone = this.zones[this.currentZoneIdx];
                let clickedInteractable = null;
                if (zone && zone.interactables) {
                    clickedInteractable = zone.interactables.find(item => {
                        return clickX >= item.x - 15 && clickX <= item.x + item.w + 15 &&
                               clickY >= item.y - 15 && clickY <= item.y + item.h + 15;
                    });
                }

                if (clickedInteractable) {
                    this.player.targetX = clickedInteractable.x + clickedInteractable.w / 2;
                    this.player.targetY = clickedInteractable.y + clickedInteractable.h / 2;
                } else {
                    this.player.targetX = clickX;
                    this.player.targetY = clickY;
                }
            });
        }

        // Touch D-Pad bindings
        if (this.container && this.container.querySelectorAll) {
            const dpadBtns = this.container.querySelectorAll(".dpad-btn");
            dpadBtns.forEach(btn => {
                const dir = btn.getAttribute ? btn.getAttribute("data-dir") : null;
                const startPress = (e) => {
                    if (e && e.preventDefault) e.preventDefault();
                    if (dir === "up") this.keys.w = true;
                    if (dir === "down") this.keys.s = true;
                    if (dir === "left") this.keys.a = true;
                    if (dir === "right") this.keys.d = true;
                };
                const endPress = (e) => {
                    if (e && e.preventDefault) e.preventDefault();
                    if (dir === "up") this.keys.w = false;
                    if (dir === "down") this.keys.s = false;
                    if (dir === "left") this.keys.a = false;
                    if (dir === "right") this.keys.d = false;
                };
                if (btn.addEventListener) {
                    btn.addEventListener("touchstart", startPress, { passive: false });
                    btn.addEventListener("touchend", endPress, { passive: false });
                    btn.addEventListener("mousedown", startPress);
                    btn.addEventListener("mouseup", endPress);
                    btn.addEventListener("mouseleave", endPress);
                }
            });
        }

        // Touch Action Button
        const actionBtn = document.getElementById("simTouchActionBtn");
        if (actionBtn && actionBtn.addEventListener) {
            actionBtn.addEventListener("click", (e) => {
                if (e && e.preventDefault) e.preventDefault();
                this.interact();
            });
        }
    },

    loadZone(idx) {
        if (idx < 0 || idx >= this.zones.length) return;
        this.currentZoneIdx = idx;
        const zone = this.zones[idx];

        this.player.x = zone.playerStart.x;
        this.player.y = zone.playerStart.y;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.targetX = null;
        this.player.targetY = null;
        this.player.posture = idx === 2 ? "crouch" : "upright";
        this.nearestInteractable = null;

        // Reset particles
        this.particles.fire = [];
        this.particles.smoke = [];
        this.particles.embers = [];

        // Update HUD elements
        const pill = document.getElementById("simZonePill");
        const loc = document.getElementById("simLocationText");
        const obj = document.getElementById("simObjectiveText");
        if (pill) pill.textContent = `ZONE ${idx + 1} / 8`;
        if (loc) loc.textContent = zone.location;
        if (obj) obj.textContent = zone.objective;

        // Sync with ReadyVerse global decision index if applicable
        if (typeof state !== "undefined") {
            state.currentDecision = idx;
        }

        if (typeof SimulationAudio !== "undefined" && SimulationAudio.playAlarm) {
            SimulationAudio.playAlarm();
        }
    },

    gameLoop(now) {
        if (!this.isRunning) return;
        const nowTime = now || (typeof performance !== "undefined" ? performance.now() : Date.now());
        const dt = Math.min((nowTime - this.lastTime) / 1000, 0.1);
        this.lastTime = nowTime;

        this.update(dt);
        this.render();

        if (typeof requestAnimationFrame !== "undefined") {
            this.animFrameId = requestAnimationFrame(this.gameLoop);
        }
    },

    update(dt) {
        const zone = this.zones[this.currentZoneIdx];
        if (!zone) return;

        // 1. Movement vector from keys
        let moveX = 0;
        let moveY = 0;

        if (this.keys.w || this.keys.ArrowUp) moveY -= 1;
        if (this.keys.s || this.keys.ArrowDown) moveY += 1;
        if (this.keys.a || this.keys.ArrowLeft) moveX -= 1;
        if (this.keys.d || this.keys.ArrowRight) moveX += 1;

        // Click / touch target navigation
        if (this.player.targetX !== null && this.player.targetY !== null) {
            const dx = this.player.targetX - this.player.x;
            const dy = this.player.targetY - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 6) {
                moveX = dx / dist;
                moveY = dy / dist;
            } else {
                this.player.targetX = null;
                this.player.targetY = null;
            }
        }

        // Normalize diagonal speed
        const currentSpeed = this.player.posture === "crouch" ? this.player.crouchSpeed : this.player.speed;
        if (moveX !== 0 && moveY !== 0 && this.player.targetX === null) {
            moveX *= 0.7071;
            moveY *= 0.7071;
        }

        this.player.isMoving = moveX !== 0 || moveY !== 0;

        if (this.player.isMoving) {
            this.player.walkCycle += dt * (this.player.posture === "crouch" ? 5 : 8);
            if (Math.abs(moveX) > Math.abs(moveY)) {
                this.player.facing = moveX > 0 ? "right" : "left";
            } else {
                this.player.facing = moveY > 0 ? "down" : "up";
            }
        }

        // Collision detection and sliding
        const newX = this.player.x + moveX * currentSpeed * dt;
        const newY = this.player.y + moveY * currentSpeed * dt;

        if (!this.checkWallCollision(newX, this.player.y, zone.walls)) {
            this.player.x = newX;
        }
        if (!this.checkWallCollision(this.player.x, newY, zone.walls)) {
            this.player.y = newY;
        }

        // Keep inside canvas bounds
        if (zone.walls && zone.walls.length >= 4) {
            this.player.x = Math.max(zone.walls[2].x + zone.walls[2].w + this.player.r, Math.min(zone.walls[3].x - this.player.r, this.player.x));
            this.player.y = Math.max(zone.walls[0].y + zone.walls[0].h + this.player.r, Math.min(zone.walls[1].y - this.player.r, this.player.y));
        }

        // 2. Nearest interactable proximity detection
        let closest = null;
        let minDistance = 60; // 60px interaction radius

        if (zone.interactables) {
            zone.interactables.forEach(item => {
                const centerX = item.x + item.w / 2;
                const centerY = item.y + item.h / 2;
                const dist = Math.hypot(this.player.x - centerX, this.player.y - centerY);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = item;
                }
            });
        }

        this.nearestInteractable = closest;

        // Auto-interact on close proximity for low-crawl zone
        if (closest && closest.type === "crawl_zone" && this.player.posture !== "crouch") {
            this.player.posture = "crouch";
            this.showToast("🧎 DROP LOW TO CRAWL UNDER SMOKE", "#22c55e");
        }

        // 3. Dynamic Particle Simulation
        this.updateParticles(dt, zone);

        // 4. Strobe lighting pulse
        this.strobeTimer += dt * 3.5;
        this.strobeAlpha = Math.max(0, Math.sin(this.strobeTimer)) * 0.18;
    },

    checkWallCollision(x, y, walls) {
        if (!walls) return false;
        const r = this.player.r;
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) {
                return true;
            }
        }
        return false;
    },

    updateParticles(dt, zone) {
        // Spawn fire particles near fire hazards
        if (zone.hazards) {
            zone.hazards.forEach(h => {
                if (h.type === "smoke" || h.type === "heavy_smoke" || h.type === "smoke_vent") {
                    if (this.particles.smoke.length < 45 && Math.random() < 0.6) {
                        this.particles.smoke.push({
                            x: h.x + (Math.random() - 0.5) * h.r * 2,
                            y: h.y + (Math.random() - 0.5) * (h.r * 0.8),
                            vx: (Math.random() - 0.5) * 15,
                            vy: -Math.random() * 20 - 5,
                            r: Math.random() * 18 + 12,
                            alpha: 0.7,
                            maxLife: Math.random() * 3 + 2,
                            life: 0
                        });
                    }
                }
            });
        }

        // Update smoke
        for (let i = this.particles.smoke.length - 1; i >= 0; i--) {
            const p = this.particles.smoke[i];
            p.life += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.r += dt * 8;
            p.alpha = Math.max(0, 0.65 * (1 - p.life / p.maxLife));
            if (p.life >= p.maxLife) {
                this.particles.smoke.splice(i, 1);
            }
        }
    },

    interact() {
        if (!this.nearestInteractable) return;
        const item = this.nearestInteractable;

        if (typeof SimulationAudio !== "undefined" && SimulationAudio.playClick) {
            SimulationAudio.playClick();
        }

        if (item.isCorrect) {
            // SAFE CHOICE
            if (typeof SimulationAudio !== "undefined" && SimulationAudio.playSafeCue) {
                SimulationAudio.playSafeCue();
            }
            this.showToast(`✅ [SAFE ACTION] +25 XP: ${item.feedback}`, "#22c55e", 3500);

            // Trigger global ReadyVerse decision engine
            if (typeof handleDecision === "function") {
                handleDecision(item.optIdx);
            }

            // Advance to next zone after brief pause
            setTimeout(() => {
                if (this.currentZoneIdx < this.zones.length - 1) {
                    this.loadZone(this.currentZoneIdx + 1);
                } else {
                    // Mission completed!
                    if (typeof finishMission === "function") {
                        finishMission();
                    }
                    this.destroy();
                }
            }, 700);

        } else {
            // UNSAFE ACTION / HAZARD
            if (typeof SimulationAudio !== "undefined" && SimulationAudio.playDangerCue) {
                SimulationAudio.playDangerCue();
            }
            this.showToast(`⚠️ [HAZARD] ${item.feedback}`, "#ef4444", 4000);

            // Record choice in ReadyVerse state without blocking recovery
            if (typeof handleDecision === "function") {
                handleDecision(item.optIdx);
            }
        }
    },

    showToast(message, color = "#22c55e", duration = 3000) {
        const toast = document.getElementById("simFeedbackToast");
        if (!toast) return;
        toast.textContent = message;
        if (toast.style) {
            toast.style.borderColor = color;
            toast.style.color = color;
        }
        if (toast.classList) {
            toast.classList.remove("hidden");
        }

        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            if (toast.classList) toast.classList.add("hidden");
        }, duration);
    },

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        const zone = this.zones[this.currentZoneIdx];
        if (!zone) return;

        const W = this.canvas.width || 800;
        const H = this.canvas.height || 440;

        // 1. Clear background
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, W, H);

        // 2. Floor tiles grid & directional arrows
        this.renderFloor(ctx, zone, W, H);

        // 3. Walls & Architectural bounds
        this.renderWalls(ctx, zone.walls);

        // 4. Ambient props (beds, lockers, signage, emergency vehicles)
        this.renderProps(ctx, zone.ambientProps);

        // 5. Interactable objects (doors, elevators, NPCs, push-bars)
        this.renderInteractables(ctx, zone.interactables);

        // 6. Dynamic smoke particles & heat overlay
        this.renderParticles(ctx);

        // 7. Player Avatar
        this.renderPlayer(ctx);

        // 8. In-world interaction prompt badge
        if (this.nearestInteractable) {
            this.renderPromptBadge(ctx, this.nearestInteractable);
        }

        // 9. Alarm Strobe Overlay
        if (this.strobeAlpha > 0.02) {
            ctx.fillStyle = `rgba(239, 68, 68, ${this.strobeAlpha})`;
            ctx.fillRect(0, 0, W, H);
        }
    },

    renderFloor(ctx, zone, W, H) {
        if (!ctx.save) return;
        ctx.save();
        if (this.currentZoneIdx >= 6) {
            ctx.fillStyle = this.currentZoneIdx === 7 ? "#14532d" : "#1e293b";
            ctx.fillRect(40, 60, W - 80, H - 120);
        } else {
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(40, 60, W - 80, H - 120);

            // Floor grid tiles
            ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
            ctx.lineWidth = 1;
            for (let x = 40; x < W - 40; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, 60);
                ctx.lineTo(x, H - 60);
                ctx.stroke();
            }
            for (let y = 60; y < H - 60; y += 40) {
                ctx.beginPath();
                ctx.moveTo(40, y);
                ctx.lineTo(W - 40, y);
                ctx.stroke();
            }
        }
        ctx.restore();
    },

    renderWalls(ctx, walls) {
        if (!ctx.save || !walls) return;
        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;

        walls.forEach(w => {
            ctx.fillRect(w.x, w.y, w.w, w.h);
            if (ctx.strokeRect) ctx.strokeRect(w.x, w.y, w.w, w.h);
        });
        ctx.restore();
    },

    renderProps(ctx, props) {
        if (!ctx.save || !props) return;
        ctx.save();
        props.forEach(p => {
            if (p.type === "bed") {
                ctx.fillStyle = "#1e1b4b";
                ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = "#4338ca";
                ctx.fillRect(p.x + 5, p.y + 5, p.w - 10, p.h - 10);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(p.x + 8, p.y + 8, 22, p.h - 16);
            } else if (p.type === "sign_exit" || p.type === "sign_exit_large") {
                ctx.fillStyle = "#15803d";
                ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.strokeStyle = "#86efac";
                ctx.lineWidth = 1.5;
                if (ctx.strokeRect) ctx.strokeRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 9px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                if (ctx.fillText) ctx.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2);
            } else if (p.type === "fire_truck") {
                ctx.fillStyle = "#dc2626";
                ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.fillStyle = "#93c5fd";
                ctx.fillRect(p.x + p.w - 20, p.y + 5, 15, p.h - 10);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 8px sans-serif";
                if (ctx.fillText) ctx.fillText("FIRE ENGINE", p.x + 8, p.y + p.h / 2 + 3);
            }
        });
        ctx.restore();
    },

    renderInteractables(ctx, list) {
        if (!ctx.save || !list) return;
        ctx.save();
        list.forEach(item => {
            const isNear = this.nearestInteractable === item;

            if (isNear && ctx.strokeRect) {
                ctx.strokeStyle = item.isCorrect ? "#4ade80" : "#f87171";
                ctx.lineWidth = 2.5;
                ctx.strokeRect(item.x - 4, item.y - 4, item.w + 8, item.h + 8);
            }

            if (item.type === "door" || item.type === "stair_door" || item.type === "push_bar") {
                ctx.fillStyle = item.isCorrect ? "#166534" : "#7f1d1d";
                ctx.fillRect(item.x, item.y, item.w, item.h);
                ctx.fillStyle = "#ffffff";
                ctx.font = "16px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                if (ctx.fillText) ctx.fillText(item.icon, item.x + item.w / 2, item.y + item.h / 2);
            } else if (item.type === "elevator") {
                ctx.fillStyle = "#334155";
                ctx.fillRect(item.x, item.y, item.w, item.h);
                ctx.fillStyle = "#facc15";
                ctx.fillRect(item.x + item.w / 2 - 1, item.y, 2, item.h);
                ctx.fillStyle = "#ef4444";
                ctx.font = "bold 9px sans-serif";
                if (ctx.fillText) ctx.fillText("⚠️ NO ELEVATOR", item.x + item.w / 2, item.y - 6);
            } else if (item.type === "peer_npc") {
                ctx.fillStyle = "#fed7aa";
                ctx.beginPath();
                ctx.arc(item.x + item.w / 2, item.y + 12, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#0284c7";
                ctx.fillRect(item.x + 12, item.y + 22, 26, 25);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 8px sans-serif";
                ctx.textAlign = "center";
                if (ctx.fillText) ctx.fillText("ALEX (PEER)", item.x + item.w / 2, item.y - 4);
            } else if (item.type === "marshal_npc") {
                ctx.fillStyle = "#fed7aa";
                ctx.beginPath();
                ctx.arc(item.x + item.w / 2, item.y + 12, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#eab308";
                ctx.fillRect(item.x + 15, item.y + 22, 40, 30);
                ctx.fillStyle = "#000000";
                ctx.font = "bold 7px sans-serif";
                ctx.textAlign = "center";
                if (ctx.fillText) ctx.fillText("MARSHAL", item.x + item.w / 2, item.y + 36);
            } else {
                ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
                ctx.fillRect(item.x, item.y, item.w, item.h);
                ctx.strokeStyle = "#64748b";
                if (ctx.strokeRect) ctx.strokeRect(item.x, item.y, item.w, item.h);
                ctx.font = "18px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                if (ctx.fillText) ctx.fillText(item.icon, item.x + item.w / 2, item.y + item.h / 2);
            }
        });
        ctx.restore();
    },

    renderParticles(ctx) {
        if (!ctx.save || !this.particles.smoke) return;
        ctx.save();
        this.particles.smoke.forEach(p => {
            ctx.fillStyle = `rgba(71, 85, 105, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    },

    renderPlayer(ctx) {
        if (!ctx.save) return;
        const p = this.player;
        ctx.save();
        if (ctx.translate) ctx.translate(p.x, p.y);

        if (p.posture === "crouch") {
            ctx.fillStyle = "#fed7aa";
            ctx.beginPath();
            ctx.arc(-10, -2, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = p.vestColor || "#6366f1";
            ctx.fillRect(-6, -6, 24, 12);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, -6, 4, 12);

            ctx.fillStyle = "#1e293b";
            ctx.fillRect(18, -4, 14, 8);

            ctx.fillStyle = "#a5b4fc";
            ctx.font = "bold 8px sans-serif";
            ctx.textAlign = "center";
            if (ctx.fillText) ctx.fillText("YOU (CRAWL)", 0, -14);

        } else {
            const bob = p.isMoving ? Math.sin(p.walkCycle) * 2 : 0;

            ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
            ctx.beginPath();
            if (ctx.ellipse) ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#1e293b";
            const legOffset = p.isMoving ? Math.sin(p.walkCycle) * 4 : 0;
            ctx.fillRect(-7, 6 + bob, 5, 10 + legOffset);
            ctx.fillRect(2, 6 + bob, 5, 10 - legOffset);

            ctx.fillStyle = p.vestColor || "#6366f1";
            ctx.fillRect(-9, -8 + bob, 18, 16);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(-9, -2 + bob, 18, 3);

            ctx.fillStyle = "#fed7aa";
            ctx.beginPath();
            ctx.arc(0, -14 + bob, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#451a03";
            ctx.beginPath();
            ctx.arc(0, -17 + bob, 6, Math.PI, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#a5b4fc";
            ctx.font = "bold 8px sans-serif";
            ctx.textAlign = "center";
            if (ctx.fillText) ctx.fillText("YOU", 0, -26 + bob);
        }

        ctx.restore();
    },

    renderPromptBadge(ctx, item) {
        if (!ctx.save || !item) return;
        ctx.save();
        const badgeX = item.x + item.w / 2;
        const badgeY = item.y - 18;

        const text = `[E] ${item.prompt}`;
        ctx.font = "bold 10px sans-serif";
        const textWidth = ctx.measureText ? ctx.measureText(text).width : 120;
        const padX = 8;
        const padY = 5;

        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.strokeStyle = item.isCorrect ? "#22c55e" : "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(badgeX - textWidth / 2 - padX, badgeY - 10 - padY, textWidth + padX * 2, 20, 6);
        } else {
            ctx.rect(badgeX - textWidth / 2 - padX, badgeY - 10 - padY, textWidth + padX * 2, 20);
        }
        ctx.fill();
        if (ctx.stroke) ctx.stroke();

        ctx.fillStyle = item.isCorrect ? "#86efac" : "#fde047";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (ctx.fillText) ctx.fillText(text, badgeX, badgeY);

        ctx.restore();
    },

    destroy() {
        this.isRunning = false;
        if (this.animFrameId && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (this.keydownHandler && typeof window !== "undefined" && window.removeEventListener) {
            window.removeEventListener("keydown", this.keydownHandler);
            window.removeEventListener("keyup", this.keyupHandler);
        }
        if (this.container) {
            this.container.innerHTML = "";
            this.container.style.display = "none";
        }
        if (typeof SimulationAudio !== "undefined" && SimulationAudio.cleanup) {
            SimulationAudio.cleanup();
        }
    }
};

// Aliases for compatibility with legacy test harness
const FireSimulationEngine = {
    init: (scenario) => scenario === "fire" ? PlayableFireSimulation.init() : false,
    renderScene: (idx) => PlayableFireSimulation.loadZone(idx),
    showConsequence: () => {},
    cleanup: () => PlayableFireSimulation.destroy(),
    destroy: () => PlayableFireSimulation.destroy()
};
const FIRE_SIMULATION_SCENES = PlayableFireSimulation.zones;
function renderTraineeAvatarSVG(posture, x = 0, y = 0) {
    return '<g class="sim-avatar-character sim-avatar-' + posture + '" transform="translate(' + x + ',' + y + ')"></g>';
}


/* =========================================================
   START MISSION
   ========================================================= */

function startMission(
    missionName
) {

    const mission =
        missions[missionName];


    if (!mission) {

        console.error(
            "Mission not found:",
            missionName
        );

        return;

    }


    /* Reset temporary mission data */

    state.currentMission =
        missionName;

    state.currentDecision =
        0;

    state.score =
        0;

    state.missionXP =
        0;

    state.answered =
        false;

    state.completionRecorded =
        false;

    state.lastResult =
        null;

    state.missionDecisionsLog = [];
    state.missionStartTime = Date.now();


    /* Start Total Mission Decision Timer (continuous across questions) */
    startTotalMissionTimer(missionName);


    /* Close briefing */

    closeMissionBriefing();


    /* Open simulation page */

    if (missionName === "fire") {
        PlayableFireSimulation.init();
    }

    showPage(
        simulationPage
    );


    /* Render first decision */

    renderSimulation();

    const simChallengeChip = $("simulationChallengeChip");
    const simChallengeTarget = $("simulationChallengeTarget");
    if (simChallengeChip) {
        if (state.activeChallenge && state.activeChallenge.active && (state.activeChallenge.drillId === missionName || !state.activeChallenge.drillId)) {
            if (simChallengeTarget) simChallengeTarget.textContent = `${state.activeChallenge.score}%`;
            simChallengeChip.classList.remove("hidden");
        } else {
            simChallengeChip.classList.add("hidden");
        }
    }

}


/* =========================================================
   RENDER SIMULATION
   ========================================================= */

function renderSimulation() {

    if (
        !simulationPage ||
        !state.currentMission
    ) {

        return;

    }


    const mission =
        missions[
            state.currentMission
        ];


    const question =
        mission.questions[
            state.currentDecision
        ];


    /* =====================================================
       MISSION FINISHED
       ===================================================== */

    if (!question) {

        finishMission();

        return;

    }


    const totalQuestions =
        mission.questions.length;


    const questionNumber =
        state.currentDecision + 1;


    const progress =
        Math.round(
            (
                state.currentDecision /
                totalQuestions
            ) * 100
        );


    /* =====================================================
       EXISTING HTML ELEMENTS
       ===================================================== */

    const scenarioIcon =
        $("scenarioIcon");

    const scenarioCategory =
        $("scenarioCategory");

    const scenarioTitle =
        $("scenarioTitle");

    const scenarioText =
        $("scenarioText");

    const decisionOptions =
        $("decisionOptions");

    const decisionFeedback =
        $("decisionFeedback");

    const simulationStep =
        $("simulationStep");

    const simulationProgress =
        $("simulationProgress");


    /* =====================================================
       UPDATE SCENARIO
       ===================================================== */

    if (scenarioIcon) {

        scenarioIcon.textContent =
            mission.icon;

    }


    if (scenarioCategory) {

        scenarioCategory.textContent =
            mission.category;

    }


    /* =====================================================
       ATMOSPHERIC THEME & THREAT SEVERITY
       ===================================================== */

    if (simulationPage) {
        simulationPage.className = `simulation-page theme-${state.currentMission}`;
    }

    const threatLevelText = $("threatLevelText");
    if (threatLevelText) {
        const severityMap = {
            fire: "LEVEL 2 · CRITICAL FIRE HAZARD",
            flood: "LEVEL 3 · FLASH HYDROTHREAT",
            cyclone: "LEVEL 4 · SEVERE CYCLONE ALERT",
            earthquake: "LEVEL 4 · SEISMIC IMPACT"
        };
        threatLevelText.textContent = severityMap[state.currentMission] || "THREAT LEVEL: HIGH";
    }

    /* Update Cinematic Incident Field Footage */
    const simFeedFrame = $("simFeedFrame");
    const simFeedActionPill = $("simFeedActionPill");
    if (simFeedFrame && simFeedActionPill) {
        if (state.currentMission === "fire") {
            simFeedFrame.style.backgroundImage = "url('assets/cinematic/shot2_smoke.jpg')";
            simFeedActionPill.textContent = "🔥 HOSTEL CORRIDOR · STUDENTS STAYING LOW UNDER SMOKE TOWARD MARKED EXIT";
        } else if (state.currentMission === "flood") {
            simFeedFrame.style.backgroundImage = "url('assets/cinematic/flood_evac.jpg')";
            simFeedActionPill.textContent = "🌊 CAMPUS STAIRWELL · STUDENTS ELEVATING ESSENTIALS TO UPPER FLOORS";
        } else if (state.currentMission === "cyclone") {
            simFeedFrame.style.backgroundImage = "url('assets/cinematic/cyclone_shelter.jpg')";
            simFeedActionPill.textContent = "🌪️ INTERIOR HALLWAY · STUDENTS SHELTERING SAFELY AWAY FROM WINDOWS";
        } else if (state.currentMission === "earthquake") {
            simFeedFrame.style.backgroundImage = "url('assets/cinematic/quake_shelter.jpg')";
            simFeedActionPill.textContent = "🌍 CLASSROOM DRILL · STUDENTS PERFORMING DROP, COVER & HOLD ON UNDER DESKS";
        }
    }

    /* Sync language buttons */
    const langEnBtn = $("simLangEnBtn");
    const langTaBtn = $("simLangTaBtn");
    if (langEnBtn) langEnBtn.classList.toggle("active", (state.drillLanguage || "en") !== "ta");
    if (langTaBtn) langTaBtn.classList.toggle("active", (state.drillLanguage || "en") === "ta");

    const isTamil = (state.drillLanguage === "ta") && state.currentMission === "fire" && typeof ReadyVerseTamil !== "undefined";
    const tamilQ = (isTamil && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.questions)
        ? ReadyVerseTamil.fireDrill.questions[state.currentDecision]
        : null;

    if (scenarioCategory && isTamil && ReadyVerseTamil.fireDrill) {
        scenarioCategory.textContent = ReadyVerseTamil.fireDrill.category || mission.category;
    }

    if (scenarioTitle) {
        scenarioTitle.textContent = (tamilQ && tamilQ.situation) ? tamilQ.situation : question.situation;
    }

    if (scenarioText) {
        scenarioText.textContent = isTamil
            ? "பாதுகாப்பான அவசர நெறிமுறையைத் தேர்ந்தெடுக்கவும். உங்கள் முடிவு உங்கள் தயார்நிலை மதிப்பீட்டை நிர்ணயிக்கும்."
            : "Choose the safest emergency response protocol. Your decision directly impacts life-safety and your readiness score.";
    }

    /* =====================================================
       UPDATE STEP COUNTER
       ===================================================== */

    if (simulationStep) {
        simulationStep.textContent = isTamil
            ? `முடிவு ${String(questionNumber).padStart(2, "0")} / ${String(totalQuestions).padStart(2, "0")}`
            : `DECISION ${String(questionNumber).padStart(2, "0")} / ${String(totalQuestions).padStart(2, "0")}`;
    }

    /* =====================================================
       UPDATE PROGRESS BAR
       ===================================================== */

    if (simulationProgress) {
        simulationProgress.style.width = `${progress}%`;
    }

    /* =====================================================
       CREATE DECISION BUTTONS WITH SHORTCUT HINTS
       ===================================================== */

    if (decisionOptions) {
        decisionOptions.innerHTML = question.options
            .map((option, index) => {
                const optText = (tamilQ && tamilQ.options && tamilQ.options[index])
                    ? tamilQ.options[index].text
                    : option.text;
                return `
                    <button
                        type="button"
                        class="decision-option"
                        data-option="${index}"
                    >
                        <span class="option-number">
                            ${String.fromCharCode(65 + index)}
                        </span>

                        <span class="option-text">
                            ${optText}
                        </span>

                        <span class="option-key">
                            [KEY ${index + 1}]
                        </span>
                    </button>
                `;
            })
            .join("");


        /* Attach click events */

        decisionOptions
            .querySelectorAll(
                ".decision-option"
            )
            .forEach(
                (button, index) => {

                    button.addEventListener(
                        "click",
                        () => {

                            handleDecision(
                                index,
                                button
                            );

                        }
                    );

                }
            );

    }


    /* =====================================================
       RESET FEEDBACK
       ===================================================== */

    if (decisionFeedback) {

        decisionFeedback.classList.add(
            "hidden"
        );

        decisionFeedback.innerHTML = "";

    }


    /* =====================================================
       RESET ANSWER STATE
       ===================================================== */

    state.answered =
        false;


    /* =====================================================
       EXIT BUTTON
       ===================================================== */

    const quitButton =
        $("quitSimulation");


    if (quitButton) {

        quitButton.onclick =
            quitCurrentMission;

    }

    /* Update mission timer display */
    updateMissionTimerDisplay();

    /* Render Interactive Stage for Fire */
    if (state.currentMission === "fire") {
        FireSimulationEngine.renderScene(state.currentDecision);
    } else {
        const intStage = $("simInteractiveStage");
        if (intStage) intStage.style.display = "none";
        const simFeed = $("simCinematicFeed");
        if (simFeed) simFeed.style.display = "";
    }

}


/* =========================================================
   TOTAL MISSION DECISION TIMERS & UTILITIES
   ========================================================= */

function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const MISSION_TOTAL_DURATIONS = {
    fire: 75,       // Building Fire: 75 seconds
    flood: 90,      // Flash Flood: 90 seconds
    cyclone: 90,    // Cyclone Emergency: 90 seconds
    earthquake: 60, // Earthquake Response: 60 seconds
    electrical: 60,
    medical: 60,
    default: 75
};

function getMissionTotalDuration(missionKey) {
    if (!missionKey) return MISSION_TOTAL_DURATIONS.default;
    if (typeof missions !== "undefined" && missions && missions[missionKey] && typeof missions[missionKey].missionDuration === "number") {
        return missions[missionKey].missionDuration;
    }
    return MISSION_TOTAL_DURATIONS[missionKey] || MISSION_TOTAL_DURATIONS.default;
}

// Backward-compatibility alias
function getMissionDecisionWindow(missionKey) {
    return getMissionTotalDuration(missionKey);
}

function formatMissionTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

let missionTimerInterval = null;
let missionTimeRemaining = 75;
let missionTimeTotal = 75;

function startTotalMissionTimer(missionKey) {
    clearTotalMissionTimer();
    const duration = getMissionTotalDuration(missionKey);
    missionTimeTotal = duration;
    missionTimeRemaining = duration;
    state.missionTimeTotal = duration;
    state.missionTimeRemaining = duration;

    updateMissionTimerDisplay();

    if (typeof setInterval === "function") {
        missionTimerInterval = setInterval(() => {
            missionTimeRemaining--;
            state.missionTimeRemaining = missionTimeRemaining;
            updateMissionTimerDisplay();

            if (missionTimeRemaining <= 0) {
                clearTotalMissionTimer();
                handleMissionTimeExpired();
            }
        }, 1000);
    }
}

function updateMissionTimerDisplay() {
    const formatted = formatMissionTime(missionTimeRemaining);
    const timerElem = $("missionCountdown") || $("decisionCountdown");
    const badgeElem = $("missionTimerBadge") || $("decisionTimerBadge");
    const progressElem = $("missionTimerProgress") || $("decisionTimerProgress");

    if (timerElem) {
        if (missionTimeRemaining <= 0) {
            timerElem.textContent = "DRILL TIME EXPIRED";
            timerElem.classList.remove("timer-urgent");
            timerElem.classList.add("timer-expired");
        } else {
            timerElem.textContent = formatted;
            if (missionTimeRemaining <= 15) {
                timerElem.classList.add("timer-urgent");
                timerElem.classList.remove("timer-expired");
            } else {
                timerElem.classList.remove("timer-urgent", "timer-expired");
            }
        }
    }

    if (badgeElem) {
        if (missionTimeRemaining <= 0) {
            badgeElem.classList.remove("urgent");
            badgeElem.classList.add("expired");
        } else if (missionTimeRemaining <= 15) {
            badgeElem.classList.add("urgent");
            badgeElem.classList.remove("expired");
        } else {
            badgeElem.classList.remove("urgent", "expired");
        }
    }

    if (progressElem) {
        const percent = Math.max(0, (missionTimeRemaining / missionTimeTotal) * 100);
        progressElem.style.width = `${percent}%`;
        if (missionTimeRemaining <= 0) {
            progressElem.style.width = "0%";
            progressElem.classList.remove("urgent");
            progressElem.classList.add("expired");
        } else if (missionTimeRemaining <= 15) {
            progressElem.classList.add("urgent");
            progressElem.classList.remove("expired");
        } else {
            progressElem.classList.remove("urgent", "expired");
        }
    }
}

function clearTotalMissionTimer() {
    if (missionTimerInterval) {
        clearInterval(missionTimerInterval);
        missionTimerInterval = null;
    }
}

function clearSimulationDecisionTimer() {
    clearTotalMissionTimer();
}

function handleMissionTimeExpired() {
    clearTotalMissionTimer();
    const mission = missions[state.currentMission];
    if (!mission) return;

    if (!state.answered && mission.questions) {
        state.answered = true;
        for (let i = state.currentDecision; i < mission.questions.length; i++) {
            const q = mission.questions[i];
            const correctOpt = q.options.find(o => o.correct);
            state.missionDecisionsLog.push({
                index: i,
                situation: q.situation,
                chosenText: "No decision recorded (Mission Time Expired)",
                earnedXP: 0,
                isCorrect: false,
                consequence: "Mission time expired before evacuation decision could be executed. Delay under active hazard increases exposure.",
                correctText: correctOpt ? correctOpt.text : "",
                correctFeedback: correctOpt ? correctOpt.feedback : "",
                isTimeout: true
            });
            state.decisionsMade += 1;
        }
    }

    const allButtons = document.querySelectorAll(".decision-option");
    allButtons.forEach(button => {
        button.disabled = true;
    });

    finishMission();
}

// Backward-compatibility alias
function handleSimulationTimeout() {
    handleMissionTimeExpired();
}

/* =========================================================
   HANDLE DECISION
   ========================================================= */
function handleDecision(
    selectedIndex,
    selectedButton
) {

    /* Prevent multiple clicks */
    if (state.answered) {
        return;
    }

    const mission =
        missions[state.currentMission];

    const question =
        mission.questions[state.currentDecision];

    const selectedOption =
        question.options[selectedIndex];

    if (!selectedOption) {
        return;
    }

    state.answered = true;

    /* Every answered question counts */
    state.decisionsMade += 1;

    const allButtons =
        document.querySelectorAll(
            ".decision-option"
        );

    if (!selectedButton && allButtons[selectedIndex]) {
        selectedButton = allButtons[selectedIndex];
    }

    /* Disable all choices */
    allButtons.forEach(button => {
        button.disabled = true;
    });

    /* =====================================================
       DECISION QUALITY & SCORING
    ===================================================== */
    const earnedXP =
        Number(selectedOption.xp || 0);

    state.missionXP += earnedXP;

    const maxQuestionXP =
        Math.max(
            ...question.options.map(
                option => Number(option.xp || 0)
            ),
            1
        );

    const decisionScore =
        Math.round(
            Math.min(
                100,
                (
                    earnedXP /
                    maxQuestionXP
                ) * 100
            )
        );

    state.score += decisionScore;

    /* =====================================================
       CORRECT / BEST DECISION
    ===================================================== */
    if (selectedOption.correct) {
        if (selectedButton) selectedButton.classList.add("correct");
        state.correctDecisions += 1;
    } else {
        if (selectedButton) selectedButton.classList.add("incorrect");

        const correctIndex =
            question.options.findIndex(
                option =>
                    option.correct
            );

        if (allButtons[correctIndex]) {
            allButtons[correctIndex].classList.add(
                "correct"
            );
        }
    }

    /* Trigger Fire Simulation Consequence */
    if (state.currentMission === "fire") {
        FireSimulationEngine.showConsequence(selectedIndex, Boolean(selectedOption.correct), earnedXP, selectedOption.feedback);
    }

    /* Record decision log for final mission debrief */
    const correctOption =
        question.options.find(
            option =>
                option.correct
        );

    if (!state.missionDecisionsLog) {
        state.missionDecisionsLog = [];
    }

    state.missionDecisionsLog.push({
        index: state.currentDecision,
        situation: question.situation,
        chosenText: selectedOption.text,
        earnedXP: earnedXP,
        isCorrect: Boolean(selectedOption.correct),
        consequence: selectedOption.feedback,
        correctText: correctOption ? correctOption.text : "",
        correctFeedback: correctOption ? correctOption.feedback : "",
        isTimeout: false
    });

    /* =====================================================
       SHOW COMPACT IN-SIMULATION FEEDBACK
    ===================================================== */
    showDecisionFeedback(
        selectedOption,
        correctOption,
        selectedOption.correct,
        false
    );

    /* =====================================================
       UPDATE UI
    ===================================================== */
    updateAllUI();
    saveProgress();
}

/* =========================================================
   COMPACT IN-SIMULATION FEEDBACK
   ========================================================= */

function showDecisionFeedback(
    selectedOption,
    correctOption,
    isCorrect,
    isTimeout = false
) {
    const feedback =
        $("decisionFeedback");

    if (!feedback) {
        return;
    }

    feedback.classList.remove(
        "hidden",
        "tactical-safe",
        "tactical-partial",
        "tactical-danger"
    );

    let tagText = "OPTIMAL ACTION";
    let tagClass = "tag-safe";
    let icon = "✓";
    let feedbackClass = "tactical-safe";
    let outcomeText = "OPTIMAL RESPONSE";

    const earned = selectedOption ? Number(selectedOption.xp || 0) : 0;

    if (isTimeout) {
        tagText = "TIME EXPIRED";
        tagClass = "tag-danger";
        icon = "⏱";
        feedbackClass = "tactical-danger";
        outcomeText = "TIME EXPIRED";
    } else if (isCorrect) {
        tagText = "OPTIMAL ACTION";
        tagClass = "tag-safe";
        icon = "✓";
        feedbackClass = "tactical-safe";
        outcomeText = "OPTIMAL RESPONSE";
    } else if (earned > 0) {
        tagText = "PARTIALLY EFFECTIVE";
        tagClass = "tag-partial";
        icon = "⚡";
        feedbackClass = "tactical-partial";
        outcomeText = "PARTIALLY SAFE";
    } else {
        tagText = "HIGH RISK";
        tagClass = "tag-danger";
        icon = "⚠";
        feedbackClass = "tactical-danger";
        outcomeText = "RISKY RESPONSE";
    }

    feedback.classList.add(feedbackClass);

    // One short sentence consequence
    let shortConsequence = "";
    if (isTimeout) {
        shortConsequence = "Delay in an active hazard increases exposure to spreading danger.";
    } else if (selectedOption && selectedOption.feedback) {
        const sentences = selectedOption.feedback.split(/(?<=[.?!])\s+/);
        shortConsequence = sentences[0] || selectedOption.feedback;
    }

    const xpImpactColor = isCorrect
        ? "var(--green)"
        : (earned > 0 ? "var(--orange)" : "var(--red)");

    feedback.innerHTML = `
        <div class="feedback-icon">
            ${icon}
        </div>

        <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 2px;">
                <span class="feedback-tag ${tagClass}">DECISION RECORDED</span>
                <span style="font-size: 10px; font-weight: 700; color: var(--text);"><strong style="color: var(--muted); font-size: 9px;">OUTCOME:</strong> ${outcomeText}</span>
                <span style="font-size: 10px; font-weight: 800; color: ${xpImpactColor}; margin-left: auto;">+${earned} XP</span>
            </div>

            <div style="font-size: 11px; color: var(--text); line-height: 1.4; margin-top: 4px;">
                <strong style="font-size: 9px; color: var(--muted); letter-spacing: 0.5px;">IMMEDIATE CONSEQUENCE:</strong>
                ${shortConsequence}
            </div>
        </div>

        <button
            id="nextDecision"
            class="next-button"
        >
            CONTINUE →
        </button>
    `;

    const nextButton =
        $("nextDecision");

    if (nextButton) {
        nextButton.onclick =
            nextDecision;
    }
}


/* =========================================================
   NEXT DECISION
   ========================================================= */

function nextDecision() {

    if (!state.answered) {
        return;
    }

    const mission =
        missions[state.currentMission];

    if (mission && state.currentDecision + 1 < mission.questions.length) {
        state.currentDecision += 1;
        state.answered = false;
        renderSimulation();
    } else {
        finishMission();
    }

}


/* =========================================================
   EXIT CURRENT MISSION
   ========================================================= */

function quitCurrentMission() {

    PlayableFireSimulation.destroy();
    clearSimulationDecisionTimer();
    clearCinematicTimer();

    state.currentMission =
        null;

    state.currentDecision =
        0;

    state.score =
        0;

    state.missionXP =
        0;

    state.answered =
        false;

    state.completionRecorded =
        false;


    showPage(
        dashboardPage
    );


    switchSection(
        "dashboard"
    );

}
/* =========================================================
   READYVERSE — MISSION COMPLETION + RESULTS
   ========================================================= */

/* =========================================================
   FINISH MISSION
   ========================================================= */

function finishMission() {

    PlayableFireSimulation.destroy();
    clearSimulationDecisionTimer();

    const mission =
        missions[state.currentMission];

    if (!mission) {
        return;
    }


    const totalQuestions =
        mission.questions.length;


    const maximumScore =
        totalQuestions * 100;


    /* =====================================================
       FINAL SCORE
       ===================================================== */

    const percentage =
        Math.round(
            (state.score / maximumScore) * 100
        );


    /* Check whether this was the first completion */
    const isFirstCompletion =
        !state.completedMissionIds.has(
            state.currentMission
        );


    /* Always award earned mission XP to total XP */
    state.totalXP +=
        state.missionXP;


    /* Register mission ID */
    state.completedMissionIds.add(
        state.currentMission
    );

    /* Update total completed missions count dynamically */
    state.completedMissions = state.completedMissionIds.size;

    /* =====================================================
       PERFORMANCE GRADE & INDEPENDENT MISSION TRACKING
       ===================================================== */

    let grade = "C";
    if (percentage >= 95) grade = "A+";
    else if (percentage >= 80) grade = "A";
    else if (percentage >= 65) grade = "B";

    if (!state.missionBestScores) state.missionBestScores = {};
    if (!state.missionBestGrades) state.missionBestGrades = {};

    const prevBest = state.missionBestScores[state.currentMission] || 0;
    if (percentage >= prevBest) {
        state.missionBestScores[state.currentMission] = percentage;
        state.missionBestGrades[state.currentMission] = grade;
    }

    /* =====================================================
       DYNAMIC WEIGHTED READINESS REWARD
       ===================================================== */

    calculateReadiness();


    /* =====================================================
       DAILY STREAK RECORDING
       ===================================================== */

    recordDailyActivity();


    /* =====================================================
       SAVE RESULT OF CURRENT ATTEMPT
       ===================================================== */

    const timeRemainingSecs = Math.max(0, missionTimeRemaining);
    const timeTotalSecs = missionTimeTotal || getMissionTotalDuration(state.currentMission);
    const timeUsedSecs = Math.max(0, timeTotalSecs - timeRemainingSecs);

    state.lastResult = {

        missionName:
            state.currentMission,

        score:
            percentage,

        xp:
            state.missionXP,

        decisions:
            totalQuestions,

        firstCompletion:
            isFirstCompletion,

        timeRemaining:
            timeRemainingSecs,

        timeTotal:
            timeTotalSecs,

        timeUsed:
            timeUsedSecs,

        decisionsLog:
            [...(state.missionDecisionsLog || [])]

    };


    /* =====================================================
       PERFORMANCE HISTORY LOGGING
       ===================================================== */

    if (!state.performanceHistory) state.performanceHistory = [];

    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dateString = getLocalDateString(now);

    state.performanceHistory.unshift({
        id: "log_" + Date.now(),
        date: dateString,
        time: timeString,
        missionId: state.currentMission,
        missionTitle: mission.title || state.currentMission,
        score: percentage,
        grade: grade,
        xpEarned: state.missionXP,
        totalXPSnapshot: state.totalXP,
        readinessSnapshot: state.readiness
    });

    if (state.performanceHistory.length > 20) {
        state.performanceHistory = state.performanceHistory.slice(0, 20);
    }


    /* =====================================================
       CHECK & CELEBRATE ACHIEVEMENTS
       ===================================================== */

    checkAndToastNewAchievements();


    saveProgress();


    /* =====================================================
       MARK COMPLETION STATE
       ===================================================== */

    state.completionRecorded =
        true;


    /* =====================================================
       UPDATE ALL UI
       ===================================================== */

    updateAllUI();


    /* =====================================================
       RENDER RESULT
       ===================================================== */

    renderResult();


    /* =====================================================
       SHOW RESULT PAGE
       ===================================================== */

    showPage(
        resultPage
    );


    /* =====================================================
       CONSOLE INFORMATION
       ===================================================== */

    rvLog("Mission:", mission.title);

    rvLog("Score:", percentage + "%");

    rvLog("Attempt XP:", state.missionXP);

    rvLog("First completion:", isFirstCompletion);

    rvLog("Total XP:", state.totalXP);

    rvLog("Readiness:", state.readiness);

}


/* =========================================================
   SHARE SCORECARD & FRIEND CHALLENGE SYSTEM (PROMPT 4)
   ========================================================= */

/**
 * Privacy-first student first name extractor.
 * NEVER exposes last name, phone, email, college, or notes.
 */
function getStudentFirstName() {
    try {
        let raw = "";
        if (typeof state !== "undefined" && state) {
            const prepName = state.prepProfile && state.prepProfile.name;
            const respName = state.responderProfile && state.responderProfile.name;
            if (prepName && prepName !== "Student" && prepName !== "Trainee" && prepName !== "Responder") {
                raw = prepName;
            } else if (respName && respName !== "Student" && respName !== "Trainee" && respName !== "Responder") {
                raw = respName;
            } else {
                raw = prepName || respName || "Student";
            }
        }
        const clean = String(raw || "").trim();
        if (!clean || clean.toLowerCase() === "student" || clean.toLowerCase() === "trainee" || clean.toLowerCase() === "responder" || clean.toLowerCase() === "you") {
            return "Student";
        }
        const first = clean.split(/\s+/)[0];
        const filtered = first.replace(/[^\p{L}\p{N}._-]/gu, "");
        return filtered || "Student";
    } catch (e) {
        return "Student";
    }
}

/**
 * Extracts data required for share card and challenge link.
 */
function getDrillShareData(drillKey) {
    const firstName = getStudentFirstName();
    const streak = (typeof state !== "undefined" && state.dailyStreak) ? state.dailyStreak : 1;

    if (drillKey === "daily" || (!state.lastResult && typeof dailyDrillSession !== "undefined" && dailyDrillSession.isFinished)) {
        const correct = (typeof dailyDrillSession !== "undefined" && dailyDrillSession.correctCount !== undefined)
            ? dailyDrillSession.correctCount
            : 3;
        const scoreNum = Math.round((correct / 3) * 100);
        let grade = "A";
        if (correct === 3) grade = "A+";
        else if (correct === 2) grade = "A";
        else if (correct === 1) grade = "B";
        else grade = "C";

        return {
            firstName,
            drillId: "daily",
            drillName: "60-Second Daily Drill",
            drillEmoji: "⚡",
            grade,
            scoreNum,
            scoreDisplay: `${scoreNum}%`,
            streak
        };
    }

    const missionKey = (state.lastResult && state.lastResult.missionName) || state.currentMission || "fire";
    const missionDef = (typeof missions !== "undefined" && missions[missionKey]) ? missions[missionKey] : null;
    const drillName = missionDef ? missionDef.title : "Disaster Drill";
    let drillEmoji = "🔥";
    if (missionKey === "flood") drillEmoji = "🌊";
    else if (missionKey === "cyclone") drillEmoji = "🌪️";
    else if (missionKey === "earthquake") drillEmoji = "🌍";

    const scoreNum = (state.lastResult && typeof state.lastResult.score === "number") ? state.lastResult.score : 85;
    let grade = "A";
    if (scoreNum >= 95) grade = "A+";
    else if (scoreNum >= 80) grade = "A";
    else if (scoreNum >= 65) grade = "B";
    else grade = "C";

    return {
        firstName,
        drillId: missionKey,
        drillName,
        drillEmoji,
        grade,
        scoreNum,
        scoreDisplay: `${scoreNum}%`,
        streak
    };
}

/**
 * Robust cross-browser rounded rectangle drawing helper for Canvas 2D
 */
function drawRoundRect(ctx, x, y, width, height, radius) {
    if (!ctx) return;
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Generates an HD 1080x1080 pure Canvas Scorecard with zero external libraries.
 */
function generateDrillShareCard(options = {}) {
    const data = Object.assign({}, getDrillShareData(options.drillId || options.drillKey), options);
    const canvas = options.targetCanvas || (typeof document !== "undefined" ? document.createElement("canvas") : null);
    if (!canvas) return null;

    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    // 1. Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    bgGrad.addColorStop(0, "#090D16");
    bgGrad.addColorStop(0.5, "#13112E");
    bgGrad.addColorStop(1, "#0F172A");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Decorative ambient glow
    ctx.save();
    try {
        ctx.filter = "blur(60px)";
    } catch (_) {}
    ctx.fillStyle = "rgba(108, 76, 241, 0.28)";
    ctx.beginPath();
    ctx.arc(880, 200, 160, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(6, 182, 212, 0.18)";
    ctx.beginPath();
    ctx.arc(200, 880, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Outer card border
    drawRoundRect(ctx, 32, 32, 1016, 1016, 36);
    ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // 2. Header Bar (Top)
    // R Logo Badge
    drawRoundRect(ctx, 72, 72, 64, 64, 16);
    ctx.fillStyle = "#6C4CF1";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 40px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", 104, 104);

    // Header Titles
    ctx.textAlign = "left";
    ctx.font = "bold 32px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("READYVERSE", 152, 94);

    ctx.font = "700 13px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("CAMPUS DISASTER READINESS", 154, 122);

    // Verified Drill Pill (Right)
    drawRoundRect(ctx, 760, 78, 248, 52, 26);
    ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "#22C55E";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#34D399";
    ctx.font = "bold 17px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("✔ VERIFIED DRILL", 884, 104);

    // Divider Line
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(72, 160);
    ctx.lineTo(1008, 160);
    ctx.stroke();

    // 3. Student Title & Drill Section
    const firstName = String(data.firstName || "Student").toUpperCase();
    ctx.textAlign = "left";
    ctx.fillStyle = "#A78BFA";
    ctx.font = "bold 22px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(`${firstName}'S CRISIS RESPONSE SCORECARD`, 72, 210);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 48px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.fillText(`${data.drillEmoji || "🔥"} ${data.drillName || "Emergency Drill"}`, 72, 275);

    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 20px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Emergency Decision-Making & Life-Safety Protocols", 72, 318);

    // 4. Score & Grade Center Box
    drawRoundRect(ctx, 72, 360, 936, 390, 28);
    ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Left Side: Grade Badge
    const grade = String(data.grade || "A");
    let gradeGrad = ctx.createLinearGradient(160, 430, 360, 630);
    if (grade === "A+") {
        gradeGrad.addColorStop(0, "#F59E0B");
        gradeGrad.addColorStop(1, "#D97706");
    } else if (grade === "A") {
        gradeGrad.addColorStop(0, "#22C55E");
        gradeGrad.addColorStop(1, "#16A34A");
    } else if (grade === "B") {
        gradeGrad.addColorStop(0, "#06B6D4");
        gradeGrad.addColorStop(1, "#0284C7");
    } else {
        gradeGrad.addColorStop(0, "#F97316");
        gradeGrad.addColorStop(1, "#EA580C");
    }

    drawRoundRect(ctx, 160, 430, 200, 200, 36);
    ctx.fillStyle = gradeGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 92px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.fillText(grade, 260, 530);

    ctx.fillStyle = "#CBD5E1";
    ctx.font = "bold 16px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("PERFORMANCE GRADE", 260, 670);

    // Inner Vertical Separator Line
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(430, 400);
    ctx.lineTo(430, 710);
    ctx.stroke();

    // Right Side: Score & Streak
    ctx.textAlign = "left";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "bold 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("ACCURACY & READINESS", 480, 435);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 82px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.fillText(`${data.scoreNum}%`, 480, 520);

    // Streak Pill
    drawRoundRect(ctx, 480, 560, 360, 60, 30);
    ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#FBBF24";
    ctx.font = "bold 23px 'Inter', system-ui, -apple-system, sans-serif";
    const streakCount = Number(data.streak || 1);
    ctx.fillText(`🔥 ${streakCount} DAY STREAK`, 660, 597);

    ctx.textAlign = "left";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 18px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Verified student crisis response instincts", 480, 672);

    // 5. Call to Action Banner (Bottom)
    drawRoundRect(ctx, 72, 780, 936, 126, 24);
    const ctaGrad = ctx.createLinearGradient(72, 780, 1008, 906);
    ctaGrad.addColorStop(0, "#6C4CF1");
    ctaGrad.addColorStop(1, "#4F46E5");
    ctx.fillStyle = ctaGrad;
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 34px 'Space Grotesk', system-ui, -apple-system, sans-serif";
    ctx.fillText("BEAT MY SCORE ON READYVERSE!", 540, 832);

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "600 20px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("Can you make the right crisis decisions under pressure?", 540, 874);

    // 6. Footer
    ctx.fillStyle = "#818CF8";
    ctx.font = "bold 24px 'Space Grotesk', monospace, sans-serif";
    ctx.fillText("https://readyverse.netlify.app", 540, 955);

    ctx.fillStyle = "#64748B";
    ctx.font = "500 15px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText("NDMA · NIDM · UNDRR Aligned · Student Emergency Training Platform", 540, 990);

    return canvas;
}

/**
 * Handles Web Share API with file attachment and gracefully falls back to PNG download & copy link.
 */
async function shareScoreCard(drillKey) {
    const drillInfo = getDrillShareData(drillKey);
    const appUrl = "https://readyverse.netlify.app";
    const challengeUrl = `${appUrl}/?drill=${encodeURIComponent(drillInfo.drillId)}&challenge=${encodeURIComponent(drillInfo.scoreNum)}`;
    const shareText = `I scored ${drillInfo.scoreDisplay} in ${drillInfo.drillName} on ReadyVerse! Can you beat my score?`;

    let canvas = $("drillShareCanvas");
    if (!canvas || drillKey === "daily") {
        canvas = generateDrillShareCard(drillInfo);
    } else {
        generateDrillShareCard(Object.assign({ targetCanvas: canvas }, drillInfo));
    }

    if (canvas && typeof canvas.toBlob === "function") {
        canvas.toBlob(async (blob) => {
            if (blob && typeof navigator !== "undefined" && navigator.share) {
                const fileName = `readyverse-score-${drillInfo.firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`;
                let file = null;
                try {
                    file = new File([blob], fileName, { type: "image/png" });
                } catch (e) {
                    file = null;
                }

                if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: "ReadyVerse Crisis Drill Scorecard",
                            text: shareText,
                            url: challengeUrl,
                            files: [file]
                        });
                        showToast("Scorecard shared successfully!", "🎉");
                        return;
                    } catch (err) {
                        if (err && err.name === "AbortError") return;
                    }
                }

                // Fallback to text & URL share
                try {
                    await navigator.share({
                        title: "ReadyVerse Crisis Drill Scorecard",
                        text: shareText,
                        url: challengeUrl
                    });
                    showToast("Scorecard link shared!", "🎉");
                    return;
                } catch (err) {
                    if (err && err.name === "AbortError") return;
                }
            }

            // Fallback: download PNG and copy challenge link
            fallbackDownloadAndCopy(canvas, drillInfo, challengeUrl);
        }, "image/png");
    } else {
        fallbackDownloadAndCopy(canvas, drillInfo, challengeUrl);
    }
}

/**
 * Creates and shares/copies a challenge link ?drill=<id>&challenge=<score>
 */
async function challengeFriend(drillKey) {
    const drillInfo = getDrillShareData(drillKey);
    const appUrl = "https://readyverse.netlify.app";
    const challengeUrl = `${appUrl}/?drill=${encodeURIComponent(drillInfo.drillId)}&challenge=${encodeURIComponent(drillInfo.scoreNum)}`;
    const shareText = `I scored ${drillInfo.scoreDisplay} in ${drillInfo.drillName} on ReadyVerse! Can you beat my score? Play here:`;

    if (typeof navigator !== "undefined" && navigator.share) {
        try {
            await navigator.share({
                title: "ReadyVerse Crisis Drill Challenge",
                text: shareText,
                url: challengeUrl
            });
            showToast("Challenge sent!", "⚔️");
            return;
        } catch (err) {
            if (err && err.name === "AbortError") return;
        }
    }

    // Fallback: copy link to clipboard
    copyTextToClipboard(challengeUrl, "Challenge link copied to clipboard! Send it to a friend.", "🔗");
}

/**
 * Direct download of PNG scorecard image.
 */
function downloadShareCard(drillKey) {
    const drillInfo = getDrillShareData(drillKey);
    let canvas = $("drillShareCanvas");
    if (!canvas || drillKey === "daily") {
        canvas = generateDrillShareCard(drillInfo);
    } else {
        generateDrillShareCard(Object.assign({ targetCanvas: canvas }, drillInfo));
    }
    if (canvas && typeof canvas.toDataURL === "function") {
        try {
            const dataUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.download = `ReadyVerse-Score-${drillInfo.firstName.replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
            a.href = dataUrl;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast("Scorecard PNG downloaded!", "💾");
        } catch (e) {
            showToast("Could not download image", "⚠️");
        }
    }
}

/**
 * Helper to copy challenge link directly to clipboard.
 */
function copyChallengeLinkOnly(drillKey) {
    const drillInfo = getDrillShareData(drillKey);
    const appUrl = "https://readyverse.netlify.app";
    const challengeUrl = `${appUrl}/?drill=${encodeURIComponent(drillInfo.drillId)}&challenge=${encodeURIComponent(drillInfo.scoreNum)}`;
    copyTextToClipboard(challengeUrl, "Challenge link copied to clipboard!", "🔗");
}

/**
 * Fallback to auto-download image and copy link when Web Share API is unavailable.
 */
function fallbackDownloadAndCopy(canvas, drillInfo, challengeUrl) {
    if (canvas && typeof canvas.toDataURL === "function") {
        try {
            const dataUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            a.download = `ReadyVerse-Score-${drillInfo.firstName.replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
            a.href = dataUrl;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.warn("Card download fallback warning:", e);
        }
    }
    copyTextToClipboard(challengeUrl, "Scorecard image saved & challenge link copied!", "📥");
}

/**
 * Generic clipboard copy helper with toast notification.
 */
function copyTextToClipboard(text, successMessage = "Link copied to clipboard!", icon = "🔗") {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMessage, icon);
        }).catch(() => {
            fallbackExecCopy(text, successMessage, icon);
        });
    } else {
        fallbackExecCopy(text, successMessage, icon);
    }
}

function fallbackExecCopy(text, successMessage, icon) {
    try {
        if (typeof document === "undefined") return;
        const temp = document.createElement("textarea");
        temp.value = text;
        temp.style.position = "fixed";
        temp.style.left = "-9999px";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
        showToast(successMessage, icon);
    } catch (e) {
        showToast("Challenge link ready!", icon);
    }
}

/**
 * Detects incoming friend challenge query params (?challenge=<score>&drill=<id>)
 */
function checkIncomingChallenge() {
    try {
        if (typeof window === "undefined" || !window.location) return;
        const urlParams = new URLSearchParams(window.location.search);
        const challengeParam = urlParams.get("challenge");
        const drillParam = urlParams.get("drill");

        if (challengeParam !== null && challengeParam !== "") {
            const scoreNum = parseInt(challengeParam, 10);
            if (!isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= 100) {
                const targetDrill = (drillParam && (missions[drillParam] || drillParam === "daily")) ? drillParam : "fire";
                const challengeObj = {
                    score: scoreNum,
                    drillId: targetDrill,
                    active: true
                };
                if (typeof state !== "undefined") {
                    state.activeChallenge = challengeObj;
                }
                if (typeof sessionStorage !== "undefined") {
                    sessionStorage.setItem("readyverse_active_challenge", JSON.stringify(challengeObj));
                }
                renderChallengeBanners(challengeObj);
            }
        } else if (typeof sessionStorage !== "undefined") {
            const saved = sessionStorage.getItem("readyverse_active_challenge");
            if (saved) {
                const challengeObj = JSON.parse(saved);
                if (challengeObj && challengeObj.active) {
                    if (typeof state !== "undefined") state.activeChallenge = challengeObj;
                    renderChallengeBanners(challengeObj);
                }
            }
        }
    } catch (e) {
        rvLog("Challenge parse warning:", e);
    }
}

/**
 * Renders the Home hero challenge banner when an active challenge exists.
 */
function renderChallengeBanners(challengeObj) {
    const challenge = challengeObj || (typeof state !== "undefined" ? state.activeChallenge : null);
    const homeBanner = $("homeChallengeBanner");
    if (!challenge || !challenge.active) {
        if (homeBanner) homeBanner.classList.add("hidden");
        return;
    }

    const drillDef = (typeof missions !== "undefined" && missions[challenge.drillId]) ? missions[challenge.drillId] : null;
    const drillTitle = challenge.drillId === "daily" ? "60-Second Daily Drill" : (drillDef ? drillDef.title : "Emergency Drill");
    const drillEmoji = challenge.drillId === "daily" ? "⚡" : (drillDef ? drillDef.icon : "🔥");

    if (homeBanner) {
        homeBanner.innerHTML = `
            <div class="home-challenge-pill">
                <span class="challenge-trophy">🏆</span>
                <div class="challenge-banner-info">
                    <strong class="challenge-title">FRIEND CHALLENGE ACTIVE</strong>
                    <p class="challenge-desc">A classmate scored <strong>${challenge.score}%</strong> in <strong>${drillEmoji} ${drillTitle}</strong>. Can you beat their instincts?</p>
                </div>
                <button type="button" class="primary-small-button challenge-accept-btn" onclick="acceptFriendChallenge('${challenge.drillId}')">
                    ACCEPT CHALLENGE →
                </button>
            </div>
        `;
        homeBanner.classList.remove("hidden");
    }
}

/**
 * Launches the challenged drill from the Home hero banner.
 */
function acceptFriendChallenge(drillId) {
    if (drillId === "daily") {
        startDailyDrill();
    } else if (typeof missions !== "undefined" && missions[drillId]) {
        openMissionBriefing(drillId);
    } else {
        openMissionBriefing("fire");
    }
}


/* =========================================================
   RENDER RESULT & MISSION DEBRIEF
   ========================================================= */

function renderResult() {

    if (
        !resultPage ||
        !state.lastResult
    ) {

        return;

    }


    const mission =
        missions[
            state.lastResult.missionName
        ];


    const percentage =
        state.lastResult.score;


    /* =====================================================
       EXISTING RESULT ELEMENTS
    ===================================================== */

    const resultScore =
        $("resultScore");


    const resultXP =
        $("resultXP");


    const resultDecisions =
        $("resultDecisions");

    const resultTimeRemaining =
        $("resultTimeRemaining");


    const resultMessage =
        $("resultMessage");


    /* =====================================================
       SCORE
    ===================================================== */

    if (resultScore) {

        resultScore.textContent =
            `${percentage}%`;

    }


    /* =====================================================
       XP
    ===================================================== */

    if (resultXP) {

        resultXP.textContent =
            `+${state.lastResult.xp}`;

    }


    /* =====================================================
       DECISIONS
    ===================================================== */

    if (resultDecisions) {

        resultDecisions.textContent =
            `${state.lastResult.decisions}/${state.lastResult.decisions}`;

    }

    /* =====================================================
       TIME REMAINING
    ===================================================== */

    if (resultTimeRemaining) {

        resultTimeRemaining.textContent =
            formatMissionTime(state.lastResult.timeRemaining || 0);

    }


    /* =====================================================
       AFTER-ACTION REVIEW (AAR) PERFORMANCE GRADE & STATUS
    ===================================================== */

    const aarGradeBadge =
        $("aarGradeBadge");

    const aarStatusPill =
        $("aarStatusPill");

    const resultHeading =
        $("resultHeading");

    const resultSubheading =
        $("resultSubheading");


    let grade = "A";
    let gradeClass = "grade-a";
    let statusText = "DRILL COMPLETED";
    let statusColor = "var(--green)";

    if (percentage >= 95) {
        grade = "A+";
        gradeClass = "grade-aplus";
        statusText = "EXEMPLARY CRISIS RESPONSE";
        statusColor = "var(--gold)";
        if (resultHeading) resultHeading.textContent = "Elite Response Ready.";
        if (resultSubheading) resultSubheading.textContent = `Exceptional life-safety choices made during ${mission.title}.`;
    } else if (percentage >= 80) {
        grade = "A";
        gradeClass = "grade-a";
        statusText = "RESPONSE READY";
        statusColor = "var(--green)";
        if (resultHeading) resultHeading.textContent = "Response Ready.";
        if (resultSubheading) resultSubheading.textContent = `Strong safety awareness and disciplined emergency priorities during ${mission.title}.`;
    } else if (percentage >= 65) {
        grade = "B";
        gradeClass = "grade-b";
        statusText = "BASIC PREPAREDNESS / MORE PRACTICE RECOMMENDED";
        statusColor = "var(--cyan)";
        if (resultHeading) resultHeading.textContent = "Drill Completed.";
        if (resultSubheading) resultSubheading.textContent = `Adequate baseline response with opportunities for safety improvement.`;
    } else {
        grade = "C";
        gradeClass = "grade-c";
        statusText = "SAFETY REVIEW RECOMMENDED";
        statusColor = "var(--orange)";
        if (resultHeading) resultHeading.textContent = "Debrief Required.";
        if (resultSubheading) resultSubheading.textContent = `Review recommended emergency actions in Learn Hub before trying again.`;
    }

    if (aarGradeBadge) {
        aarGradeBadge.textContent = grade;
        aarGradeBadge.className = `grade-badge ${gradeClass}`;
    }

    if (aarStatusPill) {
        aarStatusPill.textContent = statusText;
        aarStatusPill.style.color = statusColor;
        aarStatusPill.style.borderColor = statusColor;
    }


    /* Show celebratory toast notification */
    showToast(`Simulation Complete: +${state.lastResult.xp} XP Earned (Grade ${grade})`, "🏆");

    if (percentage >= 95 && typeof triggerCelebration === "function") {
        triggerCelebration("perfect_drill", { drillName: mission ? mission.title : "Disaster Drill" });
    }


    /* =====================================================
       RESULT MESSAGE & DEBRIEF
    ===================================================== */

    if (resultMessage) {

        if (percentage >= 95) {
            resultMessage.textContent =
                `Flawless emergency response. You made optimal life-safety choices under pressure, minimizing secondary disaster hazards throughout ${mission.title}.`;
        } else if (percentage >= 80) {
            resultMessage.textContent =
                `Strong performance. You demonstrated high situational awareness and prioritized rapid life-safety choices during ${mission.title}.`;
        } else if (percentage >= 65) {
            resultMessage.textContent =
                `Good start. Review suboptimal decision points to improve response confidence and safety actions in future drills.`;
        } else {
            resultMessage.textContent =
                `Drill debrief: Several high-risk decisions were made. Review the emergency response guides in the Learn Hub before re-entering this scenario.`;
        }

    }


    /* =====================================================
       CHALLENGE OUTCOME BANNER (IF ACTIVE)
    ===================================================== */
    const resChallengeBanner = $("resultChallengeBanner");
    if (resChallengeBanner) {
        if (state.activeChallenge && state.activeChallenge.active) {
            const targetScore = Number(state.activeChallenge.score);
            const userScore = Number(percentage);
            let outcomeClass = "challenge-outcome-won";
            let outcomeIcon = "🎉";
            let outcomeTitle = "CHALLENGE WON!";
            let outcomeSub = `You scored ${userScore}%, beating your friend's score of ${targetScore}%. Exceptional crisis leadership!`;

            if (userScore === targetScore) {
                outcomeClass = "challenge-outcome-tied";
                outcomeIcon = "🤝";
                outcomeTitle = "CHALLENGE TIED!";
                outcomeSub = `You matched your friend's score of ${targetScore}%. Both of you demonstrated solid safety discipline!`;
            } else if (userScore < targetScore) {
                outcomeClass = "challenge-outcome-missed";
                outcomeIcon = "💪";
                outcomeTitle = "CHALLENGE MISSED (SO CLOSE!)";
                outcomeSub = `You scored ${userScore}%, while your friend scored ${targetScore}%. Retry this drill to beat their record!`;
            }

            resChallengeBanner.className = `challenge-outcome-banner ${outcomeClass}`;
            resChallengeBanner.innerHTML = `
                <div class="challenge-outcome-icon">${outcomeIcon}</div>
                <div class="challenge-outcome-text">
                    <h4 class="challenge-outcome-headline">${outcomeTitle}</h4>
                    <p class="challenge-outcome-sub">${escapeHtml(outcomeSub)}</p>
                </div>
            `;
            resChallengeBanner.classList.remove("hidden");
        } else {
            resChallengeBanner.classList.add("hidden");
        }
    }


    /* =====================================================
       GENERATE LIVE SHARE SCORECARD CANVAS
    ===================================================== */
    const shareCanvas = $("drillShareCanvas");
    if (shareCanvas) {
        const drillShareData = getDrillShareData();
        generateDrillShareCard(Object.assign({ targetCanvas: shareCanvas }, drillShareData));
    }


    /* =====================================================
       WHY YOUR DECISIONS MATTER (EXPANDABLE DEBRIEF CARDS)
    ===================================================== */

    const debriefList = $("aarDecisionsList");
    if (debriefList) {
        const decisions = (state.lastResult.decisionsLog && state.lastResult.decisionsLog.length > 0)
            ? state.lastResult.decisionsLog
            : (mission && mission.questions ? mission.questions.map((q, idx) => {
                const opt = q.options.find(o => o.correct) || q.options[0];
                return {
                    index: idx,
                    situation: q.situation,
                    chosenText: opt.text,
                    earnedXP: opt.xp,
                    isCorrect: opt.correct,
                    consequence: opt.feedback,
                    correctText: opt.text,
                    correctFeedback: opt.feedback,
                    isTimeout: false
                };
            }) : []);

        if (decisions.length === 0) {
            debriefList.innerHTML = `<p style="color: var(--muted); font-size: 12px;">No decision logs recorded.</p>`;
        } else {
            debriefList.innerHTML = decisions.map((item, idx) => {
                const numStr = String(idx + 1).padStart(2, "0");
                let tagClass = "tag-safe";
                let tagText = "OPTIMAL ACTION";
                let cardStatusClass = "debrief-safe";
                let xpText = `+${item.earnedXP} XP`;
                
                if (item.isTimeout) {
                    tagClass = "tag-danger";
                    tagText = "TIME EXPIRED";
                    cardStatusClass = "debrief-danger";
                    xpText = "+0 XP";
                } else if (item.isCorrect) {
                    tagClass = "tag-safe";
                    tagText = "OPTIMAL ACTION";
                    cardStatusClass = "debrief-safe";
                } else if (Number(item.earnedXP) > 0) {
                    tagClass = "tag-partial";
                    tagText = "PARTIALLY EFFECTIVE";
                    cardStatusClass = "debrief-partial";
                } else {
                    tagClass = "tag-danger";
                    tagText = "HIGH RISK";
                    cardStatusClass = "debrief-danger";
                }

                return `
                    <div class="debrief-decision-card ${cardStatusClass}" data-index="${idx}">
                        <div class="debrief-decision-header" onclick="toggleDebriefCard(this)" role="button" tabindex="0" aria-expanded="false">
                            <div class="debrief-header-left">
                                <span class="debrief-num">DECISION ${numStr}</span>
                                <span class="debrief-title-text">${escapeHtml(item.situation || ("Decision " + numStr))}</span>
                            </div>
                            <div class="debrief-header-right">
                                <span class="feedback-tag ${tagClass}">${tagText}</span>
                                <span class="debrief-xp-badge">${xpText}</span>
                                <span class="debrief-expand-arrow">▼</span>
                            </div>
                        </div>
                        <div class="debrief-decision-body">
                            <div class="debrief-detail-row">
                                <span class="debrief-detail-label">YOUR ACTION:</span>
                                <span class="debrief-detail-val">${escapeHtml(item.chosenText || "No action recorded")}</span>
                            </div>
                            <div class="debrief-detail-row">
                                <span class="debrief-detail-label">IMMEDIATE CONSEQUENCE:</span>
                                <span class="debrief-detail-val">${escapeHtml(item.consequence || "Delay increases risk.")}</span>
                            </div>
                            <div class="debrief-educational-block">
                                <div class="debrief-edu-label">WHY THIS MATTERS / OPTIMAL PROTOCOL:</div>
                                <p class="debrief-edu-text"><strong>${escapeHtml(item.correctText || "")}</strong> — ${escapeHtml(item.correctFeedback || "")}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }


    /* =====================================================
       RESULT CONTINUATION PATHWAYS DYNAMIC SYNC
       ===================================================== */

    const missionKey = (state.lastResult && state.lastResult.missionName) || "fire";
    const missionDef = missions[missionKey];
    const missionName = missionDef ? missionDef.title : "Disaster";

    const pathLearnTitle = $("resultPathLearnTitle");
    const pathLearnDesc = $("resultPathLearnDesc");
    const pathPrepTitle = $("resultPathPrepTitle");
    const pathPrepDesc = $("resultPathPrepDesc");

    if (pathLearnTitle) pathLearnTitle.textContent = `Review ${missionName} Knowledge`;
    if (pathLearnDesc) pathLearnDesc.textContent = `Review core ${missionName} emergency protocols & quiz in Learn Hub.`;
    if (pathPrepTitle) pathPrepTitle.textContent = `Strengthen ${missionName} Plan`;
    if (pathPrepDesc) pathPrepDesc.textContent = `Record verified dorm & campus safety items for ${missionName}.`;

    /* =====================================================
       PROMPT 6: DRILL SOURCE CITATION (NDMA / NIDM / UNDRR)
       ===================================================== */
    const sourceInfo = (typeof ReadyVerseSources !== "undefined" && ReadyVerseSources.getDrillSource)
        ? ReadyVerseSources.getDrillSource(missionKey)
        : { shortCitation: "NDMA Guidelines on Disaster Safety", documentName: "National Disaster Management Guidelines", status: "VERIFIED" };

    const resSourceCitation = $("resultSourceCitation");
    const resSourceBadge = $("resultSourceBadge");
    if (resSourceCitation) {
        resSourceCitation.innerHTML = `<strong>Source:</strong> ${sourceInfo.documentName || sourceInfo.shortCitation}`;
    }
    if (resSourceBadge) {
        resSourceBadge.textContent = sourceInfo.status;
        resSourceBadge.className = `source-status-badge ${sourceInfo.status === "NEEDS REVIEW" ? "needs-review" : ""}`;
    }


    /* =====================================================
       RETRY BUTTON
       ===================================================== */

    const retryMission =
        $("retryMission");


    if (retryMission) {

        retryMission.onclick =
            () => {

                if (
                    state.currentMission
                ) {

                    startMission(
                        state.currentMission
                    );

                }

            };

    }


    /* =====================================================
       COMMAND CENTER BUTTON
    ===================================================== */

    const returnDashboard =
        $("returnDashboard");


    if (returnDashboard) {

        returnDashboard.onclick =
            () => {

                showPage(
                    dashboardPage
                );


                switchSection(
                    "dashboard"
                );

            };

    }

}

function toggleDebriefCard(headerElement) {
    if (!headerElement) return;
    const card = headerElement.closest(".debrief-decision-card");
    if (!card) return;
    const isExpanded = card.classList.toggle("expanded");
    headerElement.setAttribute("aria-expanded", isExpanded ? "true" : "false");
}



if (typeof window !== "undefined") {
    window.toggleDebriefCard = toggleDebriefCard;
}


/* =========================================================
   RESULT SCREEN LOG
   ========================================================= */

rvLog(
    "ReadyVerse result system loaded."
);
/* =========================================================
/* =========================================================
   DAILY STREAK UI SYNC
   ========================================================= */

function updateDailyStreakUI() {
    const today = getLocalDateString();
    const streakValue = $("streakValue");
    const streakDesc = $("streakDescription");
    const container = $("streakDaysContainer");

    let isCompletedToday = false;
    let effectiveStreak = 0;

    if (state.lastActivityDate) {
        const dayDiff = getCalendarDayDiff(state.lastActivityDate, today);
        if (dayDiff === 0) {
            isCompletedToday = true;
            effectiveStreak = state.dailyStreak || 1;
        } else if (dayDiff === 1) {
            isCompletedToday = false;
            effectiveStreak = state.dailyStreak || 0;
        } else {
            isCompletedToday = false;
            effectiveStreak = 0;
        }
    }

    if (streakValue) {
        streakValue.textContent = String(effectiveStreak).padStart(2, "0");
    }

    if (streakDesc) {
        if (isCompletedToday) {
            streakDesc.textContent = `Streak active today! ${effectiveStreak}-day streak secured.`;
        } else if (effectiveStreak > 0) {
            streakDesc.textContent = `Complete a drill today to reach ${effectiveStreak + 1} days.`;
        } else {
            streakDesc.textContent = "Complete a drill today to start your daily streak.";
        }
    }

    if (container) {
        const bubbles = [];
        const completedCount = isCompletedToday ? Math.min(effectiveStreak, 7) : Math.min(effectiveStreak, 6);

        for (let i = 0; i < 6; i++) {
            if (i < completedCount) {
                bubbles.push('<span class="done">✓</span>');
            } else {
                bubbles.push('<span>-</span>');
            }
        }

        if (isCompletedToday) {
            bubbles.push('<span class="done">✓</span>');
        } else {
            bubbles.push('<span class="today">⚡</span>');
        }

        container.innerHTML = bubbles.join("");
    }
}


/* =========================================================
   STAGE 5 — HOME SCREEN PRIMARY CTA & DYNAMIC NEXT STEP ENGINE
   ========================================================= */

let currentHomePrimaryAction = null;
let currentDynamicNextStep = null;

function getHomePrimaryDrillAction(currentState = state) {
    const order = ["fire", "flood", "cyclone", "earthquake"];
    const titles = {
        fire: "Building Fire",
        flood: "Flash Flood",
        cyclone: "Cyclone",
        earthquake: "Earthquake"
    };
    const icons = {
        fire: "🔥",
        flood: "🌊",
        cyclone: "🌪️",
        earthquake: "🌍"
    };

    const completed = currentState.completedMissionIds || new Set();
    const hasHas = completed && typeof completed.has === "function";
    const isArr = Array.isArray(completed);
    const completedCount = hasHas ? completed.size : (isArr ? completed.length : 0);

    // 1. If no drill is completed: "Start your first drill: Building Fire"
    if (completedCount === 0) {
        return {
            target: "fire",
            icon: "🔥",
            title: "Building Fire",
            label: "Start your first drill: Building Fire",
            isReplay: false
        };
    }

    // 2. Otherwise: first not-yet-completed drill in order Fire, Flood, Cyclone, Earthquake
    for (const m of order) {
        const isDone = hasHas ? completed.has(m) : (isArr && completed.includes(m));
        if (!isDone) {
            const mTitle = missions[m]?.title || titles[m] || m;
            const mIcon = missions[m]?.icon || icons[m] || "⚡";
            return {
                target: m,
                icon: mIcon,
                title: mTitle,
                label: `Start next drill: ${mTitle}`,
                isReplay: false
            };
        }
    }

    // 3. If all four are completed: the drill with lowest best accuracy
    let lowestDrill = "fire";
    let lowestScore = 101;
    let allAtLeast80 = true;

    for (const m of order) {
        const score = (currentState.missionBestScores && typeof currentState.missionBestScores[m] === "number")
            ? currentState.missionBestScores[m]
            : 0;
        if (score < 80) {
            allAtLeast80 = false;
        }
        if (score < lowestScore) {
            lowestScore = score;
            lowestDrill = m;
        }
    }

    // If every best accuracy is 80% or higher: "Replay a drill"
    if (allAtLeast80) {
        return {
            target: lowestDrill,
            icon: missions[lowestDrill]?.icon || icons[lowestDrill] || "⚡",
            title: missions[lowestDrill]?.title || titles[lowestDrill] || lowestDrill,
            label: "Replay a drill",
            isReplay: true
        };
    }

    const lowTitle = missions[lowestDrill]?.title || titles[lowestDrill] || lowestDrill;
    const lowIcon = missions[lowestDrill]?.icon || icons[lowestDrill] || "⚡";
    return {
        target: lowestDrill,
        icon: lowIcon,
        title: lowTitle,
        label: `Improve your drill: ${lowTitle} (${lowestScore}% accuracy)`,
        isReplay: true
    };
}

function executeHomePrimaryAction() {
    const action = currentHomePrimaryAction || getHomePrimaryDrillAction(state);
    if (!action || !action.target) return;
    openMissionBriefing(action.target);
}

/* =========================================================
   ⚡ 60-SECOND DAILY DRILL ENGINE
   ========================================================= */

let dailyDrillSession = {
    date: "",
    decisions: [],
    currentIndex: 0,
    answers: [],
    score: 0,
    correctCount: 0,
    timerRemaining: 60,
    timerInterval: null,
    isActive: false,
    isFinished: false,
    answeredCurrent: false
};

function getDailyDrillDecisions(dateStr) {
    const todayStr = dateStr || (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.getLocalDateString === "function"
        ? ReadyVerseProgress.getLocalDateString()
        : (typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().slice(0, 10)));

    let hash = 0;
    for (let i = 0; i < todayStr.length; i++) {
        hash = ((hash << 5) - hash) + todayStr.charCodeAt(i);
        hash |= 0;
    }
    const seed = Math.abs(hash);

    const allDecisions = [];
    const missionKeys = ["fire", "flood", "cyclone", "earthquake"];
    missionKeys.forEach(mKey => {
        const m = missions[mKey];
        if (m && m.questions) {
            m.questions.forEach((q, idx) => {
                allDecisions.push({
                    drillId: mKey,
                    drillTitle: m.title,
                    drillIcon: m.icon || "⚡",
                    questionIndex: idx,
                    question: q
                });
            });
        }
    });

    const total = allDecisions.length; // 32
    if (total === 0) return [];

    const idx1 = seed % total;
    const idx2 = (seed + 11) % total;
    const idx3 = (seed + 23) % total;

    const chosenIndices = [idx1];
    if (chosenIndices.includes(idx2)) chosenIndices.push((idx2 + 1) % total);
    else chosenIndices.push(idx2);

    let third = idx3;
    while (chosenIndices.includes(third)) third = (third + 1) % total;
    chosenIndices.push(third);

    return chosenIndices.map(i => allDecisions[i]);
}

function getDailyDrillLessonTakeaway(decisions) {
    if (!decisions || !decisions.length) return "Always prioritize safety, avoid panic, and follow marked evacuation paths.";
    const keyPoints = [];
    decisions.forEach(d => {
        const correctOpt = d.question.options.find(o => o.correct);
        if (correctOpt && correctOpt.feedback) {
            const clean = correctOpt.feedback.replace(/^Correct\.?\s*/i, "").trim();
            if (clean) keyPoints.push(clean);
        }
    });
    return keyPoints.length > 0
        ? keyPoints.join(" ")
        : "Always prioritize immediate evacuation, stay below smoke layers, and follow official assembly protocols.";
}

function startDailyDrill() {
    const today = typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.getLocalDateString === "function"
        ? ReadyVerseProgress.getLocalDateString()
        : (typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().slice(0, 10));

    const decisions = getDailyDrillDecisions(today);
    if (!decisions || decisions.length < 3) {
        if (typeof showToast === "function") showToast("⚠️ Daily drill questions could not be loaded.");
        return;
    }

    if (dailyDrillSession.timerInterval) {
        clearInterval(dailyDrillSession.timerInterval);
        dailyDrillSession.timerInterval = null;
    }

    dailyDrillSession = {
        date: today,
        decisions: decisions,
        currentIndex: 0,
        answers: [],
        score: 0,
        correctCount: 0,
        timerRemaining: 60,
        timerInterval: null,
        isActive: true,
        isFinished: false,
        answeredCurrent: false
    };

    const modal = $("dailyDrillModal");
    if (modal) {
        modal.classList.remove("hidden");
    }

    const activeView = $("dailyDrillActiveView");
    const resultView = $("dailyDrillResultView");
    if (activeView) activeView.classList.remove("hidden");
    if (resultView) resultView.classList.add("hidden");

    updateDailyDrillTimerDisplay();
    dailyDrillSession.timerInterval = setInterval(tickDailyDrillTimer, 1000);

    renderDailyDrillDecision(0);
}

function tickDailyDrillTimer() {
    if (!dailyDrillSession.isActive || dailyDrillSession.isFinished) {
        if (dailyDrillSession.timerInterval) clearInterval(dailyDrillSession.timerInterval);
        return;
    }

    dailyDrillSession.timerRemaining--;
    updateDailyDrillTimerDisplay();

    if (dailyDrillSession.timerRemaining <= 0) {
        if (dailyDrillSession.timerInterval) clearInterval(dailyDrillSession.timerInterval);
        finishDailyDrill(true);
    }
}

function updateDailyDrillTimerDisplay() {
    const timerDisplay = $("dailyDrillTimerDisplay");
    const timerBar = $("dailyDrillTimerBar");
    const rem = Math.max(0, dailyDrillSession.timerRemaining);

    if (timerDisplay) {
        timerDisplay.textContent = `⏱️ 0:${String(rem).padStart(2, "0")}`;
        if (rem <= 10) {
            timerDisplay.style.color = "#ef4444";
        } else {
            timerDisplay.style.color = "#f59e0b";
        }
    }

    if (timerBar) {
        const pct = Math.max(0, Math.min(100, (rem / 60) * 100));
        timerBar.style.width = `${pct}%`;
    }
}

function renderDailyDrillDecision(index) {
    if (!dailyDrillSession.decisions || !dailyDrillSession.decisions[index]) return;
    const current = dailyDrillSession.decisions[index];
    dailyDrillSession.answeredCurrent = false;

    const isTamil = (dailyDrillSession.lang === "ta") && typeof ReadyVerseTamil !== "undefined";

    // Sync Daily Drill language toggle buttons
    const enBtn = $("dailyLangEnBtn");
    const taBtn = $("dailyLangTaBtn");
    if (enBtn) enBtn.classList.toggle("active", !isTamil);
    if (taBtn) taBtn.classList.toggle("active", isTamil);

    const counter = $("dailyDrillStepCounter");
    if (counter) {
        counter.textContent = isTamil
            ? `முடிவு ${index + 1} / 3`
            : `Decision ${index + 1} of 3`;
    }

    const hazardIcon = $("dailyDrillHazardIcon");
    const hazardName = $("dailyDrillHazardName");
    if (hazardIcon) hazardIcon.textContent = current.drillIcon || "⚡";
    if (hazardName) {
        if (isTamil && ReadyVerseTamil.dailyDrill && ReadyVerseTamil.dailyDrill.hazardLabels) {
            hazardName.textContent = ReadyVerseTamil.dailyDrill.hazardLabels[current.drillId] || current.drillTitle;
        } else {
            hazardName.textContent = current.drillTitle || "Emergency Drill";
        }
    }

    let tamilQ = null;
    if (isTamil) {
        if (current.drillId === "fire" && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.questions) {
            tamilQ = ReadyVerseTamil.fireDrill.questions[current.questionIndex];
        } else if (typeof ReadyVerseTamil.getQuestion === "function") {
            tamilQ = ReadyVerseTamil.getQuestion(current.drillId, current.questionIndex);
        }
    }

    const questionText = $("dailyDrillQuestionText");
    if (questionText) {
        questionText.textContent = (tamilQ && tamilQ.situation) ? tamilQ.situation : current.question.situation;
    }

    const feedbackBanner = $("dailyDrillFeedbackBanner");
    if (feedbackBanner) {
        feedbackBanner.classList.add("hidden");
        feedbackBanner.className = "daily-drill-feedback hidden";
    }

    const optionsContainer = $("dailyDrillOptionsContainer");
    if (optionsContainer) {
        optionsContainer.innerHTML = "";
        current.question.options.forEach((opt, optIdx) => {
            const optText = (tamilQ && tamilQ.options && tamilQ.options[optIdx])
                ? tamilQ.options[optIdx].text
                : opt.text;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "daily-drill-opt-btn";
            btn.dataset.index = optIdx;
            btn.innerHTML = `<span style="font-weight: 800; color: var(--purple-bright, #818cf8); min-width: 22px;">${String.fromCharCode(65 + optIdx)}.</span> <span>${optText}</span>`;
            btn.onclick = () => handleDailyDrillChoice(optIdx);
            optionsContainer.appendChild(btn);
        });
    }
}

function handleDailyDrillChoice(optIdx) {
    if (dailyDrillSession.answeredCurrent || dailyDrillSession.isFinished) return;
    dailyDrillSession.answeredCurrent = true;

    const current = dailyDrillSession.decisions[dailyDrillSession.currentIndex];
    if (!current) return;

    const opt = current.question.options[optIdx];
    const isCorrect = !!(opt && opt.correct);
    const isTamil = (dailyDrillSession.lang === "ta") && typeof ReadyVerseTamil !== "undefined";

    let tamilQ = null;
    if (isTamil) {
        if (current.drillId === "fire" && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.questions) {
            tamilQ = ReadyVerseTamil.fireDrill.questions[current.questionIndex];
        } else if (typeof ReadyVerseTamil.getQuestion === "function") {
            tamilQ = ReadyVerseTamil.getQuestion(current.drillId, current.questionIndex);
        }
    }

    if (isCorrect) {
        dailyDrillSession.correctCount++;
        dailyDrillSession.score += 33;
    }
    dailyDrillSession.answers.push({
        decisionIndex: dailyDrillSession.currentIndex,
        optionIndex: optIdx,
        isCorrect: isCorrect
    });

    // Disable all options and style correct/wrong
    const optionsContainer = $("dailyDrillOptionsContainer");
    if (optionsContainer) {
        const buttons = optionsContainer.querySelectorAll(".daily-drill-opt-btn");
        buttons.forEach((b, i) => {
            b.disabled = true;
            if (current.question.options[i]?.correct) {
                b.classList.add("correct-choice");
            } else if (i === optIdx && !isCorrect) {
                b.classList.add("wrong-choice");
            }
        });
    }

    // Show feedback banner
    const feedbackBanner = $("dailyDrillFeedbackBanner");
    const feedbackText = $("dailyDrillFeedbackText");
    const nextBtn = $("dailyDrillNextBtn");

    if (feedbackBanner && feedbackText) {
        feedbackBanner.classList.remove("hidden");
        const fbMsg = (tamilQ && tamilQ.options && tamilQ.options[optIdx])
            ? tamilQ.options[optIdx].feedback
            : (opt.feedback || (isCorrect ? "Safe decision." : "Review safety protocol."));

        if (isCorrect) {
            feedbackBanner.className = "daily-drill-feedback correct-feedback";
            feedbackText.textContent = isTamil
                ? `✅ சரியான தேர்வு! · ${fbMsg}`
                : `✅ Correct choice! · ${fbMsg}`;
        } else {
            feedbackBanner.className = "daily-drill-feedback wrong-feedback";
            feedbackText.textContent = isTamil
                ? `⚠️ தவறான தேர்வு · ${fbMsg}`
                : `⚠️ Sub-optimal choice · ${fbMsg}`;
        }
    }

    if (nextBtn) {
        if (isTamil && ReadyVerseTamil.dailyDrill && ReadyVerseTamil.dailyDrill.ui) {
            nextBtn.textContent = dailyDrillSession.currentIndex >= 2
                ? ReadyVerseTamil.dailyDrill.ui.viewResultsBtn
                : ReadyVerseTamil.dailyDrill.ui.nextBtn;
        } else {
            nextBtn.textContent = dailyDrillSession.currentIndex >= 2 ? "VIEW RESULTS →" : "NEXT DECISION →";
        }
    }
}

function nextDailyDrillDecision() {
    if (dailyDrillSession.currentIndex < 2) {
        dailyDrillSession.currentIndex++;
        renderDailyDrillDecision(dailyDrillSession.currentIndex);
    } else {
        finishDailyDrill(false);
    }
}

function finishDailyDrill(timeExpired = false) {
    if (dailyDrillSession.timerInterval) {
        clearInterval(dailyDrillSession.timerInterval);
        dailyDrillSession.timerInterval = null;
    }

    dailyDrillSession.isActive = false;
    dailyDrillSession.isFinished = true;

    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }

    const isTamil = (dailyDrillSession.lang === "ta") && typeof ReadyVerseTamil !== "undefined";

    const activeView = $("dailyDrillActiveView");
    const resultView = $("dailyDrillResultView");
    if (activeView) activeView.classList.add("hidden");
    if (resultView) resultView.classList.remove("hidden");

    const resultTitle = $("dailyDrillResultTitle");
    const resultSub = $("dailyDrillResultSub");
    const resultIcon = $("dailyDrillResultIcon");

    if (resultTitle) {
        if (isTamil && ReadyVerseTamil.dailyDrill && ReadyVerseTamil.dailyDrill.ui) {
            resultTitle.textContent = timeExpired
                ? ReadyVerseTamil.dailyDrill.ui.timeUp
                : ReadyVerseTamil.dailyDrill.ui.completeTitle;
        } else {
            resultTitle.textContent = timeExpired ? "⏱️ Time's Up!" : "Daily Drill Complete! ⚡";
        }
    }
    if (resultSub) {
        resultSub.textContent = isTamil
            ? (timeExpired ? "60 விநாடிகள் நிறைவடைந்தன. உங்கள் இன்றைய செயல்பாடு கீழே கொடுக்கப்பட்டுள்ளது." : "இன்றைய 60-விநாடி அவசர பயிற்சியை வெற்றிகரமாக முடித்துள்ளீர்கள்.")
            : (timeExpired ? "60 seconds elapsed. Here is how you performed on today's drill." : "Great job tackling today's 60-second emergency challenge.");
    }
    if (resultIcon) {
        resultIcon.textContent = dailyDrillSession.correctCount >= 2 ? "🎉" : "🛡️";
    }

    const scoreEl = $("dailyDrillResultScore");
    if (scoreEl) {
        scoreEl.textContent = `${dailyDrillSession.correctCount} / 3`;
    }

    const xpAward = (typeof ReadyVerseProgress !== "undefined" && ReadyVerseProgress.XP_REWARDS && ReadyVerseProgress.XP_REWARDS.dailyDrill)
        ? ReadyVerseProgress.XP_REWARDS.dailyDrill
        : 50;

    const xpEl = $("dailyDrillResultXp");
    if (xpEl) {
        xpEl.textContent = `+${xpAward} XP`;
    }

    // Award XP and record activity (streak) through ReadyVerseProgress API
    if (typeof state !== "undefined") {
        state.totalXP = (state.totalXP || 0) + xpAward;
        state.lastDailyDrillDate = dailyDrillSession.date;
        if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.recordActivity === "function") {
            ReadyVerseProgress.recordActivity(state);
            ReadyVerseProgress.saveState(state);
        }
    }

    const streakEl = $("dailyDrillResultStreak");
    if (streakEl) {
        const streakVal = state.dailyStreak || 1;
        streakEl.textContent = isTamil
            ? `🔥 ${streakVal} நாள்`
            : `🔥 ${streakVal} Day${streakVal > 1 ? "s" : ""}`;
    }

    const lessonText = $("dailyDrillLessonText");
    if (lessonText) {
        if (isTamil && typeof ReadyVerseTamil !== "undefined" && ReadyVerseTamil.dailyDrill) {
            const firstD = dailyDrillSession.decisions && dailyDrillSession.decisions[0];
            const hazardKey = firstD ? firstD.drillId : "general";
            lessonText.textContent = ReadyVerseTamil.getTakeaway
                ? ReadyVerseTamil.getTakeaway(hazardKey)
                : (ReadyVerseTamil.dailyDrill.takeaways[hazardKey] || ReadyVerseTamil.dailyDrill.takeaways.general);
        } else {
            lessonText.textContent = getDailyDrillLessonTakeaway(dailyDrillSession.decisions);
        }
    }

    // PROMPT 6: DAILY DRILL SOURCE CITATION
    const dailySourceInfo = (typeof ReadyVerseSources !== "undefined" && ReadyVerseSources.getDrillSource)
        ? ReadyVerseSources.getDrillSource("daily")
        : { shortCitation: "NDMA Multi-Hazard Disaster Framework & UNDRR Sendai Framework (NEEDS REVIEW)", status: "NEEDS REVIEW" };

    const dailySourceCitation = $("dailyDrillSourceCitation");
    if (dailySourceCitation) {
        dailySourceCitation.innerHTML = `<strong>Source:</strong> ${dailySourceInfo.documentName || dailySourceInfo.shortCitation}`;
    }

    if (dailyDrillSession.correctCount === 3 && typeof triggerCelebration === "function") {
        triggerCelebration("perfect_drill", { drillName: "Daily Drill" });
    }

    /* Challenge outcome banner for Daily Drill */
    const dailyChallengeBanner = $("dailyDrillChallengeBanner");
    if (dailyChallengeBanner) {
        if (state.activeChallenge && state.activeChallenge.active && (state.activeChallenge.drillId === "daily" || !state.activeChallenge.drillId)) {
            const targetScore = Number(state.activeChallenge.score);
            const userScore = Math.round((dailyDrillSession.correctCount / 3) * 100);
            let outcomeClass = "challenge-outcome-won";
            let outcomeIcon = "🎉";
            let outcomeTitle = "DAILY CHALLENGE WON!";
            let outcomeSub = `You scored ${userScore}%, beating your friend's target of ${targetScore}%!`;

            if (userScore === targetScore) {
                outcomeClass = "challenge-outcome-tied";
                outcomeIcon = "🤝";
                outcomeTitle = "DAILY CHALLENGE TIED!";
                outcomeSub = `You matched your friend's score of ${targetScore}%!`;
            } else if (userScore < targetScore) {
                outcomeClass = "challenge-outcome-missed";
                outcomeIcon = "💪";
                outcomeTitle = "DAILY CHALLENGE MISSED (SO CLOSE!)";
                outcomeSub = `You scored ${userScore}%, while your friend scored ${targetScore}%.`;
            }

            dailyChallengeBanner.className = `challenge-outcome-banner ${outcomeClass}`;
            dailyChallengeBanner.innerHTML = `
                <div class="challenge-outcome-icon">${outcomeIcon}</div>
                <div class="challenge-outcome-text">
                    <h4 class="challenge-outcome-headline">${outcomeTitle}</h4>
                    <p class="challenge-outcome-sub">${escapeHtml(outcomeSub)}</p>
                </div>
            `;
            dailyChallengeBanner.classList.remove("hidden");
        } else {
            dailyChallengeBanner.classList.add("hidden");
        }
    }

    updateDashboardStats();
}

function closeDailyDrillModal() {
    if (dailyDrillSession.timerInterval) {
        clearInterval(dailyDrillSession.timerInterval);
        dailyDrillSession.timerInterval = null;
    }
    dailyDrillSession.isActive = false;

    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }

    const modal = $("dailyDrillModal");
    if (modal) {
        modal.classList.add("hidden");
    }

    updateDashboardStats();
}

/* =========================================================
   PROMPT 6: LANGUAGE TOGGLE & SPEECH SYNTHESIS CONTROLS
   ========================================================= */

function setDrillLanguage(lang) {
    if (typeof state !== "undefined") {
        state.drillLanguage = lang || "en";
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem("readyverse_drill_lang", state.drillLanguage);
            }
        } catch (_) {}
    }
    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }
    renderSimulation();
}

function setDailyDrillLanguage(lang) {
    if (typeof dailyDrillSession !== "undefined") {
        dailyDrillSession.lang = lang || "en";
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem("readyverse_daily_drill_lang", dailyDrillSession.lang);
            }
        } catch (_) {}
    }
    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }
    const enBtn = $("dailyLangEnBtn");
    const taBtn = $("dailyLangTaBtn");
    if (enBtn) enBtn.classList.toggle("active", (dailyDrillSession.lang || "en") !== "ta");
    if (taBtn) taBtn.classList.toggle("active", (dailyDrillSession.lang || "en") === "ta");

    if (dailyDrillSession.isActive && !dailyDrillSession.isFinished) {
        renderDailyDrillDecision(dailyDrillSession.currentIndex);
    } else if (dailyDrillSession.isFinished) {
        finishDailyDrill(false);
    }
}

function toggleCurrentScenarioSpeech() {
    if (typeof ReadyVerseSpeech === "undefined") return;
    const btn = $("simListenBtn");
    const isTamil = (state.drillLanguage === "ta") && state.currentMission === "fire" && typeof ReadyVerseTamil !== "undefined";
    const lang = isTamil ? "ta" : "en";

    const mission = missions[state.currentMission];
    if (!mission) return;
    const q = mission.questions ? mission.questions[state.currentDecision] : null;
    const tamilQ = (isTamil && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.questions)
        ? ReadyVerseTamil.fireDrill.questions[state.currentDecision]
        : null;

    let textToSpeak = "";
    if (tamilQ) {
        textToSpeak = tamilQ.situation + ". ";
        if (tamilQ.options) {
            tamilQ.options.forEach((opt, idx) => {
                textToSpeak += `விருப்பம் ${String.fromCharCode(65 + idx)}: ${opt.text}. `;
            });
        }
    } else if (q) {
        textToSpeak = q.situation + ". ";
        if (q.options) {
            q.options.forEach((opt, idx) => {
                textToSpeak += `Option ${String.fromCharCode(65 + idx)}: ${opt.text}. `;
            });
        }
    }

    ReadyVerseSpeech.toggle({
        text: textToSpeak,
        lang: lang,
        button: btn,
        onVoiceMissing: (info) => {
            if (typeof showToast === "function") {
                showToast("ℹ️ Tamil voice not found on device. Using system fallback.", "🔊");
            }
        }
    });
}

function toggleDailyDrillSpeech() {
    if (typeof ReadyVerseSpeech === "undefined") return;
    const btn = $("dailyDrillListenBtn");
    const isTamil = (dailyDrillSession.lang === "ta") && typeof ReadyVerseTamil !== "undefined";
    const lang = isTamil ? "ta" : "en";

    if (!dailyDrillSession.decisions || !dailyDrillSession.decisions[dailyDrillSession.currentIndex]) return;
    const current = dailyDrillSession.decisions[dailyDrillSession.currentIndex];

    let tamilQ = null;
    if (isTamil) {
        if (current.drillId === "fire" && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.questions) {
            tamilQ = ReadyVerseTamil.fireDrill.questions[current.questionIndex];
        } else if (typeof ReadyVerseTamil.getQuestion === "function") {
            tamilQ = ReadyVerseTamil.getQuestion(current.drillId, current.questionIndex);
        }
    }

    let textToSpeak = "";
    if (tamilQ) {
        textToSpeak = tamilQ.situation + ". ";
        if (tamilQ.options) {
            tamilQ.options.forEach((opt, idx) => {
                textToSpeak += `விருப்பம் ${String.fromCharCode(65 + idx)}: ${opt.text}. `;
            });
        }
    } else {
        textToSpeak = current.question.situation + ". ";
        if (current.question.options) {
            current.question.options.forEach((opt, idx) => {
                textToSpeak += `Option ${String.fromCharCode(65 + idx)}: ${opt.text}. `;
            });
        }
    }

    ReadyVerseSpeech.toggle({
        text: textToSpeak,
        lang: lang,
        button: btn,
        onVoiceMissing: (info) => {
            if (typeof showToast === "function") {
                showToast("ℹ️ Tamil voice not found on device. Using system fallback.", "🔊");
            }
        }
    });
}

function toggleLearnLessonSpeech() {
    if (typeof ReadyVerseSpeech === "undefined") return;
    const btn = $("learnListenBtn");
    const langSelect = $("learnSpeechLangSelect");
    const selectedLang = langSelect ? langSelect.value : "en";
    const mod = (typeof learnModules !== "undefined" && typeof activeLearnKey !== "undefined" && learnModules[activeLearnKey]) ? learnModules[activeLearnKey] : null;
    if (!mod) return;

    let textToSpeak = "";
    if (selectedLang === "ta" && typeof ReadyVerseTamil !== "undefined") {
        if (mod.id === "fire" && ReadyVerseTamil.fireDrill && ReadyVerseTamil.fireDrill.briefing) {
            textToSpeak = `${ReadyVerseTamil.fireDrill.title}. ${ReadyVerseTamil.fireDrill.briefing.scenario} ${ReadyVerseTamil.fireDrill.briefing.safetyNote}`;
        } else {
            textToSpeak = `${mod.title}. ${mod.overview}. ${mod.during ? mod.during.join(". ") : ""}`;
        }
    } else {
        textToSpeak = `${mod.title}. ${mod.overview}. During emergency: ${mod.during ? mod.during.join(". ") : ""}. Key precautions: ${mod.donts ? mod.donts.join(". ") : ""}`;
    }

    const voiceNotice = $("learnVoiceNotice");
    if (voiceNotice) voiceNotice.classList.add("hidden");

    ReadyVerseSpeech.toggle({
        text: textToSpeak,
        lang: selectedLang,
        button: btn,
        onVoiceMissing: (info) => {
            if (voiceNotice) {
                voiceNotice.textContent = (typeof ReadyVerseTamil !== "undefined" && ReadyVerseTamil.speech)
                    ? ReadyVerseTamil.speech.voiceMissingNotice
                    : "Notice: A native Tamil voice is not installed on this device. The system may read with an available voice.";
                voiceNotice.classList.remove("hidden");
            }
        }
    });
}

function handleLearnSpeechLangChange(val) {
    const voiceNotice = $("learnVoiceNotice");
    if (voiceNotice) voiceNotice.classList.add("hidden");

    if (val === "ta" && typeof ReadyVerseSpeech !== "undefined") {
        if (!ReadyVerseSpeech.hasVoiceForLanguage("ta")) {
            if (voiceNotice) {
                voiceNotice.textContent = (typeof ReadyVerseTamil !== "undefined" && ReadyVerseTamil.speech)
                    ? ReadyVerseTamil.speech.voiceMissingNotice
                    : "Tamil voice is not installed on your system. You can read the text guide or install a Tamil speech pack in OS settings.";
                voiceNotice.classList.remove("hidden");
            }
        }
    }

    if (typeof ReadyVerseSpeech !== "undefined" && ReadyVerseSpeech.isSpeaking()) {
        ReadyVerseSpeech.stop();
        toggleLearnLessonSpeech();
    }
}

/* =========================================================
   UPDATE DASHBOARD
   ========================================================= */

function updateDashboardStats() {

    /* -------------------------
       READINESS
    -------------------------- */

    calculateReadiness();
    const readiness = state.readiness || 0;

    const readinessScore =
        $("readinessScore");

    if (readinessScore) {

        readinessScore.textContent =
            state.readiness;

        const readinessCard = readinessScore.closest(".readiness-card");
        if (readinessCard) {
            const h3 = readinessCard.querySelector("h3");
            const p = readinessCard.querySelector("p");
            if (h3 && p) {
                if (state.readiness >= 90) {
                    h3.textContent = "High Readiness";
                    p.innerHTML = "You're fully<br>response-ready.";
                } else if (state.readiness >= 75) {
                    h3.textContent = "Good progress";
                    p.innerHTML = "You're becoming<br>response-ready.";
                } else if (state.readiness >= 50) {
                    h3.textContent = "Moderate Preparedness";
                    p.innerHTML = "Advancing crisis<br>capabilities.";
                } else {
                    h3.textContent = "Training Active";
                    p.innerHTML = "Complete drills to<br>build readiness.";
                }
            }
        }

    }


    /* -------------------------
       XP
    -------------------------- */

    const xpValue =
        $("xpValue");

    if (xpValue) {

        xpValue.textContent =
            formatNumber(
                state.totalXP
            );

    }


    /* -------------------------
       LEVEL & PROGRESSION (SCALABLE LEVELS)
    -------------------------- */
    const lvl = typeof calculateLevel === "function" ? calculateLevel(state.totalXP) : { level: Math.max(1, Math.floor((state.totalXP || 0) / 200) + 1), title: "Rookie", levelStartXP: 0, nextLevelXP: 200, xpIntoLevel: 0, xpToNextLevel: 200, remainingXP: 200, progressPct: 0 };
    const currentLevel = lvl.level;

    /* -------------------------
       XP PROGRESS BAR
    -------------------------- */
    const xpPercentage = lvl.progressPct;

    const xpProgress =
        $("xpProgress");

    if (xpProgress) {
        xpProgress.style.width =
            `${xpPercentage}%`;
    }

    /* -------------------------
       XP REMAINING & LEVEL TARGET
    -------------------------- */
    const xpRemaining =
        $("xpRemaining");

    if (xpRemaining) {
        const remainingToNext =
            lvl.xpToNextLevel || lvl.remainingXP || 200;

        xpRemaining.textContent =
            formatNumber(
                remainingToNext
            );

        /* Dynamically update target level in card text */
        const parentP =
            xpRemaining.closest("p");

        if (parentP) {
            parentP.innerHTML =
                `<span id="xpRemaining">${formatNumber(remainingToNext)}</span> XP until Level ${String(currentLevel + 1).padStart(2, "0")}`;
        }
    }

    /* -------------------------
       RESPONDER IDENTITY & SIDEBAR/HEADER SYNC
    -------------------------- */
    const studentName = state.prepProfile?.name || state.responderProfile?.name || "Student";
    const responderRank = getResponderRank(state.totalXP);
    const activeTitle = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && state.responderProfile) 
        ? (RESPONDER_CUSTOMIZATIONS.titles.find(t => t.id === state.responderProfile.titleId) || { name: responderRank.title })
        : { name: responderRank.title };
    const activeOutfit = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && state.responderProfile)
        ? (RESPONDER_CUSTOMIZATIONS.outfits.find(o => o.id === state.responderProfile.outfitId) || { icon: "🧑‍🚒" })
        : { icon: "🧑‍🚒" };

    const userProfileName =
        $("userProfileName");

    const userProfileRank =
        $("userProfileRank");

    const sidebarAvatar =
        $("sidebarAvatarIcon") || $("sidebarAvatar") || document.querySelector(".trainee-card .avatar");

    if (userProfileName) {
        userProfileName.textContent =
            studentName.toUpperCase();
    }

    if (userProfileRank) {
        userProfileRank.textContent =
            `LEVEL ${String(currentLevel).padStart(2, "0")} · ${(activeTitle.name || responderRank.title).toUpperCase()}`;
    }

    if (sidebarAvatar && activeOutfit.icon) {
        sidebarAvatar.textContent =
            activeOutfit.icon;
    }

    const headerProfileName =
        $("headerProfileName");

    const headerProfileLevel =
        $("headerProfileLevel");

    const headerMiniAvatar =
        $("headerMiniAvatar");

    if (headerProfileName) {
        headerProfileName.textContent =
            studentName.toUpperCase();
    }

    if (headerProfileLevel) {
        headerProfileLevel.textContent =
            `LVL ${String(currentLevel).padStart(2, "0")}`;
    }

    if (headerMiniAvatar && activeOutfit.icon) {
        headerMiniAvatar.textContent =
            activeOutfit.icon;
    }


    /* -------------------------
       DAILY STREAK HUD
    -------------------------- */

    updateDailyStreakUI();


    /* -------------------------
       DIGITAL SCENARIOS HUD
    -------------------------- */

    const totalScenarios = 4;
    const completedCount = state.completedMissionIds ? state.completedMissionIds.size : 0;
    const completionPct = Math.min(100, Math.round((completedCount / totalScenarios) * 100));

    const missionProgressEl = $("dashboardMissionsProgress");
    const missionBarEl = $("dashboardMissionsBar");
    const missionSummaryEl = $("dashboardMissionsSummary");

    if (missionProgressEl) {
        missionProgressEl.textContent = `${completedCount} / ${totalScenarios}`;
    }
    if (missionBarEl) {
        missionBarEl.style.width = `${completionPct}%`;
    }
    if (missionSummaryEl) {
        missionSummaryEl.textContent = completedCount === totalScenarios
            ? "All 4 emergency drills mastered! 🌟"
            : `${totalScenarios - completedCount} scenario${totalScenarios - completedCount > 1 ? "s" : ""} pending completion.`;
    }

    /* -------------------------
       STAGE 5: NEW HOME SCREEN ELEMENTS
    -------------------------- */

    // 1. Greeting
    const hasCustomName = studentName && studentName.trim() !== "" && studentName.trim().toLowerCase() !== "student";
    const greetingText = hasCustomName ? `Welcome back, ${studentName.trim()}` : "Hey there!";
    
    const homeGreetingTitle = $("homeGreetingTitle");
    if (homeGreetingTitle) {
        homeGreetingTitle.textContent = greetingText;
    }

    const headerH2 = document.querySelector(".dashboard-header h2");
    if (headerH2) {
        headerH2.textContent = hasCustomName ? `Welcome back, ${studentName.trim()}.` : "Hey there!";
    }

    // Render active challenge hero banner on Home if present
    if (typeof renderChallengeBanners === "function") {
        renderChallengeBanners(state.activeChallenge);
    }

    // 2. Primary Button CTA
    const primaryDrillAction = getHomePrimaryDrillAction(state);
    currentHomePrimaryAction = primaryDrillAction;

    const homePrimaryCtaLabel = $("homePrimaryCtaLabel");
    const homePrimaryCtaIcon = $("homePrimaryCtaIcon");
    if (homePrimaryCtaLabel) {
        homePrimaryCtaLabel.textContent = primaryDrillAction.label;
    }
    if (homePrimaryCtaIcon) {
        homePrimaryCtaIcon.textContent = primaryDrillAction.icon;
    }

    // Daily Drill CTA status
    const today = typeof getLocalDateString === "function" ? getLocalDateString() : (typeof ReadyVerseProgress !== "undefined" ? ReadyVerseProgress.getLocalDateString() : new Date().toISOString().slice(0, 10));
    const isDailyDoneToday = state.lastDailyDrillDate === today;
    const homeDailyDrillLabel = $("homeDailyDrillLabel");
    const homeDailyDrillChip = $("homeDailyDrillChip");
    if (homeDailyDrillLabel) {
        homeDailyDrillLabel.textContent = isDailyDoneToday
            ? "Today's Daily Drill Completed · Streak Active 🔥"
            : "Today's Crisis Challenge · 3 Quick Decisions";
    }
    if (homeDailyDrillChip) {
        homeDailyDrillChip.textContent = isDailyDoneToday ? "✅ Done" : "⏱️ 60s";
    }

    // 3. Compact Stats Row (3 Tiles)
    // Tile 1: Streak & Evening Streak-at-Risk
    let effectiveStreak = 0;
    if (state.lastActivityDate) {
        const dayDiff = getCalendarDayDiff(state.lastActivityDate, today);
        if (dayDiff === 0) effectiveStreak = state.dailyStreak || 1;
        else if (dayDiff === 1) effectiveStreak = state.dailyStreak || 0;
        else effectiveStreak = 0;
    } else if (state.dailyStreak) {
        effectiveStreak = state.dailyStreak;
    }

    const homeStreakTile = $("homeStreakTile");
    const homeStreakVal = $("homeStreakVal");
    const homeStreakSub = $("homeStreakSub");
    const nowObj = new Date();
    const currentHour = nowObj.getHours();

    if (homeStreakVal) {
        homeStreakVal.textContent = `${effectiveStreak} day${effectiveStreak === 1 ? "" : "s"}`;
    }

    if (homeStreakTile && homeStreakSub) {
        if (isDailyDoneToday) {
            homeStreakTile.classList.remove("streak-at-risk");
            homeStreakTile.classList.add("streak-active");
            homeStreakSub.textContent = "🔥 Streak protected for today! Come back tomorrow.";
        } else if (currentHour >= 18 && !isDailyDoneToday) {
            if (effectiveStreak > 0) {
                homeStreakTile.classList.add("streak-at-risk");
                homeStreakTile.classList.remove("streak-active");
                homeStreakSub.textContent = `⚠️ Streak at risk! Play before midnight to save your ${effectiveStreak}-day streak.`;
            } else {
                homeStreakTile.classList.remove("streak-at-risk");
                homeStreakSub.textContent = "Complete today's 60s drill before midnight!";
            }
        } else {
            homeStreakTile.classList.remove("streak-at-risk");
            homeStreakSub.textContent = effectiveStreak === 0 
                ? "Start your streak today" 
                : "Play today's drill to grow your streak";
        }
    }

    // Tile 2: Level & Level-Up celebration check
    const homeLevelVal = $("homeLevelVal");
    const homeLevelXpFill = $("homeLevelXpFill");
    const homeLevelXpSub = $("homeLevelXpSub");
    if (homeLevelVal) {
        homeLevelVal.textContent = `Level ${lvl.level} · ${lvl.title}`;
    }
    if (homeLevelXpFill) {
        homeLevelXpFill.style.width = `${lvl.progressPct}%`;
    }
    if (homeLevelXpSub) {
        const xpIn = lvl.xpIntoLevel || 0;
        const xpReq = lvl.xpToNextLevel || (200 - xpIn);
        homeLevelXpSub.textContent = `${xpIn} / 200 XP · ${xpReq} XP to Level ${lvl.level + 1}`;
    }

    const prevCelebratedLevel = state._lastCelebratedLevel || 1;
    if (lvl.level > prevCelebratedLevel && state.totalXP > 0) {
        state._lastCelebratedLevel = lvl.level;
        if (typeof triggerCelebration === "function") {
            triggerCelebration("level_up", { level: lvl.level, title: lvl.title });
        }
    }

    // Tile 3: Readiness Score
    const homeReadinessVal = $("homeReadinessVal");
    const homeReadinessSub = $("homeReadinessSub");
    if (homeReadinessVal) {
        homeReadinessVal.textContent = `${readiness}%`;
    }
    if (homeReadinessSub) {
        homeReadinessSub.textContent = readiness === 0 
            ? "Play a drill to get your score" 
            : (readiness >= 90 ? "High Readiness · Fully prepared" : readiness >= 50 ? "Moderate Preparedness" : "Building response skills");
    }

    // 4. Weekly Training Tracker Progress Ring & Next Badge Hint
    const weeklyGoalType = state.trainingGoal || "daily";
    const weeklyGoalTarget = weeklyGoalType === "weekly_3" ? 3 : 7;
    let weeklyDrillsDone = 0;
    if (isDailyDoneToday) {
        weeklyDrillsDone += 1;
    }
    if (Array.isArray(state.performanceHistory) && state.performanceHistory.length > 0) {
        const oneWeekAgo = nowObj.getTime() - 7 * 24 * 60 * 60 * 1000;
        const recentDrills = state.performanceHistory.filter(h => (h.timestamp || 0) >= oneWeekAgo);
        weeklyDrillsDone = Math.max(weeklyDrillsDone, recentDrills.length);
    } else if (state.completedMissions) {
        weeklyDrillsDone = Math.max(weeklyDrillsDone, state.completedMissions);
    }
    weeklyDrillsDone = Math.min(weeklyDrillsDone, weeklyGoalTarget);

    const ringFill = $("homeWeeklyRingFill");
    const drillsDoneEl = $("homeWeeklyDrillsDone");
    const drillsGoalEl = $("homeWeeklyDrillsGoal");
    const weeklyGoalPill = $("homeWeeklyGoalPill");
    const weeklySub = $("homeWeeklySub");

    if (drillsDoneEl) drillsDoneEl.textContent = String(weeklyDrillsDone);
    if (drillsGoalEl) drillsGoalEl.textContent = `/${weeklyGoalTarget}`;
    if (weeklyGoalPill) weeklyGoalPill.textContent = weeklyGoalType === "weekly_3" ? "3 DRILLS / WK" : "1 DRILL / DAY";

    const ringCircumference = 201.06;
    if (ringFill) {
        const ratio = weeklyGoalTarget > 0 ? (weeklyDrillsDone / weeklyGoalTarget) : 0;
        const offset = ringCircumference * (1 - Math.min(ratio, 1));
        ringFill.style.strokeDashoffset = String(offset);
    }

    if (weeklySub) {
        const remaining = weeklyGoalTarget - weeklyDrillsDone;
        if (remaining <= 0) {
            weeklySub.textContent = `🎉 Weekly goal reached (${weeklyDrillsDone}/${weeklyGoalTarget})! Outstanding readiness.`;
        } else {
            weeklySub.textContent = `${weeklyDrillsDone} of ${weeklyGoalTarget} completed · ${remaining} more to reach your weekly goal!`;
        }
    }

    // Next Badge Hint Card
    const currentLvlNum = lvl.level || 1;
    const xpIntoCurrentLvl = lvl.xpIntoLevel || 0;
    const xpNeededForNextLvl = lvl.xpToNextLevel || (200 - xpIntoCurrentLvl);
    const nextLvlRankTitle = (typeof ReadyVerseProgress !== "undefined" && ReadyVerseProgress.LEVEL_RANKS)
        ? (ReadyVerseProgress.LEVEL_RANKS[currentLvlNum] || "Senior Responder")
        : `Level ${currentLvlNum + 1}`;

    const nextBadgeTitle = $("homeNextBadgeTitle");
    const nextBadgeDistance = $("homeNextBadgeDistance");
    const nextBadgeDesc = $("homeNextBadgeDesc");
    const nextBadgeFill = $("homeNextBadgeFill");
    const nextBadgeIcon = $("homeNextBadgeIcon");

    if (nextBadgeTitle) nextBadgeTitle.textContent = `Level ${currentLvlNum + 1} · ${nextLvlRankTitle}`;
    if (nextBadgeDistance) nextBadgeDistance.textContent = `${xpNeededForNextLvl} XP away`;
    if (nextBadgeDesc) nextBadgeDesc.textContent = `Complete drills & lessons to earn ${xpNeededForNextLvl} more XP and level up.`;
    if (nextBadgeFill) {
        const pct = Math.max(0, Math.min(lvl.progressPct || ((200 - xpNeededForNextLvl) / 200) * 100, 100));
        nextBadgeFill.style.width = `${pct}%`;
    }
    if (nextBadgeIcon) {
        nextBadgeIcon.textContent = currentLvlNum >= 3 ? "🛡️" : "🏅";
    }

    // 5. Next Best Action Card (guaranteed not to match primary drill action)
    const nextStep = getDynamicNextStep(state, primaryDrillAction.target);
    currentDynamicNextStep = nextStep;

    const nextStepBadge = $("dashboardNextStepBadge");
    const nextStepCategory = $("dashboardNextStepCategory");
    const nextStepTitle = $("dashboardNextStepTitle");
    const nextStepDesc = $("dashboardNextStepDesc");
    const nextStepBtn = $("dashboardNextStepBtn");

    if (nextStepBadge) nextStepBadge.textContent = nextStep.badge;
    if (nextStepCategory) nextStepCategory.textContent = nextStep.category;
    if (nextStepTitle) nextStepTitle.textContent = nextStep.title;
    if (nextStepDesc) nextStepDesc.textContent = nextStep.desc;
    if (nextStepBtn) nextStepBtn.textContent = nextStep.btnText;

    // 5. Two Small Shortcut Cards
    const learnDone = state.completedLearnIds ? state.completedLearnIds.size : 0;
    const planDone = state.completedPrepItemIds ? state.completedPrepItemIds.size : 0;
    
    const homeShortcutLearnCount = $("homeShortcutLearnCount");
    const homeShortcutPlanCount = $("homeShortcutPlanCount");
    if (homeShortcutLearnCount) {
        homeShortcutLearnCount.textContent = `${learnDone} / 6 lessons passed`;
    }
    if (homeShortcutPlanCount) {
        homeShortcutPlanCount.textContent = `${planDone} / 40 actions done`;
    }

    /* -------------------------
       JOURNEY PROGRESSION & NEXT STEP HUD (PHASE 3)
    -------------------------- */
    updateDashboardJourney();

}

/* =========================================================
   PHASE 3 — JOURNEY PROGRESSION & DYNAMIC NEXT STEP ENGINE
   ========================================================= */

function getDynamicNextStep(currentState = state, excludeDrillTarget = null) {
    const learnDone = currentState.completedLearnIds ? currentState.completedLearnIds.size : 0;
    const missionsDone = currentState.completedMissionIds ? currentState.completedMissionIds.size : 0;
    const prepCompleted = currentState.completedPrepItemIds ? currentState.completedPrepItemIds.size : 0;

    // Determine primary drill target if not provided
    const primaryTarget = excludeDrillTarget !== null ? excludeDrillTarget : getHomePrimaryDrillAction(currentState).target;

    // 1. BRAND NEW STUDENT: Zero learn, zero missions, zero prep
    if (learnDone === 0 && missionsDone === 0 && prepCompleted === 0) {
        return {
            badge: "START YOUR TRAINING · STEP 01",
            category: "STEP 01 · LEARN",
            title: "Start your first lesson in Fire Safety",
            desc: "Build core evacuation knowledge and test your understanding before entering live emergency drills.",
            btnText: "START FIRE SAFETY LESSON →",
            actionType: "learn",
            target: "fire"
        };
    }

    // 2. LEARN COMPLETED BUT NO SIMULATIONS ATTEMPTED
    if (missionsDone === 0 && learnDone > 0) {
        let missionTarget = "fire";
        if (currentState.completedLearnIds.has("flood")) missionTarget = "flood";
        else if (currentState.completedLearnIds.has("fire")) missionTarget = "fire";

        // If missionTarget matches primary CTA target, pick an unplayed learn module or plan action instead
        if (missionTarget !== primaryTarget) {
            const mTitle = missions[missionTarget] ? missions[missionTarget].title : "Building Fire";
            return {
                badge: "PRACTICE WHAT YOU LEARNED · LIVE DRILL",
                category: "STEP 03 · SIMULATE",
                title: `Take on the ${mTitle} Crisis Drill`,
                desc: `You've built fundamental safety knowledge. Now put your knowledge to the test in a timed crisis drill.`,
                btnText: `LAUNCH ${mTitle.toUpperCase()} DRILL →`,
                actionType: "simulation",
                target: missionTarget
            };
        }
    }

    // 3. AT LEAST ONE MISSION COMPLETED, BUT LOW CAMPUS PREPAREDNESS (< 5 actions recorded)
    if (missionsDone >= 1 && prepCompleted < 5) {
        const nextPrep = typeof getNextBestAction === "function" ? getNextBestAction() : null;
        const pTitle = nextPrep ? nextPrep.title : "Campus Emergency Contacts";
        return {
            badge: "BUILD REAL SAFETY HABITS · STEP 02",
            category: "STEP 02 · PREPARE",
            title: `Record: ${pTitle}`,
            desc: "Turn your drill knowledge into practical safety records for your dorm, hostel, and campus.",
            btnText: "BUILD PREPAREDNESS PLAN →",
            actionType: "preparedness",
            target: nextPrep ? nextPrep.id : "core_contacts"
        };
    }

    // 4. LOW SIMULATION SCORE (< 80% on any completed mission) -> Prompt to improve (exclude primary target)
    if (currentState.completedMissionIds && currentState.completedMissionIds.size > 0) {
        for (const mId of currentState.completedMissionIds) {
            if (mId === primaryTarget) continue; // Must not duplicate primary button target
            const bestScore = (currentState.missionBestScores && currentState.missionBestScores[mId]) || 0;
            if (bestScore < 80) {
                const mTitle = missions[mId] ? missions[mId].title : mId;
                return {
                    badge: "STRENGTHEN YOUR RESPONSE · REVISE & RETRY",
                    category: "STEP 04 · IMPROVE",
                    title: `Improve Your Score in ${mTitle}`,
                    desc: `Your current best score is ${bestScore}%. Review the protocol and retry to earn an A grade and unlock new capabilities.`,
                    btnText: `RETRY ${mTitle.toUpperCase()} →`,
                    actionType: "retry",
                    target: mId
                };
            }
        }
    }

    // 5. UNPLAYED DRILLS AVAILABLE (exclude primary target)
    const missionOrder = ["fire", "flood", "cyclone", "earthquake"];
    for (const mId of missionOrder) {
        if (mId === primaryTarget) continue; // Must not duplicate primary button target
        const isDone = currentState.completedMissionIds && currentState.completedMissionIds.has(mId);
        if (!isDone) {
            const mTitle = missions[mId] ? missions[mId].title : mId;
            return {
                badge: "DRILL PROGRESSION · NEXT SCENARIO",
                category: "STEP 03 · SIMULATE",
                title: `Tackle the ${mTitle} Drill`,
                desc: `Advance your campus disaster response readiness by completing the ${mTitle} drill.`,
                btnText: `START ${mTitle.toUpperCase()} →`,
                actionType: "simulation",
                target: mId
            };
        }
    }

    // 6. UNPLAYED LEARN MODULES AVAILABLE
    const learnOrder = ["fire", "flood", "cyclone", "earthquake", "electrical", "medical"];
    for (const lId of learnOrder) {
        const isDone = currentState.completedLearnIds && currentState.completedLearnIds.has(lId);
        if (!isDone) {
            const mod = learnModules[lId];
            const lTitle = mod ? mod.title : lId;
            return {
                badge: "EXPAND CRISIS KNOWLEDGE · STEP 01",
                category: "STEP 01 · LEARN",
                title: `Master ${lTitle} in Learn Hub`,
                desc: `Build critical hazard awareness and earn +100 XP by passing the 5-question knowledge check.`,
                btnText: `START ${lTitle.toUpperCase()} →`,
                actionType: "learn",
                target: lId
            };
        }
    }

    // 7. PREPAREDNESS ACTIONS REMAINING (< 40 actions)
    if (prepCompleted < 40) {
        const nextPrep = typeof getNextBestAction === "function" ? getNextBestAction() : null;
        if (nextPrep) {
            return {
                badge: "CAMPUS RESILIENCE · STEP 02",
                category: "STEP 02 · PREPARE",
                title: `Record: ${nextPrep.title}`,
                desc: `${nextPrep.desc}`,
                btnText: "RECORD THIS ACTION (+15 XP) →",
                actionType: "preparedness",
                target: nextPrep.id
            };
        }
    }

    // 8. MASTER OF READINESS (Everything complete)
    return {
        badge: "SAFETY MASTERY · 100% READY",
        category: "MASTER OF READINESS",
        title: "All Training Drills & Action Plans Mastered! 🎉",
        desc: "You have achieved 100% multi-hazard campus disaster preparedness. Replay scenarios anytime to maintain peak response readiness.",
        btnText: "EXPLORE MY UNLOCKS →",
        actionType: "achievements",
        target: "myUnlocks"
    };
}

function executeDynamicNextStep() {
    const nextStep = currentDynamicNextStep || getDynamicNextStep(state);
    if (!nextStep) return;

    if (nextStep.actionType === "learn") {
        openLearnProtocol(nextStep.target || "fire");
    } else if (nextStep.actionType === "simulation" || nextStep.actionType === "retry") {
        startMission(nextStep.target || "fire");
    } else if (nextStep.actionType === "preparedness") {
        switchSection("preparedness");
        if (nextStep.target && typeof focusOrCompleteNextAction === "function") {
            setTimeout(() => focusOrCompleteNextAction(nextStep.target), 300);
        }
    } else if (nextStep.actionType === "achievements") {
        switchSection("achievements");
        const container = $("myUnlocksContainer");
        if (container) {
            setTimeout(() => container.scrollIntoView({ behavior: "smooth" }), 200);
        }
    }
}

function updateDashboardJourney() {
    // Stage 1: LEARN
    const learnCount = state.completedLearnIds ? state.completedLearnIds.size : 0;
    const learnTotal = 6;
    const learnPct = Math.min(100, Math.round((learnCount / learnTotal) * 100));
    const journeyLearnStatus = $("journeyLearnStatus");
    const journeyLearnBar = $("journeyLearnBar");
    if (journeyLearnStatus) journeyLearnStatus.textContent = `${learnCount} / ${learnTotal}`;
    if (journeyLearnBar) journeyLearnBar.style.width = `${learnPct}%`;

    // Stage 2: PREPARE
    const prepStats = typeof getPreparednessStats === "function" ? getPreparednessStats() : { completed: 0, total: 40, pct: 0 };
    const journeyPrepareStatus = $("journeyPrepareStatus");
    const journeyPrepareBar = $("journeyPrepareBar");
    if (journeyPrepareStatus) journeyPrepareStatus.textContent = `${prepStats.completed} / ${prepStats.total}`;
    if (journeyPrepareBar) journeyPrepareBar.style.width = `${prepStats.pct}%`;

    // Update Preparedness Pipeline Card
    const pipeActions = $("pipelineActionsCount");
    const pipePrep = $("pipelinePrepPct");
    const pipeTactical = $("pipelineTacticalScore");
    if (pipeActions) pipeActions.textContent = `${prepStats.completed} / ${prepStats.total} Actions`;
    if (pipePrep) pipePrep.textContent = `${prepStats.pct}% Plan`;
    if (pipeTactical) pipeTactical.textContent = `${state.readiness}% Readiness`;

    // Stage 3: SIMULATE
    const simCount = state.completedMissionIds ? state.completedMissionIds.size : 0;
    const simTotal = 4;
    const simPct = Math.min(100, Math.round((simCount / simTotal) * 100));
    const journeySimulateStatus = $("journeySimulateStatus");
    const journeySimulateBar = $("journeySimulateBar");
    if (journeySimulateStatus) journeySimulateStatus.textContent = `${simCount} / ${simTotal}`;
    if (journeySimulateBar) journeySimulateBar.style.width = `${simPct}%`;

    // Stage 4: IMPROVE
    const capsCount = state.unlockedCapabilities ? state.unlockedCapabilities.size : 0;
    const capsTotal = 13;
    const improvePct = Math.min(100, Math.round((capsCount / capsTotal) * 100));
    const journeyImproveStatus = $("journeyImproveStatus");
    const journeyImproveBar = $("journeyImproveBar");
    if (journeyImproveStatus) journeyImproveStatus.textContent = `${capsCount} / ${capsTotal}`;
    if (journeyImproveBar) journeyImproveBar.style.width = `${improvePct}%`;

    // Overall Journey Badge
    const overallBadge = $("journeyOverallBadge");
    if (overallBadge) {
        if (state.readiness >= 90 && prepStats.pct >= 80 && simCount === 4) {
            overallBadge.textContent = "CAMPUS RESILIENT · 100%";
            overallBadge.className = "journey-overall-pill status-ready";
        } else if (state.readiness >= 60 || simCount >= 2) {
            overallBadge.textContent = "ADVANCING · IN PROGRESS";
            overallBadge.className = "journey-overall-pill status-advancing";
        } else {
            overallBadge.textContent = "TRAINING ACTIVE";
            overallBadge.className = "journey-overall-pill status-active";
        }
    }

    // Dynamic Next Step
    currentDynamicNextStep = getDynamicNextStep(state);
    if (currentDynamicNextStep) {
        const badgeEl = $("dashboardNextStepBadge");
        const catEl = $("dashboardNextStepCategory");
        const titleEl = $("dashboardNextStepTitle");
        const descEl = $("dashboardNextStepDesc");
        const btnEl = $("dashboardNextStepBtn");

        if (badgeEl) badgeEl.textContent = currentDynamicNextStep.badge;
        if (catEl) catEl.textContent = currentDynamicNextStep.category;
        if (titleEl) titleEl.textContent = currentDynamicNextStep.title;
        if (descEl) descEl.textContent = currentDynamicNextStep.desc;
        if (btnEl) btnEl.textContent = currentDynamicNextStep.btnText;
    }
}

/* =========================================================
   PHASE 3 — CONTEXTUAL TRANSITIONS & CONTINUATION BRIDGES
   ========================================================= */

function startMissionFromLearn(hazardKey) {
    const mod = learnModules[hazardKey];
    if (!mod || !mod.missionKey || hazardKey === "electrical" || hazardKey === "medical") {
        showToast(`${mod ? mod.title : "Emergency"} interactive drill coming soon! Master the knowledge quiz to build readiness.`, "📚");
        return;
    }
    closeLearnProtocol();
    startMission(mod.missionKey);
}

function openResultHazardLearn() {
    if (!state.lastResult || !state.lastResult.missionName) {
        openLearnProtocol("fire");
        return;
    }
    const mKey = state.lastResult.missionName;
    openLearnProtocol(mKey);
}

function openResultHazardPrep() {
    let cat = "all";
    if (state.lastResult && state.lastResult.missionName) {
        cat = state.lastResult.missionName;
    }
    switchSection("preparedness");
    if (typeof filterPrepCategory === "function") {
        filterPrepCategory(cat);
    }
}

function retryCurrentSimulation() {
    if (state.lastResult && state.lastResult.missionName) {
        startMission(state.lastResult.missionName);
    } else if (state.currentMission) {
        startMission(state.currentMission);
    } else {
        startMission("fire");
    }
}

function returnToDashboardFromResults() {
    showPage(dashboardPage);
    switchSection("dashboard");
}

/* =========================================================
   PERFORMANCE & PROGRESS PAGE
   ========================================================= */

function updateProgressPage() {
    const progressContent = $("progressContent");
    if (!progressContent) return;

    calculateReadiness();

    const lvl = typeof calculateLevel === "function" ? calculateLevel(state.totalXP) : { level: Math.max(1, Math.floor((state.totalXP || 0) / 1000) + 1), levelStartXP: 0, nextLevelXP: 1000, remainingXP: 1000, progressPct: 0 };
    const currentLevel = lvl.level;
    const responderRank = getResponderRank(state.totalXP);
    const totalScenarios = 4;
    const completedCount = state.completedMissionIds ? state.completedMissionIds.size : 0;
    const completionPct = Math.min(100, Math.round((completedCount / totalScenarios) * 100));

    // Render Hero Responder Profile & Readiness Report
    renderResponderProfile();
    renderReadinessReport();

    /* -------------------------
       1. OVERALL READINESS HERO
    -------------------------- */
    const readinessScoreEl = $("progressReadinessScore");
    const readinessBarEl = $("progressReadinessBar");
    const readinessBadgeEl = $("progressReadinessBadge");
    const readinessTitleEl = $("progressReadinessTitle");
    const readinessDescEl = $("progressReadinessDesc");

    if (readinessScoreEl) readinessScoreEl.textContent = state.readiness;
    if (readinessBarEl) readinessBarEl.style.width = `${state.readiness}%`;

    let readyBadge = "FOUNDATION · INITIAL DRILLS";
    let readyTitle = "Training Active";
    let readyDesc = "Complete guided disaster response scenarios to build practical confidence and raise your readiness.";

    if (state.readiness >= 90) {
        readyBadge = "RESPONSE-READY · HIGH MASTERY";
        readyTitle = "Exemplary Crisis Readiness";
        readyDesc = "You possess high disaster response capability across emergency scenarios. Keep drilling to maintain peak readiness.";
    } else if (state.readiness >= 75) {
        readyBadge = "CRISIS-CAPABLE · STRONG PROGRESS";
        readyTitle = "Response-Ready Performance";
        readyDesc = "You are developing strong scenario response capabilities. Continue scenario training to build comprehensive preparedness.";
    } else if (state.readiness >= 50) {
        readyBadge = "STEADY PROGRESS · ADVANCING DRILLS";
        readyTitle = "Moderate Preparedness";
        readyDesc = "Fundamental emergency protocols established. Complete intermediate simulations to advance your readiness.";
    }

    if (readinessBadgeEl) readinessBadgeEl.textContent = readyBadge;
    if (readinessTitleEl) readinessTitleEl.textContent = readyTitle;
    if (readinessDescEl) readinessDescEl.textContent = readyDesc;

    /* -------------------------
       2. TRAINING PROGRESSION HUD
    -------------------------- */
    const progMissionsCompleted = $("progMissionsCompleted");
    const progMissionsPct = $("progMissionsPct");
    const progMissionsBar = $("progMissionsBar");
    const progMissionsDesc = $("progMissionsDesc");

    if (progMissionsCompleted) progMissionsCompleted.textContent = `${completedCount} / ${totalScenarios}`;
    if (progMissionsPct) progMissionsPct.textContent = `${completionPct}%`;
    if (progMissionsBar) progMissionsBar.style.width = `${completionPct}%`;
    if (progMissionsDesc) {
        progMissionsDesc.textContent = completedCount === totalScenarios
            ? "All 4 digital scenarios completed! 🌟"
            : `${totalScenarios - completedCount} scenario${totalScenarios - completedCount > 1 ? "s" : ""} pending completion.`;
    }

    const progTotalXP = $("progTotalXP");
    const progTotalXPBar = $("progTotalXPBar");
    const progTotalXPDesc = $("progTotalXPDesc");

    const levelStart = lvl.levelStartXP !== undefined ? lvl.levelStartXP : (currentLevel - 1) * 200;
    const xpInsideLevel = lvl.xpIntoLevel !== undefined ? lvl.xpIntoLevel : (state.totalXP - levelStart);
    const xpPercentage = lvl.progressPct !== undefined ? lvl.progressPct : Math.min(100, Math.max(0, Math.round((xpInsideLevel / 200) * 100)));

    if (progTotalXP) progTotalXP.textContent = formatNumber(state.totalXP);
    if (progTotalXPBar) progTotalXPBar.style.width = `${xpPercentage}%`;
    if (progTotalXPDesc) progTotalXPDesc.textContent = `All disaster drills (${formatNumber(state.totalXP)} XP total)`;

    const progCurrentLevel = $("progCurrentLevel");
    const progRankTag = $("progRankTag");
    const progRankBar = $("progRankBar");
    const progRankTitle = $("progRankTitle");

    if (progCurrentLevel) progCurrentLevel.textContent = `LVL ${String(currentLevel).padStart(2, "0")}`;
    if (progRankTag) progRankTag.textContent = responderRank.tag || "ROOKIE";
    if (progRankBar) progRankBar.style.width = `${Math.min(100, (currentLevel / 12) * 100)}%`;
    if (progRankTitle) progRankTitle.textContent = `${responderRank.title}`;

    const nextLevelXP = lvl.nextLevelXP !== undefined ? lvl.nextLevelXP : currentLevel * 200;
    const remainingToNext = lvl.xpToNextLevel !== undefined ? lvl.xpToNextLevel : Math.max(0, nextLevelXP - state.totalXP);

    const progLevelRemaining = $("progLevelRemaining");
    const progLevelRemainingBar = $("progLevelRemainingBar");
    const progNextLevelTarget = $("progNextLevelTarget");

    if (progLevelRemaining) progLevelRemaining.textContent = formatNumber(remainingToNext);
    if (progLevelRemainingBar) progLevelRemainingBar.style.width = `${xpPercentage}%`;
    if (progNextLevelTarget) {
        progNextLevelTarget.textContent = `XP until Level ${String(currentLevel + 1).padStart(2, "0")}`;
    }

    /* -------------------------
       3. MISSION PERFORMANCE MATRIX
    -------------------------- */
    const missionConfig = [
        { key: "fire", name: "Building Fire", maxXP: 200 },
        { key: "flood", name: "Flash Flood", maxXP: 250 },
        { key: "cyclone", name: "Cyclone Emergency", maxXP: 300 },
        { key: "earthquake", name: "Earthquake Response", maxXP: 300 }
    ];

    missionConfig.forEach(m => {
        const capitalizedKey = m.key.charAt(0).toUpperCase() + m.key.slice(1);
        const statusEl = $(`perf${capitalizedKey}Status`);
        const gradeEl = $(`perf${capitalizedKey}Grade`);
        const scoreEl = $(`perf${capitalizedKey}Score`);

        const isCompleted = state.completedMissionIds && state.completedMissionIds.has(m.key);
        const bestGrade = state.missionBestGrades ? state.missionBestGrades[m.key] : null;
        const bestScore = state.missionBestScores ? state.missionBestScores[m.key] : null;

        if (statusEl) {
            if (isCompleted) {
                statusEl.className = "perf-badge-done";
                statusEl.textContent = "✓ COMPLETED";
            } else {
                statusEl.className = "perf-badge-pending";
                statusEl.textContent = "PENDING";
            }
        }

        if (gradeEl) {
            gradeEl.textContent = bestGrade ? `Grade ${bestGrade}` : "Not Attempted";
        }

        if (scoreEl) {
            scoreEl.textContent = bestScore ? `${bestScore}%` : "0%";
        }
    });

    const progMasteryCount = $("progMasteryCount");
    if (progMasteryCount) progMasteryCount.textContent = completedCount;

    /* -------------------------
       4. STREAK & TELEMETRY
    -------------------------- */
    const today = getLocalDateString();
    let isCompletedToday = false;
    let effectiveStreak = 0;

    if (state.lastActivityDate) {
        const dayDiff = getCalendarDayDiff(state.lastActivityDate, today);
        if (dayDiff === 0) {
            isCompletedToday = true;
            effectiveStreak = state.dailyStreak || 1;
        } else if (dayDiff === 1) {
            isCompletedToday = false;
            effectiveStreak = state.dailyStreak || 0;
        } else {
            isCompletedToday = false;
            effectiveStreak = 0;
        }
    }

    const progStreakCurrent = $("progStreakCurrent");
    const progStreakLongest = $("progStreakLongest");
    const progStreakTodayStatus = $("progStreakTodayStatus");
    const progStreakMessage = $("progStreakMessage");

    if (progStreakCurrent) progStreakCurrent.textContent = String(effectiveStreak).padStart(2, "0");
    if (progStreakLongest) progStreakLongest.textContent = String(Math.max(state.longestStreak || 1, effectiveStreak)).padStart(2, "0");

    if (progStreakTodayStatus) {
        if (isCompletedToday) {
            progStreakTodayStatus.className = "perf-badge-done";
            progStreakTodayStatus.textContent = "✓ COMPLETED TODAY";
        } else {
            progStreakTodayStatus.className = "perf-badge-pending";
            progStreakTodayStatus.textContent = "⚡ PENDING TODAY";
        }
    }

    if (progStreakMessage) {
        progStreakMessage.textContent = isCompletedToday
            ? `Daily emergency protocol secured! ${effectiveStreak}-day streak active.`
            : `Complete an emergency drill today to keep your daily streak active.`;
    }

    /* -------------------------
       5. EDUCATIONAL MODULE MASTERY (LEARN HUB)
    -------------------------- */
    const totalLearnModules = 6;
    const completedLearnCount = state.completedLearnIds ? state.completedLearnIds.size : 0;
    const learnCompletionPct = Math.min(100, Math.round((completedLearnCount / totalLearnModules) * 100));

    const progLearnCountEl = $("progLearnCount");
    const progLearnBarEl = $("progLearnBar");

    if (progLearnCountEl) progLearnCountEl.textContent = `${completedLearnCount} / ${totalLearnModules}`;
    if (progLearnBarEl) progLearnBarEl.style.width = `${learnCompletionPct}%`;

    const learnModuleConfigs = [
        { key: "fire", name: "Fire Safety" },
        { key: "flood", name: "Flood Safety" },
        { key: "cyclone", name: "Cyclone Preparedness" },
        { key: "earthquake", name: "Earthquake Safety" },
        { key: "electrical", name: "Electrical Emergency" },
        { key: "medical", name: "Medical Emergency" }
    ];

    learnModuleConfigs.forEach(m => {
        const capitalizedKey = m.key.charAt(0).toUpperCase() + m.key.slice(1);
        const statusEl = $(`progLearnStatus${capitalizedKey}`);
        const scoreEl = $(`progLearnScore${capitalizedKey}`);
        const stateEl = $(`progLearnState${capitalizedKey}`);

        const isCompleted = state.completedLearnIds && state.completedLearnIds.has(m.key);
        const quizResult = state.learnQuizScores ? state.learnQuizScores[m.key] : null;

        if (statusEl) {
            if (isCompleted) {
                statusEl.className = "perf-badge-done";
                statusEl.textContent = "✓ COMPLETED";
            } else {
                statusEl.className = "perf-badge-pending";
                statusEl.textContent = "AVAILABLE";
            }
        }

        if (scoreEl) {
            scoreEl.textContent = quizResult ? `${quizResult.score} / 5 (${quizResult.pct}%)` : "0 / 5";
        }

        if (stateEl) {
            stateEl.textContent = isCompleted ? "Mastered" : "Available";
        }
    });

    /* -------------------------
       6. ACHIEVEMENTS SUMMARY
    -------------------------- */
    const achievementCards = document.querySelectorAll(".achievement-card");
    const totalBadges = achievementCards.length || 8;
    const unlockedBadgesCount = state.unlockedAchievements ? state.unlockedAchievements.size : 0;
    const badgesPct = Math.min(100, Math.round((unlockedBadgesCount / totalBadges) * 100));

    const progBadgesUnlocked = $("progBadgesUnlocked");
    const progBadgesProgressBar = $("progBadgesProgressBar");
    const progBadgesSummary = $("progBadgesSummary");

    if (progBadgesUnlocked) progBadgesUnlocked.textContent = `${unlockedBadgesCount} / ${totalBadges}`;
    if (progBadgesProgressBar) progBadgesProgressBar.style.width = `${badgesPct}%`;
    if (progBadgesSummary) {
        progBadgesSummary.textContent = unlockedBadgesCount === totalBadges
            ? "All 8 honors & badges unlocked! 👑"
            : `${totalBadges - unlockedBadgesCount} badge${totalBadges - unlockedBadgesCount > 1 ? "s" : ""} pending unlock.`;
    }

    /* -------------------------
       6. STUDENT & CAMPUS PREPAREDNESS PLAN TELEMETRY
    -------------------------- */
    const prepStats = typeof getPreparednessStats === "function" ? getPreparednessStats() : { pct: 0, completed: 0, remaining: 40, total: 40 };
    const nextAction = typeof getNextBestAction === "function" ? getNextBestAction() : null;

    const progPrepScoreEl = $("progPrepScore");
    const progPrepBarEl = $("progPrepBar");
    const progPrepCompletedEl = $("progPrepCompleted");
    const progPrepPriorityBadgeEl = $("progPrepPriorityBadge");
    const progPrepPriorityTitleEl = $("progPrepPriorityTitle");
    const progPrepPriorityDescEl = $("progPrepPriorityDesc");
    const progPrepSummaryTextEl = $("progPrepSummaryText");

    if (progPrepScoreEl) progPrepScoreEl.textContent = `${prepStats.pct}%`;
    if (progPrepBarEl) progPrepBarEl.style.width = `${prepStats.pct}%`;
    if (progPrepCompletedEl) progPrepCompletedEl.textContent = `${prepStats.completed} / ${prepStats.total}`;
    if (progPrepSummaryTextEl) {
        progPrepSummaryTextEl.textContent = prepStats.pct >= 80
            ? "Exemplary student and campus readiness achieved. Plan is active."
            : `${prepStats.remaining} actionable student steps remaining.`;
    }

    if (nextAction) {
        if (progPrepPriorityBadgeEl) {
            progPrepPriorityBadgeEl.textContent = nextAction.priority === "high" ? "HIGH PRIORITY" : "RECOMMENDED";
            progPrepPriorityBadgeEl.className = nextAction.priority === "high" ? "perf-badge-pending" : "perf-badge-active";
        }
        if (progPrepPriorityTitleEl) progPrepPriorityTitleEl.textContent = `${nextAction.icon} ${nextAction.title}`;
        if (progPrepPriorityDescEl) progPrepPriorityDescEl.textContent = nextAction.desc;
    } else {
        if (progPrepPriorityBadgeEl) {
            progPrepPriorityBadgeEl.textContent = "100% COMPLETE";
            progPrepPriorityBadgeEl.className = "perf-badge-done";
        }
        if (progPrepPriorityTitleEl) progPrepPriorityTitleEl.textContent = "🏆 All Actions Verified";
        if (progPrepPriorityDescEl) progPrepPriorityDescEl.textContent = "Your student emergency preparedness plan is fully complete.";
    }

    /* -------------------------
       7. PERFORMANCE HISTORY LOG
    -------------------------- */
    const historyContainer = $("progHistoryContainer");
    const historyCountEl = $("progHistoryCount");

    const historyList = state.performanceHistory || [];

    if (historyCountEl) {
        historyCountEl.textContent = `${historyList.length} Session${historyList.length === 1 ? "" : "s"} Logged`;
    }

    if (historyContainer) {
        if (historyList.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-history">
                    <div class="empty-icon">📋</div>
                    <p>No completed drill records yet. Complete emergency drills to record your performance history.</p>
                </div>
            `;
        } else {
            let tableHTML = `
                <table class="perf-history-table">
                    <thead>
                        <tr>
                            <th>DATE & TIME</th>
                            <th>SIMULATION SCENARIO</th>
                            <th>SCORE & GRADE</th>
                            <th>XP EARNED</th>
                            <th>READINESS</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            historyList.forEach(item => {
                const gradeBadge = `<span class="grade-badge-mini">${item.grade || "A"}</span>`;
                tableHTML += `
                    <tr>
                        <td>${item.date || "Today"} <small style="color: var(--muted); margin-left: 4px;">${item.time || ""}</small></td>
                        <td><strong>${item.missionTitle || item.missionId}</strong></td>
                        <td>${item.score}% ${gradeBadge}</td>
                        <td style="color: var(--purple-bright); font-weight: 700;">+${item.xpEarned} XP</td>
                        <td>${item.readinessSnapshot || state.readiness}%</td>
                    </tr>
                `;
            });

            tableHTML += `
                    </tbody>
                </table>
            `;
            historyContainer.innerHTML = tableHTML;
        }
    }
}


/* =========================================================
   ACHIEVEMENT UNLOCK EVALUATION & REWARD CELEBRATION
   ========================================================= */

const ACHIEVEMENT_CAPABILITY_MAP = {
    "First Mission Completed": "mission_replay_lab",
    "Perfect Response": "precision_mode",
    "All 4 Missions Completed": "all_hazard_command_kit",
    "Level 5 Achieved": "command_briefing",
    "Quick Thinker": "rapid_response_toolkit",
    "Flood Survivor": "flood_escape_planner",
    "Storm Master": "cyclone_ready_mode",
    "Leaderboard Champion": "responder_elite_title",
    "Preparedness Starter": "personal_readiness_console",
    "Emergency Kit Ready": "emergency_kit_builder",
    "Family Plan Ready": "emergency_plan_builder",
    "Multi-Hazard Ready": "hazard_radar",
    "Preparedness Master": "preparedness_passport"
};

const achievementRewards = {
    "First Mission Completed": 50,
    "First Response": 50,
    "Perfect Response": 100,
    "All 4 Missions Completed": 200,
    "Level 5 Achieved": 100,
    "Quick Thinker": 75,
    "Flood Survivor": 75,
    "Storm Ready": 75,
    "Storm Master": 75,
    "Seismic Shield": 75,
    "Response Master": 100,
    "Knowledge Seeker": 75,
    "Leaderboard Champion": 100,
    "Preparedness Starter": 50,
    "Emergency Kit Ready": 75,
    "Family Plan Ready": 75,
    "Multi-Hazard Ready": 100,
    "Preparedness Master": 200
};

function checkAndToastNewAchievements() {
    const levelObj = (typeof calculateLevel === "function")
        ? calculateLevel(state.totalXP || 0)
        : { level: Math.floor((state.totalXP || 0) / 200) + 1 };
    const currentLevel = levelObj.level;

    const isPrepItemDone = (id) => Boolean(state.prepChecklistState && state.prepChecklistState[id] && state.prepChecklistState[id].completed);
    const countPrepDone = Object.values(state.prepChecklistState || {}).filter(item => item && item.completed).length;

    const hasEmergencyKit = ["core_gobag", "core_water_food", "core_firstaid", "core_power_torch", "core_docs"].every(isPrepItemDone);
    const hasFamilyPlan = ["core_contacts", "core_comm_plan", "core_evac_routes", "core_shelter_id"].every(isPrepItemDone);
    const hasMultiHazard = ["fire", "flood", "cyclone", "earthquake", "electrical", "medical"].every(cat => {
        return (typeof prepChecklistData !== "undefined" ? prepChecklistData : []).filter(i => i.category === cat).some(i => isPrepItemDone(i.id));
    });
    const hasPrepMaster = countPrepDone >= 32;

    const floodClearedWith80 = Boolean(
        state.completedMissionIds && state.completedMissionIds.has("flood") && (
            (state.missionBestScores && state.missionBestScores["flood"] >= 80) ||
            (state.performanceHistory && state.performanceHistory.some(h => (h.missionId === "flood" || h.missionTitle === "Flash Flood") && h.score >= 80)) ||
            (state.lastResult && (state.lastResult.missionName === "flood" || state.lastResult.missionTitle === "Flash Flood") && state.lastResult.score >= 80)
        )
    );

    const definitions = [
        { id: "First Mission Completed", test: state.completedMissions >= 1 || (state.completedMissionIds && state.completedMissionIds.size >= 1) },
        { id: "Perfect Response", test: (state.lastResult && state.lastResult.score >= 95) || Object.values(state.missionBestScores || {}).some(s => s >= 95) },
        { id: "All 4 Missions Completed", test: ["fire", "flood", "cyclone", "earthquake"].every(id => state.completedMissionIds && state.completedMissionIds.has(id)) },
        { id: "Level 5 Achieved", test: currentLevel >= 5 || (state.totalXP || 0) >= 800 },
        { id: "Quick Thinker", test: state.correctDecisions >= 5 },
        { id: "Flood Survivor", test: floodClearedWith80 },
        { id: "Storm Master", test: state.completedMissionIds && state.completedMissionIds.has("cyclone") },
        { id: "Leaderboard Champion", test: (state.totalXP || 0) >= 1500 },
        { id: "Preparedness Starter", test: (state.completedPrepItemIds && state.completedPrepItemIds.size >= 1) || countPrepDone >= 1 },
        { id: "Emergency Kit Ready", test: hasEmergencyKit },
        { id: "Family Plan Ready", test: hasFamilyPlan },
        { id: "Multi-Hazard Ready", test: hasMultiHazard },
        { id: "Preparedness Master", test: hasPrepMaster }
    ];

    if (!state.unlockedAchievements) {
        state.unlockedAchievements = new Set();
    }
    if (!state.rewardedAchievements) {
        state.rewardedAchievements = new Set();
    }
    if (!state.unlockedCapabilities) {
        state.unlockedCapabilities = new Set();
    }

    definitions.forEach(ach => {
        if (ach.test) {
            const isNewlyUnlocked = !state.unlockedAchievements.has(ach.id);
            if (isNewlyUnlocked) {
                state.unlockedAchievements.add(ach.id);
            }

            const capId = ACHIEVEMENT_CAPABILITY_MAP[ach.id];
            let newlyUnlockedCap = false;
            if (capId && !state.unlockedCapabilities.has(capId)) {
                state.unlockedCapabilities.add(capId);
                newlyUnlockedCap = true;
            }

            if (!state.rewardedAchievements.has(ach.id)) {
                state.rewardedAchievements.add(ach.id);
                const bonusXP = achievementRewards[ach.id] || 50;
                state.totalXP += bonusXP;
                
                const cap = capId ? getCapability(capId) : null;
                if (cap) {
                    showToast(`🏆 ${ach.id} (+${bonusXP} XP) • 🔓 Unlocked: ${cap.name}!`, "🎖️");
                } else {
                    showToast(`Achievement Unlocked: ${ach.id}! (+${bonusXP} Bonus XP)`, "🎖️");
                }
                if (typeof triggerCelebration === "function") {
                    triggerCelebration("badge_unlock", { badgeName: ach.id });
                }
            } else if (isNewlyUnlocked || newlyUnlockedCap) {
                const cap = capId ? getCapability(capId) : null;
                if (cap) {
                    showToast(`🏆 ${ach.id} • 🔓 Unlocked: ${cap.name}!`, "🎖️");
                } else {
                    showToast(`Achievement Unlocked: ${ach.id}!`, "🎖️");
                }
                if (isNewlyUnlocked && typeof triggerCelebration === "function") {
                    triggerCelebration("badge_unlock", { badgeName: ach.id });
                }
            }
        }
    });

    saveProgress();
    updateAchievements();
}

/* =========================================================
   READYVERSE CAPABILITY CATALOG & VIEWER SYSTEM (PHASE 2B.1)
   ========================================================= */

const CAPABILITIES_CATALOG = {
    mission_replay_lab: {
        id: "mission_replay_lab",
        name: "Drill Replay",
        icon: "🔬",
        category: "PRACTICE TOOL",
        shortDesc: "See what happened after your choices.",
        achievementId: "First Mission Completed",
        howToUnlock: "Complete your first disaster mission.",
        whatYouGet: [
            "Step-by-step review of the choices you made",
            "What happened immediately after each decision",
            "Key safety rules to remember next time"
        ],
        renderContent: (st) => {
            const history = st.performanceHistory || [];
            return `
                <div class="capability-tool-container">
                    <div class="cap-tool-header">
                        <div class="cap-tool-title">MISSION REPLAY & DECISION REVIEW</div>
                        <p class="cap-tool-desc">Look back at your completed simulations and review the key safety rules.</p>
                    </div>
                    <div class="cap-replay-sessions">
                        <div class="cap-section-subtitle">RECENT COMPLETED SESSIONS (${history.length})</div>
                        ${history.length === 0 ? `
                            <div class="cap-empty-box">
                                <span>📋</span>
                                <p>No completed drills yet. Finish any disaster mission to review your decisions here.</p>
                            </div>
                        ` : `
                            <div class="cap-history-list">
                                ${history.map((h) => `
                                    <div class="cap-history-item">
                                        <div class="cap-item-left">
                                            <span class="cap-item-badge">${h.grade || "A"}</span>
                                            <div>
                                                <strong>${escapeHtml(h.missionTitle || h.missionId)}</strong>
                                                <small>${h.date || "Today"} ${h.time || ""}</small>
                                            </div>
                                        </div>
                                        <div class="cap-item-right">
                                            <span>Score: <strong>${h.score}%</strong></span>
                                            <span style="color: var(--purple-bright);">+${h.xpEarned} XP</span>
                                        </div>
                                    </div>
                                `).join("")}
                            </div>
                        `}
                    </div>
                    <div class="cap-replay-tactics">
                        <div class="cap-section-subtitle">KEY SAFETY RULES TO REMEMBER</div>
                        <div class="cap-grid-2">
                            <div class="cap-info-card">
                                <strong>1. Act in the first 10 seconds</strong>
                                <p>Taking immediate safety action right away prevents danger from spreading.</p>
                            </div>
                            <div class="cap-info-card">
                                <strong>2. Check your exit path first</strong>
                                <p>Always make sure stairs and exits are clear of smoke or water before moving forward.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },
    precision_mode: {
        id: "precision_mode",
        name: "Precision Mode",
        icon: "🎯",
        category: "CHALLENGE MODE",
        shortDesc: "Ready for a harder challenge? Make every decision count.",
        achievementId: "Perfect Response",
        howToUnlock: "Earn a perfect score on any disaster mission.",
        whatYouGet: [
            "Target decision times for each emergency scenario",
            "Ideal response guide for maximum survival score",
            "Fast-paced benchmark standards to test your skills"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">PRECISION TIME TARGETS & BEST PRACTICES</div>
                    <p class="cap-tool-desc">Target response times and proven survival rules for each disaster scenario.</p>
                </div>
                <div class="cap-benchmark-table-wrapper">
                    <table class="cap-table">
                        <thead>
                            <tr>
                                <th>DISASTER SCENARIO</th>
                                <th>TOTAL MISSION TIME</th>
                                <th>DECISION TIME GOAL</th>
                                <th>BEST ACTION STEPS</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Building Fire</strong></td>
                                <td>75s Total</td>
                                <td>&le; 9s per choice</td>
                                <td>Crawl under smoke &bull; Feel doors with back of hand &bull; Pull alarm immediately</td>
                            </tr>
                            <tr>
                                <td><strong>Flash Flood</strong></td>
                                <td>90s Total</td>
                                <td>&le; 11s per choice</td>
                                <td>Never walk in 6"+ moving water &bull; Head to higher floors &bull; Cut off main power</td>
                            </tr>
                            <tr>
                                <td><strong>Cyclone Emergency</strong></td>
                                <td>90s Total</td>
                                <td>&le; 11s per choice</td>
                                <td>Shelter in windowless interior room &bull; Stay inside during the calm eye</td>
                            </tr>
                            <tr>
                                <td><strong>Earthquake Response</strong></td>
                                <td>60s Total</td>
                                <td>&le; 8s per choice</td>
                                <td>Drop, Cover & Hold On &bull; Protect head/neck &bull; Move only after shaking stops</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `
    },
    all_hazard_command_kit: {
        id: "all_hazard_command_kit",
        name: "All-Hazard Kit",
        icon: "🛡️",
        category: "SAFETY CARD",
        shortDesc: "Bring your Fire, Flood, Cyclone and Earthquake skills together.",
        achievementId: "All 4 Missions Completed",
        howToUnlock: "Complete all 4 disaster missions.",
        whatYouGet: [
            "Unified 3-phase guide (Alert, Evacuate, Safe) for 4 disasters",
            "Side-by-side comparison of life-saving steps",
            "Quick reference card for campus emergencies"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">ALL-HAZARD SAFETY QUICK GUIDE</div>
                    <p class="cap-tool-desc">Clear 3-phase action steps for Fire, Flood, Cyclone, and Earthquake emergencies.</p>
                </div>
                <div class="cap-tabs-grid">
                    <div class="cap-hazard-card">
                        <div class="cap-hazard-head"><span class="cap-icon">🔥</span><strong>BUILDING FIRE</strong></div>
                        <ul>
                            <li><strong>Phase 1 (Alert):</strong> Shout to alert others, pull fire alarm, crawl low below smoke.</li>
                            <li><strong>Phase 2 (Evacuate):</strong> Feel door with back of hand. Take stairs, never elevators.</li>
                            <li><strong>Phase 3 (Safe):</strong> Head to campus assembly point; check in with floor leader.</li>
                        </ul>
                    </div>
                    <div class="cap-hazard-card">
                        <div class="cap-hazard-head"><span class="cap-icon">🌊</span><strong>FLASH FLOOD</strong></div>
                        <ul>
                            <li><strong>Phase 1 (Alert):</strong> Move immediately to higher floors or higher ground.</li>
                            <li><strong>Phase 2 (Hazards):</strong> Turn off main power if dry. Never walk or drive into flood water.</li>
                            <li><strong>Phase 3 (Safe):</strong> Stay clear of standing water; drink only sealed bottled water.</li>
                        </ul>
                    </div>
                    <div class="cap-hazard-card">
                        <div class="cap-hazard-head"><span class="cap-icon">🌪️</span><strong>CYCLONE EMERGENCY</strong></div>
                        <ul>
                            <li><strong>Phase 1 (Prep):</strong> Bring loose items indoors; charge phones & power banks; seal windows.</li>
                            <li><strong>Phase 2 (Shelter):</strong> Stay in an interior room without windows; protect head with mattress.</li>
                            <li><strong>Phase 3 (Eye Warning):</strong> Do not go out during the calm eye; strong winds return suddenly.</li>
                        </ul>
                    </div>
                    <div class="cap-hazard-card">
                        <div class="cap-hazard-head"><span class="cap-icon">⚡</span><strong>EARTHQUAKE RESPONSE</strong></div>
                        <ul>
                            <li><strong>Phase 1 (Shake):</strong> DROP to hands/knees, COVER under a sturdy desk, HOLD ON tightly.</li>
                            <li><strong>Phase 2 (Protect):</strong> Stay away from windows, mirrors, and tall furniture.</li>
                            <li><strong>Phase 3 (After):</strong> Check for damaged wires and gas leaks; expect aftershocks.</li>
                        </ul>
                    </div>
                </div>
            </div>
        `
    },
    command_briefing: {
        id: "command_briefing",
        name: "Drill Briefing",
        icon: "📋",
        category: "CAMPUS GUIDE",
        shortDesc: "Look at the situation like a responder.",
        achievementId: "Level 5 Achieved",
        howToUnlock: "Reach Level 05 in ReadyVerse.",
        whatYouGet: [
            "Practical guide for leading dorm and campus evacuations",
            "Roll call and headcount steps after leaving a building",
            "Quick debrief checklist to review how everyone did"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">CAMPUS EVACUATION LEADER GUIDE</div>
                    <p class="cap-tool-desc">Practical steps for student floor leaders and safety marshals during drills and evacuations.</p>
                </div>
                <div class="cap-briefing-sections">
                    <div class="cap-brief-block">
                        <strong>🎯 1. BEFORE EVACUATING</strong>
                        <p>Check that dorm hallways and exit stairs are clear. Help roommates who need assistance and make sure everyone leaves calmly.</p>
                    </div>
                    <div class="cap-brief-block">
                        <strong>📣 2. HEADCOUNT AT THE ASSEMBLY POINT</strong>
                        <p>Once outside on the sports ground or lawn, quickly count your group. Note who is present and immediately report any missing student to security.</p>
                    </div>
                    <div class="cap-brief-block">
                        <strong>📊 3. QUICK 5-MINUTE REVIEW</strong>
                        <p>Gather your group for a brief review: Did everyone hear the alarm? Did everyone take the stairs? What can be done faster next time?</p>
                    </div>
                </div>
            </div>
        `
    },
    rapid_response_toolkit: {
        id: "rapid_response_toolkit",
        name: "Rapid Response",
        icon: "⚡",
        category: "EMERGENCY GUIDE",
        shortDesc: "Learn what to do first when every second matters.",
        achievementId: "Quick Thinker",
        howToUnlock: "Make 5 safe crisis decisions under time pressure.",
        whatYouGet: [
            "The single most critical action in the first 30 seconds",
            "Dangerous common mistakes to avoid immediately",
            "Clear DOs and DON'Ts for fire, shaking, flood & wires"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">FIRST-30-SECONDS ACTION GUIDE</div>
                    <p class="cap-tool-desc">What to do first — and what never to do — when an emergency starts.</p>
                </div>
                <div class="cap-rapid-grid">
                    <div class="cap-rapid-row">
                        <div class="cap-crisis-col"><strong>🔥 Heavy Smoke in Corridor</strong></div>
                        <div class="cap-do-col"><span class="cap-tag-do">DO FIRST</span> Drop low to crawl; cover mouth/nose with damp cloth; feel door before opening.</div>
                        <div class="cap-dont-col"><span class="cap-tag-dont">NEVER DO</span> Walk standing upright into thick smoke; use elevators; open a hot door.</div>
                    </div>
                    <div class="cap-rapid-row">
                        <div class="cap-crisis-col"><strong>⚡ Strong Ground Shaking</strong></div>
                        <div class="cap-do-col"><span class="cap-tag-do">DO FIRST</span> Drop under a sturdy desk or table immediately; hold on and protect your head.</div>
                        <div class="cap-dont-col"><span class="cap-tag-dont">NEVER DO</span> Run outside while shaking is happening; stand near windows or glass doors.</div>
                    </div>
                    <div class="cap-rapid-row">
                        <div class="cap-crisis-col"><strong>🌊 Rising Water Outside</strong></div>
                        <div class="cap-do-col"><span class="cap-tag-do">DO FIRST</span> Move upstairs to higher building floors; take your phone, charger and Go-Bag.</div>
                        <div class="cap-dont-col"><span class="cap-tag-dont">NEVER DO</span> Try to walk, wade, or drive through moving water.</div>
                    </div>
                    <div class="cap-rapid-row">
                        <div class="cap-crisis-col"><strong>🔌 Fallen Electrical Wire</strong></div>
                        <div class="cap-do-col"><span class="cap-tag-do">DO FIRST</span> Stay at least 10 meters (33 feet) away; alert others and call campus security.</div>
                        <div class="cap-dont-col"><span class="cap-tag-dont">NEVER DO</span> Touch the wire, touch water touching the wire, or use a stick to move it.</div>
                    </div>
                </div>
            </div>
        `
    },
    flood_escape_planner: {
        id: "flood_escape_planner",
        name: "Flood Escape Planner",
        icon: "🌊",
        category: "PLANNING TOOL",
        shortDesc: "Plan where you'll go before the water rises.",
        achievementId: "Flood Survivor",
        howToUnlock: "Complete the Flash Flood simulation with 80%+ readiness.",
        whatYouGet: [
            "Water depth danger guide (when walking or driving becomes unsafe)",
            "Safe evacuation routes when ground floors flood",
            "Emergency water safety & simple purification steps"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">WATER DEPTH SAFETY & EVACUATION GUIDE</div>
                    <p class="cap-tool-desc">Understanding water depth dangers and essential clean water safety steps.</p>
                </div>
                <div class="cap-depth-meters">
                    <div class="cap-depth-item depth-low">
                        <div class="cap-depth-val">6 INCHES (15 CM)</div>
                        <div class="cap-depth-info">
                            <strong>Can Knock Down an Adult</strong>
                            <p>Just 6 inches of fast-moving water can knock you off your feet and stall car exhaust pipes.</p>
                        </div>
                    </div>
                    <div class="cap-depth-item depth-med">
                        <div class="cap-depth-val">12 INCHES (30 CM)</div>
                        <div class="cap-depth-info">
                            <strong>Floats Cars and Sedans</strong>
                            <p>12 inches of water will float most small cars, causing you to lose steering control.</p>
                        </div>
                    </div>
                    <div class="cap-depth-item depth-high">
                        <div class="cap-depth-val">24 INCHES (60 CM)</div>
                        <div class="cap-depth-info">
                            <strong>Sweeps Away SUVs & Trucks</strong>
                            <p>2 feet of rushing water can sweep away heavy vehicles and damage light walls.</p>
                        </div>
                    </div>
                </div>
                <div class="cap-flood-rules">
                    <strong>🚰 EMERGENCY CLEAN WATER TIP</strong>
                    <p>If tap water is unsafe: Boil water at a rolling boil for 1 full minute before drinking, or use sealed bottled water.</p>
                </div>
            </div>
        `
    },
    cyclone_ready_mode: {
        id: "cyclone_ready_mode",
        name: "Storm Ready Mode",
        icon: "🌪️",
        category: "SAFETY GUIDE",
        shortDesc: "Prepare before the storm gets worse.",
        achievementId: "Storm Master",
        howToUnlock: "Complete the Cyclone Emergency simulation.",
        whatYouGet: [
            "Safest rooms to take shelter in during extreme winds",
            "Critical warning about the eye of the storm (false calm)",
            "4-point storm lockdown checklist"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">CYCLONE SAFETY & LOCKDOWN GUIDE</div>
                    <p class="cap-tool-desc">Shelter selection, pre-storm checklist, and the eye-of-the-storm survival rule.</p>
                </div>
                <div class="cap-grid-2">
                    <div class="cap-info-card">
                        <strong>🛡️ PICKING A SAFE ROOM</strong>
                        <p>Choose an inside hallway or room on the lowest floor with no windows. Keep blankets and mattresses close by to shield against glass or debris.</p>
                    </div>
                    <div class="cap-info-card">
                        <strong>⚠️ THE EYE OF THE STORM (FALSE CALM)</strong>
                        <p>When the eye passes, the wind suddenly stops. <strong>STAY INSIDE.</strong> The second half of the storm will hit shortly from the opposite direction with equal force.</p>
                    </div>
                </div>
                <div class="cap-cyclone-checklist">
                    <strong>4-POINT STORM LOCKDOWN CHECKLIST</strong>
                    <ul>
                        <li>✓ Charge your phone, power banks, and flashlights fully before the storm arrives.</li>
                        <li>✓ Store at least a 3-day supply of drinking water (3 liters per person per day).</li>
                        <li>✓ Move bicycles, plant pots, and loose items inside off balconies and verandas.</li>
                        <li>✓ Unplug laptops, chargers, and non-essential electronics from wall sockets.</li>
                    </ul>
                </div>
            </div>
        `
    },
    responder_elite_title: {
        id: "responder_elite_title",
        name: "Responder Elite",
        icon: "🏆",
        category: "RECOGNITION",
        shortDesc: "A special ReadyVerse status for top performers.",
        achievementId: "Leaderboard Champion",
        howToUnlock: "Reach the top tier on the campus leaderboard.",
        whatYouGet: [
            "Official ReadyVerse Responder Elite badge",
            "Summary of your total XP, readiness score & badges",
            "Verified profile card showing your top performance"
        ],
        renderContent: (st) => {
            const badgesCount = st.unlockedAchievements ? st.unlockedAchievements.size : 0;
            return `
                <div class="capability-tool-container">
                    <div class="cap-tool-header">
                        <div class="cap-tool-title">RESPONDER ELITE PROFILE</div>
                        <p class="cap-tool-desc">Your verified ReadyVerse achievements, rank status, and training stats.</p>
                    </div>
                    <div class="cap-dossier-card">
                        <div class="cap-dossier-header">
                            <div class="cap-dossier-avatar">👑</div>
                            <div>
                                <h3 style="margin: 0; font-size: 18px;">${escapeHtml(st.prepProfile?.name || st.responderProfile?.name || "Student")}</h3>
                                <span style="color: var(--gold); font-size: 11px; font-weight: 800; letter-spacing: 1px;">RESPONDER ELITE · RANK #01 QUALIFIED</span>
                            </div>
                        </div>
                        <div class="cap-dossier-stats">
                            <div class="cap-dstat"><span>TOTAL XP</span><strong>${st.totalXP || 0}</strong></div>
                            <div class="cap-dstat"><span>READINESS</span><strong>${st.readiness || 0}%</strong></div>
                            <div class="cap-dstat"><span>BADGES EARNED</span><strong>${badgesCount} / 13</strong></div>
                            <div class="cap-dstat"><span>DIGITAL MISSIONS</span><strong>${(st.completedMissionIds ? st.completedMissionIds.size : (st.completedMissions || 0))} / 4</strong></div>
                        </div>
                    </div>
                </div>
            `;
        }
    },
    personal_readiness_console: {
        id: "personal_readiness_console",
        name: "My Readiness",
        icon: "📊",
        category: "PROGRESS TRACKER",
        shortDesc: "See what you're ready for and what to improve next.",
        achievementId: "Preparedness Starter",
        howToUnlock: "Complete your first actionable preparedness item.",
        whatYouGet: [
            "Simple visual gauge of your total preparedness",
            "Number of actions completed vs. actions left to do",
            "Coverage breakdown across major hazard areas"
        ],
        renderContent: (st) => {
            const completedPrep = Object.values(st.prepChecklistState || {}).filter(item => item && item.completed).length;
            const pct = Math.min(100, Math.round((completedPrep / 40) * 100));
            return `
                <div class="capability-tool-container">
                    <div class="cap-tool-header">
                        <div class="cap-tool-title">PERSONAL READINESS OVERVIEW</div>
                        <p class="cap-tool-desc">Track your completed safety actions and see where you can improve next.</p>
                    </div>
                    <div class="cap-prep-gauge">
                        <div class="cap-gauge-metric">
                            <span class="cap-metric-val">${pct}%</span>
                            <span class="cap-metric-label">OVERALL PREPAREDNESS SCORE</span>
                        </div>
                        <div class="cap-gauge-stats">
                            <div><span>Completed Actions:</span> <strong>${completedPrep} / 40</strong></div>
                            <div><span>Remaining Actions:</span> <strong>${40 - completedPrep}</strong></div>
                            <div><span>Top Focus Hazard:</span> <strong>${escapeHtml((st.prepProfile?.priorityHazard || "All Hazards").toUpperCase())}</strong></div>
                        </div>
                    </div>
                    <div class="cap-categories-overview">
                        <div class="cap-section-subtitle">HAZARDS COVERED IN YOUR PLAN</div>
                        <div class="cap-cat-chips">
                            <span class="cap-chip">🔥 Fire Safety</span>
                            <span class="cap-chip">🌊 Flood Safety</span>
                            <span class="cap-chip">🌪️ Cyclone Safety</span>
                            <span class="cap-chip">⚡ Earthquake Safety</span>
                            <span class="cap-chip">🔌 Electrical Safety</span>
                            <span class="cap-chip">🩺 First Aid & Medical</span>
                        </div>
                    </div>
                </div>
            `;
        }
    },
    emergency_kit_builder: {
        id: "emergency_kit_builder",
        name: "Emergency Kit Builder",
        icon: "🎒",
        category: "CHECKLIST",
        shortDesc: "Build a kit with the things you may need most.",
        achievementId: "Emergency Kit Ready",
        howToUnlock: "Assemble student emergency essentials in your plan.",
        whatYouGet: [
            "4 essential supply categories every student needs",
            "Real-time checkmarks linked to your preparedness plan",
            "Simple checklist for food, water, first aid & power"
        ],
        renderContent: (st) => {
            const isDone = (id) => Boolean(st.prepChecklistState && st.prepChecklistState[id] && st.prepChecklistState[id].completed);
            return `
                <div class="capability-tool-container">
                    <div class="cap-tool-header">
                        <div class="cap-tool-title">72-HOUR STUDENT EMERGENCY KIT CHECKLIST</div>
                        <p class="cap-tool-desc">Essential supplies every student should have ready in their room or backpack.</p>
                    </div>
                    <div class="cap-kit-list">
                        <div class="cap-kit-category">
                            <strong>1. WATER & FOOD (3-Day Supply)</strong>
                            <div class="cap-kit-item ${isDone('core_water_food') ? 'checked' : ''}">
                                <span>${isDone('core_water_food') ? '✓' : '○'} Bottled drinking water + energy bars / dry snacks</span>
                            </div>
                        </div>
                        <div class="cap-kit-category">
                            <strong>2. FIRST-AID & MEDICINE</strong>
                            <div class="cap-kit-item ${isDone('core_firstaid') ? 'checked' : ''}">
                                <span>${isDone('core_firstaid') ? '✓' : '○'} Bandages, antiseptic cream, pain relief & daily personal medicines</span>
                            </div>
                        </div>
                        <div class="cap-kit-category">
                            <strong>3. FLASHLIGHT, POWER & PHONE</strong>
                            <div class="cap-kit-item ${isDone('core_power_torch') ? 'checked' : ''}">
                                <span>${isDone('core_power_torch') ? '✓' : '○'} LED torch, charged power bank & phone charging cable</span>
                            </div>
                        </div>
                        <div class="cap-kit-category">
                            <strong>4. IMPORTANT DOCUMENTS & IDs</strong>
                            <div class="cap-kit-item ${isDone('core_docs') ? 'checked' : ''}">
                                <span>${isDone('core_docs') ? '✓' : '○'} Waterproof pouch with College ID, Aadhaar / Govt ID & emergency phone numbers</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },
    emergency_plan_builder: {
        id: "emergency_plan_builder",
        name: "Emergency Plan Builder",
        icon: "🏡",
        category: "SUMMARY CARD",
        shortDesc: "Make a simple plan for when something goes wrong.",
        achievementId: "Family Plan Ready",
        howToUnlock: "Set up your emergency contacts and meeting points.",
        whatYouGet: [
            "Instant summary of your emergency contacts",
            "Designated campus meeting points (primary & backup)",
            "Easy-to-read emergency card you can save or share"
        ],
        renderContent: (st) => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">CAMPUS EMERGENCY PLAN & CONTACTS</div>
                    <p class="cap-tool-desc">Your emergency contacts and designated safe meeting points.</p>
                </div>
                <div class="cap-plan-details">
                    <div class="cap-plan-row">
                        <span class="cap-plan-label">STUDENT NAME</span>
                        <strong class="cap-plan-val">${escapeHtml(st.prepProfile?.name || "Student")}</strong>
                    </div>
                    <div class="cap-plan-row">
                        <span class="cap-plan-label">COLLEGE / CAMPUS</span>
                        <strong class="cap-plan-val">${escapeHtml(st.prepProfile?.college || "Campus Community")}</strong>
                    </div>
                    <div class="cap-plan-row">
                        <span class="cap-plan-label">EMERGENCY CONTACT</span>
                        <strong class="cap-plan-val">${escapeHtml(st.prepProfile?.emergencyContact || "Configured in Preparedness Profile")}</strong>
                    </div>
                    <div class="cap-plan-row">
                        <span class="cap-plan-label">CAMPUS SECURITY</span>
                        <strong class="cap-plan-val">${escapeHtml(st.prepProfile?.campusContact || "Campus Security Helpline")}</strong>
                    </div>
                </div>
                <div class="cap-assembly-box">
                    <strong>📍 DESIGNATED MEETING POINTS</strong>
                    <p><strong>Primary Meeting Point:</strong> Main Campus Sports Ground (open area clear of buildings & powerlines).</p>
                    <p><strong>Backup Meeting Point:</strong> North Gate Pavilion (if sports ground is flooded or blocked).</p>
                </div>
            </div>
        `
    },
    hazard_radar: {
        id: "hazard_radar",
        name: "Hazard Radar",
        icon: "📡",
        category: "RISK GUIDE",
        shortDesc: "Spot danger before you decide.",
        achievementId: "Multi-Hazard Ready",
        howToUnlock: "Complete at least one action across all 6 disaster types.",
        whatYouGet: [
            "Quick risk overview for 6 major campus hazards",
            "High-risk spots to watch out for in dorms and labs",
            "The single most important prevention step for each hazard"
        ],
        renderContent: () => `
            <div class="capability-tool-container">
                <div class="cap-tool-header">
                    <div class="cap-tool-title">CAMPUS HAZARDS & PREVENTION GUIDE</div>
                    <p class="cap-tool-desc">Key risk spots and #1 safety tip for 6 common campus hazards.</p>
                </div>
                <div class="cap-radar-grid">
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">🔥</div>
                        <div>
                            <strong>Fire Hazard</strong>
                            <small>Labs & hostel kitchens &bull; Keep fire exits clear and know extinguisher spots.</small>
                        </div>
                    </div>
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">🌊</div>
                        <div>
                            <strong>Flood Hazard</strong>
                            <small>Ground floors & basements &bull; Move valuables higher up before heavy monsoon rains.</small>
                        </div>
                    </div>
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">🌪️</div>
                        <div>
                            <strong>Cyclone Hazard</strong>
                            <small>Hostel rooms with big windows &bull; Stay in inside hallways; avoid glass during winds.</small>
                        </div>
                    </div>
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">⚡</div>
                        <div>
                            <strong>Earthquake Hazard</strong>
                            <small>Multi-story dorm buildings &bull; Drop, cover under a sturdy desk, and protect head/neck.</small>
                        </div>
                    </div>
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">🔌</div>
                        <div>
                            <strong>Electrical Hazard</strong>
                            <small>Overloaded extension strips &bull; Never plug too many heavy appliances into one strip.</small>
                        </div>
                    </div>
                    <div class="cap-radar-item">
                        <div class="cap-radar-icon">🩺</div>
                        <div>
                            <strong>Medical Emergency</strong>
                            <small>Sports grounds & labs &bull; Know where the nearest First Aid box & campus health center are.</small>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    preparedness_passport: {
        id: "preparedness_passport",
        name: "ReadyVerse Passport",
        icon: "📜",
        category: "SAFETY PASSPORT",
        shortDesc: "See your complete ReadyVerse journey in one place.",
        achievementId: "Preparedness Master",
        howToUnlock: "Complete 80%+ of your student preparedness plan.",
        whatYouGet: [
            "Personal summary of all your completed safety actions",
            "Complete overview of your mission records & readiness score",
            "Unique ReadyVerse ID tracking your campus safety progress"
        ],
        renderContent: (st) => {
            const completedPrep = Object.values(st.prepChecklistState || {}).filter(item => item && item.completed).length;
            const prepPct = Math.min(100, Math.round((completedPrep / 40) * 100));
            return `
                <div class="capability-tool-container">
                    <div class="cap-tool-header">
                        <div class="cap-tool-title">STUDENT PREPAREDNESS PASSPORT</div>
                        <p class="cap-tool-desc">Your personal progress record and campus disaster readiness summary.</p>
                    </div>
                    <div class="cap-passport-card">
                        <div class="cap-passport-seal">🛡️ PERSONAL READYVERSE PROGRESS RECORD</div>
                        <div class="cap-passport-body">
                            <div class="cap-pass-row">
                                <span>STUDENT NAME</span>
                                <strong>${escapeHtml(st.prepProfile?.name || "Student")}</strong>
                            </div>
                            <div class="cap-pass-row">
                                <span>COLLEGE / CAMPUS</span>
                                <strong>${escapeHtml(st.prepProfile?.college || "Campus Community")}</strong>
                            </div>
                            <div class="cap-pass-row">
                                <span>PREPAREDNESS ACTIONS</span>
                                <strong>${completedPrep} / 40 COMPLETED (${prepPct}%)</strong>
                            </div>
                            <div class="cap-pass-row">
                                <span>OVERALL READINESS</span>
                                <strong style="color: var(--green);">${st.readiness || 0}% READINESS</strong>
                            </div>
                            <div class="cap-pass-row">
                                <span>ACTIVE STREAK & SESSIONS</span>
                                <strong>${st.dailyStreak || 1} Days Active &bull; ${st.completedMissions || 0} Drills Completed</strong>
                            </div>
                        </div>
                        <div class="cap-passport-footer">
                            <small>ReadyVerse Personal Progress Record &bull; ID: RV-${Date.now().toString(36).toUpperCase()}</small>
                        </div>
                    </div>
                </div>
            `;
        }
    }
};

function getCapability(capabilityId) {
    if (!capabilityId) return null;
    return CAPABILITIES_CATALOG[capabilityId] || null;
}

function isCapabilityUnlocked(capabilityId) {
    if (!capabilityId) return false;
    return Boolean(state.unlockedCapabilities && state.unlockedCapabilities.has(capabilityId));
}

function openCapabilityViewer(capabilityId) {
    const cap = getCapability(capabilityId);
    const modal = $("capabilityModal");
    if (!cap || !modal) {
        if (typeof showToast === "function") {
            showToast("Capability information unavailable", "ℹ️");
        }
        return;
    }

    const iconEl = $("capabilityModalIcon");
    const categoryEl = $("capabilityModalCategory");
    const titleEl = $("capabilityModalTitle");
    const descEl = $("capabilityModalDescription");
    const statusBadgeEl = $("capabilityModalStatusBadge");
    const labelEl = $("capabilityModalLabel");
    const contentEl = $("capabilityModalContent");

    if (iconEl) iconEl.textContent = cap.icon || "🔒";
    if (categoryEl) categoryEl.textContent = cap.category || "CAPABILITY";
    if (titleEl) titleEl.textContent = cap.name;
    if (descEl) descEl.textContent = cap.shortDesc;

    const unlocked = isCapabilityUnlocked(cap.id);

    if (statusBadgeEl) {
        statusBadgeEl.className = `cap-status-pill ${unlocked ? "unlocked" : "locked"}`;
        statusBadgeEl.textContent = unlocked ? "🔓 UNLOCKED & ACTIVE" : "🔒 LOCKED";
    }

    if (labelEl) {
        labelEl.textContent = unlocked ? "🔓 UNLOCKABLE CAPABILITY VIEWER" : "🔒 LOCKED CAPABILITY TEASER";
    }

    if (contentEl) {
        if (unlocked) {
            contentEl.innerHTML = cap.renderContent(state);
        } else {
            contentEl.innerHTML = `
                <div class="capability-locked-notice">
                    <div class="cap-locked-banner">
                        <span class="cap-locked-icon">🔒</span>
                        <div>
                            <strong class="cap-locked-title">LOCKED CAPABILITY</strong>
                            <p>Earn the <strong>${escapeHtml(cap.achievementId)}</strong> achievement to unlock this tool.</p>
                        </div>
                    </div>
                    <div class="cap-what-you-get-box">
                        <div class="cap-section-subtitle">✨ WHAT YOU'LL GET</div>
                        <div class="cap-locked-features">
                            ${(cap.whatYouGet || [
                                "Interactive safety tools and checklists",
                                "Instant emergency reference and tips",
                                "Direct connection to your preparedness progress"
                            ]).map((item) => `
                                <div class="cap-feature-row">
                                    <span class="cap-check">✓</span>
                                    <span>${escapeHtml(item)}</span>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                    <div class="cap-how-to-unlock-box">
                        <div class="cap-section-subtitle">🔐 HOW TO UNLOCK</div>
                        <div class="cap-unlock-card">
                            <p>${escapeHtml(cap.howToUnlock || (`Complete the "${cap.achievementId}" achievement.`))}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    modal.classList.remove("hidden");
}

function closeCapabilityViewer() {
    const modal = $("capabilityModal");
    if (modal) modal.classList.add("hidden");
}

const openCapabilityModal = openCapabilityViewer;
const closeCapabilityModal = closeCapabilityViewer;

if (typeof window !== "undefined") {
    window.CAPABILITIES_CATALOG = CAPABILITIES_CATALOG;
    window.ACHIEVEMENT_CAPABILITY_MAP = ACHIEVEMENT_CAPABILITY_MAP;
    window.getCapability = getCapability;
    window.isCapabilityUnlocked = isCapabilityUnlocked;
    window.openCapabilityViewer = openCapabilityViewer;
    window.closeCapabilityViewer = closeCapabilityViewer;
    window.openCapabilityModal = openCapabilityModal;
    window.closeCapabilityModal = closeCapabilityModal;
}

// Global capability modal event listeners
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const closeBtn = $("closeCapabilityModal");
        const dismissBtn = $("dismissCapabilityModal");
        const modal = $("capabilityModal");

        if (closeBtn) closeBtn.onclick = closeCapabilityViewer;
        if (dismissBtn) dismissBtn.onclick = closeCapabilityViewer;
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) closeCapabilityViewer();
            };
        }
    });

    // Also bind directly in case DOM is already loaded
    const closeBtn = $("closeCapabilityModal");
    const dismissBtn = $("dismissCapabilityModal");
    const capModal = $("capabilityModal");
    if (closeBtn) closeBtn.onclick = closeCapabilityViewer;
    if (dismissBtn) dismissBtn.onclick = closeCapabilityViewer;
    if (capModal) {
        capModal.onclick = (e) => {
            if (e.target === capModal) closeCapabilityViewer();
        };
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeCapabilityViewer();
        }
    });
}


/* =========================================================
   ACHIEVEMENTS UI SYNC
   ========================================================= */

function updateAchievements() {

    const levelObj = (typeof calculateLevel === "function") 
        ? calculateLevel(state.totalXP || 0)
        : { level: Math.floor((state.totalXP || 0) / 200) + 1 };
    const currentLevel = levelObj.level;

    const isPrepItemDone = (id) => Boolean(state.prepChecklistState && state.prepChecklistState[id] && state.prepChecklistState[id].completed);
    const countPrepDone = Object.values(state.prepChecklistState || {}).filter(item => item && item.completed).length;

    const hasEmergencyKit = ["core_gobag", "core_water_food", "core_firstaid", "core_power_torch", "core_docs"].every(isPrepItemDone);
    const hasFamilyPlan = ["core_contacts", "core_comm_plan", "core_evac_routes", "core_shelter_id"].every(isPrepItemDone);
    const hasMultiHazard = ["fire", "flood", "cyclone", "earthquake", "electrical", "medical"].every(cat => {
        return (typeof prepChecklistData !== "undefined" ? prepChecklistData : []).filter(i => i.category === cat).some(i => isPrepItemDone(i.id));
    });
    const hasPrepMaster = countPrepDone >= 32;

    const floodClearedWith80 = Boolean(
        state.completedMissionIds && state.completedMissionIds.has("flood") && (
            (state.missionBestScores && state.missionBestScores["flood"] >= 80) ||
            (state.performanceHistory && state.performanceHistory.some(h => (h.missionId === "flood" || h.missionTitle === "Flash Flood") && h.score >= 80)) ||
            (state.lastResult && (state.lastResult.missionName === "flood" || state.lastResult.missionTitle === "Flash Flood") && state.lastResult.score >= 80)
        )
    );

    const conditions = {
        "First Mission Completed": state.completedMissions >= 1 || (state.completedMissionIds && state.completedMissionIds.size >= 1),
        "First Response": state.completedMissions >= 1 || (state.completedMissionIds && state.completedMissionIds.size >= 1),
        "Perfect Response": (state.lastResult && state.lastResult.score >= 95) || Object.values(state.missionBestScores || {}).some(s => s >= 95),
        "All 4 Missions Completed": ["fire", "flood", "cyclone", "earthquake"].every(id => state.completedMissionIds && state.completedMissionIds.has(id)),
        "Level 5 Achieved": currentLevel >= 5 || (state.totalXP || 0) >= 800,
        "Quick Thinker": state.correctDecisions >= 5,
        "Flood Survivor": floodClearedWith80,
        "Storm Ready": state.completedMissionIds && state.completedMissionIds.has("flood"),
        "Storm Master": state.completedMissionIds && state.completedMissionIds.has("cyclone"),
        "Seismic Shield": state.completedMissionIds && state.completedMissionIds.has("earthquake"),
        "Response Master": state.readiness >= 95,
        "Knowledge Seeker": state.completedMissions >= 2 || ((state.completedLearnIds && state.completedLearnIds.size >= 3)) || (state.totalXP || 0) >= 500,
        "Leaderboard Champion": (state.totalXP || 0) >= 1500,
        "Preparedness Starter": (state.completedPrepItemIds && state.completedPrepItemIds.size >= 1) || countPrepDone >= 1,
        "Emergency Kit Ready": hasEmergencyKit,
        "Family Plan Ready": hasFamilyPlan,
        "Multi-Hazard Ready": hasMultiHazard,
        "Preparedness Master": hasPrepMaster
    };

    if (!state.unlockedCapabilities) {
        state.unlockedCapabilities = new Set();
    }
    if (!state.unlockedAchievements) {
        state.unlockedAchievements = new Set();
    }

    if (typeof ACHIEVEMENT_CAPABILITY_MAP !== "undefined") {
        Object.entries(ACHIEVEMENT_CAPABILITY_MAP).forEach(([achTitle, capId]) => {
            if (conditions[achTitle] || (state.unlockedAchievements && state.unlockedAchievements.has(achTitle))) {
                state.unlockedAchievements.add(achTitle);
                if (capId) state.unlockedCapabilities.add(capId);
            }
        });
    }

    const achievementCards =
        document.querySelectorAll(
            ".achievement-card"
        );

    let unlockedCount = 0;

    achievementCards.forEach(
        card => {

            const titleElement =
                card.querySelector(
                    "h3"
                );

            const statusElement =
                card.querySelector(
                    "span"
                );

            if (
                !titleElement ||
                !statusElement
            ) {

                return;

            }

            const title =
                String(titleElement.textContent || "")
                    .trim();

            const unlocked =
                Boolean(conditions[title]) ||
                (state.unlockedAchievements && state.unlockedAchievements.has(title));

            if (unlocked) {
                unlockedCount += 1;
                if (state.unlockedAchievements) {
                    state.unlockedAchievements.add(title);
                }
                const mappedCap = card.getAttribute("data-capability") || (typeof ACHIEVEMENT_CAPABILITY_MAP !== "undefined" ? ACHIEVEMENT_CAPABILITY_MAP[title] : null);
                if (mappedCap && state.unlockedCapabilities) {
                    state.unlockedCapabilities.add(mappedCap);
                }
            }

            card.classList.toggle(
                "unlocked-achievement",
                unlocked
            );

            card.classList.toggle(
                "locked-achievement",
                !unlocked
            );

            statusElement.textContent =
                unlocked
                    ? "UNLOCKED"
                    : "LOCKED";

            // Update capability preview
            const capId = card.getAttribute("data-capability") || (typeof ACHIEVEMENT_CAPABILITY_MAP !== "undefined" ? ACHIEVEMENT_CAPABILITY_MAP[title] : null);

            if (capId) {
                const capUnlocked = isCapabilityUnlocked(capId);
                const capPreview = card.querySelector(".achievement-capability-preview");
                if (capPreview) {
                    capPreview.classList.toggle("unlocked", capUnlocked);
                    capPreview.classList.toggle("locked", !capUnlocked);
                    
                    const lockIcon = capPreview.querySelector(".cap-lock-icon");
                    if (lockIcon) lockIcon.textContent = capUnlocked ? "🔓" : "🔒";
                    
                    const previewTag = capPreview.querySelector(".cap-preview-tag");
                    if (previewTag) previewTag.textContent = capUnlocked ? "UNLOCKED CAPABILITY:" : "UNLOCKS CAPABILITY:";
                    
                    const previewBtn = capPreview.querySelector(".cap-preview-btn");
                    if (previewBtn) {
                        previewBtn.className = `cap-preview-btn ${capUnlocked ? "cap-btn-unlocked" : "cap-btn-locked"}`;
                        previewBtn.textContent = capUnlocked ? "OPEN TOOL →" : "PREVIEW 🔒";
                    }
                }
            }

        }
    );

    const badgesCountEl = $("dashboardBadgesCount");
    const badgesBarEl = $("dashboardBadgesBar");
    const badgesSummaryEl = $("dashboardBadgesSummary");
    const totalBadges = achievementCards.length || 8;

    if (badgesCountEl) {
        badgesCountEl.textContent = `${unlockedCount} / ${totalBadges}`;
    }
    if (badgesBarEl) {
        badgesBarEl.style.width = `${Math.min(100, Math.round((unlockedCount / totalBadges) * 100))}%`;
    }
    if (badgesSummaryEl) {
        badgesSummaryEl.textContent = unlockedCount === totalBadges
            ? "All 8 honors & badges unlocked! 👑"
            : `${totalBadges - unlockedCount} badge${totalBadges - unlockedCount > 1 ? "s" : ""} pending unlock.`;
    }

    // Update Unlock Gallery if present
    const galleryGrid = $("unlocksGalleryGrid");
    const countBadge = $("unlocksCountBadge");
    const progressFill = $("unlocksProgressFill");
    const totalCaps = typeof CAPABILITIES_CATALOG !== "undefined" ? Object.keys(CAPABILITIES_CATALOG).length : 13;
    const unlockedCapsCount = state.unlockedCapabilities ? state.unlockedCapabilities.size : 0;

    if (countBadge) {
        countBadge.textContent = `${unlockedCapsCount} / ${totalCaps} UNLOCKED`;
    }
    if (progressFill) {
        const pct = Math.min(100, Math.round((unlockedCapsCount / totalCaps) * 100));
        progressFill.style.width = `${pct}%`;
    }

    if (galleryGrid && typeof CAPABILITIES_CATALOG !== "undefined") {
        const capsList = Object.values(CAPABILITIES_CATALOG);
        
        galleryGrid.innerHTML = capsList.map(cap => {
            const isUnlocked = isCapabilityUnlocked(cap.id);
            return `
                <div class="unlock-gallery-card ${isUnlocked ? 'unlocked' : 'locked'}" data-cap-id="${cap.id}">
                    <div class="cap-card-header">
                        <span class="cap-card-icon">${cap.icon || '🔒'}</span>
                        <span class="cap-card-category">${escapeHtml(cap.category || 'CAPABILITY')}</span>
                    </div>
                    <div class="cap-card-title">${escapeHtml(cap.name)}</div>
                    <p class="cap-card-desc">${escapeHtml(cap.shortDesc)}</p>
                    <div class="cap-card-footer">
                        <span class="cap-card-status-tag ${isUnlocked ? 'unlocked' : 'locked'}">
                            ${isUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}
                        </span>
                        <button type="button" class="cap-gallery-btn ${isUnlocked ? 'unlocked' : 'locked'}" onclick="openCapabilityViewer('${cap.id}')" aria-label="${isUnlocked ? 'Open tool ' + escapeHtml(cap.name) : 'Preview locked capability ' + escapeHtml(cap.name)}">
                            ${isUnlocked ? 'OPEN TOOL →' : 'PREVIEW 🔒'}
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

}

/* =========================================================
   LEADERBOARD
   ========================================================= */

const leaderboardPeers = [
    { name: "ARJUN", avatar: "A", xp: 3850 },
    { name: "SHRUTHI", avatar: "S", xp: 3420 },
    { name: "KARTHIK", avatar: "K", xp: 2380 },
    { name: "PRIYA", avatar: "P", xp: 1950 }
];


function updateLeaderboard() {

    const leaderboardContainer =
        document.querySelector(
            "#leaderboardContent .leaderboard"
        );


    if (!leaderboardContainer) {

        return;

    }


    const activeOutfit = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && state.responderProfile)
        ? (RESPONDER_CUSTOMIZATIONS.outfits.find(o => o.id === state.responderProfile.outfitId) || { icon: "R" })
        : { icon: "R" };
    const userName = (state.prepProfile?.name || state.responderProfile?.name || "YOU").toUpperCase();

    const allPlayers = [
        ...leaderboardPeers.map(peer => ({ ...peer, isUser: false })),
        { name: (userName === "READY TRAINEE" || userName === "READY STUDENT" || userName === "STUDENT") ? "YOU" : userName, avatar: activeOutfit.icon || "R", xp: state.totalXP, isUser: true }
    ];


    /* Sort players descending by XP */

    allPlayers.sort(
        (a, b) => b.xp - a.xp
    );


    leaderboardContainer.innerHTML =
        allPlayers
            .map((player, index) => {

                const rank =
                    `#${String(index + 1).padStart(2, "0")}`;


                const userClass =
                    player.isUser
                        ? " current-user"
                        : "";


                const tierClass =
                    index === 0
                        ? " first"
                        : index === 1
                            ? " second"
                            : "";


                return `
                    <div class="leader-row${tierClass}${userClass}">
                        <span>${rank}</span>
                        <div class="leader-avatar">${player.avatar}</div>
                        <strong>${player.name}</strong>
                        <span>${formatNumber(player.xp)} XP</span>
                    </div>
                `;

            })
            .join("");

}


/* =========================================================
   OPTIONAL DATA ATTRIBUTES
   ========================================================= */

function updateCustomDataElements() {

    document
        .querySelectorAll(
            "[data-readiness]"
        )
        .forEach(element => {

            element.textContent =
                `${state.readiness}%`;

        });


    document
        .querySelectorAll(
            "[data-xp]"
        )
        .forEach(element => {

            element.textContent =
                formatNumber(
                    state.totalXP
                );

        });


    document
        .querySelectorAll(
            "[data-completed]"
        )
        .forEach(element => {

            element.textContent =
                state.completedMissions;

        });


    document
        .querySelectorAll(
            "[data-decisions]"
        )
        .forEach(element => {

            element.textContent =
                state.decisionsMade;

        });

}


/* =========================================================
   LEARN HUB — 6 DISASTER MODULES & INTERACTIVE QUIZ ENGINE
   ========================================================= */

const learnModules = {
    fire: {
        id: "fire",
        title: "Fire Safety & Evacuation",
        icon: "🔥",
        levelText: "BEGINNER · +100 XP",
        requiredLevel: 1,
        missionKey: "fire",
        overview: "Building fires spread with lethal speed within minutes. Understanding smoke avoidance, rapid evacuation pathways, and fire extinguisher protocols is vital to survival.",
        before: [
            "Install smoke detectors on every level and test them on the 1st of every month.",
            "Map and practice 2 independent escape exits for every room in your building.",
            "Ensure emergency stairwells, doors, and corridors remain completely unblocked.",
            "Store a multi-purpose (ABC) fire extinguisher in accessible locations."
        ],
        during: [
            "Crawl low under smoke — clean, breathable oxygen remains closest to the floor.",
            "Check closed doors with the back of your hand before opening. If hot, seek alternate exits.",
            "Never use elevators during a fire evacuation; use designated emergency stairs.",
            "If clothes catch fire, immediately STOP, DROP, and ROLL to smother flames."
        ],
        after: [
            "Proceed immediately to the designated outdoor assembly point.",
            "Call emergency services (101/112) with exact structural location and hazards.",
            "Never re-enter a burning or smoke-damaged building until authorized by fire officials."
        ],
        donts: [
            "Do NOT throw water on grease or electrical fires (use baking soda or extinguisher).",
            "Do NOT waste precious seconds gathering personal belongings or laptops.",
            "Do NOT hide in closets or bathrooms where toxic smoke rapidly accumulates."
        ],
        safetyTips: [
            "Remember PASS for fire extinguishers: Pull pin, Aim at base, Squeeze lever, Sweep side-to-side.",
            "Close doors behind you as you evacuate to compartmentalize fire and slow smoke spread."
        ],
        quiz: [
            {
                q: "Why is crawling low under smoke essential during a building fire?",
                options: [
                    "It makes you move faster through doorways",
                    "Toxic smoke and superheated gases rise, leaving cleaner air near the floor",
                    "It prevents falling objects from touching you",
                    "It keeps you hidden from outside heat"
                ],
                answer: 1,
                explanation: "Superheated smoke and lethal gases rise toward the ceiling; cooler, breathable air stays in the lower 12-24 inches."
            },
            {
                q: "What should you do before opening a closed door during an evacuation?",
                options: [
                    "Kick the door open quickly",
                    "Feel the door handle and door surface with the back of your hand",
                    "Open the door slightly to peek inside",
                    "Knock loudly and wait for a response"
                ],
                answer: 1,
                explanation: "The back of your hand is sensitive to heat; if the door or handle feels warm, fire is directly on the other side."
            },
            {
                q: "What is the correct protocol if your clothing catches fire?",
                options: [
                    "Run rapidly toward the nearest exit",
                    "Wave your arms to blow out the fire",
                    "Stop, Drop to the ground, and Roll to smother the flames",
                    "Look for a towel to fan the flames"
                ],
                answer: 2,
                explanation: "Running fans the flames; stopping, dropping, and rolling smothers oxygen and extinguishes the fire."
            },
            {
                q: "What does the fire extinguisher acronym 'PASS' stand for?",
                options: [
                    "Push, Aim, Spray, Stop",
                    "Pull the pin, Aim at base, Squeeze lever, Sweep side-to-side",
                    "Prepare, Activate, Spread, Secure",
                    "Point, Arm, Squeeze, Stand back"
                ],
                answer: 1,
                explanation: "PASS: Pull the safety pin, Aim nozzle at the base of fire, Squeeze the trigger, Sweep side-to-side."
            },
            {
                q: "Why should elevators NEVER be used during a building fire evacuation?",
                options: [
                    "Elevators move too slowly during emergencies",
                    "Elevator shafts draw smoke and power loss can trap occupants between floors",
                    "Elevator doors lock automatically when fire alarms ring",
                    "Elevators are reserved exclusively for building management"
                ],
                answer: 1,
                explanation: "Elevator shafts act as chimneys drawing smoke, and sudden power cuts can trap passengers in lethal heat zones."
            }
        ]
    },
    flood: {
        id: "flood",
        title: "Flood Safety & Rising Waters",
        icon: "🌊",
        levelText: "INTERMEDIATE · +100 XP",
        requiredLevel: 1,
        missionKey: "flood",
        overview: "Flash floods are sudden, violent, and unpredictable. Just a few inches of moving water exerts immense hydrodynamic pressure capable of sweeping pedestrians and vehicles away.",
        before: [
            "Identify your local flood zone, drainage pathways, and high-ground evacuation routes.",
            "Pack an emergency Go-Bag with 3 days of potable water, purification tablets, and torch.",
            "Clear outdoor storm drains, gutters, and downspouts around your property.",
            "Install check valves in plumbing to prevent floodwater backflow into sewer lines."
        ],
        during: [
            "Evacuate to higher ground immediately when flood warnings or alerts are broadcast.",
            "Turn Around, Don't Drown: NEVER drive, walk, or swim through moving floodwaters.",
            "Shut off main electrical breakers and gas supply valves before floodwaters enter.",
            "If trapped in a building, move to upper floors; avoid closed attics without roof exits."
        ],
        after: [
            "Stay clear of standing floodwater — it contains biological waste, chemicals, and live wires.",
            "Boil tap water or use bottled water until municipal water safety is certified.",
            "Do not turn on electrical appliances until certified dry and inspected by an electrician."
        ],
        donts: [
            "Do NOT drive around police barricades or through water-covered roads.",
            "Do NOT touch electrical panels, outlets, or power cords while standing in water.",
            "Do NOT allow children or pets to walk or play in flooded streets or canals."
        ],
        safetyTips: [
            "Just 6 inches of rapid water knocks an adult down; 12 inches floats small vehicles; 24 inches carries large SUVs.",
            "Always follow official evacuation routes rather than shortcut backroads that may be washed out."
        ],
        quiz: [
            {
                q: "How much fast-moving floodwater is required to knock an adult off their feet?",
                options: [
                    "24 inches (2 feet)",
                    "18 inches",
                    "6 inches",
                    "12 inches (1 foot)"
                ],
                answer: 2,
                explanation: "Just 6 inches of fast-moving water exerts tremendous kinetic force that easily sweeps adults off their feet."
            },
            {
                q: "What is the primary rule when approaching a water-covered road while driving?",
                options: [
                    "Drive through quickly to avoid getting stuck",
                    "Turn Around, Don't Drown — find an alternate safe route",
                    "Follow closely behind the vehicle ahead",
                    "Shift into high gear and accelerate"
                ],
                answer: 1,
                explanation: "Most flood fatalities occur in vehicles; road surfaces under water may be completely collapsed or swept away."
            },
            {
                q: "What critical home utility should be disconnected before floodwaters enter?",
                options: [
                    "Internet router only",
                    "Main electrical circuit breaker panel",
                    "Air conditioning filter",
                    "Television antenna"
                ],
                answer: 1,
                explanation: "Submerged electrical panels and outlets create lethal underwater shock zones throughout the structure."
            },
            {
                q: "If floodwaters trap you inside a building, what is the safest vertical action?",
                options: [
                    "Climb into a sealed attic with no roof hatch",
                    "Move to upper floors with access to roof escape points",
                    "Hide in the basement or ground-floor bathroom",
                    "Open ground-floor windows to let water flow through"
                ],
                answer: 1,
                explanation: "Ascend to upper floors with accessible roof escape paths; never trap yourself in attics without exit tools."
            },
            {
                q: "Why must standing floodwaters always be treated with extreme caution after a storm?",
                options: [
                    "Floodwater cools down too rapidly",
                    "It frequently contains raw sewage, toxic chemicals, submerged debris, and live wires",
                    "It evaporates too quickly causing humidity",
                    "It attracts wild birds"
                ],
                answer: 1,
                explanation: "Standing floodwaters carry disease-causing pathogens, industrial runoff, glass shards, and energized downed lines."
            }
        ]
    },
    cyclone: {
        id: "cyclone",
        title: "Cyclone Preparedness & Storm Tracking",
        icon: "🌪️",
        levelText: "ADVANCED · +100 XP",
        requiredLevel: 1,
        missionKey: "cyclone",
        overview: "Tropical cyclones generate hurricane-force winds over 150 km/h, catastrophic storm surges, and torrential rains. Fortification and early action protect communities.",
        before: [
            "Trim tree branches near rooflines, power lines, and structural walls.",
            "Board up or shutter windows; securely anchor outdoor furniture, tanks, and signs.",
            "Charge mobile phones, battery banks, and test emergency AM/FM radios.",
            "Store 72 hours of non-perishable food, water (3L/person/day), and essential medications."
        ],
        during: [
            "Shelter in a small, windowless interior room on the lowest floor (hallway or bathroom).",
            "Keep away from glass windows, skylights, and external doors.",
            "Beware the Eye of the Storm — a deceptive lull where winds will suddenly resume in reverse.",
            "Unplug major electrical appliances to protect against extreme power surges."
        ],
        after: [
            "Remain inside until official meteorological bulletins issue the final 'all-clear'.",
            "Watch out for fallen power lines, broken gas lines, and weakened tree limbs.",
            "Use battery flashlights instead of candles to prevent gas explosion risks."
        ],
        donts: [
            "Do NOT go outside during the calm eye of the storm.",
            "Do NOT inspect roofs or climb ladders while winds remain gusty.",
            "Do NOT drive across coastal causeways or low bridges subject to storm surges."
        ],
        safetyTips: [
            "Secure important identity documents and insurance papers in waterproof ziploc pouches.",
            "Maintain emergency contact numbers written on physical paper in case mobile networks fail."
        ],
        quiz: [
            {
                q: "What is the calm, low-pressure center of a cyclone called?",
                options: [
                    "The Tail",
                    "The Eye of the Storm",
                    "The Wind Core",
                    "The Rain Shield"
                ],
                answer: 1,
                explanation: "The Eye is the calm center of a tropical cyclone, surrounded by the most violent eyewall winds."
            },
            {
                q: "What dangerous phenomenon occurs when the Eye of the Storm finishes passing?",
                options: [
                    "The storm ends completely with clear skies",
                    "Violent hurricane-force winds suddenly resume from the opposite direction",
                    "A tsunami immediately forms",
                    "Temperatures drop below freezing"
                ],
                answer: 1,
                explanation: "When the eye passes, the opposite eyewall strikes instantly with maximum ferocious winds from reverse direction."
            },
            {
                q: "Where is the safest place to take shelter inside a residence during a cyclone?",
                options: [
                    "Under large glass windows in the living room",
                    "On the open balcony to monitor storm progress",
                    "In a small interior windowless room, hallway, or bathroom on the lowest floor",
                    "In the attic directly under the roof rafters"
                ],
                answer: 2,
                explanation: "Interior windowless rooms shield occupants from flying shattered glass and roof projectile debris."
            },
            {
                q: "How many days of emergency food and potable water should be prepared for a cyclone?",
                options: [
                    "At least 72 hours (3 days)",
                    "12 hours only",
                    "30 days",
                    "2 hours"
                ],
                answer: 0,
                explanation: "72 hours is the standard international supply target while relief and emergency access routes are cleared."
            },
            {
                q: "Why are candles discouraged during post-cyclone power blackouts?",
                options: [
                    "Candles attract flying insects",
                    "Candles generate excessive room heat",
                    "Open flames can ignite leaking natural gas or propane from ruptured lines",
                    "Candles burn too quickly in humid weather"
                ],
                answer: 2,
                explanation: "Storm damage frequently ruptures residential gas lines; open candle flames cause fatal structural explosions."
            }
        ]
    },
    earthquake: {
        id: "earthquake",
        title: "Earthquake Safety & Seismic Protocol",
        icon: "🌍",
        levelText: "INTERMEDIATE · +100 XP",
        requiredLevel: 1,
        missionKey: "earthquake",
        overview: "Earthquakes strike instantaneously without warning. The internationally recognized 'Drop, Cover, and Hold On' protocol prevents crush injuries from falling debris.",
        before: [
            "Anchor heavy bookcases, mirrors, water heaters, and top-heavy furniture to wall studs.",
            "Place heavy and breakable items on bottom shelves rather than high ledges.",
            "Identify safe sturdy cover spots (heavy wooden desks/tables) in every room.",
            "Learn how to shut off main gas, water, and electrical supply lines."
        ],
        during: [
            "DROP onto your hands and knees immediately to prevent being thrown down.",
            "COVER your head and neck under a sturdy table, desk, or against an interior wall.",
            "HOLD ON to your shelter until the violent shaking completely ceases.",
            "If outdoors, move immediately to open clear ground away from buildings, powerlines, and glass."
        ],
        after: [
            "Be prepared for powerful aftershocks that can topple already weakened buildings.",
            "Check for gas leaks (smell of sulfur) and water leaks; shut valves if damage is suspected.",
            "Evacuate via stairs; never enter elevators."
        ],
        donts: [
            "Do NOT run outdoors while the ground is actively shaking (falling masonry causes 80% of injuries).",
            "Do NOT stand in doorways (modern doors are not structural load-bearing points).",
            "Do NOT use matches, lighters, or light switches until gas leaks are ruled out."
        ],
        safetyTips: [
            "If in bed, stay in bed, turn face down, and protect your head and neck with pillows.",
            "If driving, pull over safely away from overpasses, bridges, and power lines, and set parking brake."
        ],
        quiz: [
            {
                q: "What is the internationally proven protocol during active earthquake shaking?",
                options: [
                    "Stand under a doorway and shout",
                    "Drop, Cover, and Hold On",
                    "Run outside into the street immediately",
                    "Climb onto the roof of the building"
                ],
                answer: 1,
                explanation: "Drop to hands and knees, Cover head/neck under sturdy furniture, and Hold On until ground shaking stops."
            },
            {
                q: "Why should you avoid standing in modern doorways during an earthquake?",
                options: [
                    "Doorways are magnetic",
                    "Modern interior doors are not load-bearing and do not protect against falling objects",
                    "Doorways have electrical wires",
                    "Doors swing open and trap your hands"
                ],
                answer: 1,
                explanation: "Modern doorframes are purely decorative and offer zero overhead protection compared to a heavy desk or table."
            },
            {
                q: "What is the greatest danger to people running outside during an earthquake?",
                options: [
                    "Wind gusts",
                    "Falling glass, bricks, masonry, and architectural facade debris",
                    "Rain and cold weather",
                    "Slippery sidewalks"
                ],
                answer: 1,
                explanation: "Exterior facades, windows, and parapets collapse outward during shaking; staying inside under cover is far safer."
            },
            {
                q: "What secondary seismic events typically occur following a major earthquake?",
                options: [
                    "Solar eclipses",
                    "Strong aftershocks, gas line fires, and falling weakened debris",
                    "Tornado formations",
                    "Hailstorms"
                ],
                answer: 1,
                explanation: "Aftershocks can trigger secondary collapses of compromised structures and spark gas fires across the zone."
            },
            {
                q: "If you are driving when earthquake shaking begins, what should you do?",
                options: [
                    "Speed up to outrun the tremor",
                    "Stop under a large highway overpass",
                    "Safely pull over away from overpasses, bridges, and power lines, and set the parking brake",
                    "Exit the car and lie in the road"
                ],
                answer: 2,
                explanation: "Pulling over in clear open road areas away from falling elevated structures keeps occupants safely protected."
            }
        ]
    },
    electrical: {
        id: "electrical",
        title: "Electrical Emergency",
        icon: "⚡",
        levelText: "INTERMEDIATE · +100 XP",
        requiredLevel: 1,
        missionKey: null,
        overview: "Electricity is an invisible hazard capable of causing severe internal burns, respiratory arrest, and lethal cardiac fibrillation. Proper insulation and isolation save lives.",
        before: [
            "Inspect cords and cables; replace frayed or exposed wiring immediately.",
            "Install Ground Fault Circuit Interrupters (GFCIs) near kitchen sinks and bathrooms.",
            "Never overload power strips or daisy-chain extension cords together.",
            "Ensure breaker panels are clearly labeled and unobstructed."
        ],
        during: [
            "If someone receives a shock, NEVER touch them directly with bare hands.",
            "Instantly shut off the main circuit breaker or unplug the power supply.",
            "If breaker is inaccessible, use a dry wooden broom handle or plastic rod to separate victim.",
            "Call emergency medical services (108/112) immediately."
        ],
        after: [
            "Check the victim's responsiveness and breathing; begin CPR immediately if pulseless.",
            "Treat electrical burns with clean, dry, sterile dressings; never apply ice or grease.",
            "Keep victim warm and calm while waiting for paramedics."
        ],
        donts: [
            "Do NOT throw water on an electrical fire (use Class C / dry powder extinguisher).",
            "Do NOT touch or approach downed power lines (maintain at least 35 feet / 10m distance).",
            "Do NOT plug appliances with wet hands or while standing on wet floors."
        ],
        safetyTips: [
            "If a power line falls on your car, stay inside! If fire forces evacuation, jump clear with both feet together and shuffle away.",
            "Never use metal ladders near overhead power transmission cables."
        ],
        quiz: [
            {
                q: "What is your immediate first step upon seeing someone actively experiencing an electric shock?",
                options: [
                    "Grab their hand and pull them away",
                    "Turn off the main power breaker / disconnect the power source",
                    "Pour water over the appliance",
                    "Check their pulse while they are connected to the wire"
                ],
                answer: 1,
                explanation: "Cutting the power source immediately halts current; touching the victim directly turns you into a second victim."
            },
            {
                q: "Why must you NEVER throw water onto an active electrical fire?",
                options: [
                    "Water causes the fire to smell bad",
                    "Water conducts electricity, causing severe shock, electrocution, and explosions",
                    "Water cools down the fire too quickly",
                    "Water evaporates and creates fog"
                ],
                answer: 1,
                explanation: "Water is an electrical conductor; throwing water conducts lethal voltage back to the person holding the hose or bucket."
            },
            {
                q: "What type of non-conductive object can safely separate a shock victim from a live wire?",
                options: [
                    "A metal crowbar",
                    "A damp bath towel",
                    "A dry wooden broomstick or thick plastic pipe",
                    "An aluminum pole"
                ],
                answer: 2,
                explanation: "Dry wood, fiberglass, and rigid plastic are electrical insulators that do not conduct dangerous current."
            },
            {
                q: "What is the minimum safe distance you must maintain from a downed high-voltage power line?",
                options: [
                    "At least 35 feet (10 meters)",
                    "2 feet",
                    "5 feet",
                    "10 inches"
                ],
                answer: 0,
                explanation: "High-voltage current energizes the surrounding soil in radiating ripples; stay at least 35 feet (10m) away."
            },
            {
                q: "What is the life-saving function of a GFCI (Ground Fault Circuit Interrupter) outlet?",
                options: [
                    "It doubles electrical voltage for faster charging",
                    "It instantly cuts power in milliseconds when current leaks to water or a person",
                    "It acts as a battery during power outages",
                    "It prevents lightning strikes on the roof"
                ],
                answer: 1,
                explanation: "GFCIs detect microscopic electrical leaks to ground and cut circuits within 1/40th of a second to prevent electrocution."
            }
        ]
    },
    medical: {
        id: "medical",
        title: "Medical Emergency",
        icon: "🩹",
        levelText: "INTERMEDIATE · +100 XP",
        requiredLevel: 1,
        missionKey: null,
        overview: "In severe trauma and sudden medical collapse, immediate bystander action during the 'Golden Hour' drastically improves survival before paramedics arrive.",
        before: [
            "Maintain a fully stocked first-aid kit with bandages, sterile gauze, tourniquet, and antiseptic.",
            "Learn and certify in basic hands-only CPR and AED (Automated External Defibrillator) use.",
            "Keep emergency medical helpline numbers (108/112) programmed in your phone.",
            "Know your family members' allergies, blood types, and prescription needs."
        ],
        during: [
            "Check scene safety first — never enter a toxic, burning, or collapsed area without protection.",
            "Assess victim responsiveness: Alert, Verbal, Pain, Unresponsive (AVPU scale).",
            "For severe bleeding: Apply direct, continuous, firm pressure with sterile gauze.",
            "If victim is unconscious but breathing normally, place them in the Recovery Position on their side."
        ],
        after: [
            "Monitor breathing, pulse, and skin temperature until emergency responders arrive.",
            "Give paramedics a concise handover: mechanism of injury, time of event, and actions taken.",
            "Comfort and keep the patient warm to prevent traumatic shock."
        ],
        donts: [
            "Do NOT move victims with suspected neck or spinal injuries unless in imminent danger.",
            "Do NOT remove deeply embedded objects (knives, glass) from wounds — stabilize in place.",
            "Do NOT give food or drink to unconscious or severely injured casualties."
        ],
        safetyTips: [
            "In CPR chest compressions: Push hard and fast in the center of the chest at 100-120 beats per minute.",
            "Never hesitate to call emergency services early; dispatcher guidance can talk you through life-saving steps."
        ],
        quiz: [
            {
                q: "What is the very first priority when arriving at any emergency medical scene?",
                options: [
                    "Perform CPR immediately",
                    "Assess the scene to ensure it is completely safe for yourself and the victim",
                    "Take photos for hospital records",
                    "Move the victim to a different room"
                ],
                answer: 1,
                explanation: "Scene safety is paramount; if the responder becomes a casualty, they cannot help the victim."
            },
            {
                q: "How should severe arterial bleeding from an extremity be controlled immediately?",
                options: [
                    "Wash the wound with hot water",
                    "Apply direct, continuous, firm pressure with sterile gauze or clean cloth",
                    "Apply a loose bandage and wait",
                    "Elevate the feet above the head"
                ],
                answer: 1,
                explanation: "Direct manual pressure compresses severed blood vessels, initiating rapid clot formation and halting hemorrhage."
            },
            {
                q: "Why should an object embedded deep in a wound NEVER be removed at the scene?",
                options: [
                    "It will get lost",
                    "The object is acting as a plug for damaged arteries; removing it causes catastrophic bleeding",
                    "Removing it hurts the responder's hands",
                    "It must be cleaned before removal"
                ],
                answer: 1,
                explanation: "Embedded objects tamponade damaged blood vessels; removal must only occur in a sterile surgical operating theater."
            },
            {
                q: "Why is the Recovery Position used for unconscious, breathing casualties?",
                options: [
                    "It helps them sleep comfortably",
                    "It keeps their airway open and prevents them from choking on tongue or vomit",
                    "It lowers body temperature",
                    "It helps broken bones heal"
                ],
                answer: 1,
                explanation: "The Recovery Position utilizes gravity to keep the tongue from blocking the trachea and allows fluids to drain safely."
            },
            {
                q: "What is the recommended chest compression rate during hands-only CPR?",
                options: [
                    "20 to 30 compressions per minute",
                    "100 to 120 compressions per minute",
                    "200 to 250 compressions per minute",
                    "60 compressions per hour"
                ],
                answer: 1,
                explanation: "100-120 compressions/min (to the rhythm of 'Stayin' Alive') maintains vital blood flow to the brain and heart."
            }
        ]
    }
};

/* Backwards compatibility alias */
const learnProtocols = learnModules;

let activeLearnKey = null;
let activeLearnTab = "guidelines";
let userQuizAnswers = {};
let quizSubmitted = false;

function openLearnProtocol(key) {
    const mod = learnModules[key] || learnModules.fire;
    if (!mod) return;

    activeLearnKey = key;
    userQuizAnswers = {};
    quizSubmitted = false;

    const modal = $("learnModal");
    const icon = $("learnModalIcon");
    const title = $("learnModalTitle");
    const badge = $("learnModalBadge");
    const desc = $("learnModalDescription");

    if (icon) icon.textContent = mod.icon;
    if (title) title.textContent = mod.title;
    if (badge) badge.textContent = mod.levelText;
    if (desc) desc.textContent = mod.overview;

    const launchBtn = $("launchLearnSimulation");
    if (launchBtn) {
        if (!mod.missionKey || key === "electrical" || key === "medical") {
            launchBtn.textContent = "DEDICATED DRILL COMING SOON";
            launchBtn.classList.add("disabled-btn-muted");
        } else {
            launchBtn.textContent = "LAUNCH LIVE DRILL →";
            launchBtn.classList.remove("disabled-btn-muted");
        }
    }

    renderLearnGuidelines(mod);
    renderLearnQuiz(mod);

    switchLearnTab("guidelines");

    if (modal) modal.classList.remove("hidden");
}

function switchLearnTab(tabName) {
    activeLearnTab = tabName;
    const tabGuidelinesBtn = $("learnTabGuidelines");
    const tabQuizBtn = $("learnTabQuiz");
    const protocolsContainer = $("learnModalProtocols");
    const quizContainer = $("learnModalQuiz");
    const primaryBtn = $("learnModalPrimaryBtn");

    if (tabName === "guidelines") {
        if (tabGuidelinesBtn) tabGuidelinesBtn.classList.add("active");
        if (tabQuizBtn) tabQuizBtn.classList.remove("active");
        if (protocolsContainer) protocolsContainer.classList.remove("hidden");
        if (quizContainer) quizContainer.classList.add("hidden");

        if (primaryBtn) {
            primaryBtn.textContent = "START KNOWLEDGE CHECK QUIZ →";
            primaryBtn.onclick = () => switchLearnTab("quiz");
        }
    } else {
        if (tabGuidelinesBtn) tabGuidelinesBtn.classList.remove("active");
        if (tabQuizBtn) tabQuizBtn.classList.add("active");
        if (protocolsContainer) protocolsContainer.classList.add("hidden");
        if (quizContainer) quizContainer.classList.remove("hidden");

        if (primaryBtn) {
            if (quizSubmitted) {
                primaryBtn.textContent = "RETRY KNOWLEDGE CHECK";
                primaryBtn.onclick = retryLearnQuiz;
            } else {
                primaryBtn.textContent = "SUBMIT QUIZ ANSWERS →";
                primaryBtn.onclick = submitLearnQuiz;
            }
        }
    }
}

function renderLearnGuidelines(mod) {
    const container = $("learnModalProtocols");
    if (!container) return;

    let html = `
        <div class="learn-section-block">
            <h4>💡 CRISIS OVERVIEW</h4>
            <p style="font-size: 11px; line-height: 1.5; color: var(--text);">${mod.overview}</p>
        </div>

        <div class="learn-section-block">
            <h4>🛡️ WHAT TO DO BEFORE (PREPARATION)</h4>
            <div class="learn-step-list">
                ${mod.before.map(step => `
                    <div class="learn-step-item">
                        <div class="learn-step-bullet"></div>
                        <div>${step}</div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="learn-section-block">
            <h4>⚡ WHAT TO DO DURING (IMMEDIATE ACTION)</h4>
            <div class="learn-step-list">
                ${mod.during.map(step => `
                    <div class="learn-step-item">
                        <div class="learn-step-bullet"></div>
                        <div>${step}</div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="learn-section-block">
            <h4>🏁 WHAT TO DO AFTER (ASSESSMENT & RECOVERY)</h4>
            <div class="learn-step-list">
                ${mod.after.map(step => `
                    <div class="learn-step-item">
                        <div class="learn-step-bullet"></div>
                        <div>${step}</div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="learn-section-block learn-donts-block">
            <h4>🚫 CRITICAL LIFE-SAFETY DON'TS</h4>
            <div class="learn-step-list">
                ${mod.donts.map(step => `
                    <div class="learn-step-item">
                        <div class="learn-step-bullet"></div>
                        <div style="color: #fecdd3;">${step}</div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="learn-section-block">
            <h4>✨ SAFETY & PRO TIPS</h4>
            <div class="learn-step-list">
                ${mod.safetyTips.map(step => `
                    <div class="learn-step-item">
                        <div class="learn-step-bullet" style="background: #22c55e;"></div>
                        <div>${step}</div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="learn-source-box">
            <span class="source-label-tag">OFFICIAL SOURCE GUIDELINE:</span>
            <p class="learn-source-citation">
                <strong>Source:</strong> ${(typeof ReadyVerseSources !== "undefined" && ReadyVerseSources.getLessonSource)
                    ? ReadyVerseSources.getLessonSource(mod.id).documentName
                    : "NDMA Guidelines on Disaster Safety"}
            </p>
            <span class="source-status-badge ${(typeof ReadyVerseSources !== "undefined" && ReadyVerseSources.getLessonSource && ReadyVerseSources.getLessonSource(mod.id).status === "NEEDS REVIEW") ? "needs-review" : ""}">
                ${(typeof ReadyVerseSources !== "undefined" && ReadyVerseSources.getLessonSource) ? ReadyVerseSources.getLessonSource(mod.id).status : "VERIFIED"}
            </span>
        </div>
    `;

    container.innerHTML = html;
}

function renderLearnQuiz(mod) {
    const container = $("learnModalQuiz");
    if (!container) return;

    const previousScore = state.learnQuizScores ? state.learnQuizScores[mod.id] : null;
    let scoreHeader = "";

    if (previousScore) {
        scoreHeader = `
            <div class="perf-activity-status-row" style="margin-bottom: 14px;">
                <span class="perf-sub-label">PREVIOUS BEST RESULT</span>
                <span class="perf-badge-done">✓ ${previousScore.score} / 5 (${previousScore.pct}%) MASTERED</span>
            </div>
        `;
    }

    let html = `
        <div class="quiz-container">
            ${scoreHeader}
            <div id="quizResultBannerContainer"></div>
    `;

    mod.quiz.forEach((qItem, qIdx) => {
        html += `
            <div class="quiz-card" id="quizCard_${qIdx}">
                <div class="quiz-question-header">
                    <span class="quiz-question-num">QUESTION ${String(qIdx + 1).padStart(2, "0")} / 05</span>
                </div>
                <div class="quiz-question-text">${qItem.q}</div>
                <div class="quiz-options-list">
                    ${qItem.options.map((opt, optIdx) => `
                        <label class="quiz-option-label" id="quizOptLabel_${qIdx}_${optIdx}">
                            <input type="radio" name="quiz_q_${qIdx}" value="${optIdx}" onchange="handleQuizOptionSelect(${qIdx}, ${optIdx})" ${userQuizAnswers[qIdx] === optIdx ? "checked" : ""}>
                            <span>${opt}</span>
                        </label>
                    `).join("")}
                </div>
                <div id="quizExplanation_${qIdx}" style="display: none; margin-top: 10px; font-size: 10px; line-height: 1.4; color: var(--muted); padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 4px;"></div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function handleQuizOptionSelect(qIdx, optIdx) {
    userQuizAnswers[qIdx] = optIdx;
}

function submitLearnQuiz() {
    const mod = learnModules[activeLearnKey];
    if (!mod) return;

    const totalQuestions = mod.quiz.length;
    const answeredCount = Object.keys(userQuizAnswers).length;

    if (answeredCount < totalQuestions) {
        showToast(`Please answer all ${totalQuestions} questions before submitting.`, "⚠️");
        return;
    }

    quizSubmitted = true;
    let correctCount = 0;

    mod.quiz.forEach((qItem, qIdx) => {
        const userChoice = userQuizAnswers[qIdx];
        const isCorrect = userChoice === qItem.answer;
        if (isCorrect) correctCount++;

        const explanationEl = $(`quizExplanation_${qIdx}`);
        if (explanationEl) {
            explanationEl.style.display = "block";
            explanationEl.innerHTML = `<strong>${isCorrect ? "✓ Correct:" : "✖ Incorrect:"}</strong> ${qItem.explanation}`;
            explanationEl.style.color = isCorrect ? "#4ade80" : "#fb7185";
        }

        qItem.options.forEach((opt, optIdx) => {
            const labelEl = $(`quizOptLabel_${qIdx}_${optIdx}`);
            if (labelEl) {
                if (optIdx === qItem.answer) {
                    labelEl.classList.add("correct-option");
                } else if (optIdx === userChoice && !isCorrect) {
                    labelEl.classList.add("incorrect-option");
                }
            }
        });
    });

    const pct = Math.round((correctCount / totalQuestions) * 100);
    const isPassed = correctCount >= 3;

    const bannerContainer = $("quizResultBannerContainer");
    if (bannerContainer) {
        const nextDrillButton = (isPassed && mod.missionKey && mod.missionKey !== "electrical" && mod.missionKey !== "medical")
            ? `<div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
                 <button type="button" class="primary-small-button" onclick="startMissionFromLearn('${mod.id}')" style="padding: 10px 18px; font-size: 10px;">
                   🚀 LAUNCH ${mod.title.toUpperCase()} SIMULATION DRILL →
                 </button>
                 <button type="button" class="secondary-button" style="padding: 8px 14px; font-size: 9px;" onclick="closeLearnProtocol(); switchSection('preparedness'); filterPrepCategory('${mod.id}');">
                   📋 RECORD ${mod.title.toUpperCase()} SAFETY ACTIONS →
                 </button>
               </div>`
            : "";

        bannerContainer.innerHTML = `
            <div class="quiz-result-banner" style="border-color: ${isPassed ? "rgba(74, 222, 128, 0.4)" : "rgba(244, 63, 94, 0.4)"}">
                <span class="perf-pill-badge">${isPassed ? "🎉 KNOWLEDGE CHECK PASSED" : "⚠️ KNOWLEDGE CHECK INCOMPLETE"}</span>
                <div class="quiz-result-score">${correctCount} / ${totalQuestions} <span>(${pct}%)</span></div>
                <p style="font-size: 11px; color: ${isPassed ? "#4ade80" : "#fb7185"}; margin: 6px 0 0;">
                    ${isPassed ? "Excellent work! You have successfully mastered this disaster preparedness module." : "Score is below passing threshold (60%). Review the action protocols and retry the quiz."}
                </p>
                ${nextDrillButton}
            </div>
        `;
    }

    if (isPassed) {
        recordDailyActivity();

        if (!state.completedLearnIds) state.completedLearnIds = new Set();
        if (!state.learnQuizScores) state.learnQuizScores = {};

        const isFirstCompletion = !state.completedLearnIds.has(mod.id);
        state.completedLearnIds.add(mod.id);

        const prevBest = state.learnQuizScores[mod.id] ? state.learnQuizScores[mod.id].score : 0;
        if (correctCount >= prevBest) {
            state.learnQuizScores[mod.id] = { score: correctCount, total: totalQuestions, pct: pct };
        }

        if (isFirstCompletion) {
            state.totalXP += 100;
            showToast(`Module Mastered: +100 XP Awarded!`, "📚");
        } else {
            showToast(`Quiz Completed: ${correctCount}/${totalQuestions} (${pct}%)`, "🎖️");
        }

        calculateReadiness();
        checkAndToastNewAchievements();
        saveProgress();
        updateAllUI();
    }

    const primaryBtn = $("learnModalPrimaryBtn");
    if (primaryBtn) {
        primaryBtn.textContent = "RETRY KNOWLEDGE CHECK";
        primaryBtn.onclick = retryLearnQuiz;
    }
}

function retryLearnQuiz() {
    quizSubmitted = false;
    userQuizAnswers = {};
    const mod = learnModules[activeLearnKey];
    if (mod) {
        renderLearnQuiz(mod);
    }
    const primaryBtn = $("learnModalPrimaryBtn");
    if (primaryBtn) {
        primaryBtn.textContent = "SUBMIT QUIZ ANSWERS →";
        primaryBtn.onclick = submitLearnQuiz;
    }
}

function closeLearnProtocol() {
    if (typeof ReadyVerseSpeech !== "undefined") {
        ReadyVerseSpeech.stop();
    }
    const modal = $("learnModal");
    if (modal) modal.classList.add("hidden");
}

/* =========================================================
   DYNAMIC LEARN HUB CATALOG UNLOCKS & BUTTONS
   ========================================================= */

function updateLearnHubCatalog() {
    Object.keys(learnModules).forEach(key => {
        const mod = learnModules[key];
        const card = document.querySelector(`[data-learn-card="${key}"]`);
        if (!card) return;

        const isCompleted = state.completedLearnIds && state.completedLearnIds.has(key);
        const button = card.querySelector("button");

        card.classList.remove("locked-card");
        if (button) {
            button.removeAttribute("disabled");
            button.className = "learn-start";
            button.setAttribute("data-learn", key);

            if (isCompleted) {
                const quizResult = state.learnQuizScores ? state.learnQuizScores[key] : null;
                const scoreText = quizResult ? ` (${quizResult.score}/5)` : "";
                button.textContent = `REVIEW & RETRY QUIZ${scoreText} →`;
            } else {
                button.textContent = "START LEARNING →";
            }
        }

        const unlockMeta = card.querySelector(".learn-unlock-text");
        if (unlockMeta) {
            unlockMeta.className = "";
            unlockMeta.textContent = "⏱ 5-Question Quiz";
        }
    });
}

/* Wire Learn Buttons with Event Delegation */
document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-learn]");
    if (btn && !btn.disabled) {
        const key = btn.getAttribute("data-learn");
        openLearnProtocol(key);
    }
});

const closeLearnBtn = $("closeLearnModal");
const dismissLearnBtn = $("dismissLearnModal");
const launchLearnSimBtn = $("launchLearnSimulation");
const tabGuidelinesBtn = $("learnTabGuidelines");
const tabQuizBtn = $("learnTabQuiz");

if (closeLearnBtn) closeLearnBtn.onclick = closeLearnProtocol;
if (dismissLearnBtn) dismissLearnBtn.onclick = closeLearnProtocol;
if (tabGuidelinesBtn) tabGuidelinesBtn.onclick = () => switchLearnTab("guidelines");
if (tabQuizBtn) tabQuizBtn.onclick = () => switchLearnTab("quiz");

if (launchLearnSimBtn) {
    launchLearnSimBtn.onclick = () => {
        const mod = learnModules[activeLearnKey];
        if (!mod || !mod.missionKey || activeLearnKey === "electrical" || activeLearnKey === "medical") {
            showToast(`${mod ? mod.title : "Emergency"} drill is coming soon! Master the knowledge protocol above.`, "📚");
            return;
        }
        closeLearnProtocol();
        startMission(mod.missionKey);
    };
}

/* =========================================================
   KEYBOARD SHORTCUTS FOR SIMULATION
   ========================================================= */

window.addEventListener("keydown", (e) => {
    const sim = $("simulationPage");
    if (!sim || sim.classList.contains("hidden")) return;

    if (!state.answered) {
        const key = e.key.toUpperCase();
        let targetIndex = -1;
        if (key === "1" || key === "A") targetIndex = 0;
        else if (key === "2" || key === "B") targetIndex = 1;
        else if (key === "3" || key === "C") targetIndex = 2;
        else if (key === "4" || key === "D") targetIndex = 3;

        if (targetIndex !== -1) {
            const buttons = document.querySelectorAll(".decision-option");
            if (buttons[targetIndex]) {
                handleDecision(targetIndex, buttons[targetIndex]);
            }
        }
    } else {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const nextBtn = $("nextDecision");
            if (nextBtn) nextBtn.click();
        }
    }
});


/* =========================================================
   DYNAMIC MISSION CATALOG UNLOCKS & COMPLETION STATUS
   ========================================================= */

function updateMissionCatalog() {

    /* Cyclone Card Update */
    const cycloneCard =
        document.querySelector('[data-mission-card="cyclone"]') ||
        $("missionCardCyclone");

    if (cycloneCard) {
        cycloneCard.classList.remove("locked-card");

        const icon =
            cycloneCard.querySelector(".large-mission-icon, .lock-icon");
        if (icon) {
            icon.className = "large-mission-icon";
            icon.textContent = "🌪️";
        }

        const btn = cycloneCard.querySelector("button");
        if (btn) {
            btn.className = "primary-small-button";
            btn.removeAttribute("disabled");
            btn.setAttribute("data-mission", "cyclone");
            btn.textContent = (state.completedMissionIds && state.completedMissionIds.has("cyclone"))
                ? "REPLAY MISSION →"
                : "START MISSION →";
        }
    }

    /* Earthquake Card Update */
    const earthquakeCard =
        document.querySelector('[data-mission-card="earthquake"]') ||
        $("missionCardEarthquake");

    if (earthquakeCard) {
        earthquakeCard.classList.remove("locked-card");

        const icon =
            earthquakeCard.querySelector(".large-mission-icon, .lock-icon");
        if (icon) {
            icon.className = "large-mission-icon";
            icon.textContent = "🌍";
        }

        const btn = earthquakeCard.querySelector("button");
        if (btn) {
            btn.className = "primary-small-button";
            btn.removeAttribute("disabled");
            btn.setAttribute("data-mission", "earthquake");
            btn.textContent = (state.completedMissionIds && state.completedMissionIds.has("earthquake"))
                ? "REPLAY MISSION →"
                : "START MISSION →";
        }
    }

    /* Mission Completion Badges & Best Grades on Cards */
    document.querySelectorAll(".large-mission-card, .mission-card").forEach(card => {
        let missionKey = card.getAttribute("data-mission-card");
        if (!missionKey) {
            if (card.classList.contains("flood-card") || card.classList.contains("flood-large")) missionKey = "flood";
            else if (card.classList.contains("fire-card") || card.classList.contains("fire-large")) missionKey = "fire";
            else if (card.classList.contains("cyclone-large")) missionKey = "cyclone";
            else if (card.classList.contains("quake-large")) missionKey = "earthquake";
        }

        if (!missionKey) return;

        let badge = card.querySelector(".completion-tag");
        if (state.completedMissionIds && state.completedMissionIds.has(missionKey)) {
            const bestGrade = state.missionBestGrades ? state.missionBestGrades[missionKey] : null;
            const bestScore = state.missionBestScores ? state.missionBestScores[missionKey] : null;
            const tagText = bestGrade ? `✓ BEST: GRADE ${bestGrade} (${bestScore}%)` : "✓ COMPLETED";

            if (!badge) {
                badge = document.createElement("span");
                badge.className = "completion-tag";
                const heading = card.querySelector("h3") || card.querySelector("h2");
                if (heading) {
                    heading.appendChild(badge);
                }
            }
            badge.textContent = tagText;

            const actionBtn = card.querySelector("[data-mission]");
            if (actionBtn && !actionBtn.textContent.includes("REPLAY")) {
                actionBtn.textContent = "REPLAY DRILL →";
            }
        } else if (badge) {
            badge.remove();
        }
    });

}


/* =========================================================
   PERSONAL PREPAREDNESS PLAN & REAL PREPAREDNESS RECORD SYSTEM
   ========================================================= */

const prepChecklistData = [
    // --- 1. PERSONAL & CAMPUS CORE EMERGENCY ESSENTIALS (GENERAL) ---
    {
        id: "core_contacts",
        category: "general",
        categoryName: "Core Essentials",
        icon: "📞",
        title: "Campus Emergency Contacts",
        desc: "Save phone numbers for campus security, hostel warden, local police (112), fire (101), ambulance (108), and family.",
        priority: "high",
        actionType: "PREPAREDNESS_RECORD",
        prompt: "Enter campus security, warden, and emergency speed-dial phone numbers for rapid access during a crisis.",
        fields: [
            { key: "value", type: "phone", label: "Campus Security & Warden Phone", placeholder: "e.g. Campus Security: 011-23456789, Warden: 9876543210" },
            { key: "secondaryValue", type: "phone", label: "Emergency Services & Family Speed-Dial", placeholder: "e.g. Police (112), Fire (101), Home: 9876543211" }
        ]
    },
    {
        id: "core_gobag",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🎒",
        title: "Student Emergency Go-Bag",
        desc: "Pack a backpack with your college ID, power bank, compact torch, spare glasses, emergency cash, and basic essentials.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Physically pack your student emergency go-bag: Student ID, charged power bank, compact LED torch, spare glasses, emergency cash, and basic personal essentials."
    },
    {
        id: "core_water_food",
        category: "general",
        categoryName: "Core Essentials",
        icon: "💧",
        title: "3-Day Water & Food Supply",
        desc: "Keep at least 3 liters of bottled water per day, energy bars, dry snacks, and electrolyte packets in your room.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect your room storage: Ensure at least 3 liters of sealed water, non-perishable snack rations, and electrolyte packets are stocked."
    },
    {
        id: "core_firstaid",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🩹",
        title: "Personal First-Aid Kit Location",
        desc: "Keep bandages, antiseptic wipes, burn ointment, pain relief pills, and a 2-week supply of your personal medicines.",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Record the exact physical storage spot in your dorm/room where your first-aid supplies and personal medications are kept.",
        fields: [
            { key: "location", type: "location", label: "First-Aid Kit Location in Room/Dorm", placeholder: "e.g. Study Desk Top Drawer, Hostel Block B" },
            { key: "floor", type: "text", label: "Personal Medicines & Emergency Supplies", placeholder: "e.g. 2-week inhaler & antiseptic bandages stored" }
        ]
    },
    {
        id: "core_docs",
        category: "general",
        categoryName: "Core Essentials",
        icon: "📁",
        title: "Waterproof ID & Document Pouch",
        desc: "Keep your college ID, admission cards, health insurance, and important certificates in a waterproof ziploc pouch.",
        priority: "medium",
        actionType: "VERIFICATION_ACTION",
        prompt: "Verify that college ID, admission cards, health insurance, and certificates are secured inside a waterproof ziploc pouch."
    },
    {
        id: "core_power_torch",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🔦",
        title: "Power Bank & Emergency Torch",
        desc: "Keep a high-capacity power bank fully charged and a small LED flashlight ready for campus power cuts.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Test your emergency flashlight and verify power bank is charged above 80% for unexpected campus blackouts."
    },
    {
        id: "core_comm_plan",
        category: "general",
        categoryName: "Core Essentials",
        icon: "💬",
        title: "Emergency Family & Roommate Check-in",
        desc: "Agree on an out-of-town family contact for SMS updates and pick a safe campus meeting point with roommates.",
        priority: "high",
        actionType: "PREPAREDNESS_RECORD",
        prompt: "Establish a predetermined meeting point on campus and an out-of-town contact person for SMS coordination.",
        fields: [
            { key: "value", type: "location", label: "Roommate / Friends Meeting Point", placeholder: "e.g. Open Amphitheatre Lawn near Gate 1" },
            { key: "secondaryValue", type: "phone", label: "Out-of-Town Family Check-in Contact", placeholder: "e.g. Out-of-town relative (+91 9876543212)" }
        ]
    },
    {
        id: "core_evac_routes",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🗺️",
        title: "Hostel & Classroom Exit Routes",
        desc: "Know two separate staircase exit paths from your hostel floor, lecture halls, and campus library.",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Identify and record the two separate staircase escape paths from your hostel floor and primary classroom building.",
        fields: [
            { key: "location", type: "location", label: "Primary Staircase Exit Route", placeholder: "e.g. East Wing Staircase A to North Ground" },
            { key: "floor", type: "location", label: "Secondary Alternate Exit Path", placeholder: "e.g. Central Emergency Fire Exit to Quadrangle" }
        ]
    },
    {
        id: "core_shelter_id",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🏛️",
        title: "Campus Assembly Points & Safe Areas",
        desc: "Locate the designated open-ground assembly areas, sports grounds, and storm shelter buildings on campus.",
        priority: "medium",
        actionType: "LOCATION_RECORD",
        prompt: "Record the designated campus open-ground assembly location and nearest reinforced severe weather shelter.",
        fields: [
            { key: "location", type: "location", label: "Designated Campus Assembly Area", placeholder: "e.g. Main Sports Ground / Central Quad" },
            { key: "floor", type: "location", label: "Storm / Severe Weather Shelter Building", placeholder: "e.g. Indoor Gymnasium Ground Floor" }
        ]
    },
    {
        id: "core_utility_shutoff",
        category: "general",
        categoryName: "Core Essentials",
        icon: "🔧",
        title: "Hostel & Lab Power Cutoff Safety",
        desc: "Know how to turn off the main room/wing switch and locate emergency power shutoff buttons in science/computer labs.",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Identify the main electrical breaker switch for your hostel wing/room and emergency cutoff button in labs.",
        fields: [
            { key: "location", type: "location", label: "Hostel Room / Wing Main Power Switch", placeholder: "e.g. Distribution Board next to Room 201 door" },
            { key: "floor", type: "location", label: "Lab / Workshop Emergency Cutoff", placeholder: "e.g. Red Emergency Stop Button near Lab Entry" }
        ]
    },

    // --- 2. CAMPUS FIRE SAFETY PLAN ---
    {
        id: "fire_smoke_alarms",
        category: "fire",
        categoryName: "Fire Safety",
        icon: "🔔",
        title: "Hostel & Lab Smoke Alarm Check",
        desc: "Make sure corridor smoke alarms and lab fire sensors are visible and not blocked by posters or luggage.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect corridor smoke alarms and lab fire sensors; confirm they are unobstructed by banners, laundry, or luggage."
    },
    {
        id: "fire_extinguisher_check",
        category: "fire",
        categoryName: "Fire Safety",
        icon: "🧯",
        title: "Fire Extinguisher Locations",
        desc: "Find the nearest fire extinguisher on your floor and learn the PASS method (Pull, Aim, Squeeze, Sweep).",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Locate and record the exact position of the nearest ABC multi-purpose fire extinguisher on your floor.",
        fields: [
            { key: "location", type: "location", label: "Nearest ABC Extinguisher Location", placeholder: "e.g. Floor 2 Corridor, Pillar 4 opposite Library" },
            { key: "floor", type: "text", label: "Extinguisher Type & Inspection Status", placeholder: "e.g. 5kg ABC Dry Powder, Pressure Gauge in Green" }
        ]
    },
    {
        id: "fire_exit_clearance",
        category: "fire",
        categoryName: "Fire Safety",
        icon: "🚪",
        title: "Clear Hallways & Fire Exits",
        desc: "Keep hostel corridors, stairwells, and emergency doors clear of shoes, boxes, drying racks, and bicycles.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Physically inspect stairwells and fire escape doors on your floor; ensure zero shoes, drying racks, or boxes block the path."
    },
    {
        id: "fire_drill_practice",
        category: "fire",
        categoryName: "Fire Safety",
        icon: "🏃",
        title: "Fire Drill & Low-Smoke Crawling",
        desc: "Practice crawling low under smoke during campus drills to reach the outside assembly area safely.",
        priority: "medium",
        actionType: "TRAINING_LINKED",
        trainingKey: "fire",
        prompt: "Confirm understanding of low-smoke crawling (breathing cleanest air near floor) and fire evacuation drill."
    },
    {
        id: "fire_kitchen_safety",
        category: "fire",
        categoryName: "Fire Safety",
        icon: "🍳",
        title: "Hostel Pantry & Mess Fire Safety",
        desc: "Know where emergency power switches are in the pantry, and never use water on hot oil or electrical fires.",
        priority: "medium",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm safety rule: Never throw water on oil, grease, or electrical fires; use baking soda, dry powder ABC extinguisher, or fire blanket."
    },

    // --- 3. MONSOON & CAMPUS FLOOD SAFETY PLAN ---
    {
        id: "flood_zone_check",
        category: "flood",
        categoryName: "Flood Safety",
        icon: "🗺️",
        title: "Campus Flood-Prone Area Awareness",
        desc: "Identify low-lying campus paths, basement labs, and ground-floor rooms that collect water during heavy rain.",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Identify and record the low-lying paths and basement zones on campus most vulnerable to waterlogging.",
        fields: [
            { key: "location", type: "location", label: "Campus Flood-Prone Path / Low-Lying Area", placeholder: "e.g. Low walkway between Hostel B and Canteen" },
            { key: "floor", type: "location", label: "Basement / Ground Floor High-Risk Zone", placeholder: "e.g. Basement Electronics Lab & Substation road" }
        ]
    },
    {
        id: "flood_backflow_valves",
        category: "flood",
        categoryName: "Flood Safety",
        icon: "🚰",
        title: "Ground-Floor Water Protection",
        desc: "Report blocked campus drains to hostel staff and help set up sandbags outside ground-floor dorms and labs.",
        priority: "medium",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect ground-floor drainage grates and verify sandbag barriers are ready outside low dorm entries."
    },
    {
        id: "flood_elevate_utilities",
        category: "flood",
        categoryName: "Flood Safety",
        icon: "🔌",
        title: "Keep Electronics & Books Off the Floor",
        desc: "Move your laptop, chargers, study notes, and power strips up onto desks or top shelves during monsoon alerts.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Verify laptops, textbooks, chargers, and surge power strips are elevated on desks/shelves during monsoon warnings."
    },
    {
        id: "flood_waterproof_kit",
        category: "flood",
        categoryName: "Flood Safety",
        icon: "🛶",
        title: "Rain Cover & Waterproof Bag",
        desc: "Use a rain cover for your backpack and keep phones, notes, and chargers in sealed waterproof bags.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Check backpack rain cover and ensure ziploc waterproof pouches are ready for phones, IDs, and power banks."
    },
    {
        id: "flood_no_drive_pledge",
        category: "flood",
        categoryName: "Flood Safety",
        icon: "🚗",
        title: "Never Cross Flooded Roads",
        desc: "Never walk or ride bikes through flooded underpasses or flowing water where depth is unclear.",
        priority: "high",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm safety pledge: Never walk, wade, or cycle through moving floodwater or submerged underpasses."
    },

    // --- 4. CYCLONE & STORM PREPAREDNESS PLAN ---
    {
        id: "cyclone_shutter_prep",
        category: "cyclone",
        categoryName: "Cyclone Plan",
        icon: "🪟",
        title: "Hostel Window & Shutter Safety",
        desc: "Close and latch all dorm windows, tape large glass panes, and lock outer shutters before high winds arrive.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect dorm window latches and outer shutters; ensure secure locking to withstand severe gale force winds."
    },
    {
        id: "cyclone_tree_trimming",
        category: "cyclone",
        categoryName: "Cyclone Plan",
        icon: "🌳",
        title: "Falling Tree & Branch Hazard Awareness",
        desc: "Avoid walking under large campus trees during high winds and report weak or broken branches near buildings.",
        priority: "medium",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm awareness: Never walk near large trees or overhead wires in high winds; report dangerous branches to maintenance."
    },
    {
        id: "cyclone_loose_objects",
        category: "cyclone",
        categoryName: "Cyclone Plan",
        icon: "🪑",
        title: "Clear Balconies & Outdoor Items",
        desc: "Bring clothes drying racks, plants, and chairs inside from hostel balconies so winds cannot blow them away.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Clear all drying racks, flower pots, chairs, and loose items from balconies and window ledges."
    },
    {
        id: "cyclone_safe_room",
        category: "cyclone",
        categoryName: "Cyclone Plan",
        icon: "🛡️",
        title: "Windowless Interior Safe Spots",
        desc: "Identify inner ground-floor hallways or basements with no outside windows to take shelter during severe storms.",
        priority: "high",
        actionType: "LOCATION_RECORD",
        prompt: "Locate and record the safest interior hallway or windowless room to take shelter during high-velocity cyclonic storms.",
        fields: [
            { key: "location", type: "location", label: "Windowless Interior Shelter Hallway", placeholder: "e.g. Ground Floor Central Corridor, Hostel Block A" },
            { key: "floor", type: "location", label: "Reinforced Safe Zone / Building", placeholder: "e.g. Admin Block Basement Inner Hall" }
        ]
    },
    {
        id: "cyclone_eye_safety",
        category: "cyclone",
        categoryName: "Cyclone Plan",
        icon: "🌪️",
        title: "Storm 'Eye' Safety Warning",
        desc: "Remember that a sudden calm during a cyclone means the center is passing over and strong winds will return quickly.",
        priority: "high",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm understanding: A sudden calm during a cyclone is the storm 'Eye'; violent opposite winds will resume quickly."
    },

    // --- 5. CAMPUS EARTHQUAKE SAFETY PLAN ---
    {
        id: "quake_heavy_furniture",
        category: "earthquake",
        categoryName: "Earthquake Plan",
        icon: "🧱",
        title: "Secure Bunks, Lockers & Lab Equipment",
        desc: "Make sure tall hostel cupboards, bookshelves, and heavy lab gear are stable and won't tip over.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect tall wardrobes, bunks, and bookcases; verify they are balanced and cannot tip over onto sleeping areas."
    },
    {
        id: "quake_low_storage",
        category: "earthquake",
        categoryName: "Earthquake Plan",
        icon: "📦",
        title: "Store Heavy Items on Lower Shelves",
        desc: "Place heavy books, glass jars, and equipment on lower shelves so they cannot fall during shaking.",
        priority: "medium",
        actionType: "VERIFICATION_ACTION",
        prompt: "Ensure heavy textbooks, glass beakers, and bulky items are placed on lower shelves, not top ledges."
    },
    {
        id: "quake_drop_cover_hold",
        category: "earthquake",
        categoryName: "Earthquake Plan",
        icon: "🧘",
        title: "'Drop, Cover and Hold On' Practice",
        desc: "Practice taking cover under a sturdy desk, protecting your head, and holding on tight during tremors.",
        priority: "high",
        actionType: "TRAINING_LINKED",
        trainingKey: "earthquake",
        prompt: "Confirm regular practice of 'Drop, Cover, and Hold On' beneath a sturdy study desk, protecting neck and head."
    },
    {
        id: "quake_bed_safety",
        category: "earthquake",
        categoryName: "Earthquake Plan",
        icon: "🛏️",
        title: "Clear Hazards Above Your Bed",
        desc: "Remove heavy wall frames, fans, or loose shelves hanging directly above your hostel bed.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Verify area directly above your bed is free of heavy wall mirrors, unanchored shelving, or hanging fixtures."
    },
    {
        id: "quake_aftershock_plan",
        category: "earthquake",
        categoryName: "Earthquake Plan",
        icon: "📉",
        title: "Safe Stairway Evacuation",
        desc: "Never take elevators after an earthquake; walk down stairwells and stay clear of glass building walls.",
        priority: "high",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm understanding: Never use elevators during or after earthquakes; evacuate via stairs once tremors subside."
    },

    // --- 6. CAMPUS & HOSTEL ELECTRICAL SAFETY ---
    {
        id: "elec_gfci_test",
        category: "electrical",
        categoryName: "Electrical Safety",
        icon: "⚡",
        title: "Bathroom & Lab Safety Switch Check",
        desc: "Make sure earth-leakage safety switches (ELCB/GFCI) in hostel bathrooms and workshops are working properly.",
        priority: "high",
        actionType: "VERIFICATION_ACTION",
        prompt: "Test that the bathroom/lab earth-leakage circuit breaker (ELCB/GFCI) trips properly when the test button is pressed."
    },
    {
        id: "elec_no_overload",
        category: "electrical",
        categoryName: "Electrical Safety",
        icon: "🔌",
        title: "Prevent Multi-Plug Overloads",
        desc: "Do not connect multiple extension cords together, and never run electric kettles or irons on cheap power strips.",
        priority: "medium",
        actionType: "VERIFICATION_ACTION",
        prompt: "Inspect room power strips; ensure no daisy-chaining and high-wattage kettles/irons are not run on thin cords."
    },
    {
        id: "elec_downed_wire_rule",
        category: "electrical",
        categoryName: "Electrical Safety",
        icon: "⚠️",
        title: "Stay 35 Feet Away from Fallen Wires",
        desc: "Treat any fallen campus wire as live and dangerous; keep at least 35 feet (10 meters) away and inform security.",
        priority: "high",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm safety rule: Treat fallen wires as live; maintain 35-foot (10m) safe distance and inform campus security."
    },
    {
        id: "elec_nonconductive_tool",
        category: "electrical",
        categoryName: "Electrical Safety",
        icon: "🧹",
        title: "Safe Electric Shock Response",
        desc: "Turn off the power switch before touching someone being shocked, or use dry wood/plastic to push the wire away.",
        priority: "medium",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm rescue rule: Never touch someone receiving a shock directly; cut main power or use dry wood/plastic to push wire."
    },
    {
        id: "elec_car_wire_drill",
        category: "electrical",
        categoryName: "Electrical Safety",
        icon: "🚙",
        title: "Bus & Vehicle Power Line Safety",
        desc: "Stay inside the college bus or car if a wire falls on it; jump with both feet together only if there is a fire.",
        priority: "medium",
        actionType: "KNOWLEDGE_CONFIRMATION",
        prompt: "Confirm vehicle power line protocol: Stay inside vehicle; if fire occurs, jump clear with both feet together without bridging metal to ground."
    },

    // --- 7. STUDENT MEDICAL EMERGENCY & FIRST AID ---
    {
        id: "med_trauma_gauze",
        category: "medical",
        categoryName: "Medical Plan",
        icon: "🩸",
        title: "Bleeding Control with Direct Pressure",
        desc: "Learn how to press firmly on severe wounds with clean gauze or cloth to stop heavy bleeding quickly.",
        priority: "high",
        actionType: "TRAINING_LINKED",
        trainingKey: "medical",
        prompt: "Confirm understanding: Control severe arterial bleeding by applying firm, continuous direct pressure with sterile gauze."
    },
    {
        id: "med_cpr_training",
        category: "medical",
        categoryName: "Medical Plan",
        icon: "🫀",
        title: "Hands-Only CPR Basics",
        desc: "Learn chest compressions (push hard and fast in the center of the chest at 100–120 beats per minute).",
        priority: "high",
        actionType: "TRAINING_LINKED",
        trainingKey: "medical",
        prompt: "Confirm knowledge of hands-only CPR: Rhythmic chest compressions at 100–120 beats per minute in center of chest."
    },
    {
        id: "med_recovery_pos",
        category: "medical",
        categoryName: "Medical Plan",
        icon: "🛌",
        title: "Recovery Position for Unconscious Friends",
        desc: "Learn how to roll an unconscious breathing person onto their side to keep their breathing airway clear.",
        priority: "high",
        actionType: "TRAINING_LINKED",
        trainingKey: "medical",
        prompt: "Confirm knowledge of recovery position: Safely roll unconscious breathing individual onto their side to keep airway open."
    },
    {
        id: "med_medical_history",
        category: "medical",
        categoryName: "Medical Plan",
        icon: "📋",
        title: "Emergency Medical Card on Phone",
        desc: "Save your blood group, allergies, and emergency contact details on your phone's lock screen.",
        priority: "medium",
        actionType: "PREPAREDNESS_RECORD",
        prompt: "Record your lock screen emergency medical data (blood group, allergies, ICE tag) for first responders.",
        fields: [
            { key: "value", type: "medical_info", label: "Phone Lock Screen Emergency Medical Info", placeholder: "e.g. Blood Group O+, No Known Drug Allergies (NKDA)" },
            { key: "secondaryValue", type: "phone", label: "Emergency Medical Contact & ICE Tag", placeholder: "e.g. ICE: Dr. Sharma / Parents (+91 9876543215)" }
        ]
    },
    {
        id: "med_speed_dial",
        category: "medical",
        categoryName: "Medical Plan",
        icon: "🚑",
        title: "Campus Health Clinic on Speed Dial",
        desc: "Save numbers for the campus medical room, nearest hospital, and ambulance (108/112) on your phone.",
        priority: "high",
        actionType: "PREPAREDNESS_RECORD",
        prompt: "Save campus health clinic extension and nearest emergency hospital ambulance numbers.",
        fields: [
            { key: "value", type: "phone", label: "Campus Health Clinic Number", placeholder: "e.g. Campus Health Center: Ext 4401 / 011-23456790" },
            { key: "secondaryValue", type: "phone", label: "Ambulance Speed Dial (108/112) & Nearest Hospital", placeholder: "e.g. City Civil Hospital Emergency: 011-23456799" }
        ]
    }
];

let activePrepFilter = "all";
const prepEditingItems = new Set();

function getPreparednessStats() {
    const total = prepChecklistData.length;
    let completed = 0;
    const completedSet = new Set();
    let recordedCount = 0;
    let verifiedCount = 0;
    let confirmedCount = 0;
    let trainingCount = 0;

    const categoryStats = {
        general: { name: "Core Essentials", icon: "📞", completed: 0, total: 10 },
        fire: { name: "Fire Safety", icon: "🔥", completed: 0, total: 5 },
        flood: { name: "Flood Safety", icon: "🌊", completed: 0, total: 5 },
        cyclone: { name: "Cyclone Plan", icon: "🌪️", completed: 0, total: 5 },
        earthquake: { name: "Quake Plan", icon: "🌍", completed: 0, total: 5 },
        electrical: { name: "Electrical Safety", icon: "⚡", completed: 0, total: 5 },
        medical: { name: "Medical Plan", icon: "🩹", completed: 0, total: 5 }
    };

    prepChecklistData.forEach(item => {
        const itemState = state.prepChecklistState && state.prepChecklistState[item.id];
        const isDone = Boolean(itemState && itemState.completed);
        if (isDone) {
            completed++;
            completedSet.add(item.id);

            const aType = (itemState && itemState.actionType) || item.actionType;
            if (aType === "LOCATION_RECORD" || aType === "PREPAREDNESS_RECORD") recordedCount++;
            else if (aType === "VERIFICATION_ACTION") verifiedCount++;
            else if (aType === "KNOWLEDGE_CONFIRMATION") confirmedCount++;
            else if (aType === "TRAINING_LINKED") trainingCount++;

            if (categoryStats[item.category]) {
                categoryStats[item.category].completed++;
            }
        }
    });

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed;
    const xpEarned = (state.completedPrepItemIds ? state.completedPrepItemIds.size : 0) * 15;

    return {
        total,
        completed,
        remaining,
        pct,
        xpEarned,
        completedSet,
        recordedCount,
        verifiedCount,
        confirmedCount,
        trainingCount,
        categoryStats
    };
}

function getNextBestAction() {
    const { completedSet } = getPreparednessStats();
    
    // First try high priority incomplete items
    let nextItem = prepChecklistData.find(item => item.priority === "high" && !completedSet.has(item.id));
    if (!nextItem) {
        nextItem = prepChecklistData.find(item => !completedSet.has(item.id));
    }
    return nextItem || null;
}

function getISOTimestamp() {
    return new Date().toISOString();
}

function formatDisplayDate(isoOrDateStr) {
    if (!isoOrDateStr) return "Previously Completed";
    if (isoOrDateStr === "Previously Completed") return "Previously Completed";
    const d = new Date(isoOrDateStr);
    if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
    return isoOrDateStr;
}

function validatePrepFieldValue(val, fieldType, fieldLabel) {
    const trimmed = (val || "").trim();
    if (!trimmed) {
        return { valid: false, message: `Please enter ${fieldLabel || "the required information"}.` };
    }

    // Reject pure symbols / punctuation across all field types
    if (/^[!@#$%^&*()_+=~`?><|{}[\]\\/,.\-\s:;]+$/.test(trimmed)) {
        return { valid: false, message: `Please enter valid information for ${fieldLabel || "this field"}.` };
    }

    if (fieldType === "phone") {
        // Phone validation:
        // Must contain at least 3 digits (e.g. 112, 108, 101, or full phone numbers)
        const digits = trimmed.match(/\d/g) || [];
        if (digits.length < 3) {
            return { valid: false, message: `Please enter a valid phone number for ${fieldLabel || "this field"}.` };
        }

        // Strip known contact label prefixes/words (e.g. "Campus Security:", "Warden:", "ICE:", "Ext 4401", "Ambulance:")
        const core = trimmed.replace(/\b(?:campus|security|warden|police|fire|ambulance|home|parents|mom|dad|ice|doctor|dr|clinic|hospital|ext|extension|room|block|gate|dept|office|emergency|ph|tel|mob|mobile|contact|speed|dial|help|desk)\b[:\s\-\/.]*/gi, "").trim();

        // If after removing known prefixes there are still letters, check for mashed letters/numbers
        if (/[a-zA-Z]/.test(core)) {
            if (/\d+[a-zA-Z]+\d*/.test(core) || /[a-zA-Z]+\d+/.test(core) || /\d+[a-zA-Z]+/.test(core)) {
                return { valid: false, message: `Invalid phone format in ${fieldLabel || "this field"}. Please enter valid digits.` };
            }
            // If any unknown letters remain in the phone number part
            const nonPhone = core.replace(/[\d+\-()\s,\/:;.]/g, "");
            if (nonPhone.length > 0) {
                return { valid: false, message: `Invalid phone format in ${fieldLabel || "this field"}. Please enter valid digits.` };
            }
        }

        // Reject strings that have invalid symbols
        const cleanChars = trimmed.replace(/[a-zA-Z0-9+\-()\s,/:.;]/g, "");
        if (cleanChars.length > 0) {
            return { valid: false, message: `Invalid phone format in ${fieldLabel || "this field"}.` };
        }

    } else if (fieldType === "location" || fieldType === "room_block_floor") {
        // Location validation:
        // MUST reject pure numeric strings like 23456789, 45678, 123456, 204
        if (/^[\d\s,.\-]+$/.test(trimmed)) {
            return { valid: false, message: `Please enter a meaningful campus location (e.g. Block B, Ground Floor or Near Canteen).` };
        }

        // Must contain at least 2 alphabetic characters (e.g. "Rm 104", "Block B", "Floor 2")
        const letters = trimmed.match(/[a-zA-Z]/g) || [];
        if (letters.length < 2) {
            return { valid: false, message: `Please enter a meaningful campus location, such as Block B, Ground Floor or Near Canteen.` };
        }

        // Must have at least 3 characters total
        if (trimmed.length < 3) {
            return { valid: false, message: `Please enter a specific campus or room location.` };
        }

        // Reject repeated single character spam like "aaaaaaa" or "xxxxxx"
        if (/^(.)\1{4,}$/i.test(trimmed.replace(/\s/g, ""))) {
            return { valid: false, message: `Please enter a valid campus location description.` };
        }

    } else if (fieldType === "medical_info") {
        // Medical info validation:
        // Reject pure numeric strings
        if (/^[\d\s,.\-]+$/.test(trimmed)) {
            return { valid: false, message: `Please enter valid emergency medical info (e.g. Blood Group O+, NKDA).` };
        }

        // Must contain at least 2 alphanumeric characters
        const alphanum = trimmed.match(/[a-zA-Z0-9]/g) || [];
        if (alphanum.length < 2) {
            return { valid: false, message: `Please enter valid emergency medical info (e.g. Blood Group O+, NKDA).` };
        }

    } else {
        // General text / details / notes validation:
        // Must have at least 2 alphanumeric characters
        const alphanumCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
        if (alphanumCount < 2) {
            return { valid: false, message: `Please enter valid details for ${fieldLabel || "this field"}.` };
        }
    }

    return { valid: true, trimmed };
}

function savePrepRecord(itemId, field1Val, field2Val, notesVal) {
    const itemDef = prepChecklistData.find(i => i.id === itemId);
    if (!itemDef) return;

    const f1Def = (itemDef.fields && itemDef.fields[0]) || { key: "location", type: "location", label: "Required Information" };
    const f2Def = (itemDef.fields && itemDef.fields[1]) || { key: "floor", type: "text", label: "Additional Details" };

    const f1Type = f1Def.type || (itemDef.actionType === "PREPAREDNESS_RECORD" && /phone|contact|dial/i.test(f1Def.label) ? "phone" : "location");
    const f2Type = f2Def.type || (/phone|contact|dial/i.test(f2Def.label) ? "phone" : "text");

    // Validate field 1
    const v1Result = validatePrepFieldValue(field1Val, f1Type, f1Def.label);
    if (!v1Result.valid) {
        showToast(v1Result.message, "⚠️");
        const f1Input = $(`prepField1_${itemId}`);
        if (f1Input && typeof f1Input.focus === "function") f1Input.focus();
        return;
    }

    const f1 = v1Result.trimmed;
    let f2 = (field2Val || "").trim();

    // If field 2 is provided, validate it as well
    if (f2) {
        const v2Result = validatePrepFieldValue(f2, f2Type, f2Def.label);
        if (!v2Result.valid) {
            showToast(v2Result.message, "⚠️");
            const f2Input = $(`prepField2_${itemId}`);
            if (f2Input && typeof f2Input.focus === "function") f2Input.focus();
            return;
        }
        f2 = v2Result.trimmed;
    }

    const notes = (notesVal || "").trim();

    if (!state.prepChecklistState) state.prepChecklistState = {};
    if (!state.completedPrepItemIds) state.completedPrepItemIds = new Set();

    const current = state.prepChecklistState[itemId] || {};
    const nowISO = getISOTimestamp();
    const isFirstCompletion = !state.completedPrepItemIds.has(itemId);

    state.prepChecklistState[itemId] = {
        completed: true,
        actionType: itemDef.actionType,
        location: f1,
        floor: f2,
        value: f1,
        secondaryValue: f2,
        notes: notes !== undefined && notes !== "" ? notes : (current.notes || ""),
        completedAt: current.completedAt || nowISO,
        lastVerifiedAt: nowISO
    };

    prepEditingItems.delete(itemId);

    if (isFirstCompletion) {
        state.completedPrepItemIds.add(itemId);
        state.totalXP += 15;
        recordDailyActivity();
        showToast(`Preparedness Record Saved: +15 XP! (${itemDef.title})`, "📋");
    } else {
        showToast(`Preparedness Record Updated ✓ (${itemDef.title})`, "📋");
    }

    calculateReadiness();
    checkAndToastNewAchievements();
    saveProgress();
    updateAllUI();
}

function confirmPrepAction(itemId) {
    const itemDef = prepChecklistData.find(i => i.id === itemId);
    if (!itemDef) return;

    // For TRAINING_LINKED: Completion strictly depends on existing Learn Hub training state!
    if (itemDef.actionType === "TRAINING_LINKED") {
        const isTrainingDone = Boolean(state.completedLearnIds && state.completedLearnIds.has(itemDef.trainingKey));
        if (!isTrainingDone) {
            showToast(`Please complete the ${itemDef.categoryName} module in Learn Hub first to verify this training.`, "⚠️");
            return;
        }
    }

    // For LOCATION_RECORD or PREPAREDNESS_RECORD: Do not allow confirm without saved required fields
    if (itemDef.actionType === "LOCATION_RECORD" || itemDef.actionType === "PREPAREDNESS_RECORD") {
        const current = (state.prepChecklistState && state.prepChecklistState[itemId]) || {};
        if (!current.location && !current.value) {
            showToast("Please fill in the required record fields first.", "⚠️");
            const f1Input = $(`prepField1_${itemId}`);
            if (f1Input && typeof f1Input.focus === "function") f1Input.focus();
            return;
        }
    }

    if (!state.prepChecklistState) state.prepChecklistState = {};
    if (!state.completedPrepItemIds) state.completedPrepItemIds = new Set();

    const current = state.prepChecklistState[itemId] || {};
    const nowISO = getISOTimestamp();
    const isFirstCompletion = !state.completedPrepItemIds.has(itemId);

    state.prepChecklistState[itemId] = {
        ...current,
        completed: true,
        actionType: itemDef.actionType,
        completedAt: current.completedAt || nowISO,
        lastVerifiedAt: nowISO
    };

    if (isFirstCompletion) {
        state.completedPrepItemIds.add(itemId);
        state.totalXP += 15;
        recordDailyActivity();
        const actionVerb = itemDef.actionType === "TRAINING_LINKED" ? "Training Verified" : (itemDef.actionType === "KNOWLEDGE_CONFIRMATION" ? "Protocol Confirmed" : "Action Verified");
        showToast(`${actionVerb}: +15 XP! (${itemDef.title})`, "✓");
    } else {
        showToast(`Action Re-verified ✓ (${itemDef.title})`, "✓");
    }

    calculateReadiness();
    checkAndToastNewAchievements();
    saveProgress();
    updateAllUI();
}

function togglePrepItem(itemId) {
    if (!state.prepChecklistState) state.prepChecklistState = {};
    const current = state.prepChecklistState[itemId] || { completed: false };
    const itemDef = prepChecklistData.find(i => i.id === itemId);
    if (!itemDef) return;

    if (current.completed) {
        // Uncheck / Mark Incomplete
        state.prepChecklistState[itemId] = {
            ...current,
            completed: false
        };
        showToast("Action Marked Incomplete", "↩");
        calculateReadiness();
        checkAndToastNewAchievements();
        saveProgress();
        updateAllUI();
    } else {
        // CRITICAL COMPLETION RULE: Generic checkbox/toggle must NEVER directly mark a structured item completed!
        // Direct the student to the action-type-specific control after highlighting the item card.
        const card = $(`prepCard_${itemId}`);
        if (card) {
            card.classList.add("highlight-pulse");
            setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
        }

        if (itemDef.actionType === "LOCATION_RECORD" || itemDef.actionType === "PREPAREDNESS_RECORD") {
            const f1Def = (itemDef.fields && itemDef.fields[0]) || { label: "required details" };
            showToast(`Please enter and save ${f1Def.label} below.`, "ℹ️");
            const f1Input = $(`prepField1_${itemId}`);
            if (f1Input && typeof f1Input.focus === "function") f1Input.focus();
        } else if (itemDef.actionType === "VERIFICATION_ACTION") {
            showToast("Please use the 'I Verified This' button below to physically verify.", "ℹ️");
        } else if (itemDef.actionType === "KNOWLEDGE_CONFIRMATION") {
            showToast("Please use the 'Confirm Action' button below to confirm this safety rule.", "ℹ️");
        } else if (itemDef.actionType === "TRAINING_LINKED") {
            const isTrainingDone = Boolean(state.completedLearnIds && state.completedLearnIds.has(itemDef.trainingKey));
            if (!isTrainingDone) {
                showToast(`Please complete the ${itemDef.categoryName} module in Learn Hub first.`, "⚠️");
            } else {
                showToast("Click 'Confirm Training' below to verify this completed drill.", "ℹ️");
            }
        }
    }
}

function togglePrepItemEdit(itemId) {
    if (prepEditingItems.has(itemId)) {
        prepEditingItems.delete(itemId);
    } else {
        prepEditingItems.add(itemId);
    }
    renderPreparednessChecklist();
}

function updatePrepItemNote(itemId, noteText) {
    if (!state.prepChecklistState) state.prepChecklistState = {};
    const currentState = state.prepChecklistState[itemId] || { completed: false, notes: "" };
    state.prepChecklistState[itemId] = {
        ...currentState,
        notes: noteText
    };
    saveProgress();
}

function renderPreparednessSummary() {
    const summaryContainer = $("prepCategorySummaryContainer");
    const summaryPill = $("prepBreakdownSummary");
    const stats = getPreparednessStats();

    if (summaryPill) {
        summaryPill.textContent = `${stats.completed} / ${stats.total} Actions Recorded (${stats.pct}%)`;
    }

    if (!summaryContainer) return;

    let html = "";
    Object.entries(stats.categoryStats).forEach(([catKey, cat]) => {
        const catPct = Math.round((cat.completed / cat.total) * 100);
        const isCatDone = cat.completed === cat.total;

        html += `
            <div class="prep-category-card ${isCatDone ? "completed-cat" : ""}" onclick="filterPrepCategory('${catKey}')" title="Filter by ${cat.name}">
                <div class="prep-category-card-top">
                    <span class="prep-category-name">${cat.icon} ${cat.name}</span>
                    <span class="prep-category-count">${cat.completed} / ${cat.total}</span>
                </div>
                <div class="prep-category-bar-bg">
                    <div class="prep-category-bar-fill" style="width: ${catPct}%;"></div>
                </div>
            </div>
        `;
    });

    summaryContainer.innerHTML = html;
}

function filterPrepCategory(catKey) {
    activePrepFilter = catKey;
    document.querySelectorAll("[data-prep-filter]").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-prep-filter") === catKey);
    });
    renderPreparednessChecklist();
}

function renderPreparednessPage() {
    const stats = getPreparednessStats();
    const nextAction = getNextBestAction();

    // 1. Telemetry Elements
    const overallScoreEl = $("prepOverallScore");
    const scoreBadgeEl = $("prepScoreBadge");
    const scoreTitleEl = $("prepScoreTitle");
    const scoreDescEl = $("prepScoreDesc");
    const completedCountEl = $("prepCompletedCount");
    const recordedCountEl = $("prepRecordedCount");
    const remainingCountEl = $("prepRemainingCount");
    const xpEarnedEl = $("prepXPEarned");
    const overallBarEl = $("prepOverallBar");

    if (overallScoreEl) overallScoreEl.textContent = stats.pct;
    if (completedCountEl) completedCountEl.textContent = `${stats.completed} / ${stats.total}`;
    if (recordedCountEl) recordedCountEl.textContent = stats.recordedCount;
    if (remainingCountEl) remainingCountEl.textContent = stats.remaining;
    if (xpEarnedEl) xpEarnedEl.textContent = `+${stats.xpEarned}`;
    if (overallBarEl) overallBarEl.style.width = `${stats.pct}%`;

    if (scoreBadgeEl) {
        if (stats.pct >= 80) {
            scoreBadgeEl.textContent = "🏆 CAMPUS READY · MASTER PREPARED";
            scoreBadgeEl.style.borderColor = "rgba(74, 222, 128, 0.5)";
            scoreBadgeEl.style.color = "#4ade80";
        } else if (stats.pct >= 50) {
            scoreBadgeEl.textContent = "⚡ ADVANCED PREPAREDNESS · GOOD PROGRESS";
            scoreBadgeEl.style.borderColor = "rgba(167, 139, 250, 0.5)";
            scoreBadgeEl.style.color = "#c084fc";
        } else if (stats.pct > 0) {
            scoreBadgeEl.textContent = "📋 ACTION IN PROGRESS · STUDENT PLAN ACTIVE";
            scoreBadgeEl.style.borderColor = "rgba(251, 191, 36, 0.5)";
            scoreBadgeEl.style.color = "#fbbf24";
        } else {
            scoreBadgeEl.textContent = "ACTION REQUIRED · INITIAL PLANNING";
            scoreBadgeEl.style.borderColor = "rgba(244, 63, 94, 0.4)";
            scoreBadgeEl.style.color = "#fb7185";
        }
    }

    if (scoreTitleEl) {
        if (stats.pct === 100) scoreTitleEl.textContent = "Campus Disaster Resilience Achieved! 🎉";
        else if (stats.pct >= 80) scoreTitleEl.textContent = "High-Level Campus Preparedness";
        else if (stats.pct >= 50) scoreTitleEl.textContent = "Intermediate Campus Preparedness";
        else scoreTitleEl.textContent = "Student Preparedness Score";
    }

    // 2. Next Best Action Card
    const nextActionContainer = $("prepNextActionContainer");
    if (nextActionContainer) {
        if (nextAction) {
            const isRecType = nextAction.actionType === "LOCATION_RECORD" || nextAction.actionType === "PREPAREDNESS_RECORD";
            const btnLabel = isRecType ? "📍 RECORD ACTION (+15 XP)" : "✓ COMPLETE ACTION (+15 XP)";

            nextActionContainer.innerHTML = `
                <div class="prep-next-action-info">
                    <span class="perf-pill-badge badge-priority-rec">
                        NEXT BEST ACTION · ${nextAction.categoryName.toUpperCase()}
                    </span>
                    <h4>${nextAction.icon} ${nextAction.title}</h4>
                    <p>${nextAction.desc}</p>
                </div>
                <button class="primary-button" style="white-space: nowrap; flex-shrink: 0;" onclick="focusOrCompleteNextAction('${nextAction.id}')">
                    ${btnLabel}
                </button>
            `;
            nextActionContainer.style.display = "flex";
        } else {
            nextActionContainer.innerHTML = `
                <div class="prep-next-action-info">
                    <span class="perf-pill-badge badge-mastered">
                        🏆 PLAN 100% COMPLETE
                    </span>
                    <h4>All 40 Preparedness Actions Verified</h4>
                    <p>Your student emergency preparedness plan is complete across all campus safety categories.</p>
                </div>
            `;
            nextActionContainer.style.display = "flex";
        }
    }

    // 3. Render Category Summary Matrix
    renderPreparednessSummary();

    // 4. Profile Form Fields Sync
    if (state.prepProfile) {
        const nameInput = $("prepInputName");
        const collegeInput = $("prepInputCollege");
        const contactInput = $("prepInputContact");
        const campusContactInput = $("prepInputCampusContact");
        const hazardInput = $("prepInputHazard");
        const medicalInput = $("prepInputMedical");

        if (nameInput && document.activeElement !== nameInput) nameInput.value = state.prepProfile.name || "";
        if (collegeInput && document.activeElement !== collegeInput) collegeInput.value = state.prepProfile.college || "Campus Community";
        if (contactInput && document.activeElement !== contactInput) contactInput.value = state.prepProfile.emergencyContact || "";
        if (campusContactInput && document.activeElement !== campusContactInput) campusContactInput.value = state.prepProfile.campusContact || "";
        if (hazardInput && document.activeElement !== hazardInput) hazardInput.value = state.prepProfile.priorityHazard || "all";
        if (medicalInput && document.activeElement !== medicalInput) medicalInput.value = state.prepProfile.medicalNotes || "";
    }

    // 5. Render Checklist Items
    renderPreparednessChecklist();
}

function focusOrCompleteNextAction(itemId) {
    const item = prepChecklistData.find(i => i.id === itemId);
    if (!item) return;

    if (activePrepFilter !== "all" && activePrepFilter !== item.category) {
        activePrepFilter = "all";
        document.querySelectorAll("[data-prep-filter]").forEach(b => {
            b.classList.toggle("active", b.getAttribute("data-prep-filter") === "all");
        });
        renderPreparednessChecklist();
    }

    const card = $(`prepCard_${itemId}`);
    if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight-pulse");
        setTimeout(() => card.classList.remove("highlight-pulse"), 2500);

        const firstInput = card.querySelector(".prep-record-input");
        if (firstInput && typeof firstInput.focus === "function") {
            setTimeout(() => firstInput.focus(), 400);
        }
    }
}

function renderPreparednessChecklist() {
    const container = $("prepChecklistItemsContainer");
    if (!container) return;

    const filteredItems = prepChecklistData.filter(item => {
        if (activePrepFilter === "all") return true;
        return item.category === activePrepFilter;
    });

    let html = "";
    filteredItems.forEach(item => {
        const itemState = (state.prepChecklistState && state.prepChecklistState[item.id]) || { completed: false, notes: "" };
        const isCompleted = Boolean(itemState.completed);
        const hasEverEarnedXP = state.completedPrepItemIds && state.completedPrepItemIds.has(item.id);
        const xpBadgeText = hasEverEarnedXP ? "✓ XP EARNED" : "+15 XP";
        const isEditing = prepEditingItems.has(item.id);
        const displayDate = formatDisplayDate(itemState.lastVerifiedAt || itemState.completedAt);

        let statusClass = "status-pending";
        let statusText = "PENDING";

        if (isCompleted) {
            if (item.actionType === "LOCATION_RECORD" || item.actionType === "PREPAREDNESS_RECORD") {
                statusClass = "status-recorded";
                statusText = "RECORDED ✓";
            } else if (item.actionType === "VERIFICATION_ACTION") {
                statusClass = "status-verified";
                statusText = "VERIFIED ✓";
            } else if (item.actionType === "TRAINING_LINKED") {
                statusClass = "status-training";
                statusText = "TRAINING VERIFIED ✓";
            } else {
                statusClass = "status-confirmed";
                statusText = "CONFIRMED ✓";
            }
        }

        let controlHtml = "";

        if (item.actionType === "LOCATION_RECORD" || item.actionType === "PREPAREDNESS_RECORD") {
            const f1Def = (item.fields && item.fields[0]) || { key: "location", label: "Location / Area", placeholder: "e.g. Building / Floor" };
            const f2Def = (item.fields && item.fields[1]) || { key: "floor", label: "Details / Landmark", placeholder: "e.g. Near Staircase" };

            const savedF1 = itemState.location || itemState.value || "";
            const savedF2 = itemState.floor || itemState.secondaryValue || "";

            if (isCompleted && !isEditing) {
                controlHtml = `
                    <div class="prep-record-box">
                        <div class="prep-record-saved-display">
                            <div class="prep-record-saved-line">
                                <span class="prep-record-saved-label">${f1Def.label}:</span>
                                <strong>${savedF1 || "Recorded"}</strong>
                            </div>
                            ${savedF2 ? `
                            <div class="prep-record-saved-line">
                                <span class="prep-record-saved-label">${f2Def.label}:</span>
                                <span>${savedF2}</span>
                            </div>` : ""}
                            <div class="prep-record-saved-meta">
                                <span>📅 Last Verified: <strong>${displayDate}</strong></span>
                                <div style="display: flex; gap: 8px;">
                                    <button class="prep-btn-secondary" onclick="togglePrepItemEdit('${item.id}')">
                                        ✏️ EDIT RECORD
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                controlHtml = `
                    <div class="prep-record-box">
                        <p class="prep-record-prompt">${item.prompt || "Record specific details below to complete this preparedness action."}</p>
                        <div class="prep-record-fields">
                            <div class="prep-record-field-group">
                                <label class="prep-record-field-label" for="prepField1_${item.id}">${f1Def.label}</label>
                                <input type="text" id="prepField1_${item.id}" class="prep-record-input" placeholder="${f1Def.placeholder}" value="${savedF1.replace(/"/g, "&quot;")}">
                            </div>
                            <div class="prep-record-field-group">
                                <label class="prep-record-field-label" for="prepField2_${item.id}">${f2Def.label}</label>
                                <input type="text" id="prepField2_${item.id}" class="prep-record-input" placeholder="${f2Def.placeholder}" value="${savedF2.replace(/"/g, "&quot;")}">
                            </div>
                        </div>
                        <div class="prep-record-actions-row">
                            <button class="prep-btn-save prep-btn-record" onclick="savePrepRecord('${item.id}', document.getElementById('prepField1_${item.id}').value, document.getElementById('prepField2_${item.id}').value, document.getElementById('prepNote_${item.id}') ? document.getElementById('prepNote_${item.id}').value : '')">
                                💾 ${isCompleted ? "UPDATE RECORD ✓" : "SAVE & CONFIRM (+15 XP)"}
                            </button>
                            ${isCompleted ? `
                            <button class="prep-btn-secondary" onclick="togglePrepItemEdit('${item.id}')">
                                CANCEL
                            </button>` : ""}
                        </div>
                    </div>
                `;
            }
        } else if (item.actionType === "VERIFICATION_ACTION") {
            if (isCompleted) {
                controlHtml = `
                    <div class="prep-record-box">
                        <div class="prep-record-saved-meta" style="border: none; padding: 0; margin: 0;">
                            <span>🔍 Physically Verified: <strong>${displayDate}</strong></span>
                            <button class="prep-btn-secondary" onclick="confirmPrepAction('${item.id}')">
                                🔄 RE-VERIFY TODAY
                            </button>
                        </div>
                    </div>
                `;
            } else {
                controlHtml = `
                    <div class="prep-record-box">
                        <p class="prep-record-prompt">${item.prompt || "Physically inspect and verify this emergency preparedness item."}</p>
                        <div class="prep-record-actions-row">
                            <button class="prep-btn-save prep-btn-verify" onclick="confirmPrepAction('${item.id}')">
                                🔍 I VERIFIED THIS (+15 XP)
                            </button>
                        </div>
                    </div>
                `;
            }
        } else if (item.actionType === "TRAINING_LINKED") {
            const isTrainingDone = Boolean(state.completedLearnIds && state.completedLearnIds.has(item.trainingKey));
            if (isCompleted) {
                controlHtml = `
                    <div class="prep-record-box">
                        <div class="prep-record-saved-meta" style="border: none; padding: 0; margin: 0;">
                            <span>🎓 Protocol Verified: <strong>${displayDate}</strong></span>
                            <button class="prep-btn-secondary" onclick="confirmPrepAction('${item.id}')">
                                🔄 RE-CONFIRM
                            </button>
                        </div>
                    </div>
                `;
            } else {
                if (isTrainingDone) {
                    controlHtml = `
                        <div class="prep-record-box">
                            <p class="prep-record-prompt">${item.prompt || "Master this response protocol through practice and training."}</p>
                            <div style="margin-bottom: 8px;">
                                <span class="perf-pill-badge badge-mastered">
                                    🎓 LEARN HUB MODULE MASTERED ✓
                                </span>
                            </div>
                            <div class="prep-record-actions-row">
                                <button class="prep-btn-save prep-btn-training" onclick="confirmPrepAction('${item.id}')">
                                    🎓 CONFIRM TRAINING (+15 XP)
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    controlHtml = `
                        <div class="prep-record-box">
                            <p class="prep-record-prompt">${item.prompt || "Master this response protocol through practice and training in Learn Hub."}</p>
                            <div style="margin-bottom: 8px;">
                                <span class="perf-pill-badge badge-training-req">
                                    🔒 REQUIRES ${item.categoryName.toUpperCase()} IN LEARN HUB
                                </span>
                            </div>
                            <div class="prep-record-actions-row">
                                <button class="prep-btn-secondary prep-btn-open-protocol" onclick="openLearnProtocol('${item.trainingKey}')">
                                    📖 OPEN ${item.categoryName.toUpperCase()} PROTOCOL ↗
                                </button>
                                <button class="prep-btn-secondary" onclick="confirmPrepAction('${item.id}')" title="Requires completing Learn Hub module quiz">
                                    🔒 VERIFY TRAINING
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
        } else {
            // KNOWLEDGE_CONFIRMATION
            if (isCompleted) {
                controlHtml = `
                    <div class="prep-record-box">
                        <div class="prep-record-saved-meta" style="border: none; padding: 0; margin: 0;">
                            <span>💡 Safety Rule Confirmed: <strong>${displayDate}</strong></span>
                            <button class="prep-btn-secondary" onclick="confirmPrepAction('${item.id}')">
                                🔄 RE-CONFIRM
                            </button>
                        </div>
                    </div>
                `;
            } else {
                controlHtml = `
                    <div class="prep-record-box">
                        <p class="prep-record-prompt">${item.prompt || "Review and confirm this safety standard."}</p>
                        <div class="prep-record-actions-row">
                            <button class="prep-btn-save prep-btn-confirm" onclick="confirmPrepAction('${item.id}')">
                                💡 CONFIRM ACTION (+15 XP)
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        html += `
            <div class="prep-item-card ${isCompleted ? "completed" : ""}" data-action-type="${item.actionType}" id="prepCard_${item.id}">
                <div class="prep-item-header">
                    <button class="prep-checkbox-custom" onclick="togglePrepItem('${item.id}')" title="${isCompleted ? "Click to mark incomplete" : "Requires specific action verification below"}">
                        ${isCompleted ? "✓" : ""}
                    </button>
                    <div class="prep-item-content">
                        <div class="prep-item-topline">
                            <div class="prep-item-title">${item.icon} ${item.title}</div>
                            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                                <span class="prep-status-badge ${statusClass}">
                                    ${statusText}
                                </span>
                                <span class="perf-badge-${item.priority === "high" ? "pending" : "active"}" style="font-size: 8px; padding: 2px 6px;">
                                    ${item.priority.toUpperCase()}
                                </span>
                                <span class="perf-pill-badge" style="font-size: 8px; padding: 2px 6px; color: ${hasEverEarnedXP ? "#4ade80" : "var(--lavender)"};">
                                    ${xpBadgeText}
                                </span>
                            </div>
                        </div>
                        <p class="prep-item-desc">${item.desc}</p>
                        ${controlHtml}
                        <div class="prep-notes-row">
                            <input type="text" id="prepNote_${item.id}" class="prep-note-input" placeholder="Add specific room / hostel / notes (e.g. Block B Room 204)..." 
                                value="${(itemState.notes || "").replace(/"/g, "&quot;")}" 
                                onchange="updatePrepItemNote('${item.id}', this.value)">
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function savePreparednessProfile() {
    const nameInput = $("prepInputName");
    const collegeInput = $("prepInputCollege");
    const contactInput = $("prepInputContact");
    const campusContactInput = $("prepInputCampusContact");
    const hazardInput = $("prepInputHazard");
    const medicalInput = $("prepInputMedical");

    const newName = nameInput ? nameInput.value.trim() || "Student" : "Student";
    const newCollege = collegeInput ? collegeInput.value.trim() || "Campus Community" : "Campus Community";

    state.prepProfile = {
        name: newName,
        college: newCollege,
        emergencyContact: contactInput ? contactInput.value.trim() : "",
        campusContact: campusContactInput ? campusContactInput.value.trim() : "",
        priorityHazard: hazardInput ? hazardInput.value : "all",
        medicalNotes: medicalInput ? medicalInput.value.trim() : ""
    };

    if (!state.responderProfile) {
        state.responderProfile = {
            name: newName,
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        };
    } else {
        state.responderProfile.name = newName;
    }

    showToast("Student Profile Details Saved ✓", "🎓");
    saveProgress();
    updateAllUI();
}

/* Category Filter Tabs Click Handling */
document.addEventListener("click", (e) => {
    const filterBtn = e.target.closest("[data-prep-filter]");
    if (filterBtn) {
        document.querySelectorAll("[data-prep-filter]").forEach(b => b.classList.remove("active"));
        filterBtn.classList.add("active");
        activePrepFilter = filterBtn.getAttribute("data-prep-filter");
        renderPreparednessChecklist();
    }
});


/* =========================================================
   UPDATE EVERYTHING
   ========================================================= */

function updateAllUI() {

    updateDashboardStats();

    updateMissionCatalog();

    updateLearnHubCatalog();

    renderPreparednessPage();

    updateProgressPage();

    renderResponderProfile();

    renderReadinessReport();

    renderReadinessPassport();

    updateAchievements();

    updateLeaderboard();

    updateCustomDataElements();

}


/* =========================================================
   INITIALIZE READYVERSE
   ========================================================= */

showPage(
    landingPage
);


updateAllUI();


/* =========================================================
   CONSOLE CHECK
   ========================================================= */

rvLog("======================================");

rvLog("       READYVERSE INITIALIZED");

rvLog("======================================");

rvLog("Missions:", Object.keys(missions));

rvLog("XP:", state.totalXP);

rvLog("Readiness:", state.readiness);

rvLog("Completed missions:", state.completedMissions);

rvLog("Decisions:", state.decisionsMade);

rvLog("ReadyVerse is ready.");

/* =========================================================
   READYVERSE — PHASE 4: PILOT-READY STUDENT & CAMPUS PLATFORM
   ========================================================= */

/* =========================================================
   1. RESPONDER IDENTITY & CUSTOMIZATION CATALOG
   ========================================================= */

let activeCustomizerTab = "titles";

function openProfileCustomizer() {
    const modal = $("profileCustomizeModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    switchCustomizerTab("titles");
}

function closeProfileCustomizer() {
    const modal = $("profileCustomizeModal");
    if (!modal) return;
    modal.classList.add("hidden");
}

function switchCustomizerTab(tab) {
    activeCustomizerTab = tab;
    ["titles", "outfits", "frames"].forEach(t => {
        const btnId = "custTab" + t.charAt(0).toUpperCase() + t.slice(1);
        const btn = $(btnId);
        if (btn) {
            if (t === tab) btn.classList.add("active");
            else btn.classList.remove("active");
        }
    });
    renderCustomizerGrid(tab);
}

function equipCustomization(rawType, id) {
    if (!state.responderProfile) {
        state.responderProfile = {
            name: "Student",
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        };
    }

    const type = rawType && rawType.endsWith("s") ? rawType : (rawType + "s");
    const items = RESPONDER_CUSTOMIZATIONS[type];
    if (!items) return;
    const item = items.find(x => x.id === id);
    if (!item) return;

    // Check unlock state
    const isUnlocked = !item.reqAchievement || state.unlockedAchievements.has(item.reqAchievement);
    if (!isUnlocked) {
        showToast("🔒 Locked: Unlock by earning \"" + item.reqAchievement + "\"");
        return;
    }

    if (type === "titles") {
        state.responderProfile.titleId = id;
    } else if (type === "outfits") {
        state.responderProfile.outfitId = id;
    } else if (type === "frames") {
        state.responderProfile.frameId = id;
    }

    saveProgress();
    renderResponderProfile();
    renderCustomizerGrid(activeCustomizerTab);
    showToast("✔ Equipped " + item.name);
}

function renderCustomizerGrid(tab) {
    const grid = $("customizerGrid");
    if (!grid) return;

    const items = RESPONDER_CUSTOMIZATIONS[tab] || [];
    let currentEquippedId = "trainee";
    if (tab === "titles") currentEquippedId = state.responderProfile?.titleId || "trainee";
    else if (tab === "outfits") currentEquippedId = state.responderProfile?.outfitId || "responder_standard";
    else if (tab === "frames") currentEquippedId = state.responderProfile?.frameId || "standard_frame";

    grid.innerHTML = items.map(item => {
        const isUnlocked = !item.reqAchievement || state.unlockedAchievements.has(item.reqAchievement);
        const isEquipped = item.id === currentEquippedId;

        let badgeHtml = "";
        let actionBtnHtml = "";

        if (isEquipped) {
            badgeHtml = '<span class="equip-badge active">✔ EQUIPPED</span>';
            actionBtnHtml = '<button type="button" class="secondary-button" disabled style="width: 100%; font-size: 9px; opacity: 0.7;">IN USE</button>';
        } else if (isUnlocked) {
            badgeHtml = '<span class="equip-badge unlocked">UNLOCKED</span>';
            actionBtnHtml = '<button type="button" class="primary-small-button" onclick="equipCustomization(\'' + tab + '\', \'' + item.id + '\')" style="width: 100%;">EQUIP</button>';
        } else {
            badgeHtml = '<span class="equip-badge locked">🔒 LOCKED</span>';
            actionBtnHtml = '<div class="unlock-requirement-box">Unlock by: <strong>' + item.reqAchievement + '</strong></div>';
        }

        return '<div class="customizer-item-card ' + (isEquipped ? 'is-equipped' : '') + ' ' + (!isUnlocked ? 'is-locked' : '') + '">' +
            '<div class="cust-card-top">' +
                '<span class="cust-icon">' + (item.icon || '🖼️') + '</span>' +
                badgeHtml +
            '</div>' +
            '<h4 class="cust-title">' + item.name + '</h4>' +
            '<p class="cust-desc">' + item.desc + '</p>' +
            '<div class="cust-actions">' +
                actionBtnHtml +
            '</div>' +
        '</div>';
    }).join("");
}

function renderResponderProfile() {
    if (!state.responderProfile) {
        state.responderProfile = {
            name: state.prepProfile?.name || "Student",
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        };
    }

    const activeTitle = RESPONDER_CUSTOMIZATIONS.titles.find(t => t.id === state.responderProfile.titleId) || RESPONDER_CUSTOMIZATIONS.titles[0];
    const activeOutfit = RESPONDER_CUSTOMIZATIONS.outfits.find(o => o.id === state.responderProfile.outfitId) || RESPONDER_CUSTOMIZATIONS.outfits[0];
    const activeFrame = RESPONDER_CUSTOMIZATIONS.frames.find(f => f.id === state.responderProfile.frameId) || RESPONDER_CUSTOMIZATIONS.frames[0];

    const studentName = state.prepProfile?.name || state.responderProfile.name || "Student";
    const collegeName = state.prepProfile?.college || "Campus Community";

    const profileStudentName = $("profileStudentName");
    const profileCollegeName = $("profileCollegeName");
    const profileActiveTitle = $("profileActiveTitle");
    const profileOutfitBadge = $("profileOutfitBadge");
    const profileAvatarBox = $("profileAvatarBox");
    const profileAvatarFrame = $("profileAvatarFrame");
    const profileAvatarIcon = $("profileAvatarIcon");
    const profileLevelText = $("profileLevelText");
    const profileXPText = $("profileXPText");
    const profileReadinessText = $("profileReadinessText");
    const profileStreakText = $("profileStreakText");

    if (profileStudentName) profileStudentName.textContent = studentName;
    if (profileCollegeName) profileCollegeName.textContent = collegeName;
    if (profileActiveTitle) profileActiveTitle.textContent = (activeTitle.icon || "") + " " + activeTitle.name;
    if (profileOutfitBadge) profileOutfitBadge.textContent = activeOutfit.name;

    if (profileAvatarIcon && activeOutfit.icon) {
        profileAvatarIcon.textContent = activeOutfit.icon;
    }

    if (profileAvatarBox) {
        profileAvatarBox.className = "profile-avatar-box " + (activeOutfit.cssClass || "outfit-standard");
    }

    if (profileAvatarFrame) {
        profileAvatarFrame.className = "profile-avatar-frame " + (activeFrame.cssClass || "frame-standard");
    }

    const lvl = calculateLevel(state.totalXP);
    if (profileLevelText) profileLevelText.textContent = String(lvl.level || 1).padStart(2, "0");
    if (profileXPText) profileXPText.textContent = (state.totalXP || 0).toLocaleString();
    if (profileReadinessText) profileReadinessText.textContent = (state.readiness || 0) + "%";
    if (profileStreakText) profileStreakText.textContent = (state.dailyStreak || 1) + " Day" + ((state.dailyStreak || 1) > 1 ? "s" : "");

    // Update Header Profile Mini
    const headerProfileName = $("headerProfileName");
    const headerProfileLevel = $("headerProfileLevel");
    const headerMiniAvatar = $("headerMiniAvatar");
    if (headerProfileName) headerProfileName.textContent = studentName.toUpperCase();
    if (headerProfileLevel) headerProfileLevel.textContent = "LVL " + String(lvl.level || 1).padStart(2, "0");
    if (headerMiniAvatar && activeOutfit.icon) headerMiniAvatar.textContent = activeOutfit.icon;

    // Update Sidebar Profile Card (Command Center)
    const userProfileName = $("userProfileName");
    const userProfileRank = $("userProfileRank");
    const sidebarAvatar = $("sidebarAvatarIcon") || $("sidebarAvatar") || document.querySelector(".trainee-card .avatar");
    if (userProfileName) userProfileName.textContent = studentName.toUpperCase();
    if (userProfileRank) userProfileRank.textContent = `LEVEL ${String(lvl.level || 1).padStart(2, "0")} · ${(activeTitle.name || "STUDENT").toUpperCase()}`;
    if (sidebarAvatar && activeOutfit.icon) sidebarAvatar.textContent = activeOutfit.icon;

    // Update strip metrics
    const stripMissionsCount = $("stripMissionsCount");
    const stripLearnCount = $("stripLearnCount");
    const stripPrepCount = $("stripPrepCount");
    const stripUnlocksCount = $("stripUnlocksCount");

    if (stripMissionsCount) stripMissionsCount.textContent = (state.completedMissionIds?.size || 0) + " / 4";
    if (stripLearnCount) stripLearnCount.textContent = (state.completedLearnIds?.size || 0) + " / 6";
    if (stripPrepCount) stripPrepCount.textContent = (state.completedPrepItemIds?.size || 0) + " / 40";
    if (stripUnlocksCount) stripUnlocksCount.textContent = (state.unlockedCapabilities?.size || 0) + " / 13";
}

/* =========================================================
   2. MISSION -> REAL ACTION -> REFLECTION LOOP
   ========================================================= */

function openPreparednessAction(actionId) {
    if (typeof showPage === "function" && typeof dashboardPage !== "undefined") {
        showPage(dashboardPage);
    }
    switchSection("preparedness");
    setTimeout(() => {
        const el = $("prepCard_" + actionId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("highlight-pulse");
            setTimeout(() => el.classList.remove("highlight-pulse"), 2500);
        }
    }, 150);
}

function openPreparednessFromDebrief() {
    const hazardKey = state.lastResult?.missionName || "fire";
    const map = {
        fire: "fire_exit_check",
        flood: "flood_route_check",
        cyclone: "cyclone_room_check",
        earthquake: "quake_safe_spot"
    };
    openPreparednessAction(map[hazardKey] || "fire_exit_check");
}

const MISSION_REFLECTIONS = {
    fire: [
        "Check door handles for heat before opening any evacuation door.",
        "Stay low under the thermal smoke layer immediately.",
        "Proceed directly to designated assembly area without returning for items."
    ],
    flood: [
        "Move to designated higher ground before flood water exceeds ankle height.",
        "Disconnect electrical appliances before water reaches floor level.",
        "Never attempt to walk or drive through flooded roads or underpasses."
    ],
    cyclone: [
        "Secure all windows and stay in the interior safe room throughout the storm.",
        "Prepare 72-hour battery power, clean water, and emergency go-bag early.",
        "Wait for official campus/NDMA all-clear before inspecting external damage."
    ],
    earthquake: [
        "Drop, Cover, and Hold On immediately under sturdy furniture.",
        "Protect head and neck with arms away from exterior glass windows.",
        "Use stairs instead of elevators after tremors subside."
    ]
};

function renderMissionReflectionOptions(hazardKey) {
    const grid = $("reflectionOptionsGrid");
    const notice = $("reflectionRecordedNotice");
    if (!grid) return;
    if (notice) notice.classList.add("hidden");

    const options = MISSION_REFLECTIONS[hazardKey] || MISSION_REFLECTIONS.fire;
    grid.innerHTML = options.map((opt, idx) => 
        '<button type="button" class="reflection-option-btn" onclick="recordMissionReflection(' + idx + ')">' +
            '<span>' + (idx + 1) + '.</span> ' + opt +
        '</button>'
    ).join("");
}

function recordMissionReflection(choiceIndex) {
    const hazardKey = state.lastResult?.missionName || "fire";
    const options = MISSION_REFLECTIONS[hazardKey] || MISSION_REFLECTIONS.fire;
    const selectedText = options[choiceIndex] || options[0];

    if (state.lastResult) {
        state.lastResult.reflection = selectedText;
    }

    // Save reflection to latest performance log if available
    if (state.performanceHistory && state.performanceHistory.length > 0) {
        state.performanceHistory[0].reflection = selectedText;
    }

    saveProgress();

    const buttons = document.querySelectorAll(".reflection-option-btn");
    buttons.forEach((btn, idx) => {
        if (idx === choiceIndex) {
            btn.classList.add("selected");
            btn.innerHTML = '<span>✔</span> ' + options[idx];
        } else {
            btn.disabled = true;
            btn.style.opacity = "0.5";
        }
    });

    const notice = $("reflectionRecordedNotice");
    if (notice) {
        notice.classList.remove("hidden");
    }
    showToast("✔ Reflection recorded in your drill debrief.");
}

/* =========================================================
   3. MY READINESS REPORT
   ========================================================= */

function renderReadinessReport() {
    const reportLearnProgress = $("reportLearnProgress");
    const reportSimProgress = $("reportSimProgress");
    const reportPrepProgress = $("reportPrepProgress");
    const reportEvidenceProgress = $("reportEvidenceProgress");
    const readinessReportScorePill = $("readinessReportScorePill");

    const learnCount = state.completedLearnIds?.size || 0;
    const simCount = state.completedMissionIds?.size || 0;
    const prepCount = state.completedPrepItemIds?.size || 0;

    // Count genuine evidence-supported items from Phase 2A state
    let evidenceCount = 0;
    if (state.completedPrepItemIds) {
        state.completedPrepItemIds.forEach(id => {
            const itemState = state.prepChecklistState?.[id];
            if (itemState) {
                if (itemState.status === "verified" || itemState.note || itemState.location || itemState.contact) {
                    evidenceCount++;
                }
            }
        });
    }

    if (reportLearnProgress) reportLearnProgress.textContent = learnCount + " / 6 Modules";
    if (reportSimProgress) reportSimProgress.textContent = simCount + " / 4 Missions";
    if (reportPrepProgress) reportPrepProgress.textContent = prepCount + " / 40 Actions";
    if (reportEvidenceProgress) reportEvidenceProgress.textContent = evidenceCount + " Verified Actions";
    if (readinessReportScorePill) readinessReportScorePill.textContent = "Readiness Score: " + (state.readiness || 0) + "%";

    // Strengths & Needs
    const reportStrengthsTitle = $("reportStrengthsTitle");
    const reportStrengthsDesc = $("reportStrengthsDesc");
    const reportNeedsTitle = $("reportNeedsTitle");
    const reportNeedsDesc = $("reportNeedsDesc");

    if (simCount > 0) {
        let bestHazard = "fire";
        let bestScore = -1;
        Object.entries(state.missionBestScores || {}).forEach(([m, s]) => {
            if (s > bestScore) {
                bestScore = s;
                bestHazard = m;
            }
        });
        const mTitle = missions[bestHazard]?.title || "Emergency Drills";
        if (reportStrengthsTitle) reportStrengthsTitle.textContent = mTitle + " Scenario Performance (" + bestScore + "%)";
        if (reportStrengthsDesc) reportStrengthsDesc.textContent = "Demonstrated scenario-based decision practice during " + mTitle + ".";
    } else if (learnCount > 0) {
        if (reportStrengthsTitle) reportStrengthsTitle.textContent = "Disaster Theory Foundation";
        if (reportStrengthsDesc) reportStrengthsDesc.textContent = "Completed " + learnCount + " Learn Hub modules. Ready to test understanding in active simulations.";
    } else {
        if (reportStrengthsTitle) reportStrengthsTitle.textContent = "Beginning Student Responder";
        if (reportStrengthsDesc) reportStrengthsDesc.textContent = "Keep training across disaster scenarios to discover your strongest response areas.";
    }

    if (prepCount < 10) {
        if (reportNeedsTitle) reportNeedsTitle.textContent = "Hostel & Living Space Safety Plan";
        if (reportNeedsDesc) reportNeedsDesc.textContent = "Configure campus emergency contacts and 72-hour Go-Bag items in your Preparedness Plan.";
    } else if (simCount < 4) {
        if (reportNeedsTitle) reportNeedsTitle.textContent = "Multi-Hazard Drill Breadth";
        if (reportNeedsDesc) reportNeedsDesc.textContent = "Completed " + simCount + " of 4 disaster scenarios. Clear remaining scenarios to unlock advanced responder tools.";
    } else if (evidenceCount < prepCount) {
        if (reportNeedsTitle) reportNeedsTitle.textContent = "Field Action Verification";
        if (reportNeedsDesc) reportNeedsDesc.textContent = "Add verified room locations and equipment notes to strengthen self-recorded items.";
    } else {
        if (reportNeedsTitle) reportNeedsTitle.textContent = "Continuous Reflex Maintenance";
        if (reportNeedsDesc) reportNeedsDesc.textContent = "Replay scenarios in Precision Mode to keep emergency procedures sharp and response time optimal.";
    }

    const nextStep = typeof getDynamicNextStep === "function" ? getDynamicNextStep(state) : { title: "Practise Building Fire Drill", description: "Practice your decision-making under simulated structural emergency conditions.", ctaText: "START DRILL" };
    const reportNextStepTitle = $("reportNextStepTitle");
    const reportNextStepDesc = $("reportNextStepDesc");
    const reportNextStepBtn = $("reportNextStepBtn");

    if (reportNextStepTitle) reportNextStepTitle.textContent = nextStep.title;
    if (reportNextStepDesc) reportNextStepDesc.textContent = nextStep.description;
    if (reportNextStepBtn) reportNextStepBtn.textContent = nextStep.ctaText + " →";
}

/* =========================================================
   3B. READYVERSE READINESS PASSPORT (PHASE 5A)
   ========================================================= */

function printReadinessPassport() {
    if (typeof window !== "undefined" && typeof window.print === "function") {
        window.print();
    }
}

function renderPersonalActivityLedger() {
    const ledgerContainer = $("passportActivityLedger");
    const countPill = $("passportTimelineCount");

    const events = [];

    // 1. Digital Missions (DRILL-OBSERVED)
    if (Array.isArray(state.performanceHistory) && state.performanceHistory.length > 0) {
        state.performanceHistory.forEach(h => {
            const mTitle = (typeof missions !== "undefined" && missions[h.missionId]) ? missions[h.missionId].title : (h.missionName || "Digital Simulation");
            const scoreText = (h.score !== undefined) ? `${h.score}%` : "Completed";
            const gradeText = h.grade ? `Grade ${h.grade}` : "Drill Recorded";
            events.push({
                type: "simulation",
                icon: "🎮",
                badge: "DRILL-OBSERVED",
                badgeClass: "badge-drill-observed",
                title: `${mTitle} Drill`,
                detail: `Score: ${scoreText} · ${gradeText} · Multi-decision response scenario executed.`,
                date: h.timestamp || h.date || state.lastActivityDate || "Verified Session"
            });
        });
    } else if (state.completedMissionIds && state.completedMissionIds.size > 0) {
        state.completedMissionIds.forEach(mId => {
            const mTitle = (typeof missions !== "undefined" && missions[mId]) ? missions[mId].title : mId;
            const score = state.missionBestScores?.[mId] || 100;
            const grade = state.missionBestGrades?.[mId] || "A";
            events.push({
                type: "simulation",
                icon: "🎮",
                badge: "DRILL-OBSERVED",
                badgeClass: "badge-drill-observed",
                title: `${mTitle} Drill`,
                detail: `Score: ${score}% · Grade ${grade} · Multi-decision response scenario executed.`,
                date: state.lastActivityDate || "Verified Session"
            });
        });
    }

    // 2. Learning Modules (EVIDENCE-SUPPORTED via theory quiz)
    if (state.completedLearnIds && state.completedLearnIds.size > 0) {
        state.completedLearnIds.forEach(modId => {
            const mod = (typeof learnModules !== "undefined" && learnModules[modId]) ? learnModules[modId] : null;
            const score = state.learnQuizScores?.[modId];
            events.push({
                type: "learn",
                icon: "📚",
                badge: "EVIDENCE-SUPPORTED",
                badgeClass: "badge-evidence-supported",
                title: mod?.title || `${modId.toUpperCase()} Hazard Module`,
                detail: score ? `Theory Quiz Score: ${score}% · Protocol theory completed.` : "Hazard protocol theory and procedures completed.",
                date: state.lastActivityDate || "Verified Session"
            });
        });
    }

    // 3. Preparedness Actions (EVIDENCE-SUPPORTED vs SELF-RECORDED)
    if (state.completedPrepItemIds && state.completedPrepItemIds.size > 0) {
        state.completedPrepItemIds.forEach(itemId => {
            const itemData = (typeof prepChecklistData !== "undefined") ? prepChecklistData.find(i => i.id === itemId) : null;
            const itemState = state.prepChecklistState?.[itemId];
            const isEvidence = itemState && (itemState.status === "verified" || itemState.location || itemState.contact || itemState.phone || itemState.floor || (itemState.note && itemState.note.length >= 5));
            
            let detailText = "Personal safety check self-recorded.";
            if (itemState?.location) detailText = `Location: ${itemState.location}${itemState.floor ? ' (' + itemState.floor + ')' : ''}`;
            else if (itemState?.contact || itemState?.phone) detailText = `Emergency Contact: ${itemState.contact || itemState.phone}`;
            else if (itemState?.note) detailText = itemState.note;
            else if (itemData?.desc) detailText = itemData.desc;

            events.push({
                type: "preparedness",
                icon: itemData?.icon || "📋",
                badge: isEvidence ? "EVIDENCE-SUPPORTED" : "SELF-RECORDED",
                badgeClass: isEvidence ? "badge-evidence-supported" : "badge-self-recorded",
                title: itemData?.title || itemId,
                detail: detailText,
                date: itemState?.timestamp || state.lastActivityDate || "Verified Session"
            });
        });
    }

    // 4. Unlocked Achievements / Capabilities (SELF-RECORDED)
    if (state.unlockedAchievements && state.unlockedAchievements.size > 0) {
        state.unlockedAchievements.forEach(achId => {
            const achTitle = (typeof ACHIEVEMENTS_DATA !== "undefined" && ACHIEVEMENTS_DATA[achId]) ? ACHIEVEMENTS_DATA[achId].title : achId;
            events.push({
                type: "achievement",
                icon: "🎖️",
                badge: "SELF-RECORDED",
                badgeClass: "badge-self-recorded",
                title: `Honor: ${achTitle}`,
                detail: "Personal disaster-preparedness milestone unlocked.",
                date: state.lastActivityDate || "Verified Session"
            });
        });
    }

    // 5. Campus Participation & AARs (FACILITATOR-VERIFIED & DRILL-OBSERVED)
    if (state.campusStudio?.tabletopAnswers && state.campusStudio.tabletopAnswers.length > 0) {
        events.push({
            type: "tabletop",
            icon: "🏛️",
            badge: "DRILL-OBSERVED",
            badgeClass: "badge-drill-observed",
            title: `Campus Tabletop Drill: ${(state.campusStudio.selectedScenarioId || 'Campus Flood').replace('_', ' ').toUpperCase()}`,
            detail: `Completed multi-step campus evacuation tabletop exercise.`,
            date: state.lastActivityDate || "Verified Session"
        });
    }

    if (state.campusStudio?.aarRecords && state.campusStudio.aarRecords.length > 0) {
        state.campusStudio.aarRecords.forEach(aar => {
            events.push({
                type: "aar",
                icon: "🏛️",
                badge: "FACILITATOR-VERIFIED",
                badgeClass: "badge-facilitator-verified",
                title: `Facilitator AAR: ${aar.scenario || 'Campus Drill'}`,
                detail: `Observation: ${aar.observation || 'Drill evaluated'} (Corrective Action: ${aar.correctiveAction || 'None assigned'})`,
                date: aar.date || state.lastActivityDate || "Verified Session"
            });
        });
    }

    if (countPill) {
        countPill.textContent = `${events.length} ${events.length === 1 ? 'Event' : 'Events'} Logged`;
    }

    if (ledgerContainer) {
        if (events.length === 0) {
            ledgerContainer.innerHTML = `
                <div class="passport-empty-ledger">
                    <span class="empty-icon">🌱</span>
                    <p>No drills played yet! Complete your first 60-second crisis drill or prep item to see your safety record grow.</p>
                </div>
            `;
        } else {
            const displayEvents = events.slice(-25).reverse();
            ledgerContainer.innerHTML = displayEvents.map(evt => `
                <div class="passport-timeline-item">
                    <div class="timeline-icon-col">
                        <span class="timeline-icon">${evt.icon}</span>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-header-row">
                            <h5 class="timeline-title">${escapeHtml(evt.title)}</h5>
                            <span class="passport-badge ${evt.badgeClass}">${evt.badge}</span>
                        </div>
                        <p class="timeline-desc">${escapeHtml(evt.detail)}</p>
                        <span class="timeline-time">${escapeHtml(String(evt.date))}</span>
                    </div>
                </div>
            `).join("");
        }
    }
}

function renderReadinessPassport() {
    const passportSection = $("readinessPassportSection");
    if (!passportSection) return;

    if (!state.responderProfile) {
        state.responderProfile = {
            name: state.prepProfile?.name || "Student",
            titleId: "trainee",
            outfitId: "responder_standard",
            frameId: "standard_frame"
        };
    }

    const activeTitle = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && RESPONDER_CUSTOMIZATIONS.titles) 
        ? (RESPONDER_CUSTOMIZATIONS.titles.find(t => t.id === state.responderProfile.titleId) || RESPONDER_CUSTOMIZATIONS.titles[0])
        : { name: "Student", icon: "🛡️" };

    const activeOutfit = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && RESPONDER_CUSTOMIZATIONS.outfits)
        ? (RESPONDER_CUSTOMIZATIONS.outfits.find(o => o.id === state.responderProfile.outfitId) || RESPONDER_CUSTOMIZATIONS.outfits[0])
        : { name: "Standard Cadet Vest", icon: "🧑‍🚒", cssClass: "outfit-standard" };

    const activeFrame = (typeof RESPONDER_CUSTOMIZATIONS !== "undefined" && RESPONDER_CUSTOMIZATIONS.frames)
        ? (RESPONDER_CUSTOMIZATIONS.frames.find(f => f.id === state.responderProfile.frameId) || RESPONDER_CUSTOMIZATIONS.frames[0])
        : { name: "Standard Border", cssClass: "frame-standard" };

    const studentName = state.prepProfile?.name || state.responderProfile.name || "Student";
    const collegeName = state.prepProfile?.college || "Campus Community";
    const lvl = calculateLevel(state.totalXP || 0);
    const totalXP = state.totalXP || 0;
    const readiness = calculateReadiness();
    const streak = state.dailyStreak || 1;

    // DOM Identity elements
    const passportStudentName = $("passportStudentName");
    const passportActiveTitle = $("passportActiveTitle");
    const passportIdCode = $("passportIdCode");
    const passportLevelText = $("passportLevelText");
    const passportXPText = $("passportXPText");
    const passportCollegeText = $("passportCollegeText");
    const passportStreakText = $("passportStreakText");
    const passportAvatarBadge = $("passportAvatarBadge");
    const passportAvatarIcon = $("passportAvatarIcon");
    const passportReadinessPill = $("passportReadinessPill");

    if (passportStudentName) passportStudentName.textContent = studentName;
    if (passportActiveTitle) passportActiveTitle.textContent = (activeTitle.icon || "") + " " + activeTitle.name;
    if (passportIdCode) {
        passportIdCode.textContent = "READYVERSE PROFILE";
    }
    if (passportLevelText) passportLevelText.textContent = `Level ${String(lvl.level || 1).padStart(2, "0")}`;
    if (passportXPText) passportXPText.textContent = `${totalXP.toLocaleString()} XP`;
    if (passportCollegeText) passportCollegeText.textContent = collegeName;
    if (passportStreakText) passportStreakText.textContent = `${streak} ${streak === 1 ? "Day" : "Days"}`;
    if (passportReadinessPill) passportReadinessPill.textContent = `Readiness: ${readiness}%`;

    if (passportAvatarIcon && activeOutfit.icon) {
        passportAvatarIcon.textContent = activeOutfit.icon;
    }
    if (passportAvatarBadge) {
        passportAvatarBadge.className = `passport-avatar-badge ${activeOutfit.cssClass || "outfit-standard"} ${activeFrame.cssClass || "frame-standard"}`;
    }

    // Metrics & 5 Dimensions
    const learnCount = state.completedLearnIds?.size || 0;
    const simCount = state.completedMissionIds?.size || 0;
    const prepCount = state.completedPrepItemIds?.size || 0;
    const capCount = state.unlockedCapabilities?.size || 0;
    const achieveCount = state.unlockedAchievements?.size || 0;

    let evidenceCount = 0;
    if (state.completedPrepItemIds) {
        state.completedPrepItemIds.forEach(id => {
            const itemState = state.prepChecklistState?.[id];
            if (itemState && (itemState.status === "verified" || itemState.location || itemState.contact || itemState.phone || itemState.floor || (itemState.note && itemState.note.length >= 5))) {
                evidenceCount++;
            }
        });
    }
    const selfCount = Math.max(0, prepCount - evidenceCount);

    const tabletopCount = (state.campusStudio?.tabletopAnswers && state.campusStudio.tabletopAnswers.length > 0) ? 1 : 0;
    const aarCount = state.campusStudio?.aarRecords ? state.campusStudio.aarRecords.length : 0;

    // Dimension 1: Learning Foundation
    const passportLearnStat = $("passportLearnStat");
    const passportLearnBadge = $("passportLearnBadge");
    const passportLearnDetails = $("passportLearnDetails");
    if (passportLearnStat) passportLearnStat.textContent = `${learnCount} / 6`;
    if (passportLearnBadge) {
        if (learnCount === 6) {
            passportLearnBadge.textContent = "STATUS: MASTERED";
            passportLearnBadge.className = "dim-status-badge badge-mastered";
        } else if (learnCount > 0) {
            passportLearnBadge.textContent = "STATUS: IN PROGRESS";
            passportLearnBadge.className = "dim-status-badge badge-in-progress";
        } else {
            passportLearnBadge.textContent = "STATUS: NOT STARTED";
            passportLearnBadge.className = "dim-status-badge badge-not-started";
        }
    }
    if (passportLearnDetails) {
        passportLearnDetails.innerHTML = `<p>${learnCount} of 6 disaster theory modules completed with quiz assessments.</p>`;
    }

    // Dimension 2: Digital Simulations
    const passportSimStat = $("passportSimStat");
    const passportSimBadge = $("passportSimBadge");
    const passportSimDetails = $("passportSimDetails");
    if (passportSimStat) passportSimStat.textContent = `${simCount} / 4`;
    if (passportSimBadge) {
        if (simCount === 4) {
            passportSimBadge.textContent = "STATUS: ALL COMPLETED";
            passportSimBadge.className = "dim-status-badge badge-mastered";
        } else if (simCount > 0) {
            passportSimBadge.textContent = "STATUS: IN PROGRESS";
            passportSimBadge.className = "dim-status-badge badge-in-progress";
        } else {
            passportSimBadge.textContent = "STATUS: NOT STARTED";
            passportSimBadge.className = "dim-status-badge badge-not-started";
        }
    }
    if (passportSimDetails) {
        passportSimDetails.innerHTML = `<p>${simCount} of 4 digital crisis simulations completed with decision practice.</p>`;
    }

    // Dimension 3: Preparedness & Evidence
    const passportPrepStat = $("passportPrepStat");
    const passportEvidenceCount = $("passportEvidenceCount");
    const passportSelfRecordedCount = $("passportSelfRecordedCount");
    const passportPrepBadge = $("passportPrepBadge");
    if (passportPrepStat) passportPrepStat.textContent = `${prepCount} / 40`;
    if (passportEvidenceCount) passportEvidenceCount.textContent = `${evidenceCount} Evidence-Supported`;
    if (passportSelfRecordedCount) passportSelfRecordedCount.textContent = `${selfCount} Self-Recorded`;
    if (passportPrepBadge) {
        if (prepCount === 40) {
            passportPrepBadge.textContent = "STATUS: FULL RECORD";
            passportPrepBadge.className = "dim-status-badge badge-mastered";
        } else if (prepCount > 0) {
            passportPrepBadge.textContent = "STATUS: IN PROGRESS";
            passportPrepBadge.className = "dim-status-badge badge-in-progress";
        } else {
            passportPrepBadge.textContent = "STATUS: NOT RECORDED YET";
            passportPrepBadge.className = "dim-status-badge badge-not-started";
        }
    }

    // Dimension 4: Capabilities & Honors
    const passportCapStat = $("passportCapStat");
    const passportAchievementsCount = $("passportAchievementsCount");
    const passportCapBadge = $("passportCapBadge");
    if (passportCapStat) passportCapStat.textContent = `${capCount} / 13`;
    if (passportAchievementsCount) passportAchievementsCount.textContent = `${achieveCount} / 13 Honors Unlocked`;
    if (passportCapBadge) {
        if (capCount === 13) {
            passportCapBadge.textContent = "STATUS: FULL CAPABILITY";
            passportCapBadge.className = "dim-status-badge badge-mastered";
        } else if (capCount > 0) {
            passportCapBadge.textContent = "STATUS: ACTIVE";
            passportCapBadge.className = "dim-status-badge badge-in-progress";
        } else {
            passportCapBadge.textContent = "STATUS: LOCKED";
            passportCapBadge.className = "dim-status-badge badge-not-started";
        }
    }

    // Dimension 5: Campus Participation & AAR
    const passportCampusStat = $("passportCampusStat");
    const passportCampusSummary = $("passportCampusSummary");
    const passportCampusBadge = $("passportCampusBadge");
    if (passportCampusStat) passportCampusStat.textContent = `${tabletopCount} Drills / ${aarCount} Reviews`;
    if (passportCampusSummary) {
        if (tabletopCount > 0 || aarCount > 0) {
            passportCampusSummary.textContent = `Completed ${tabletopCount} campus tabletop drill(s) and recorded ${aarCount} facilitator review observation(s).`;
        } else {
            passportCampusSummary.textContent = "No campus tabletop drills or facilitator drill reviews recorded yet. Open Campus Mode to participate.";
        }
    }
    if (passportCampusBadge) {
        if (aarCount > 0) {
            passportCampusBadge.textContent = "STATUS: FACILITATOR-VERIFIED";
            passportCampusBadge.className = "dim-status-badge badge-mastered";
        } else if (tabletopCount > 0) {
            passportCampusBadge.textContent = "STATUS: DRILL-OBSERVED";
            passportCampusBadge.className = "dim-status-badge badge-in-progress";
        } else {
            passportCampusBadge.textContent = "STATUS: NOT DRILL-TESTED";
            passportCampusBadge.className = "dim-status-badge badge-not-started";
        }
    }

    // 3. Current Strengths & Deterministic Next Step
    const passportStrengthsTitle = $("passportStrengthsTitle");
    const passportStrengthsDesc = $("passportStrengthsDesc");
    const passportNextStepTitle = $("passportNextStepTitle");
    const passportNextStepDesc = $("passportNextStepDesc");
    const passportNextStepBtn = $("passportNextStepBtn");

    if (simCount > 0) {
        let bestHazard = "fire";
        let bestScore = -1;
        Object.entries(state.missionBestScores || {}).forEach(([m, s]) => {
            if (s > bestScore) {
                bestScore = s;
                bestHazard = m;
            }
        });
        const mTitle = (typeof missions !== "undefined" && missions[bestHazard]) ? missions[bestHazard].title : "Emergency Drills";
        if (passportStrengthsTitle) passportStrengthsTitle.textContent = `${mTitle} Scenario Performance (${bestScore}%)`;
        if (passportStrengthsDesc) passportStrengthsDesc.textContent = `Demonstrated scenario-based decision practice during ${mTitle}.`;
    } else if (learnCount > 0) {
        if (passportStrengthsTitle) passportStrengthsTitle.textContent = "Disaster Theory Foundation";
        if (passportStrengthsDesc) passportStrengthsDesc.textContent = `Completed ${learnCount} of 6 Learn Hub modules. Ready to test understanding in active simulations.`;
    } else {
        if (passportStrengthsTitle) passportStrengthsTitle.textContent = "Beginning Student Responder";
        if (passportStrengthsDesc) passportStrengthsDesc.textContent = "Begin your training with hazard theory in Learn Hub or practice your first drill.";
    }

    if (learnCount < 6) {
        if (passportNextStepTitle) passportNextStepTitle.textContent = `Continue Learn Hub (${6 - learnCount} Remaining)`;
        if (passportNextStepDesc) passportNextStepDesc.textContent = "Master remaining disaster protocol modules to build your theoretical emergency foundation.";
        if (passportNextStepBtn) {
            passportNextStepBtn.textContent = "OPEN LEARN HUB →";
            passportNextStepBtn.setAttribute("onclick", "switchSection('learn')");
        }
    } else if (simCount < 4) {
        if (passportNextStepTitle) passportNextStepTitle.textContent = `Clear Disaster Drills (${4 - simCount} Remaining)`;
        if (passportNextStepDesc) passportNextStepDesc.textContent = "Complete remaining digital drills to practice crisis decision-making under emergency conditions.";
        if (passportNextStepBtn) {
            passportNextStepBtn.textContent = "OPEN DRILLS →";
            passportNextStepBtn.setAttribute("onclick", "switchSection('missions')");
        }
    } else if (prepCount < 40) {
        if (passportNextStepTitle) passportNextStepTitle.textContent = `Complete Preparedness Actions (${40 - prepCount} Remaining)`;
        if (passportNextStepDesc) passportNextStepDesc.textContent = "Verify dormitory and campus safety checklists to build physical field readiness.";
        if (passportNextStepBtn) {
            passportNextStepBtn.textContent = "OPEN PREPAREDNESS →";
            passportNextStepBtn.setAttribute("onclick", "switchSection('preparedness')");
        }
    } else {
        if (passportNextStepTitle) passportNextStepTitle.textContent = "Participate in Campus Exercises";
        if (passportNextStepDesc) passportNextStepDesc.textContent = "Conduct campus tabletop drills and review campus drill reviews in Campus Mode.";
        if (passportNextStepBtn) {
            passportNextStepBtn.textContent = "OPEN CAMPUS STUDIO →";
            passportNextStepBtn.setAttribute("onclick", "switchSection('campus')");
        }
    }

    // 4. Render Activity Ledger
    renderPersonalActivityLedger();
}

/* =========================================================
   4. CAMPUS PREPAREDNESS STUDIO & TABLETOP ENGINE (PHASE 5B)
   ========================================================= */

const CAMPUS_TABLETOP_SCENARIOS = {
    campus_flood: {
        id: "campus_flood",
        title: "Monsoon Inundation in Academic Block A",
        hazard: "flood",
        icon: "🌊",
        situation: "Continuous torrential rainfall for 4 hours has caused campus perimeter drainage to back up. Water is entering the ground floor Computer Science lab corridor and rising at 2 inches per hour.",
        steps: [
            {
                stepNum: 1,
                prompt: "Ground floor water depth has reached ankle level (3 inches). Power cables run along floor trunking in Lab 102. What is the immediate life-safety action?",
                choices: [
                    { text: "Order immediate emergency electrical mains isolation for Ground Floor Block A and initiate calm vertical evacuation to Level 2.", score: 100, correct: true, explanation: "Preventing electrocution and moving occupants vertically above rising water is the highest life-safety priority." },
                    { text: "Instruct students to continue lab work on desks and wait for facilities crew with sandbags.", score: 20, correct: false, explanation: "Severe electrocution and entrapment hazard. Never remain in flooded rooms with live power." },
                    { text: "Have students run through the flooded hallway to retrieve umbrellas from the parking shed.", score: 10, correct: false, explanation: "Moving flood water hides open manholes, submerged debris, and carries live electrical current." }
                ]
            },
            {
                stepNum: 2,
                prompt: "Students and faculty have reached the 2nd-floor terrace corridor. Heavy rain continues and the ground floor exit is now submerged. How do you coordinate campus assembly and headcount?",
                choices: [
                    { text: "Establish floor marshal headcount against lab registers, broadcast status to Campus Security Desk, and await designated higher-ground evacuation.", score: 100, correct: true, explanation: "Accurate headcount and centralized campus coordination prevents missing persons and panic." },
                    { text: "Encourage individual students to wade through the current to reach their hostel rooms.", score: 10, correct: false, explanation: "Wading through flood water is the leading cause of campus flash-flood casualties." },
                    { text: "Turn on emergency generator in the flooded basement to power the building elevators.", score: 0, correct: false, explanation: "Operating machinery in flooded basements creates catastrophic shock and fire risk." }
                ]
            }
        ],
        resolution: "Tabletop exercise successfully completed. All occupants vertically evacuated and verified at Level 2 refuge zone with zero simulated casualties."
    },
    campus_fire: {
        id: "campus_fire",
        title: "Chemistry Lab Electrical Fire (Floor 3)",
        hazard: "fire",
        icon: "🔥",
        situation: "During an afternoon practical examination, an overloaded circuit behind a fume hood catches fire, releasing thick acrid chemical smoke into the 3rd floor science corridor.",
        steps: [
            {
                stepNum: 1,
                prompt: "Smoke is rapidly filling the corridor. The fire alarm sounds. A student suggests taking the elevator to exit quickly. What is the command decision?",
                choices: [
                    { text: "Direct all students immediately to the East fire stairwell, staying low beneath the smoke layer, and prohibit all elevator use.", score: 100, correct: true, explanation: "Elevators can malfunction or open directly onto burning floors. Stairwells provide protected egress." },
                    { text: "Allow elevator evacuation for half the class while others take stairs to speed up egress.", score: 10, correct: false, explanation: "Elevator shafts act as chimneys during fires, creating fatal smoke entrapment." },
                    { text: "Return to the lab to shut down individual Bunsen burners and pack laptops.", score: 20, correct: false, explanation: "Evacuation must be immediate. Never delay for belongings or secondary equipment." }
                ]
            },
            {
                stepNum: 2,
                prompt: "At the ground floor exit, one student notices a classmate went back for their medication. What is the protocol?",
                choices: [
                    { text: "Prevent anyone from re-entering, proceed to Main Sports Ground assembly area, and immediately report the missing student and last known location to Campus Security/Fire Responders.", score: 100, correct: true, explanation: "Re-entry causes secondary fatalities. Professional responders with breathing gear must conduct search and rescue." },
                    { text: "Send two student volunteers back into the building to find the classmate.", score: 10, correct: false, explanation: "Untrained civilians must never re-enter burning structures." },
                    { text: "Disband the group and tell students to return to their hostels.", score: 0, correct: false, explanation: "Disbanding prevents accurate headcount verification." }
                ]
            }
        ],
        resolution: "Tabletop exercise completed. Rapid stairwell egress and disciplined headcount protocol executed successfully."
    },
    campus_cyclone: {
        id: "campus_cyclone",
        title: "Severe Cyclone Wind & Window Breach (Hostel Block C)",
        hazard: "cyclone",
        icon: "🌀",
        situation: "Category 3 cyclone winds exceeding 120 km/h strike the campus. High-pressure gusts shatter large exterior glass panels in Hostel Block C common room.",
        steps: [
            {
                stepNum: 1,
                prompt: "Flying glass shards and high-velocity wind enter the common lounge. 25 hostel residents are present. What is the immediate safety order?",
                choices: [
                    { text: "Direct everyone immediately to the interior reinforced hallway away from all windows, close interior fire doors, and assume protective crouching posture.", score: 100, correct: true, explanation: "Interior hallways provide structural protection against high-speed flying glass and debris." },
                    { text: "Instruct students to hold mattress shields against the shattered window frame to block rain.", score: 10, correct: false, explanation: "High wind pressure can blow mattresses and individuals across the room, causing catastrophic injuries." },
                    { text: "Tell students to run across open courtyard to the dining hall.", score: 0, correct: false, explanation: "Exposing occupants to open grounds during cyclone winds risks fatal blunt-force trauma from flying sheet metal and roof tiles." }
                ]
            },
            {
                stepNum: 2,
                prompt: "The main electrical line outside sparks violently and drops onto the hostel security gate. How should movement be controlled?",
                choices: [
                    { text: "Issue immediate 'Shelter-in-Place' order, prohibit exit through the metal gate, and broadcast warning to Campus Emergency Team via battery radio/phone.", score: 100, correct: true, explanation: "Downed power lines energize fences and gates. Staying sheltered indoors prevents fatal electrocution." },
                    { text: "Use wooden broomsticks to lift the live power wire off the gate.", score: 15, correct: false, explanation: "High-voltage transmission lines can arc through damp wood and conduct fatal current." },
                    { text: "Allow students to step over the wire if they are wearing rubber slippers.", score: 0, correct: false, explanation: "Step potential in wet soil conducts fatal current regardless of footwear." }
                ]
            }
        ],
        resolution: "Tabletop exercise resolved. Interior hallway shelter and electrical isolation protocols protected all 25 residents from debris and power line hazards."
    },
    campus_earthquake: {
        id: "campus_earthquake",
        title: "Seismic Tremor During Lecture (Main Auditorium)",
        hazard: "earthquake",
        icon: "🌋",
        situation: "A sudden 6.2-magnitude seismic tremor violently shakes the university campus during an afternoon guest lecture with 150 students inside the Main Auditorium.",
        steps: [
            {
                stepNum: 1,
                prompt: "Overhead stage lighting fixtures swing violently and acoustic ceiling tiles begin falling. What is the immediate life-safety response?",
                choices: [
                    { text: "Command immediate 'DROP, COVER, AND HOLD ON' under auditorium seats or along load-bearing interior rows, protecting head and neck.", score: 100, correct: true, explanation: "Dropping low and protecting the cervical spine minimizes injury from falling ceiling debris and fixtures." },
                    { text: "Initiate a panic rush toward the single double-door exit immediately while shaking continues.", score: 0, correct: false, explanation: "Rushing exits during active shaking leads to stampedes, crush asphyxiation, and falling masonry injuries." },
                    { text: "Stand upright on stage to address the crowd and give vocal announcements.", score: 10, correct: false, explanation: "Standing during strong ground motion causes violent falls and exposes the individual to falling lighting rigs." }
                ]
            },
            {
                stepNum: 2,
                prompt: "Ground shaking subsides after 40 seconds. Dust fills the auditorium and the fire alarm starts blaring. How should the post-shake evacuation proceed?",
                choices: [
                    { text: "Conduct row-by-row orderly egress through unblocked ground-level exits, proceed to Main Sports Ground assembly area, and check for injuries.", score: 100, correct: true, explanation: "Calm, staggered evacuation avoids exit bottlenecks and aftershock hazards near exterior walls." },
                    { text: "Instruct students to remain inside the darkened hall until building engineers arrive.", score: 20, correct: false, explanation: "Secondary gas leaks or structural weakness from aftershocks require prompt evacuation once shaking stops." },
                    { text: "Send students up to the balcony to retrieve audio-visual recording gear.", score: 0, correct: false, explanation: "Balconies are structurally vulnerable to aftershock collapse; never delay evacuation for equipment." }
                ]
            }
        ],
        resolution: "Tabletop exercise resolved. Disciplined Drop/Cover/Hold execution followed by orderly row-by-row evacuation ensured 100% safe transit to the primary assembly area."
    }
};

const FACILITATOR_CHECKLIST_TEMPLATE = [
    {
        stage: 1,
        title: "STAGE 1 — BEFORE EXERCISE (Preparation & Briefing)",
        items: [
            { id: "stage1_scenario", label: "Confirm scenario parameters, hazard focus, and room building coordinates." },
            { id: "stage1_roles", label: "Verify participant attendance and assign student floor marshals." },
            { id: "stage1_assembly", label: "Inspect primary campus assembly area for clear access and safety." },
            { id: "stage1_comms", label: "Check designated emergency communication channels and whistle/alarm devices." },
            { id: "stage1_objectives", label: "Brief exercise objectives, life-safety priorities, and non-emergency rules." }
        ]
    },
    {
        stage: 2,
        title: "STAGE 2 — DURING EXERCISE (Observation & Protocol Compliance)",
        items: [
            { id: "stage2_alarm", label: "Observe immediate recognition of emergency alarm and cessation of activities." },
            { id: "stage2_egress", label: "Monitor orderly stairwell/corridor egress without running or pushing." },
            { id: "stage2_rules", label: "Enforce strict zero elevator usage and low-smoke crawling posture." },
            { id: "stage2_bottlenecks", label: "Record bottleneck locations, blocked exits, or procedural confusion." }
        ]
    },
    {
        stage: 3,
        title: "STAGE 3 — AFTER EXERCISE (Debrief, AAR & Improvement)",
        items: [
            { id: "stage3_debrief", label: "Conduct immediate headcount verification and participant debrief." },
            { id: "stage3_observations", label: "Complete facilitator behavioral observation matrix entries." },
            { id: "stage3_aar", label: "Document institutional After-Action Review (AAR) strengths and obstacles." },
            { id: "stage3_corrective", label: "Assign corrective action owners, tasks, and target review dates." }
        ]
    }
];

const FACILITATOR_OBSERVATION_METRICS = [
    { id: "obs_instructions", name: "Followed Announced Instructions", desc: "Participants adhered promptly to evacuation instructions." },
    { id: "obs_route", name: "Safe Route & Assembly Navigation", desc: "Used designated stairwells and moved cleanly to assembly area." },
    { id: "obs_action", name: "Appropriate Protective Posture", desc: "Executed Drop/Cover/Hold or stayed low under simulated smoke." },
    { id: "obs_hazard", name: "Prompt Hazard Recognition", desc: "Recognized hazard warnings and electrical/gas hazards promptly." },
    { id: "obs_comms", name: "Coordination & Communication", desc: "Floor marshals coordinated headcount and communicated effectively." },
    { id: "obs_steps", name: "Protocol Step Completion", desc: "Completed all expected life-safety procedures without skipping." },
    { id: "obs_risks", name: "Avoidance of Critical Risks", desc: "Avoided elevators, re-entry attempts, and dangerous belongings retrieval." },
    { id: "obs_headcount", name: "Orderly Headcount & Assembly", desc: "Maintained calm assembly formation and reported missing persons accurately." }
];

function setCampusStudioRole(role) {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "student", campusProfile: {}, aarRecords: [] };
    }
    state.campusStudio.activeRole = role;
    saveProgress();

    const roleBtnStudent = $("roleBtnStudent");
    const roleBtnFacilitator = $("roleBtnFacilitator");
    if (roleBtnStudent) {
        if (role === "student") roleBtnStudent.classList.add("active");
        else roleBtnStudent.classList.remove("active");
    }
    if (roleBtnFacilitator) {
        if (role === "facilitator") roleBtnFacilitator.classList.add("active");
        else roleBtnFacilitator.classList.remove("active");
    }

    renderCampusStudio();
    showToast("Switched to " + (role === 'student' ? 'Student' : 'Safety Facilitator') + " mode");
}

function saveCampusProfile() {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "student", campusProfile: {}, aarRecords: [] };
    }

    const name = $("campusInputName")?.value?.trim() || "SNS Campus";
    const type = $("campusInputType")?.value?.trim() || "Engineering College & Hostel";
    const hazard = $("campusInputHazard")?.value || "flood";
    const assembly = $("campusInputAssembly")?.value?.trim() || "Main Sports Ground";
    const contact = $("campusInputContact")?.value?.trim() || "Not configured";

    state.campusStudio.campusProfile = {
        name: name,
        type: type,
        hazard: hazard,
        assemblyPoint: assembly,
        emergencyContact: contact
    };

    saveProgress();
    renderCampusStudio();
    showToast("✔ Campus Emergency Configuration saved!");
}

function setCampusExerciseLifecycle(status) {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "student", campusProfile: {}, aarRecords: [] };
    }
    state.campusStudio.exerciseLifecycle = status;
    saveProgress();
    renderCampusExercisePlan();
    renderCampusAggregateView();
    showToast("Exercise status updated to " + status.toUpperCase());
}

function renderCampusExercisePlan() {
    const card = $("campusExercisePlanCard");
    const hazardBadge = $("campusPlanHazardBadge");
    if (!card) return;

    const profile = state.campusStudio?.campusProfile || {};
    const campusName = profile.name || "SNS Campus";
    const campusType = profile.type || "Engineering College & Hostel Block";
    const hazard = profile.hazard || "flood";
    const assembly = profile.assemblyPoint || "Main Sports Ground";
    const contact = profile.emergencyContact || "Not configured";
    const lifecycle = state.campusStudio?.exerciseLifecycle || "draft";

    const hazardTitles = {
        flood: "Monsoon Flash Flood & Lab Inundation Drill",
        fire: "Academic Building Structural Fire Evacuation",
        cyclone: "Severe Cyclone Wind & Glass Breach Shelter-in-Place",
        earthquake: "Auditorium Seismic Tremor & Mass Egress Exercise"
    };

    const hazardObjectives = {
        flood: "Test rapid vertical evacuation, ground-floor electrical mains isolation, and floor marshal headcount protocols.",
        fire: "Evaluate unannounced stairwell egress, low-smoke crawl compliance, zero elevator usage, and assembly reporting.",
        cyclone: "Validate interior hallway sheltering, glass fracture blast protection, and perimeter electrical isolation.",
        earthquake: "Practice immediate Drop/Cover/Hold response during active shaking followed by structured row-by-row egress."
    };

    const activeTitle = hazardTitles[hazard] || "Campus Multi-Hazard Emergency Exercise";
    const activeObjective = hazardObjectives[hazard] || "Validate life-safety procedures and campus coordination.";

    if (hazardBadge) {
        hazardBadge.textContent = "Hazard: " + hazard.charAt(0).toUpperCase() + hazard.slice(1);
    }

    const lifecycleBadges = {
        draft: '<span class="plan-status-badge badge-draft">PLAN STATUS: DRAFT</span>',
        ready: '<span class="plan-status-badge badge-ready">PLAN STATUS: READY FOR EXECUTION</span>',
        active: '<span class="plan-status-badge badge-active">PLAN STATUS: ACTIVE EXERCISE</span>',
        review: '<span class="plan-status-badge badge-review">PLAN STATUS: IN POST-EXERCISE REVIEW</span>',
        completed: '<span class="plan-status-badge badge-completed">PLAN STATUS: COMPLETED & ARCHIVED</span>'
    };

    card.innerHTML = '<div class="plan-header-row">' +
            '<div>' +
                '<span class="perf-sub-label">' + campusName.toUpperCase() + ' · ' + campusType.toUpperCase() + '</span>' +
                '<h4 style="font-size: 15px; font-weight: 800; color: var(--text); margin: 4px 0;">' + activeTitle + '</h4>' +
            '</div>' +
            (lifecycleBadges[lifecycle] || lifecycleBadges.draft) +
        '</div>' +
        '<div class="plan-meta-grid">' +
            '<div class="plan-meta-item">' +
                '<span class="meta-label">🎯 EXERCISE OBJECTIVE</span>' +
                '<p>' + activeObjective + '</p>' +
            '</div>' +
            '<div class="plan-meta-item">' +
                '<span class="meta-label">👥 PARTICIPANT ROLES</span>' +
                '<p>Students, Floor Marshals, Safety Facilitators, Facilities Responders.</p>' +
            '</div>' +
            '<div class="plan-meta-item">' +
                '<span class="meta-label">📍 PRIMARY ASSEMBLY AREA</span>' +
                '<p><strong>' + assembly + '</strong> (Secondary: North Lawn Pergola)</p>' +
            '</div>' +
            '<div class="plan-meta-item">' +
                '<span class="meta-label">📞 EMERGENCY CONTACT</span>' +
                '<p><strong>' + contact + '</strong> ' + (contact === "Not configured" ? "<small style='color:var(--orange)'>(Pending campus verification)</small>" : "") + '</p>' +
            '</div>' +
        '</div>' +
        '<div class="plan-actions-row">' +
            '<button type="button" class="primary-small-button" onclick="startCampusTabletop(\'campus_' + hazard + '\')">' +
                '🎮 LAUNCH TABLETOP SCENARIO →' +
            '</button>' +
            '<div class="plan-lifecycle-btns">' +
                '<button type="button" class="secondary-button" onclick="setCampusExerciseLifecycle(\'ready\')" style="font-size: 9px;">SET READY</button>' +
                '<button type="button" class="secondary-button" onclick="setCampusExerciseLifecycle(\'review\')" style="font-size: 9px;">SET REVIEW</button>' +
                '<button type="button" class="secondary-button" onclick="setCampusExerciseLifecycle(\'completed\')" style="font-size: 9px;">MARK COMPLETED</button>' +
            '</div>' +
        '</div>';
}

function startCampusTabletop(scenarioId) {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "student", campusProfile: {}, aarRecords: [] };
    }
    state.campusStudio.selectedScenarioId = scenarioId;
    state.campusStudio.tabletopStep = 0;
    state.campusStudio.tabletopAnswers = [];
    state.campusStudio.exerciseLifecycle = "active";
    renderCampusTabletop();
    renderCampusExercisePlan();
}

function selectCampusTabletopOption(optIdx) {
    if (!state.campusStudio) return;
    const scenario = CAMPUS_TABLETOP_SCENARIOS[state.campusStudio.selectedScenarioId || "campus_flood"] || CAMPUS_TABLETOP_SCENARIOS.campus_flood;
    const currentStep = scenario.steps[state.campusStudio.tabletopStep || 0];
    if (!currentStep) return;

    const choice = currentStep.choices[optIdx];
    state.campusStudio.tabletopAnswers = state.campusStudio.tabletopAnswers || [];
    state.campusStudio.tabletopAnswers.push(choice);

    state.campusStudio.tabletopStep = (state.campusStudio.tabletopStep || 0) + 1;

    // Check if tabletop reached completion
    if (state.campusStudio.tabletopStep >= scenario.steps.length) {
        state.campusStudio.completedExercisesCount = (state.campusStudio.completedExercisesCount || 0) + 1;
        state.campusStudio.exerciseLifecycle = "review";
        // NOTE: Tabletop completion records campus participation. It does NOT increment personal DRILL-OBSERVED evidence.
    }

    saveProgress();
    renderCampusTabletop();
    renderCampusExercisePlan();
    renderCampusAggregateView();
}

function resetCampusTabletop() {
    if (!state.campusStudio) return;
    state.campusStudio.tabletopStep = 0;
    state.campusStudio.tabletopAnswers = [];
    saveProgress();
    renderCampusTabletop();
}

function renderCampusTabletop() {
    const container = $("campusTabletopCard");
    if (!container) return;

    const scenarioId = state.campusStudio?.selectedScenarioId || "campus_flood";
    const scenario = CAMPUS_TABLETOP_SCENARIOS[scenarioId] || CAMPUS_TABLETOP_SCENARIOS.campus_flood;
    const stepIdx = state.campusStudio?.tabletopStep || 0;
    const campusName = state.campusStudio?.campusProfile?.name || "SNS Campus";

    if (stepIdx < scenario.steps.length) {
        const step = scenario.steps[stepIdx];
        container.innerHTML = '<div class="tabletop-header">' +
                '<span class="tabletop-scenario-badge">' + scenario.icon + ' ' + scenario.title + '</span>' +
                '<span class="tabletop-step-badge">STEP ' + (stepIdx + 1) + ' OF ' + scenario.steps.length + '</span>' +
            '</div>' +
            '<div class="tabletop-situation-box">' +
                '<strong>CAMPUS SITUATION BRIEFING (' + campusName + ')</strong>' +
                '<p>' + scenario.situation + '</p>' +
            '</div>' +
            '<div class="tabletop-prompt-box">' +
                '<h4>' + step.prompt + '</h4>' +
                '<div class="tabletop-choices-grid">' +
                    step.choices.map((c, idx) => 
                        '<button type="button" class="tabletop-choice-btn" onclick="selectCampusTabletopOption(' + idx + ')">' +
                            '<span class="choice-tag">OPTION ' + String.fromCharCode(65 + idx) + '</span>' +
                            '<span class="choice-text">' + c.text + '</span>' +
                        '</button>'
                    ).join("") +
                '</div>' +
            '</div>';
    } else {
        // Tabletop Resolution & Debrief
        const answers = state.campusStudio?.tabletopAnswers || [];
        const totalScore = answers.reduce((sum, a) => sum + (a.score || 0), 0) / (answers.length || 1);
        const allScenarioKeys = Object.keys(CAMPUS_TABLETOP_SCENARIOS);
        const nextScenarioKey = allScenarioKeys[(allScenarioKeys.indexOf(scenarioId) + 1) % allScenarioKeys.length];

        container.innerHTML = '<div class="tabletop-header">' +
                '<span class="tabletop-scenario-badge">✔ ' + scenario.title + ' — RESOLVED</span>' +
                '<span class="tabletop-step-badge">EXERCISE PERFORMANCE: ' + Math.round(totalScore) + '%</span>' +
            '</div>' +
            '<div class="tabletop-situation-box" style="border-left-color: var(--green);">' +
                '<strong>TABLETOP DRILL OUTCOME</strong>' +
                '<p>' + scenario.resolution + '</p>' +
            '</div>' +
            '<div class="tabletop-debrief-list">' +
                answers.map((a, i) => 
                    '<div class="tabletop-debrief-item">' +
                        '<strong>Decision ' + (i + 1) + ': ' + (a.correct ? '✔ Correct Life-Safety Action' : '⚠ Sub-optimal Choice') + '</strong>' +
                        '<p>' + a.explanation + '</p>' +
                    '</div>'
                ).join("") +
            '</div>' +
            '<div style="margin-top: 18px; display: flex; gap: 10px; flex-wrap: wrap;">' +
                '<button type="button" class="primary-small-button" onclick="resetCampusTabletop()">' +
                    '🔄 REPLAY TABLETOP DRILL' +
                '</button>' +
                '<button type="button" class="secondary-button" onclick="startCampusTabletop(\'' + nextScenarioKey + '\')" style="font-size: 9px; font-weight: 800;">' +
                    'NEXT CAMPUS SCENARIO →' +
                '</button>' +
            '</div>';
    }
}

function renderCampusExerciseChecklist() {
    const container = $("campusExerciseChecklistCard");
    const progressPill = $("campusChecklistProgressPill");
    if (!container) return;

    state.campusStudio = state.campusStudio || { activeRole: "student", campusProfile: {}, aarRecords: [] };
    const checklistState = state.campusStudio.checklistState || {};

    let totalItems = 0;
    let verifiedCount = 0;

    FACILITATOR_CHECKLIST_TEMPLATE.forEach(stage => {
        stage.items.forEach(item => {
            totalItems++;
            if (checklistState[item.id]) verifiedCount++;
        });
    });

    if (progressPill) {
        progressPill.textContent = verifiedCount + " / " + totalItems + " Verified";
    }

    container.innerHTML = FACILITATOR_CHECKLIST_TEMPLATE.map(stage => 
        '<div class="campus-stage-card">' +
            '<div class="stage-card-header">' +
                '<span class="stage-tag">STAGE 0' + stage.stage + '</span>' +
                '<h4>' + stage.title + '</h4>' +
            '</div>' +
            '<div class="checklist-items-list">' +
                stage.items.map(item => {
                    const isChecked = !!checklistState[item.id];
                    return '<div class="checklist-item-row ' + (isChecked ? 'item-verified' : '') + '" onclick="toggleCampusChecklistItem(\'' + item.id + '\')" role="button" tabindex="0">' +
                            '<span class="checklist-item-check">' + (isChecked ? '✔' : '○') + '</span>' +
                            '<span class="checklist-item-label">' + item.label + '</span>' +
                            '<span class="checklist-item-badge">' + (isChecked ? 'VERIFIED' : 'PENDING') + '</span>' +
                        '</div>';
                }).join("") +
            '</div>' +
        '</div>'
    ).join("");
}

function toggleCampusChecklistItem(itemId) {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "student", campusProfile: {}, aarRecords: [] };
    }
    state.campusStudio.checklistState = state.campusStudio.checklistState || {};
    state.campusStudio.checklistState[itemId] = !state.campusStudio.checklistState[itemId];

    saveProgress();
    renderCampusExerciseChecklist();
}

function renderCampusObservations() {
    const container = $("campusObservationCard");
    const countPill = $("campusObservationCountPill");
    if (!container) return;

    state.campusStudio = state.campusStudio || { activeRole: "student", campusProfile: {}, aarRecords: [] };
    const observations = state.campusStudio.observations || {};

    let recordedCount = 0;
    FACILITATOR_OBSERVATION_METRICS.forEach(m => {
        if (observations[m.id] && observations[m.id].status) {
            recordedCount++;
        }
    });

    if (countPill) {
        countPill.textContent = recordedCount + " / " + FACILITATOR_OBSERVATION_METRICS.length + " Recorded";
    }

    const statuses = [
        { id: "OBSERVED", label: "OBSERVED", cls: "obs-observed" },
        { id: "PARTIALLY_OBSERVED", label: "PARTIAL", cls: "obs-partial" },
        { id: "NOT_OBSERVED", label: "NOT OBSERVED", cls: "obs-not" },
        { id: "NOT_APPLICABLE", label: "N/A", cls: "obs-na" }
    ];

    container.innerHTML = '<div class="observation-grid">' +
        FACILITATOR_OBSERVATION_METRICS.map(m => {
            const current = observations[m.id] || {};
            const currentStatus = current.status || "";
            return '<div class="observation-metric-row">' +
                    '<div class="observation-metric-info">' +
                        '<strong>' + m.name + '</strong>' +
                        '<p>' + m.desc + '</p>' +
                    '</div>' +
                    '<div class="observation-status-group">' +
                        statuses.map(s => 
                            '<button type="button" class="obs-btn ' + s.cls + ' ' + (currentStatus === s.id ? 'active' : '') + '" onclick="setCampusObservationStatus(\'' + m.id + '\', \'' + s.id + '\')">' +
                                s.label +
                            '</button>'
                        ).join("") +
                    '</div>' +
                '</div>';
        }).join("") +
    '</div>';
}

function setCampusObservationStatus(metricId, status) {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "facilitator", campusProfile: {}, aarRecords: [] };
    }
    state.campusStudio.observations = state.campusStudio.observations || {};
    state.campusStudio.observations[metricId] = {
        status: status,
        timestamp: new Date().toISOString()
    };

    saveProgress();
    renderCampusObservations();
    renderCampusAggregateView();
}

function saveCampusObservationNote(metricId, note) {
    if (!state.campusStudio) return;
    state.campusStudio.observations = state.campusStudio.observations || {};
    state.campusStudio.observations[metricId] = state.campusStudio.observations[metricId] || {};
    state.campusStudio.observations[metricId].note = note;
    saveProgress();
}

function submitFacilitatorAAR() {
    if (!state.campusStudio) {
        state.campusStudio = { activeRole: "facilitator", campusProfile: {}, aarRecords: [] };
    }

    const expected = $("aarExpected")?.value?.trim();
    const happened = $("aarHappened")?.value?.trim();
    const wentWell = $("aarWentWell")?.value?.trim();
    const difficult = $("aarDifficult")?.value?.trim();
    const improvement = $("aarImprovement")?.value?.trim();
    const nextPracticed = $("aarNextPracticed")?.value?.trim();
    const action = $("aarAction")?.value?.trim();
    const owner = $("aarOwner")?.value?.trim();
    const reviewDate = $("aarReviewDate")?.value;

    if (!wentWell || !improvement || !action) {
        showToast("⚠ Please fill in the required drill strengths, improvement needs, and corrective action.");
        return;
    }

    const record = {
        id: "aar_" + Date.now(),
        date: typeof getLocalDateString === "function" ? getLocalDateString() : new Date().toISOString().split("T")[0],
        expected: expected || "Standard campus emergency protocol execution",
        happened: happened || "Full building egress conducted",
        wentWell: wentWell,
        difficult: difficult || "None reported",
        improvement: improvement,
        nextPracticed: nextPracticed || "Routine multi-hazard response drill",
        action: action,
        owner: owner || "Campus Safety Committee",
        reviewDate: reviewDate || "Not scheduled",
        status: "Open"
    };

    state.campusStudio.aarRecords = state.campusStudio.aarRecords || [];
    state.campusStudio.aarRecords.unshift(record);
    state.campusStudio.exerciseLifecycle = "completed";

    saveProgress();

    // Clear form fields
    if ($("aarExpected")) $("aarExpected").value = "";
    if ($("aarHappened")) $("aarHappened").value = "";
    if ($("aarWentWell")) $("aarWentWell").value = "";
    if ($("aarDifficult")) $("aarDifficult").value = "";
    if ($("aarImprovement")) $("aarImprovement").value = "";
    if ($("aarNextPracticed")) $("aarNextPracticed").value = "";
    if ($("aarAction")) $("aarAction").value = "";
    if ($("aarOwner")) $("aarOwner").value = "";
    if ($("aarReviewDate")) $("aarReviewDate").value = "";

    renderCampusStudio();
    showToast("✔ Drill Review logged successfully!");
}

function updateCorrectiveActionStatus(aarId, newStatus) {
    if (!state.campusStudio?.aarRecords) return;
    const record = state.campusStudio.aarRecords.find(r => r.id === aarId);
    if (record) {
        record.status = newStatus;
        saveProgress();
        renderCampusImprovementTracker();
        renderCampusAARHistory();
        renderCampusAggregateView();
        showToast("Action status updated to " + newStatus);
    }
}

function renderCampusImprovementTracker() {
    const container = $("campusTrackerList");
    const openPill = $("campusOpenActionsPill");
    if (!container) return;

    const records = state.campusStudio?.aarRecords || [];
    const openRecords = records.filter(r => r.status === "Open" || r.status === "In Progress" || !r.status);

    if (openPill) {
        openPill.textContent = openRecords.length + " Open Action" + (openRecords.length === 1 ? '' : 's');
    }

    if (records.length === 0) {
        container.innerHTML = '<div class="empty-history" style="padding: 18px;">' +
                '<p style="margin: 0; font-size: 11px; color: var(--muted);">No corrective action plans logged yet. Completed Drill Reviews will populate improvement tasks here.</p>' +
            '</div>';
        return;
    }

    container.innerHTML = '<div class="tracker-items-grid">' +
        records.map(r => {
            const status = r.status || "Open";
            return '<div class="corrective-action-card status-' + status.toLowerCase().replace(/\s+/g, '-') + '">' +
                    '<div class="corrective-header">' +
                        '<div>' +
                            '<span class="perf-sub-label">TASK ASSIGNED: ' + r.date + '</span>' +
                            '<h4>' + r.action + '</h4>' +
                        '</div>' +
                        '<div class="status-action-group">' +
                            '<select class="action-status-select" onchange="updateCorrectiveActionStatus(\'' + r.id + '\', this.value)" aria-label="Update Action Status">' +
                                '<option value="Open" ' + (status === "Open" ? "selected" : "") + '>OPEN</option>' +
                                '<option value="In Progress" ' + (status === "In Progress" ? "selected" : "") + '>IN PROGRESS</option>' +
                                '<option value="Completed" ' + (status === "Completed" ? "selected" : "") + '>COMPLETED</option>' +
                                '<option value="Deferred" ' + (status === "Deferred" ? "selected" : "") + '>DEFERRED</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<p class="corrective-context"><strong>Context / Need:</strong> ' + r.improvement + '</p>' +
                    '<div class="corrective-footer">' +
                        '<span>👤 Owner: <strong>' + r.owner + '</strong></span>' +
                        '<span>📅 Review Date: <strong>' + r.reviewDate + '</strong></span>' +
                    '</div>' +
                '</div>';
        }).join("") +
    '</div>';
}

function renderCampusAARHistory() {
    const container = $("campusAARHistory");
    const countPill = $("aarCountPill");
    if (!container) return;

    const records = state.campusStudio?.aarRecords || [];
    if (countPill) countPill.textContent = records.length + " Review" + (records.length === 1 ? "" : "s") + " Logged";

    if (records.length === 0) {
        container.innerHTML = '<div class="empty-history" style="padding: 20px;">' +
                '<div class="empty-icon">📝</div>' +
                '<p>No Drill Reviews recorded yet. Safety facilitators can log drill observations and corrective plans above.</p>' +
            '</div>';
        return;
    }

    container.innerHTML = records.map(r => {
        const status = r.status || "Open";
        const statusColors = {
            "Open": "var(--orange)",
            "In Progress": "#a78bfa",
            "Completed": "var(--green)",
            "Deferred": "var(--muted)"
        };
        const color = statusColors[status] || "var(--orange)";
        return '<div class="aar-record-card">' +
                '<div class="aar-record-header">' +
                    '<div>' +
                        '<span class="perf-sub-label">RECORDED ON ' + r.date + '</span>' +
                        '<h4 style="font-size: 13px; margin: 2px 0; color: var(--text);">Corrective Plan: ' + r.action + '</h4>' +
                    '</div>' +
                    '<span class="perf-pill-badge" style="color: ' + color + '; border-color: ' + color + ';">' + status.toUpperCase() + '</span>' +
                '</div>' +
                '<div class="aar-record-body">' +
                    '<p><strong>What Was Expected:</strong> ' + (r.expected || "Standard campus emergency protocol execution") + '</p>' +
                    '<p><strong>What Happened:</strong> ' + (r.happened || "Full building egress conducted") + '</p>' +
                    '<p><strong>Strengths:</strong> ' + r.wentWell + '</p>' +
                    '<p><strong>Needs Improvement:</strong> ' + r.improvement + '</p>' +
                    '<p><strong>Next Focus:</strong> ' + (r.nextPracticed || "Routine multi-hazard response drill") + '</p>' +
                    '<div class="aar-record-meta">' +
                        '<span>👤 Owner: <strong>' + r.owner + '</strong></span>' +
                        '<span>📅 Next Review: <strong>' + r.reviewDate + '</strong></span>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }).join("");
}

function renderCampusAggregateView() {
    const grid = $("campusAggregateGrid");
    if (!grid) return;

    const tabletopCount = state.campusStudio?.completedExercisesCount || (state.campusStudio?.tabletopResolved ? 1 : 0);
    const aarRecords = state.campusStudio?.aarRecords || [];
    const aarCount = aarRecords.length;
    const observations = state.campusStudio?.observations || {};
    const obsCount = Object.keys(observations).filter(k => observations[k] && observations[k].status).length;
    const openActionsCount = aarRecords.filter(r => r.status === "Open" || r.status === "In Progress" || !r.status).length;
    const completedActionsCount = aarRecords.filter(r => r.status === "Completed").length;

    let nextReviewDate = "Not scheduled";
    for (const r of aarRecords) {
        if (r.reviewDate && r.reviewDate !== "Not scheduled" && (r.status === "Open" || r.status === "In Progress")) {
            nextReviewDate = r.reviewDate;
            break;
        }
    }

    const hasCampusActivity = (tabletopCount > 0 || aarCount > 0 || obsCount > 0 || openActionsCount > 0);

    let noticeHtml = '<div class="campus-demo-notice-bar" style="grid-column: 1 / -1; background: rgba(124, 58, 237, 0.08); border: 1px solid rgba(124, 58, 237, 0.25); border-radius: 8px; padding: 12px 16px; margin-bottom: 6px;">' +
        '<strong style="color: #c084fc; font-size: 11px; display: block; margin-bottom: 2px;">📍 CAMPUS PREPAREDNESS STUDIO — INSTITUTIONAL RECORD</strong>' +
        '<p style="color: var(--muted); font-size: 11px; margin: 0;">Campus preparedness records, facilitator observations, and corrective action summaries for this campus unit (CAMPUS STUDIO DEMO — LOCAL DATA VIEW).</p>' +
    '</div>';

    if (!hasCampusActivity) {
        grid.innerHTML = noticeHtml + '<div class="empty-history" style="grid-column: 1 / -1; padding: 24px;">' +
            '<div class="empty-icon">📊</div>' +
            '<h4 style="color: var(--text); margin: 0 0 6px;">NOT ENOUGH CAMPUS DATA YET</h4>' +
            '<p style="color: var(--muted); font-size: 11px; margin: 0;">Complete campus tabletop scenarios, facilitator checklists, and after-action reviews to populate the campus readiness overview.</p>' +
        '</div>';
        return;
    }

    grid.innerHTML = noticeHtml + 
        '<div class="campus-stat-box">' +
            '<span class="card-label">TABLETOP EXERCISES</span>' +
            '<div class="big-number">' +
                '<span>' + tabletopCount + '</span>' +
                '<small>COMPLETED</small>' +
            '</div>' +
            '<div class="xp-bar"><div style="width: ' + Math.min(tabletopCount * 25, 100) + '%"></div></div>' +
            '<p class="perf-panel-text">Campus scenario runs conducted and debriefed.</p>' +
        '</div>' +
        '<div class="campus-stat-box">' +
            '<span class="card-label">AFTER-ACTION REVIEWS</span>' +
            '<div class="big-number">' +
                '<span>' + aarCount + '</span>' +
                '<small>LOGGED</small>' +
            '</div>' +
            '<div class="xp-bar"><div style="width: ' + Math.min(aarCount * 33, 100) + '%"></div></div>' +
            '<p class="perf-panel-text">Structured facilitator debriefs and evaluations.</p>' +
        '</div>' +
        '<div class="campus-stat-box">' +
            '<span class="card-label">BEHAVIORAL OBSERVATIONS</span>' +
            '<div class="big-number">' +
                '<span>' + obsCount + '</span>' +
                '<small>/ 8 METRICS</small>' +
            '</div>' +
            '<div class="xp-bar"><div style="width: ' + Math.round((obsCount / 8) * 100) + '%"></div></div>' +
            '<p class="perf-panel-text">Facilitator-recorded protocol compliance checks.</p>' +
        '</div>' +
        '<div class="campus-stat-box">' +
            '<span class="card-label">CORRECTIVE ACTIONS</span>' +
            '<div class="big-number">' +
                '<span>' + openActionsCount + '</span>' +
                '<small>OPEN (' + completedActionsCount + ' RESOLVED)</small>' +
            '</div>' +
            '<div class="xp-bar"><div style="width: ' + (aarCount ? Math.round((completedActionsCount / aarCount) * 100) : 0) + '%"></div></div>' +
            '<p class="perf-panel-text">Next Scheduled Review: <strong>' + nextReviewDate + '</strong></p>' +
        '</div>';
}

function renderCampusStudio() {
    const campusProfile = state.campusStudio?.campusProfile || {};
    const campusNameDisplay = $("campusNameDisplay");
    const campusTypeDisplay = $("campusTypeDisplay");
    const campusInputName = $("campusInputName");
    const campusInputType = $("campusInputType");
    const campusInputHazard = $("campusInputHazard");
    const campusInputAssembly = $("campusInputAssembly");
    const campusInputContact = $("campusInputContact");

    if (campusNameDisplay) campusNameDisplay.textContent = campusProfile.name || "SNS Campus";
    if (campusTypeDisplay) campusTypeDisplay.textContent = campusProfile.type || "Engineering College & Hostel Block";

    if (campusInputName && !campusInputName.matches(":focus")) campusInputName.value = campusProfile.name || "SNS Campus";
    if (campusInputType && !campusInputType.matches(":focus")) campusInputType.value = campusProfile.type || "Engineering College & Hostel";
    if (campusInputHazard && !campusInputHazard.matches(":focus")) campusInputHazard.value = campusProfile.hazard || "flood";
    if (campusInputAssembly && !campusInputAssembly.matches(":focus")) campusInputAssembly.value = campusProfile.assemblyPoint || "Main Sports Ground";
    if (campusInputContact && !campusInputContact.matches(":focus")) campusInputContact.value = campusProfile.emergencyContact || "Not configured";

    renderCampusExercisePlan();
    renderCampusExerciseChecklist();
    renderCampusObservations();
    renderCampusTabletop();
    renderCampusAARHistory();
    renderCampusImprovementTracker();
    renderCampusAggregateView();
}

/* =========================================================
   5. BACKEND-READY PROGRESS SYNC SERVICE
   ========================================================= */

const ReadyVerseSyncService = {
    exportProgressPayload() {
        if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.exportBackup === "function") {
            return ReadyVerseProgress.exportBackup(state);
        }
        return JSON.stringify({
            version: 2,
            exportedAt: new Date().toISOString(),
            source: "ReadyVerse Student Preparedness Platform",
            state: state
        }, null, 2);
    },

    downloadBackup() {
        try {
            const data = this.exportProgressPayload();
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const dateStr = typeof getLocalDateString === "function" ? getLocalDateString() : "backup";
            a.href = url;
            a.download = "readyverse_progress_backup_" + dateStr + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("✔ Progress backup downloaded successfully!");
        } catch(e) {
            console.error("Backup download error:", e);
            showToast("✖ Could not generate backup file.");
        }
    },

    handleFileImport(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.importBackup === "function") {
                    const res = ReadyVerseProgress.importBackup(e.target.result, state);
                    if (res.warning) {
                        alert(`Notice: ${res.warning}`);
                    }
                    updateAllUI();
                    closeSyncBackupModal();
                    showToast("✔ Progress successfully imported!");
                    return;
                }
                const parsed = JSON.parse(e.target.result);
                Object.assign(state, parsed.state || parsed);
                saveProgress();
                updateAllUI();
                closeSyncBackupModal();
                showToast("✔ Progress successfully imported!");
            } catch(err) {
                console.error("Import error:", err);
                showToast(`✖ ${err.message || "Error reading backup file."}`);
            }
        };
        reader.readAsText(file);
    },

    resetProgressConfirm() {
        const confirmed = confirm("Are you sure you want to reset your training progress? Your profile details and campus settings will be preserved, but all drills, quizzes, and completed preparedness checklist items will return to zero.");
        if (confirmed) {
            if (typeof ReadyVerseProgress !== "undefined" && typeof ReadyVerseProgress.resetProgress === "function") {
                ReadyVerseProgress.resetProgress(state);
            } else {
                state.totalXP = 0;
                state.completedMissions = 0;
                state.decisionsMade = 0;
                state.readiness = 0;
                state.dailyStreak = 0;
                state.longestStreak = 0;
                state.completedMissionIds = new Set();
                state.missionBestScores = {};
                state.completedLearnIds = new Set();
                state.learnQuizScores = {};
                state.completedPrepItemIds = new Set();
                state.prepChecklistState = {};
                saveProgress();
            }
            updateAllUI();
            closeSyncBackupModal();
            showToast("✔ Progress has been reset to defaults.");
        }
    },

    getBackendStatus() {
        return {
            status: "LOCAL_FIRST_ACTIVE",
            cloudReady: true,
            storageType: "localStorage",
            schemaVersion: "2.0.0",
            notice: "ReadyVerse local progress is active and formatted for future cloud sync."
        };
    }
};

function openSyncBackupModal() {
    const modal = $("syncBackupModal");
    if (!modal) return;
    modal.classList.remove("hidden");
}

function closeSyncBackupModal() {
    const modal = $("syncBackupModal");
    if (!modal) return;
    modal.classList.add("hidden");
}


if (typeof window !== "undefined") {
    window.state = state;
    window.switchSection = switchSection;
    window.switchProfileSubTab = switchProfileSubTab;
    window.saveProgress = saveProgress;
    window.loadProgress = loadProgress;
    window.renderResult = renderResult;
    window.missions = missions;
    window.learnModules = learnModules;
    window.CAPABILITIES_CATALOG = CAPABILITIES_CATALOG;
    window.prepChecklistData = prepChecklistData;
    window.calculateReadiness = calculateReadiness;
    window.calculateLevel = calculateLevel;
    window.getPreparednessStats = getPreparednessStats;
    window.getNextBestAction = getNextBestAction;
    window.getHomePrimaryDrillAction = getHomePrimaryDrillAction;
    window.executeHomePrimaryAction = executeHomePrimaryAction;
    window.getDynamicNextStep = getDynamicNextStep;
    window.executeDynamicNextStep = executeDynamicNextStep;
    window.updateDashboardJourney = updateDashboardJourney;
    window.startMissionFromLearn = startMissionFromLearn;
    window.openResultHazardLearn = openResultHazardLearn;
    window.openResultHazardPrep = openResultHazardPrep;
    window.retryCurrentSimulation = retryCurrentSimulation;
    window.returnToDashboardFromResults = returnToDashboardFromResults;

    // Phase 4 Exports
    window.RESPONDER_CUSTOMIZATIONS = RESPONDER_CUSTOMIZATIONS;
    window.openProfileCustomizer = openProfileCustomizer;
    window.closeProfileCustomizer = closeProfileCustomizer;
    window.switchCustomizerTab = switchCustomizerTab;
    window.equipCustomization = equipCustomization;
    window.renderResponderProfile = renderResponderProfile;
    window.openPreparednessAction = openPreparednessAction;
    window.openPreparednessFromDebrief = openPreparednessFromDebrief;
    window.recordMissionReflection = recordMissionReflection;
    window.renderReadinessReport = renderReadinessReport;
    window.CAMPUS_TABLETOP_SCENARIOS = CAMPUS_TABLETOP_SCENARIOS;
    window.setCampusStudioRole = setCampusStudioRole;
    window.saveCampusProfile = saveCampusProfile;
    window.startCampusTabletop = startCampusTabletop;
    window.selectCampusTabletopOption = selectCampusTabletopOption;
    window.resetCampusTabletop = resetCampusTabletop;
    window.submitFacilitatorAAR = submitFacilitatorAAR;
    window.renderCampusStudio = renderCampusStudio;
    window.renderCampusAggregateView = renderCampusAggregateView;
    window.ReadyVerseSyncService = ReadyVerseSyncService;
    window.openSyncBackupModal = openSyncBackupModal;
    window.closeSyncBackupModal = closeSyncBackupModal;
    window.updateAllUI = updateAllUI;
    window.updateDashboardStats = updateDashboardStats;
    window.updateProgressPage = updateProgressPage;
    window.savePreparednessProfile = savePreparednessProfile;
    window.validatePrepFieldValue = validatePrepFieldValue;
    window.savePrepRecord = savePrepRecord;
    window.confirmPrepAction = confirmPrepAction;
    window.togglePrepItem = togglePrepItem;
    window.renderPreparednessChecklist = renderPreparednessChecklist;
    window.renderPreparednessPage = renderPreparednessPage;
    window.updateAchievements = updateAchievements;

    // Phase 5A Exports
    window.renderReadinessPassport = renderReadinessPassport;
    window.renderPersonalActivityLedger = renderPersonalActivityLedger;
    window.printReadinessPassport = printReadinessPassport;
    window.applyTheme = applyTheme;
    window.setTheme = setTheme;

    // Phase 5C Exports
    window.SimulationAudio = SimulationAudio;
    window.toggleSimulationAudio = toggleSimulationAudio;
    window.FireSimulationEngine = FireSimulationEngine;
    window.FIRE_SIMULATION_SCENES = FIRE_SIMULATION_SCENES;
    window.renderTraineeAvatarSVG = renderTraineeAvatarSVG;

    // Phase 5B Exports
    window.setCampusExerciseLifecycle = setCampusExerciseLifecycle;
    window.renderCampusExercisePlan = renderCampusExercisePlan;
    window.renderCampusExerciseChecklist = renderCampusExerciseChecklist;
    window.toggleCampusChecklistItem = toggleCampusChecklistItem;
    window.renderCampusObservations = renderCampusObservations;
    window.setCampusObservationStatus = setCampusObservationStatus;
    window.saveCampusObservationNote = saveCampusObservationNote;
    window.updateCorrectiveActionStatus = updateCorrectiveActionStatus;
    window.renderCampusImprovementTracker = renderCampusImprovementTracker;
    window.renderCampusAARHistory = renderCampusAARHistory;

    // Daily Drill Exports
    window.getDailyDrillDecisions = getDailyDrillDecisions;
    window.getDailyDrillLessonTakeaway = getDailyDrillLessonTakeaway;
    window.startDailyDrill = startDailyDrill;
    window.handleDailyDrillChoice = handleDailyDrillChoice;
    window.nextDailyDrillDecision = nextDailyDrillDecision;
    window.finishDailyDrill = finishDailyDrill;
    window.closeDailyDrillModal = closeDailyDrillModal;
    window.getDailyDrillSession = () => dailyDrillSession;
    window.setDailyDrillSession = (s) => { dailyDrillSession = s; };

    // Prompt 4: Share Card & Challenge Exports
    window.getStudentFirstName = getStudentFirstName;
    window.getDrillShareData = getDrillShareData;
    window.drawRoundRect = drawRoundRect;
    window.generateDrillShareCard = generateDrillShareCard;
    window.shareScoreCard = shareScoreCard;
    window.challengeFriend = challengeFriend;
    window.downloadShareCard = downloadShareCard;
    window.copyChallengeLinkOnly = copyChallengeLinkOnly;
    window.copyTextToClipboard = copyTextToClipboard;
    window.checkIncomingChallenge = checkIncomingChallenge;
    window.renderChallengeBanners = renderChallengeBanners;
    window.acceptFriendChallenge = acceptFriendChallenge;

    // Prompt 5: Engagement Layer & Onboarding Exports
    window.isOnboardingCompleted = isOnboardingCompleted;
    window.showOnboardingModal = showOnboardingModal;
    window.closeOnboardingModal = closeOnboardingModal;
    window.goToOnboardingStep = goToOnboardingStep;
    window.nextOnboardingStep = nextOnboardingStep;
    window.selectTrainingGoal = selectTrainingGoal;
    window.completeOnboardingAndStartDrill = completeOnboardingAndStartDrill;
    window.triggerCelebration = triggerCelebration;
    window.launchCanvasConfetti = launchCanvasConfetti;

    // Prompt 6: Sources, Tamil and Speech Exports
    window.renderLearnGuidelines = renderLearnGuidelines;
    window.setDrillLanguage = setDrillLanguage;
    window.setDailyDrillLanguage = setDailyDrillLanguage;
    window.toggleCurrentScenarioSpeech = toggleCurrentScenarioSpeech;
    window.toggleDailyDrillSpeech = toggleDailyDrillSpeech;
    window.toggleLearnLessonSpeech = toggleLearnLessonSpeech;
    window.handleLearnSpeechLangChange = handleLearnSpeechLangChange;
    window.openLearnProtocol = openLearnProtocol;
    window.closeLearnProtocol = closeLearnProtocol;
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", checkIncomingChallenge);
    } else {
        checkIncomingChallenge();
    }
}


