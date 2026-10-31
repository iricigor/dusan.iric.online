'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function checkQuizGuard({ client, evaluate, capture, handleDialog, subject, lesson }) {
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
    const contentBeforeExport = await evaluate(`document.getElementById('lesson-data').textContent`);
    const recordsBeforeExport = await evaluate(`JSON.stringify(Object.entries(sessionStorage))`);
    await evaluate(`document.querySelector('#quiz-tools summary').click(); document.getElementById('quiz-export').click()`);
    assert.deepEqual(await quizSnapshot(), unfinished, `${subject}: export preserves an active quiz and entered answers`);
    assert.equal(await evaluate(`document.getElementById('lesson-data').textContent`), contentBeforeExport,
        `${subject}: export does not mutate embedded lesson data`);
    assert.equal(await evaluate(`JSON.stringify(Object.entries(sessionStorage))`), recordsBeforeExport,
        `${subject}: export does not change learner records`);
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
}

module.exports = { checkQuizGuard };
