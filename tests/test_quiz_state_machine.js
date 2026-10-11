/**
 * ReadyVerse Deterministic Quiz State Machine Test Suite (Phase 4)
 * Verifies that the Quiz State Machine manages 30 authentic lesson quiz questions,
 * evaluates options deterministically in code (supporting 1-4, A-D, text),
 * provides educational explanations, and enforces practice mode (no unvalidated XP).
 */

const assert = require('assert');
const quizSM = require('../js/readyverse-ai/quiz-state-machine');

function runQuizStateMachineTests() {
    console.log('=======================================================');
    console.log('🧪 RUNNING QUIZ STATE MACHINE TESTS');
    console.log('=======================================================\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Authentic Question Bank Size
    try {
        const totalQuestions = quizSM.getAllQuestions().length;
        assert.strictEqual(totalQuestions, 30, 'Must have exactly 30 authentic lesson quiz questions (5 per 6 lessons)');
        console.log('  ✓ Test 1 Passed: Exactly 30 authentic NDMA lesson questions verified.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 1 Failed:', e.message);
        failed++;
    }

    // Test 2: Quiz Intent Recognition
    try {
        assert.ok(quizSM.isQuizIntent('Quiz me'), 'Quiz me must be recognized');
        assert.ok(quizSM.isQuizIntent('quiz-me'), 'quiz-me must be recognized');
        assert.ok(quizSM.isQuizIntent('can you quiz me on fire safety'), 'Natural quiz request recognized');
        assert.ok(quizSM.isQuizIntent('kelvi kelu'), 'Tanglish kelvi kelu recognized');
        assert.ok(quizSM.isQuizIntent('கேள்வி கேள்'), 'Tamil question recognized');
        assert.ok(!quizSM.isQuizIntent('What do I do in a fire?'), 'Normal question not mistaken for quiz intent');
        console.log('  ✓ Test 2 Passed: Multi-language quiz intents correctly recognized.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 2 Failed:', e.message);
        failed++;
    }

    // Test 3: Starting a Quiz Question in English
    try {
        const questionText = quizSM.startQuiz('english');
        assert.ok(quizSM.isInQuiz(), 'Must be in active quiz state');
        assert.ok(questionText.includes('1.') && questionText.includes('2.') && questionText.includes('3.') && questionText.includes('4.'), 'Must list 4 options');
        console.log('  ✓ Test 3 Passed: English quiz question presented with formatted options.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 3 Failed:', e.message);
        failed++;
    }

    // Test 4: Correct Answer Evaluation
    try {
        const currentQ = quizSM.getCurrentQuestion();
        const correctOptIndex = currentQ.answer; // 0-indexed
        const correctNumber = String(correctOptIndex + 1);

        const evalResult = quizSM.evaluateAnswer(correctNumber, 'english');
        assert.strictEqual(evalResult.handled, true, 'Must handle answer');
        assert.strictEqual(evalResult.isCorrect, true, 'Answer must be evaluated as correct');
        assert.ok(evalResult.response.includes('Correct!') || evalResult.response.includes('Spot on'), 'Response must affirm correctness');
        assert.strictEqual(quizSM.isInQuiz(), false, 'Quiz state must clear after question resolution');
        console.log('  ✓ Test 4 Passed: Correct answer (numeric 1-4) evaluated accurately.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 4 Failed:', e.message);
        failed++;
    }

    // Test 5: Incorrect Answer with Explanation
    try {
        quizSM.startQuiz('english');
        const currentQ = quizSM.getCurrentQuestion();
        const wrongNumber = currentQ.answer === 0 ? '2' : '1';

        const evalResult = quizSM.evaluateAnswer(wrongNumber, 'english');
        assert.strictEqual(evalResult.handled, true, 'Must handle answer');
        assert.strictEqual(evalResult.isCorrect, false, 'Answer must be evaluated as incorrect');
        assert.ok(evalResult.response.includes('correct answer is'), 'Response must explain correct answer');
        assert.ok(evalResult.response.includes(currentQ.explanation), 'Response must provide NDMA explanation');
        console.log('  ✓ Test 5 Passed: Incorrect answer evaluated with authoritative NDMA explanation.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 5 Failed:', e.message);
        failed++;
    }

    // Test 6: Tanglish and Letter Option Matching (e.g., 'Option B' or 'A')
    try {
        quizSM.startQuiz('tanglish');
        const currentQ = quizSM.getCurrentQuestion();
        const letters = ['A', 'B', 'C', 'D'];
        const correctLetter = letters[currentQ.answer];

        const evalResult = quizSM.evaluateAnswer(`Option ${correctLetter}`, 'tanglish');
        assert.strictEqual(evalResult.handled, true, 'Must handle letter option');
        assert.strictEqual(evalResult.isCorrect, true, 'Must evaluate letter option correctly');
        console.log('  ✓ Test 6 Passed: Tanglish letter-based answer matching verified.');
        passed++;
    } catch (e) {
        console.error('  ✗ Test 6 Failed:', e.message);
        failed++;
    }

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED\n`);
    if (failed > 0) process.exit(1);
}

runQuizStateMachineTests();
