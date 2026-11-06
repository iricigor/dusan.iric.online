'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { renderLesson } = require('../build.js');
const lesson = require('../examples/my-collections.json');
const { browserPath, openBrowser } = require('./helpers/browser.js');

test('English real page covers all exercise formats, listening lifecycle, grading, modes, storage and mobile themes', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.speechCalls = [];
        window.cancelledSpeech = 0;
        window.testVoices = [{ lang: 'en-GB', localService: true }];
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: function(text) { this.text = text; } });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
            getVoices: () => window.testVoices,
            addEventListener: () => {},
            speak: utterance => { window.speechCalls.push(utterance); utterance.onstart(); },
            cancel: () => { window.cancelledSpeech++; }
        } });
    ` });
    const file = path.join(directory, 'english.html');
    fs.writeFileSync(file, renderLesson('english', lesson));
    await client.send('Page.navigate', { url: pathToFileURL(file).href });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        ready = await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(lesson.topic)}`);
        if (ready) break;
        await delay(20);
    }
    assert.equal(ready, true);
    const introduction = await evaluate(`(async () => {
        const $ = id => document.getElementById(id);
        await window.switchTutorTab('learning');
        const chunks = document.querySelectorAll('[data-learning-card]');
        const hintsClosed = [...document.querySelectorAll('.hint-toggle')].every(button => button.getAttribute('aria-expanded') === 'false');
        const controls = document.querySelector('.listening-controls');
        controls.querySelector('button').click();
        controls.querySelector('button').click();
        const replay = speechCalls.length === 2 && cancelledSpeech === 1;
        const language = document.querySelector('#learning-content p[lang]').lang;
        const count = $('learning-counter').textContent;
        await window.switchTutorTab('quiz');
        const cancelledOnTab = cancelledSpeech === 2;
        $('player').value = 'Ab';
        document.querySelector('[data-mode="hard"]').click();
        return { cards: chunks.length, hintsClosed, replay, language, count, cancelledOnTab,
            blocked: !$('setup').hidden && !!$('name-error').textContent, noBonus: !$('bonus') };
    })()`);
    assert.deepEqual(introduction, { cards: 7, hintsClosed: true, replay: true, language: 'en-GB', count: '0/7 Prozkoumáno', cancelledOnTab: true, blocked: true, noBonus: true });

    const results = await evaluate(`(async () => {
        const $ = id => document.getElementById(id);
        const lesson = JSON.parse($('lesson-data').textContent);
        const originalSelect = selectExercises;
        const seen = new Set();
        let partial = false;
        let noTranscript = true;
        let transcriptAfter = true;
        let noGlossaryLeak = true;
        let cancellation = true;
        let languageFields = true;
        let missingVoice = false;
        const finished = [];
        const rounds = ['easy', 'medium', 'hard', 'hard', 'hard'];
        for (let round = 0; round < rounds.length; round++) {
            if (round > 0) $('restart').click();
            if (round >= 2) {
                const batch = round - 2;
                selectExercises = exercises => ['easy', 'medium', 'hard'].flatMap((level, index) =>
                    exercises.filter(e => e.difficulty === level).slice(batch * [2,5,3][index], (batch + 1) * [2,5,3][index]));
            }
            $('player').value = 'Kontrola';
            document.querySelector('[data-mode="' + rounds[round] + '"]').click();
            let answers = 0;
            while (!$('game').hidden && answers < 11) {
                const question = lesson.exercises.find(e => e.prompt === $('question').textContent);
                seen.add(question.type);
                noGlossaryLeak &&= !$('question-material').querySelector('.term');
                if (question.audio) {
                    noTranscript &&= !$('question-material').textContent.includes(question.audio.text);
                    const play = $('question-material').querySelector('button');
                    if (!missingVoice) {
                        testVoices = [];
                        play.click();
                        missingVoice = $('question-material').textContent.includes('není dostupný');
                        testVoices = [{lang: 'en-US', localService: true}];
                    }
                    play.click();
                    const count = cancelledSpeech;
                    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
                    document.dispatchEvent(new Event('visibilitychange'));
                    cancellation &&= cancelledSpeech === count + 1;
                    Object.defineProperty(document, 'hidden', {configurable: true, value: false});
                    document.dispatchEvent(new Event('visibilitychange'));
                    play.click();
                }
                if (question.options) $('answers').querySelectorAll('button')[question.answer].click();
                else {
                    languageFields &&= $('answer-input').lang === question.answerLanguage;
                    const typo = question.id === 'translate-magazine';
                    $('answer-input').value = typo ? 'magazin' : question.acceptedAnswers[0];
                    $('answers').requestSubmit();
                    if (typo) partial ||= $('feedback').textContent.includes('polovinu bodů');
                }
                if (question.audio) transcriptAfter &&= $('feedback').textContent.includes(question.audio.text);
                const score = $('score').textContent;
                const replay = $('question-material').querySelector('.listening-controls button');
                if (replay) {
                    replay.click();
                    cancellation &&= $('score').textContent === score;
                }
                $('next').click();
                answers++;
            }
            finished.push({ answers, grade: $('grade').textContent, duration: $('answer-duration').textContent });
        }
        selectExercises = originalSelect;
        const stored = JSON.parse(sessionStorage.getItem('english-tutor:v5:' + lesson.id));
        return { seen: [...seen].sort(), partial, noTranscript, transcriptAfter, noGlossaryLeak, cancellation,
            languageFields, missingVoice, finished, stored: stored.length,
            validRecords: stored.every(row => subjectForLesson(lesson).validRecord(row)),
            otherStorage: sessionStorage.getItem('history-tutor:v1:' + lesson.id) };
    })()`);
    assert.deepEqual(results.seen, ['choice', 'gapFill', 'listening', 'text', 'translation', 'trueFalse', 'wordOrder'].sort());
    for (const key of ['partial', 'noTranscript', 'transcriptAfter', 'noGlossaryLeak', 'cancellation', 'languageFields', 'missingVoice', 'validRecords']) assert.equal(results[key], true, key);
    assert.deepEqual(results.finished.map(result => result.answers), [3, 5, 10, 10, 10]);
    assert.ok(results.finished.every(result => result.duration.includes('Doba odpovídání:') && result.grade.includes('Známka: 1')));
    assert.equal(results.stored, 5);
    assert.equal(results.otherStorage, null);

    for (const width of [320, 1280]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const theme of ['light', 'dark']) {
            const layout = await evaluate(`(async () => {
                document.documentElement.dataset.theme = '${theme}';
                await window.switchTutorTab('learning');
                const card = document.querySelector('[data-learning-card]');
                return { overflow: document.documentElement.scrollWidth > innerWidth,
                    paper: getComputedStyle(card).backgroundColor,
                    english: [...document.querySelectorAll('#learning-content p[lang="en-GB"]')].length };
            })()`);
            assert.equal(layout.overflow, false, `${width}/${theme}`);
            assert.notEqual(layout.paper, 'rgba(0, 0, 0, 0)');
            assert.equal(layout.english, 7);
            await capture(`english-${width}-${theme}`);
        }
    }
    await client.send('Page.reload');
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`!!document.getElementById('leaderboard-content')?.querySelector('table')`)) break;
        await delay(20);
    }
    assert.equal(await evaluate(`document.getElementById('storage-warning').hidden`), true);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});
