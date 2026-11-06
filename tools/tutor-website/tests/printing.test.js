'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { selectPractice } = require('../runtime/printing.js');
const { renderLesson } = require('../build.js');
const { mathsAssessmentLesson } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const maths = require('../examples/zlomky-a-prevody-delky.json');
const { browserPath, openBrowser } = require('./helpers/browser.js');
const { page } = require('./helpers/runtime.js');

test('printing pauses answer duration and history bonus without resetting entered answers', () => {
    for (const subject of ['history', 'maths']) {
        const app = page(subject);
        app.start('hard');
        app.advance(1000);
        const prompt = app.get('question').textContent;
        app.get('print-test').dispatch('click');
        app.advance(60000);
        if (subject === 'history') {
            assert.ok(Math.abs(Number(app.get('bonus').style.opacity) - (1 - 1000 / 12000)) < 1e-12);
            assert.ok(Math.abs(Number(app.get('bonus-bar').style.transform.match(/scaleX\((.*)\)/)[1]) - (1 - 1000 / 15000)) < 1e-12);
        }
        app.get('print-close').dispatch('click');
        assert.equal(app.get('question').textContent, prompt);
        app.advance(1000);
        if (subject === 'history') {
            assert.ok(Math.abs(Number(app.get('bonus').style.opacity) - (1 - 2000 / 12000)) < 1e-12);
            app.get('answers').children[0].dispatch('click');
            assert.match(app.get('feedback').textContent, /bonus \+10/);
        } else app.get('answers').children[0].dispatch('click');
        for (let index = 1; index < 10; index++) {
            app.get('next').dispatch('click');
            const inputs = app.get('answers').querySelectorAll('input');
            if (inputs.length) {
                inputs.forEach(input => { input.value = '1'; });
                app.get('answers').dispatch('submit');
            } else app.get('answers').children[0].dispatch('click');
        }
        app.get('next').dispatch('click');
        assert.equal(app.records()[0].answerDurationMs, 2000);
    }
});

test('practice selection respects exact difficulty and count without mutation or replacement', () => {
    for (const bank of [history.questions, maths.exercises, mathsAssessmentLesson().exercises]) {
        const original = structuredClone(bank);
        for (const level of ['easy', 'medium', 'hard']) {
            const available = bank.filter(question => question.difficulty === level).length;
            for (const count of [1, available]) {
                const selected = selectPractice(bank, level, count, () => .4);
                assert.equal(selected.length, count);
                assert.equal(new Set(selected.map(question => question.id)).size, count);
                assert.ok(selected.every(question => question.difficulty === level && bank.includes(question)));
            }
            for (const count of [0, -1, .5, NaN, Infinity, available + 1]) {
                assert.throws(() => selectPractice(bank, level, count), /Practice count/);
            }
        }
        assert.throws(() => selectPractice(bank, 'unknown', 1), /difficulty/);
        assert.deepEqual(bank, original);
    }
    assert.throws(() => selectPractice([], 'easy', 1), /between 1 and 0/);
});

test('offline printable sheets use A4, authored answers and selected quiz order without changing online state', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 120000
}, async t => {
    const browser = await openBrowser(t);
    const { directory, client, evaluate, exceptions, network, capture } = browser;
    const closePrint = () => evaluate(`new Promise(resolve => {
        document.getElementById('print-dialog').addEventListener('close', resolve, { once: true });
        document.getElementById('print-close').click();
    })`);
    for (const [subject, source] of [['history', history], ['maths', mathsAssessmentLesson()], ['maths', maths]]) {
        const lesson = structuredClone(source);
        const bank = lesson.exercises || lesson.questions;
        const file = path.join(directory, `${subject}-v${lesson.version}-print.html`);
        fs.writeFileSync(file, renderLesson(subject, lesson));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`)) break;
            await delay(20);
        }
        await evaluate(`window.switchTutorTab('learning')`);
        await evaluate(`document.getElementById('practice-sheet').click();
            document.getElementById('practice-difficulty').value = 'hard';
            document.getElementById('practice-count').value = '2';
            document.getElementById('practice-count').dispatchEvent(new Event('change'));`);
        const ids = await evaluate(`[...document.querySelectorAll('#print-sheet .print-question')].map(item => item.dataset.questionId)`);
        assert.equal(ids.length, 2);
        assert.equal(new Set(ids).size, 2);
        assert.ok(ids.every(id => bank.some(question => question.id === id && question.difficulty === 'hard')));
        assert.equal(await evaluate(`document.querySelector('#print-sheet .print-answer-key')`), null);
        assert.equal(await evaluate(`document.querySelectorAll('#print-sheet input, #print-sheet button, #print-sheet details').length`), 0);
        assert.deepEqual(await evaluate(`JSON.parse(document.getElementById('lesson-data').textContent)`), lesson);

        const questions = ids.map(id => bank.find(question => question.id === id));
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#print-sheet h3')].map(item => item.textContent)`),
            questions.map((question, index) => `${index + 1}. ${question.prompt}`));
        if (subject === 'maths') {
            const labels = questions.flatMap((question, index) => question.steps.map((step, offset) =>
                `${index + 1}.${offset + 1}: ${step.prompt}${step.answer.format === 'length' ? ' (včetně jednotky)' : ''}`));
            assert.deepEqual(await evaluate(`[...document.querySelectorAll('#print-sheet .print-part > p')].map(item => item.textContent)`), labels);
            assert.ok(await evaluate(`[...document.querySelectorAll('#print-preview .print-part .print-working')]
                .every(item => item.getBoundingClientRect().height >= 120)`), 'maths working space is at least 32mm');
        }
        await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.ok(await evaluate(`document.getElementById('print-dialog').scrollWidth <= document.getElementById('print-dialog').clientWidth`),
            'settings and preview fit narrow screens');
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate(`document.documentElement.dataset.theme = 'dark'`);
        await client.send('Emulation.setEmulatedMedia', { media: 'print' });
        assert.deepEqual(await evaluate(`({
            header: getComputedStyle(document.getElementById('page-header')).display,
            main: getComputedStyle(document.querySelector('main')).display,
            dialog: getComputedStyle(document.getElementById('print-dialog')).display,
            sheet: getComputedStyle(document.getElementById('print-sheet')).display,
            color: getComputedStyle(document.querySelector('#print-sheet .print-document')).color
        })`), { header: 'none', main: 'none', dialog: 'none', sheet: 'block', color: 'rgb(0, 0, 0)' });
        const pdf = await client.send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false });
        const pdfText = Buffer.from(pdf.data, 'base64').toString('latin1');
        const media = pdfText.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
        assert.ok(media, 'PDF has a media box');
        assert.ok(Math.abs(Number(media[1]) - 595.28) < 1 && Math.abs(Number(media[2]) - 841.89) < 1, 'PDF is A4');
        const pages = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
        assert.ok(pages > 0);
        await capture(`${subject}-v${lesson.version}-print-questions`);
        await client.send('Emulation.setEmulatedMedia', { media: '' });
        await evaluate(`document.getElementById('print-key').checked = true;
            document.getElementById('print-key').dispatchEvent(new Event('change'));`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#print-sheet .print-answer-key article')].map(item => item.dataset.questionId)`), ids);
        for (const question of questions) {
            const keyText = await evaluate(`document.querySelector('#print-sheet .print-answer-key').textContent`);
            assert.ok(keyText.includes(question.explanation));
            if (question.steps) question.steps.forEach(step => assert.ok(keyText.includes(step.solution)));
            else assert.ok(keyText.includes(question.acceptedAnswers[0]));
        }
        await client.send('Emulation.setEmulatedMedia', { media: 'print' });
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('#print-sheet .print-answer-key')).breakBefore`), 'page');
        const keyPdf = await client.send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false });
        const keyPages = (Buffer.from(keyPdf.data, 'base64').toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
        assert.ok(keyPages >= pages + 1, 'answer key starts on separate PDF pages');
        await capture(`${subject}-v${lesson.version}-print-key`);
        await client.send('Emulation.setEmulatedMedia', { media: '' });
        await evaluate(`document.getElementById('practice-count').value = '999';
            document.getElementById('practice-count').dispatchEvent(new Event('change'));`);
        assert.equal(await evaluate(`document.getElementById('print-now').disabled`), true);
        assert.equal(await evaluate(`document.getElementById('print-error').hidden`), false);
        assert.equal(await evaluate(`document.getElementById('print-sheet').children.length`), 0);
        await evaluate(`document.getElementById('practice-count').value = '1.5';
            document.getElementById('practice-count').dispatchEvent(new Event('change'));`);
        assert.equal(await evaluate(`document.getElementById('print-now').disabled`), true);
        await closePrint();
        assert.equal(await evaluate(`document.getElementById('print-dialog').open`), false);
        assert.equal(await evaluate(`document.activeElement.id`), 'practice-sheet');

        await evaluate(`window.switchTutorTab('quiz')`);
        await evaluate(`document.getElementById('print-test').click();
            document.getElementById('print-key').checked = false;
            document.getElementById('print-key').dispatchEvent(new Event('change'));`);
        assert.equal(await evaluate(`document.getElementById('setup').hidden`), false, 'printing does not start online quiz');
        assert.equal(await evaluate(`document.getElementById('print-mode-row').hidden`), false);
        assert.equal(await evaluate(`document.querySelectorAll('#print-sheet .print-question').length`), lesson.version === 4 ? 4 : 3);
        await closePrint();
        await evaluate(`document.getElementById('player').value = 'Tester';
            document.querySelector('[data-mode="hard"]').click();`);
        if (subject === 'maths' && lesson.version !== 4) await evaluate(`document.querySelector('#answers input').value = '42'`);
        const snapshot = await evaluate(`({
            question: document.getElementById('question').textContent,
            answers: document.getElementById('answers').innerHTML,
            values: [...document.querySelectorAll('#answers input')].map(input => input.value),
            progress: document.getElementById('progress').textContent,
            score: document.getElementById('score').textContent,
            storage: JSON.stringify(Object.entries(sessionStorage)),
            learning: document.getElementById('learning-content').innerHTML,
            name: document.getElementById('player').value
        })`);
        await evaluate(`document.getElementById('print-test').click()`);
        const quizIds = await evaluate(`[...document.querySelectorAll('#print-sheet .print-question')].map(item => item.dataset.questionId)`);
        assert.equal(quizIds.length, 10);
        assert.equal(await evaluate(`document.getElementById('print-mode-row').hidden`), true);
        assert.equal(await evaluate(`document.querySelector('#print-sheet h3').textContent`), `1. ${snapshot.question}`);
        await evaluate(`window.print = () => {
            window.printCalls = (window.printCalls || 0) + 1;
            window.dispatchEvent(new Event('beforeprint'));
            window.dispatchEvent(new Event('afterprint'));
        }; document.getElementById('print-now').click();`);
        assert.equal(await evaluate(`window.printCalls`), 1);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#print-sheet .print-question')].map(item => item.dataset.questionId)`), quizIds);
        await evaluate(`window.print = () => { throw new Error('print unavailable'); };
            document.getElementById('print-now').click();`);
        assert.equal(await evaluate(`document.getElementById('print-error').hidden`), false);
        const closed = evaluate(`new Promise(resolve => {
            document.getElementById('print-dialog').addEventListener('close', resolve, { once: true });
        })`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await closed;
        assert.deepEqual(await evaluate(`({
            question: document.getElementById('question').textContent,
            answers: document.getElementById('answers').innerHTML,
            values: [...document.querySelectorAll('#answers input')].map(input => input.value),
            progress: document.getElementById('progress').textContent,
            score: document.getElementById('score').textContent,
            storage: JSON.stringify(Object.entries(sessionStorage)),
            learning: document.getElementById('learning-content').innerHTML,
            name: document.getElementById('player').value
        })`), snapshot, 'printing, failure and cancellation preserve lesson and quiz state');
        for (const id of quizIds) {
            const question = bank.find(item => item.id === id);
            assert.equal(await evaluate(`document.getElementById('question').textContent`), question.prompt, 'entire quiz follows printed order');
            await evaluate(`(() => {
                const buttons = document.querySelectorAll('#answers button');
                const inputs = document.querySelectorAll('#answers input');
                if (inputs.length) {
                    inputs.forEach(input => input.value = '1');
                    document.getElementById('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                } else buttons[0].click();
                document.getElementById('next').click();
            })()`);
        }
        assert.equal(await evaluate(`document.getElementById('results').hidden`), false);
        await evaluate(`document.getElementById('print-test').click()`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#print-sheet .print-question')].map(item => item.dataset.questionId)`), quizIds,
            'completed quiz remains printable with the original selection');
        await closePrint();
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
