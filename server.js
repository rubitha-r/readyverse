const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { WebSocketServer, WebSocket: WsClient } = require('ws');

// 1. Safe .env file loader
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const idx = trimmed.indexOf('=');
                    const key = trimmed.substring(0, idx).trim();
                    let val = trimmed.substring(idx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    process.env[key] = val;
                }
            });
            console.log('[ReadyVerse Server] Loaded configuration from .env');
        } catch (e) {
            console.warn('[ReadyVerse Server] Could not read .env file:', e.message);
        }
    }
}

loadEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);
const AI_PRIMARY_PROVIDER = process.env.AI_PRIMARY_PROVIDER || 'gemini';
const AI_FALLBACK_PROVIDER = process.env.AI_FALLBACK_PROVIDER || 'groq';
const AI_FAILOVER_TEST = process.env.AI_FAILOVER_TEST === 'true';

// Gemini Configuration (Primary Provider)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.0-flash-exp';
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_VOICE = process.env.GEMINI_VOICE || 'Puck';

// Groq Configuration (Backup Text Provider)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// OpenAI Configuration (Optional / Provider-Agnostic)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const OPENAI_VOICE = process.env.OPENAI_VOICE || 'alloy';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

// Helper to make outgoing HTTPS JSON requests
function httpsRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(body);
                } catch (e) {
                    parsed = body;
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed });
            });
        });

        req.on('error', err => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

// 2. HTTP Request Router
const server = http.createServer(async (req, res) => {
    // Enable CORS for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const fullUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = fullUrl.pathname;

    // --- API: ReadyVerse AI Coach Serverless Function (Prompt 7 / Phase 1) ---
    if (pathname === '/api/coach' || pathname === '/api/coach-health') {
        const coachHandler = require('./api/coach');
        if (pathname === '/api/coach-health' && req.method === 'GET') {
            return (async () => {
                const parsedUrl = url.parse(req.url, true);
                const isDeep = Boolean(parsedUrl.query && (parsedUrl.query.deep === '1' || parsedUrl.query.deep === 'true'));
                const healthRes = await coachHandler.handleCoachRequest({ health: true, deep: isDeep }, 'health-check');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(healthRes.body));
            })();
        }
        return coachHandler(req, res);
    }

    // --- API: Health & Failover Router Status ---
    if (pathname === '/api/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            readyverse: 'ReadyVerse AI Server',
            version: '1.3.0',
            primaryProvider: AI_PRIMARY_PROVIDER,
            fallbackProvider: AI_FALLBACK_PROVIDER,
            geminiConfigured: Boolean(GEMINI_API_KEY && GEMINI_API_KEY.length > 5),
            geminiLiveModel: GEMINI_LIVE_MODEL,
            geminiChatModel: GEMINI_CHAT_MODEL,
            geminiVoice: GEMINI_VOICE,
            groqConfigured: Boolean(GROQ_API_KEY && GROQ_API_KEY.length > 5),
            groqModel: GROQ_MODEL,
            openaiConfigured: Boolean(OPENAI_API_KEY && OPENAI_API_KEY.startsWith('sk-')),
            openaiRealtimeModel: OPENAI_REALTIME_MODEL,
            openaiChatModel: OPENAI_CHAT_MODEL,
            openaiVoice: OPENAI_VOICE,
            failoverTestMode: AI_FAILOVER_TEST
        }));
        return;
    }

    // --- API: OpenAI Ephemeral Realtime Session Token (OpenAI Provider Compatibility) ---
    if (pathname === '/api/realtime/session' && (req.method === 'POST' || req.method === 'GET')) {
        if (!OPENAI_API_KEY || !OPENAI_API_KEY.startsWith('sk-')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'OPENAI_API_KEY_MISSING',
                message: 'OpenAI API key is missing on the server.',
                aiConfigured: false
            }));
            return;
        }

        try {
            let bodyData = {};
            if (req.method === 'POST') {
                bodyData = await readJsonBody(req);
            }

            const sessionPayload = {
                model: bodyData.model || OPENAI_REALTIME_MODEL,
                voice: bodyData.voice || OPENAI_VOICE,
                modalities: ['audio', 'text'],
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                instructions: bodyData.instructions || undefined
            };

            const options = {
                hostname: 'api.openai.com',
                path: '/v1/realtime/sessions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            };

            const response = await httpsRequest(options, sessionPayload);

            if (response.statusCode >= 200 && response.statusCode < 300) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response.data));
            } else {
                res.writeHead(response.statusCode || 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'OPENAI_REALTIME_ERROR',
                    message: response.data.error ? response.data.error.message : 'Failed to create OpenAI Realtime session',
                    details: response.data
                }));
            }
        } catch (err) {
            console.error('[ReadyVerse Server] Error creating OpenAI realtime session:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'REALTIME_SESSION_FAILED',
                message: err.message || 'Internal server error while connecting to OpenAI'
            }));
        }
        return;
    }

    // --- API: Conversational Chat Completion with Multi-Provider Support (Gemini, Groq, OpenAI) ---
    if ((pathname === '/api/chat' || pathname === '/api/gemini/chat' || pathname === '/api/groq/chat') && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            let provider = body.provider || AI_PRIMARY_PROVIDER;
            if (pathname === '/api/groq/chat') provider = 'groq';
            if (pathname === '/api/gemini/chat') provider = 'gemini';

            // Development Failover Test Simulation
            if (body.simulateFailure === 'gemini' || (AI_FAILOVER_TEST && provider === 'gemini' && !body.bypassTest)) {
                console.warn('[ReadyVerse Server / Dev Test] Simulating Gemini failure for failover verification.');
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'GEMINI_SIMULATED_FAILURE',
                    message: 'Simulated Gemini provider outage for failover verification.'
                }));
                return;
            }

            // 1. GROQ BACKUP PROVIDER (High-Speed LPU Text Inference)
            if (provider === 'groq') {
                if (!GROQ_API_KEY || GROQ_API_KEY.length < 5) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'GROQ_API_KEY_MISSING',
                        message: 'Groq API key is missing on the server. Please add GROQ_API_KEY to your .env file.',
                        aiConfigured: false
                    }));
                    return;
                }

                const groqModelName = body.model || GROQ_MODEL;
                const messages = body.messages || [];

                const groqPayload = {
                    model: groqModelName,
                    messages: messages,
                    temperature: typeof body.temperature === 'number' ? body.temperature : 0.6,
                    max_tokens: body.max_tokens || 800
                };

                if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
                    groqPayload.tools = body.tools.map(t => {
                        if (t.function) return t;
                        return {
                            type: 'function',
                            function: {
                                name: t.name,
                                description: t.description || '',
                                parameters: t.parameters || { type: 'object', properties: {} }
                            }
                        };
                    });
                    groqPayload.tool_choice = 'auto';
                }

                const postData = JSON.stringify(groqPayload);
                const options = {
                    hostname: 'api.groq.com',
                    path: '/openai/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 20000
                };

                const response = await httpsRequest(options, postData);

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response.data));
                } else {
                    res.writeHead(response.statusCode || 500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'GROQ_API_ERROR',
                        message: response.data.error ? response.data.error.message : 'Groq API request failed',
                        details: response.data
                    }));
                }
                return;
            }

            // 2. GEMINI PRIMARY PROVIDER (Google GenAI GenerateContent)
            if (provider === 'gemini') {
                if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 5) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'GEMINI_API_KEY_MISSING',
                        message: 'Gemini API key is missing or invalid on the server. Please add GEMINI_API_KEY to your .env file.',
                        aiConfigured: false
                    }));
                    return;
                }

                const modelName = body.model || GEMINI_CHAT_MODEL;
                const contents = [];
                
                if (body.messages && Array.isArray(body.messages)) {
                    body.messages.forEach(msg => {
                        if (msg.role === 'user') {
                            contents.push({ role: 'user', parts: [{ text: msg.content }] });
                        } else if (msg.role === 'assistant' || msg.role === 'model') {
                            contents.push({ role: 'model', parts: [{ text: msg.content }] });
                        }
                    });
                }

                if (contents.length === 0 && body.prompt) {
                    contents.push({ role: 'user', parts: [{ text: body.prompt }] });
                }

                const geminiPayload = {
                    contents: contents,
                    generationConfig: {
                        temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
                        maxOutputTokens: body.max_tokens || 800
                    }
                };

                if (body.systemInstruction) {
                    geminiPayload.systemInstruction = {
                        parts: [{ text: body.systemInstruction }]
                    };
                }

                if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
                    if (body.tools[0] && body.tools[0].functionDeclarations) {
                        geminiPayload.tools = body.tools;
                    } else {
                        // Extract function declaration objects if wrapped
                        const declarations = body.tools.map(t => {
                            if (t.name && t.parameters) {
                                return {
                                    name: t.name,
                                    description: t.description || '',
                                    parameters: t.parameters
                                };
                            }
                            if (t.function) {
                                return {
                                    name: t.function.name,
                                    description: t.function.description || '',
                                    parameters: t.function.parameters || { type: 'object', properties: {} }
                                };
                            }
                            return t;
                        });
                        geminiPayload.tools = [{
                            functionDeclarations: declarations
                        }];
                    }
                }

                const postData = JSON.stringify(geminiPayload);
                const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    path: `/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 20000
                };

                const response = await httpsRequest(options, postData);

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response.data));
                } else {
                    res.writeHead(response.statusCode || 500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'GEMINI_CHAT_ERROR',
                        message: response.data.error ? response.data.error.message : 'Gemini GenerateContent API request failed',
                        details: response.data
                    }));
                }
                return;
            }

            // 3. OPENAI PROVIDER (Optional Compatibility)
            if (provider === 'openai') {
                if (!OPENAI_API_KEY || !OPENAI_API_KEY.startsWith('sk-')) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'OPENAI_API_KEY_MISSING',
                        message: 'OpenAI API key is missing or invalid on the server.',
                        aiConfigured: false
                    }));
                    return;
                }

                const chatPayload = {
                    model: body.model || OPENAI_CHAT_MODEL,
                    messages: body.messages || [],
                    temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
                    max_tokens: body.max_tokens || 800
                };

                if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
                    chatPayload.tools = body.tools.map(t => {
                        if (t.function) return t;
                        return {
                            type: 'function',
                            function: {
                                name: t.name,
                                description: t.description || '',
                                parameters: t.parameters || { type: 'object', properties: {} }
                            }
                        };
                    });
                    chatPayload.tool_choice = 'auto';
                }

                const postData = JSON.stringify(chatPayload);
                const options = {
                    hostname: 'api.openai.com',
                    path: '/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 20000
                };

                const response = await httpsRequest(options, postData);

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response.data));
                } else {
                    res.writeHead(response.statusCode || 500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'OPENAI_CHAT_ERROR',
                        message: response.data.error ? response.data.error.message : 'OpenAI Chat API request failed',
                        details: response.data
                    }));
                }
                return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${provider}` }));
        } catch (err) {
            console.error('[ReadyVerse Server] Error in /api/chat:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'CHAT_REQUEST_FAILED',
                message: err.message || 'Internal error handling chat completion'
            }));
        }
        return;
    }

    // --- Static File Serving ---
    serveStaticFile(req, res, pathname);
});

// Helper to read JSON request body
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 10 * 1024 * 1024) { // 10MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', err => reject(err));
    });
}

// Static File Server with Range Request Support (for videos)
function serveStaticFile(req, res, pathname) {
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    const filePath = path.join(__dirname, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Video Range Request Handling for Smooth Playback
        const range = req.headers.range;
        if (range && (ext === '.mp4' || ext === '.webm')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType
            });
            fileStream.pipe(res);
            return;
        }

        const headers = {
            'Content-Length': stats.size,
            'Content-Type': contentType,
            'Cache-Control': (ext === '.html' || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) ? 'no-cache' : 'public, max-age=3600'
        };

        if (filePath.endsWith('sw.js')) {
            headers['Service-Worker-Allowed'] = '/';
        }

        res.writeHead(200, headers);

        fs.createReadStream(filePath).pipe(res);
    });
}

// 3. WebSocket Proxy Server for Gemini Live API
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs, req) => {
    console.log('[ReadyVerse Server / Gemini Live] Client WebSocket connected.');

    // Check for simulated failure mode in WebSocket
    if (AI_FAILOVER_TEST) {
        console.warn('[ReadyVerse Server / Gemini Live] Simulated Gemini Live WebSocket outage for failover verification.');
        clientWs.send(JSON.stringify({
            error: 'GEMINI_SIMULATED_WS_FAILURE',
            message: 'Simulated Gemini Live WebSocket failure for failover testing.'
        }));
        clientWs.close(1011, 'Simulated Gemini failure');
        return;
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 5) {
        console.warn('[ReadyVerse Server / Gemini Live] GEMINI_API_KEY is not configured.');
        clientWs.send(JSON.stringify({
            error: 'GEMINI_API_KEY_MISSING',
            message: 'Gemini API key is not configured in .env. Please set GEMINI_API_KEY to enable Gemini Live realtime voice conversation.'
        }));
        clientWs.close();
        return;
    }

    // Connect upstream to Google Gemini Live API
    const upstreamUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    let upstreamWs;

    try {
        upstreamWs = new WsClient(upstreamUrl);
    } catch (err) {
        console.error('[ReadyVerse Server / Gemini Live] Error initializing upstream WebSocket:', err);
        clientWs.send(JSON.stringify({
            error: 'GEMINI_UPSTREAM_ERROR',
            message: 'Failed to connect to Google Gemini Live service.'
        }));
        clientWs.close();
        return;
    }

    upstreamWs.on('open', () => {
        console.log('[ReadyVerse Server / Gemini Live] Upstream connection to Google Gemini Live established.');
    });

    upstreamWs.on('message', (data, isBinary) => {
        if (clientWs.readyState === WsClient.OPEN) {
            clientWs.send(data, { binary: isBinary });
        }
    });

    upstreamWs.on('error', (err) => {
        console.error('[ReadyVerse Server / Gemini Live] Upstream error:', err);
        if (clientWs.readyState === WsClient.OPEN) {
            clientWs.send(JSON.stringify({
                error: 'GEMINI_LIVE_ERROR',
                message: err.message || 'Gemini Live upstream connection error'
            }));
        }
    });

    upstreamWs.on('close', (code, reason) => {
        console.log('[ReadyVerse Server / Gemini Live] Upstream closed:', code, reason ? reason.toString() : '');
        if (clientWs.readyState === WsClient.OPEN) {
            clientWs.close();
        }
    });

    clientWs.on('message', (data, isBinary) => {
        if (upstreamWs && upstreamWs.readyState === WsClient.OPEN) {
            upstreamWs.send(data, { binary: isBinary });
        }
    });

    clientWs.on('close', () => {
        console.log('[ReadyVerse Server / Gemini Live] Client disconnected.');
        if (upstreamWs && upstreamWs.readyState === WsClient.OPEN) {
            upstreamWs.close();
        }
    });
});

// Handle HTTP Upgrade for WebSocket
server.on('upgrade', (req, socket, head) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/gemini-live' || pathname === '/api/gemini/live') {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } else {
        socket.destroy();
    }
});

server.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🚀 ReadyVerse Server running at http://localhost:${PORT}`);
    console.log(`🤖 AI Primary Provider:  ${AI_PRIMARY_PROVIDER.toUpperCase()} (Live Realtime Voice)`);
    console.log(`🛡️  AI Backup Provider:   ${AI_FALLBACK_PROVIDER.toUpperCase()} (High-Speed LPU Text Failover)`);
    console.log(`✨ ReadyVerse AI Endpoints:`);
    console.log(`   - GET  /api/health            (Router & Provider status)`);
    console.log(`   - WS   /api/gemini-live       (Gemini Live Realtime WebSocket proxy)`);
    console.log(`   - POST /api/chat              (Multi-provider chat fallback)`);
    console.log(`   - POST /api/groq/chat         (Dedicated Groq backup endpoint)`);
    console.log(`🔑 Gemini API Key Configured: ${GEMINI_API_KEY ? 'YES (' + GEMINI_API_KEY.slice(0, 6) + '...)' : 'NO (Add GEMINI_API_KEY to .env)'}`);
    console.log(`🔑 Groq API Key Configured:   ${GROQ_API_KEY ? 'YES (' + GROQ_API_KEY.slice(0, 6) + '...)' : 'NO (Add GROQ_API_KEY to .env)'}`);
    console.log(`⚡ Failover Simulation Mode:  ${AI_FAILOVER_TEST ? 'ENABLED (Dev Testing)' : 'OFF'}`);
    console.log('====================================================');
});

module.exports = server;
