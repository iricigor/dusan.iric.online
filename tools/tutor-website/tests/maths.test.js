'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkAnswer: checkMathsAnswer, selectExercises, scoreExercise, maximumPoints, grade, validRecords } = require('../maths.js');
const { mathsLesson, valueAssessment } = require('./fixture.js');
const checkAnswer = (expected, raw) => checkMathsAnswer(expected, raw, valueAssessment(expected));

test('integers are exact, bounded and never use history spelling or year tolerance', () => {
    const expected = { format: 'integer', value: '-12' };
    assert.equal(checkAnswer(expected, ' \t-12\n').correct, true);
    for (const raw of ['-11', '-13', '12']) {
        assert.equal(checkAnswer(expected, raw).correct, false);
        assert.equal(checkAnswer(expected, raw).valid, true);
    }
    for (const raw of ['-12.0', '-12/1']) assert.equal(checkAnswer(expected, raw).correct, true, raw);
    for (const raw of ['', ' ', '+12', '-012', '1e1', '12 m', 'dvanáct', '1 000',
        '−12', '--12', 'NaN', 'Infinity', '12 + 0', '1234567890123', '0'.repeat(81)]) {
        assert.equal(checkAnswer(expected, raw).valid, false, raw);
    }
    assert.equal(checkAnswer({ format: 'integer', value: '999999999999' }, '999999999999').correct, true);
    assert.equal(checkAnswer({ format: 'integer', value: '0' }, '-0').correct, true);
});

test('equivalent fractions compare exact cross products with either denominator sign', () => {
    const half = { format: 'fraction', numerator: '2', denominator: '4' };
    for (const raw of ['1/2', '50/100', ' 2 / 4 ', '-1/-2', '499999999999/999999999998']) {
        assert.equal(checkAnswer(half, raw).correct, true, raw);
    }
    assert.equal(checkAnswer({ format: 'fraction', numerator: '-1', denominator: '2' }, '1/-2').correct, true);
    assert.equal(checkAnswer({ format: 'fraction', numerator: '0', denominator: '12' }, '0/-5').correct, true);
    assert.equal(checkAnswer(half, '499999999998/999999999998').correct, false);
    for (const raw of ['0.5', '0,5']) assert.equal(checkAnswer(half, raw).correct, true, raw);
    for (const raw of ['1/0', '1/-0', '1/2/3', '1.0/2', '+1/2', '01/2', '1/2 kg', '/2', '1/',
        '1/1234567890123']) {
        assert.equal(checkAnswer(half, raw).valid, false, raw);
    }
    assert.match(checkAnswer(half, '1/0').message, /Jmenovatel/);
});

test('decimals accept comma or point but no approximations, expressions or ambiguous separators', () => {
    const expected = { format: 'decimal', value: '-0.125' };
    for (const raw of ['-0,125', '-0.125', '-0.125000000000', '-1/8']) {
        assert.equal(checkAnswer(expected, raw).correct, true, raw);
    }
    assert.equal(checkAnswer({ format: 'decimal', value: '12.000' }, '12').correct, true);
    assert.equal(checkAnswer({ format: 'decimal', value: '999999999999.999999999999' }, '999999999999,999999999999').correct, true);
    assert.equal(checkAnswer({ format: 'decimal', value: '999999999999.999999999999' }, '999999999999,999999999998').correct, false);
    assert.equal(checkAnswer({ format: 'fraction', numerator: '1', denominator: '3' }, '0.333333333333').correct, false);
    assert.equal(checkAnswer({ format: 'decimal', value: '0.333333333333' }, '0.333333333334').correct, false);
    for (const raw of ['1,000.5', '1.000,5', '1,2,3', '1 000,5', '.125', '0.', '0,', '+0.125', '00.125',
        '1e-3', '-0.125 m', '0.1234567890123', '0x10', 'Math.PI', '1+2']) {
        assert.equal(checkAnswer(expected, raw).valid, false, raw);
    }
});

test('lengths require explicit supported units and exact conversions, never dimension guessing', () => {
    const expected = { format: 'length', value: '1.5', unit: 'm' };
    for (const raw of ['1,5 m', '1.5m', '150 cm', '15 dm', '1500 mm', '0.0015 km', ' 150cm ']) {
        assert.equal(checkAnswer(expected, raw).correct, true, raw);
    }
    for (const unit of ['mm', 'cm', 'dm', 'm', 'km']) {
        assert.equal(checkAnswer({ format: 'length', value: '1', unit }, `1 ${unit}`).correct, true);
        assert.equal(checkAnswer({ format: 'length', value: '0', unit }, '0 km').correct, true);
    }
    for (const raw of ['1.5', '150', '1,5 kg', '1,5 M', '1.5 mm2', '-1.5 m', '3/2 m', '1 m 50 cm', '1,5m text', '1,5.0 m']) {
        assert.equal(checkAnswer(expected, raw).valid, false, raw);
    }
    assert.match(checkAnswer(expected, '1,5').message, /Doplň jednotku/);
    assert.match(checkAnswer(expected, '1,5 kg').message, /jednotkou/);
    assert.equal(checkAnswer(expected, '1.5 cm').valid, true);
    assert.equal(checkAnswer(expected, '1.5 cm').correct, false);
    assert.equal(checkAnswer(expected, '0.001500000001 km').correct, false);
    assert.equal(checkAnswer({ format: 'length', value: '999999999999.999999999999', unit: 'km' },
        '999999999999.999999999998 km').correct, false);
    assert.throws(() => checkMathsAnswer({ format: 'algebra' }, 'x'), /Unsupported maths answer format/);
});

test('all numeric formats accept exactly equivalent mixed, fractional and decimal answers', () => {
    const sevenFourths = [
        { format: 'fraction', numerator: '7', denominator: '4' },
        { format: 'decimal', value: '1.75' }
    ];
    for (const expected of sevenFourths) {
        for (const raw of ['7/4', '14/8', '1 3/4', '1 6/8', '1.75', '1,75']) {
            assert.equal(checkAnswer(expected, raw).correct, true, raw);
        }
        for (const raw of ['1 4/4', '1 -3/4', '1 3/-4', '1 3/0', '01 3/4', '1 03/4', '1 3/04',
            '1 1234567890123/4', '1234567890123 1/2', '1 1/1234567890123']) {
            assert.equal(checkAnswer(expected, raw).valid, false, raw);
        }
        for (const raw of ['1 1/4', '-1 3/4', '1.750000000001']) {
            assert.equal(checkAnswer(expected, raw).correct, false, raw);
        }
    }
    for (const raw of ['-1 3/4', '-7/4', '-1,75', '7/-4']) {
        assert.equal(checkAnswer({ format: 'fraction', numerator: '-7', denominator: '4' }, raw).correct, true, raw);
    }
    assert.equal(checkAnswer({ format: 'decimal', value: '-0.5' }, '-0 1/2').correct, true);
    for (const raw of ['3', '3.0', '6/2']) {
        assert.equal(checkAnswer({ format: 'integer', value: '3' }, raw).correct, true);
    }
    for (const expected of [{ format: 'decimal', value: '0.5' }, { format: 'fraction', numerator: '1', denominator: '2' }]) {
        for (const raw of ['0.5', '0,5', '1/2', '2/4']) assert.equal(checkAnswer(expected, raw).correct, true);
    }
});

test('all easy correctness combinations award 2.5 independently and exactly one all-correct point', () => {
    const exercise = mathsLesson().exercises[0];
    for (let mask = 0; mask < 16; mask++) {
        const values = exercise.steps.map((step, index) => mask & (1 << index) ? step.answer.value : '0');
        const score = scoreExercise(exercise, values);
        const count = values.filter(value => value !== '0').length;
        assert.equal(score.base, count * 2.5);
        assert.equal(score.accuracy, count === 4 ? 1 : 0);
        assert.equal(score.total, count * 2.5 + (count === 4 ? 1 : 0));
        assert.deepEqual(score.steps.map(step => step.correct), values.map(value => value !== '0'));
    }
    assert.equal(scoreExercise(exercise, ['bad', '', exercise.steps[2].answer.value]).total, 2.5);
});

test('medium is 20 and all hard correctness combinations earn 10 per independently correct step', () => {
    const lesson = mathsLesson();
    const medium = lesson.exercises[2];
    assert.equal(scoreExercise(medium, [medium.steps[0].answer.value]).total, 20);
    assert.equal(scoreExercise(medium, ['']).total, 0);
    const hard = lesson.exercises[7];
    for (let mask = 0; mask < 8; mask++) {
        const values = hard.steps.map((step, index) => mask & (1 << index) ? step.answer.value : '0');
        const score = scoreExercise(hard, values);
        assert.equal(score.total, values.filter(value => value !== '0').length * 10);
        assert.equal(score.accuracy, 0);
    }
});

test('every quiz mode has its exact mix, no duplicate tasks and the true accuracy-inclusive maximum', () => {
    const lesson = mathsLesson();
    for (const [mode, mix, maximum] of [['easy', [1, 1, 1], 61], ['medium', [1, 2, 2], 111], ['hard', [2, 5, 3], 212]]) {
        for (const random of [() => 0, () => .999999, Math.random]) {
            const selected = selectExercises(lesson.exercises, mode, random);
            assert.deepEqual(['easy', 'medium', 'hard'].map(level => selected.filter(task => task.difficulty === level).length), mix);
            assert.equal(new Set(selected.map(task => task.id)).size, selected.length);
            assert.deepEqual(selected.map(task => task.difficulty), ['easy', 'medium', 'hard'].flatMap((level, index) => Array(mix[index]).fill(level)));
            assert.equal(maximumPoints(selected), maximum);
            const total = selected.reduce((sum, task) => sum + scoreExercise(task, task.steps.map(step => step.answer.value)).total, 0);
            assert.equal(total, maximum);
            assert.equal(grade(total, maximum), 1);
        }
    }
    assert.throws(() => selectExercises(lesson.exercises, 'unknown'), /Unknown maths quiz mode/);
    assert.throws(() => selectExercises(lesson.exercises.slice(1), 'hard'), /Not enough easy/);
    assert.throws(() => selectExercises([...lesson.exercises, lesson.exercises[0]], 'easy'), /Duplicate/);
});

test('grades use exact 80/60/40/20 boundaries and attainable half-point scores for each mode', () => {
    for (const maximum of [61, 111, 212]) {
        for (const [percentage, expected] of [[80, 1], [60, 2], [40, 3], [20, 4]]) {
            const boundary = maximum * percentage / 100;
            assert.equal(grade(boundary, maximum), expected);
            assert.equal(grade(boundary - .000001, maximum), expected + 1);
            const attainable = Math.ceil(boundary * 2) / 2;
            assert.equal(grade(attainable, maximum), expected);
            assert.equal(grade(attainable - .5, maximum), expected + 1);
        }
        assert.equal(grade(0, maximum), 5);
        assert.equal(grade(maximum, maximum), 1);
    }
    // 48/60 would be grade 1 if the easy accuracy point were wrongly excluded.
    assert.equal(grade(48, 61), 2);
});

test('session records are bounded to real modes, exact maxima, quarter-points and matching grades', () => {
    const record = { mode: 'easy', total: 48, maximum: 61, grade: 2 };
    assert.equal(validRecords([]), true);
    assert.equal(validRecords([record]), true);
    assert.equal(validRecords([{ ...record, total: 48.25 }]), true);
    for (const patch of [{ mode: 'other' }, { total: -1 }, { total: 62 }, { total: Infinity },
        { total: 48.1 }, { maximum: 60 }, { grade: 1 }]) {
        assert.equal(validRecords([{ ...record, ...patch }]), false);
    }
    for (const value of [null, {}, [null], [1]]) assert.equal(validRecords(value), false);
});

test('legacy maths keeps notation restrictions and has no implicit partial matcher', () => {
    for (const [answer, accepted, invalid] of [
        [{ format: 'integer', value: '3' }, ['3'], ['3.0', '6/2', '3 m']],
        [{ format: 'fraction', numerator: '1', denominator: '2' }, ['1/2', '3/6', '-1/-2'], ['0.5', '0,5', '0 1/2']],
        [{ format: 'decimal', value: '1.5' }, ['1.5', '1,5'], ['3/2', '1 1/2']]
    ]) {
        for (const raw of accepted) assert.equal(checkMathsAnswer(answer, raw).fraction, 1, raw);
        for (const raw of invalid) assert.equal(checkMathsAnswer(answer, raw).valid, false, raw);
        assert.equal(checkMathsAnswer(answer, '2').fraction, 0);
    }
});
