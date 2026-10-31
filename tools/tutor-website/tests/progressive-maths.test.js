'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateLesson } = require('../validate.js');
const { renderLesson } = require('../build.js');
const { formatAnswer, scoreExercise, maximumPoints, selectExercises, validRecords, subjectForLesson, grade } = require('../maths.js');
const { mathsLesson } = require('./fixture.js');
const maths = require('../examples/zlomky-a-prevody-delky.json');
const valuesFor = task => task.options ? [task.answer] : task.steps.map(step => formatAnswer(step.answer));

test('progressive shapes validate without reinterpreting old maths or history', () => {
    assert.equal(validateLesson('maths', maths), maths);
    for (const mutate of [
        lesson => { lesson.version = 3; },
        lesson => { lesson.subject = 'history'; },
        lesson => { lesson.exercises[0].type = 'choice'; },
        lesson => { lesson.exercises[0].options = ['Pravda', 'Nepravda']; },
        lesson => { lesson.exercises[0].answer = 2; },
        lesson => { lesson.exercises[0].assessment.exact.value = '1'; },
        lesson => { lesson.exercises[0].assessment.partial = { credit: .5, match: { type: 'number', value: '1' } }; },
        lesson => { lesson.exercises[9].options = ['čitatel', ' ČITATEL ', 'jednotka']; },
        lesson => { lesson.exercises[10].answer = 4; },
        lesson => { lesson.exercises[10].assessment.exact = { type: 'range', min: '0', max: '2', includeMin: true, includeMax: true }; },
        lesson => { lesson.exercises[15].steps.push(structuredClone(lesson.exercises[15].steps[0])); },
        lesson => { lesson.exercises[15].steps[0].answer = { format: 'length', value: '1800', unit: 'm' }; },
        lesson => { lesson.exercises[15].steps[0].assessment.input = 'text'; },
        lesson => { lesson.exercises[21].steps.length = 1; },
        lesson => { lesson.exercises[22].steps.push(structuredClone(lesson.exercises[22].steps[0])); },
        lesson => { lesson.exercises[21].type = 'choice'; },
        lesson => { lesson.exercises.filter(task => task.type === 'choice').slice(1).forEach(task => { task.difficulty = 'easy'; task.type = 'trueFalse'; task.options = ['Ano', 'Ne']; task.answer = 0; task.assessment.exact.value = '0'; }); }
    ]) {
        const lesson = structuredClone(maths);
        mutate(lesson);
        assert.throws(() => renderLesson('maths', lesson), /Invalid maths lesson/, JSON.stringify(lesson.exercises[0]));
    }
    const legacy = mathsLesson();
    assert.equal(validateLesson('maths', legacy), legacy);
    legacy.version = 4;
    assert.throws(() => validateLesson('maths', legacy), /missing type/);
});

test('every progressive quiz includes both medium formats, ordered levels and exact maxima', () => {
    for (const [mode, mix, maximum] of [['easy', [1, 2, 1], 80], ['medium', [2, 2, 2], 120], ['hard', [3, 4, 3], 200]]) {
        for (const random of [() => 0, () => .999999, Math.random]) {
            const selected = selectExercises(maths.exercises, mode, random);
            assert.deepEqual(selected.map(task => task.difficulty), ['easy', 'medium', 'hard'].flatMap((level, index) => Array(mix[index]).fill(level)));
            assert.equal(new Set(selected.map(task => task.id)).size, selected.length);
            for (const type of ['choice', 'number']) assert.equal(selected.filter(task => task.difficulty === 'medium' && task.type === type).length, mix[1] / 2);
            assert.equal(maximumPoints(selected), maximum);
            assert.equal(selected.reduce((sum, task) => sum + scoreExercise(task, valuesFor(task)).total, 0), maximum);
        }
    }
    assert.throws(() => selectExercises(maths.exercises, 'bad'), /Unknown maths quiz mode/);
    assert.throws(() => selectExercises([...maths.exercises, mathsLesson().exercises[0]], 'easy'), /Cannot mix/);
    assert.throws(() => selectExercises(maths.exercises.filter(task => task.type !== 'choice'), 'easy'), /Not enough medium choice/);
    assert.throws(() => selectExercises([...maths.exercises, maths.exercises[0]], 'easy'), /Duplicate/);
});

test('choices use indices, display exact labels and never silently parse words or symbols', () => {
    for (const task of maths.exercises.filter(task => task.options)) {
        task.options.forEach((option, index) => {
            const result = scoreExercise(task, [index]);
            assert.equal(result.total, index === task.answer ? maximumPoints([task]) : 0, `${task.id}: ${option}`);
            assert.equal(result.accuracy, 0);
        });
        for (const invalid of [undefined, -1, task.options.length, .5, '0', '=', '<>', 'čitatel']) {
            assert.equal(scoreExercise(task, [invalid]).steps[0].valid, false);
        }
    }
    const labels = maths.exercises.filter(task => task.type === 'choice').flatMap(task => task.options);
    for (const label of ['100', 'čitatel', '=', '<', '>', '<>']) assert.ok(labels.includes(label), label);
});

test('one calculation and a one-step equation check exact numerical answers without expression evaluation', () => {
    for (const [id, expected] of [['soucin-desitek', '1800'], ['jednokrokova-rovnice', '180']]) {
        const task = maths.exercises.find(task => task.id === id);
        assert.equal(task.steps.length, 1);
        for (const value of [expected, `${expected}.0`, `${expected}/1`]) assert.equal(scoreExercise(task, [value]).total, 20);
        for (const value of ['', 'x = 180', '200 - 20', '30 * 60', `${expected} m`]) assert.equal(scoreExercise(task, [value]).steps[0].valid, false);
        assert.equal(scoreExercise(task, [String(Number(expected) + 1)]).total, 0);
    }
    const conversion = maths.exercises.find(task => task.id === 'milimetry-na-centimetry');
    for (const value of ['13,5', '13.5', '27/2']) assert.equal(scoreExercise(conversion, [value]).total, 20);
    assert.equal(scoreExercise(conversion, ['13.500000000001']).total, 0);
});

test('hard tasks divide 30 points over two, three or four independent answers with explicit half credit', () => {
    for (const count of [2, 3, 4]) {
        const task = maths.exercises.find(task => task.difficulty === 'hard' && task.steps.length === count);
        for (let mask = 0; mask < 2 ** count; mask++) {
            const values = valuesFor(task).map((value, index) => mask & (1 << index) ? value : '');
            assert.equal(scoreExercise(task, values).total, values.filter(Boolean).length * 30 / count);
        }
    }
    const task = maths.exercises.find(task => task.id === 'kraceni-a-hodnota');
    assert.equal(scoreExercise(task, ['3/6', '10']).total, 22.5);
    assert.equal(scoreExercise(task, ['wrong', '10']).total, 15);
    assert.equal(scoreExercise(task, ['1/2', '10']).total, 30);
    assert.equal(scoreExercise(task, ['2/4', '10']).total, 15);
    const four = structuredClone(maths.exercises.find(task => task.steps?.length === 4));
    four.steps[0].assessment.partial = { credit: .5, match: { type: 'number', value: '2399' } };
    assert.equal(scoreExercise(four, ['2399', '', '', '']).total, 3.75);
});

test('progressive result namespaces and record checks preserve old scores and grade boundaries', () => {
    assert.equal(subjectForLesson(maths).storagePrefix, 'maths-tutor:v4');
    assert.equal(subjectForLesson(mathsLesson()).storagePrefix, 'maths-tutor:v2');
    for (const [mode, maximum] of [['easy', 80], ['medium', 120], ['hard', 200]]) {
        for (const [percent, mark] of [[80, 1], [60, 2], [40, 3], [20, 4]]) {
            const total = maximum * percent / 100;
            assert.equal(grade(total, maximum), mark);
            assert.equal(grade(total - .25, maximum), mark + 1);
            assert.equal(validRecords([{ mode, maximum, total, grade: mark }], 4), true);
        }
        const record = { mode, maximum, total: 3.75, grade: 5 };
        assert.equal(validRecords([record], 4), true);
        assert.equal(validRecords([record]), false);
        for (const patch of [{ total: -1 }, { total: maximum + 1 }, { total: 1.1 }, { grade: 1 }, { maximum: 61 }, { mode: 'bad' }]) {
            assert.equal(validRecords([{ ...record, ...patch }], 4), false);
        }
    }
    const legacy = { mode: 'easy', maximum: 61, total: 48.25, grade: 2 };
    assert.equal(validRecords([legacy]), true);
    assert.equal(validRecords([legacy], 4), false);
});
