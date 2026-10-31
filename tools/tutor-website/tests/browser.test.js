'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { renderLesson } = require('../build.js');
const { mathsAssessmentLesson, mathsLesson } = require('./fixture.js');
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

test('glossary links only the first occurrence of each entry per teaching paragraph', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, exceptions, network } = await openBrowser(t);
    const text = 'Propellers, propeller and PROPELLER. Steam, steam. propellerhead.';
    const nextText = 'Steam, steam. propeller, propellers and PROPELLER.';
    for (const [subject, source] of [['history', history], ['maths', defaultMaths]]) {
        const lesson = structuredClone(source);
        lesson.glossary.push(
            { term: 'propeller', forms: ['propellers'], definition: 'Moves a boat through water.' },
            { term: 'steam', forms: [], definition: 'Water in its gaseous state.' }
        );
        const card = subject === 'history' ? lesson.chunks[0] : lesson.examples[0];
        const key = subject === 'history' ? 'chunks.0' : 'examples.0';
        const promptTarget = `${key}.${subject === 'history' ? 'sentences' : 'prompt'}`;
        const hintTarget = `${key}.${subject === 'history' ? 'explanation' : 'hint'}`;
        if (subject === 'history') {
            card.sentences = ['Propellers, propeller and PROPELLER.', 'Steam, steam. propellerhead.'];
            card.explanation = nextText;
        } else {
            card.prompt = text;
            card.hint = nextText;
        }
        card.paragraphs = [{ style: 'plain', text }, { style: 'quote', text: nextText }];
        lesson.highlights = [
            { target: promptTarget, quote: 'Propellers', color: 'green' },
            { target: promptTarget, quote: 'propeller and PROPELLER', color: 'yellow' }
        ];
        const file = path.join(directory, `${subject}-glossary-first-occurrence.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`!!document.querySelector('[data-highlight-target="${promptTarget}"]')`)) break;
            await delay(20);
        }
        await evaluate(`window.switchTutorTab('learning')`);
        for (const [target, expectedText, links] of [
            [promptTarget, text, ['Propellers', 'Steam']],
            [hintTarget, nextText, ['Steam', 'propeller']],
            [`${key}.paragraphs.0.text`, text, ['Propellers', 'Steam']],
            [`${key}.paragraphs.1.text`, nextText, ['Steam', 'propeller']]
        ]) {
            assert.deepEqual(await evaluate(`(() => {
                const paragraph = document.querySelector('[data-highlight-target="${target}"]');
                return { text: paragraph.textContent,
                    links: [...paragraph.querySelectorAll('.term')].map(button => button.textContent) };
            })()`), { text: expectedText, links }, `${subject}/${target}: aliases share a link and paragraphs reset`);
        }
        assert.deepEqual(await evaluate(`(() => {
            const paragraph = document.querySelector('[data-highlight-target="${promptTarget}"]');
            const trigger = paragraph.querySelector('.term');
            trigger.click();
            const result = {
                linkedHighlight: trigger.querySelector('mark').textContent,
                plainHighlight: paragraph.querySelector('mark[data-highlight-color="yellow"]').textContent,
                open: document.getElementById('definition').matches(':popover-open'),
                title: document.getElementById('definition-title').textContent,
                definition: document.getElementById('definition-text').textContent
            };
            document.getElementById('definition-close').click();
            return { ...result, focusRestored: document.activeElement === trigger };
        })()`), {
            linkedHighlight: 'Propellers', plainHighlight: 'propeller and PROPELLER',
            open: true, title: '\u{1F4D6}propeller', definition: 'Moves a boat through water.',
            focusRestored: true
        }, `${subject}: highlighting and popover behavior are preserved`);
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('real offline pages share navigation, named quizzes, persistence and storage failures across subjects', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 180000
}, async t => {
    const browser = await openBrowser(t);
    const { directory, client, evaluate, exceptions, network } = browser;
    for (const [subject, lesson] of [
        ['maths', { ...mathsAssessmentLesson(), id: 'shared-lesson-id' }],
        ['history', { ...history, id: 'shared-lesson-id' }],
        ['maths', { ...defaultMaths, id: 'shared-lesson-id' }]
    ]) {
        if (subject === 'maths' && lesson.id === 'shared-lesson-id') {
            lesson.glossary[0].icon = '<img src=x onerror=alert(1)>';
        }
        const file = path.join(directory, `${subject}-${lesson.id}.html`);
        const legacyResults = lesson.version === 4
            ? await evaluate(`sessionStorage.getItem('maths-tutor:v2:shared-lesson-id')`) : null;
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
        if (lesson.version === 4) {
            assert.ok(legacyResults, 'the same-id legacy results exist before the progressive page');
            assert.equal(await evaluate(`sessionStorage.getItem('maths-tutor:v2:shared-lesson-id')`), legacyResults,
                'progressive quizzes and storage failures do not alter same-id legacy results');
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('compact learning controls fit narrow screens across text fonts', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification'
}, async t => {
    const { directory, client, evaluate } = await openBrowser(t);
    const file = path.join(directory, 'marker-palette.html');
    fs.writeFileSync(file, renderLesson('maths', defaultMaths));
    await client.send('Page.navigate', { url: pathToFileURL(file).href });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('typeof window.switchTutorTab === "function"')) break;
        await delay(20);
    }
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const font of ['system-ui', 'Arial', 'Verdana']) {
        await evaluate(`document.body.style.fontFamily = '${font}'`);
        for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
            for (const tab of ['original', 'learning']) {
                await evaluate(`window.switchTutorTab('${tab}')`);
                const layout = await evaluate(`(() => {
                    document.getElementById('highlight-tools').open = true;
                    const panel = document.querySelector('.highlight-panel').getBoundingClientRect().toJSON();
                    const buttons = [...document.querySelectorAll('[data-highlight-action]')].map(button => ({
                        ...button.getBoundingClientRect().toJSON(), font: getComputedStyle(button).font
                    }));
                    const cards = document.getElementById('learning').hidden ? [] :
                        [...document.querySelectorAll('[data-learning-card]')];
                    const footers = cards.flatMap(card => {
                        const bounds = card.getBoundingClientRect();
                        const controls = [...card.querySelector('.learning-card-footer').children].map(control =>
                            control.getBoundingClientRect().toJSON());
                        const fits = controls.every(control => control.height >= 44 &&
                            Math.abs((control.top + control.bottom) / 2 - bounds.bottom) <= 2 &&
                            control.left >= bounds.left && control.right <= bounds.right) &&
                            (controls.length === 1 || controls[0].right + 4 <= controls[1].left);
                        return fits ? [] : [{ id: card.id, bounds: bounds.toJSON(), controls }];
                    });
                    return { panel, buttons, footers, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
                })()`);
                assert.equal(layout.panel.height < 65 && layout.panel.left >= 0 && layout.panel.right <= layout.viewport &&
                    layout.scrollWidth <= layout.viewport && layout.buttons.length === 4 && layout.buttons.every(button =>
                        button.height >= 44 && button.width >= 44 && Math.abs(button.top - layout.buttons[0].top) < 1 &&
                        button.left >= layout.panel.left && button.right <= layout.panel.right),
                true, `${font}/${theme}/${tab}: ${JSON.stringify(layout)}`);
                assert.deepEqual(layout.footers, [], `${font}/${theme}/${tab}: footer controls stay inside each card`);
                await evaluate('document.getElementById("highlight-tools").open = false');
                if (tab === 'learning') {
                    const header = await evaluate(`(() => {
                        const tabs = [...document.querySelectorAll('[role="tab"]')].map(button => ({
                            ...button.getBoundingClientRect().toJSON(),
                            label: button.querySelector('span').getBoundingClientRect().toJSON()
                        }));
                        const tools = ['#highlight-tools > summary', '#expand-learning', '#collapse-learning']
                            .map(selector => document.querySelector(selector).getBoundingClientRect().toJSON());
                        return { tabs, tools };
                    })()`);
                    assert.ok(header.tabs.every(button => button.width >= 44 && button.height >= 44 &&
                        button.label.left >= button.left && button.label.right <= button.right),
                    `${font}/${theme}: wider mobile tabs keep their labels inside: ${JSON.stringify(header)}`);
                    assert.ok(header.tools.every((button, index) => button.width >= 44 && button.height >= 44 &&
                        (!index || Math.abs(button.left - header.tools[index - 1].right) <= 1)),
                    'mobile helpers are adjacent without reducing their click areas');
                }
            }
        }
    }
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
                return { fullRail, compactRail, fullText, compactText, text: document.getElementById('timeline-track').innerText,
                    title: rail.querySelector('.timeline-title').checkVisibility(),
                    targets: [...rail.querySelectorAll('.timeline-year-link')].map(button => ({
                        width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
                        boxWidth: parseFloat(getComputedStyle(button, '::before').width),
                        boxHeight: parseFloat(getComputedStyle(button, '::before').height)
                    })), overflow: document.documentElement.scrollWidth > innerWidth };
            })()`);
            await capture(`history-timeline-${width}-${theme}-compact`);
            assert.equal(layout.compactRail < layout.fullRail && layout.compactText > layout.fullText &&
                layout.title && layout.text.trim().split(/\s+/).every(word => /^\d+$/.test(word)) &&
                layout.targets.every(target => target.width >= 44 && target.height >= 44 &&
                    target.boxHeight >= 26 && target.boxHeight <= 32 && target.boxWidth <= target.width - 6) && !layout.overflow,
            true, `${width}/${theme}: ${JSON.stringify(layout)}`);
            const edge = await evaluate(`(() => {
                const button = document.querySelector('.timeline-year-link');
                const bounds = button.getBoundingClientRect();
                return { x: bounds.left + 2, y: bounds.top + bounds.height / 2, target: button.parentElement.querySelector('.timeline-node').getAttribute('aria-controls') };
            })()`);
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
            assert.equal(await evaluate('document.activeElement.id'), edge.target, 'the transparent edge retains the full year click target');
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
            assert.equal(await evaluate('document.querySelector(".timeline-lifespan")'), null, 'lifespan brackets are not rendered');
            assert.equal(await evaluate('document.querySelector(".timeline-node").getAttribute("aria-label")'),
                '1740: Marie Terezie; život: 1717–1780', 'lifespan information remains accessible');
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
            assert.equal(await evaluate(`(async () => {
                const canvas = document.createElement('canvas');
                canvas.width = 120; canvas.height = 32;
                const context = canvas.getContext('2d');
                const rgb = values => values.slice(0, 3).map(n => {
                    n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
                }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
                for (const color of ['yellow', 'blue', 'green']) {
                    const marker = document.querySelector('mark[data-highlight-color="' + color + '"]') ||
                        document.querySelector('[data-highlight-action="' + color + '"]');
                    const style = getComputedStyle(marker);
                    context.fillStyle = style.color;
                    context.fillRect(0, 0, 120, 32);
                    const ink = rgb([...context.getImageData(0, 0, 1, 1).data]);
                    context.fillStyle = '#fff';
                    context.fillRect(0, 0, 120, 32);
                    const ancestors = [];
                    for (let element = marker; element; element = element.parentElement) ancestors.push(element);
                    ancestors.reverse().forEach(element => {
                        context.fillStyle = getComputedStyle(element).backgroundColor;
                        context.fillRect(0, 0, 120, 32);
                    });
                    if (marker.tagName === 'MARK') {
                        const image = new Image();
                        image.src = style.backgroundImage.slice(5, -2);
                        await image.decode();
                        context.drawImage(image, 0, 0, 120, 32);
                    }
                    const pixels = context.getImageData(0, 0, 120, 32).data;
                    for (let index = 0; index < pixels.length; index += 4) {
                        const paper = rgb([...pixels.slice(index, index + 3)]);
                        if ((Math.max(ink, paper) + .05) / (Math.min(ink, paper) + .05) < 4.5) return false;
                    }
                }
                return true;
            })()`), true, `${subject}/${theme}: highlighted text meets 4.5:1 contrast`);
        }
        await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
        // Viewport overrides return before media-query change callbacks run.
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
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

test('rough translucent markers wrap with visual spacing without changing copied text', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification'
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    for (const [subject, source] of [['history', history], ['maths', defaultMaths]]) {
        const lesson = structuredClone(source);
        const learningTarget = subject === 'history' ? 'chunks.0.sentences' : 'examples.0.prompt';
        const learningText = subject === 'history' ? lesson.chunks[0].sentences.join(' ') : lesson.examples[0].prompt;
        lesson.highlights = lesson.original.slice(0, 3).map((section, index) => ({
            target: `original.${index}.text`, quote: section.text, color: ['yellow', 'blue', 'green'][index]
        }));
        lesson.highlights.push({ target: learningTarget, quote: learningText, color: 'green' });
        const file = path.join(directory, `${subject}-rough-markers.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(20);
        }
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        for (const width of [320, 1024]) {
            await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            for (const theme of ['light', 'dark']) {
                await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
                for (const tab of ['original', 'learning']) {
                    await evaluate(`window.switchTutorTab('${tab}')`);
                    const target = tab === 'original' ? 'original.0.text' : learningTarget;
                    const expected = tab === 'original' ? lesson.original[0].text : learningText;
                    const result = await evaluate(`(async () => {
                        const root = document.querySelector('[data-highlight-target="${target}"]');
                        const marks = [...root.querySelectorAll('mark')];
                        const style = getComputedStyle(marks[0]);
                        const image = new Image();
                        image.src = style.backgroundImage.slice(5, -2);
                        await image.decode();
                        const canvas = document.createElement('canvas');
                        canvas.width = 120; canvas.height = 32;
                        const context = canvas.getContext('2d');
                        context.drawImage(image, 0, 0, 120, 32);
                        const pixels = context.getImageData(0, 0, 120, 32).data;
                        const alpha = Array.from(pixels).filter((_, index) => index % 4 === 3);
                        const edges = Array.from({ length: 32 }, (_, row) => {
                            for (let x = 0; x < 120; x++) if (pixels[(row * 120 + x) * 4 + 3] > 40) return x;
                        }).filter(x => x !== undefined);
                        const range = document.createRange();
                        range.selectNodeContents(root);
                        const selection = window.getSelection();
                        selection.removeAllRanges(); selection.addRange(range);
                        const copy = selection.toString();
                        selection.removeAllRanges();
                        return { text: root.textContent, copy, wraps: marks.some(mark => mark.getClientRects().length > 1),
                            alpha: Math.max(...alpha), transparent: Math.min(...alpha) === 0,
                            rough: new Set(edges).size > 1, opacity: style.opacity,
                            padding: parseFloat(style.paddingLeft) / parseFloat(style.fontSize),
                            margin: parseFloat(style.marginLeft) / parseFloat(style.fontSize),
                            decoration: style.boxDecorationBreak, overflow: document.documentElement.scrollWidth > innerWidth };
                    })()`);
                    assert.equal(result.text, expected);
                    assert.equal(result.copy, expected, `${subject}/${tab}: visual gaps do not alter copied text`);
                    assert.ok(result.alpha > 40 && result.alpha < 128 && result.transparent && result.rough,
                        `the embedded stroke is translucent with uneven edges: ${JSON.stringify(result)}`);
                    assert.equal(result.opacity, '1', 'only the marker ink is translucent, not its text');
                    assert.ok(Math.abs(result.padding - .12) < .001 && Math.abs(result.margin - .04) < .001,
                        'markers add small visual breathing room');
                    assert.equal(result.decoration, 'clone', 'each wrapped line gets a complete marker stroke');
                    assert.equal(result.overflow, false);
                    if (width === 320 && tab === 'original') assert.equal(result.wraps, true, 'long highlights wrap naturally');
                    await capture(`${subject}-rough-marker-${tab}-${theme}-${width}`);
                }
            }
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('learning cards prefer the mouse and fall back to the topmost card', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification'
}, async t => {
    const { directory, client, evaluate, exceptions, network } = await openBrowser(t);
    const frame = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const current = () => evaluate(`(() => {
        const top = document.getElementById('page-header').getBoundingClientRect().height + 16;
        const cards = [...document.querySelectorAll('[data-learning-card]')];
        return {
            active: cards.filter(card => card.dataset.timelineActive === 'true').map(card => card.id),
            segment: document.querySelector('.learning-segment[aria-current]')?.getAttribute('aria-controls'),
            timeline: [...document.querySelectorAll('.timeline-node[aria-current]')].map(button => button.getAttribute('aria-controls')),
            topmost: (cards.find(card => card.getBoundingClientRect().bottom > top) || cards.at(-1)).id
        };
    })()`);
    for (const [subject, lesson] of [['history', history], ['maths', defaultMaths]]) {
        const file = path.join(directory, `${subject}-mouse.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(20);
        }
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
        await evaluate(`window.switchTutorTab('learning')`);
        await evaluate(`document.querySelectorAll('[data-learning-card]').forEach(card => card.style.minHeight = '300px');
            window.scrollTo(0, 0); window.dispatchEvent(new Event('blur'))`);
        await frame();
        let state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: no mouse uses the topmost card`);
        const position = await evaluate(`(() => {
            const cards = [...document.querySelectorAll('[data-learning-card]')];
            const top = document.getElementById('page-header').getBoundingClientRect().height + 16;
            window.scrollBy(0, cards[1].getBoundingClientRect().top - top - 150);
            const bounds = cards[1].getBoundingClientRect();
            return { x: bounds.left + 70, y: bounds.top + 65, id: cards[1].id };
        })()`);
        await frame();
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y });
        await frame();
        state = await current();
        assert.notEqual(state.topmost, position.id, 'the hovered card is not the topmost card');
        assert.deepEqual(state.active, [position.id], `${subject}: mouse selects the whole card`);
        assert.equal(state.segment, position.id, 'progress follows the mouse');
        if (subject === 'history') assert.ok(state.timeline.length && state.timeline.every(id => id === position.id),
            'timeline follows the mouse');
        await evaluate(`(() => {
            const cards = [...document.querySelectorAll('[data-learning-card]')];
            window.scrollBy(0, cards[2].getBoundingClientRect().top - cards[1].getBoundingClientRect().top);
        })()`);
        await frame();
        const third = await evaluate(`document.querySelectorAll('[data-learning-card]')[2].id`);
        state = await current();
        assert.notEqual(state.topmost, third);
        assert.deepEqual(state.active, [third], `${subject}: scroll rechecks a stationary mouse`);
        assert.equal(state.segment, third);
        const gap = await evaluate(`document.getElementById(${JSON.stringify(third)}).getBoundingClientRect().top - 16`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: gap });
        await frame();
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: gaps between cards use the fallback`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: position.y });
        await frame();
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: outside cards falls back immediately`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y });
        await evaluate(`document.getElementById(${JSON.stringify(third)}).style.transform = 'translateX(1000px)';
            window.dispatchEvent(new Event('resize'))`);
        await frame();
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: resize rechecks the card under a stationary mouse`);
        await evaluate(`document.getElementById(${JSON.stringify(third)}).style.transform = '';
            window.dispatchEvent(new Event('resize'))`);
        await frame();
        assert.deepEqual((await current()).active, [third], `${subject}: resize restores mouse precedence`);
        await evaluate(`window.switchTutorTab('original')`);
        await evaluate(`window.switchTutorTab('learning')`);
        await evaluate(`window.dispatchEvent(new Event('resize'))`);
        await frame();
        state = await current();
        assert.equal(state.segment, state.active[0], `${subject}: tab switching keeps selection synchronized`);
        await evaluate(`(() => {
            const bounds = document.getElementById(${JSON.stringify(third)}).getBoundingClientRect();
            window.scrollBy(0, bounds.top - ${position.y - 65});
        })()`);
        await frame();
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -1, y: -1 });
        await frame();
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: leaving the viewport clears the mouse`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y });
        await evaluate(`document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }))`);
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: touch clears stale mouse selection`);
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y });
        await evaluate(`window.dispatchEvent(new Event('blur'))`);
        state = await current();
        assert.deepEqual(state.active, [state.topmost], `${subject}: window blur clears stale mouse selection`);
        assert.equal(await evaluate('document.querySelectorAll(".explored-control input:checked").length'), 0);
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('learning navigation, completion tones and timeline scrolling stay coordinated', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification'
}, async t => {
    const { directory, client, evaluate, exceptions, network } = await openBrowser(t);
    const frame = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const presentation = () => evaluate(`(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const rgb = color => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const card = document.querySelector('[data-learning-card]');
        const segment = document.querySelector('.learning-segment');
        const bar = document.getElementById('learning-segments');
        return { color: rgb(getComputedStyle(segment, '::before').backgroundColor),
            accent: rgb(getComputedStyle(bar).getPropertyValue('--subject-accent')),
            text: rgb(getComputedStyle(card.querySelector('.hint-prompt')).color),
            background: rgb(getComputedStyle(card).backgroundColor),
            opacity: getComputedStyle(card).opacity,
            intensity: parseFloat(bar.style.getPropertyValue('--completion-intensity')) };
    })()`);
    const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
    const luminance = rgb => rgb.map(value => {
        value /= 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    for (const [subject, lesson] of [['history', history], ['maths', defaultMaths]]) {
        const file = path.join(directory, `${subject}-navigation.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate('typeof window.switchTutorTab === "function"')) break;
            await delay(20);
        }
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 620, deviceScaleFactor: 1, mobile: false });
        await evaluate('window.switchTutorTab("learning")');
        await frame();
        const total = await evaluate('document.querySelectorAll("[data-learning-card]").length');
        assert.equal(await evaluate(`(() => {
            const bar = document.getElementById('learning-segments');
            const counter = document.getElementById('learning-counter');
            return bar.getAttribute('role') === 'navigation' && counter.getAttribute('role') === 'progressbar' &&
                Number(counter.getAttribute('aria-valuemax')) === ${total} &&
                [...bar.children].every(button => button.tagName === 'BUTTON' &&
                    button.getAttribute('aria-label').length > 0 && button.getAttribute('aria-controls') &&
                    !button.closest('[role="progressbar"]') && button.getBoundingClientRect().width >= 44 &&
                    button.getBoundingClientRect().height >= 44);
        })()`), true, `${subject}: segments are accessible navigation with separate progress semantics`);
        await evaluate('document.querySelector(".learning-segment:last-child").focus()');
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await frame();
        assert.deepEqual(await evaluate(`(() => {
            const segment = document.querySelector('.learning-segment:last-child');
            const card = document.getElementById(segment.getAttribute('aria-controls'));
            return { focused: document.activeElement === card, current: segment.getAttribute('aria-current'),
                unobscured: card.getBoundingClientRect().top >= document.getElementById('page-header').getBoundingClientRect().bottom,
                completed: document.querySelectorAll('.explored-control input:checked').length };
        })()`), { focused: true, current: 'step', unobscured: true, completed: 0 },
        `${subject}: keyboard segment navigation focuses an unobscured card without completing it`);
        if (subject === 'history') {
            assert.equal(await evaluate(`(() => {
                const rail = document.querySelector('.learning-timeline');
                const row = document.querySelector('.timeline-year[data-year="1648"]').getBoundingClientRect();
                const bounds = rail.getBoundingClientRect();
                const title = rail.querySelector('details').getBoundingClientRect();
                return rail.scrollTop > 0 && row.top >= title.bottom && row.bottom <= bounds.top + rail.clientHeight + 1 &&
                    Math.abs(title.top - bounds.top) < 1 && rail.querySelector('.timeline-title').checkVisibility() &&
                    document.querySelector('.timeline-year[data-year="1552"]').getBoundingClientRect().height <= 28 &&
                    !rail.querySelector('.timeline-lifespan') &&
                    [...rail.querySelectorAll('.timeline-year')].every(year => getComputedStyle(year).borderLeftWidth === '0px') &&
                    getComputedStyle(document.getElementById('timeline-track'), '::before').width === '2px' &&
                    [...rail.querySelectorAll('.timeline-year')].every(year =>
                        (getComputedStyle(year, '::before').content !== 'none') === !!year.querySelector('.timeline-node')) &&
                    [...rail.querySelectorAll('.timeline-node')].every(button => getComputedStyle(button, '::before').content === 'none');
            })()`), true, 'the clean timeline pins its title above visible selected years');
            const scroll = await evaluate('window.scrollY');
            await evaluate('document.querySelector(".learning-timeline").scrollTop = 0; window.dispatchEvent(new Event("resize"))');
            await frame();
            assert.equal(await evaluate('window.scrollY'), scroll, 'revealing a timeline year never scrolls the lesson page');
            assert.equal(await evaluate('document.querySelector(".learning-timeline").scrollTop > 0'), true);
            await evaluate('document.getElementById("timeline-details").open = false');
            await frame();
            assert.equal(await evaluate(`(() => {
                const rail = document.querySelector('.learning-timeline');
                const row = document.querySelector('.timeline-year[data-year="1648"]').getBoundingClientRect();
                const title = rail.querySelector('details').getBoundingClientRect();
                return row.top >= title.bottom && rail.querySelector('.timeline-title').checkVisibility() &&
                    Math.abs(title.top - rail.getBoundingClientRect().top) < 1 &&
                    row.bottom <= rail.getBoundingClientRect().top + rail.clientHeight + 1 && row.height <= 48;
            })()`), true, 'compact timeline retains its pinned title and reveals the active year below it');
            const down = await evaluate('document.querySelector(".learning-timeline").scrollTop');
            await evaluate('document.querySelector(".learning-segment").click()');
            await frame();
            assert.equal(await evaluate(`(() => {
                const rail = document.querySelector('.learning-timeline');
                const row = document.querySelector('.timeline-year[data-year="1575"]').getBoundingClientRect();
                return rail.scrollTop < ${down} && row.top >= rail.querySelector('details').getBoundingClientRect().bottom &&
                    row.bottom <= rail.getBoundingClientRect().top + rail.clientHeight + 1;
            })()`), true, 'timeline scrolls upward when returning to an earlier card');
            await evaluate('document.getElementById("timeline-details").open = true');
            await frame();
            await evaluate('document.querySelector(".learning-segment:last-child").click()');
            await frame();
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
            await frame();
            await evaluate('document.querySelector(".timeline-year[data-year=\\"1617\\"] .timeline-node").click()');
            for (let attempt = 0; attempt < 80; attempt++) {
                await frame();
                if (await evaluate('Math.abs(document.getElementById("learning-chunk-0").getBoundingClientRect().top - document.getElementById("page-header").getBoundingClientRect().height - 16) < 2')) break;
            }
            await evaluate('window.dispatchEvent(new Event("resize"))');
            await frame();
            const selectedYear = await evaluate(`(() => {
                const rail = document.querySelector('.learning-timeline');
                const row = document.querySelector('.timeline-year[data-year="1617"]').getBoundingClientRect();
                const card = document.getElementById('learning-chunk-0').getBoundingClientRect();
                return { aligned: Math.abs(card.top - document.getElementById('page-header').getBoundingClientRect().height - 16) < 2,
                    top: row.top, bottom: row.bottom, viewTop: rail.querySelector('details').getBoundingClientRect().bottom,
                    viewBottom: rail.getBoundingClientRect().top + rail.clientHeight };
            })()`);
            assert.ok(selectedYear.aligned && selectedYear.top >= selectedYear.viewTop &&
                selectedYear.bottom <= selectedYear.viewBottom + 1,
            `a specifically selected year survives smooth navigation and visibility updates: ${JSON.stringify(selectedYear)}`);
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            await frame();
        }
        for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme = '${theme}';
                document.querySelectorAll('.explored-control input:checked').forEach(input => input.click());
                document.querySelector('.learning-segment').click();`);
            await frame();
            const unread = await presentation();
            await evaluate('document.querySelector(".explored-control").click()');
            const low = await presentation();
            assert.notDeepEqual(low.text, unread.text, `${subject}/${theme}: explored text becomes subdued`);
            assert.equal(low.opacity, '1', 'card controls and marker colors are not faded');
            const a = luminance(low.text), b = luminance(low.background);
            assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5,
                `${subject}/${theme}: subdued text retains readable contrast`);
            assert.ok(Math.abs(low.intensity - (30 + 70 / total)) < .001);
            await evaluate(`Array.from(document.querySelectorAll('.explored-control')).slice(1, ${Math.ceil(total / 2)}).forEach(label => label.click())`);
            const middle = await presentation();
            await evaluate('document.querySelectorAll(".explored-control input:not(:checked)").forEach(input => input.click())');
            const full = await presentation();
            assert.ok(distance(low.color, full.accent) > distance(middle.color, full.accent),
                `${subject}/${theme}: completed boxes strengthen as overall completion grows`);
            assert.deepEqual(full.color, full.accent, `${subject}/${theme}: full completion uses the full subject color`);
            assert.equal(full.intensity, 100);
            assert.equal(await evaluate('Number(document.getElementById("learning-counter").getAttribute("aria-valuenow"))'), total);
            await evaluate('document.querySelector(".explored-control").click()');
            const restored = await presentation();
            assert.deepEqual(restored.text, unread.text, 'unchecking restores the original text presentation');
            assert.deepEqual(restored.color, unread.color, 'unchecked boxes return to neutral');
        }
        await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
        await frame();
        await evaluate('document.querySelector(".learning-segment:last-child").click()');
        await frame();
        assert.equal(await evaluate(`(() => {
            const bar = document.getElementById('learning-segments');
            const button = bar.lastElementChild.getBoundingClientRect();
            const bounds = bar.getBoundingClientRect();
            return bar.scrollLeft > 0 && button.left >= bounds.left - 1 &&
                button.right <= bounds.left + bar.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth;
        })()`), true, `${subject}: the active segment stays visible in the narrow scrollable strip`);
        if (subject === 'history') {
            assert.equal(await evaluate('document.getElementById("timeline-details").open'), false, 'mobile navigation does not open the timeline');
            await evaluate('document.getElementById("timeline-details").open = true');
            await frame();
            assert.equal(await evaluate(`(() => {
                const track = document.getElementById('timeline-track');
                const row = document.querySelector('.timeline-year[data-year="1648"]').getBoundingClientRect();
                const top = track.getBoundingClientRect().top;
                return track.scrollTop > 0 && row.top >= top && row.bottom <= top + track.clientHeight + 1;
            })()`), true, 'expanded mobile timeline scrolls its own track to the active year');
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('legacy offline pages download complete lessons without upgrading their contracts', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const browser = await openBrowser(t);
    const legacyHistory = structuredClone(history);
    legacyHistory.version = 1;
    delete legacyHistory.subject;
    delete legacyHistory.language;
    delete legacyHistory.subtitle;
    legacyHistory.questions.forEach(question => { delete question.assessment; });
    const legacyMaths = mathsLesson();
    legacyMaths.version = 2;
    delete legacyMaths.subtitle;
    legacyMaths.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
    for (const [subject, lesson] of [['history', legacyHistory], ['maths', legacyMaths]]) {
        const file = path.join(browser.directory, `${subject}-legacy.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await browser.client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await browser.evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(50);
        }
        assert.equal(await browser.evaluate(`document.getElementById('topic').textContent`), lesson.topic);
        await browser.evaluate(`window.switchTutorTab('quiz')`, true);
        await checkExport({ ...browser, subject, lesson });
    }
    assert.deepEqual(browser.exceptions, []);
    assert.deepEqual(browser.network, []);
});
