'use strict';

const assert = require('node:assert/strict');
const { selectExercises } = require('../../maths.js');

function randomFromSeed(seed) {
    let state = seed;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

async function checkProgressiveMaths({ client, evaluate, lesson }) {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.deepEqual(await evaluate(`(async () => {
        await window.switchTutorTab('learning');
        const cards = [...document.querySelectorAll('#exercises > article')];
        const labels = cards.map(card => card.querySelector('.heading-text').textContent.replace(/^\\d+\\. /, ''));
        document.querySelector('#exercises details summary').click();
        window.timerStarts = 0;
        const interval = window.setInterval;
        window.setInterval = (...args) => { window.timerStarts++; return interval(...args); };
        return {
            examples: document.querySelectorAll('#examples > article').length,
            labels, solution: document.querySelector('#exercises details').open,
            modes: [...document.querySelectorAll('[data-mode] .mode-count')].map(node => node.textContent),
            timing: document.querySelectorAll('#bonus, #timer, #countdown').length
        };
    })()`), {
        examples: 4,
        labels: ['easy', 'medium', 'hard'].flatMap(level => lesson.exercises.filter(task => task.difficulty === level)
            .map(() => ({ easy: 'Porozumění: ano/ne', medium: 'Výběr nebo jeden výpočet', hard: 'Navazující výpočty' }[level]))),
        solution: true, modes: ['4 úlohy', '6 úloh', '10 úloh'], timing: 0
    });
    const requirements = {
        easy: tasks => tasks.some(task => task.id === 'soucin-desitek') && tasks.some(task => task.id === 'vyber-citatel') && tasks.some(task => task.steps?.length === 4),
        medium: tasks => tasks.some(task => task.id === 'jednokrokova-rovnice') && tasks.some(task => task.id === 'vyber-prevod') && tasks.some(task => task.steps?.length === 2),
        hard: tasks => tasks.some(task => task.id === 'kraceni-a-hodnota') && tasks.some(task => task.type === 'choice' && task.options.includes('<>'))
    };
    const seeds = {};
    for (const [mode, matches] of Object.entries(requirements)) {
        for (let seed = 1; seed <= 10000; seed++) {
            if (matches(selectExercises(lesson.exercises, mode, randomFromSeed(seed)))) {
                seeds[mode] = seed;
                break;
            }
        }
        assert.ok(seeds[mode], `No deterministic coverage seed for ${mode}`);
    }
    const runs = [['easy', 'full'], ['medium', 'full'], ['hard', 'full'], ['hard', 'partial'], ['medium', 'blank'], ['easy', 'invalid']];
    for (const [mode, kind] of runs) {
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode === 'medium' ? 'light' : 'dark' }] });
        const expectedTasks = selectExercises(lesson.exercises, mode, randomFromSeed(seeds[mode]));
        const result = await evaluate(`(async () => {
            const $ = id => document.getElementById(id);
            const lesson = JSON.parse($('lesson-data').textContent);
            window.answerClock = 0;
            Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
            await window.switchTutorTab('quiz');
            $('player').value = 'Kontrola';
            const previousRandom = Math.random;
            Math.random = (${randomFromSeed.toString()})(${seeds[mode]});
            document.querySelector('[data-mode="${mode}"]').click();
            Math.random = previousRandom;
            const ids = [];
            const kind = ${JSON.stringify(kind)};
            let total = 0;
            for (let index = 0; index < ${expectedTasks.length}; index++) {
                const task = lesson.exercises.find(task => task.prompt === $('question').textContent);
                ids.push(task.id);
                if ($('difficulty').dataset.level !== task.difficulty) throw new Error('Wrong difficulty label');
                if ($('difficulty').textContent !== { easy: 'Porozumění: ano/ne', medium: 'Výběr nebo jeden výpočet', hard: 'Navazující výpočty' }[task.difficulty]) throw new Error('Wrong progressive difficulty wording');
                const inputs = [...$('answers').querySelectorAll('input')];
                const buttons = [...$('answers').querySelectorAll('button')];
                let earned = { easy: 10, medium: 20, hard: 30 }[task.difficulty];
                const before = $('question').textContent;
                $('next').click();
                if ($('question').textContent !== before) throw new Error('Advanced before answering');
                window.answerClock += 2000;
                if (task.options) {
                    if (inputs.length || JSON.stringify(buttons.map(button => button.textContent)) !== JSON.stringify(task.options)) throw new Error('Choice labels not rendered literally');
                    const wrong = kind === 'blank' || kind === 'invalid';
                    const selected = wrong ? (task.answer + 1) % task.options.length : task.answer;
                    if (wrong) earned = 0;
                    buttons[selected].click();
                    if (!$('feedback').textContent.includes('Tvoje odpověď: ' + task.options[selected])) throw new Error('Feedback lost selected label');
                    if (!$('feedback').textContent.includes('Správná odpověď: ' + task.options[task.answer] + '. ' + task.solution)) throw new Error('Missing choice explanation');
                    if (!buttons.every(button => button.disabled)) throw new Error('Choice not locked');
                    const score = $('score').textContent;
                    buttons[selected].click();
                    if ($('score').textContent !== score) throw new Error('Duplicate choice scored twice');
                } else {
                    if (inputs.length !== task.steps.length) throw new Error('Wrong number of numerical fields');
                    task.steps.forEach((step, stepIndex) => {
                        inputs[stepIndex].value = kind === 'blank' ? '' : kind === 'invalid' ? 'x = 180' :
                            kind === 'partial' && step.assessment.partial ? '3/6' :
                            step.assessment.exact.type === 'string' ? step.assessment.exact.value : formatAnswer(step.answer);
                        if (kind === 'partial' && step.assessment.partial) earned -= 15 / task.steps.length;
                    });
                    if (kind === 'blank' || kind === 'invalid') earned = 0;
                    $('answers').requestSubmit();
                    if (!inputs.every(input => input.disabled)) throw new Error('Numerical fields not locked');
                    task.steps.forEach(step => {
                        if (!$('feedback').textContent.includes('Správná odpověď: ' + formatAnswer(step.answer) + '. ' + step.solution)) throw new Error('Missing worked numerical answer');
                    });
                    if (kind === 'blank' && !$('feedback').textContent.includes('Odpověď chybí')) throw new Error('Blank answer not explained');
                    if (kind === 'invalid' && !$('feedback').textContent.includes('Napiš celé nebo desetinné')) throw new Error('Invalid expression not explained');
                    if (kind === 'partial' && task.steps.some(step => step.assessment.partial) && !$('feedback').textContent.includes('Částečně správně')) throw new Error('No partial-credit feedback');
                }
                total += earned;
                if ($('score').textContent !== 'Skóre: ' + String(total).replace('.', ',') + ' b') throw new Error('Incorrect running points');
                if ($('quiz-progress').value !== index + 1) throw new Error('Wrong progress');
                if (!$('feedback').textContent.includes(task.explanation) || !$('feedback').textContent.includes('Body: ' + String(earned).replace('.', ','))) throw new Error('Wrong task feedback');
                const feedback = $('feedback').textContent;
                $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                if ($('feedback').textContent !== feedback) throw new Error('Resubmission changed feedback');
                if (document.documentElement.scrollWidth > innerWidth) throw new Error('Feedback overflows at phone width');
                window.answerClock += 30000;
                $('next').click();
            }
            const records = JSON.parse(sessionStorage.getItem('maths-tutor:v4:' + lesson.id));
            const record = records.at(-1);
            if (record.answerDurationMs !== ${expectedTasks.length} * 2000) throw new Error('Feedback time affected duration');
            if ($('results').hidden || !$('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('No completion/ranking');
            const value = { ids, total, maximum: record.maximum, grade: record.grade, saved: record.total, summary: $('summary').children.length };
            $('restart').click();
            return value;
        })()`);
        const maximum = { easy: 80, medium: 120, hard: 200 }[mode];
        const expected = kind === 'full' ? maximum : kind === 'partial' ? 192.5 : 0;
        assert.deepEqual(result, {
            ids: expectedTasks.map(task => task.id), total: expected, maximum,
            grade: expected === 0 ? 5 : 1, saved: expected, summary: expectedTasks.length
        });
    }
    assert.equal(await evaluate('window.timerStarts'), 0);
    return runs.length;
}

module.exports = { checkProgressiveMaths };
