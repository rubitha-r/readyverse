/**
 * ReadyVerse AI — Context Provider Layer
 * Extracts authoritative, structured real-time state across all ReadyVerse domains:
 * Player Progress, Learn Hub, Missions, Preparedness Plan, Readiness Formula, Videos, and Campus Studio.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseAIContext = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Helper to safely access global ReadyVerse state
    function getState() {
        if (typeof window !== 'undefined' && window.state) {
            return window.state;
        }
        if (typeof global !== 'undefined' && global.state) {
            return global.state;
        }
        return {};
    }

    // Helper to safely access global ReadyVerse missions
    function getMissions() {
        if (typeof window !== 'undefined' && window.missions) {
            return window.missions;
        }
        if (typeof global !== 'undefined' && global.missions) {
            return global.missions;
        }
        return {};
    }

    // Helper to safely access global Learn Modules
    function getLearnModules() {
        if (typeof window !== 'undefined' && window.learnModules) {
            return window.learnModules;
        }
        if (typeof global !== 'undefined' && global.learnModules) {
            return global.learnModules;
        }
        return {};
    }

    // Helper to safely access global Preparedness Checklist Data
    function getPrepData() {
        if (typeof window !== 'undefined' && window.prepChecklistData) {
            return window.prepChecklistData;
        }
        if (typeof global !== 'undefined' && global.prepChecklistData) {
            return global.prepChecklistData;
        }
        return [];
    }

    // Helper to safely access ReadyVerseProgress module across Node and Browser
    function getProgressModule() {
        if (typeof ReadyVerseProgress !== 'undefined') return ReadyVerseProgress;
        if (typeof window !== 'undefined' && window.ReadyVerseProgress) return window.ReadyVerseProgress;
        if (typeof global !== 'undefined' && global.ReadyVerseProgress) return global.ReadyVerseProgress;
        try {
            return require('../progress');
        } catch (_) {
            return null;
        }
    }

    // 1. Player Progress Context
    function getPlayerProgress() {
        const state = getState();
        const totalXP = state.totalXP || 0;
        const levelInfo = (typeof ReadyVerseProgress !== 'undefined' && ReadyVerseProgress.calculateLevel)
            ? ReadyVerseProgress.calculateLevel(totalXP)
            : (typeof calculateLevel === 'function' 
                ? calculateLevel(totalXP) 
                : { 
                    level: Math.floor(totalXP / 200) + 1, 
                    title: (Math.floor(totalXP / 200) + 1) <= 2 ? "Rookie" : (Math.floor(totalXP / 200) + 1) <= 4 ? "Aware" : (Math.floor(totalXP / 200) + 1) <= 7 ? "Prepared" : (Math.floor(totalXP / 200) + 1) <= 10 ? "Responder" : "Guardian",
                    progressPct: ((totalXP % 200) / 200) * 100, 
                    levelStartXP: Math.floor(totalXP / 200) * 200, 
                    nextLevelXP: (Math.floor(totalXP / 200) + 1) * 200, 
                    remainingXP: 200 - (totalXP % 200) 
                });

        const completedMissionIds = state.completedMissionIds ? Array.from(state.completedMissionIds) : [];
        const completedLearnIds = state.completedLearnIds ? Array.from(state.completedLearnIds) : [];
        const completedPrepCount = state.completedPrepItemIds ? state.completedPrepItemIds.size : 0;
        const unlockedAchievements = state.unlockedAchievements ? Array.from(state.unlockedAchievements) : [];
        const unlockedCapabilities = state.unlockedCapabilities ? Array.from(state.unlockedCapabilities) : [];

        return {
            totalXP: totalXP,
            level: levelInfo.level,
            levelTitle: levelInfo.title || 'Rookie',
            levelStartXP: levelInfo.levelStartXP || (levelInfo.level - 1) * 200,
            nextLevelXP: levelInfo.nextLevelXP || levelInfo.level * 200,
            remainingXP: levelInfo.remainingXP !== undefined ? levelInfo.remainingXP : Math.max(0, (levelInfo.level * 200) - totalXP),
            levelProgressPct: Math.round(levelInfo.progressPct || 0),
            dailyStreak: state.dailyStreak || 0,
            readinessScore: state.readiness || 0,
            completedMissionsCount: completedMissionIds.length,
            completedMissionIds: completedMissionIds,
            completedLearnCount: completedLearnIds.length,
            completedLearnIds: completedLearnIds,
            completedPrepCount: completedPrepCount,
            totalPrepCount: 40,
            responderName: (state.responderProfile && state.responderProfile.name) || 'Ready Trainee',
            titleId: (state.responderProfile && state.responderProfile.titleId) || 'trainee',
            unlockedAchievements: unlockedAchievements,
            unlockedCapabilities: unlockedCapabilities
        };
    }

    // 2. Learn Hub Context
    function getLearnHubContext() {
        const state = getState();
        const modules = getLearnModules();
        const completedLearnIds = state.completedLearnIds ? Array.from(state.completedLearnIds) : [];
        const quizScores = state.learnQuizScores || {};

        const catalog = Object.keys(modules).map(key => {
            const mod = modules[key];
            const isDone = completedLearnIds.includes(key);
            return {
                id: key,
                title: mod.title,
                icon: mod.icon,
                isCompleted: isDone,
                quizScore: quizScores[key] || (isDone ? 100 : null),
                overview: mod.overview
            };
        });

        let activeModuleDetail = null;
        if (state.activeLearnKey && modules[state.activeLearnKey]) {
            const m = modules[state.activeLearnKey];
            activeModuleDetail = {
                id: m.id,
                title: m.title,
                icon: m.icon,
                overview: m.overview,
                before: m.before || [],
                during: m.during || [],
                after: m.after || [],
                donts: m.donts || [],
                safetyTips: m.safetyTips || [],
                quizCount: m.quiz ? m.quiz.length : 0,
                isCompleted: completedLearnIds.includes(m.id),
                bestQuizScore: quizScores[m.id] || null
            };
        }

        return {
            totalModules: catalog.length || 6,
            completedCount: completedLearnIds.length,
            completedIds: completedLearnIds,
            activeModuleId: state.activeLearnKey || null,
            activeModule: activeModuleDetail,
            catalog: catalog
        };
    }

    // 3. Preparedness Plan Context
    function getPreparednessContext() {
        const state = getState();
        const prepData = getPrepData();
        const completedSet = state.completedPrepItemIds || new Set();
        const records = state.preparednessRecords || {};

        const categorySummary = {
            general: { name: 'Core Essentials', total: 0, done: 0 },
            fire: { name: 'Building Fire Plan', total: 0, done: 0 },
            flood: { name: 'Flash Flood Plan', total: 0, done: 0 },
            cyclone: { name: 'Cyclone Plan', total: 0, done: 0 },
            earthquake: { name: 'Earthquake Plan', total: 0, done: 0 }
        };

        const pendingHighPriority = [];

        prepData.forEach(item => {
            const cat = item.category || 'general';
            if (categorySummary[cat]) {
                categorySummary[cat].total++;
                if (completedSet.has(item.id)) {
                    categorySummary[cat].done++;
                }
            }
            if (!completedSet.has(item.id) && item.priority === 'high') {
                pendingHighPriority.push({
                    id: item.id,
                    title: item.title,
                    category: item.categoryName || item.category,
                    desc: item.desc,
                    prompt: item.prompt
                });
            }
        });

        const totalDone = completedSet.size;
        const totalItems = prepData.length || 40;
        const pct = Math.round((totalDone / totalItems) * 100);

        // Recommend the next highest priority incomplete action
        let nextRecommended = null;
        if (pendingHighPriority.length > 0) {
            nextRecommended = pendingHighPriority[0];
        } else {
            const firstIncomplete = prepData.find(i => !completedSet.has(i.id));
            if (firstIncomplete) {
                nextRecommended = {
                    id: firstIncomplete.id,
                    title: firstIncomplete.title,
                    category: firstIncomplete.categoryName || firstIncomplete.category,
                    desc: firstIncomplete.desc
                };
            }
        }

        return {
            totalItems: totalItems,
            completedCount: totalDone,
            completionPercentage: pct,
            categorySummary: categorySummary,
            pendingHighPriorityCount: pendingHighPriority.length,
            pendingHighPriority: pendingHighPriority.slice(0, 5),
            nextRecommendedAction: nextRecommended,
            userRecordsSummary: {
                hasSavedContacts: Boolean(records['core_contacts']),
                hasSavedMeetingPoints: Boolean(records['fire_meeting'] || records['flood_routes']),
                hasSavedMedicalRecord: Boolean(records['core_firstaid'])
            }
        };
    }

    // 4. Mission Context (Fire, Flood, Cyclone, Earthquake)
    function getMissionContext() {
        const state = getState();
        const missions = getMissions();
        const isMissionActive = Boolean(state.currentMission && missions[state.currentMission]);

        if (!isMissionActive) {
            const completedMissionIds = state.completedMissionIds ? Array.from(state.completedMissionIds) : [];
            const bestScores = state.missionBestScores || {};
            const bestGrades = state.missionBestGrades || {};

            const order = ['fire', 'flood', 'cyclone', 'earthquake'];
            const nextMission = order.find(k => !completedMissionIds.includes(k)) || 'fire';

            return {
                isActive: false,
                currentMissionId: null,
                completedMissionsCount: completedMissionIds.length,
                completedMissionIds: completedMissionIds,
                missionPerformance: {
                    fire: { completed: completedMissionIds.includes('fire'), score: bestScores['fire'] || 0, grade: bestGrades['fire'] || 'N/A' },
                    flood: { completed: completedMissionIds.includes('flood'), score: bestScores['flood'] || 0, grade: bestGrades['flood'] || 'N/A' },
                    cyclone: { completed: completedMissionIds.includes('cyclone'), score: bestScores['cyclone'] || 0, grade: bestGrades['cyclone'] || 'N/A' },
                    earthquake: { completed: completedMissionIds.includes('earthquake'), score: bestScores['earthquake'] || 0, grade: bestGrades['earthquake'] || 'N/A' }
                },
                recommendedNextMission: nextMission
            };
        }

        const missionKey = state.currentMission;
        const missionDef = missions[missionKey];
        const stageIdx = state.currentStageIndex || 0;
        const stageList = missionDef.questions || missionDef.stages || missionDef.decisions || [];
        const totalStages = stageList.length || 8;

        const currentStage = stageList[stageIdx] || {};

        const choices = (currentStage.options || []).map((opt, idx) => ({
            index: idx,
            text: opt.text || opt.label || ''
        }));

        const previousDecisions = [];
        if (state.stageAnswers && Array.isArray(state.stageAnswers)) {
            for (let i = 0; i < stageIdx; i++) {
                const prevStage = stageList[i];
                const chosenOptIdx = state.stageAnswers[i];
                if (prevStage && prevStage.options && prevStage.options[chosenOptIdx]) {
                    const chosen = prevStage.options[chosenOptIdx];
                    previousDecisions.push({
                        stageNumber: i + 1,
                        situationSummary: (prevStage.situation || prevStage.title || '').slice(0, 80),
                        choiceMade: chosen.text || '',
                        feedback: chosen.feedback || '',
                        points: state.stageScores ? state.stageScores[i] : 0
                    });
                }
            }
        }

        return {
            isActive: true,
            missionId: missionKey,
            missionTitle: missionDef.title,
            missionDescription: missionDef.description,
            hazard: missionDef.hazard || missionKey,
            currentStageNumber: stageIdx + 1,
            totalStages: totalStages,
            currentSituation: currentStage.situation || currentStage.title || '',
            availableChoices: choices,
            previousDecisions: previousDecisions,
            currentScore: state.stageScores ? state.stageScores.reduce((a, b) => a + b, 0) : 0,
            timeRemainingSeconds: typeof missionTimeRemaining !== 'undefined' ? missionTimeRemaining : null
        };
    }

    // 5. Readiness Formula Context (40% Simulation Missions + 30% Preparedness Plan + 30% Learn Hub)
    function getReadinessContext() {
        const state = getState();
        const progressMod = getProgressModule();
        if (progressMod && typeof progressMod.calculateReadiness === 'function') {
            const res = progressMod.calculateReadiness(state);
            state.readiness = res.totalReadiness;
            return {
                totalReadiness: res.totalReadiness,
                simulationScore: res.simulationScore,
                learningScore: res.learningScore,
                planScore: res.planScore,
                breakdown: {
                    missionPerformance: {
                        weight: '40%',
                        completedCount: `${state.completedMissionIds ? (state.completedMissionIds.size || state.completedMissionIds.length) : 0} / 4`,
                        averageScorePct: res.simulationScore,
                        componentPoints: res.breakdown.simWeighted,
                        maxComponentPoints: 40
                    },
                    preparednessChecklist: {
                        weight: '30%',
                        completedCount: `${state.completedPrepItemIds ? (state.completedPrepItemIds.size || state.completedPrepItemIds.length) : 0} / 40`,
                        completionPct: res.planScore,
                        componentPoints: res.breakdown.planWeighted,
                        maxComponentPoints: 30
                    },
                    learningHubKnowledge: {
                        weight: '30%',
                        completedCount: `${state.completedLearnIds ? (state.completedLearnIds.size || state.completedLearnIds.length) : 0} / 6`,
                        completionPct: res.learningScore,
                        componentPoints: res.breakdown.learnWeighted,
                        maxComponentPoints: 30
                    }
                },
                highestImpactNextStep: getHighestImpactRecommendation(
                    state.completedMissionIds ? (state.completedMissionIds.size || state.completedMissionIds.length) : 0,
                    state.completedPrepItemIds ? (state.completedPrepItemIds.size || state.completedPrepItemIds.length) : 0,
                    state.completedLearnIds ? (state.completedLearnIds.size || state.completedLearnIds.length) : 0
                )
            };
        }

        const completedMissions = state.completedMissionIds ? (state.completedMissionIds.size || state.completedMissionIds.length) : 0;
        const bestScores = state.missionBestScores || {};
        
        let missionSum = 0;
        ['fire', 'flood', 'cyclone', 'earthquake'].forEach(k => {
            const hasDone = (state.completedMissionIds && typeof state.completedMissionIds.has === 'function')
                ? state.completedMissionIds.has(k)
                : (Array.isArray(state.completedMissionIds) && state.completedMissionIds.includes(k));
            if (hasDone) {
                missionSum += (typeof bestScores[k] === 'number') ? bestScores[k] : 0;
            }
        });
        const missionAvg = missionSum / 4;
        const missionComponent = Math.round(0.40 * missionAvg * 10) / 10;

        const prepCount = state.completedPrepItemIds ? (state.completedPrepItemIds.size || state.completedPrepItemIds.length) : 0;
        const prepPct = (prepCount / 40) * 100;
        const prepComponent = Math.round(0.30 * prepPct * 10) / 10;

        const learnCount = state.completedLearnIds ? (state.completedLearnIds.size || state.completedLearnIds.length) : 0;
        const learnPct = (learnCount / 6) * 100;
        const learnComponent = Math.round(0.30 * learnPct * 10) / 10;

        const totalReadiness = Math.round(missionComponent + prepComponent + learnComponent);

        return {
            totalReadiness: totalReadiness,
            breakdown: {
                missionPerformance: {
                    weight: '40%',
                    completedCount: `${completedMissions} / 4`,
                    averageScorePct: Math.round(missionAvg),
                    componentPoints: missionComponent,
                    maxComponentPoints: 40
                },
                preparednessChecklist: {
                    weight: '30%',
                    completedCount: `${prepCount} / 40`,
                    completionPct: Math.round(prepPct),
                    componentPoints: prepComponent,
                    maxComponentPoints: 30
                },
                learningHubKnowledge: {
                    weight: '30%',
                    completedCount: `${learnCount} / 6`,
                    completionPct: Math.round(learnPct),
                    componentPoints: learnComponent,
                    maxComponentPoints: 30
                }
            },
            highestImpactNextStep: getHighestImpactRecommendation(completedMissions, prepCount, learnCount)
        };
    }

    /**
     * Extracts student's trusted first name. Rejects generic defaults ('Student', 'Trainee', etc.)
     */
    function getStudentFirstName(profile) {
        if (!profile) {
            const state = getState();
            profile = state.prepProfile || state.responderProfile || {};
        }
        const candidate = (typeof profile === 'string') ? profile : (profile.name || profile.firstName || '');
        if (!candidate || typeof candidate !== 'string') return '';
        const trimmed = candidate.trim();
        const untrusted = ['student', 'user', 'learner', 'trainee', 'responder', 'anonymous', 'ready trainee'];
        if (untrusted.includes(trimmed.toLowerCase())) return '';
        return trimmed.split(/\s+/)[0];
    }

    /**
     * Phase 5: Real Readiness Coach Context extractor
     * Reads LIVE state through ReadyVerseProgress API at send time (no cached copies).
     * Strictly numbers only — no personal or medical data.
     */
    function getCoachContext(customState = null) {
        const progressMod = getProgressModule();
        let state = customState || getState();
        if ((!state || Object.keys(state).length === 0) && progressMod && typeof progressMod.loadState === 'function') {
            state = progressMod.loadState();
        }

        let readinessResult;
        if (progressMod && typeof progressMod.calculateReadiness === 'function') {
            readinessResult = progressMod.calculateReadiness(state);
            if (state && typeof state === 'object') {
                state.readiness = readinessResult.totalReadiness;
            }
        } else {
            readinessResult = getReadinessContext();
        }

        const totalXP = Number(state.totalXP) || 0;
        const levelInfo = progressMod && typeof progressMod.calculateLevel === 'function'
            ? progressMod.calculateLevel(totalXP)
            : { level: Math.floor(totalXP / 200) + 1, title: 'Rookie' };

        const completedMissionsList = state.completedMissionIds ? Array.from(state.completedMissionIds) : [];
        const completedMissions = completedMissionsList.length;
        const bestScores = state.missionBestScores || {};
        const completedLearnList = state.completedLearnIds ? Array.from(state.completedLearnIds) : [];
        const completedLearnCount = completedLearnList.length;
        const completedPrepCount = state.completedPrepItemIds ? (state.completedPrepItemIds.size !== undefined ? state.completedPrepItemIds.size : state.completedPrepItemIds.length) : 0;

        // Prioritized next best actions calculated deterministically from formula:
        const prioritized = [];
        const order = ['fire', 'flood', 'cyclone', 'earthquake'];
        const unplayedMission = order.find(k => !completedMissionsList.includes(k));

        if (unplayedMission) {
            const titles = { fire: 'Building Fire Drill', flood: 'Flash Flood Drill', cyclone: 'Cyclone Tracking Drill', earthquake: 'Earthquake Drill' };
            prioritized.push({
                priority: 1,
                domain: 'drill',
                target: unplayedMission,
                action: `Complete ${titles[unplayedMission]}`,
                readinessImpact: '+10.0%',
                rationale: 'Simulation drills account for 40% of readiness. Each unplayed drill adds up to +10.0% to your readiness score.'
            });
        }

        if (completedLearnCount < 6) {
            prioritized.push({
                priority: prioritized.length + 1,
                domain: 'lesson',
                action: 'Pass next Learn Hub lesson quiz',
                readinessImpact: '+5.0%',
                rationale: 'Learning Hub accounts for 30% of readiness. Each passed lesson module adds +5.0% readiness.'
            });
        }

        if (completedPrepCount < 40) {
            prioritized.push({
                priority: prioritized.length + 1,
                domain: 'plan',
                action: 'Verify Dorm / Campus Preparedness Plan actions',
                readinessImpact: '+0.75% per action',
                rationale: 'Preparedness Plan accounts for 30% of readiness across 40 items (+0.75% per item).'
            });
        }

        if (prioritized.length === 0) {
            prioritized.push({
                priority: 1,
                domain: 'mastery',
                action: 'Maintain daily streak and review campus safety procedures',
                readinessImpact: '100% Maximum Readiness',
                rationale: 'All drills, lessons, and plan actions have been completed.'
            });
        }

        const trustedStudentName = getStudentFirstName();

        return {
            studentName: trustedStudentName || null,
            readiness: {
                total: readinessResult.totalReadiness,
                simulationScore: readinessResult.simulationScore,
                learningScore: readinessResult.learningScore,
                planScore: readinessResult.planScore,
                breakdown: readinessResult.breakdown || {
                    simWeighted: Math.round(0.40 * readinessResult.simulationScore * 10) / 10,
                    learnWeighted: Math.round(0.30 * readinessResult.learningScore * 10) / 10,
                    planWeighted: Math.round(0.30 * readinessResult.planScore * 10) / 10
                }
            },
            player: {
                studentName: trustedStudentName || null,
                level: levelInfo.level,
                levelTitle: levelInfo.title,
                totalXP: totalXP,
                dailyStreak: state.dailyStreak || 0,
                drillsCompletedCount: completedMissions,
                drillsAccuracies: {
                    fire: bestScores.fire || 0,
                    flood: bestScores.flood || 0,
                    cyclone: bestScores.cyclone || 0,
                    earthquake: bestScores.earthquake || 0
                },
                lessonsPassedCount: completedLearnCount,
                planActionsDoneCount: completedPrepCount
            },
            prioritizedNextActions: prioritized
        };
    }

    function getHighestImpactRecommendation(completedMissions, prepCount, learnCount) {
        if (completedMissions < 4) {
            return {
                domain: 'mission',
                action: 'Complete next disaster simulation mission',
                potentialGain: '+10.0% readiness (at 100% accuracy)',
                reason: 'Missions account for 40% of your total readiness score.'
            };
        }
        if (learnCount < 6) {
            return {
                domain: 'learn',
                action: 'Complete an unread Learn Hub module & quiz',
                potentialGain: '+5.0% readiness per module passed',
                reason: 'Learn Hub accounts for 30% of your total readiness score.'
            };
        }
        if (prepCount < 40) {
            return {
                domain: 'prep',
                action: 'Verify remaining Preparedness Plan actions',
                potentialGain: '+0.75% readiness per action verified',
                reason: 'Preparedness Plan accounts for 30% of your total readiness score.'
            };
        }
        return {
            domain: 'mastery',
            action: 'Maintain daily streak and review campus emergency plans',
            potentialGain: 'Readiness at maximum 100%',
            reason: 'You have mastered all core curriculum elements.'
        };
    }

    // 6. Video Assets Context
    function getVideoContext() {
        const videos = [
            {
                id: 'readiness_emergency',
                filename: 'readiness_emergency.mp4',
                title: 'Campus Emergency Alarm & Evacuation Protocol',
                hazard: 'fire_and_general',
                description: 'Full-motion simulated evacuation drill showing classroom smoke alarm triggers, single-file stairwell descent, avoiding elevators, and outdoor assembly reporting.',
                keyTakeaways: [
                    'Do NOT delay evacuation to gather personal laptops or backpacks.',
                    'Check stairwell doors with the back of hand before opening.',
                    'Always report directly to the floor safety marshal at the assembly point.'
                ]
            },
            {
                id: 'cyclone_shelter',
                filename: 'cyclone_shelter.jpg',
                title: 'Cyclone Structural Lockdown & Shutter Securing',
                hazard: 'cyclone',
                description: 'Reinforced interior room sheltering away from windward glass windows during Category 3+ coastal cyclone conditions.'
            },
            {
                id: 'flood_evac',
                filename: 'flood_evac.jpg',
                title: 'Flash Flood High-Ground Relocation',
                hazard: 'flood',
                description: 'Pedestrian evacuation away from low-lying culverts, electrical substations, and storm drains toward reinforced upper campus levels.'
            },
            {
                id: 'quake_shelter',
                filename: 'quake_shelter.jpg',
                title: 'Earthquake Drop, Cover & Hold On Shelter',
                hazard: 'earthquake',
                description: 'Securing sturdy under-desk protection shielding the head and cervical spine from falling fixtures, lamps, and suspended ceilings.'
            }
        ];

        return {
            availableVideos: videos,
            currentVideoActive: null
        };
    }

    // 7. Campus Studio Context
    function getCampusContext() {
        const state = getState();
        const studio = state.campusStudio || {};
        const profile = studio.campusProfile || {
            name: 'SNS Campus',
            type: 'Engineering College & Hostel Block',
            hazard: 'flood',
            assemblyPoint: 'Main Sports Ground',
            emergencyContact: 'Not configured'
        };

        return {
            activeRole: studio.activeRole || 'student',
            campusName: profile.name,
            campusType: profile.type,
            primaryHazard: profile.hazard,
            assemblyPoint: profile.assemblyPoint,
            emergencyContact: profile.emergencyContact,
            tabletopScenarioId: studio.selectedScenarioId || 'campus_flood',
            tabletopStep: studio.tabletopStep || 0,
            isTabletopActive: studio.tabletopStep > 0 && studio.tabletopStep < 3,
            aarRecordsCount: (studio.aarRecords && studio.aarRecords.length) || 0
        };
    }

    // 8. Top-level Active Context Aggregator
    function getReadyVerseContext() {
        let activePage = 'dashboard';
        if (typeof document !== 'undefined') {
            if (document.getElementById('simulationPage') && !document.getElementById('simulationPage').classList.contains('hidden')) {
                activePage = 'simulation';
            } else if (document.getElementById('learningHubContent') && !document.getElementById('learningHubContent').classList.contains('hidden')) {
                activePage = 'learningHub';
            } else if (document.getElementById('preparednessContent') && !document.getElementById('preparednessContent').classList.contains('hidden')) {
                activePage = 'preparedness';
            } else if (document.getElementById('passportContent') && !document.getElementById('passportContent').classList.contains('hidden')) {
                activePage = 'passport';
            } else if (document.getElementById('studioContent') && !document.getElementById('studioContent').classList.contains('hidden')) {
                activePage = 'campusStudio';
            } else if (document.getElementById('resultPage') && !document.getElementById('resultPage').classList.contains('hidden')) {
                activePage = 'result';
            }
        }

        return {
            activePage: activePage,
            player: getPlayerProgress(),
            mission: getMissionContext(),
            learn: getLearnHubContext(),
            preparedness: getPreparednessContext(),
            readiness: getReadinessContext(),
            campus: getCampusContext(),
            video: getVideoContext()
        };
    }

    return {
        getPlayerProgress: getPlayerProgress,
        getLearnHubContext: getLearnHubContext,
        getPreparednessContext: getPreparednessContext,
        getMissionContext: getMissionContext,
        getReadinessContext: getReadinessContext,
        getVideoContext: getVideoContext,
        getCampusContext: getCampusContext,
        getReadyVerseContext: getReadyVerseContext,
        getCoachContext: getCoachContext,
        getStudentFirstName: getStudentFirstName
    };
}));
