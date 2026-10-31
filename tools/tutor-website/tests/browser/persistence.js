'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { renderLesson } = require('../../build.js');

async function checkPersistence({ client, evaluate, capture, subject, lesson, file }) {
    const storageKey = `${subject}-tutor:v${subject === 'maths' ? 2 : 1}:${lesson.id}`;
    const savedCount = subject === 'maths' ? 6 : 3;
    await client.send('Page.navigate', { url: pathToFileURL(file).href + '?reload' });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`location.search === "?reload" && document.querySelectorAll("#leaderboard-content tbody tr").length === ${savedCount}`)) break;
        await delay(50);
    }
    assert.equal(await evaluate('document.querySelectorAll("#leaderboard-content tbody tr").length'), savedCount);
    // Reuse the file so isolation depends on lesson id, not its URL.
    const otherLesson = { ...lesson, id: 'other-lesson', topic: 'Jiná technická kontrola' };
    fs.writeFileSync(file, renderLesson(subject, otherLesson));
    await client.send('Page.navigate', { url: pathToFileURL(file).href + '?other-lesson' });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`document.getElementById('topic')?.textContent === '${otherLesson.topic}'`)) break;
        await delay(50);
    }
    assert.equal(await evaluate('document.getElementById("leaderboard-content").textContent'), 'Zatím žádné výsledky.');
    assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('${storageKey}')).length`), savedCount);
    fs.writeFileSync(file, renderLesson(subject, lesson));
    const finishEasy = `(async () => {
        const $ = id => document.getElementById(id);
        const lesson = JSON.parse($('lesson-data').textContent);
        await window.switchTutorTab('quiz');
        $('player').value = 'Žofka';
        document.querySelector('[data-mode="easy"]').click();
        if ($('name-error').textContent) throw new Error('Unicode nickname rejected');
        for (let index = 0; index < 3; index++) {
            if (${JSON.stringify(subject)} === 'history') {
                const question = lesson.questions.find(item => item.prompt === $('question').textContent);
                if (question.type === 'text') {
                    $('answer-input').value = question.acceptedAnswers[0];
                    $('answers').requestSubmit();
                } else $('answers').querySelectorAll('button')[question.answer].click();
            } else $('answers').requestSubmit();
            $('next').click();
        }
    })()`;
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const [scenario, source, message] of [
        ['read-denied', `Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });`, 'nelze načíst'],
        ['corrupt', `sessionStorage.setItem('${storageKey}', '{"broken":true}');`, 'nelze načíst'],
        ['write-denied', `sessionStorage.removeItem('${storageKey}'); window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException('Full', 'QuotaExceededError'); };`, 'nepodařilo uložit']
    ]) {
        const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', { source });
        await client.send('Page.navigate', { url: pathToFileURL(file).href + '?' + scenario });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`location.search === '?${scenario}' && !!document.getElementById('topic')?.textContent`)) break;
            await delay(50);
        }
        await evaluate(finishEasy);
        assert.equal(await evaluate(`!document.getElementById('storage-warning').hidden &&
            document.getElementById('storage-warning').textContent.includes('${message}')`), true, `${subject}/${scenario}`);
        assert.equal(await evaluate('document.querySelectorAll("#leaderboard-content tbody tr").length'), 1);
        assert.equal(await evaluate('document.getElementById("results").hidden'), false);
        assert.equal(await evaluate('document.getElementById("leaderboard").open'), true);
        if (scenario === 'corrupt') assert.equal(await evaluate(`sessionStorage.getItem('${storageKey}')`), '{"broken":true}');
        if (scenario === 'write-denied') {
            await evaluate(`Storage.prototype.setItem = window.originalSetItem; document.getElementById('restart').click();`);
            await evaluate(finishEasy);
            assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true);
            assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('${storageKey}')).length`), 2);
        }
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        assert.deepEqual(await evaluate(`(() => {
            const confetti = getComputedStyle(document.querySelector('.confetti span'));
            return { animation: confetti.animationName, opacity: confetti.opacity };
        })()`), { animation: 'none', opacity: '0' }, `${subject}: no confetti with reduced motion`);
        await capture(`${subject}-completion-320`);
        assert.equal(await evaluate(`(() => {
            const leaderboard = document.getElementById('leaderboard');
            leaderboard.scrollIntoView({ block: 'center' });
            return leaderboard.open && document.querySelector('#leaderboard-content tbody tr').getBoundingClientRect().height > 0 &&
                document.getElementById('leaderboard-rank').getBoundingClientRect().height > 0;
        })()`), true, 'completion leaderboard rows and latest rank are visible without expanding');
        await capture(`${subject}-leaderboard-320`);
        await client.send('Emulation.setEmulatedMedia', { features: [] });
        await evaluate(`document.getElementById('restart').click(); document.getElementById('player').value = '';
            document.querySelector('[data-mode="easy"]').click();`);
        assert.equal(await evaluate('!document.getElementById("setup").hidden && !!document.getElementById("name-error").textContent'), true);
        await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
    }
}

module.exports = { checkPersistence };
