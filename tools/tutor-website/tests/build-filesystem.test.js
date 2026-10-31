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
const history = require('../examples/defenestrace.json');

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
