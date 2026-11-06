'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { capabilities, renderLesson } = require('../build.js');
const { readRuntimeSource } = require('../page.js');
const { page } = require('./helpers/runtime.js');

const shared = path.join(__dirname, '..');

test('standalone and VM loaders assemble every shared controller once in the same order', () => {
    const files = [
        'assessment.js', 'highlights.js', 'learning.js', 'runtime.js',
        path.join('runtime', 'learning.js'), path.join('runtime', 'navigation.js'),
        path.join('runtime', 'results.js'), path.join('runtime', 'quiz.js'),
        path.join('runtime', 'printing.js')
    ];
    for (const subject of ['history', 'maths']) {
        const lesson = JSON.parse(fs.readFileSync(capabilities(subject).examplePath, 'utf8'));
        const expected = [...files, `${subject}.js`]
            .map(file => fs.readFileSync(path.join(shared, file), 'utf8')).join('\n');
        const source = readRuntimeSource(subject);
        assert.equal(source, expected);
        assert.doesNotThrow(() => new vm.Script(source));
        const html = renderLesson(subject, lesson);
        assert.ok(html.includes(`<script>\n${source}`) || html.includes(`<script>${source}`));
        for (const name of ['initializeTutor', 'initializeTutorLearning', 'initializeTutorNavigation',
            'initializeTutorResults', 'initializeTutorQuiz', 'initializeTutorPrinting', 'initializeLearning']) {
            assert.equal((source.match(new RegExp(`function ${name}\\(`, 'g')) || []).length, 1, name);
        }
        const other = subject === 'history' ? 'maths' : 'history';
        assert.ok(!source.includes(fs.readFileSync(path.join(shared, `${other}.js`), 'utf8')));
        assert.doesNotMatch(html, /<script[^>]+src=|@import|\bimport\s*\(/);
        assert.equal(page(subject).get('topic').textContent, lesson.topic);
    }
    assert.throws(() => readRuntimeSource('science'), /Unsupported subject: science/);
    assert.deepEqual(Object.keys(require('../runtime.js')), [
        'MODES', 'POINTS', 'shuffle', 'grade', 'formatDuration'
    ]);
});

test('missing extracted runtime sources fail both HTML and VM assembly explicitly', t => {
    const read = fs.readFileSync;
    const missing = path.join(shared, 'runtime', 'quiz.js');
    const error = Object.assign(new Error(`Missing runtime source: ${missing}`), { code: 'ENOENT' });
    t.mock.method(fs, 'readFileSync', (file, ...args) => {
        if (file === missing) throw error;
        return read(file, ...args);
    });
    const lesson = JSON.parse(read(capabilities('history').examplePath, 'utf8'));
    assert.throws(() => renderLesson('history', lesson), failure => failure === error);
    assert.throws(() => page('history'), failure => failure === error);
});

test('Gems CSS assembles identically and JavaScript still matches its canonical JSON', () => {
    const gems = path.join(shared, '..', '..', 'gems', 'dusan-edu-webpage');
    const files = ['base.css', 'learning.css', 'quiz.css', 'effects-results.css'];
    const source = files.map(file => fs.readFileSync(path.join(gems, 'styles', file), 'utf8')).join('');
    assert.equal(source, fs.readFileSync(path.join(gems, 'styles.css'), 'utf8'));
    assert.doesNotMatch(source, /@import|url\s*\(/);
    const lines = JSON.parse(fs.readFileSync(path.join(gems, 'app.js.json'), 'utf8'));
    const app = fs.readFileSync(path.join(gems, 'app.js'), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);
    assert.deepEqual(app, lines);
});

test('the discoverable documentation index preserves old anchors and resolves local document links', () => {
    const index = fs.readFileSync(capabilities('history').contractPath, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(capabilities('history').contractPath, path.join(shared, 'README.md'));
    for (const title of ['Discover, author, hand off', 'Website-owned task counts', 'Prepared defaults',
        'Build handoff', 'History authoring and quiz rules', 'Existing lesson data',
        'Shared page and quiz ownership', 'What stays separate, and why',
        'Motivation, semantic paragraphs and motion', 'Icons, glossary and standalone branding',
        'Completion, local ranking and answer duration', 'Selective Gems integration',
        'Shared v3 content contract and maths section', 'Shared full/partial answer policies',
        'Legacy assessment compatibility', 'Typed answers and exact comparison',
        'Pull request validation', 'Automatic tutor releases', 'Local review and publication']) {
        assert.ok(index.includes(` ${title}\n`), `Preserved anchor: ${title}`);
    }
    const documents = [path.join(shared, 'README.md'), ...fs.readdirSync(path.join(shared, 'docs'))
        .filter(file => file.endsWith('.md')).map(file => path.join(shared, 'docs', file))];
    for (const file of documents) {
        const content = fs.readFileSync(file, 'utf8');
        for (const [, link] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
            if (/^https?:/.test(link)) continue;
            const [relative, anchor] = link.split('#');
            const target = path.resolve(path.dirname(file), ...relative.split('/'));
            assert.ok(fs.existsSync(target), `${file}: missing ${link}`);
            if (anchor) {
                const headings = [...fs.readFileSync(target, 'utf8').matchAll(/^#{1,6} (.+)$/gm)]
                    .map(([, heading]) => heading.toLowerCase().replace(/[^\w -]/g, '').replace(/ /g, '-'));
                assert.ok(headings.includes(anchor), `${file}: missing anchor ${link}`);
            }
        }
    }
});
