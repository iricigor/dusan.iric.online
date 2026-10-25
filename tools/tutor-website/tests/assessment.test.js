'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, legacyHistoryPolicy } = require('../assessment.js');
const { validateLesson } = require('../validate.js');
const { scoreAnswer } = require('../history.js');
const { scoreExercise, validRecords, grade } = require('../maths.js');
const { mathsLesson } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const number = value => ({ type: 'number', value });
const string = value => ({ type: 'string', value });
const range = (min, max, includeMin = true, includeMax = true) => ({ type: 'range', min, max, includeMin, includeMax });
const alternatives = (...items) => ({ type: 'array', items });
const policy = (exact, partial, input = 'number') => ({
    input, exact, ...(partial ? { partial: { match: partial, credit: .5 } } : {})
});

test('all four matcher types work independently for full and partial credit', () => {
    const matchers = [
        number('1620'), string('1620'), alternatives(number('1620'), string('1621')), range('1615', '1625')
    ];
    for (const matcher of matchers) {
        for (const input of ['number', 'text']) {
            assert.equal(evaluate(policy(matcher, undefined, input), '1620').fraction, 1);
            assert.equal(evaluate(policy(number('1700'), matcher, input), '1620').fraction, .5);
        }
    }
    const names = policy(alternatives(string('Komenský'), string('Jan Komenský')),
        alternatives(string('Amos'), string('Jan Amos')), 'text');
    for (const name of ['Komenský', 'Jan Komenský']) assert.equal(evaluate(names, name).fraction, 1);
    for (const name of ['Amos', 'Jan Amos']) assert.equal(evaluate(names, name).fraction, .5);
    for (const name of ['Jan', 'Komenský a další']) assert.equal(evaluate(names, name).fraction, 0);
    assert.equal(evaluate(names, 'komensky').fraction, 0);
    assert.equal(evaluate(policy({ ...string('Komenský'), normalization: 'czech' }, undefined, 'text'), 'KOMENSKI').fraction, 1);
});

test('1620 is full credit before overlapping 1615-1625 partial interval, including boundaries', () => {
    const expected = policy(number('1620'), range('1615', '1625'));
    for (const raw of ['1620', '1620.0', '3240/2']) assert.equal(evaluate(expected, raw).fraction, 1, raw);
    for (const raw of ['1615', '1618', '1625']) {
        const result = evaluate(expected, raw);
        assert.equal(result.fraction, .5, raw);
        assert.equal(result.status, 'partial');
        assert.equal(result.correct, false);
        assert.equal(result.valid, true);
    }
    for (const raw of ['1614', '1626']) assert.equal(evaluate(expected, raw).fraction, 0);
    for (const [includeMin, includeMax] of [[true, true], [false, true], [true, false], [false, false]]) {
        const bounded = policy(number('1700'), range('1615', '1625', includeMin, includeMax));
        assert.equal(evaluate(bounded, '1615').fraction, includeMin ? .5 : 0);
        assert.equal(evaluate(bounded, '1625').fraction, includeMax ? .5 : 0);
        assert.equal(evaluate(bounded, '1618').fraction, .5);
    }
    assert.equal(evaluate(policy(range('-1/-2', '3/4')), '0.5').fraction, 1);
    assert.equal(evaluate(policy(range('-3/4', '-1/2')), '-0.5').fraction, 1);
});

test('representation-sensitive rules preserve input while value rules allow exact equivalence', () => {
    const simplified = policy(string('1/2'), string('3/6'));
    assert.equal(evaluate(simplified, ' 1/2 ').fraction, 1);
    assert.equal(evaluate(simplified, '3/6').fraction, .5);
    for (const raw of ['0.5', '0,5', '2/4', '1 / 2']) {
        const result = evaluate(simplified, raw);
        assert.equal(result.valid, true);
        assert.equal(result.fraction, 0, raw);
    }
    for (const raw of ['1/2', '3/6', '0.5', '0,5', '0 1/2']) {
        assert.equal(evaluate(policy(number('1/2')), raw).fraction, 1, raw);
    }
    for (const raw of ['7/4', '1 3/4', '1.75', '1,75']) assert.equal(evaluate(policy(number('7/4')), raw).fraction, 1, raw);
    assert.equal(evaluate(policy(number('1/3')), '0.333333333333').fraction, 0);
    // Full credit deliberately wins even over a representation-specific partial matcher.
    assert.equal(evaluate(policy(number('1/2'), string('3/6')), '3/6').fraction, 1);
});

test('invalid answers never earn numeric or representation credit and diagnostics stay explicit', () => {
    const expected = policy(string('1/2'), alternatives(range('0', '10'), string('3/6')));
    for (const raw of ['', ' ', '1/0', '1/-0', 'NaN', 'Infinity', '1e3', '1+1', '1/2 trailing', '1 4/4',
        '01', '+1', '1,2.3', '1234567890123', '0.1234567890123', 'a'.repeat(81), null, 1620]) {
        const result = evaluate(expected, raw);
        assert.equal(result.valid, false, String(raw));
        assert.equal(result.fraction, 0);
        assert.equal(result.status, 'invalid');
        assert.ok(result.message.length > 0);
    }
    const length = { ...policy(number('1.5'), range('1', '2')), input: 'length', unit: 'm' };
    assert.equal(evaluate(length, '150 cm').fraction, 1);
    assert.equal(evaluate(length, '120 cm').fraction, .5);
    assert.equal(evaluate(length, '200 cm').fraction, .5);
    assert.equal(evaluate(length, '1.5').valid, false);
    assert.equal(evaluate(length, '1.5 kg').valid, false);
    assert.equal(evaluate(length, '3/2 m').valid, false);
});

test('both subject validators accept every matcher type in either credit category', () => {
    for (const matcher of [number('1620'), string('1620'), alternatives(number('1620'), string('1621')), range('1615', '1625')]) {
        for (const partial of [false, true]) {
            const expected = policy(partial ? number('1620') : matcher, partial ? matcher : undefined);
            const maths = mathsLesson();
            maths.exercises[2].steps[0].answer = { format: 'integer', value: '1620' };
            maths.exercises[2].steps[0].assessment = expected;
            assert.equal(validateLesson('maths', maths), maths);
            const lesson = structuredClone(history);
            lesson.questions.find(question => question.id === 'h-bitva').assessment = expected;
            assert.equal(validateLesson('history', lesson), lesson);
        }
    }
});

test('policy validation rejects missing, malformed, conflicting and unsafe declarations', () => {
    const mutations = [
        step => { delete step.assessment; },
        step => { step.assessment.exact = { type: 'number', value: '1/0' }; },
        step => { step.assessment.exact = { type: 'number', value: '1e3' }; },
        step => { step.assessment.exact = { type: 'number', value: '0,5' }; },
        step => { step.assessment.exact = string('1/0'); },
        step => { step.assessment.exact = string('x'.repeat(81)); },
        step => { step.assessment.exact = { type: 'number', value: 2 }; },
        step => { step.assessment.exact = range('4', '2'); },
        step => { step.assessment.exact = range('2', '2', false, true); },
        step => { step.assessment.exact = range('1/0', '3'); },
        step => { step.assessment.exact = range('0,5', '3'); },
        step => { step.assessment.exact = { type: 'range', min: '1', max: '3' }; },
        step => { step.assessment.exact = alternatives(); },
        step => { step.assessment.exact = alternatives(number('2'), number('2')); },
        step => { step.assessment.exact = alternatives(alternatives(number('2'))); },
        step => { step.assessment.exact = { type: 'regex', value: '.*' }; },
        step => { step.assessment.exact = { ...number('2'), script: 'alert(1)' }; },
        step => { step.assessment.partial = { match: number('1'), credit: 0 }; },
        step => { step.assessment.partial = { match: number('1'), credit: 1 }; },
        step => { step.assessment.partial = { match: number('1'), credit: .25 }; },
        step => { step.assessment.partial = { match: number('1') }; },
        step => { step.assessment.exact = number('99'); },
        step => { step.assessment.unit = 'm'; },
        step => { step.assessment.input = 'text'; },
        step => { step.assessment.input = 'length'; step.assessment.unit = 'm'; },
        step => { step.assessment.exact = alternatives(...Array.from({ length: 21 }, (_, index) => number(String(index)))); },
        step => { step.assessment.exact = { ...string('2'), normalization: 'czech' }; }
    ];
    for (const mutate of mutations) {
        const lesson = mathsLesson();
        mutate(lesson.exercises[0].steps[0]);
        assert.throws(() => validateLesson('maths', lesson), /assessment/);
    }
    const lesson = mathsLesson();
    lesson.exercises[0].steps[0].assessment.exact = range('2', '2');
    assert.equal(validateLesson('maths', lesson), lesson);
    const inconsistent = structuredClone(history);
    inconsistent.questions[0].assessment.exact = number('1');
    assert.throws(() => validateLesson('history', inconsistent), /canonical answer/);
    const legacy = mathsLesson();
    legacy.version = 2;
    assert.throws(() => validateLesson('maths', legacy), /forbidden properties/);
});

test('subject scoring uses shared partial matches without speed or accuracy bonuses', () => {
    const year = { ...history.questions.find(question => question.id === 'h-bitva') };
    assert.equal(scoreAnswer(year, '1620', 1000).total, 60);
    const partial = scoreAnswer(year, '1618', 1000);
    assert.equal(partial.total, 15);
    assert.equal(partial.bonus, 0);
    assert.equal(partial.assessment.status, 'partial');
    const exercise = mathsLesson().exercises[0];
    exercise.steps[0].answer = { format: 'fraction', numerator: '1', denominator: '2' };
    exercise.steps[0].assessment = policy(string('1/2'), string('3/6'));
    const rest = exercise.steps.slice(1).map(step => step.answer.value);
    const result = scoreExercise(exercise, ['3/6', ...rest]);
    assert.equal(result.base, 8.75);
    assert.equal(result.accuracy, 0);
    assert.equal(result.total, 8.75);
    assert.equal(result.steps[0].fraction, .5);
    assert.equal(scoreExercise(exercise, ['1/2', ...rest]).total, 11);
    assert.equal(validRecords([{ mode: 'easy', maximum: 61, total: 8.75, grade: grade(8.75, 61) }]), true);
});

test('legacy history retains strict marked-year notation and automatic less-than-ten tolerance', () => {
    const year = { type: 'text', year: true, acceptedAnswers: ['1620'] };
    const expected = legacyHistoryPolicy(year);
    assert.equal(evaluate(expected, '1620').fraction, 1);
    assert.equal(evaluate(legacyHistoryPolicy({ ...year, acceptedAnswers: ['1'] }), '0001').fraction, 1);
    for (const raw of ['1611', '1618', '1629']) assert.equal(evaluate(expected, raw).fraction, .5, raw);
    for (const raw of ['1610', '1630', '1620.0', '3240/2', '1620 trailing']) assert.equal(evaluate(expected, raw).fraction, 0, raw);
});
