/**
 * Netlify Serverless Function Handler for ReadyVerse Coach (/api/coach)
 */

const coachHandler = require('../../api/coach');

exports.handler = async function (event, context) {
    const httpMethod = (event && event.httpMethod) ? event.httpMethod.toUpperCase() : 'POST';

    // Handle CORS preflight
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: ''
        };
    }

    // Health check via GET
    if (httpMethod === 'GET') {
        const query = (event && event.queryStringParameters) || {};
        const isDeep = Boolean(query.deep === '1' || query.deep === 'true');
        const result = await coachHandler.handleCoachRequest({ health: true, deep: isDeep }, 'health-check');
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: JSON.stringify(result.body)
        };
    }

    if (httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST to chat with ReadyVerse Coach.' })
        };
    }

    let bodyData = {};
    if (event && event.body) {
        try {
            bodyData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } catch (_) {
            bodyData = { message: event.body };
        }
    }

    const headers = (event && event.headers) || {};
    const clientIp = headers['client-ip'] || headers['x-forwarded-for'] || 'anonymous';
    const result = await coachHandler.handleCoachRequest(bodyData, clientIp);

    const responseHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(result.headers || {})
    };

    return {
        statusCode: result.statusCode || 200,
        headers: responseHeaders,
        body: JSON.stringify(result.body)
    };
};
