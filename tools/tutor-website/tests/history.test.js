'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../examples/defenestrace.json');
const { normalizeAnswer, shuffle, selectQuestions, scoreAnswer: assessAnswer, grade, compareResults } = require('../history.js');
const scoreAnswer = (...args) => {
    const { assessment, ...score } = assessAnswer(...args);
    return score;
};

test('all modes have exact counts, unique questions and hard always includes a year', () => {
    const pool = [
        ...lesson.questions,
        ...Array.from({ length: 10 }, (_, index) => ({
            ...lesson.questions.find(q => q.difficulty === 'hard' && !q.year),
            id: `additional-${index}`
        }))
    ];
    for (let run = 0; run < 100; run++) {
        for (const [mode, counts] of Object.entries({ easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] })) {
            const selected = selectQuestions(pool, mode);
            assert.deepEqual(['easy', 'medium', 'hard'].map(level => selected.filter(q => q.difficulty === level).length), counts);
            assert.equal(new Set(selected.map(q => q.id)).size, selected.length);
            assert.deepEqual(selected.map(q => q.difficulty), ['easy', 'medium', 'hard'].flatMap((level, index) => Array(counts[index]).fill(level)));
            if (mode === 'hard') assert.ok(selected.some(q => q.year));
        }
    }
    assert.throws(() => selectQuestions([], 'easy'), /Not enough/);
    assert.throws(() => selectQuestions(pool.filter(q => !q.year), 'hard'), /year question/);
    assert.throws(() => selectQuestions(pool, 'unknown'), /Unknown/);
    const originalOrder = lesson.questions.map(q => q.id);
    assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1]);
    assert.deepEqual(lesson.questions.map(q => q.id), originalOrder);
});

test('default partial-year prompts describe actual tolerance without exposing accepted years', () => {
    const questions = lesson.questions.filter(question => question.year && question.assessment.partial);
    assert.equal(questions.length, 2);
    for (const question of questions) {
        const exact = Number(question.assessment.exact.value);
        const range = question.assessment.partial.match;
        const tolerance = exact - Number(range.min);
        assert.equal(Number(range.max) - exact, tolerance);
        assert.equal(range.includeMin, true);
        assert.equal(range.includeMax, true);
        assert.match(question.prompt, new RegExp(`odchylkou nejvýše ${tolerance} (let|roky)`));
        assert.doesNotMatch(question.prompt, /\b\d{4}\b/);
        assert.equal(scoreAnswer(question, String(exact), 20000).fraction, 1);
        for (const year of [range.min, range.max]) {
            assert.equal(scoreAnswer(question, year, 20000).fraction, .5);
        }
        for (const year of [Number(range.min) - 1, Number(range.max) + 1]) {
            assert.equal(scoreAnswer(question, String(year), 20000).fraction, 0);
        }
    }
});

test('text normalization supports Czech spelling tolerance and accepted alternatives', () => {
    assert.equal(normalizeAnswer('  BÍLÝ  KŮŇ '), normalizeAnswer('bili kun'));
    const question = {
        difficulty: 'hard', type: 'text', year: false,
        acceptedAnswers: ['Fridrich Falcký', 'Falcký']
    };
    assert.equal(scoreAnswer(question, ' FALCKI ', 1000).base, 30);
    assert.equal(scoreAnswer(question, '<img src=x>', 1000).base, 0);
    const name = { ...question, acceptedAnswers: ['Komenský', 'Jan Komenský', 'Jan Amos Komenský'] };
    for (const answer of ['Komensky', 'Jan Komensky', 'Jan Amos Komenský']) {
        assert.equal(scoreAnswer(name, answer, 1000).fraction, 1, answer);
    }
    assert.equal(scoreAnswer(name, 'Jan', 1000).fraction, 0);
});

test('legacy marked years retain strict notation and less-than-ten partial credit', () => {
    const question = { ...lesson.questions.find(q => q.id === 'h-defenestrace'), assessment: undefined };
    for (const answer of ['1618', ' 1618 ']) assert.equal(scoreAnswer(question, answer, 0).fraction, 1);
    for (const answer of ['1609', '1627']) assert.equal(scoreAnswer(question, answer, 0).base, 15);
    for (const answer of ['1608', '1628', '1618foo', '1618.0', '1.618', '', '-1618', '0', 'Infinity']) {
        assert.equal(scoreAnswer(question, answer, 0).base, 0, answer);
    }
    const countQuestion = { ...question, assessment: undefined, year: false, acceptedAnswers: ['27'] };
    assert.equal(scoreAnswer(countQuestion, '28', 0).base, 0);
});

test('points follow question level and bonus requires full correctness before deadline', () => {
    for (const [difficulty, base] of [['easy', 10], ['medium', 20], ['hard', 30]]) {
        const question = lesson.questions.find(q => q.difficulty === difficulty);
        const answer = question.type === 'text' ? question.acceptedAnswers[0] : question.answer;
        for (const elapsed of [0, 1000, 14999, 14999.999]) {
            assert.deepEqual(scoreAnswer(question, answer, elapsed), { fraction: 1, base, bonus: base, total: 2 * base });
        }
        for (const elapsed of [15000, 15001, 60000, -1, NaN, Infinity]) {
            assert.deepEqual(scoreAnswer(question, answer, elapsed), { fraction: 1, base, bonus: 0, total: base });
        }
        const wrong = question.type === 'text' ? 'wrong' : (question.answer + 1) % question.options.length;
        for (const elapsed of [0, 14999, 15000, 60000]) {
            assert.deepEqual(scoreAnswer(question, wrong, elapsed), { fraction: 0, base: 0, bonus: 0, total: 0 });
        }
    }
    const year = lesson.questions.find(q => q.year);
    for (const elapsed of [0, 14999, 15000, 60000]) {
        assert.deepEqual(scoreAnswer(year, '1619', elapsed), { fraction: 0.5, base: 15, bonus: 0, total: 15 });
    }
});

test('grades use exact thresholds and leaderboard sorting breaks ties by duration', () => {
    for (const [score, expected] of [[100, 1], [80, 1], [79, 2], [60, 2], [59, 3], [40, 3], [39, 4], [20, 4], [19, 5], [0, 5]]) {
        assert.equal(grade(score, 100), expected);
    }
    const records = [{ total: 30, duration: 20 }, { total: 40, duration: 99 }, { total: 30, duration: 10 }];
    assert.deepEqual(records.sort(compareResults).map(row => row.duration), [99, 10, 20]);
    const precise = [
        { total: 30, duration: 10, answerDurationMs: 10400 },
        { total: 30, duration: 10, answerDurationMs: 10001 },
        { total: 30, duration: 10 }
    ];
    assert.deepEqual(precise.sort(compareResults).map(row => row.answerDurationMs), [undefined, 10001, 10400]);
});
