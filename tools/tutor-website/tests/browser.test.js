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
    const legacyMaths = structuredClone(defaultMaths);
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
