'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { capabilities, renderLesson, build } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { mathsLesson } = require('./fixture.js');
const history = require('../../history-tutor/examples/defenestrace.json');
const { renderLesson: renderHistory } = require('../../history-tutor/build.js');
const { formatAnswer } = require('../maths.js');

test('discovery identifies real contracts and available untimed maths assessment', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        for (const key of ['schemaPath', 'validatorPath', 'builderPath', 'contractPath', 'examplePath']) {
            assert.ok(path.isAbsolute(result[key]));
            assert.ok(fs.existsSync(result[key]), result[key]);
        }
        assert.equal(result.timing, subject === 'maths' ? 'none' : 'mandatory-speed-bonus-before-15000ms');
        assert.equal(result.version, subject === 'maths' ? 2 : 1);
        assert.deepEqual(result.tabs, ['original', 'learning', 'quiz']);
        assert.equal(result.playerNameRequired, true);
    }
    assert.equal(capabilities('maths').assessment, 'available');
    assert.equal(capabilities('maths').generation, 'lesson-and-quiz');
    assert.throws(() => capabilities('science'), /Unsupported subject/);
    assert.equal(renderLesson('history', history), renderHistory(history));
    assert.throws(() => renderLesson('history', mathsLesson()), /Invalid lesson/);
    assert.throws(() => renderLesson('maths', history), /Invalid maths lesson/);
});

test('prepared defaults copy unchanged into guarded builds instead of using structural fixtures', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-defaults-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const subject of ['history', 'maths']) {
        const { examplePath, version } = capabilities(subject);
        const source = fs.readFileSync(examplePath, 'utf8');
        const lesson = JSON.parse(source);
        assert.equal(lesson.version, version);
        assert.equal(validateLesson(subject, lesson), lesson);
        const inputPath = path.join(directory, `${subject}.json`);
        const outputPath = path.join(directory, `${subject}.html`);
        fs.copyFileSync(examplePath, inputPath, fs.constants.COPYFILE_EXCL);
        assert.equal(build({ operation: 'build', subject, artifactDirectory: directory, inputPath, outputPath }).outputPath, outputPath);
        const html = fs.readFileSync(outputPath, 'utf8');
        assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), lesson);
        assert.equal(fs.readFileSync(examplePath, 'utf8'), source);
    }
});

test('one prepared maths lesson combines fraction calculations and length conversions in every quiz mode', () => {
    const { selectExercises, scoreExercise, maximumPoints, checkAnswer } = require('../maths.js');
    const maths = require('../examples/zlomky-a-prevody-delky.json');
    assert.equal(maths.id, 'zlomky-a-prevody-delky');
    assert.equal(maths.topic, 'Zlomky a převody jednotek délky');
    assert.deepEqual(maths.exercises.map(exercise => exercise.steps.map(step => formatAnswer(step.answer))), [
        ['6', '15', '1/2', '0,25'], ['300 cm', '5 cm', '2000 m', '15 dm'],
        ['12'], ['95 cm'], ['150 cm'], ['2/5'], ['750 m'],
        ['200 cm', '400 cm', '100 cm'], ['600 m', '1800 m', '600 m'], ['45 cm', '75 cm', '15 cm']
    ]);
    for (const [mode, count, maximum] of [['easy', 3, 61], ['medium', 5, 111], ['hard', 10, 212]]) {
        for (const random of [() => 0, () => .999999, Math.random]) {
            const questions = selectExercises(maths.exercises, mode, random);
            assert.equal(questions.length, count);
            assert.equal(new Set(questions.map(question => question.id)).size, count);
            assert.equal(maximumPoints(questions), maximum);
            assert.ok(questions.some(question => question.steps.some(step => step.answer.format === 'length')));
            assert.ok(questions.some(question => /[1-3]\/[2348]/.test(question.prompt) || question.id === 'ctyri-zlomky'));
            const score = questions.reduce((sum, question) =>
                sum + scoreExercise(question, question.steps.map(step => formatAnswer(step.answer))).total, 0);
            assert.equal(score, maximum);
        }
    }
    assert.equal(checkAnswer(maths.exercises[0].steps[2].answer, '3/6').correct, true);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0,25').correct, true);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0.25').correct, true);
    assert.equal(checkAnswer(maths.exercises[1].steps[0].answer, '0.003 km').correct, true);
    assert.equal(checkAnswer(maths.exercises[1].steps[0].answer, '300').valid, false);
    const hard = maths.exercises[7];
    assert.equal(scoreExercise(hard, ['', ...hard.steps.slice(1).map(step => formatAnswer(step.answer))]).total, 20);
});

test('maths accepts all agreed typed answers without evaluating or converting them', () => {
    for (const answer of [
        { format: 'integer', value: '-23' },
        { format: 'fraction', numerator: '2', denominator: '4' },
        { format: 'decimal', value: '0.125' },
        ...['mm', 'cm', 'dm', 'm', 'km'].map(unit => ({ format: 'length', value: '1.5', unit }))
    ]) {
        const lesson = mathsLesson();
        lesson.exercises[0].steps[0].answer = answer;
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
    assert.equal((html.match(/<script(?:\s|>)/g) || []).length, 2);
    assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=|\b(?:fetch|XMLHttpRequest|eval)\s*\(|id="bonus"/);
    assert.match(html, /speedBonus: false/);
    assert.doesNotMatch(html, /zatím nejsou dostupné|@@(?:DATA|STYLES|APP)@@/);
    assert.match(html, /data-mode="hard"/);
    assert.match(html, /id="results"/);
    assert.match(html, /sessionStorage/);
    assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), lesson);
});

test('both subjects embed the same shell and quiz controller, with no practice tab', () => {
    const sharedRuntime = fs.readFileSync(path.join(__dirname, '..', 'runtime.js'), 'utf8');
    const sharedStyles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    assert.match(sharedStyles, /\.original-text \{[^}]*max-width: 80ch;/);
    const legacyHistory = require('../../history-tutor/app.js');
    assert.equal(legacyHistory, require('../history.js'));
    assert.equal(fs.existsSync(path.join(__dirname, '..', '..', 'history-tutor', 'styles.css')), false);
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const html = renderLesson(subject, lesson);
        assert.ok(html.includes(sharedRuntime));
        assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], sharedStyles);
        const adapter = fs.readFileSync(path.join(__dirname, '..', `${subject}.js`), 'utf8');
        assert.ok(html.includes(adapter));
        assert.doesNotMatch(html, /module\.exports = require|let appData =|DEFAULT_EDU_PAYLOAD/);
        assert.equal((html.match(/function initializeTutor\(/g) || []).length, 1);
        assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]), ['original', 'learning', 'quiz']);
        assert.match(html, /id="player"/);
        assert.match(html, /id="name-error" role="alert"/);
        assert.match(html, /id="score" role="status" aria-atomic="true"/);
        assert.match(html, /id="quiz-progress" aria-labelledby="progress"/);
        assert.doesNotMatch(html, /data-tab="practice"/);
    }
});

test('guarded handoff validates paths, approval, subjects and data before writing', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-website-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'lesson.json');
    const outputPath = path.join(directory, 'nested', 'lesson.html');
    const request = { operation: 'build', subject: 'maths', artifactDirectory: directory, inputPath, outputPath };
    fs.writeFileSync(inputPath, JSON.stringify(mathsLesson()));
    const result = build(request);
    assert.equal(result.outputPath, outputPath);
    assert.equal(result.assessment, 'available');
    assert.throws(() => build(request), /EEXIST/);
    assert.equal(build({ ...request, overwriteApproved: true }).outputPath, outputPath);
    for (const patch of [
        { artifactDirectory: __dirname }, { inputPath: __filename }, { outputPath: path.join(__dirname, 'draft.html') },
        { outputPath: path.resolve(directory, '..', 'escaped.html') },
        { outputPath: inputPath }, { outputPath: 'relative.html' }, { inputPath: '../lesson.json' },
        { subject: 'science' }, { operation: 'publish' }, { overwriteApproved: 'yes' }, { unknown: true }
    ]) assert.throws(() => build({ ...request, ...patch }));
    const other = path.join(directory, 'linked.html');
    fs.linkSync(outputPath, other);
    assert.throws(() => build({ ...request, overwriteApproved: true }), /hard links/);
    fs.unlinkSync(other);
    const handoffPath = path.join(directory, 'handoff.json');
    fs.writeFileSync(handoffPath, JSON.stringify({ ...request, outputPath: path.join(directory, 'cli.html') }));
    const success = spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js'), 'build', handoffPath], { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(success.stdout).assessment, 'available');
    assert.ok(fs.existsSync(JSON.parse(success.stdout).outputPath));
    fs.writeFileSync(inputPath, '{}');
    const invalidOutput = path.join(directory, 'invalid.html');
    assert.throws(() => build({ ...request, outputPath: invalidOutput }), /Invalid maths lesson/);
    assert.equal(fs.existsSync(invalidOutput), false);
    const before = fs.readFileSync(outputPath, 'utf8');
    assert.throws(() => build({ ...request, overwriteApproved: true }), /Invalid maths lesson/);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), before);
    fs.writeFileSync(handoffPath, JSON.stringify(request));
    const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js'), 'build', handoffPath], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /Tutor website failed: Invalid maths lesson/);
    fs.writeFileSync(inputPath, JSON.stringify(history));
    assert.equal(build({ ...request, subject: 'history', overwriteApproved: true }).assessment, 'available');
    assert.equal(fs.readFileSync(outputPath, 'utf8'), renderHistory(history));
});

test('handoff resolves directory junctions before checking containment', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-website-links-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifacts = path.join(directory, 'artifacts');
    const outside = path.join(directory, 'outside');
    fs.mkdirSync(artifacts);
    fs.mkdirSync(outside);
    const inputPath = path.join(artifacts, 'lesson.json');
    fs.writeFileSync(inputPath, JSON.stringify(mathsLesson()));
    fs.symlinkSync(outside, path.join(artifacts, 'escape'), 'junction');
    assert.throws(() => build({
        operation: 'build', subject: 'maths', artifactDirectory: artifacts, inputPath,
        outputPath: path.join(artifacts, 'escape', 'nested', 'lesson.html')
    }), /resolve inside artifactDirectory/);
    fs.symlinkSync(path.resolve(__dirname, '..', '..', '..'), path.join(artifacts, 'repo'), 'junction');
    assert.throws(() => build({
        operation: 'build', subject: 'maths', artifactDirectory: artifacts, inputPath,
        outputPath: path.join(artifacts, 'repo', 'draft.html')
    }), /outside the repository/);
});
