/**
 * Netlify Serverless Function Handler for ReadyVerse Coach Health (/api/coach-health)
 */

const coachHandler = require('../../api/coach');

exports.handler = async function (event, context) {
    const httpMethod = (event && event.httpMethod) ? event.httpMethod.toUpperCase() : 'GET';

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

    const result = await coachHandler.handleCoachRequest({ health: true }, 'health-check');

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify(result.body)
    };
};
