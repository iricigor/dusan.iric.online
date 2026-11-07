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

test('comic context keeps the explanation quiet and separates optional introductions from general guidance', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    const panels = [
        { heading: 'Obrázek 1', language: 'en-GB', panelDescription: 'Dítě ukazuje kamarádovi krabici.', text: 'Look at my collection!' },
        { heading: 'Obrázek 2', language: 'en-GB', panelDescription: 'Děti společně prohlížejí krabici.', text: 'Wow!' }
    ];
    const introduction = 'Dítě ukazuje kamarádovi svou sbírku. Společně si prohlížejí krabici.';
    const guidance = 'Čti obrázky postupně. Když něčemu nerozumíš, vrať se k předchozí větě.';
    const cases = [
        { original: lesson.original },
        { original: panels, comicIntroduction: '<b>Úvod není HTML.</b>', comicGuidance: '<img src=x onerror=alert(1)>' },
        { original: panels },
        { original: panels, comicIntroduction: introduction },
        { original: panels, comicGuidance: guidance },
        { original: panels, comicIntroduction: introduction, comicGuidance: guidance }
    ];
    for (const [index, context] of cases.entries()) {
        const source = { ...structuredClone(lesson), ...context, topic: `Komiks ${index}` };
        const file = path.join(directory, `comic-context-${index}.html`);
        fs.writeFileSync(file, renderLesson('english', source));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            ready = await evaluate(`document.getElementById('topic')?.textContent === ${JSON.stringify(source.topic)}`);
            if (ready) break;
            await delay(20);
        }
        assert.equal(ready, true);
        const result = await evaluate(`(() => {
            const container = document.getElementById('original-content');
            const context = container.querySelector('.comic-context');
            const firstCard = container.querySelector('.card');
            return {
                originals: [...container.querySelectorAll('.original-text')].map(element => element.textContent),
                notices: container.querySelectorAll('.comic-description-note').length,
                introduction: context?.querySelector('.comic-introduction')?.textContent ?? null,
                guidance: context?.querySelector('.comic-guidance span')?.textContent ?? null,
                guidanceLabel: context?.querySelector('.comic-guidance strong')?.textContent ?? null,
                top: !context || (context === container.firstElementChild &&
                    context.getBoundingClientRect().bottom <= firstCard.getBoundingClientRect().top),
                separate: !container.querySelector('.card .comic-context, .original-text .comic-context'),
                plainText: !context?.querySelector('b, img, script'),
                quiet: !context?.querySelector('h1, h2, h3, .card, .callout, [role="alert"]'),
                language: context?.lang ?? null
            };
        })()`);
        assert.deepEqual(result.originals, source.original.map(section => section.text));
        assert.equal(result.notices, context.original === panels ? 1 : 0);
        assert.equal(result.introduction, context.comicIntroduction || null);
        assert.equal(result.guidance, context.comicGuidance || null);
        assert.equal(result.guidanceLabel, context.comicGuidance ? 'Obecné pokyny: ' : null);
        assert.equal(result.language, context.original === panels ? 'cs-CZ' : null);
        for (const key of ['top', 'separate', 'plainText', 'quiet']) assert.equal(result[key], true, `${index}: ${key}`);
    }
    for (const width of [320, 1280]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const theme of ['light', 'dark']) {
            const layout = await evaluate(`(() => {
                document.documentElement.dataset.theme = '${theme}';
                const note = document.querySelector('.comic-description-note');
                const guidance = document.querySelector('.comic-guidance');
                const text = document.querySelector('.original-text');
                return {
                    readable: note.checkVisibility() && guidance.checkVisibility(),
                    sizes: [note, guidance, text].map(element => parseFloat(getComputedStyle(element).fontSize)),
                    colors: [note, guidance, text].map(element => getComputedStyle(element).color),
                    noDecoration: [note, guidance].every(element => {
                        const style = getComputedStyle(element);
                        return style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
                            style.borderLeftWidth === '0px' && style.boxShadow === 'none';
                    }),
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            })()`);
            assert.equal(layout.readable, true);
            assert.ok(layout.sizes[0] < layout.sizes[2] && layout.sizes[1] < layout.sizes[2]);
            assert.equal(layout.colors[0], layout.colors[1]);
            assert.notEqual(layout.colors[0], layout.colors[2]);
            assert.equal(layout.noDecoration, true);
            assert.equal(layout.overflow, false);
            await capture(`comic-context-${width}-${theme}`);
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('English comic panels and spelling feedback preserve source text and distinguish UK/US notes in orange themes', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    const source = structuredClone(lesson);
    source.original = [
        { heading: 'Komiks – obrázek 1', language: 'en-GB', panelDescription: 'Dítě ukazuje sbírku. <b>Popis není HTML.</b>',
            text: 'I have a collektion.\nMy "favorite" colour is orange!' },
        { heading: 'Komiks – obrázek 2', language: 'en-GB', panelDescription: 'Kamarád prohlíží barevnou vitrínu.',
            text: 'This center has a colourful display.\n\nMy neighbour likes its organization and color.',
            paragraphs: [
                { style: 'plain', text: 'This center has a colourful display.' },
                { style: 'quote', text: 'My neighbour likes its organization and color.' }
            ] },
        { heading: 'Komiks – obrázek 3', language: 'en-GB', panelDescription: 'Děti odcházejí společně.', text: '' }
    ];
    const spelling = { section: 0, quote: 'collektion', kind: 'spelling', explanation: 'Správně je collection. <b>Text není HTML.</b>' };
    const variants = ['favorite', 'center', 'organization', 'color'].map((quote, index) => ({
        section: index ? 1 : 0, quote, kind: 'spellingVariant', explanation: 'Platná americká varianta; sjednoť britský a americký pravopis.'
    }));
    source.highlights = [{ target: 'original.0.text', quote: spelling.quote, color: 'yellow' }];
    for (const count of [0, 1, 2, 3, 4]) {
        source.originalNotes = [spelling, ...variants.slice(0, count)];
        const file = path.join(directory, `spelling-${count}.html`);
        fs.writeFileSync(file, renderLesson('english', source));
        await client.send('Page.navigate', { url: pathToFileURL(file).href });
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            ready = await evaluate(`document.querySelectorAll('#original-content .card').length === 3`);
            if (ready) break;
            await delay(20);
        }
        assert.equal(ready, true);
        const feedback = await evaluate(`(() => {
            const cards = [...document.querySelectorAll('#original-content .card')];
            const notes = [...document.querySelectorAll('.original-note')];
            const spelling = document.querySelector('.correction:not(.correction-variant)');
            spelling.click();
            const popup = document.getElementById('definition');
            const popupOpen = popup.matches(':popover-open') &&
                document.getElementById('definition-title').textContent.includes('Pravopisná chyba') &&
                document.getElementById('definition-text').textContent.includes('collection');
            document.getElementById('definition-close').click();
            return {
                originals: cards.map(card => card.querySelector('.original-text').textContent),
                headings: cards.map(card => card.querySelector('.heading-text').textContent),
                descriptions: cards.map(card => card.querySelector('.comic-panel-description p').textContent),
                descriptionLanguages: cards.map(card => card.querySelector('.comic-panel-description').lang),
                sourceLanguages: cards.map(card => card.querySelector('.original-text').lang),
                descriptionSeparate: cards.every(card => !card.querySelector('.original-text .comic-panel-description')),
                descriptionLiteral: !cards[0].querySelector('.comic-panel-description b'),
                descriptionIntegrated: cards.every(card => card.querySelector('.comic-panel-description').parentElement === card),
                noRepeatedTitles: cards.every(card => card.querySelectorAll('h2').length === 1 &&
                    !card.querySelector('.comic-panel-label') &&
                    !['Autorský popis', 'Popis obrázku:', 'Text z obrázku:'].some(title => card.textContent.includes(title))),
                silent: cards[2].querySelector('.original-text').textContent === '' &&
                    cards[2].querySelector('.comic-panel-description').checkVisibility(),
                labels: notes.map(note => note.querySelector('strong').textContent),
                noteCounts: cards.map(card => card.querySelectorAll('.original-note').length),
                marks: cards.map(card => card.querySelectorAll('.correction').length),
                visible: notes.every(note => note.checkVisibility()),
                literal: !notes[0].querySelector('b') && notes[0].textContent.includes('<b>Text není HTML.</b>'),
                highlighted: !!spelling.querySelector('[data-highlight-color="yellow"]'),
                popupOpen, focusRestored: document.activeElement === spelling
            };
        })()`);
        assert.deepEqual(feedback.originals, source.original.map(section => section.text));
        assert.deepEqual(feedback.headings, source.original.map(section => section.heading));
        assert.deepEqual(feedback.descriptions, source.original.map(section => section.panelDescription));
        assert.deepEqual(feedback.descriptionLanguages, ['cs-CZ', 'cs-CZ', 'cs-CZ']);
        assert.deepEqual(feedback.sourceLanguages, ['en-GB', 'en-GB', 'en-GB']);
        assert.deepEqual(feedback.noteCounts, count >= 3 ? [2, count - 1, 0] : [1, 0, 0]);
        assert.deepEqual(feedback.marks, feedback.noteCounts);
        assert.deepEqual(feedback.labels, ['Pravopisná chyba: ',
            ...Array(count >= 3 ? count : 0).fill('Pravopisná varianta (UK/US): ')]);
        for (const key of ['visible', 'literal', 'highlighted', 'popupOpen', 'focusRestored',
            'descriptionSeparate', 'descriptionLiteral', 'descriptionIntegrated', 'noRepeatedTitles', 'silent']) assert.equal(feedback[key], true, key);
        if (count >= 3) {
            assert.equal(await evaluate(`(() => {
                const variant = document.querySelector('.correction-variant');
                variant.click();
                const title = document.getElementById('definition-title').textContent;
                const neutral = title.includes('Pravopisná varianta (UK/US)') && !title.includes('chyba');
                document.getElementById('definition-close').click();
                return neutral;
            })()`), true);
        }
    }
    for (const width of [320, 1280]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const automatic of [false, true]) {
            for (const theme of ['light', 'dark']) {
                await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
                const colors = await evaluate(`(() => {
                    ${automatic ? 'delete document.documentElement.dataset.theme;' : `document.documentElement.dataset.theme = '${theme}';`}
                    const original = document.querySelector('#original-content .card');
                    const label = document.querySelector('.original-note.callout-note strong');
                    const description = getComputedStyle(original.querySelector('.comic-panel-description'));
                    const explanation = getComputedStyle(document.querySelector('.comic-description-note'));
                    const source = getComputedStyle(original.querySelector('.original-text p'));
                    const luminance = color => {
                        const rgb = color.match(/[\\d.]+/g).slice(0, 3).map(value => {
                            const channel = Number(value) / (color.startsWith('color(srgb') ? 1 : 255);
                            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
                        });
                        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
                    };
                    const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
                    const accent = getComputedStyle(label).color;
                    return {
                        accent,
                        mark: getComputedStyle(document.querySelector('.correction-variant')).color,
                        heading: getComputedStyle(original.querySelector('h2')).color,
                        contrast: contrast(luminance(accent), luminance(getComputedStyle(original).backgroundColor)),
                        noteContrast: contrast(luminance(accent), luminance(getComputedStyle(label.parentElement).backgroundColor)),
                        descriptionContrast: contrast(luminance(description.color), luminance(getComputedStyle(original).backgroundColor)),
                        explanationContrast: contrast(luminance(explanation.color), luminance(getComputedStyle(document.querySelector('main')).backgroundColor)),
                        explanationColor: explanation.color,
                        descriptionColor: description.color,
                        sourceColor: source.color,
                        smallerDescription: parseFloat(description.fontSize) < parseFloat(source.fontSize),
                        descriptionsWithinCards: [...document.querySelectorAll('.comic-panel-description')].every(comment => {
                            const bounds = comment.getBoundingClientRect();
                            const card = comment.closest('#original-content .card').getBoundingClientRect();
                            return bounds.top >= card.top && bounds.bottom <= card.bottom &&
                                bounds.left >= card.left && bounds.right <= card.right;
                        }),
                        descriptionBorder: description.borderLeftWidth,
                        descriptionBackground: description.backgroundColor,
                        overflow: document.documentElement.scrollWidth > innerWidth
                    };
                })()`);
                assert.equal(colors.accent, theme === 'light' ? 'rgb(163, 68, 0)' : 'rgb(255, 182, 117)');
                assert.equal(colors.mark, colors.accent);
                assert.equal(colors.heading, colors.accent);
                assert.ok(colors.contrast >= 4.5, `${width}/${theme}: readable accent`);
                assert.ok(colors.noteContrast >= 4.5, `${width}/${theme}: readable note label`);
                assert.ok(colors.descriptionContrast >= 4.5, `${width}/${theme}: readable description`);
                assert.ok(colors.explanationContrast >= 4.5, `${width}/${theme}: readable explanation near the top`);
                assert.equal(colors.explanationColor, colors.descriptionColor);
                assert.equal(colors.smallerDescription, true);
                assert.equal(colors.descriptionColor, theme === 'light' ? 'rgb(71, 85, 105)' : 'rgb(203, 213, 225)');
                assert.notEqual(colors.descriptionColor, colors.sourceColor);
                assert.equal(colors.descriptionsWithinCards, true);
                assert.equal(colors.descriptionBorder, '0px');
                assert.equal(colors.descriptionBackground, 'rgba(0, 0, 0, 0)');
                assert.equal(colors.overflow, false);
                if (!automatic) await capture(`english-original-${width}-${theme}`);
            }
        }
    }
    assert.deepEqual(exceptions, []);
    assert.deepEqual(network, []);
});

test('English real page covers all exercise formats, listening lifecycle, grading, modes, storage and mobile themes', {
    skip: !browserPath && 'No local Edge/Chrome; set TUTOR_BROWSER_PATH for browser verification',
    timeout: 60000
}, async t => {
    const { directory, client, evaluate, capture, exceptions, network } = await openBrowser(t);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.speechCalls = [];
        window.cancelledSpeech = 0;
        window.pausedSpeech = 0;
        window.resumedSpeech = 0;
        window.testVoicePair = [
            { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true, default: true },
            { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true }
        ];
        window.testVoices = window.testVoicePair;
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: function(text) { this.text = text; } });
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
            getVoices: () => window.testVoices,
            addEventListener: (event, action) => { if (event === 'voiceschanged') window.fireVoicesChanged = action; },
            speak: utterance => { window.speechCalls.push(utterance); utterance.onstart(); },
            pause: () => { window.pausedSpeech++; window.speechSynthesis.paused = true; },
            resume: () => { window.resumedSpeech++; window.speechSynthesis.paused = false; },
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
        const paused = controls.querySelector('button').textContent.includes('Pokračuj') && pausedSpeech === 1;
        controls.querySelector('button').click();
        const pauseResume = paused && speechCalls.length === 1 && resumedSpeech === 1 && cancelledSpeech === 0;
        const oneButton = controls.querySelectorAll('button').length === 1;
        const noAvailableMessages = $('voice-warning').hidden &&
            [...document.querySelectorAll('.listening-controls p')].every(status => status.hidden && !status.textContent);
        $('voice-switch').click();
        controls.querySelector('button').click();
        const voiceSelected = $('voice-switch').getAttribute('aria-checked') === 'true' &&
            speechCalls[1].voice.name.includes('Zira') && cancelledSpeech === 1;
        const language = document.querySelector('#learning-content p[lang]').lang;
        const count = $('learning-counter').textContent;
        await window.switchTutorTab('quiz');
        const cancelledOnTab = cancelledSpeech === 2;
        $('player').value = 'Ab';
        document.querySelector('[data-mode="hard"]').click();
        return { cards: chunks.length, hintsClosed, pauseResume, oneButton, noAvailableMessages, voiceSelected, language, count, cancelledOnTab,
            blocked: !$('setup').hidden && !!$('name-error').textContent, noBonus: !$('bonus') };
    })()`);
    assert.deepEqual(introduction, { cards: 7, hintsClosed: true, pauseResume: true, oneButton: true,
        noAvailableMessages: true, voiceSelected: true, language: 'en-GB', count: '0/7 Prozkoumáno',
        cancelledOnTab: true, blocked: true, noBonus: true });

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
                        missingVoice = !$('voice-warning').hidden && $('voice-warning').textContent.includes('není dostupný') &&
                            $('voice-warning').classList.contains('callout-warning') &&
                            document.querySelectorAll('#voice-warning').length === 1 &&
                            !$('question-material').textContent.includes('není dostupný') &&
                            $('voice-switch').hidden;
                        testVoices = [{lang: 'en-US', localService: true}];
                        fireVoicesChanged();
                        missingVoice &&= $('voice-warning').hidden;
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
                    if (typo) partial ||= $('feedback').textContent.includes('67 % bodů');
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
    await evaluate(`testVoices = testVoicePair; fireVoicesChanged();`);

    for (const width of [320, 1280]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const theme of ['light', 'dark']) {
            const layout = await evaluate(`(async () => {
                document.documentElement.dataset.theme = '${theme}';
                await window.switchTutorTab('learning');
                const card = document.querySelector('[data-learning-card]');
                const toggle = document.querySelector('.listening-toggle');
                const voice = document.getElementById('voice-switch');
                const voiceBounds = voice.getBoundingClientRect();
                const themeBounds = document.getElementById('theme').getBoundingClientRect();
                const titleBounds = document.querySelector('.lesson-identity').getBoundingClientRect();
                const active = voice.querySelector(voice.getAttribute('aria-checked') === 'true' ? '.voice-female' : '.voice-male');
                const inactive = voice.querySelector(voice.getAttribute('aria-checked') === 'true' ? '.voice-male' : '.voice-female');
                return { overflow: document.documentElement.scrollWidth > innerWidth,
                    paper: getComputedStyle(card).backgroundColor,
                    oneButton: [...document.querySelectorAll('.listening-controls')].every(panel => panel.querySelectorAll('button').length === 1),
                    childFriendly: toggle.getBoundingClientRect().height >= 52 && parseFloat(getComputedStyle(toggle).borderRadius) >= 20,
                    switchVisible: voice.checkVisibility() && voice.getAttribute('role') === 'switch' && !!voice.getAttribute('aria-label'),
                    activeFilter: getComputedStyle(active).filter, inactiveFilter: getComputedStyle(inactive).filter,
                    noOverlap: voiceBounds.right <= themeBounds.left &&
                        (voiceBounds.left >= titleBounds.right || voiceBounds.bottom <= titleBounds.top),
                    warningAtTop: document.getElementById('voice-warning').parentElement.tagName === 'MAIN',
                    english: [...document.querySelectorAll('#learning-content p[lang="en-GB"]')].length };
            })()`);
            assert.equal(layout.overflow, false, `${width}/${theme}`);
            assert.notEqual(layout.paper, 'rgba(0, 0, 0, 0)');
            assert.equal(layout.english, 7);
            for (const key of ['oneButton', 'childFriendly', 'switchVisible', 'noOverlap', 'warningAtTop']) assert.equal(layout[key], true, `${width}/${theme}: ${key}`);
            assert.equal(layout.activeFilter, 'none');
            assert.equal(layout.inactiveFilter, 'grayscale(1)');
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
