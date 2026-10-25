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
const history = require('../examples/defenestrace.json');
const defaultMaths = require('../examples/zlomky-a-prevody-delky.json');

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
    const capture = async name => {
        if (!process.env.TUTOR_SCREENSHOT_DIRECTORY) return;
        fs.mkdirSync(process.env.TUTOR_SCREENSHOT_DIRECTORY, { recursive: true });
        await evaluate('Promise.all(document.getAnimations().map(animation => animation.finished))');
        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
    };
    for (const [subject, lesson] of [
        ['maths', { ...mathsAssessmentLesson(), id: 'shared-lesson-id' }],
        ['history', { ...history, id: 'shared-lesson-id' }],
        ['maths', defaultMaths]
    ]) {
        if (subject === 'maths' && lesson.id === 'shared-lesson-id') {
            lesson.glossary[0].icon = '<img src=x onerror=alert(1)>';
        }
        const file = path.join(directory, `${subject}-${lesson.id}.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(50);
        }
        assert.equal(await evaluate('document.getElementById("topic")?.textContent'), lesson.topic);
        assert.equal(await evaluate('document.getElementById("subtitle").textContent'), lesson.subtitle);
        assert.equal(await evaluate('document.querySelector("#original-content .card-icon").textContent'), lesson.original[0].icon || '📄');
        assert.equal(await evaluate('document.querySelector("#glossary .card-icon").textContent'), lesson.glossary[0].icon || '📖');
        assert.equal(await evaluate('document.querySelectorAll("img, svg").length'), 0, 'icon markup remains plain text');
        assert.equal(await evaluate(`(() => {
            const article = document.querySelector('#original-content article');
            return article.classList.contains('callout-' + ${JSON.stringify(lesson.original[0].style)});
        })()`), true);
        assert.equal(await evaluate(`(() => {
            document.querySelector('[data-tab="learning"]').click();
            return document.querySelectorAll('#learning-content .callout-label').length;
        })()`), subject === 'maths' ? lesson.examples.reduce((sum, example) => sum + (example.paragraphs?.length || 0), 0)
            : lesson.chunks.reduce((sum, chunk) => sum + (chunk.paragraphs?.length || 0), 0));
        assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true, `${subject}: isolated result namespace`);
        for (const width of [320, 1024, 1600]) {
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
                    await capture(`${subject}-${tab}-${width}-${theme}`);
                }
                assert.deepEqual(await evaluate(`(() => {
                    document.querySelector('[data-tab="learning"]').click();
                    const content = document.getElementById('learning-content').getBoundingClientRect();
                    const glossary = document.querySelector('.glossary-card').getBoundingClientRect();
                    return {
                        sideBySide: glossary.left >= content.right,
                        stacked: glossary.top >= content.bottom,
                        labelled: [...document.querySelectorAll('[data-tab]')].every(tab =>
                            tab.getAttribute('aria-controls') === tab.dataset.tab)
                    };
                })()`), {
                    sideBySide: false, stacked: true,
                    labelled: true
                }, `${subject}/${width}/${theme} shared layout`);
            }
        }
        await client.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        });
        assert.deepEqual(await evaluate(`(() => {
            const feedback = document.getElementById('feedback');
            feedback.classList.add('failure');
            const animation = getComputedStyle(feedback).animationName;
            const transition = getComputedStyle(document.getElementById('theme')).transitionDuration;
            feedback.classList.remove('failure');
            return { animation, transition };
        })()`), { animation: 'none', transition: '0s' }, `${subject}: reduced motion`);
        await client.send('Emulation.setEmulatedMedia', { features: [] });
        assert.equal(await evaluate(`(() => {
            document.querySelector('[data-tab="learning"]').click();
            document.querySelector('.glossary-card').open = true;
            document.querySelector('#glossary button').click();
            const open = document.getElementById('definition').matches(':popover-open');
            document.getElementById('definition-close').click();
            return open && !!document.getElementById('definition-text').textContent;
        })()`), true);
        assert.equal(await evaluate('document.activeElement === document.querySelector("#glossary button")'), true);
        for (const width of [320, 1600]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            assert.equal(await evaluate(`(async () => {
                const trigger = document.querySelector('#learning-content .term');
                trigger.scrollIntoView({ block: 'center' });
                trigger.click();
                await Promise.all(document.getAnimations().map(animation => animation.finished));
                const panel = document.getElementById('definition');
                const bounds = panel.getBoundingClientRect();
                return panel.matches(':popover-open') && bounds.left >= 0 && bounds.right <= innerWidth &&
                    bounds.top >= 0 && bounds.bottom <= innerHeight &&
                    trigger.getAttribute('aria-expanded') === 'true' &&
                    document.activeElement === document.getElementById('definition-close');
            })()`), true, `${subject}/${width}: anchored glossary fits viewport`);
            await capture(`${subject}-popover-${width}`);
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            await delay(50);
            assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
                document.activeElement.classList.contains('term') &&
                document.activeElement.getAttribute('aria-expanded') === 'false'`), true, `${subject}: Escape restores focus`);
            await evaluate(`document.activeElement.click()`);
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 895, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 895, button: 'left', clickCount: 1 });
            await delay(50);
            assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
                document.querySelector('#learning-content .term').getAttribute('aria-expanded') === 'false'`), true, `${subject}: light dismiss`);
        }
        assert.equal(await evaluate(`(() => {
            document.querySelector('#glossary button').click();
            document.querySelector('[data-tab="quiz"]').click();
            return !document.getElementById('definition').matches(':popover-open') &&
                !document.getElementById('scoring-rules').open && !document.getElementById('leaderboard').open &&
                [...document.querySelectorAll('[data-mode]')].every(mode => !/bod/.test(mode.textContent)) &&
                [...document.querySelectorAll('#original-content h2, #learning-content article h2')]
                    .every(title => title.querySelector('.card-icon[aria-hidden="true"]'));
        })()`), true, `${subject}: quiet setup and decorative card icons`);
        assert.equal(await evaluate(`(async () => {
            const image = new Image();
            image.src = document.querySelector('link[rel="icon"]').href;
            await image.decode();
            return [16, 32].every(size => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, size, size);
                const pixels = context.getImageData(0, 0, size, size).data;
                let white = 0, blue = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) white++;
                    if (pixels[i + 2] > pixels[i] + 40 && pixels[i + 3] > 200) blue++;
                }
                return white > size && blue > size * size / 3;
            });
        })()`), true, `${subject}: offline favicon renders at 16 and 32 pixels`);
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
                    levels: exercises.map(exercise => exercise.querySelector('.heading-text').textContent.replace(/^\\d+\\. /, ''))
                };
            })()`), {
                openDetails: [lesson.examples[0].steps.length + 2, 1, 0, 0], firstBeforePractice: true,
                levels: ['Lehká skupina', 'Lehká skupina', ...Array(5).fill('Slovní úloha'), ...Array(3).fill('Úloha ve třech krocích')]
            });
            assert.equal(await evaluate(`(() => {
                const details = document.querySelector('#examples > article:nth-child(3) details');
                details.querySelector('summary').click();
                return details.open;
            })()`), true);
            // Review actual submitted pages at phone width, not only their setup screens.
            await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
            const playMaths = (mode, count, partial = false, invalid = false, policyPartial = false) => evaluate(`(() => {
                const $ = id => document.getElementById(id);
                const lesson = JSON.parse($('lesson-data').textContent);
                window.answerClock = 0;
                Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
                document.querySelector('[data-tab="quiz"]').click();
                $('player').value = 'Kontrola';
                document.querySelector('[data-mode="${mode}"]').click();
                if ($('name-error').textContent || $('player').hasAttribute('aria-invalid')) throw new Error('Valid name rejected');
                if ($('score').textContent !== 'Skóre: 0 b') throw new Error('Score did not reset');
                if ($('quiz-progress').max !== ${count} || $('quiz-progress').value !== 0) throw new Error('Invalid initial progress');
                let total = 0;
                let maximum = 0;
                const seen = [];
                const mix = { easy: 0, medium: 0, hard: 0 };
                let previousLevel = -1;
                for (let index = 0; index < ${count}; index++) {
                    const exercise = lesson.exercises.find(task => task.prompt === $('question').textContent);
                    if (!exercise || seen.includes(exercise.id)) throw new Error('Unknown or duplicate task');
                    const level = ['easy', 'medium', 'hard'].indexOf(exercise.difficulty);
                    if (level < previousLevel) throw new Error('Difficulty went backwards');
                    previousLevel = level;
                    if ($('difficulty').dataset.level !== exercise.difficulty) throw new Error('Wrong difficulty badge');
                    if ($('question').getBoundingClientRect().top < $('page-header').getBoundingClientRect().bottom) throw new Error('Question covered by sticky header');
                    if (getComputedStyle($('question').firstChild).animationName !== 'reveal') throw new Error('Missing question animation');
                    seen.push(exercise.id);
                    mix[exercise.difficulty]++;
                    maximum += { easy: 11, medium: 20, hard: 30 }[exercise.difficulty];
                    const prompt = $('question').textContent;
                    $('next').click();
                    if ($('question').textContent !== prompt) throw new Error('Advanced before submitting');
                    const inputs = [...$('answers').querySelectorAll('input')];
                    if (inputs.length !== exercise.steps.length) throw new Error('Wrong answer-field count');
                    [...$('answers').querySelectorAll('label')].forEach((label, step) => {
                        if (label.textContent.includes('(včetně jednotky)') !== (exercise.steps[step].answer.format === 'length')) {
                            throw new Error('Unit-bearing fields are not distinguished from numeric fields');
                        }
                    });
                    if (exercise.difficulty === 'easy' && ![...$('answers').querySelectorAll('label')]
                        .every((label, step) => label.textContent.startsWith(String(index + 1) + 'abcd'[step] + ':'))) {
                        throw new Error('Missing easy subitem labels');
                    }
                    exercise.steps.forEach((step, stepIndex) => {
                        const answer = step.answer;
                        const equivalent = {
                            integer: answer.value,
                            fraction: answer.format === 'fraction' ? (${JSON.stringify(mode)} === 'easy' ?
                                String(Number(answer.numerator) / Number(answer.denominator)).replace('.', ',') :
                                (-Number(answer.numerator) * 3) + '/' + (-Number(answer.denominator) * 3)) : '',
                            decimal: answer.value === '1.5' ? '1 1/2' : ${JSON.stringify(mode)} === 'medium' ? answer.value : answer.value?.replace('.', ','),
                            length: Number(answer.value) * { mm: 1, cm: 10, dm: 100, m: 1000, km: 1000000 }[answer.unit] + ' mm'
                        }[answer.format];
                        const representation = step.assessment.exact.type === 'string' ? step.assessment.exact.value : equivalent;
                        inputs[stepIndex].value = ${partial} && stepIndex === 0 ? '' :
                            ${invalid} && exercise.difficulty === 'easy' ?
                                { integer: '3+0', fraction: '1/0', decimal: '1,2.3', length: '1.5 kg' }[answer.format] :
                                ${policyPartial} && step.assessment.partial?.match.type === 'string' ? '3/6' : representation;
                    });
                    const representationPartial = ${policyPartial} && exercise.steps.some(step => step.assessment.partial?.match.type === 'string');
                    const earned = ${partial} ? { easy: 7.5, medium: 0, hard: 20 }[exercise.difficulty] :
                        representationPartial ? 8.75 :
                        ${invalid} && exercise.difficulty === 'easy' ? 0 : { easy: 11, medium: 20, hard: 30 }[exercise.difficulty];
                    total += earned;
                    window.answerClock += 2000;
                    $('answers').requestSubmit();
                    if ($('score').textContent !== 'Skóre: ' + String(total).replace('.', ',') + ' b') throw new Error('Wrong running score');
                    if ($('quiz-progress').value !== index + 1) throw new Error('Wrong submitted progress');
                    if ($('feedback').hidden || $('next').hidden) throw new Error('Missing feedback');
                    if (representationPartial && (!$('feedback').textContent.includes('Částečně správně') ||
                        !$('feedback').textContent.includes('Body za výpočet: 1,25'))) throw new Error('Missing partial-credit feedback');
                    if (!$('feedback').classList.contains(earned === { easy: 11, medium: 20, hard: 30 }[exercise.difficulty] ?
                        'success' : earned > 0 ? 'encouragement' : 'try-again')) throw new Error('Missing shared feedback styling');
                    if (!inputs.every(input => input.disabled)) throw new Error('Answer fields remain editable');
                    if (!$('feedback').textContent.includes('Body: ' + String(earned).replace('.', ','))) {
                        throw new Error('Wrong feedback points');
                    }
                    exercise.steps.forEach(step => {
                        if (![...$('feedback').querySelectorAll('p')].some(paragraph =>
                            paragraph.textContent.startsWith('Správná odpověď: ' + formatAnswer(step.answer) + '. ')) ||
                            !$('feedback').textContent.includes(step.solution)) throw new Error('Missing worked answer');
                    });
                    if (${partial} && !$('feedback').textContent.includes('Odpověď chybí')) throw new Error('Missing blank feedback');
                    if (${invalid} && exercise.difficulty === 'easy' &&
                        !exercise.steps.every(step => $('feedback').textContent.includes({
                            integer: 'celé nebo desetinné', fraction: 'Jmenovatel', decimal: 'celé nebo desetinné', length: 'jednotkou'
                        }[step.answer.format]))) {
                        throw new Error('Malformed answers did not receive explicit feedback');
                    }
                    const feedback = $('feedback').textContent;
                    $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                    if ($('feedback').textContent !== feedback) throw new Error('Duplicate submission changed feedback');
                    if ($('score').textContent !== 'Skóre: ' + String(total).replace('.', ',') + ' b' ||
                        $('quiz-progress').value !== index + 1) throw new Error('Duplicate submission changed status');
                    if (document.documentElement.scrollWidth > innerWidth) throw new Error('Feedback overflows');
                    window.answerClock += 30000;
                    $('next').click();
                }
                const record = JSON.parse(sessionStorage.getItem('maths-tutor:v2:' + lesson.id)).at(-1);
                if (record.name !== 'Kontrola' || !record.id || !record.time || 'duration' in record) throw new Error('Invalid named untimed result');
                if (record.answerDurationMs !== ${count} * 2000) throw new Error('Maths duration includes feedback');
                if ($('results-title').getBoundingClientRect().top < $('page-header').getBoundingClientRect().bottom) throw new Error('Completion covered by sticky header');
                if (!$('answer-duration').textContent.includes('Doba odpovídání:') ||
                    $('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('Missing quiet completion');
                if (getComputedStyle(document.querySelector('.confetti span')).animationName !== 'confetti') throw new Error('Missing completion confetti');
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
            const representationPartial = await playMaths('hard', 10, false, false, true);
            assert.deepEqual(representationPartial.saved, {
                mode: 'hard', total: lesson.id === defaultMaths.id ? 209.75 : 207.5, maximum: 212, grade: 1
            });
            assert.equal(await evaluate('window.timerStarts'), 0);
        } else {
            for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
                const result = await evaluate(`(() => {
                    const $ = id => document.getElementById(id);
                    const lesson = JSON.parse($('lesson-data').textContent);
                    window.answerClock = 0;
                    Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
                    document.querySelector('[data-tab="quiz"]').click();
                    $('player').value = 'Kontrola';
                    document.querySelector('[data-mode="${mode}"]').click();
                    const bonus = $('bonus').textContent === '' && $('bonus').getAttribute('aria-hidden') === 'true' &&
                        $('bonus-bar').style.transform === 'scaleX(1)';
                    if ($('score').textContent !== 'Skóre: 0 b' || $('quiz-progress').value !== 0 ||
                        $('quiz-progress').max !== ${count}) throw new Error('Invalid initial quiz status');
                    let total = 0;
                    let partials = 0;
                    let previousLevel = -1;
                    for (let index = 0; index < ${count}; index++) {
                        const question = lesson.questions.find(q => q.prompt === $('question').textContent);
                        const level = ['easy', 'medium', 'hard'].indexOf(question.difficulty);
                        if (level < previousLevel) throw new Error('History difficulty went backwards');
                        previousLevel = level;
                        window.answerClock += 2000;
                        if (question.type === 'text') {
                            const partialYear = ${JSON.stringify(mode)} === 'hard' && question.id === 'h-bitva';
                            $('answer-input').value = partialYear ? '1618' : question.acceptedAnswers[0];
                            if (partialYear) partials++;
                            $('answers').requestSubmit();
                        } else $('answers').querySelectorAll('button')[question.answer].click();
                        const partialYear = ${JSON.stringify(mode)} === 'hard' && question.id === 'h-bitva';
                        total += partialYear ? 15 : { easy: 10, medium: 20, hard: 30 }[question.difficulty] * 2;
                        if (partialYear && (!$('feedback').textContent.includes('polovinu bodů') ||
                            $('feedback').textContent.includes('bonus +'))) throw new Error('Incorrect history partial feedback/bonus');
                        if ($('score').textContent !== 'Skóre: ' + total + ' b' ||
                            $('quiz-progress').value !== index + 1) throw new Error('Wrong history quiz status');
                        if ($('feedback').hidden || $('next').hidden) throw new Error('Missing feedback');
                        const feedback = $('feedback').textContent;
                        $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                        if ($('feedback').textContent !== feedback) throw new Error('Duplicate submission changed feedback');
                        window.answerClock += 30000;
                        $('next').click();
                    }
                    const record = JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1);
                    if (record.answerDurationMs !== ${count} * 2000 || record.duration !== ${count} * 2) throw new Error('History duration includes feedback');
                    if ($('results-title').getBoundingClientRect().top < $('page-header').getBoundingClientRect().bottom) throw new Error('History completion covered by sticky header');
                    if ($('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('Rank not in collapsed leaderboard');
                    const result = {
                        bonus, partials, summary: $('summary').children.length,
                        grade: $('grade').textContent, visible: !$('results').hidden,
                        saved: JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1).total,
                        fits: document.documentElement.scrollWidth <= innerWidth
                    };
                    $('restart').click();
                    return result;
                })()`);
                assert.equal(result.bonus, true);
                assert.equal(result.summary, count);
                assert.equal(result.visible, true);
                assert.equal(result.fits, true);
                const base = maximum - (mode === 'hard' ? 15 : 0);
                const bonus = maximum - (mode === 'hard' ? 30 : 0);
                assert.equal(result.partials, mode === 'hard' ? 1 : 0);
                assert.equal(result.saved, base + bonus);
                assert.match(result.grade, new RegExp(`základ ${base}/${maximum}, bonus ${bonus}.*Známka: 1`));
            }
        }
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
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            assert.deepEqual(await evaluate(`(() => {
                const confetti = getComputedStyle(document.querySelector('.confetti span'));
                return { animation: confetti.animationName, opacity: confetti.opacity };
            })()`), { animation: 'none', opacity: '0' }, `${subject}: no confetti with reduced motion`);
            await capture(`${subject}-completion-320`);
            await client.send('Emulation.setEmulatedMedia', { features: [] });
            await evaluate(`document.getElementById('restart').click(); document.getElementById('player').value = '';
                document.querySelector('[data-mode="easy"]').click();`);
            assert.equal(await evaluate('!document.getElementById("setup").hidden && !!document.getElementById("name-error").textContent'), true);
            await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
