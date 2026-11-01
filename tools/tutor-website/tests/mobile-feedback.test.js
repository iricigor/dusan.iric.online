'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateLesson } = require('../validate.js');
const { page } = require('./helpers/runtime.js');
const maths = require('../examples/zlomky-a-prevody-delky.json');
const history = require('../examples/defenestrace.json');
const { mathsLesson } = require('./fixture.js');

test('v4 learning renders the authored example count, never the quiz bank', () => {
    for (const count of [1, 4, 6, 9]) {
        const lesson = structuredClone(maths);
        delete lesson.highlights;
        lesson.examples = Array.from({ length: count }, (_, index) => ({
            ...structuredClone(maths.examples[index % maths.examples.length]),
            prompt: `${maths.examples[index % maths.examples.length].prompt} (${index + 1})`
        }));
        assert.equal(validateLesson('maths', lesson), lesson);
        const runtime = page('maths', [], lesson);
        const cards = runtime.get('learning-content').querySelectorAll('[data-learning-card]');
        assert.equal(cards.length, count);
        assert.ok(cards.every(card => card.id.startsWith('learning-example-')));
        assert.deepEqual(JSON.parse(runtime.get('lesson-data').textContent).exercises, maths.exercises);
    }
    const empty = structuredClone(maths);
    empty.examples = [];
    assert.throws(() => validateLesson('maths', empty), /examples/);
    const legacy = mathsLesson();
    legacy.examples.pop();
    assert.throws(() => validateLesson('maths', legacy), /four legacy worked examples/);
});

test('correct feedback omits redundant expected answers; incorrect feedback retains corrections', () => {
    for (const subject of ['history', 'maths']) {
        for (const correct of [true, false]) {
            const runtime = page(subject);
            runtime.start('easy');
            const prompt = runtime.get('question').textContent;
            const task = (subject === 'history' ? history.questions : maths.exercises).find(task => task.prompt === prompt);
            runtime.get('answers').children[correct ? task.answer : (task.answer + 1) % task.options.length].dispatch('click');
            const feedback = runtime.get('feedback').textContent;
            assert.match(feedback, /Tvoje odpověď:/);
            assert.equal(feedback.includes('Správná odpověď:'), !correct);
            assert.ok(feedback.includes(task.explanation));
        }
    }
});

test('numerical instructions reset collapsed and blank answers retain correction details', () => {
    const runtime = page('maths');
    runtime.start('easy');
    runtime.get('answers').children[0].dispatch('click');
    runtime.get('next').dispatch('click');
    assert.equal(runtime.get('answer-guide').hidden, true);
    runtime.get('answers').children[0].dispatch('click');
    runtime.get('next').dispatch('click');
    const task = maths.exercises.find(task => task.prompt === runtime.get('question').textContent);
    assert.equal(task.type, 'number');
    assert.equal(runtime.get('answer-guide').hidden, false);
    assert.equal(runtime.get('answer-guide').open, false);
    assert.equal(runtime.get('answers').querySelector('input').getAttribute('aria-describedby'), 'answer-help');
    runtime.get('answer-guide').open = true;
    runtime.get('answers').dispatch('submit');
    assert.match(runtime.get('feedback').textContent, /Odpověď chybí/);
    assert.match(runtime.get('feedback').textContent, /Správná odpověď:/);
    runtime.get('next').dispatch('click');
    assert.equal(runtime.get('answer-guide').open, false);
    assert.equal(runtime.get('answer-guide').hidden, false);
});
