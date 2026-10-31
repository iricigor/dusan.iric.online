'use strict';

const assert = require('node:assert/strict');
const defaultMaths = require('../../examples/zlomky-a-prevody-delky.json');
const { checkProgressiveMaths } = require('./progressive-maths.js');

async function checkMathsQuiz({ client, evaluate, lesson }) {
    if (lesson.version === 4) return checkProgressiveMaths({ client, evaluate, lesson });
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
}

module.exports = { checkMathsQuiz };
