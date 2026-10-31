'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { targets, authored, validRange, replaceRange } = require('../highlights.js');
const { validateLesson } = require('../validate.js');
const { renderLesson, capabilities } = require('../build.js');
const history = require('../examples/defenestrace.json');
const maths = require('../examples/zlomky-a-prevody-delky.json');
const { mathsLesson } = require('./fixture.js');

test('history example explains monarchs and records verified accession events without rewriting source', () => {
    for (const [name, year, chunk, birth, death, father] of [
        ['Rudolf II.', 1575, 0, 1552, 1612, 'Maxmilián II.'],
        ['Matyáš', 1611, 0, 1557, 1619, 'Maxmilián II.'],
        ['Ferdinand II.', 1617, 0, 1578, 1637, 'Karel II.'],
        ['Fridrich V.', 1619, 2, 1596, 1632, 'Fridrich IV.']
    ]) {
        const event = history.timeline.find(event => event.year === year && event.label.includes(name));
        assert.ok(event, name);
        assert.equal(event.chunk, chunk);
        assert.deepEqual(event.lifespan, { birth, death });
        const content = [...history.chunks[chunk].sentences,
            ...(history.chunks[chunk].paragraphs || []).map(paragraph => paragraph.text)].join(' ');
        assert.ok(content.includes(name), name);
        const glossary = history.glossary.find(entry => [entry.term, ...entry.forms].some(form => form.includes(name)));
        assert.ok(glossary.definition.includes(`${birth}–${death}`), name);
        assert.ok(glossary.definition.includes(father), name);
    }
    assert.ok(history.timeline.every(event => !event.label.startsWith(String(event.year))));
    assert.ok(history.timeline.some(event => event.year === 1620 && event.label.includes('obnovuje vládu')));
});

test('the opening history card is a short overview with biographies available in the glossary', () => {
    const chunk = history.chunks[0];
    const text = [...chunk.sentences, ...chunk.paragraphs.map(paragraph => paragraph.text)].join(' ');
    assert.equal(chunk.paragraphs.length, 3);
    assert.ok(text.split(/\s+/).length <= 75, 'keep the visible overview short for ten-year-olds');
    assert.doesNotMatch(text, /\d{4}|Maxmilián|Karel II\./, 'dates and family-tree detail stay in the glossary and timeline');
    assert.ok(text.includes('mladší bratr Matyáš'));
    assert.ok(text.includes('Vídni') && text.includes('úředníci'));
    assert.ok(text.includes('katolickou víru') && text.includes('české šlechty'));
});

test('authored highlights are optional for both subjects and all supported versions', () => {
    for (const [subject, source, versions] of [['history', history, [1, 3]], ['maths', mathsLesson(), [2, 3]], ['maths', maths, [4]]]) {
        for (const version of versions) {
            const lesson = structuredClone(source);
            lesson.version = version;
            if (version === 1) delete lesson.subject;
            if (version < 3) {
                if (subject === 'history') lesson.questions.forEach(question => { delete question.assessment; });
                else lesson.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
            }
            const before = JSON.stringify(lesson);
            validateLesson(subject, lesson);
            const html = renderLesson(subject, lesson);
            assert.equal(JSON.stringify(lesson), before);
            assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), lesson);
            for (const highlights of [undefined, []]) {
                if (highlights) lesson.highlights = highlights;
                else delete lesson.highlights;
                validateLesson(subject, lesson);
                renderLesson(subject, lesson);
            }
        }
    }
});

test('discovery exposes shared highlighting and history-only optional timeline', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        assert.deepEqual(result.inlineHighlighting, { colors: ['yellow', 'blue', 'green'],
            tabs: ['original', 'learning'], childStorage: 'tab-session-including-reloads' });
        assert.equal(result.optionalTimeline, subject === 'history');
    }
});

test('authored targets cover source sections and learning text without exposing quiz or metadata', () => {
    const original = targets(history);
    assert.equal(original.get('original.6.text'), history.original[6].text);
    assert.equal(original.get('chunks.1.sentences'), history.chunks[1].sentences.join(' '));
    assert.equal(original.get('chunks.1.paragraphs.0.text'), history.chunks[1].paragraphs[0].text);
    const learning = targets(maths);
    for (const target of ['examples.0.prompt', 'examples.0.hint', 'examples.0.answer',
        'examples.0.steps.0.calculation', 'examples.0.steps.0.explanation',
        'examples.0.paragraphs.0.text', 'exercises.0.prompt', 'exercises.0.explanation',
        'exercises.0.hint', 'exercises.0.solution',
        'exercises.15.steps.0.prompt', 'exercises.15.steps.0.hint', 'exercises.15.steps.0.solution']) {
        assert.equal(typeof learning.get(target), 'string', target);
    }
    assert.equal(original.has('questions.0.prompt'), false);
    assert.equal(original.has('glossary.0.definition'), false);
    assert.equal(learning.has('exercises.0.options'), false);
    assert.equal(learning.has('exercises.0.assessment'), false);
    assert.deepEqual(authored(history).errors, []);
    assert.deepEqual(authored(maths).errors, []);
});

test('invalid, ambiguous, overlapping and unsafe authored highlight data fails explicitly', () => {
    for (const [subject, source] of [['history', history], ['maths', maths]]) {
        const target = 'original.0.text';
        const quote = source.original[0].text.slice(0, 10);
        for (const highlights of [
            null, [{ target, quote, color: 'purple' }], [{ target, quote: '', color: 'yellow' }],
            [{ target, quote, color: 'yellow', css: 'background:red' }],
            [{ target: 'topic', quote: source.topic, color: 'yellow' }],
            [{ target, quote: 'Missing passage', color: 'yellow' }],
            [{ target, quote, color: 'yellow' }, { target, quote, color: 'blue' }]
        ]) assert.throws(() => validateLesson(subject, { ...source, highlights }), /highlights/);
        const repeated = structuredClone(source);
        repeated.original[0].text = 'Stejné. Stejné.';
        repeated.highlights = [{ target, quote: 'Stejné', color: 'yellow' }];
        assert.throws(() => validateLesson(subject, repeated), /exactly one/);
    }
});

test('range replacement splits overlaps, merges neighbors and removal masks authored colors', () => {
    const initial = [{ start: 0, end: 10, color: 'yellow' }];
    const blue = replaceRange(initial, { start: 3, end: 7, color: 'blue' });
    assert.deepEqual(blue, [
        { start: 0, end: 3, color: 'yellow' }, { start: 3, end: 7, color: 'blue' },
        { start: 7, end: 10, color: 'yellow' }
    ]);
    assert.deepEqual(initial, [{ start: 0, end: 10, color: 'yellow' }]);
    assert.deepEqual(replaceRange(blue, { start: 0, end: 7, color: 'yellow' }), initial);
    assert.deepEqual(replaceRange(initial, { start: 0, end: 10, color: null }),
        [{ start: 0, end: 10, color: null }]);
    assert.deepEqual(replaceRange(blue, { start: 0, end: 20, color: 'green' }),
        [{ start: 0, end: 20, color: 'green' }]);
});

test('ranges use UTF-16 source offsets but never split an emoji or accept invalid bounds', () => {
    const text = 'A🏰B';
    assert.equal(validRange({ start: 1, end: 3, color: 'yellow' }, text), true);
    for (const range of [
        { start: 1, end: 2, color: 'yellow' }, { start: 2, end: 3, color: 'yellow' },
        { start: -1, end: 3, color: 'yellow' }, { start: 0, end: 20, color: 'yellow' },
        { start: 1.5, end: 3, color: 'yellow' }, { start: 3, end: 1, color: 'yellow' },
        { start: 1, end: 1, color: 'yellow' }, { start: 1, end: 3, color: 'injected' }
    ]) assert.equal(validRange(range, text), false);
    assert.equal(validRange({ start: 1, end: 3, color: null }, text), false);
    assert.equal(validRange({ start: 1, end: 3, color: null }, text, true), true);
});

test('optional timeline accepts old lessons, duplicate event years, and ordered lifespans', () => {
    for (const timeline of [undefined, [], [
        { chunk: 0, year: 1740, label: 'Marie Terezie', lifespan: { birth: 1717, death: 1780 } },
        { chunk: 1, year: 1740, label: 'Další událost' }
    ]]) {
        const lesson = structuredClone(history);
        if (timeline === undefined) delete lesson.timeline;
        else lesson.timeline = timeline;
        validateLesson('history', lesson);
        renderLesson('history', lesson);
    }
    for (const event of [
        { chunk: 99, year: 1740, label: 'Událost' }, { chunk: -1, year: 1740, label: 'Událost' },
        { chunk: 0, year: 0, label: 'Událost' }, { chunk: 0, year: 1740.5, label: 'Událost' },
        { chunk: 0, year: 1740, label: '' }, { chunk: 0, year: 1740, label: 'Událost', html: '<b>' },
        { chunk: 0, year: 1740, label: 'Událost', lifespan: { birth: 1780, death: 1717 } },
        { chunk: 0, year: 1740, label: 'Událost', lifespan: { birth: 1740, death: 1740 } },
        { chunk: 0, year: 1740, label: 'Událost', lifespan: { birth: 1741, death: 1780 } }
    ]) assert.throws(() => validateLesson('history', { ...history, timeline: [event] }), /timeline/);
    assert.throws(() => validateLesson('maths', { ...maths, timeline: [] }), /forbidden/);
});
