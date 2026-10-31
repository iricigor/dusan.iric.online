'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { capabilities, renderLesson, build } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { mathsLesson, valueAssessment } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const { formatAnswer } = require('../maths.js');
const { questionBank, MODES } = require('../runtime.js');

test('question bank export counts complete tasks and includes canonical answers without learner data', () => {
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const before = JSON.stringify(lesson);
        const adapter = require(`../${subject}.js`);
        const result = questionBank(lesson, adapter);
        const tasks = lesson.questions || lesson.exercises;
        assert.deepEqual(Object.keys(result), ['subject', 'lessonId', 'topic', 'summary', 'questions']);
        assert.equal(result.subject, subject);
        assert.equal(result.lessonId, lesson.id);
        assert.equal(result.summary.totalQuestions, tasks.length);
        assert.deepEqual(result.summary.byDifficulty, subject === 'history'
            ? { easy: 6, medium: 15, hard: 9 } : { easy: 2, medium: 5, hard: 3 });
        assert.deepEqual(result.questions.map(question => question.id), tasks.map(question => question.id));
        result.questions.forEach((question, index) => {
            if (subject === 'history') {
                assert.deepEqual(question.correctAnswers, tasks[index].type === 'text'
                    ? tasks[index].acceptedAnswers : [tasks[index].options[tasks[index].answer]]);
            } else {
                assert.deepEqual(question.steps.map(step => step.correctAnswer), tasks[index].steps.map(step => formatAnswer(step.answer)));
                assert.deepEqual(question.steps.map(step => step.answer), tasks[index].steps.map(step => step.answer));
            }
            assert.deepEqual(question.assessment, tasks[index].assessment);
        });
        assert.equal(JSON.stringify(lesson), before);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    }
    const legacy = { ...history, version: 1 };
    delete legacy.subject;
    assert.equal(questionBank(legacy, require('../history.js')).subject, 'history');
});

test('discovery identifies real contracts and available untimed maths assessment', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        for (const key of ['schemaPath', 'validatorPath', 'builderPath', 'contractPath', 'examplePath']) {
            assert.ok(path.isAbsolute(result[key]));
            assert.ok(fs.existsSync(result[key]), result[key]);
        }
        assert.equal(result.timing, subject === 'maths' ? 'none' : 'mandatory-speed-bonus-before-15000ms');
        assert.equal(result.version, 3);
        assert.deepEqual(result.tabs, ['original', 'learning', 'quiz']);
        assert.equal(result.playerNameRequired, true);
        assert.equal(result.answerDuration, 'active-answering-only-excludes-feedback-and-hidden-quiz');
    }
    assert.equal(capabilities('maths').assessment, 'available');
    assert.equal(capabilities('maths').generation, 'lesson-and-quiz');
    assert.throws(() => capabilities('science'), /Unsupported subject/);
    assert.throws(() => renderLesson('history', mathsLesson()), /Invalid lesson/);
    assert.throws(() => renderLesson('maths', history), /Invalid maths lesson/);
});

test('prepared defaults copy unchanged into guarded builds instead of using structural fixtures', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-defaults-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const subject of ['history', 'maths']) {
        const { examplePath, version } = capabilities(subject);
        assert.equal(path.dirname(examplePath), path.join(__dirname, '..', 'examples'));
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

test('capabilities own new-authoring counts and expose the runtime quiz mixes without shared mutations', () => {
    const quizModes = {
        easy: { easy: 1, medium: 1, hard: 1 },
        medium: { easy: 1, medium: 2, hard: 2 },
        hard: { easy: 2, medium: 5, hard: 3 }
    };
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        assert.deepEqual(result.authoringRequirements, {
            taskUnit: subject === 'history' ? 'question' : 'whole-exercise',
            minimumTasks: 30,
            minimumByDifficulty: { easy: 2, medium: 5, hard: 3 },
            recommendedByDifficulty: { easy: 6, medium: 15, hard: 9 },
            preferredTaskRange: { min: subject === 'history' ? 50 : 30, max: 100 },
            minimumTasksEnforcedByValidator: false
        });
        assert.deepEqual(result.quizModes, quizModes);
        for (const [mode, mix] of Object.entries(MODES)) {
            assert.deepEqual(Object.values(result.quizModes[mode]), mix);
        }
        const lesson = JSON.parse(fs.readFileSync(result.examplePath, 'utf8'));
        const poolKey = subject === 'history' ? 'questions' : 'exercises';
        lesson[poolKey] = Object.entries(result.authoringRequirements.minimumByDifficulty)
            .flatMap(([level, count]) => lesson[poolKey].filter(task => task.difficulty === level).slice(0, count));
        assert.equal(lesson[poolKey].length, 10);
        assert.equal(validateLesson(subject, lesson), lesson);
        const legacy = structuredClone(lesson);
        legacy.version = subject === 'history' ? 1 : 2;
        delete legacy.subtitle;
        if (subject === 'history') {
            delete legacy.subject;
            delete legacy.language;
            legacy.questions.forEach(question => { delete question.assessment; });
        } else legacy.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
        assert.equal(validateLesson(subject, legacy), legacy);
        result.quizModes.easy.easy = 100;
        result.authoringRequirements.minimumByDifficulty.easy = 100;
        assert.deepEqual(capabilities(subject).quizModes, quizModes);
        assert.equal(capabilities(subject).authoringRequirements.minimumByDifficulty.easy, 2);
        assert.equal(MODES.easy[0], 1);
    }
});

test('one prepared maths lesson combines fraction calculations and length conversions in every quiz mode', () => {
    const { selectExercises, scoreExercise, maximumPoints, checkAnswer } = require('../maths.js');
    const maths = require('../examples/zlomky-a-prevody-delky.json');
    assert.equal(maths.id, 'zlomky-a-prevody-delky');
    assert.equal(maths.topic, 'Zlomky a převody jednotek délky');
    assert.deepEqual(maths.exercises.map(exercise => exercise.steps.map(step => formatAnswer(step.answer))), [
        ['6', '15', '1/2', '0,25'], ['300', '5', '2000', '15'],
        ['12'], ['95'], ['150'], ['2/5'], ['750'],
        ['200', '400', '100'], ['600', '1800', '600'], ['45', '75', '15'],
        ['1/4', '2/3', '0,6', '18'], ['6', '4,5', '700', '1,25'],
        ['25', '60', '500', '75'], ['0,125', '0,75', '1,5', '1,75'],
        ['115'], ['7'], ['6'], ['56'], ['1,75'], ['15'], ['1/4'], ['13,5'], ['300'], ['4'],
        ['1200', '1800', '1200'], ['60', '36', '18'], ['200', '150', '500'],
        ['200', '235', '2,35'], ['150', '50', '200'], ['180', '120', '15']
    ]);
    for (const [mode, count, maximum] of [['easy', 3, 61], ['medium', 5, 111], ['hard', 10, 212]]) {
        for (const random of [() => 0, () => .999999, Math.random]) {
            const questions = selectExercises(maths.exercises, mode, random);
            assert.equal(questions.length, count);
            assert.equal(new Set(questions.map(question => question.id)).size, count);
            assert.equal(maximumPoints(questions), maximum);
            assert.ok(questions.some(question => /centimetr|metr|decimetr/.test(question.steps[0].prompt)));
            assert.ok(questions.some(question => /\d\/\d|zlom|polovin|třetin|čtvrtin|osmin|pětin/.test(question.prompt)));
            const score = questions.reduce((sum, question) =>
                sum + scoreExercise(question, question.steps.map(step => formatAnswer(step.answer))).total, 0);
            assert.equal(score, maximum);
        }
    }
    assert.equal(scoreExercise(maths.exercises[0], ['6', '15', '3/6', '0.25']).steps[2].fraction, .5);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0,25').correct, true);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0.25').correct, true);
    const hard = maths.exercises[7];
    assert.equal(scoreExercise(hard, ['', ...hard.steps.slice(1).map(step => formatAnswer(step.answer))]).total, 20);
});

test('both prepared banks contain 30 distinct tasks with complete export and canonical full-credit answers', () => {
    const { scoreAnswer } = require('../history.js');
    const { scoreExercise } = require('../maths.js');
    for (const subject of ['history', 'maths']) {
        const lesson = JSON.parse(fs.readFileSync(capabilities(subject).examplePath, 'utf8'));
        validateLesson(subject, lesson);
        const tasks = lesson.questions || lesson.exercises;
        assert.ok(tasks.length >= 30, `${subject}: whole tasks, not maths steps`);
        assert.equal(new Set(tasks.map(task => task.prompt.trim().toLocaleLowerCase('cs'))).size, tasks.length);
        const exported = questionBank(lesson, require(`../${subject}.js`));
        assert.deepEqual(exported.summary, { totalQuestions: 30, byDifficulty: { easy: 6, medium: 15, hard: 9 } });
        tasks.forEach(task => {
            if (subject === 'history') {
                const answers = task.type === 'text' ? task.acceptedAnswers : [task.answer];
                answers.forEach(answer => assert.equal(scoreAnswer(task, answer, 20000).fraction, 1, task.id));
            } else {
                assert.ok(scoreExercise(task, task.steps.map(step => formatAnswer(step.answer))).steps.every(step => step.correct), task.id);
            }
        });
    }
});

test('all default fixed-unit questions accept and display numbers without requiring unit suffixes', () => {
    const { checkAnswer, scoreExercise } = require('../maths.js');
    const maths = require('../examples/zlomky-a-prevody-delky.json');
    const expected = {
        'ctyri-prevody': ['300', '5', '2000', '15'],
        'dve-tycky': ['95'],
        'stuha-na-darek': ['150'],
        'cesta-do-knihovny': ['750'],
        'provaz-na-kusy': ['200', '400', '100'],
        'vylet-na-etapy': ['600', '1800', '600'],
        'stuzka-na-masle': ['45', '75', '15']
    };
    for (const [id, answers] of Object.entries(expected)) {
        const exercise = maths.exercises.find(task => task.id === id);
        const result = scoreExercise(exercise, answers);
        assert.ok(result.steps.every(step => step.correct), id);
        exercise.steps.forEach((step, index) => {
            assert.equal(step.answer.format, 'integer');
            assert.equal(step.assessment.input, 'number');
            assert.equal(formatAnswer(step.answer), answers[index]);
            assert.equal(checkAnswer(step.answer, String(Number(answers[index]) + 1), step.assessment).correct, false);
        });
    }
    const conversion = maths.exercises.find(task => task.id === 'ctyri-prevody').steps[2];
    assert.equal(checkAnswer(conversion.answer, '2000', conversion.assessment).fraction, 1);
    assert.equal(checkAnswer(conversion.answer, '2', conversion.assessment).fraction, 0);
    assert.equal(checkAnswer(conversion.answer, '2000 m', conversion.assessment).valid, false);
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
    assert.equal((html.match(/<script(?:\s|>)/g) || []).length, 2);
    assert.doesNotMatch(html, /<script[^>]+src=|<img[^>]+src="(?!data:image\/svg\+xml,)|<link[^>]+href="(?!data:)|\b(?:fetch|XMLHttpRequest|eval)\s*\(|id="bonus"/);
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
        assert.doesNotMatch(svg, /<(?:script|image|text|linearGradient|radialGradient|filter)|href=/);
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
            assert.doesNotMatch(decodeURIComponent(svg), /<(?:script|image|text|foreignObject)\b|\bhref=/);
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
    assert.equal(fs.readFileSync(outputPath, 'utf8'), renderLesson('history', history));
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
