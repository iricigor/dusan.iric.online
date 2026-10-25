'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../examples/defenestrace.json');
const { normalizeAnswer, shuffle, selectQuestions, scoreAnswer, grade, compareResults } = require('../app.js');

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

test('text normalization supports Czech spelling tolerance and accepted alternatives', () => {
    assert.equal(normalizeAnswer('  BÍLÝ  KŮŇ '), normalizeAnswer('bili kun'));
    const question = {
        difficulty: 'hard', type: 'text', year: false,
        acceptedAnswers: ['Fridrich Falcký', 'Falcký']
    };
    assert.equal(scoreAnswer(question, ' FALCKI ', 1000, false).base, 30);
    assert.equal(scoreAnswer(question, '<img src=x>', 1000, false).base, 0);
});

test('only marked years receive partial credit, strictly less than ten years', () => {
    const question = lesson.questions.find(q => q.id === 'h-defenestrace');
    for (const answer of ['1618', ' 1618 ']) assert.equal(scoreAnswer(question, answer, 0, false).fraction, 1);
    for (const answer of ['1609', '1627']) assert.equal(scoreAnswer(question, answer, 0, false).base, 15);
    for (const answer of ['1608', '1628', '1618foo', '1618.0', '1.618', '', '-1618', '0', 'Infinity']) {
        assert.equal(scoreAnswer(question, answer, 0, false).base, 0, answer);
    }
    const countQuestion = { ...question, year: false, acceptedAnswers: ['27'] };
    assert.equal(scoreAnswer(countQuestion, '28', 0, false).base, 0);
});

test('points follow question level and bonus requires full correctness before deadline', () => {
    const easy = lesson.questions[0];
    const medium = lesson.questions[2];
    const year = lesson.questions.find(q => q.year);
    assert.equal(scoreAnswer(easy, easy.answer, 1000, false).total, 10);
    assert.equal(scoreAnswer(medium, medium.answer, 1000, false).total, 20);
    assert.equal(scoreAnswer(year, '1618', 14999, true).total, 60);
    assert.equal(scoreAnswer(year, '1618', 15000, true).total, 30);
    assert.equal(scoreAnswer(year, '1619', 0, true).total, 15);
    assert.equal(scoreAnswer(easy, 1 - easy.answer, 0, true).total, 0);
});

test('grades use exact thresholds and leaderboard sorting breaks ties by duration', () => {
    for (const [score, expected] of [[100, 1], [80, 1], [79, 2], [60, 2], [59, 3], [40, 3], [39, 4], [20, 4], [19, 5], [0, 5]]) {
        assert.equal(grade(score, 100), expected);
    }
    const records = [{ total: 30, duration: 20 }, { total: 40, duration: 99 }, { total: 30, duration: 10 }];
    assert.deepEqual(records.sort(compareResults).map(row => row.duration), [99, 10, 20]);
});
