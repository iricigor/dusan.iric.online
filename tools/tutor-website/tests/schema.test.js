'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { capabilities, renderLesson } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { schemaErrors } = require('../schema.js');
const schema = require('../lesson.schema.json');
const history = require('../examples/defenestrace.json');
const { mathsLesson } = require('./fixture.js');

test('both subjects discover one v3 contract and require shared motivational metadata', () => {
    assert.equal(capabilities('history').schemaPath, capabilities('maths').schemaPath);
    for (const [subject, source] of [['history', history], ['maths', mathsLesson()]]) {
        assert.deepEqual(schemaErrors(source, schema), []);
        for (const key of ['subject', 'language', 'subtitle']) {
            const lesson = structuredClone(source);
            delete lesson[key];
            assert.throws(() => validateLesson(subject, lesson), new RegExp(`missing ${key}`));
        }
        for (const subtitle of ['', '   ', null, 123]) {
            assert.throws(() => validateLesson(subject, { ...source, subtitle }), /subtitle/);
        }
    }
});

test('legacy history v1 and maths v2 use the same validator without inventing original material', () => {
    const legacyHistory = structuredClone(history);
    legacyHistory.version = 1;
    delete legacyHistory.subject;
    delete legacyHistory.language;
    delete legacyHistory.subtitle;
    legacyHistory.questions.forEach(question => { delete question.assessment; });
    const legacyMaths = mathsLesson();
    legacyMaths.version = 2;
    delete legacyMaths.subtitle;
    legacyMaths.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
    for (const [subject, lesson] of [['history', legacyHistory], ['maths', legacyMaths]]) {
        const before = JSON.stringify(lesson);
        assert.equal(validateLesson(subject, lesson), lesson);
        assert.deepEqual(schemaErrors(lesson, schema), []);
        assert.match(renderLesson(subject, lesson), /Každým krokem objevíš/);
        assert.equal(JSON.stringify(lesson), before);
        const withoutOriginal = { ...lesson };
        delete withoutOriginal.original;
        assert.throws(() => validateLesson(subject, withoutOriginal), /missing original/);
    }
    assert.throws(() => validateLesson('history', legacyMaths), /expected history/);
    assert.throws(() => validateLesson('maths', legacyHistory), /expected maths/);
    assert.throws(() => schemaErrors({}, { $ref: './lesson.schema.json' }), /Unsupported schema reference/);
});

test('semantic paragraphs are shared, plain-text only and reject arbitrary styling fields', () => {
    for (const [subject, source, sectionKey] of [['history', history, 'chunks'], ['maths', mathsLesson(), 'examples']]) {
        for (const style of ['plain', 'note', 'example', 'tip', 'warning']) {
            const lesson = structuredClone(source);
            const original = lesson.original[0].text;
            lesson.original[0].style = style;
            lesson[sectionKey][0].paragraphs = [{ style, text: '</script><img src=x onerror=alert(1)>' }];
            assert.equal(validateLesson(subject, lesson), lesson);
            const html = renderLesson(subject, lesson);
            assert.ok(!html.includes('</script><img src=x'));
            assert.equal(lesson.original[0].text, original);
        }
        for (const block of [
            { style: 'unknown', text: 'Text' }, { style: 'note', text: '' },
            { style: 'note', text: 'Text', className: 'injected' }, { text: 'Text' }
        ]) {
            const lesson = structuredClone(source);
            lesson[sectionKey][0].paragraphs = [block];
            assert.throws(() => validateLesson(subject, lesson), /paragraphs/);
        }
        const lesson = structuredClone(source);
        lesson.original[0].style = 'note" onclick="alert(1)';
        assert.throws(() => validateLesson(subject, lesson), /style/);
    }
});
