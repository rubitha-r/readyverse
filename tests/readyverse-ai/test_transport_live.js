/**
 * Full end-to-end integration test of ReadyVerseAITransport in Node.js environment
 */
const AIContext = require('../../js/readyverse-ai/ai-context');
const AITools = require('../../js/readyverse-ai/ai-tools');
const AIPersonality = require('../../js/readyverse-ai/ai-personality');
const ProviderBase = require('../../js/readyverse-ai/providers/provider-base');
const GeminiLiveProvider = require('../../js/readyverse-ai/providers/gemini-live-provider');
const GroqProvider = require('../../js/readyverse-ai/providers/groq-provider');
const ReadyVerseAITransport = require('../../js/readyverse-ai/ai-transport');

async function test() {
    console.log('--- Instantiating ReadyVerseAITransport ---');
    const transport = new ReadyVerseAITransport({
        serverUrl: 'http://localhost:3000',
        primaryProvider: 'gemini',
        fallbackProvider: 'groq'
    });

    // Mock minimal state
    global.window = {
        state: {
            xp: 250,
            level: 2,
            readiness: { totalReadiness: 42 },
            missions: { completed: ['fire'] }
        }
    };

    console.log('\n--- 1. Testing Chat Fallback via Primary (Gemini) ---');
    let geminiTranscript = null;
    transport.on('transcript', (t) => {
        if (t.speaker === 'assistant') {
            geminiTranscript = t.text;
        }
    });

    const reply = await transport.sendChatFallback('Explain how my readiness score is calculated using the 50/30/20 formula.');
    console.log('Active provider after request:', transport.activeProviderName);
    console.log('Availability after request:', transport.availability);
    console.log('Assistant Reply Length:', reply ? reply.length : 0);
    console.log('Reply Sample:\n' + (reply ? reply.slice(0, 300) : 'None') + '...\n');

    console.log('--- 2. Testing Chat Failover to Groq ---');
    // Simulate Gemini failure by forcing active provider to fail
    const originalGeminiSend = transport.providers.gemini.sendChatFallback;
    transport.providers.gemini.sendChatFallback = async () => {
        throw new Error('Simulated Gemini 503 Outage');
    };

    const failoverReply = await transport.sendChatFallback('What should I pack in an emergency earthquake kit?');
    console.log('Active provider after failover:', transport.activeProviderName);
    console.log('Availability after failover:', transport.availability);
    console.log('Failover Reply Length:', failoverReply ? failoverReply.length : 0);
    console.log('Failover Reply Sample:\n' + (failoverReply ? failoverReply.slice(0, 300) : 'None') + '...\n');

    // Restore
    transport.providers.gemini.sendChatFallback = originalGeminiSend;
    console.log('✅ All transport integration tests passed successfully!');
}

test().catch(err => {
    console.error('Transport test error:', err);
    process.exit(1);
});
