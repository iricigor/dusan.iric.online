'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { renderLesson } = require('../build.js');
const { mathsAssessmentLesson } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const defaultMaths = require('../examples/zlomky-a-prevody-delky.json');
const { browserPath, openBrowser } = require('./helpers/browser.js');
const { checkIntroduction } = require('./browser/introduction.js');
const { checkResponsive } = require('./browser/responsive.js');
const { checkGlossary } = require('./browser/glossary.js');
const { checkExport } = require('./browser/export.js');
const { checkBranding } = require('./browser/branding.js');
const { checkQuizGuard } = require('./browser/quiz-guard.js');
const { checkMathsQuiz } = require('./browser/maths-quiz.js');
const { checkHistoryQuiz } = require('./browser/history-quiz.js');
const { checkPersistence } = require('./browser/persistence.js');

test('real offline pages share navigation, named quizzes, persistence and storage failures across subjects', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 180000
}, async t => {
    const browser = await openBrowser(t);
    const { directory, client, evaluate, exceptions, network } = browser;
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
        const scenario = { ...browser, subject, lesson, file };
        // Scenarios intentionally share a page and run in this order.
        await checkIntroduction(scenario);
        await checkResponsive(scenario);
        await checkGlossary(scenario);
        await checkExport(scenario);
        await checkBranding(scenario);
        await checkQuizGuard(scenario);
        if (subject === 'maths') await checkMathsQuiz(scenario);
        else await checkHistoryQuiz(scenario);
        await checkPersistence(scenario);
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('prepared history timeline keeps compact years readable and expands lesson text', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification'
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    const file = path.join(directory, 'history-timeline.html');
    fs.writeFileSync(file, renderLesson('history', history));
    await client.send('Page.navigate', { url: pathToFileURL(file).href });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('typeof window.switchTutorTab === "function"')) break;
        await delay(20);
    }
    await evaluate('window.switchTutorTab("learning")');
    for (const width of [1024, 1600]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.getElementById('timeline-details').open = true`);
            await capture(`history-timeline-${width}-${theme}-expanded`);
            const layout = await evaluate(`(() => {
                const details = document.getElementById('timeline-details');
                const rail = document.querySelector('.learning-timeline');
                const text = document.getElementById('learning-content');
                const fullRail = rail.getBoundingClientRect().width;
                const fullText = text.getBoundingClientRect().width;
                details.open = false;
                const compactRail = rail.getBoundingClientRect().width;
                const compactText = text.getBoundingClientRect().width;
                return { fullRail, compactRail, fullText, compactText, text: rail.innerText,
                    targets: [...rail.querySelectorAll('.timeline-year-link')].map(button => ({
                        width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height
                    })), overflow: document.documentElement.scrollWidth > innerWidth };
            })()`);
            await capture(`history-timeline-${width}-${theme}-compact`);
            assert.equal(layout.compactRail < layout.fullRail && layout.compactText > layout.fullText &&
                layout.text.trim().split(/\s+/).every(word => /^\d+$/.test(word)) &&
                layout.targets.every(target => target.width >= 44 && target.height >= 44) && !layout.overflow,
            true, `${width}/${theme}: ${JSON.stringify(layout)}`);
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('learning progress, optional timelines and authored/child highlights preserve source and tab storage', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, exceptions, network } = await openBrowser(t);
    const ready = async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`!!document.querySelector('#learning-content [data-learning-card]')`)) return;
            await delay(30);
        }
        assert.fail('Learning cards did not initialize');
    };
    const tab = async name => {
        await evaluate(`document.querySelector('[data-tab="${name}"]').click(); document.getAnimations().forEach(animation => animation.finish())`);
        await delay(30);
    };
    const select = async (target, start, end, rootIndex = 0) => {
        await evaluate(`(() => {
            const root = document.querySelectorAll('[data-highlight-target="${target}"]')[${rootIndex}];
            root.scrollIntoView({ block: 'center' });
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let position = 0, first, last;
            while (walker.nextNode()) {
                const node = walker.currentNode, stop = position + node.length;
                if (!first && ${start} >= position && ${start} < stop) first = [node, ${start} - position];
                if (${end} > position && ${end} <= stop) { last = [node, ${end} - position]; break; }
                position = stop;
            }
            const range = document.createRange();
            range.setStart(...first); range.setEnd(...last);
            const selection = document.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            document.dispatchEvent(new Event('pointerup'));
        })()`);
        await delay(30);
        assert.equal(await evaluate('document.querySelector("[data-highlight-action]").disabled'), false);
    };
    const apply = async color => {
        await evaluate(`document.querySelector('[data-highlight-action="${color}"]').click()`);
        await delay(30);
    };
    const marked = target => evaluate(`Array.from(document.querySelectorAll('[data-highlight-target="${target}"] mark')).map(mark => [mark.textContent, mark.dataset.highlightColor])`);
    for (const [subject, source] of [['history', history], ['maths', defaultMaths]]) {
        const lesson = structuredClone(source);
        lesson.id = 'presentation-shared';
        if (subject === 'history') {
            lesson.chunks = Array.from({ length: 12 }, (_, index) => structuredClone(source.chunks[index % source.chunks.length]));
            lesson.timeline = [
                { chunk: 2, year: 1781, label: 'Josef II.' },
                { chunk: 0, year: 1740, label: 'Marie Terezie', lifespan: { birth: 1717, death: 1780 } },
                { chunk: 1, year: 1740, label: 'Další událost' }
            ];
        }
        const learningTarget = subject === 'history' ? 'chunks.0.sentences' : 'examples.0.prompt';
        const learningText = subject === 'history' ? lesson.chunks[0].sentences.join(' ') : lesson.examples[0].prompt;
        lesson.highlights = [
            { target: 'original.0.text', quote: lesson.original[0].text.slice(0, 8), color: 'yellow' },
            { target: learningTarget, quote: learningText.slice(0, 8), color: 'green' }
        ];
        if (subject === 'history') lesson.highlights.push({
            target: 'original.3.text', quote: lesson.corrections[0].quote, color: 'blue'
        });
        const file = path.join(directory, `${subject}.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        await ready();
        assert.equal(await evaluate('document.getElementById("highlight-warning").hidden'), true, 'subjects have isolated highlight namespaces');
        assert.deepEqual(await marked('original.0.text'), [[lesson.original[0].text.slice(0, 8), 'yellow']]);
        assert.equal(await evaluate('document.getElementById("learning-progress").hidden'), true);
        assert.equal(await evaluate('document.getElementById("highlight-tools").hidden'), false);
        await select('original.0.text', 2, 6);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', altKey: true, modifiers: 1 });
        assert.equal(await evaluate('document.activeElement.dataset.highlightAction'), 'yellow', 'Alt+H focuses marker controls');
        await apply('blue');
        assert.deepEqual(await marked('original.0.text'), [
            [lesson.original[0].text.slice(0, 2), 'yellow'], [lesson.original[0].text.slice(2, 6), 'blue'],
            [lesson.original[0].text.slice(6, 8), 'yellow']
        ]);
        await select('original.0.text', 0, 8);
        await apply('remove');
        assert.deepEqual(await marked('original.0.text'), [], 'removal masks authored highlights');
        const original = await evaluate('Array.from(document.querySelectorAll(".original-text")).map(item => item.textContent)');
        assert.deepEqual(original, lesson.original.map(section => section.text));
        assert.equal(await evaluate('document.getElementById("highlight-status").textContent.includes("Uloženo")'), true);
        if (subject === 'history') {
            assert.equal(await evaluate(`(() => {
                const button = document.querySelector('#original-content .correction');
                const hasMark = !!button.querySelector('mark');
                button.click();
                return hasMark && document.getElementById('definition').matches(':popover-open');
            })()`), true, 'authored highlights preserve correction listeners');
            await evaluate('document.getElementById("definition-close").click()');
            await evaluate(`(() => {
                const roots = document.querySelectorAll('[data-highlight-target="original.6.text"]');
                const range = document.createRange();
                range.setStart(roots[0], 0); range.setEnd(roots[1], roots[1].childNodes.length);
                const selection = document.getSelection();
                selection.removeAllRanges(); selection.addRange(range);
            })()`);
            await delay(30);
            await apply('green');
            assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-highlight-target="original.6.text"]')).every(root =>
                Array.from(root.querySelectorAll('mark')).map(mark => mark.textContent).join('') === root.textContent)`),
            true, 'selection spanning styled original paragraphs is highlighted without changing separators');
        }
        await tab('learning');
        const total = subject === 'history' ? 12 : 34;
        assert.equal(await evaluate('document.getElementById("learning-counter").textContent'), `0/${total} Prozkoumáno`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('.explored-control')).every(label =>
            label.textContent === 'Prozkoumáno' && label.querySelector('input[type="checkbox"]')?.checked === false)`), true);
        await evaluate('Array.from(document.querySelectorAll(".explored-control")).slice(0, 3).forEach(button => button.click())');
        assert.equal(await evaluate('document.getElementById("learning-counter").textContent'), `3/${total} Prozkoumáno`);
        assert.equal(await evaluate('document.querySelectorAll(".learning-segment[data-explored=true]").length'), 3);
        assert.equal(await evaluate('document.querySelectorAll(".explored-control input:checked").length'), 3);
        await evaluate('document.querySelector(".explored-control").click(); window.scrollTo(0, document.body.scrollHeight)');
        assert.equal(await evaluate('document.getElementById("learning-counter").textContent'), `2/${total} Prozkoumáno`);
        await evaluate('document.querySelector(".explored-control input").focus()');
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        assert.equal(await evaluate('document.querySelector(".explored-control input").checked'), true, 'completion checkbox is keyboard-operable');
        await evaluate('document.querySelector(".explored-control").click(); window.scrollTo(0, document.body.scrollHeight)');
        assert.equal(await evaluate('document.getElementById("learning-progress").getBoundingClientRect().top >= 0'), true);
        assert.deepEqual(await marked(learningTarget), [[learningText.slice(0, 8), 'green']]);
        await select(learningTarget, 0, 12);
        await apply('yellow');
        assert.deepEqual(await marked(learningTarget), [[learningText.slice(0, 12), 'yellow']]);
        assert.equal(await evaluate(`(() => {
            const button = Array.from(document.querySelectorAll('#learning-content .term')).find(button =>
                button.checkVisibility() && button.closest('[data-highlight-target]')?.dataset.highlightTarget !== '${learningTarget}');
            window.markedDefinitionButton = button;
            const range = document.createRange();
            range.selectNodeContents(button);
            const selection = document.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            return !!button;
        })()`), true);
        await delay(30);
        await apply('blue');
        assert.equal(await evaluate(`(() => {
            const button = window.markedDefinitionButton;
            const mark = button.querySelector('mark');
            button.click();
            return mark?.dataset.highlightColor === 'blue' &&
                document.getElementById('definition').matches(':popover-open');
        })()`), true, 'child markers preserve glossary button identity and listeners');
        await evaluate('document.getElementById("definition-close").click()');
        if (process.env.TUTOR_SCREENSHOT_DIRECTORY) {
            await evaluate(`document.documentElement.dataset.theme = 'light';
                document.getElementById('highlight-tools').open = false;
                window.scrollTo(0, 0); document.querySelector('#learning-content .hint-toggle').click();
                document.getAnimations().forEach(animation => animation.finish());`);
            const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
            fs.mkdirSync(process.env.TUTOR_SCREENSHOT_DIRECTORY, { recursive: true });
            fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, `${subject}-learning-presentation.png`),
                Buffer.from(screenshot.data, 'base64'));
        }
        await tab('quiz');
        assert.equal(await evaluate('document.getElementById("highlight-tools").hidden && document.getElementById("learning-progress").hidden'), true);
        await tab('learning');
        assert.equal(await evaluate('document.getElementById("learning-counter").textContent'), `2/${total} Prozkoumáno`);
        if (subject === 'history') {
            assert.equal(await evaluate(`Array.from(document.querySelectorAll('.timeline-node')).every(button =>
                !/^\\d/.test(button.textContent) && /^\\d/.test(button.getAttribute('aria-label')))`), true,
            'timeline labels omit repeated years but retain them in accessible names');
            assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".timeline-year")).map(row => Number(row.dataset.year))'),
                [1717, 1740, 1780, 1781]);
            assert.equal(await evaluate('document.querySelector(".timeline-lifespan").getAttribute("aria-label")'), 'Marie Terezie: 1717–1780');
            assert.equal(await evaluate('document.querySelector(".timeline-lifespan").style.gridRow'), '1 / 4');
            assert.equal(await evaluate(`(() => {
                const rail = document.querySelector('.learning-timeline').getBoundingClientRect();
                const cards = document.getElementById('learning-content').getBoundingClientRect();
                const glossary = document.getElementById('glossary-toggle').getBoundingClientRect();
                return rail.left >= cards.right && rail.right <= glossary.left;
            })()`), true, 'timeline is to the right and reserves glossary space');
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            await evaluate(`document.querySelector('.timeline-node[aria-controls="learning-chunk-2"]').click()`);
            assert.equal(await evaluate(`(() => {
                const card = document.getElementById('learning-chunk-2');
                return document.activeElement === card && card.getBoundingClientRect().top >=
                    document.getElementById('page-header').getBoundingClientRect().bottom &&
                    document.querySelector('.timeline-node[aria-controls="learning-chunk-2"]').hasAttribute('aria-current');
            })()`), true, 'reduced-motion timeline navigation focuses an unobscured card');
            await client.send('Emulation.setEmulatedMedia', { features: [] });
            await evaluate('document.getElementById("timeline-details").open = false');
            await evaluate('document.querySelector(".timeline-year-link").click()');
            assert.equal(await evaluate(`document.getElementById('timeline-details').open &&
                document.activeElement.classList.contains('timeline-node')`), true,
            'a compact year with multiple events expands the choices and focuses the first');
            await evaluate('document.getElementById("timeline-details").open = false');
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            await evaluate('document.querySelector(".timeline-year[data-year=\\"1781\\"] .timeline-year-link").click()');
            assert.equal(await evaluate(`!document.getElementById('timeline-details').open &&
                document.activeElement.id === 'learning-chunk-2'`), true,
            'a compact year with one event navigates without expanding the rail');
            await evaluate('document.getElementById("timeline-details").open = true');
            await client.send('Emulation.setEmulatedMedia', { features: [] });
        } else {
            assert.equal(await evaluate('document.querySelector(".learning-timeline") === null'), true, 'maths has no timeline or reserved rail');
        }
        for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
            assert.equal(await evaluate(`(() => {
                const rgb = value => value.match(/\\d+/g).slice(0, 3).map(Number).map(n => {
                    n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
                }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
                return ['yellow', 'blue', 'green'].every(color => {
                    const marker = document.querySelector('mark[data-highlight-color="' + color + '"]') ||
                        document.querySelector('[data-highlight-action="' + color + '"]');
                    const style = getComputedStyle(marker);
                    const a = rgb(style.color), b = rgb(style.backgroundColor);
                    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
                });
            })()`), true, `${subject}/${theme}: highlighted text meets 4.5:1 contrast`);
        }
        await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
        await delay(30);
        if (subject === 'history') {
            assert.equal(await evaluate('document.getElementById("timeline-details").open'), false, 'mobile timeline starts collapsed');
            assert.equal(await evaluate('Math.abs(document.getElementById("learning-content").getBoundingClientRect().width - document.getElementById("learning").getBoundingClientRect().width) < 1'), true);
        }
        await select(learningTarget, 0, 4);
        assert.equal(await evaluate(`(() => {
            const panel = document.querySelector('.highlight-panel').getBoundingClientRect();
            const buttons = [...document.querySelectorAll('[data-highlight-action]')].map(button => button.getBoundingClientRect());
            return panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight &&
                panel.height < 65 && buttons.length === 4 && buttons.every(button =>
                    Math.abs(button.top - buttons[0].top) < 1 && button.height >= 44 && button.right <= panel.right) &&
                document.documentElement.scrollWidth <= innerWidth;
        })()`), true, 'marker palette fits a 320px screen');
        await apply('green');
        const stored = await evaluate(`sessionStorage.getItem('tutor-highlights:v1:${subject}:${lesson.id}')`);
        await client.send('Page.reload');
        await ready();
        assert.deepEqual(await marked('original.0.text'), [], 'authored removal survives reload');
        assert.deepEqual(await marked(learningTarget), [[learningText.slice(0, 4), 'green'], [learningText.slice(4, 12), 'yellow']]);
        assert.equal(await evaluate(`sessionStorage.getItem('tutor-highlights:v1:${subject}:${lesson.id}')`), stored);
        await tab('learning');
        assert.equal(await evaluate('document.getElementById("learning-counter").textContent'), `0/${total} Prozkoumáno`);
        await select(learningTarget, 0, 2);
        await evaluate('window.savedSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }');
        await apply('blue');
        assert.equal(await evaluate('!document.getElementById("highlight-warning").hidden && document.getElementById("highlight-status").textContent.includes("není uložená")'), true);
        assert.equal(await evaluate(`sessionStorage.getItem('tutor-highlights:v1:${subject}:${lesson.id}')`), stored, 'write failure leaves stored data untouched');
        await evaluate('Storage.prototype.setItem = window.savedSetItem');
        await evaluate(`sessionStorage.setItem('tutor-highlights:v1:${subject}:${lesson.id}', '{"version":1,"edits":[{"target":"original.0.text","text":"outdated","ranges":[]}]}')`);
        await client.send('Page.reload');
        await ready();
        assert.equal(await evaluate('!document.getElementById("highlight-warning").hidden'), true, 'outdated source is reported');
        assert.deepEqual(await marked('original.0.text'), [[lesson.original[0].text.slice(0, 8), 'yellow']], 'outdated child edits do not change authors or source');
        assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".original-text")).map(item => item.textContent)'), original);
        const invalid = await evaluate(`sessionStorage.getItem('tutor-highlights:v1:${subject}:${lesson.id}')`);
        await select('original.0.text', 0, 3);
        await apply('blue');
        assert.equal(await evaluate(`sessionStorage.getItem('tutor-highlights:v1:${subject}:${lesson.id}')`), invalid, 'new edits never overwrite unreadable existing records');
        const denied = await client.send('Page.addScriptToEvaluateOnNewDocument', {
            source: 'Storage.prototype.getItem = function() { throw new DOMException("Denied", "SecurityError"); };'
        });
        await client.send('Page.reload');
        await ready();
        assert.equal(await evaluate('!document.getElementById("highlight-warning").hidden && document.getElementById("highlight-warning").textContent.includes("nelze načíst")'), true, 'storage read denial is reported without breaking source rendering');
        assert.deepEqual(await marked('original.0.text'), [[lesson.original[0].text.slice(0, 8), 'yellow']]);
        await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: denied.identifier });
        if (subject === 'history') {
            delete lesson.timeline;
            fs.writeFileSync(file, renderLesson(subject, lesson));
            await client.send('Page.reload');
            await ready();
            await tab('learning');
            assert.equal(await evaluate('document.querySelector(".learning-timeline") === null && !document.getElementById("learning").classList.contains("has-timeline")'), true, 'history can intentionally omit timeline');
        }
        const other = { ...lesson, id: 'presentation-other' };
        const otherFile = path.join(directory, `${subject}-other.html`);
        fs.writeFileSync(otherFile, renderLesson(subject, other));
        await client.send('Page.navigate', { url: pathToFileURL(otherFile).href });
        await ready();
        assert.equal(await evaluate('document.getElementById("highlight-warning").hidden'), true, 'different lessons have independent highlight records');
        assert.deepEqual(await marked('original.0.text'), [[lesson.original[0].text.slice(0, 8), 'yellow']]);
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
