'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { renderLesson } = require('../build.js');
const { mathsAssessmentLesson } = require('./fixture.js');
const history = require('../../history-tutor/examples/defenestrace.json');

const browserPath = process.env.TUTOR_BROWSER_PATH || [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
].find(file => fs.existsSync(file));

async function connect(url, events) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) return events(message);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    return {
        close: () => socket.close(),
        send: (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, 10000);
            pending.set(id, { resolve, reject, timeout });
            socket.send(JSON.stringify({ id, method, params }));
        })
    };
}

test('real offline pages share navigation, named quizzes, persistence and storage failures across subjects', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 90000
}, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-browser-'));
    const profile = path.join(directory, 'profile');
    const processHandle = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0',
        `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let launchError;
    processHandle.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    processHandle.on('error', error => { launchError = error; });
    let client;
    t.after(async () => {
        if (client) {
            await client.send('Browser.close');
            client.close();
        } else if (processHandle.pid) {
            processHandle.kill();
        }
        for (let attempt = 0; attempt < 50 && processHandle.exitCode === null; attempt++) await delay(100);
        if (processHandle.exitCode === null) processHandle.kill();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let attempt = 0; attempt < 150 && !fs.existsSync(portFile); attempt++) {
        if (launchError) throw launchError;
        if (processHandle.exitCode !== null) throw new Error(`Browser exited: ${stderr}`);
        await delay(100);
    }
    assert.ok(fs.existsSync(portFile), `Browser did not become ready: ${stderr}`);
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const exceptions = [];
    const network = [];
    client = await connect(target.webSocketDebuggerUrl, event => {
        if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails);
        if (event.method === 'Network.requestWillBeSent' && /^https?:/.test(event.params.request.url)) network.push(event.params.request.url);
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const evaluate = async expression => {
        const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
        return response.result.value;
    };
    for (const [subject, lesson] of [
        ['maths', { ...mathsAssessmentLesson(), id: 'shared-lesson-id' }],
        ['history', { ...history, id: 'shared-lesson-id' }]
    ]) {
        const file = path.join(directory, `${subject}.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(50);
        }
        assert.equal(await evaluate('document.getElementById("topic")?.textContent'), lesson.topic);
        assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true, `${subject}: isolated result namespace`);
        for (const width of [320, 1280]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            for (const theme of ['light', 'dark']) {
                await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
                await evaluate('delete document.documentElement.dataset.theme');
                const colors = await evaluate('({bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color})');
                assert.equal(colors.bg, theme === 'light' ? 'rgb(241, 245, 249)' : 'rgb(16, 24, 39)');
                assert.notEqual(colors.bg, colors.fg);
                assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${subject}/${width}/${theme} overflow`);
                assert.equal(await evaluate(`(() => {
                    document.getElementById('theme').click();
                    return document.documentElement.dataset.theme;
                })()`), theme === 'light' ? 'dark' : 'light');
                await evaluate('delete document.documentElement.dataset.theme');
                for (const tab of ['original', 'learning', 'quiz']) {
                    assert.equal(await evaluate(`(() => {
                        const tab = document.querySelector('[data-tab="${tab}"]');
                        tab.click();
                        return !document.getElementById('${tab}').hidden && tab.getAttribute('aria-pressed') === 'true'
                            && document.documentElement.scrollWidth <= innerWidth;
                    })()`), true, `${subject}/${tab}/${width}/${theme}`);
                    if (process.env.TUTOR_SCREENSHOT_DIRECTORY) {
                        fs.mkdirSync(process.env.TUTOR_SCREENSHOT_DIRECTORY, { recursive: true });
                        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
                        fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, `${subject}-${tab}-${width}-${theme}.png`), Buffer.from(screenshot.data, 'base64'));
                    }
                }
            }
        }
        assert.equal(await evaluate(`(() => {
            document.querySelector('[data-tab="learning"]').click();
            document.querySelector('#glossary button').click();
            const open = document.getElementById('definition').open;
            document.getElementById('definition').close();
            return open && !!document.getElementById('definition-text').textContent;
        })()`), true);
        assert.deepEqual(await evaluate(`(() => {
            const $ = id => document.getElementById(id);
            document.querySelector('[data-tab="original"]').click();
            const original = [...document.querySelectorAll('#original-content .original-text')].map(item => item.textContent);
            document.querySelector('[data-tab="quiz"]').click();
            const invalid = ['easy', 'medium', 'hard'].flatMap(mode =>
                ['', '12', 'Ab', 'A'.repeat(61)].map(name => {
                    $('player').value = name;
                    document.querySelector('[data-mode="' + mode + '"]').click();
                    return !$('setup').hidden && $('game').hidden && !!$('name-error').textContent &&
                        $('player').getAttribute('aria-invalid') === 'true';
                }));
            $('player').value = 'Kontrola';
            return { original, invalid, tabs: [...document.querySelectorAll('[data-tab]')].map(tab => tab.dataset.tab) };
        })()`), {
            original: lesson.original.map(section => section.text),
            invalid: Array(12).fill(true), tabs: ['original', 'learning', 'quiz']
        });
        if (subject === 'maths') {
            assert.deepEqual(await evaluate(`(() => {
                document.querySelector('[data-tab="learning"]').click();
                const details = document.querySelector('#exercises details');
                details.querySelector('summary').click();
                return {
                    examples: document.querySelectorAll('#examples > article').length,
                    exercises: document.querySelectorAll('#exercises > article').length,
                    opened: details.open,
                    modes: document.querySelectorAll('[data-mode]').length,
                    timing: document.querySelectorAll('#bonus, #timer, #countdown').length
                };
            })()`), { examples: 4, exercises: 10, opened: true, modes: 3, timing: 0 });
            assert.deepEqual(await evaluate(`(() => {
                const examples = [...document.querySelectorAll('#examples > article')];
                const openDetails = examples.map(example => example.querySelectorAll('details[open]').length);
                const exercises = [...document.querySelectorAll('#exercises > article')];
                window.timerStarts = 0;
                const originalInterval = window.setInterval;
                window.setInterval = (...args) => { window.timerStarts++; return originalInterval(...args); };
                return {
                    openDetails,
                    firstBeforePractice: !!(document.getElementById('examples').compareDocumentPosition(document.getElementById('exercises')) & Node.DOCUMENT_POSITION_FOLLOWING),
                    levels: exercises.map(exercise => exercise.querySelector('h2').textContent.replace(/^\\d+\\. /, ''))
                };
            })()`), {
                openDetails: [3, 1, 0, 0], firstBeforePractice: true,
                levels: ['Lehká skupina', 'Lehká skupina', ...Array(5).fill('Slovní úloha'), ...Array(3).fill('Úloha ve třech krocích')]
            });
            assert.equal(await evaluate(`(() => {
                const details = document.querySelector('#examples > article:nth-child(3) details');
                details.querySelector('summary').click();
                return details.open;
            })()`), true);
            // Review actual submitted pages at phone width, not only their setup screens.
            await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
            const playMaths = (mode, count, partial = false, invalid = false) => evaluate(`(() => {
                const $ = id => document.getElementById(id);
                const lesson = JSON.parse($('lesson-data').textContent);
                document.querySelector('[data-tab="quiz"]').click();
                $('player').value = 'Kontrola';
                document.querySelector('[data-mode="${mode}"]').click();
                if ($('name-error').textContent || $('player').hasAttribute('aria-invalid')) throw new Error('Valid name rejected');
                let total = 0;
                let maximum = 0;
                const seen = [];
                const mix = { easy: 0, medium: 0, hard: 0 };
                for (let index = 0; index < ${count}; index++) {
                    const exercise = lesson.exercises.find(task => task.prompt === $('question').textContent);
                    if (!exercise || seen.includes(exercise.id)) throw new Error('Unknown or duplicate task');
                    seen.push(exercise.id);
                    mix[exercise.difficulty]++;
                    maximum += { easy: 11, medium: 20, hard: 30 }[exercise.difficulty];
                    const prompt = $('question').textContent;
                    $('next').click();
                    if ($('question').textContent !== prompt) throw new Error('Advanced before submitting');
                    const inputs = [...$('answers').querySelectorAll('input')];
                    if (inputs.length !== exercise.steps.length) throw new Error('Wrong answer-field count');
                    if (exercise.difficulty === 'easy' && ![...$('answers').querySelectorAll('label')]
                        .every((label, step) => label.textContent.startsWith(String(index + 1) + 'abcd'[step] + ':'))) {
                        throw new Error('Missing easy subitem labels');
                    }
                    exercise.steps.forEach((step, stepIndex) => {
                        const answer = step.answer;
                        const equivalent = {
                            integer: answer.value,
                            fraction: answer.format === 'fraction' ? (-Number(answer.numerator) * 3) + '/' + (-Number(answer.denominator) * 3) : '',
                            decimal: ${JSON.stringify(mode)} === 'medium' ? answer.value : answer.value?.replace('.', ','),
                            length: '0.0015 km'
                        }[answer.format];
                        inputs[stepIndex].value = ${partial} && stepIndex === 0 ? '' :
                            ${invalid} && exercise.difficulty === 'easy' ?
                                { integer: '3.0', fraction: '1/0', decimal: '1,2.3', length: '1.5 kg' }[answer.format] : equivalent;
                    });
                    const earned = ${partial} ? { easy: 7.5, medium: 0, hard: 20 }[exercise.difficulty] :
                        ${invalid} && exercise.difficulty === 'easy' ? 0 : { easy: 11, medium: 20, hard: 30 }[exercise.difficulty];
                    total += earned;
                    $('answers').requestSubmit();
                    if ($('feedback').hidden || $('next').hidden) throw new Error('Missing feedback');
                    if (!inputs.every(input => input.disabled)) throw new Error('Answer fields remain editable');
                    if (!$('feedback').textContent.includes('Body: ' + String(earned).replace('.', ','))) {
                        throw new Error('Wrong feedback points');
                    }
                    exercise.steps.forEach(step => {
                        if (!$('feedback').textContent.includes(formatAnswer(step.answer)) ||
                            !$('feedback').textContent.includes(step.solution)) throw new Error('Missing worked answer');
                    });
                    if (${partial} && !$('feedback').textContent.includes('Odpověď chybí')) throw new Error('Missing blank feedback');
                    if (${invalid} && exercise.difficulty === 'easy' &&
                        !['celé číslo', 'Jmenovatel', 'desetinnou čárkou', 'jednotkou'].every(text => $('feedback').textContent.includes(text))) {
                        throw new Error('Malformed answers did not receive explicit feedback');
                    }
                    const feedback = $('feedback').textContent;
                    $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                    if ($('feedback').textContent !== feedback) throw new Error('Duplicate submission changed feedback');
                    if (document.documentElement.scrollWidth > innerWidth) throw new Error('Feedback overflows');
                    $('next').click();
                }
                const record = JSON.parse(sessionStorage.getItem('maths-tutor:v2:' + lesson.id)).at(-1);
                if (record.name !== 'Kontrola' || !record.id || !record.time || 'duration' in record) throw new Error('Invalid named untimed result');
                if (!$('leaderboard-content').textContent.includes(record.name)) throw new Error('Missing player result');
                const saved = { mode: record.mode, total: record.total, maximum: record.maximum, grade: record.grade };
                const records = $('leaderboard-content').querySelectorAll('tbody tr').length;
                $('next').click();
                $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                if ($('leaderboard-content').querySelectorAll('tbody tr').length !== records) throw new Error('Duplicate finish');
                const result = {
                    mix, saved, total, maximum, summary: $('summary').children.length, grade: $('grade').textContent,
                    visible: !$('results').hidden, fits: document.documentElement.scrollWidth <= innerWidth
                };
                $('restart').click();
                if ($('setup').hidden || !$('results').hidden) throw new Error('Restart failed');
                return result;
            })()`);
            for (const [mode, count, mix, maximum] of [
                ['easy', 3, { easy: 1, medium: 1, hard: 1 }, 61],
                ['medium', 5, { easy: 1, medium: 2, hard: 2 }, 111],
                ['hard', 10, { easy: 2, medium: 5, hard: 3 }, 212]
            ]) {
                await client.send('Emulation.setEmulatedMedia', {
                    features: [{ name: 'prefers-color-scheme', value: mode === 'medium' ? 'light' : 'dark' }]
                });
                const result = await playMaths(mode, count);
                assert.deepEqual(result.mix, mix);
                assert.deepEqual(result.saved, { mode, total: maximum, maximum, grade: 1 });
                assert.equal(result.summary, count);
                assert.equal(result.visible, true);
                assert.equal(result.fits, true);
                assert.match(result.grade, new RegExp(`${maximum}/${maximum}.*Známka: 1`));
            }
            const partial = await playMaths('easy', 3, true);
            assert.deepEqual(partial.saved, { mode: 'easy', total: 27.5, maximum: 61, grade: 3 });
            assert.match(partial.grade, /27,5\/61.*Známka: 3/);
            const invalid = await playMaths('easy', 3, false, true);
            assert.deepEqual(invalid.saved, { mode: 'easy', total: 50, maximum: 61, grade: 1 });
            assert.equal(await evaluate('window.timerStarts'), 0);
        } else {
            for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
                const result = await evaluate(`(() => {
                    const $ = id => document.getElementById(id);
                    const lesson = JSON.parse($('lesson-data').textContent);
                    document.querySelector('[data-tab="quiz"]').click();
                    $('player').value = 'Kontrola';
                    document.querySelector('[data-mode="${mode}"]').click();
                    const bonus = $('bonus').textContent;
                    for (let index = 0; index < ${count}; index++) {
                        const question = lesson.questions.find(q => q.prompt === $('question').textContent);
                        if (question.type === 'text') {
                            $('answer-input').value = question.acceptedAnswers[0];
                            $('answers').requestSubmit();
                        } else $('answers').querySelectorAll('button')[question.answer].click();
                        if ($('feedback').hidden || $('next').hidden) throw new Error('Missing feedback');
                        const feedback = $('feedback').textContent;
                        $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                        if ($('feedback').textContent !== feedback) throw new Error('Duplicate submission changed feedback');
                        $('next').click();
                    }
                    const result = {
                        bonus, summary: $('summary').children.length,
                        grade: $('grade').textContent, visible: !$('results').hidden,
                        saved: JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1).total,
                        fits: document.documentElement.scrollWidth <= innerWidth
                    };
                    $('restart').click();
                    return result;
                })()`);
                assert.match(result.bonus, /bonus/);
                assert.equal(result.summary, count);
                assert.equal(result.visible, true);
                assert.equal(result.fits, true);
                assert.equal(result.saved, maximum * 2);
                assert.match(result.grade, new RegExp(`základ ${maximum}/${maximum}, bonus ${maximum}.*Známka: 1`));
            }
        }
        const storageKey = `${subject}-tutor:v${subject === 'maths' ? 2 : 1}:${lesson.id}`;
        const savedCount = subject === 'maths' ? 5 : 3;
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
        const finishEasy = `(() => {
            const $ = id => document.getElementById(id);
            const lesson = JSON.parse($('lesson-data').textContent);
            document.querySelector('[data-tab="quiz"]').click();
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
            if (scenario === 'corrupt') assert.equal(await evaluate(`sessionStorage.getItem('${storageKey}')`), '{"broken":true}');
            if (scenario === 'write-denied') {
                await evaluate(`Storage.prototype.setItem = window.originalSetItem; document.getElementById('restart').click();`);
                await evaluate(finishEasy);
                assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true);
                assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('${storageKey}')).length`), 2);
            }
            await evaluate(`document.getElementById('restart').click(); document.getElementById('player').value = '';
                document.querySelector('[data-mode="easy"]').click();`);
            assert.equal(await evaluate('!document.getElementById("setup").hidden && !!document.getElementById("name-error").textContent'), true);
            await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
