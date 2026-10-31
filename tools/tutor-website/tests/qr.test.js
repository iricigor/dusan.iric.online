'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build, getPublicationUrl, renderLesson } = require('../build.js');
const history = require('../examples/defenestrace.json');
const { mathsLesson } = require('./fixture.js');

test('canonical lesson URLs use the test folder by default and accept explicit site paths', () => {
    assert.equal(getPublicationUrl('history', 'od-defenestrace-k-bile-hore'),
        'https://dusan.iric.online/test/od-defenestrace-k-bile-hore.html');
    assert.equal(getPublicationUrl('maths', 'zlomky'),
        'https://dusan.iric.online/test/zlomky.html');
    assert.equal(getPublicationUrl('history', 'lesson', 'test/á-probírku.html'),
        'https://dusan.iric.online/test/%C3%A1-prob%C3%ADrku.html');
    for (const publicationPath of [
        '/history/lesson.html', '../lesson.html', 'history/../lesson.html',
        'history//lesson.html', 'https://example.org/lesson.html', 'history/lesson.html?preview=1',
        'history/lesson.html#draft', 'history\\lesson.html', 'history/lesson'
    ]) {
        assert.throws(() => getPublicationUrl('history', 'lesson', publicationPath), /publicationPath/);
    }
});

test('history and maths pages embed a high-contrast QR code and matching visible link', () => {
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const url = getPublicationUrl(subject, lesson.id);
        const html = renderLesson(subject, lesson);
        const share = html.match(/<aside class="lesson-share"[\s\S]*?<\/aside>/)?.[0];
        assert.ok(share);
        assert.ok(share.includes(`href="${url}"`));
        assert.ok(share.includes(`>${url}</a>`));
        assert.match(share, /Otevři si tuto lekci na jiném zařízení/);
        assert.match(share, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
        assert.match(share, /<path fill="#fff"/);
        assert.match(share, /<path fill="#000"/);
        assert.doesNotMatch(share, /<img|https?:\/\/[^"]*(?:qr|image)/i);
        assert.doesNotMatch(html, /@@SHARE@@/);
    }
});

test('build handoffs use the configured publication path in the standalone draft', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-qr-build-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'lesson.json');
    const outputPath = path.join(directory, 'draft.html');
    fs.copyFileSync(path.join(__dirname, '..', 'examples', 'defenestrace.json'), inputPath);
    const result = build({
        operation: 'build', subject: 'history', artifactDirectory: directory, inputPath, outputPath,
        publicationPath: 'test/defenestrace.html'
    });
    const html = fs.readFileSync(outputPath, 'utf8');
    assert.equal(result.publicationUrl, 'https://dusan.iric.online/test/defenestrace.html');
    assert.ok(html.includes(`href="${result.publicationUrl}"`));
    assert.ok(html.includes(`<svg xmlns="http://www.w3.org/2000/svg"`));
});

test('long lesson paths still generate a QR symbol', () => {
    const lesson = mathsLesson();
    const html = renderLesson('maths', lesson, `maths/${'x'.repeat(225)}.html`);
    assert.match(html, /viewBox="0 0 65 65"/);
});
