'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, renderLesson } = require('../build.js');
const { validateLesson } = require('../validate.js');
const examplePath = path.join(__dirname, '..', 'examples', 'defenestrace.json');
const example = () => JSON.parse(fs.readFileSync(examplePath, 'utf8'));

test('example validates, preserving the selected original excerpts verbatim', () => {
    const lesson = validateLesson('history', example());
    const original = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'gems', 'dusan-edu-webpage', 'sample.json'), 'utf8'));
    const text = original.tabs.find(tab => tab.id === 'original').content.map(section => section.text).join('\n');
    lesson.original.forEach(section => assert.ok(text.includes(section.text)));
});

test('published example preserves the reviewed lesson data and Czech references', () => {
    const lesson = example();
    lesson.sources.forEach(source => assert.equal(new URL(source.url).hostname, 'cs.wikipedia.org'));
    const published = path.join(__dirname, '..', '..', '..', 'site', 'history', 'defenestrace.html');
    const publishedHtml = fs.readFileSync(published, 'utf8');
    const payload = publishedHtml.match(/<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
    const publishedLesson = JSON.parse(payload);
    assert.equal(validateLesson('history', publishedLesson), publishedLesson);
    const { version, subject, language, subtitle, ...content } = lesson;
    content.original = content.original.map(({ style, ...section }) => section);
    content.chunks = content.chunks.map(({ paragraphs, ...chunk }) => chunk);
    content.questions = content.questions.map(({ assessment, ...question }) => question);
    assert.deepEqual(publishedLesson, { version: 1, ...content });
    assert.match(renderLesson('history', lesson), /function initializeTutor\(/);
});

test('schema rejects malformed data and conditional question shapes', () => {
    const mutations = [
        lesson => { delete lesson.topic; },
        lesson => { lesson.version = 2; },
        lesson => { lesson.id = '../bad'; },
        lesson => { lesson.chunks[0].sentences = ['Only one.']; },
        lesson => { lesson.questions[0].answer = 2; },
        lesson => { lesson.questions[0].year = true; },
        lesson => { lesson.questions[0].options = ['Yes', 'No']; },
        lesson => { lesson.questions[2].options.pop(); },
        lesson => { lesson.questions[2].answer = 4; },
        lesson => { lesson.questions[7].acceptedAnswers = []; },
        lesson => { lesson.questions[7].acceptedAnswers = ['1618 trailing text']; },
        lesson => { lesson.questions[7].acceptedAnswers.push('1619'); },
        lesson => { lesson.questions[7].options = []; },
        lesson => { lesson.questions[0].difficulty = 'impossible'; },
        lesson => { lesson.sources[0].url = 'javascript:alert(1)'; },
        lesson => { lesson.sources[0].url = 'https://'; },
        lesson => { lesson.sources[0].url = 'https://user:password@example.org'; },
        lesson => { lesson.unexpected = true; },
        lesson => { lesson.questions = null; }
    ];
    mutations.forEach(mutate => {
        const lesson = example();
        mutate(lesson);
        assert.throws(() => validateLesson('history', lesson), /Invalid lesson/);
    });
});

test('cross-field validation rejects duplicate, insufficient and ambiguous content', () => {
    const mutations = [
        lesson => { lesson.questions[1].id = lesson.questions[0].id; },
        lesson => { lesson.questions[1].prompt = ` ${lesson.questions[0].prompt.toUpperCase()} `; },
        lesson => { lesson.questions[2].options[1] = lesson.questions[2].options[0].toUpperCase(); },
        lesson => { lesson.questions[1] = { ...lesson.questions[2], id: 'extra', prompt: 'Extra question' }; },
        lesson => { lesson.questions.filter(q => q.year).forEach(q => { q.year = false; }); },
        lesson => { lesson.glossary[1].forms.push(lesson.glossary[0].term); },
        lesson => { lesson.corrections[0].section = 99; },
        lesson => { lesson.corrections[0].quote = 'not in original'; },
        lesson => { lesson.original[2].text += lesson.corrections[0].quote; },
        lesson => { lesson.corrections[0].sourceUrl = 'https://example.org/not-listed'; },
        lesson => { lesson.corrections.push({ ...lesson.corrections[0] }); }
    ];
    mutations.forEach(mutate => {
        const lesson = example();
        mutate(lesson);
        assert.throws(() => validateLesson('history', lesson), /Invalid lesson/);
    });
});

test('HTML is self-contained and payload cannot close a script or title', () => {
    const lesson = example();
    const hostile = '</script><script>alert("test")</script><img src=x onerror=alert(1)> & $& @@APP@@';
    lesson.topic = hostile;
    lesson.original[0].text += hostile;
    const html = renderLesson('history', lesson);
    assert.ok(!html.includes(hostile));
    assert.ok(html.includes('&lt;/script&gt;'));
    const data = html.match(/<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(data), lesson);
    assert.ok(!data.includes('<'));
    assert.equal((html.match(/<script(?:\s|>)/gi) || []).length, 2);
    assert.ok(!/<(?:script|link)[^>]+(?:src|href)=/.test(html));
    assert.ok(!/\b(?:fetch|XMLHttpRequest)\(/.test(html));
    assert.ok(!/@@(?:STYLES|DATA)@@/.test(html));
});

test('builder writes nested output, protects existing files and validates before writing', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-history-build-'));
    t.after(() => fs.rmSync(directory, { recursive: true }));
    const inputPath = path.join(directory, 'history.json');
    fs.copyFileSync(examplePath, inputPath, fs.constants.COPYFILE_EXCL);
    const output = path.join(directory, 'nested', 'lesson.html');
    const request = { operation: 'build', subject: 'history', artifactDirectory: directory, inputPath, outputPath: output };
    assert.equal(build(request).outputPath, output);
    assert.ok(fs.readFileSync(output, 'utf8').startsWith('<!doctype html>'));
    assert.throws(() => build(request), /EEXIST/);
    build({ ...request, overwriteApproved: true });
    assert.throws(() => build({ ...request, outputPath: inputPath }), /separate .html/);
    assert.throws(() => build({ ...request, artifactDirectory: path.resolve(__dirname, '..') }), /outside the repository/);
    const invalid = path.join(directory, 'invalid.json');
    fs.writeFileSync(invalid, '{}');
    const missingOutput = path.join(directory, 'invalid.html');
    const invalidRequest = { ...request, inputPath: invalid, outputPath: missingOutput };
    assert.throws(() => build(invalidRequest), /Invalid lesson/);
    assert.equal(fs.existsSync(missingOutput), false);
    const handoffPath = path.join(directory, 'handoff.json');
    fs.writeFileSync(handoffPath, JSON.stringify(invalidRequest));
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js'), 'build', handoffPath], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tutor website failed: Invalid lesson/);
});
