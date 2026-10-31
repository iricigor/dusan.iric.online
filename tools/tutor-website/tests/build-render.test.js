'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderLesson } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { mathsLesson, valueAssessment } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const { formatAnswer } = require('../maths.js');

test('maths accepts all agreed typed answers without evaluating or converting them', () => {
    for (const answer of [
        { format: 'integer', value: '-23' },
        { format: 'fraction', numerator: '2', denominator: '4' },
        { format: 'decimal', value: '0.125' },
        ...['mm', 'cm', 'dm', 'm', 'km'].map(unit => ({ format: 'length', value: '1.5', unit }))
    ]) {
        const lesson = mathsLesson();
        lesson.exercises[0].steps[0].answer = answer;
        lesson.exercises[0].steps[0].assessment = valueAssessment(answer);
        assert.equal(validateLesson('maths', lesson), lesson);
    }
});

test('maths displays exact expected values with Czech decimal commas and explicit units', () => {
    assert.equal(formatAnswer({ format: 'integer', value: '-12' }), '-12');
    assert.equal(formatAnswer({ format: 'fraction', numerator: '2', denominator: '4' }), '2/4');
    assert.equal(formatAnswer({ format: 'decimal', value: '0.125' }), '0,125');
    assert.equal(formatAnswer({ format: 'length', value: '1.5', unit: 'm' }), '1,5 m');
});

test('maths rejects invalid structures with actionable locations before rendering', () => {
    const mutations = [
        lesson => { lesson.version = 1; },
        lesson => { lesson.subject = 'history'; },
        lesson => { lesson.language = 'en'; },
        lesson => { lesson.topic = ' '; },
        lesson => { lesson.original = []; },
        lesson => { delete lesson.original; },
        lesson => { lesson.original[0].text = ''; },
        lesson => { lesson.original[0].unexpected = true; },
        lesson => { lesson.timer = true; },
        lesson => { lesson.examples.reverse(); },
        lesson => { lesson.examples[0].hint = ''; },
        lesson => { lesson.examples[0].steps = []; },
        lesson => { lesson.exercises.pop(); },
        lesson => { lesson.exercises[1] = { ...lesson.exercises[2], id: 'jina-uloha', prompt: 'Jiná úloha.' }; },
        lesson => { lesson.exercises[0].steps.pop(); },
        lesson => { lesson.exercises[2].steps.push(lesson.exercises[2].steps[0]); },
        lesson => { lesson.exercises[7].steps.pop(); },
        lesson => { lesson.exercises[1].id = lesson.exercises[0].id; },
        lesson => { lesson.exercises[1].prompt = lesson.exercises[0].prompt.toUpperCase(); },
        lesson => { lesson.glossary.push({ term: 'JINÁ', definition: 'Popis.', forms: ['jednotka'] }); },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'integer', value: '1.5' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'fraction', numerator: '1', denominator: '0' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'decimal', value: '1,5' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'decimal', value: 'NaN' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'decimal', value: '1e3' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'decimal', value: '1234567890123' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'length', value: '1' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'length', value: '-1', unit: 'm' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'length', value: '1', unit: 'kg' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'integer', value: '1', unit: 'm' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'fraction', numerator: '1', denominator: '2', value: '0.5' }; },
        lesson => { lesson.exercises[0].steps[0].answer = { format: 'algebra', value: 'x+1' }; }
    ];
    for (const mutate of mutations) {
        const lesson = mathsLesson();
        mutate(lesson);
        assert.throws(() => renderLesson('maths', lesson), /Invalid maths lesson:\n\$[.:]/);
    }
    assert.throws(() => validateLesson('maths', null), /\$: expected object/);
});

test('maths standalone output is inert, Czech and contains real assessment without history timing', () => {
    const lesson = mathsLesson();
    const hostile = '</script><script>alert(1)</script><img src=x onerror=alert(1)>';
    lesson.topic += hostile;
    lesson.examples[0].prompt += hostile;
    const html = renderLesson('maths', lesson);
    assert.match(html, /<html lang="cs">/);
    assert.ok(!html.includes(hostile));
    assert.match(html, /&lt;\/script&gt;/);
    assert.equal((html.match(/<script(?:\s|>)/gi) || []).length, 2);
    assert.doesNotMatch(html, /<script[^>]+src=|<img[^>]+src="(?!data:image\/svg\+xml,)|<link[^>]+href="(?!data:)|\b(?:fetch|XMLHttpRequest|eval)\s*\(|id="bonus"/i);
    assert.match(html, /speedBonus: false/);
    assert.doesNotMatch(html, /zatím nejsou dostupné|@@(?:DATA|STYLES|APP)@@/);
    assert.match(html, /data-mode="hard"/);
    assert.match(html, /id="results"/);
    assert.match(html, /sessionStorage/);
    assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), lesson);
});

test('both subjects embed the selected full-height Rounded satin simple favicon', () => {
    const selected = fs.readFileSync(path.join(__dirname, '..', 'design-proposals', 'issue-52', 'rounded-simple.svg'), 'utf8');
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'favicon.svg'), 'utf8'), selected);
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const html = renderLesson(subject, lesson);
        const icon = html.match(/<link rel="icon" type="image\/svg\+xml" sizes="any" href="data:image\/svg\+xml,([^"]+)">/);
        assert.ok(icon);
        const svg = decodeURIComponent(icon[1]);
        assert.equal(svg, selected);
        assert.match(svg, /viewBox="0 0 32 32"/);
        for (const color of ['#1e3c72', '#000', '#f1f5f9']) assert.ok(svg.includes(color));
        assert.doesNotMatch(svg, /<(?:script|image|text|linearGradient|radialGradient|filter)|href=/i);
        assert.equal((html.match(/<link /g) || []).length, 1);
    }
});

test('both subjects embed approved decorative header and fancy footer marks offline', () => {
    const simple = fs.readFileSync(path.join(__dirname, '..', 'favicon.svg'), 'utf8');
    const fancy = fs.readFileSync(path.join(__dirname, '..', 'design-proposals', 'issue-52', 'rounded-fancy.svg'), 'utf8');
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const html = renderLesson(subject, lesson);
        const images = [...html.matchAll(/<img class="([^"]+)" src="data:image\/svg\+xml,([^"]+)" alt="" width="(\d+)" height="(\d+)">/g)];
        assert.equal(images.length, 2);
        assert.equal((html.match(/<img\b/g) || []).length, 2);
        assert.deepEqual(images.map(([, name, , width, height]) => [name, width, height]), [
            ['lesson-header-mark', '64', '64'], ['lesson-footer-mark', '96', '96']
        ]);
        assert.deepEqual(images.map(([, , svg]) => decodeURIComponent(svg)), [simple, fancy]);
        assert.match(html, /class="lesson-title-group">[\s\S]*?id="topic"[\s\S]*?id="subtitle"[\s\S]*?<\/div>\s*<\/div>\s*<button id="theme"/);
        assert.match(html, /<\/main>\s*<footer class="lesson-footer">\s*<img class="lesson-footer-mark"/);
        assert.doesNotMatch(html, /@@[A-Z_]+@@/);
        for (const [, , svg] of images) {
            assert.doesNotMatch(decodeURIComponent(svg), /<(?:script|image|text|foreignObject)\b|\bhref=/i);
        }
    }
});

test('both subjects embed the same shell and quiz controller, with no practice tab', () => {
    const sharedRuntime = fs.readFileSync(path.join(__dirname, '..', 'runtime.js'), 'utf8');
    const sharedStyles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    const storageNotice = 'Výsledky se ukládají jen v této kartě prohlížeče, ne online ani na jiných zařízeních. Po zavření karty se mohou ztratit.';
    assert.doesNotMatch(sharedStyles, /\.original-text \{[^}]*max-width:/);
    assert.equal(fs.existsSync(path.join(__dirname, '..', '..', 'history-tutor')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'maths.schema.json')), false);
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const html = renderLesson(subject, lesson);
        assert.ok(html.includes(`<p>${storageNotice}</p>`));
        assert.ok(html.includes(sharedRuntime));
        assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], sharedStyles);
        assert.ok(html.includes(`<body data-subject="${subject}">`));
        const adapter = fs.readFileSync(path.join(__dirname, '..', `${subject}.js`), 'utf8');
        assert.ok(html.includes(adapter));
        assert.doesNotMatch(html, /module\.exports = require|let appData =|DEFAULT_EDU_PAYLOAD/);
        assert.equal((html.match(/function initializeTutor\(/g) || []).length, 1);
        assert.deepEqual([...html.matchAll(/<button[^>]+data-tab="([^"]+)"/g)].map(match => match[1]), ['original', 'learning', 'quiz']);
        assert.match(html, /id="player"/);
        assert.match(html, /id="name-error" role="alert"/);
        assert.match(html, /id="score" role="status" aria-atomic="true"/);
        assert.match(html, /id="quiz-progress" aria-labelledby="progress"/);
        assert.doesNotMatch(html, /data-tab="practice"/);
    }
});
