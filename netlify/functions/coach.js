/**
 * Netlify Serverless Function Handler for ReadyVerse Coach (/api/coach)
 */

const coachHandler = require('../../api/coach');

exports.handler = async function (event, context) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
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

    if (event.httpMethod !== 'POST') {
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
    if (event.body) {
        try {
            bodyData = JSON.parse(event.body);
        } catch (_) {
            bodyData = { message: event.body };
        }
    }

    const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
    const result = await coachHandler.handleCoachRequest(bodyData, clientIp);

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(result.headers || {})
    };

    return {
        statusCode: result.statusCode || 200,
        headers: headers,
        body: JSON.stringify(result.body)
    };
};
