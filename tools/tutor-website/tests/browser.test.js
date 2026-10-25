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
const { mathsLesson } = require('./fixture.js');
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

test('real offline pages support narrow layouts, themes, glossary, reveals and history quiz', {
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
    for (const [subject, lesson] of [['maths', mathsLesson()], ['history', history]]) {
        const file = path.join(directory, `${subject}.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(50);
        }
        assert.equal(await evaluate('document.getElementById("topic")?.textContent'), lesson.topic);
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
                for (const tab of subject === 'maths' ? ['learning', 'practice'] : ['original', 'learning', 'quiz']) {
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
        if (subject === 'maths') {
            assert.deepEqual(await evaluate(`(() => {
                document.querySelector('[data-tab="practice"]').click();
                const details = document.querySelector('#exercises details');
                details.querySelector('summary').click();
                return {
                    examples: document.querySelectorAll('#examples > article').length,
                    exercises: document.querySelectorAll('#exercises > article').length,
                    opened: details.open,
                    unavailable: document.getElementById('assessment-notice').textContent.includes('zatím nejsou dostupné'),
                    controls: document.querySelectorAll('input, [data-mode], #bonus, #results').length
                };
            })()`), { examples: 4, exercises: 10, opened: true, unavailable: true, controls: 0 });
            assert.equal(await evaluate(`(() => {
                const details = document.querySelector('#examples details');
                details.querySelector('summary').click();
                return details.open;
            })()`), true);
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
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
