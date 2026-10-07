/**
 * ReadyVerse — Progress & Progression Single Source of Truth
 * Version: 2.0.0
 * 
 * Centralized logic for XP, Leveling, Readiness Score, Streaks, 
 * Achievements, JSON Export/Import, and Persistence under "readyverse:v2".
 */

(function (root, factory) {
    const exports = factory();
    if (typeof define === 'function' && define.amd) {
        define([], () => exports);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = exports;
    } else {
        root.ReadyVerseProgress = exports;
    }
    if (typeof root !== 'undefined') {
        root.rvLog = exports.rvLog;
        root.isDebugEnabled = exports.isDebugEnabled;
    }
}(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function () {
    'use strict';

    function isDebugEnabled() {
        try {
            if (typeof window !== 'undefined') {
                if (window.RV_DEBUG === true) return true;
                if (typeof localStorage !== 'undefined' && localStorage.getItem('rv_debug') === '1') return true;
            } else if (typeof process !== 'undefined' && process.env) {
                if (process.env.RV_DEBUG === '1' || process.env.RV_DEBUG === 'true') return true;
            }
        } catch (_) {}
        return false;
    }

    function rvLog(...args) {
        if (isDebugEnabled() && typeof console !== 'undefined' && typeof console.log === 'function') {
            console.log(...args);
        }
    }

    const STORAGE_KEY_V2 = "readyverse:v2";
    const STORAGE_KEY_V1 = "readyverse_player_progress_v1";

    // XP Constants Table (matching screen UI values)
    const XP_REWARDS = {
        mission: {
            fire: 200,
            flood: 250,
            cyclone: 300,
            earthquake: 300
        },
        dailyDrill: 50,
        learnQuizPass: 100,
        planAction: 15
    };

    const XP_PER_LEVEL = 200;

    /**
     * Level Titles:
     * L1-2: Rookie
     * L3-4: Aware
     * L5-7: Prepared
     * L8-10: Responder
     * L11+: Guardian
     */
    function getLevelTitle(level) {
        const lvl = Math.max(1, Math.floor(level || 1));
        if (lvl <= 2) return "Rookie";
        if (lvl <= 4) return "Aware";
        if (lvl <= 7) return "Prepared";
        if (lvl <= 10) return "Responder";
        return "Guardian";
    }

    /**
     * Calculates level, progress percentage, xp into level, and xp to next level.
     * Level = floor(totalXP / 200) + 1
     */
    function calculateLevel(totalXP = 0) {
        const xp = Math.max(0, Math.floor(Number(totalXP) || 0));
        const level = Math.floor(xp / XP_PER_LEVEL) + 1;
        const xpIntoLevel = xp % XP_PER_LEVEL;
        const xpToNextLevel = XP_PER_LEVEL - xpIntoLevel;
        const progressPct = Math.min(100, Math.max(0, (xpIntoLevel / XP_PER_LEVEL) * 100));
        const title = getLevelTitle(level);

        return {
            level,
            title,
            totalXP: xp,
            xpPerLevel: XP_PER_LEVEL,
            xpIntoLevel,
            xpToNextLevel,
            progressPct,
            levelStartXP: (level - 1) * XP_PER_LEVEL,
            nextLevelXP: level * XP_PER_LEVEL
        };
    }

    /**
     * Calendar Date Helpers for timezone-aware local daily streak tracking
     */
    function getLocalDateString(d = new Date()) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getCalendarDayDiff(dateStr1, dateStr2) {
        if (!dateStr1 || !dateStr2) return null;
        const [y1, m1, d1] = dateStr1.split("-").map(Number);
        const [y2, m2, d2] = dateStr2.split("-").map(Number);
        const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
        const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.round((date2.getTime() - date1.getTime()) / msPerDay);
    }

    /**
     * Readiness score formula (0-100, rounded):
     * 0.40 * simulationScore + 0.30 * learningScore + 0.30 * planScore
     * 
     * - simulationScore: average of best accuracy % across 4 missions (fire, flood, cyclone, earthquake).
     *   Uncompleted missions count as 0% (NO 70% fallback).
     * - learningScore: (modules passed / 6) * 100
     * - planScore: (completed plan actions / 40) * 100
     */
    function calculateReadiness(stateData = {}) {
        const missionKeys = ["fire", "flood", "cyclone", "earthquake"];
        let missionSum = 0;

        missionKeys.forEach(k => {
            const hasCompleted = (stateData.completedMissionIds && typeof stateData.completedMissionIds.has === 'function')
                ? stateData.completedMissionIds.has(k)
                : (Array.isArray(stateData.completedMissionIds) && stateData.completedMissionIds.includes(k));

            if (hasCompleted) {
                const score = (stateData.missionBestScores && typeof stateData.missionBestScores[k] === 'number')
                    ? stateData.missionBestScores[k]
                    : 0;
                missionSum += Math.max(0, Math.min(100, score));
            } else {
                missionSum += 0; // uncompleted counts as 0%
            }
        });

        const simulationScore = missionSum / missionKeys.length; // 0 to 100

        // Learning Score: (completed modules / 6) * 100
        const learnCompletedCount = (stateData.completedLearnIds && typeof stateData.completedLearnIds.has === 'function')
            ? stateData.completedLearnIds.size
            : (Array.isArray(stateData.completedLearnIds) ? stateData.completedLearnIds.length : 0);
        const learningScore = Math.min(100, Math.max(0, (learnCompletedCount / 6) * 100));

        // Plan Score: (completed plan actions / 40) * 100
        const planCompletedCount = (stateData.completedPrepItemIds && typeof stateData.completedPrepItemIds.has === 'function')
            ? stateData.completedPrepItemIds.size
            : (Array.isArray(stateData.completedPrepItemIds) ? stateData.completedPrepItemIds.length : 0);
        const planScore = Math.min(100, Math.max(0, (planCompletedCount / 40) * 100));

        const simComponent = 0.40 * simulationScore;
        const learnComponent = 0.30 * learningScore;
        const planComponent = 0.30 * planScore;

        const totalReadiness = Math.max(0, Math.min(100, Math.round(simComponent + learnComponent + planComponent)));

        return {
            totalReadiness,
            simulationScore: Math.round(simulationScore),
            learningScore: Math.round(learningScore),
            planScore: Math.round(planScore),
            breakdown: {
                simulationScore: Math.round(simulationScore),
                learningScore: Math.round(learningScore),
                planScore: Math.round(planScore),
                simWeighted: +(simComponent.toFixed(1)),
                learnWeighted: +(learnComponent.toFixed(1)),
                planWeighted: +(planComponent.toFixed(1))
            }
        };
    }

    /**
     * Fresh default state for new users
     */
    function createDefaultState() {
        return {
            totalXP: 0,
            completedMissions: 0,
            decisionsMade: 0,
            readiness: 0,
            correctDecisions: 0,

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
    }

    /**
     * Streak Activity Recorder
     * Called whenever a mission drill, lesson quiz, or plan action is completed.
     */
    function recordActivity(targetState) {
        if (!targetState) return;
        const today = getLocalDateString();

        if (!targetState.lastActivityDate) {
            targetState.dailyStreak = 1;
            targetState.lastActivityDate = today;
        } else if (targetState.lastActivityDate === today) {
            if (!targetState.dailyStreak || targetState.dailyStreak < 1) {
                targetState.dailyStreak = 1;
            }
        } else {
            const dayDiff = getCalendarDayDiff(targetState.lastActivityDate, today);
            if (dayDiff === 1) {
                targetState.dailyStreak = (targetState.dailyStreak || 0) + 1;
                targetState.lastActivityDate = today;
            } else if (dayDiff > 1) {
                targetState.dailyStreak = 1;
                targetState.lastActivityDate = today;
            } else {
                targetState.lastActivityDate = today;
            }
        }

        if (!targetState.longestStreak || targetState.dailyStreak > targetState.longestStreak) {
            targetState.longestStreak = targetState.dailyStreak;
        }
    }

    /**
     * Storage Serialization & Deserialization with Migration
     */
    function serializeState(st) {
        return {
            version: 2,
            updatedAt: new Date().toISOString(),
            totalXP: Number(st.totalXP) || 0,
            completedMissions: Number(st.completedMissions) || 0,
            decisionsMade: Number(st.decisionsMade) || 0,
            readiness: Number(st.readiness) || 0,
            correctDecisions: Number(st.correctDecisions) || 0,
            completedMissionIds: Array.from(st.completedMissionIds || []),
            missionBestScores: st.missionBestScores || {},
            missionBestGrades: st.missionBestGrades || {},
            completedLearnIds: Array.from(st.completedLearnIds || []),
            learnQuizScores: st.learnQuizScores || {},
            prepProfile: st.prepProfile || {},
            prepChecklistState: st.prepChecklistState || {},
            completedPrepItemIds: Array.from(st.completedPrepItemIds || []),
            dailyStreak: Number(st.dailyStreak) || 0,
            longestStreak: Number(st.longestStreak) || 0,
            lastActivityDate: st.lastActivityDate || null,
            unlockedAchievements: Array.from(st.unlockedAchievements || []),
            rewardedAchievements: Array.from(st.rewardedAchievements || []),
            unlockedCapabilities: Array.from(st.unlockedCapabilities || []),
            performanceHistory: st.performanceHistory || [],
            lastResult: st.lastResult || null,
            responderProfile: st.responderProfile || {},
            campusStudio: st.campusStudio || {}
        };
    }

    function saveState(st) {
        if (typeof localStorage === 'undefined') return;
        try {
            const payload = serializeState(st);
            localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
        } catch (e) {
            console.warn('[ReadyVerseProgress] Could not save state to localStorage:', e);
        }
    }

    function loadState(targetState) {
        const dest = targetState || createDefaultState();
        if (typeof localStorage === 'undefined') return dest;

        try {
            const rawV2 = localStorage.getItem(STORAGE_KEY_V2);

            // Case A: v2 storage exists
            if (rawV2) {
                const parsed = JSON.parse(rawV2);
                applyParsedData(dest, parsed);
                return dest;
            }

            // Case B: v1 storage exists -> Migrate preserved fields, reset progress to defaults
            const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
            if (rawV1) {
                const parsedV1 = JSON.parse(rawV1);
                rvLog('[ReadyVerseProgress] Migrating from v1 storage key. Preserving profiles, resetting progress fields.');

                // Initialize defaults
                const defaults = createDefaultState();
                Object.assign(dest, defaults);

                // Preserve non-progress profiles if present in v1
                if (parsedV1.prepProfile && typeof parsedV1.prepProfile === 'object') {
                    dest.prepProfile = Object.assign({}, defaults.prepProfile, parsedV1.prepProfile);
                }
                if (parsedV1.responderProfile && typeof parsedV1.responderProfile === 'object') {
                    dest.responderProfile = Object.assign({}, defaults.responderProfile, parsedV1.responderProfile);
                }
                if (parsedV1.campusStudio && typeof parsedV1.campusStudio === 'object') {
                    dest.campusStudio = Object.assign({}, defaults.campusStudio, parsedV1.campusStudio);
                }

                // Remove legacy key to ensure one-time migration
                localStorage.removeItem(STORAGE_KEY_V1);

                // Save fresh v2 state
                saveState(dest);
                return dest;
            }

            // Case C: Brand new user -> create defaults and persist
            const defaults = createDefaultState();
            Object.assign(dest, defaults);
            saveState(dest);
            return dest;
        } catch (e) {
            console.error('[ReadyVerseProgress] Error loading/migrating state:', e);
            const defaults = createDefaultState();
            Object.assign(dest, defaults);
            return dest;
        }
    }

    function applyParsedData(dest, data) {
        dest.totalXP = Number(data.totalXP) || 0;
        dest.completedMissions = Number(data.completedMissions) || 0;
        dest.decisionsMade = Number(data.decisionsMade) || 0;
        dest.correctDecisions = Number(data.correctDecisions) || 0;

        dest.completedMissionIds = new Set(Array.isArray(data.completedMissionIds) ? data.completedMissionIds : []);
        dest.missionBestScores = (data.missionBestScores && typeof data.missionBestScores === 'object') ? data.missionBestScores : {};
        dest.missionBestGrades = (data.missionBestGrades && typeof data.missionBestGrades === 'object') ? data.missionBestGrades : {};

        dest.completedLearnIds = new Set(Array.isArray(data.completedLearnIds) ? data.completedLearnIds : []);
        dest.learnQuizScores = (data.learnQuizScores && typeof data.learnQuizScores === 'object') ? data.learnQuizScores : {};

        dest.prepProfile = (data.prepProfile && typeof data.prepProfile === 'object') ? data.prepProfile : dest.prepProfile;
        dest.prepChecklistState = (data.prepChecklistState && typeof data.prepChecklistState === 'object') ? data.prepChecklistState : {};
        dest.completedPrepItemIds = new Set(Array.isArray(data.completedPrepItemIds) ? data.completedPrepItemIds : []);

        dest.dailyStreak = Number(data.dailyStreak) || 0;
        dest.longestStreak = Number(data.longestStreak) || 0;
        dest.lastActivityDate = data.lastActivityDate || null;

        dest.unlockedAchievements = new Set(Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : []);
        dest.rewardedAchievements = new Set(Array.isArray(data.rewardedAchievements) ? data.rewardedAchievements : []);
        dest.unlockedCapabilities = new Set(Array.isArray(data.unlockedCapabilities) ? data.unlockedCapabilities : []);

        dest.performanceHistory = Array.isArray(data.performanceHistory) ? data.performanceHistory : [];
        dest.lastResult = data.lastResult || null;

        dest.responderProfile = (data.responderProfile && typeof data.responderProfile === 'object') ? data.responderProfile : dest.responderProfile;
        dest.campusStudio = (data.campusStudio && typeof data.campusStudio === 'object') ? data.campusStudio : dest.campusStudio;

        // Recalculate and update readiness
        dest.readiness = calculateReadiness(dest).totalReadiness;
    }

    /**
     * Reset Progress while preserving profiles and settings
     */
    function resetProgress(targetState) {
        if (!targetState) return;
        const preservedPrepProfile = Object.assign({}, targetState.prepProfile);
        const preservedResponderProfile = Object.assign({}, targetState.responderProfile);
        const preservedCampusStudio = Object.assign({}, targetState.campusStudio);

        const defaults = createDefaultState();
        Object.assign(targetState, defaults);

        targetState.prepProfile = preservedPrepProfile;
        targetState.responderProfile = preservedResponderProfile;
        targetState.campusStudio = preservedCampusStudio;

        saveState(targetState);
    }

    /**
     * JSON Export
     */
    function exportBackup(st) {
        const payload = serializeState(st);
        return JSON.stringify(payload, null, 2);
    }

    /**
     * JSON Import with Schema Validation
     */
    function importBackup(jsonString, targetState) {
        if (!jsonString || typeof jsonString !== 'string') {
            throw new Error("Invalid backup file: empty or non-string content.");
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            throw new Error("Invalid JSON format. Please upload a valid ReadyVerse backup file.");
        }

        if (typeof parsed !== 'object' || parsed === null) {
            throw new Error("Invalid backup structure: root must be an object.");
        }

        const isLegacy = !parsed.version || parsed.version < 2;
        let warning = null;
        if (isLegacy) {
            warning = "Older backup format detected (v1). Progress fields were updated to the v2 formula, and valid profile records were restored.";
        }

        applyParsedData(targetState, parsed);
        saveState(targetState);

        return {
            success: true,
            version: parsed.version || 1,
            warning: warning
        };
    }

    return {
        STORAGE_KEY: STORAGE_KEY_V2,
        STORAGE_KEY_V1: STORAGE_KEY_V1,
        XP_REWARDS,
        XP_PER_LEVEL,
        getLevelTitle,
        calculateLevel,
        calculateReadiness,
        createDefaultState,
        recordActivity,
        saveState,
        loadState,
        resetProgress,
        exportBackup,
        importBackup,
        getLocalDateString,
        getCalendarDayDiff
    };
}));
