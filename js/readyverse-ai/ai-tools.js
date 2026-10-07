/**
 * ReadyVerse AI — Tool & Function Calling Layer
 * Exposes controlled, validated function tools for OpenAI Realtime & Chat Agent.
 * Authoritative ReadyVerse business logic is strictly preserved.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./ai-context'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const context = require('./ai-context');
        module.exports = factory(context);
    } else {
        root.ReadyVerseAITools = factory(root.ReadyVerseAIContext);
    }
}(typeof self !== 'undefined' ? self : this, function (AIContext) {
    'use strict';

    // 1. Tool Definitions with standard JSON Schema specifications for OpenAI Agents & Realtime
    const TOOL_DEFINITIONS = [
        {
            type: 'function',
            name: 'get_current_readyverse_state',
            description: 'Returns the current active page and a complete real-time snapshot of the student\'s ReadyVerse state (XP, Level, Readiness %, active mission or learning module).',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_player_progress',
            description: 'Returns the student\'s level, XP, daily streak, unlocked achievements, responder title, and core mastery counts.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_learning_module',
            description: 'Retrieves the complete educational guide, rules, dos and don\'ts, and safety tips for a specific Learn Hub module.',
            parameters: {
                type: 'object',
                properties: {
                    moduleId: {
                        type: 'string',
                        enum: ['fire', 'flood', 'cyclone', 'earthquake', 'electrical', 'medical'],
                        description: 'The identifier of the disaster or emergency learning module.'
                    }
                },
                required: ['moduleId']
            }
        },
        {
            type: 'function',
            name: 'get_current_mission',
            description: 'Retrieves the active simulation mission details, including current disaster situation, stage number (1-8), and available choices.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_mission_state',
            description: 'Retrieves the current mission score, decision history, and remaining timer if inside an active simulation.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_preparedness_progress',
            description: 'Returns the completion status of the 40 Personal Preparedness actions across Core, Fire, Flood, Cyclone, and Earthquake categories.',
            parameters: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        enum: ['all', 'general', 'fire', 'flood', 'cyclone', 'earthquake'],
                        description: 'Optional filter by preparedness category.'
                    }
                },
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_readiness_summary',
            description: 'Returns the exact 50/30/20 formula mathematical breakdown explaining why the readiness score is at its current percentage and what will boost it most.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            type: 'function',
            name: 'get_video_context',
            description: 'Retrieves learning objectives, video transcripts, and emergency takeaways for active or cataloged cinematic training videos.',
            parameters: {
                type: 'object',
                properties: {
                    videoId: {
                        type: 'string',
                        description: 'Optional video ID, e.g., readiness_emergency, cyclone_shelter, flood_evac, quake_shelter.'
                    }
                },
                required: []
            }
        },
        {
            type: 'function',
            name: 'submit_mission_decision',
            description: 'Maps the student\'s natural spoken or typed response to an existing valid mission choice option index and proposes the decision to the simulation.',
            parameters: {
                type: 'object',
                properties: {
                    optionIndex: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 3,
                        description: 'The 0-based index of the chosen option for the current mission stage.'
                    },
                    rationale: {
                        type: 'string',
                        description: 'Brief educational explanation of why the student\'s intent mapped to this option.'
                    }
                },
                required: ['optionIndex']
            }
        },
        {
            type: 'function',
            name: 'suggest_next_action',
            description: 'Calculates the highest-priority educational action or simulation the student should do next to maximize readiness and preparedness.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    ];

    // 2. Safe Tool Execution Handlers
    const toolHandlers = {
        get_current_readyverse_state: function (args) {
            return AIContext ? AIContext.getReadyVerseContext() : { error: 'Context not available' };
        },

        get_player_progress: function (args) {
            return AIContext ? AIContext.getPlayerProgress() : { error: 'Context not available' };
        },

        get_learning_module: function (args) {
            if (!args || !args.moduleId) {
                return { error: 'Missing moduleId argument' };
            }
            const learnContext = AIContext ? AIContext.getLearnHubContext() : {};
            const modules = (typeof window !== 'undefined' && window.learnModules) || {};
            const mod = modules[args.moduleId];
            if (!mod) {
                return { error: `Module '${args.moduleId}' not found in ReadyVerse catalog.` };
            }
            return {
                id: mod.id,
                title: mod.title,
                icon: mod.icon,
                overview: mod.overview,
                beforeRules: mod.before || [],
                duringRules: mod.during || [],
                afterRules: mod.after || [],
                donts: mod.donts || [],
                safetyTips: mod.safetyTips || [],
                quizQuestionsCount: (mod.quiz && mod.quiz.length) || 0
            };
        },

        get_current_mission: function (args) {
            return AIContext ? AIContext.getMissionContext() : { error: 'Context not available' };
        },

        get_mission_state: function (args) {
            return AIContext ? AIContext.getMissionContext() : { error: 'Context not available' };
        },

        get_preparedness_progress: function (args) {
            const prep = AIContext ? AIContext.getPreparednessContext() : { error: 'Context not available' };
            if (args && args.category && args.category !== 'all' && prep.categorySummary) {
                return {
                    selectedCategory: args.category,
                    categoryDetails: prep.categorySummary[args.category] || null,
                    completionPercentage: prep.completionPercentage,
                    pendingHighPriority: prep.pendingHighPriority
                };
            }
            return prep;
        },

        get_readiness_summary: function (args) {
            return AIContext ? AIContext.getReadinessContext() : { error: 'Context not available' };
        },

        get_video_context: function (args) {
            const videoCtx = AIContext ? AIContext.getVideoContext() : { availableVideos: [] };
            if (args && args.videoId) {
                const found = videoCtx.availableVideos.find(v => v.id === args.videoId || v.filename === args.videoId);
                if (found) return found;
            }
            return videoCtx;
        },

        submit_mission_decision: function (args) {
            if (!args || typeof args.optionIndex !== 'number') {
                return { error: 'Invalid optionIndex provided. Must be an integer index.' };
            }

            const missionCtx = AIContext ? AIContext.getMissionContext() : null;
            if (!missionCtx || !missionCtx.isActive) {
                return {
                    status: 'rejected',
                    reason: 'No active mission is currently running in the simulation viewport. Open a mission to submit decisions.'
                };
            }

            const validChoicesCount = missionCtx.availableChoices ? missionCtx.availableChoices.length : 0;
            if (args.optionIndex < 0 || args.optionIndex >= validChoicesCount) {
                return {
                    status: 'rejected',
                    reason: `optionIndex ${args.optionIndex} is out of bounds for the current stage (0 to ${validChoicesCount - 1}).`
                };
            }

            const chosenText = missionCtx.availableChoices[args.optionIndex].text;

            // Trigger decision safely in the DOM if selectOption is available
            let appliedInSimulation = false;
            if (typeof window !== 'undefined') {
                if (typeof window.selectOption === 'function') {
                    try {
                        window.selectOption(args.optionIndex);
                        appliedInSimulation = true;
                    } catch (e) {
                        console.warn('[ReadyVerse AI] Error executing selectOption:', e);
                    }
                }
            }

            return {
                status: 'accepted',
                stageNumber: missionCtx.currentStageNumber,
                selectedOptionIndex: args.optionIndex,
                selectedOptionText: chosenText,
                rationale: args.rationale || 'Decision submitted via conversational companion.',
                appliedInSimulation: appliedInSimulation
            };
        },

        suggest_next_action: function (args) {
            const readinessCtx = AIContext ? AIContext.getReadinessContext() : null;
            const prepCtx = AIContext ? AIContext.getPreparednessContext() : null;
            const missionCtx = AIContext ? AIContext.getMissionContext() : null;

            if (readinessCtx && readinessCtx.highestImpactNextStep) {
                return {
                    recommendation: readinessCtx.highestImpactNextStep,
                    nextPreparednessAction: prepCtx ? prepCtx.nextRecommendedAction : null,
                    nextMissionRecommendation: missionCtx ? missionCtx.recommendedNextMission : null
                };
            }

            return {
                recommendation: {
                    domain: 'general',
                    action: 'Complete Building Fire simulation and first 5 core emergency contacts.',
                    reason: 'Builds foundational response instincts.'
                }
            };
        }
    };

    // 3. Main Tool Dispatcher
    async function executeTool(name, args) {
        if (!toolHandlers[name]) {
            console.warn(`[ReadyVerse AI] Tool handler not found: ${name}`);
            return { error: `Tool '${name}' is not recognized.` };
        }

        try {
            const result = toolHandlers[name](args);
            return result;
        } catch (err) {
            console.error(`[ReadyVerse AI] Error executing tool '${name}':`, err);
            return { error: err.message || 'Error occurred during tool execution.' };
        }
    }

    // 4. Gemini Function Declarations Exporter
    function getGeminiFunctionDeclarations() {
        return TOOL_DEFINITIONS.map(tool => {
            const params = tool.parameters || { type: 'object', properties: {}, required: [] };
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'OBJECT',
                    properties: params.properties || {},
                    required: params.required || []
                }
            };
        });
    }

    // 5. OpenAI & Groq Function Declarations Exporter (Chat Completions standard format)
    function getOpenAIFunctionDeclarations() {
        return TOOL_DEFINITIONS.map(tool => {
            return {
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
                }
            };
        });
    }

    return {
        TOOL_DEFINITIONS: TOOL_DEFINITIONS,
        executeTool: executeTool,
        toolHandlers: toolHandlers,
        getGeminiFunctionDeclarations: getGeminiFunctionDeclarations,
        getOpenAIFunctionDeclarations: getOpenAIFunctionDeclarations
    };
}));
