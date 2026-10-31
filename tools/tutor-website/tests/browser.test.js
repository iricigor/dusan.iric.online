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
const { questionBank } = require('../runtime.js');
const subjectExports = { history: require('../history.js'), maths: require('../maths.js') };
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
                reject(new Error(`CDP timeout: ${method}${params.expression ? `: ${params.expression.slice(0, 180)}` : ''}`));
            }, 10000);
            pending.set(id, { resolve, reject, timeout });
            socket.send(JSON.stringify({ id, method, params }));
        })
    };
}

test('real offline pages share navigation, named quizzes, persistence and storage failures across subjects', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 180000
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
    let onDialog;
    client = await connect(target.webSocketDebuggerUrl, event => {
        if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails);
        if (event.method === 'Network.requestWillBeSent' && /^https?:/.test(event.params.request.url)) network.push(event.params.request.url);
        if (event.method === 'Page.javascriptDialogOpening') onDialog?.(event.params);
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        const startTransition = document.startViewTransition?.bind(document);
        window.tabTransitions = [];
        if (startTransition) document.startViewTransition = update => {
            const transition = startTransition(update);
            window.tabTransitions.push(transition);
            return transition;
        };
        window.waitForTutorTab = async () => {
            const transition = window.tabTransitions.at(-1);
            if (transition) await transition.finished;
        };
        window.switchTutorTab = async name => {
            document.querySelector('[data-tab="' + name + '"]').click();
            await window.waitForTutorTab();
        };
    ` });
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const downloads = path.join(directory, 'downloads');
    fs.mkdirSync(downloads);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const evaluate = async (expression, userGesture = false) => {
        const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
        assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
        return response.result.value;
    };
    const handleDialog = async (action, accept, type) => {
        let timeout;
        const opened = new Promise((resolve, reject) => {
            onDialog = resolve;
            timeout = setTimeout(() => reject(new Error(`Expected ${type} dialog`)), 10000);
        });
        const pendingAction = action();
        // Attach immediately so a failed action does not become an unhandled rejection.
        const completed = pendingAction.then(value => ({ value }), error => ({ error }));
        try {
            const dialog = await opened;
            await client.send('Page.handleJavaScriptDialog', { accept });
            assert.equal(dialog.type, type);
            const result = await completed;
            if (result.error) throw result.error;
            return dialog;
        } finally {
            clearTimeout(timeout);
            onDialog = undefined;
        }
    };
    const capture = async name => {
        if (!process.env.TUTOR_SCREENSHOT_DIRECTORY) return;
        fs.mkdirSync(process.env.TUTOR_SCREENSHOT_DIRECTORY, { recursive: true });
        // Headless rendering can throttle animations inside offscreen disclosures.
        await evaluate('document.getAnimations().forEach(animation => animation.finish())');
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
        for (const width of [1280, 760, 550, 375]) {
            await client.send('Emulation.setDeviceMetricsOverride', {
                width, height: 900, deviceScaleFactor: 1, mobile: false
            });
            assert.equal(await evaluate(`(() => {
                const share = document.querySelector('.lesson-share');
                const introduction = document.querySelector('#original-content > :first-child');
                const qr = share.querySelector('svg').getBoundingClientRect();
                const a = introduction.getBoundingClientRect();
                const b = share.getBoundingClientRect();
                const remaining = [...document.querySelectorAll('#original-content > :not(:first-child)')];
                return share.closest('[role="tabpanel"]').id === 'original' &&
                    (${width} > 760 ? b.left >= a.right && Math.abs(b.top - a.top) < 1 :
                        b.top >= a.bottom && Math.abs(b.left - a.left) < 1) &&
                    remaining.every(article => article.getBoundingClientRect().top >= b.bottom &&
                        article.getBoundingClientRect().width > a.width - 1) &&
                    qr.width >= 170 && Math.abs(qr.width - qr.height) < 1 &&
                    document.documentElement.scrollWidth <= window.innerWidth;
            })()`), true, `${subject}: QR introduction placement at ${width}px`);
        }
        await client.send('Emulation.clearDeviceMetricsOverride');
        for (const tab of ['learning', 'quiz', 'original']) {
            await evaluate(`window.switchTutorTab('${tab}')`);
            assert.equal(await evaluate(`document.querySelector('.lesson-share').checkVisibility()`),
                tab === 'original', `${subject}: QR visibility on ${tab}`);
        }
        assert.equal(await evaluate(`(async () => {
            if (typeof document.startViewTransition !== 'function') return false;
            document.querySelector('[data-tab="learning"]').click();
            const transition = window.tabTransitions.at(-1);
            await transition.ready;
            const animations = document.getAnimations();
            const fadeIn = animations.find(animation => animation.animationName === 'tab-enter');
            const fadeOut = animations.find(animation => animation.animationName === 'tab-leave');
            const animated = fadeIn?.effect.getTiming().duration === 300 &&
                fadeOut?.effect.getTiming().duration === 180;
            await transition.finished;
            ['quiz', 'original', 'learning', 'original'].forEach(name =>
                document.querySelector('[data-tab="' + name + '"]').click());
            await window.waitForTutorTab();
            return animated && !document.getElementById('original').hidden &&
                document.getElementById('learning').hidden && document.getElementById('quiz').hidden &&
                document.querySelector('[aria-selected="true"]').dataset.tab === 'original' &&
                document.querySelectorAll('[role="tab"][tabindex="0"]').length === 1;
        })()`), true, `${subject}: native outgoing/incoming transitions and latest rapid selection wins`);
        assert.equal(await evaluate(`(async () => {
            const start = document.startViewTransition;
            document.startViewTransition = undefined;
            await window.switchTutorTab('quiz');
            const animations = document.getElementById('quiz').getAnimations();
            const fade = animations.find(animation => animation.effect.getKeyframes()[0].opacity === '0');
            const animated = fade?.effect.getTiming().duration === 300;
            await Promise.all(animations.map(animation => animation.finished));
            document.startViewTransition = start;
            await window.switchTutorTab('original');
            return animated;
        })()`), true, `${subject}: graceful entrance animation without View Transition API`);
        assert.equal(await evaluate('document.getElementById("subtitle").textContent'), lesson.subtitle);
        assert.equal(await evaluate('document.querySelector("#original-content .card-icon").textContent'), lesson.original[0].icon || '📄');
        assert.equal(await evaluate('document.querySelector("#glossary .card-icon").textContent'), lesson.glossary[0].icon || '📖');
        assert.equal(await evaluate('document.querySelectorAll(".card-icon img, .card-icon svg").length'), 0, 'lesson icon markup remains plain text');
        assert.equal(await evaluate(`(async () => {
            const images = [...document.querySelectorAll('img')];
            await Promise.all(images.map(image => image.decode()));
            return images.length === 2 && images.every(image =>
                image.alt === '' && image.src.startsWith('data:image/svg+xml,') &&
                image.naturalWidth > 0 && !image.closest('a, button'));
        })()`), true, `${subject}: both decorative identity marks decode offline`);
        assert.equal(await evaluate('document.getElementById("audience")'), null);
        assert.equal(await evaluate(`document.getElementById('setup').textContent.includes('Na server nic neposíláme')`), false);
        assert.equal(await evaluate(`(() => {
            const article = document.querySelector('#original-content article');
            const style = ${JSON.stringify(lesson.original[0].style || 'plain')};
            return style === 'plain' ? !article.classList.contains('callout') :
                article.classList.contains('callout-' + style);
        })()`), true);
        assert.equal(await evaluate(`(async () => {
            await window.switchTutorTab('learning');
            return document.querySelectorAll('#learning-content .callout-label').length;
        })()`), subject === 'maths' ? lesson.examples.reduce((sum, example) => sum + (example.paragraphs?.length || 0), 0)
            : lesson.chunks.reduce((sum, chunk) => sum + (chunk.paragraphs?.length || 0), 0));
        assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true, `${subject}: isolated result namespace`);
        assert.equal(await evaluate(`(() => {
            const details = [...document.querySelectorAll('#learning-content details')];
            const hints = [...document.querySelectorAll('#learning-content .hint-toggle')];
            return hints.length > 0 && details.every(item => !item.open) &&
                hints.every(item => item.getAttribute('aria-expanded') === 'false' &&
                    document.getElementById(item.getAttribute('aria-controls')).hidden) &&
                document.getElementById('collapse-learning').disabled &&
                !document.getElementById('expand-learning').disabled;
        })()`), true, `${subject}: all learning help starts collapsed`);
        assert.equal(await evaluate(`(() => {
            const details = [...document.querySelectorAll('#learning-content details')];
            const hints = [...document.querySelectorAll('#learning-content .hint-toggle')];
            window.initialLearningOpen = details.map(item => item.open);
            window.initialHintOpen = hints.map(item => item.getAttribute('aria-expanded') === 'true');
            const glossary = document.getElementById('glossary-drawer');
            const glossaryOpen = glossary.matches(':popover-open');
            const rules = document.getElementById('scoring-rules');
            const leaderboard = document.getElementById('leaderboard');
            rules.open = leaderboard.open = true;
            document.getElementById('expand-learning').click();
            const expanded = details.length + hints.length > 0 && details.every(item => item.open) &&
                hints.every(item => item.getAttribute('aria-expanded') === 'true') &&
                document.getElementById('expand-learning').disabled &&
                !document.getElementById('collapse-learning').disabled;
            document.getElementById('collapse-learning').click();
            const collapsed = details.every(item => !item.open) &&
                hints.every(item => item.getAttribute('aria-expanded') === 'false') &&
                document.getElementById('collapse-learning').disabled &&
                !document.getElementById('expand-learning').disabled;
            const isolated = glossary.matches(':popover-open') === glossaryOpen && rules.open && leaderboard.open;
            rules.open = leaderboard.open = false;
            return expanded && collapsed && isolated;
        })()`), true, `${subject}: expand/collapse all affects only learning disclosures`);
        await evaluate(`document.querySelector('#learning-content .hint-toggle').focus()`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await delay(25);
        assert.deepEqual(await evaluate(`(() => {
            const hint = document.querySelector('#learning-content .hint');
            const trigger = hint.querySelector('.hint-toggle');
            const content = hint.querySelector('.hint-content');
            return { open: trigger.getAttribute('aria-expanded') === 'true' && !content.hidden,
                label: trigger.textContent,
                icon: trigger.querySelector('[aria-hidden="true"]').textContent,
                content: !!content.textContent,
                below: content.getBoundingClientRect().top >= hint.querySelector('.hint-prompt').getBoundingClientRect().bottom,
                connected: trigger.getAttribute('aria-controls') === content.id,
                collapseEnabled: !document.getElementById('collapse-learning').disabled,
                focused: document.activeElement === trigger };
        })()`), { open: true, label: 'Nápověda 💡', icon: '💡', content: true, below: true, connected: true, collapseEnabled: true, focused: true },
        `${subject}: compact hint opens with keyboard and updates controls`);
        await evaluate(`document.getElementById('collapse-learning').click()`);
        if (subject === 'history') {
            assert.deepEqual(await evaluate(`(() => {
                const data = JSON.parse(document.getElementById('lesson-data').textContent);
                const cards = document.querySelectorAll('#original-content > article');
                return {
                    reviewCard: document.getElementById('original-review'),
                    review: data.review, sources: data.sources,
                    corrections: document.querySelectorAll('#original-content .correction').length,
                    plainSections: [cards[0], cards[1]].every(card =>
                        card.className === 'card' && !card.querySelector('.callout-label'))
                };
            })()`), { reviewCard: null, review: lesson.review, sources: lesson.sources,
                corrections: lesson.corrections.length, plainSections: true },
            'history: no review card, retained provenance/corrections and matching regular first sections');
            assert.equal(await evaluate(`document.querySelectorAll('#original-content .callout-fun').length`), 2);
            assert.equal(await evaluate(`document.querySelector('#original-content blockquote.callout-quote').textContent`),
                lesson.original.at(-1).paragraphs.at(-1).text);
            await evaluate(`(async () => { await window.switchTutorTab('original');
                document.querySelector('#original-content blockquote').scrollIntoView({ block: 'center' }); })()`);
            await capture('history-original-quotation');
            await evaluate(`document.querySelector('#original-content .callout-fun').scrollIntoView({ block: 'center' })`);
            await capture('history-original-fun');
            await evaluate(`window.switchTutorTab('learning')`);
        }
        for (const width of [320, 400, 401, 550, 551, 1024, 1600]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            for (const theme of ['light', 'dark']) {
                await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
                for (let attempt = 0; attempt < 50; attempt++) {
                    if (await evaluate(`document.getElementById('theme').getAttribute('aria-checked') === '${theme === 'dark'}'`)) break;
                    await delay(20);
                }
                assert.equal(await evaluate('document.getElementById("theme").getAttribute("aria-checked")'), String(theme === 'dark'));
                const colors = await evaluate('({bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color})');
                assert.equal(colors.bg, theme === 'light' ? 'rgb(241, 245, 249)' : 'rgb(16, 24, 39)');
                assert.notEqual(colors.bg, colors.fg);
                assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${subject}/${width}/${theme} overflow`);
                assert.equal(await evaluate(`(() => {
                    document.getElementById('theme').click();
                    const expected = document.documentElement.dataset.theme === 'dark';
                    return document.getElementById('theme').getAttribute('role') === 'switch' &&
                        document.getElementById('theme').getAttribute('aria-checked') === String(expected) &&
                        document.querySelectorAll('#theme svg').length === 2 &&
                        expected === ${theme === 'light'};
                })()`), true, `${subject}: binary sun/moon state`);
                await evaluate('document.getElementById("theme").click(); delete document.documentElement.dataset.theme');
                const tabLayouts = [];
                for (const tab of ['original', 'learning', 'quiz']) {
                    assert.equal(await evaluate(`(async () => {
                        const tab = document.querySelector('[data-tab="${tab}"]');
                        tab.focus();
                        await window.switchTutorTab('${tab}');
                        window.scrollTo(0, 0);
                        return !document.getElementById('${tab}').hidden && tab.getAttribute('aria-selected') === 'true' &&
                            tab.getAttribute('role') === 'tab' && tab.tabIndex === 0 &&
                            !!tab.querySelector('svg[aria-hidden="true"]') &&
                            document.getElementById('${tab}').getAttribute('role') === 'tabpanel' &&
                            document.getElementById('${tab}').getAttribute('aria-labelledby') === tab.id
                            && document.documentElement.scrollWidth <= innerWidth;
                    })()`), true, `${subject}/${tab}/${width}/${theme}`);
                    tabLayouts.push(await evaluate(`(() => {
                        const main = document.querySelector('main').getBoundingClientRect();
                        const header = document.querySelector('.heading').getBoundingClientRect();
                        return {
                            horizontal: [main.left, main.width, header.left, header.width],
                            scrolling: document.documentElement.scrollHeight > document.documentElement.clientHeight,
                            gutter: getComputedStyle(document.documentElement).scrollbarGutter
                        };
                    })()`));
                    assert.equal(await evaluate(`document.getElementById('learning-controls').hidden`), tab !== 'learning');
                    assert.equal(await evaluate(`document.getElementById('quiz-tools').hidden`), tab !== 'quiz');
                    assert.equal(await evaluate(`(() => {
                        const mark = document.querySelector('.lesson-header-mark').getBoundingClientRect();
                        const heading = document.querySelector('.heading').getBoundingClientRect();
                        const identity = document.querySelector('.lesson-identity').getBoundingClientRect();
                        const text = document.querySelector('.lesson-title-group').getBoundingClientRect();
                        const title = document.getElementById('topic').getBoundingClientRect();
                        const subtitle = document.getElementById('subtitle').getBoundingClientRect();
                        const theme = document.getElementById('theme').getBoundingClientRect();
                        const tabs = document.querySelector('.tab-bar').getBoundingClientRect();
                        const main = document.querySelector('main').getBoundingClientRect();
                        const footer = document.querySelector('.lesson-footer').getBoundingClientRect();
                        const logo = document.querySelector('.lesson-footer-mark').getBoundingClientRect();
                        return mark.width === ${width <= 550 ? 48 : 64} && mark.height === mark.width &&
                            mark.right <= text.left && title.width >= 80 &&
                            heading.height <= innerHeight / 2 &&
                            (${width} <= 400 ? theme.bottom <= identity.top && theme.right <= heading.right :
                                text.right <= theme.left) &&
                            Math.abs((mark.top + mark.bottom - text.top - text.bottom) / 2) < 1 &&
                            title.top >= text.top && subtitle.bottom <= text.bottom &&
                            tabs.top >= Math.max(mark.bottom, text.bottom, theme.bottom) &&
                            footer.top >= main.bottom && logo.width === ${width <= 550 ? 64 : 96} &&
                            logo.height === logo.width &&
                            Math.abs((logo.left + logo.right) / 2 - (footer.left + footer.right) / 2) < 1 &&
                            logo.top >= footer.top && logo.bottom <= footer.bottom &&
                            document.querySelector('.lesson-footer').checkVisibility();
                    })()`), true, `${subject}/${tab}/${width}/${theme}: approved marks, title/subtitle alignment and footer placement`);
                    assert.equal(await evaluate(`(() => {
                        const badge = document.querySelector('.lesson-heading .badge');
                        const title = document.getElementById('topic');
                        const a = badge.getBoundingClientRect(), b = title.getBoundingClientRect();
                        return a.right <= b.left && a.top < b.bottom && a.bottom > b.top &&
                            parseFloat(getComputedStyle(badge).fontSize) < parseFloat(getComputedStyle(title).fontSize) &&
                            getComputedStyle(badge).borderRadius !== '0px' &&
                            getComputedStyle(document.getElementById('subtitle')).color === getComputedStyle(badge).color;
                    })()`), true, `${subject}/${width}/${theme}: badge/title share a row and subtitle uses the subject accent`);
                    if (tab === 'original') {
                        assert.equal(await evaluate(`[...document.querySelectorAll('#original-content article')].every(article => {
                            const style = getComputedStyle(article);
                            const available = article.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                            return Math.abs(article.querySelector('.original-text').getBoundingClientRect().width - available) <= 1;
                        })`), true, `${subject}/${width}/${theme}: original text fills each card's inner width`);
                    }
                    if (tab === 'learning') {
                        assert.equal(await evaluate(`(() => {
                            const hint = document.querySelector('#learning-content .hint');
                            const trigger = hint.querySelector('.hint-toggle');
                            const prompt = hint.querySelector('.hint-prompt');
                            const a = prompt.getBoundingClientRect(), b = trigger.getBoundingClientRect();
                            const firstText = [...prompt.childNodes].find(item => item.nodeType === Node.TEXT_NODE && item.textContent.trim());
                            const range = document.createRange();
                            range.setStart(firstText, 0);
                            range.setEnd(firstText, Math.min(5, firstText.textContent.length));
                            const text = range.getBoundingClientRect();
                            return Math.abs(a.right - b.right) <= 1 && Math.abs(a.top - b.top) <= 1 &&
                                getComputedStyle(trigger).float === 'right' &&
                                text.right <= b.left && text.top < b.bottom &&
                                hint.querySelector('.hint-content').hidden && b.height >= 44;
                        })()`), true, `${subject}/${width}/${theme}: hint floats within top-right paragraph text`);
                        assert.equal(await evaluate(`(() => {
                            const controls = document.getElementById('learning-controls');
                            const tabs = document.querySelector('[role="tablist"]').getBoundingClientRect();
                            const bounds = controls.getBoundingClientRect();
                            return !controls.closest('[role="tablist"]') && bounds.left >= tabs.right &&
                                [...controls.querySelectorAll('button')].every(button => {
                                    const rect = button.getBoundingClientRect();
                                    return button.textContent === '' && !!button.querySelector('svg[aria-hidden="true"]') &&
                                        button.title === button.getAttribute('aria-label') &&
                                        rect.width >= 44 && rect.height >= 44;
                                });
                        })()`), true, `${subject}/${width}/${theme}: compact labelled icons beside, not inside, the tablist`);
                        assert.equal(await evaluate(`[...document.querySelectorAll('#learning-content details')].every(details =>
                            getComputedStyle(details).borderTopWidth === '0px' &&
                            details.querySelector('summary').getBoundingClientRect().height <= 36 &&
                            parseFloat(getComputedStyle(details).marginTop) <= 3)`),
                        true, `${subject}: compact borderless numbered step/result reveals`);
                        assert.equal(await evaluate(`(() => {
                            const toggle = document.getElementById('glossary-toggle');
                            const drawer = document.getElementById('glossary-drawer');
                            const before = document.getElementById('learning-content').getBoundingClientRect();
                            const bookmark = toggle.getBoundingClientRect();
                            const main = document.querySelector('main').getBoundingClientRect();
                            const initiallyClosed = !drawer.matches(':popover-open') &&
                                toggle.getAttribute('aria-expanded') === 'false' && !toggle.hidden;
                            toggle.click();
                            document.getAnimations().forEach(animation => animation.finish());
                            const after = document.getElementById('learning-content').getBoundingClientRect();
                            const bounds = drawer.getBoundingClientRect();
                            return initiallyClosed && drawer.matches(':popover-open') &&
                                Math.abs(bookmark.left - Math.min(main.right, document.documentElement.clientWidth - bookmark.width)) <= 1 &&
                                bookmark.left >= document.querySelector('#learning-content .hint-prompt').getBoundingClientRect().right &&
                                toggle.getAttribute('aria-expanded') === 'true' &&
                                toggle.textContent.includes('🔖') &&
                                drawer.getAttribute('role') === 'dialog' &&
                                drawer.getAttribute('aria-modal') === 'false' &&
                                document.activeElement === document.getElementById('glossary-close') &&
                                Math.abs(before.width - after.width) <= 1 && before.left === after.left &&
                                bounds.left >= 0 && bounds.right <= innerWidth &&
                                Math.abs(bounds.right - document.documentElement.clientWidth) <= 1 &&
                                bounds.top === 0 && bounds.bottom <= innerHeight &&
                                document.documentElement.scrollWidth <= innerWidth;
                        })()`), true, `${subject}/${width}/${theme}: bookmark drawer overlays without reflow`);
                        await capture(`${subject}-drawer-${width}-${theme}`);
                        assert.equal(await evaluate(`(() => {
                            document.getElementById('glossary-close').click();
                            return !document.getElementById('glossary-drawer').matches(':popover-open') &&
                                document.getElementById('glossary-toggle').getAttribute('aria-expanded') === 'false' &&
                                document.activeElement === document.getElementById('glossary-toggle');
                        })()`), true, `${subject}: drawer close restores trigger focus`);
                    }
                    if (tab === 'quiz') {
                        assert.equal(await evaluate(`(() => {
                            const label = document.querySelector('label[for="player"]');
                            const field = document.getElementById('player');
                            const a = label.getBoundingClientRect(), b = field.getBoundingClientRect();
                            const tabs = document.querySelector('.tab-bar').getBoundingClientRect();
                            const widths = [...document.querySelectorAll('[role="tab"]')].map(tab => tab.getBoundingClientRect().width);
                            const panel = document.querySelector('main').getBoundingClientRect();
                            return label.textContent === 'Přezdívka' && b.left > a.right && b.width >= 100 &&
                                Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 2 &&
                                /3 písmena.*60 znaků/.test(field.title) &&
                                field.getAttribute('aria-describedby').includes('name-help') &&
                                Math.abs(tabs.bottom - panel.top) <= 1 &&
                                Math.abs(tabs.left - panel.left) <= 1 &&
                                Math.abs(tabs.right - panel.right) <= 1 &&
                                Math.max(...widths) - Math.min(...widths) <= 1 &&
                                (innerWidth < 1024 || widths.every(width => width >= 190 && width <= 194));
                        })()`), true, `${subject}/${width}/${theme}: attached tabs and single-row name`);
                        assert.equal(await evaluate(`(() => {
                            const canvas = document.createElement('canvas');
                            canvas.width = canvas.height = 1;
                            const context = canvas.getContext('2d');
                            const rgb = color => {
                                context.fillStyle = color;
                                context.fillRect(0, 0, 1, 1);
                                return context.getImageData(0, 0, 1, 1).data.slice(0, 3);
                            };
                            const card = rgb(getComputedStyle(document.getElementById('setup')).backgroundColor);
                            const luminance = values => [...values].map(v => v / 255).map(v =>
                                v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
                                .reduce((sum, v, index) => sum + v * [.2126, .7152, .0722][index], 0);
                            return [...document.querySelectorAll('[data-mode]')].every(button => {
                                const style = getComputedStyle(button), fill = rgb(style.backgroundColor);
                                return Math.max(...[...fill].map((v, i) => Math.abs(v - card[i]))) >= 20 &&
                                    [style.color, getComputedStyle(button.querySelector('.mode-count')).color].every(color => {
                                        const a = luminance(rgb(color)), b = luminance(fill);
                                        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
                                    });
                            });
                        })()`), true, `${subject}/${width}/${theme}: solid mode colors and readable labels`);
                    }
                    if (tab === 'original' || tab === 'learning') {
                        assert.equal(await evaluate(`(() => {
                            const cards = [...document.querySelectorAll('#${tab}-content .card:not(.callout)')];
                            const expected = getComputedStyle(document.body).getPropertyValue('--${subject}-paper').trim();
                            const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
                            const rgb = color => {
                                context.fillStyle = color;
                                context.fillRect(0, 0, 1, 1);
                                return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
                            };
                            const paper = rgb(expected);
                            const [pale, strong] = ${JSON.stringify({
                                history: {
                                    light: [[252, 249, 240], [245, 231, 201]],
                                    dark: [[36, 43, 52], [52, 48, 41]]
                                },
                                maths: {
                                    light: [[245, 250, 251], [223, 237, 242]],
                                    dark: [[27, 45, 58], [32, 58, 67]]
                                }
                            }[subject][theme])};
                            const card = rgb(getComputedStyle(document.getElementById('setup')).backgroundColor);
                            const luminance = values => values.map(value => value / 255)
                                .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
                                .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
                            const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) /
                                (Math.min(luminance(a), luminance(b)) + .05);
                            return document.body.dataset.subject === '${subject}' &&
                                paper.every((channel, index) => channel === Math.round((pale[index] + strong[index]) / 2)) &&
                                Math.max(...paper.map((channel, index) => Math.abs(channel - card[index]))) >= 10 &&
                                cards.every(element => {
                                    const style = getComputedStyle(element);
                                    return rgb(style.backgroundColor).every((channel, index) => channel === paper[index]) &&
                                        style.backgroundClip.split(', ').every(clip => clip === 'border-box') &&
                                        style.backgroundImage.includes('${subject === 'history' ? 'radial-gradient' : 'linear-gradient'}') &&
                                        style.backgroundImage.includes('0.085') &&
                                        contrast(rgb(style.color), paper) >= 4.5 &&
                                        contrast(rgb(getComputedStyle(element.querySelector('h2')).color), paper) >= 4.5;
                                }) &&
                                [...document.querySelectorAll('#original-content .original-text, #learning-content .hint-prompt, #learning-content p:not(.callout)')]
                                    .every(text => getComputedStyle(text).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                                        getComputedStyle(text).backgroundImage === 'none') &&
                                [...document.querySelectorAll('.term, .correction')].every(term =>
                                    getComputedStyle(term).backgroundColor === 'rgba(0, 0, 0, 0)') &&
                                [...document.querySelectorAll('.callout')].every(callout =>
                                    getComputedStyle(callout).backgroundImage === 'none') &&
                                [...document.querySelectorAll('.callout-fun')].every(callout => {
                                    const style = getComputedStyle(callout);
                                    const label = getComputedStyle(callout.querySelector('.callout-label'));
                                    const sparkle = getComputedStyle(callout, '::before');
                                    const badge = getComputedStyle(callout.querySelector('.card-icon'));
                                    return rgb(style.backgroundColor).every((channel, index) =>
                                        channel === rgb(getComputedStyle(document.body).getPropertyValue('--fun-paper').trim())[index]) &&
                                        contrast(rgb(label.color), rgb(style.backgroundColor)) >= 4.5 &&
                                        rgb(label.color).some((channel, index) =>
                                            channel !== rgb(getComputedStyle(document.body).getPropertyValue('--violet').trim())[index]) &&
                                        badge.borderRadius === '50%' && parseFloat(badge.minWidth) >= 32 &&
                                        sparkle.content === '""' && sparkle.clipPath.startsWith('polygon') &&
                                        parseFloat(sparkle.opacity) > 0;
                                }) &&
                                getComputedStyle(document.getElementById('results')).backgroundImage === 'none' &&
                                getComputedStyle(document.getElementById('setup')).backgroundImage === 'none';
                        })()`), true, `${subject}/${width}/${theme}: midpoint whole-card themes, golden fun facts and transparent text`);
                    }
                    await capture(`${subject}-${tab}-${width}-${theme}`);
                    if (subject === 'history' && tab === 'original') {
                        await evaluate(`(() => {
                            const fun = document.querySelector('#original-content .callout-fun');
                            window.scrollTo(0, scrollY + fun.getBoundingClientRect().top -
                                document.getElementById('page-header').getBoundingClientRect().bottom - 12);
                        })()`);
                        await capture(`${subject}-fun-${width}-${theme}`);
                        await evaluate('window.scrollTo(0, 0)');
                    }
                }
                tabLayouts.forEach(layout => {
                    assert.equal(layout.gutter, 'stable');
                    assert.deepEqual(layout.horizontal, tabLayouts[0].horizontal,
                        `${subject}/${width}/${theme}: no sideways shift between short and long tabs`);
                });
                if (width === 1600) {
                    assert.equal(tabLayouts.some(layout => layout.scrolling), true, 'includes a tall scrolling tab');
                    assert.equal(tabLayouts.some(layout => !layout.scrolling), true, 'includes a short non-scrolling tab');
                }
                await evaluate(`document.querySelector('[data-tab="original"]').focus()`);
                for (const [key, tab] of [['ArrowLeft', 'quiz'], ['Home', 'original'], ['End', 'quiz'], ['ArrowRight', 'original'], ['ArrowRight', 'learning']]) {
                    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
                    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
                    await evaluate('window.waitForTutorTab()');
                    assert.equal(await evaluate(`document.activeElement.dataset.tab === '${tab}' &&
                        document.activeElement.getAttribute('aria-selected') === 'true' &&
                        !document.getElementById('${tab}').hidden &&
                        document.querySelectorAll('[role="tab"][tabindex="0"]').length === 1`), true, `${subject}: tab keyboard ${key}`);
                }
                assert.deepEqual(await evaluate(`(async () => {
                    await window.switchTutorTab('learning');
                    const content = document.getElementById('learning-content').getBoundingClientRect();
                    const panel = document.getElementById('learning').getBoundingClientRect();
                    return {
                        fullWidth: Math.abs(content.width - panel.width) <= 1,
                        closed: !document.getElementById('glossary-drawer').matches(':popover-open'),
                        labelled: [...document.querySelectorAll('[data-tab]')].every(tab =>
                            tab.getAttribute('aria-controls') === tab.dataset.tab)
                    };
                })()`), {
                    fullWidth: true, closed: true,
                    labelled: true
                }, `${subject}/${width}/${theme} shared layout`);
            }
        }
        await client.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        });
        assert.equal(await evaluate(`(async () => {
            const count = window.tabTransitions.length;
            await window.switchTutorTab('quiz');
            const noAnimation = document.getElementById('quiz').getAnimations().length === 0;
            await window.switchTutorTab('learning');
            return noAnimation && window.tabTransitions.length === count &&
                !document.getElementById('learning').hidden;
        })()`), true, `${subject}: reduced motion switches immediately without native or fallback animations`);
        assert.deepEqual(await evaluate(`(() => {
            const feedback = document.getElementById('feedback');
            feedback.classList.add('failure');
            const animation = getComputedStyle(feedback).animationName;
            const transition = getComputedStyle(document.getElementById('theme')).transitionDuration;
            const drawerTransition = getComputedStyle(document.getElementById('glossary-drawer')).transitionDuration;
            feedback.classList.remove('failure');
            return { animation, transition, drawerTransition };
        })()`), { animation: 'none', transition: '0s', drawerTransition: '0s' }, `${subject}: reduced motion`);
        const bookmark = await evaluate(`(() => {
            const bounds = document.getElementById('glossary-toggle').getBoundingClientRect();
            return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, top: bounds.top };
        })()`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bookmark.x, y: bookmark.y });
        assert.equal(await evaluate('document.getElementById("glossary-toggle").getBoundingClientRect().top'),
            bookmark.top, `${subject}: reduced-motion hover does not move the bookmark`);
        await client.send('Emulation.setEmulatedMedia', { features: [] });
        assert.equal(await evaluate(`(async () => {
            await window.switchTutorTab('learning');
            const glossary = document.getElementById('glossary-drawer');
            document.getElementById('glossary-toggle').click();
            document.querySelector('#glossary button').click();
            const open = document.getElementById('definition').matches(':popover-open');
            document.getElementById('definition-close').click();
            return glossary.matches(':popover-open') && open && !!document.getElementById('definition-text').textContent;
        })()`), true);
        assert.equal(await evaluate('document.activeElement === document.querySelector("#glossary button")'), true);
        await evaluate(`document.querySelector('#glossary button').click()`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
            document.getElementById('glossary-drawer').matches(':popover-open') &&
            document.activeElement === document.querySelector('#glossary button')`), true, `${subject}: first Escape closes definition, not drawer`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        assert.equal(await evaluate(`!document.getElementById('glossary-drawer').matches(':popover-open') &&
            document.activeElement === document.getElementById('glossary-toggle')`), true, `${subject}: second Escape closes drawer and restores focus`);
        await evaluate(`document.getElementById('glossary-toggle').click()`);
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 895, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 895, button: 'left', clickCount: 1 });
        assert.equal(await evaluate(`!document.getElementById('glossary-drawer').matches(':popover-open')`), true, `${subject}: drawer dismisses on outside click`);
        assert.equal(await evaluate(`(() => {
            document.getElementById('glossary-toggle').click();
            document.getElementById('expand-learning').focus();
            return !document.getElementById('glossary-drawer').matches(':popover-open') &&
                document.activeElement === document.getElementById('expand-learning');
        })()`), true, `${subject}: leaving nonmodal drawer preserves unobscured keyboard focus`);
        await evaluate(`document.getElementById('expand-learning').click()`);
        for (const width of [320, 1600]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            assert.equal(await evaluate(`(async () => {
                const trigger = document.querySelector('#learning-content .term');
                trigger.scrollIntoView({ block: 'center' });
                trigger.click();
                document.getAnimations().forEach(animation => animation.finish());
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
        await evaluate(`(() => {
            [...document.querySelectorAll('#learning-content details')].forEach((item, index) => {
                item.open = window.initialLearningOpen[index];
            });
            [...document.querySelectorAll('#learning-content .hint-toggle')].forEach((item, index) => {
                if ((item.getAttribute('aria-expanded') === 'true') !== window.initialHintOpen[index]) item.click();
            });
        })()`);
        assert.equal(await evaluate(`(async () => {
            document.getElementById('glossary-toggle').click();
            document.querySelector('#glossary button').click();
            await window.switchTutorTab('quiz');
            return !document.getElementById('definition').matches(':popover-open') &&
                !document.getElementById('glossary-drawer').matches(':popover-open') &&
                document.getElementById('glossary-toggle').hidden &&
                !document.getElementById('scoring-rules').open && !document.getElementById('leaderboard').open &&
                [...document.querySelectorAll('[data-mode]')].every(mode => !/bod/.test(mode.textContent)) &&
                [...document.querySelectorAll('#original-content h2, #learning-content article h2')]
                    .every(title => title.querySelector('.card-icon[aria-hidden="true"]'));
        })()`), true, `${subject}: quiet setup and decorative card icons`);
        for (const [width, theme] of [320, 1600].flatMap(width => ['light', 'dark'].map(theme => [width, theme]))) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            await evaluate(`(() => {
                if ((getComputedStyle(document.documentElement).colorScheme === 'dark') !== ${theme === 'dark'})
                    document.getElementById('theme').click();
            })()`);
            const exportLayout = await evaluate(`(() => {
                const tools = document.getElementById('quiz-tools');
                const cog = tools.querySelector('summary');
                const tabs = document.querySelector('[role="tablist"]').getBoundingClientRect();
                const restingOpacity = getComputedStyle(cog).opacity;
                const initiallyClosed = !tools.open;
                cog.click();
                document.getAnimations().forEach(animation => animation.finish());
                const trigger = cog.getBoundingClientRect();
                const content = document.getElementById('quiz-tools-panel');
                const panel = content.getBoundingClientRect();
                const download = document.getElementById('quiz-export');
                const description = document.getElementById(download.getAttribute('aria-describedby'));
                const valid = initiallyClosed && tools.open && cog.getAttribute('aria-label') === 'Nástroje kvízu' &&
                    !!cog.querySelector('svg[aria-hidden="true"]') &&
                    tools.parentElement.className === 'tab-bar' && !tools.closest('[role="tablist"]') &&
                    !document.getElementById('setup').contains(tools) && Number(restingOpacity) <= .7 &&
                    trigger.left >= tabs.right && trigger.width >= 44 && trigger.height >= 44 &&
                    panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight &&
                    panel.width <= 180 && panel.height <= 80 &&
                    download.getBoundingClientRect().height >= 44 && !!download.title &&
                    description.classList.contains('visually-hidden') && description.textContent.includes('správných odpovědí') &&
                    !content.querySelector('p:not([hidden])') &&
                    document.documentElement.scrollWidth <= innerWidth;
                return { valid, initiallyClosed, open: tools.open, restingOpacity,
                    focused: document.activeElement.id, hovered: cog.matches(':hover'),
                    trigger: trigger.toJSON(), tabs: tabs.toJSON(), panel: panel.toJSON(),
                    download: download.getBoundingClientRect().toJSON(),
                    viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth };
            })()`);
            assert.equal(exportLayout.valid, true,
                `${subject}/${width}/${theme}: compact, accessible, viewport-safe export action: ${JSON.stringify(exportLayout)}`);
            await capture(`${subject}-quiz-tools-${width}-${theme}`);
            assert.equal(await evaluate(`(() => {
                document.getElementById('quiz-tools-panel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                return document.getElementById('quiz-tools').open;
            })()`), true, 'clicking inside the panel does not dismiss it');
            const outside = await evaluate(`(() => {
                const bounds = document.getElementById('player').getBoundingClientRect();
                return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
            })()`);
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...outside, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...outside, button: 'left', clickCount: 1 });
            assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
                document.activeElement === document.getElementById('player')`), true, 'outside click closes without stealing input focus');
        }
        await evaluate(`document.querySelector('#quiz-tools summary').focus()`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        assert.equal(await evaluate(`document.getElementById('quiz-tools').open`), true, `${subject}: quiz cog supports keyboard disclosure`);
        await evaluate(`document.getElementById('quiz-export').focus()`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
            document.activeElement === document.querySelector('#quiz-tools summary')`), true, 'Escape closes export and restores cog focus');
        await evaluate(`document.querySelector('#quiz-tools summary').click(); document.getElementById('quiz-export').focus()`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.deepEqual(await evaluate(`({
            closed: !document.getElementById('quiz-tools').open,
            focused: document.activeElement.id
        })`), { closed: true, focused: 'quiz' }, 'tabbing out dismisses export and preserves the next normal tab stop');
        await evaluate(`document.querySelector('#quiz-tools summary').click()`);
        assert.equal(await evaluate(`(() => {
            const create = URL.createObjectURL;
            URL.createObjectURL = () => { throw new Error('Simulated export failure'); };
            document.getElementById('quiz-export').click();
            URL.createObjectURL = create;
            return document.getElementById('quiz-tools').open && !document.getElementById('export-error').hidden &&
                document.getElementById('export-error').textContent.includes('nepodařilo');
        })()`), true, `${subject}: export failure is visible`);
        const downloadPath = path.join(downloads, `${lesson.id}-otazky.json`);
        if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
        await evaluate(`document.getElementById('quiz-export').click()`);
        for (let attempt = 0; attempt < 100 && !fs.existsSync(downloadPath); attempt++) await delay(20);
        assert.ok(fs.existsSync(downloadPath), `${subject}: JSON download completes offline`);
        assert.deepEqual(JSON.parse(fs.readFileSync(downloadPath, 'utf8')), questionBank(lesson, subjectExports[subject]));
        assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
            document.activeElement === document.querySelector('#quiz-tools summary') &&
            document.getElementById('export-error').hidden &&
            !document.getElementById('setup').hidden && document.getElementById('game').hidden`), true);
        const faviconMetrics = await evaluate(`(async () => {
            const image = new Image();
            image.src = document.querySelector('link[rel="icon"]').href;
            await image.decode();
            return [16, 32].map(size => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, size, size);
                const pixels = context.getImageData(0, 0, size, size).data;
                const blue = [], black = [];
                let pale = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) pale++;
                    const point = { x: (i / 4) % size, y: Math.floor(i / 4 / size) };
                    if (pixels[i + 2] > pixels[i] + 40 && pixels[i + 3] > 200) blue.push(point);
                    const channels = [pixels[i], pixels[i + 1], pixels[i + 2]];
                    if (Math.max(...channels) < 200 && Math.max(...channels) - Math.min(...channels) < 12 && pixels[i + 3] > 200) black.push(point);
                }
                const bounds = points => ({
                    left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
                    top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))
                });
                const counterIndex = (Math.floor(size * 19 / 32) * size + Math.floor(size * 17 / 32)) * 4;
                return {
                    size, pale, blueCount: blue.length, blackCount: black.length,
                    blue: bounds(blue), black: bounds(black),
                    counter: [...pixels.slice(counterIndex, counterIndex + 4)]
                };
            });
        })()`);
        if (process.env.TUTOR_SCREENSHOT_DIRECTORY) {
            const preview = await evaluate(`(async () => {
                const image = new Image();
                image.src = document.querySelector('link[rel="icon"]').href;
                await image.decode();
                const preview = document.createElement('canvas');
                preview.width = 256; preview.height = 128;
                const context = preview.getContext('2d');
                context.imageSmoothingEnabled = false;
                [16, 32].forEach((size, index) => {
                    const icon = document.createElement('canvas');
                    icon.width = icon.height = size;
                    icon.getContext('2d').drawImage(image, 0, 0, size, size);
                    context.drawImage(icon, index * 128, 0, 128, 128);
                });
                return preview.toDataURL('image/png').split(',')[1];
            })()`);
            fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, 'favicon-16-32-enlarged.png'), Buffer.from(preview, 'base64'));
        }
        for (const { size, pale, blueCount, blackCount, blue, black, counter } of faviconMetrics) {
            assert.ok(pale > size * size / 3 && blueCount > size && blackCount > size / 4,
                `${subject}/${size}: visible pale tile, blue D and black cap`);
            assert.ok(blueCount > blackCount && blue.right - blue.left >= black.right - black.left &&
                blue.bottom - blue.top > black.bottom - black.top,
                `${subject}/${size}: D dominates cap in area and height: ${JSON.stringify({ blue, black, blueCount, blackCount })}`);
            assert.ok(black.left < blue.left && black.bottom >= blue.top,
                `${subject}/${size}: cap hangs over D's left edge: ${JSON.stringify({ blue, black })}`);
            assert.equal(black.top, 0, `${subject}/${size}: cap reaches the first pixel row`);
            assert.equal(blue.bottom, size - 1, `${subject}/${size}: D reaches the last pixel row`);
            assert.ok(counter.slice(0, 3).every(channel => channel > 220) && counter[3] > 200,
                `${subject}/${size}: D counter remains open: ${JSON.stringify(counter)}`);
        }
        const startGuardedQuiz = () => evaluate(`(async () => {
            await window.switchTutorTab('quiz');
            document.getElementById('player').value = 'Kontrola';
            document.querySelector('[data-mode="easy"]').click();
            document.querySelectorAll('#answers input').forEach(input => { input.value = '123'; });
        })()`, true);
        const quizSnapshot = () => evaluate(`(() => {
            const $ = id => document.getElementById(id);
            return {
                selected: document.querySelector('[aria-selected="true"]').dataset.tab,
                question: $('question').textContent, score: $('score').textContent,
                progress: $('quiz-progress').value,
                inputs: [...$('answers').querySelectorAll('input')].map(input => input.value),
                setup: $('setup').hidden, game: $('game').hidden
            };
        })()`);
        const unloadProtected = () => evaluate(`(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        })()`);
        assert.equal(await unloadProtected(), false, `${subject}: no unload guard before starting`);
        await startGuardedQuiz();
        const unfinished = await quizSnapshot();
        assert.equal(await unloadProtected(), true);
        await evaluate(`window.switchTutorTab('learning')`);
        assert.equal(await evaluate(`(() => {
            const dialog = document.getElementById('quiz-leave-dialog');
            return dialog.matches(':modal') && document.activeElement.id === 'quiz-stay' &&
                dialog.getAttribute('aria-labelledby') === 'quiz-leave-title' &&
                dialog.getAttribute('aria-describedby') === 'quiz-leave-description' &&
                document.getElementById('quiz-leave-title').textContent === 'Pokračovat v kvízu?' &&
                document.getElementById('quiz-leave-description').textContent.includes('odpovědi, body a postup se ztratí');
        })()`), true, `${subject}: themed modal offers continuing as the default`);
        const previousTheme = await evaluate(`document.documentElement.dataset.theme || ''`);
        for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
            for (const width of [1280, 375, 320]) {
                await client.send('Emulation.setDeviceMetricsOverride', {
                    width, height: 900, deviceScaleFactor: 1, mobile: false
                });
                assert.equal(await evaluate(`(() => {
                    const dialog = document.getElementById('quiz-leave-dialog');
                    const style = getComputedStyle(dialog);
                    const card = getComputedStyle(document.getElementById('game'));
                    const bounds = dialog.getBoundingClientRect();
                    const buttons = [...dialog.querySelectorAll('button')];
                    return style.backgroundColor === card.backgroundColor && style.color === card.color &&
                        bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight &&
                        dialog.scrollWidth <= dialog.clientWidth &&
                        getComputedStyle(dialog, '::backdrop').backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                        buttons.every(button => button.getBoundingClientRect().height >= 44);
                })()`), true, `${subject}: modal theme, backdrop, touch targets and fit at ${theme}/${width}px`);
                if (theme === 'light' && width === 375) await capture(`${subject}-quiz-exit-warning`);
            }
        }
        await client.send('Emulation.clearDeviceMetricsOverride');
        await evaluate(`${previousTheme ? `document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}` :
            'delete document.documentElement.dataset.theme'}`);
        const pressKey = async (key, code, windowsVirtualKeyCode) => {
            await client.send('Input.dispatchKeyEvent', {
                type: 'keyDown', key, code, windowsVirtualKeyCode,
                ...(key === 'Enter' ? { text: '\r' } : {})
            });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
        };
        await pressKey('Tab', 'Tab', 9);
        assert.equal(await evaluate(`document.activeElement.id`), 'quiz-leave');
        await pressKey('Tab', 'Tab', 9);
        assert.equal(await evaluate(`document.activeElement === document.body ||
            document.getElementById('quiz-leave-dialog').contains(document.activeElement)`), true,
            `${subject}: modal prevents keyboard focus reaching the underlying page`);
        await evaluate(`document.getElementById('quiz-stay').focus()`);
        await pressKey('Escape', 'Escape', 27);
        assert.deepEqual(await quizSnapshot(), unfinished, `${subject}: canceled pointer tab switch preserves quiz`);
        assert.equal(await evaluate(`document.activeElement.dataset.tab`), 'quiz');
        await evaluate(`document.querySelector('[data-tab="quiz"]').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
        assert.equal(await evaluate(`document.activeElement.id`), 'quiz-stay');
        await pressKey('Enter', 'Enter', 13);
        assert.equal(await evaluate(`document.getElementById('quiz-leave-dialog').open`), false);
        assert.deepEqual(await quizSnapshot(), unfinished, `${subject}: canceled keyboard switch preserves quiz`);
        assert.equal(await evaluate(`document.activeElement.dataset.tab`), 'quiz');
        await handleDialog(() => client.send('Page.reload'), false, 'beforeunload');
        assert.deepEqual(await quizSnapshot(), unfinished, `${subject}: canceled reload preserves quiz`);
        await evaluate(`window.switchTutorTab('learning')`);
        await evaluate(`document.getElementById('quiz-stay').click()`);
        assert.deepEqual(await quizSnapshot(), unfinished, `${subject}: explicit continue button preserves quiz`);
        await evaluate(`window.switchTutorTab('learning')`);
        await evaluate(`(async () => {
            document.getElementById('quiz-leave').click();
            await window.waitForTutorTab();
        })()`);
        assert.equal(await evaluate(`document.activeElement.dataset.tab`), 'learning');
        assert.equal(await unloadProtected(), false, `${subject}: abandonment removes unload guard`);
        assert.equal(await evaluate(`document.getElementById('setup').hidden`), false);
        assert.equal(await evaluate(`document.getElementById('game').hidden`), true);
        assert.equal(await evaluate(`document.querySelectorAll('#answers input, #answers button').length`), 0);
        await startGuardedQuiz();
        await handleDialog(() => client.send('Page.reload'), true, 'beforeunload');
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)} &&
                document.querySelector('[aria-selected="true"]')?.dataset.tab === 'original'`)) break;
            await delay(50);
        }
        assert.equal(await unloadProtected(), false, `${subject}: accepted reload discards unfinished attempt`);
        assert.equal(await evaluate(`document.getElementById('game').hidden`), true);
        assert.deepEqual(await evaluate(`(async () => {
            const $ = id => document.getElementById(id);
            await window.switchTutorTab('original');
            const original = [...document.querySelectorAll('#original-content .original-text')].map(item => item.textContent);
            await window.switchTutorTab('quiz');
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
            assert.deepEqual(await evaluate(`(async () => {
                await window.switchTutorTab('learning');
                const details = document.querySelector('#exercises details');
                details.querySelector('summary').click();
                return {
                    examples: document.querySelectorAll('#examples > article').length,
                    exercises: document.querySelectorAll('#exercises > article').length,
                    opened: details.open,
                    modes: document.querySelectorAll('[data-mode]').length,
                    timing: document.querySelectorAll('#bonus, #timer, #countdown').length
                };
            })()`), { examples: 4, exercises: lesson.exercises.length, opened: true, modes: 3, timing: 0 });
            assert.deepEqual(await evaluate(`(() => {
                const examples = [...document.querySelectorAll('#examples > article')];
                const openDetails = examples.map(example => example.querySelectorAll('details[open], .hint-toggle[aria-expanded="true"]').length);
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
                openDetails: [0, 0, 0, 0], firstBeforePractice: true,
                levels: ['easy', 'medium', 'hard'].flatMap(level =>
                    lesson.exercises.filter(exercise => exercise.difficulty === level)
                        .map(() => ({ easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' }[level])))
            });
            assert.equal(await evaluate(`(() => {
                const details = document.querySelector('#examples > article:nth-child(3) details');
                details.querySelector('summary').click();
                return details.open;
            })()`), true);
            // Review actual submitted pages at phone width, not only their setup screens.
            await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
            const playMaths = (mode, count, partial = false, invalid = false, policyPartial = false) => evaluate(`(async () => {
                const $ = id => document.getElementById(id);
                const lesson = JSON.parse($('lesson-data').textContent);
                window.answerClock = 0;
                Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
                await window.switchTutorTab('quiz');
                $('player').value = 'Kontrola';
                const random = Math.random;
                if (${policyPartial}) Math.random = () => .999999;
                $('quiz-tools').open = true;
                document.querySelector('[data-mode="${mode}"]').click();
                Math.random = random;
                if ($('quiz-tools').open) throw new Error('Export tools obscure a newly started quiz');
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
                    !$('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('Missing expanded completion leaderboard');
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
                if ($('setup').hidden || !$('results').hidden || $('leaderboard').open) throw new Error('Restart failed');
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
                const result = await evaluate(`(async () => {
                    const $ = id => document.getElementById(id);
                    const lesson = JSON.parse($('lesson-data').textContent);
                    window.answerClock = 0;
                    Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
                    await window.switchTutorTab('quiz');
                    $('player').value = 'Kontrola';
                    const random = Math.random;
                    if (${JSON.stringify(mode)} === 'hard') Math.random = () => .999999;
                    $('quiz-tools').open = true;
                    document.querySelector('[data-mode="${mode}"]').click();
                    Math.random = random;
                    if ($('quiz-tools').open) throw new Error('Export tools obscure a newly started quiz');
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
                    if (!$('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('Rank not in expanded leaderboard');
                    $('leaderboard').querySelector('summary').click();
                    if ($('leaderboard').open) throw new Error('Completion leaderboard cannot be collapsed');
                    $('leaderboard').querySelector('summary').click();
                    const result = {
                        bonus, partials, summary: $('summary').children.length,
                        grade: $('grade').textContent, visible: !$('results').hidden,
                        saved: JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1).total,
                        fits: document.documentElement.scrollWidth <= innerWidth
                    };
                    $('restart').click();
                    if ($('leaderboard').open) throw new Error('Restart leaves leaderboard expanded');
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
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
