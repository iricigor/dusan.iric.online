'use strict';

const MODES = { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] };
const MODE_NAMES = { easy: 'Lehká', medium: 'Střední', hard: 'Těžká' };
const POINTS = { easy: 10, medium: 20, hard: 30 };
const UNITS = { mm: 1n, cm: 10n, dm: 100n, m: 1000n, km: 1000000n };
const WHOLE = '-?(?:0|[1-9][0-9]{0,11})';
const DECIMAL = `${WHOLE}(?:[.,][0-9]{1,12})?`;

function rational(text) {
    const [whole, part = ''] = text.replace(',', '.').split('.');
    return { numerator: BigInt(whole + part), denominator: 10n ** BigInt(part.length) };
}

function checkAnswer(expected, raw) {
    const text = raw.trim();
    const invalid = message => ({ correct: false, valid: false, message });
    if (!text) return invalid('Odpověď chybí.');
    if (text.length > 80) return invalid('Odpověď je příliš dlouhá.');
    let actual;
    let target;
    switch (expected.format) {
        case 'integer':
            if (!new RegExp(`^${WHOLE}$`).test(text)) return invalid('Napiš celé číslo bez jednotky, například -12.');
            actual = rational(text);
            target = rational(expected.value);
            break;
        case 'fraction': {
            const match = text.match(new RegExp(`^(${WHOLE})\\s*/\\s*(${WHOLE})$`));
            if (!match) return invalid('Napiš zlomek, například 1/2. Jmenovatel nesmí být nula.');
            actual = { numerator: BigInt(match[1]), denominator: BigInt(match[2]) };
            if (actual.denominator === 0n) return invalid('Jmenovatel nesmí být nula.');
            target = { numerator: BigInt(expected.numerator), denominator: BigInt(expected.denominator) };
            break;
        }
        case 'decimal':
            if (!new RegExp(`^${DECIMAL}$`).test(text)) return invalid('Napiš číslo s jednou desetinnou čárkou nebo tečkou, bez jednotky.');
            actual = rational(text);
            target = rational(expected.value);
            break;
        case 'length': {
            if (new RegExp(`^${DECIMAL}$`).test(text)) return invalid('Doplň jednotku délky: mm, cm, dm, m nebo km.');
            const match = text.match(new RegExp(`^(${DECIMAL})\\s*(mm|cm|dm|m|km)$`));
            if (!match || match[1].startsWith('-')) return invalid('Napiš nezápornou délku s jednotkou mm, cm, dm, m nebo km, například 1,5 m.');
            actual = rational(match[1]);
            actual.numerator *= UNITS[match[2]];
            target = rational(expected.value);
            target.numerator *= UNITS[expected.unit];
            break;
        }
        default:
            throw new Error(`Unsupported maths answer format: ${expected.format}`);
    }
    const correct = actual.numerator * target.denominator === target.numerator * actual.denominator;
    return { correct, valid: true, message: correct ? 'Správně.' : 'Tentokrát to nevyšlo. Porovnej svůj postup s řešením.' };
}

function selectExercises(exercises, mode, random = Math.random) {
    if (!Object.hasOwn(MODES, mode)) throw new Error(`Unknown maths quiz mode: ${mode}`);
    if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) throw new Error('Duplicate maths task ids');
    const shuffle = items => {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1));
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    };
    const selected = [];
    ['easy', 'medium', 'hard'].forEach((level, index) => {
        const pool = exercises.filter(exercise => exercise.difficulty === level);
        if (pool.length < MODES[mode][index]) throw new Error(`Not enough ${level} maths tasks`);
        selected.push(...shuffle(pool).slice(0, MODES[mode][index]));
    });
    return shuffle(selected);
}

function maximumPoints(exercises) {
    return exercises.reduce((sum, exercise) => sum + POINTS[exercise.difficulty] + (exercise.difficulty === 'easy' ? 1 : 0), 0);
}

function scoreExercise(exercise, answers) {
    const steps = exercise.steps.map((step, index) => checkAnswer(step.answer, answers[index] || ''));
    const base = steps.filter(step => step.correct).length * POINTS[exercise.difficulty] / steps.length;
    const accuracy = exercise.difficulty === 'easy' && steps.every(step => step.correct) ? 1 : 0;
    return { steps, base, accuracy, total: base + accuracy };
}

function grade(total, maximum) {
    return total >= maximum * 80 / 100 ? 1 : total >= maximum * 60 / 100 ? 2 :
        total >= maximum * 40 / 100 ? 3 : total >= maximum * 20 / 100 ? 4 : 5;
}

function validRecords(records) {
    return Array.isArray(records) && records.every(row => row && Object.hasOwn(MODES, row.mode) &&
        row.maximum === MODES[row.mode].reduce((sum, count, index) => sum + count * [11, 20, 30][index], 0) &&
        Number.isFinite(row.total) && row.total >= 0 && row.total <= row.maximum &&
        Number.isInteger(row.total * 2) && row.grade === grade(row.total, row.maximum));
}

function initializeMaths(lesson) {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const disclose = (label, ...content) => {
        const details = node('details');
        details.append(node('summary', label), ...content);
        return details;
    };
    const forms = new Map();
    lesson.glossary.forEach(entry => [entry.term, ...entry.forms].forEach(form => forms.set(form.toLocaleLowerCase('cs'), entry)));
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...forms.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const termButton = (text, entry) => {
        const button = node('button', text, 'term');
        button.type = 'button';
        button.addEventListener('click', () => {
            $('definition-title').textContent = entry.term;
            $('definition-text').textContent = entry.definition;
            $('definition').showModal();
        });
        return button;
    };
    const paragraph = text => {
        const element = node('p');
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            element.append(document.createTextNode(text.slice(offset, match.index)));
            element.append(termButton(match[0], forms.get(match[0].toLocaleLowerCase('cs'))));
            offset = match.index + match[0].length;
        }
        element.append(document.createTextNode(text.slice(offset)));
        return element;
    };
    $('topic').textContent = lesson.topic;
    $('audience').textContent = lesson.audience;
    lesson.examples.forEach(example => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', example.heading), paragraph(example.prompt), disclose('Nápověda', paragraph(example.hint)));
        const steps = node('ol');
        example.steps.forEach(step => {
            const item = node('li');
            item.append(disclose('Odkrýt krok', paragraph(step.calculation), paragraph(step.explanation)));
            steps.append(item);
        });
        article.append(steps, disclose('Výsledek', paragraph(example.answer)));
        $('examples').append(article);
    });
    lesson.glossary.forEach(entry => $('glossary').append(termButton(entry.term, entry)));
    const levels = { easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' };
    lesson.exercises.forEach((exercise, index) => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', `${index + 1}. ${levels[exercise.difficulty]}`), paragraph(exercise.prompt));
        exercise.steps.forEach((step, stepIndex) => {
            const label = exercise.difficulty === 'easy' ? `${index + 1}${'abcd'[stepIndex]}` : `${index + 1}.${stepIndex + 1}`;
            article.append(node('h3', `${label}: ${step.prompt}`), disclose('Nápověda', paragraph(step.hint)),
                disclose('Řešení', paragraph(`Správná odpověď: ${formatAnswer(step.answer)}`), paragraph(step.solution)));
        });
        article.append(disclose('Vysvětlení celé úlohy', paragraph(exercise.explanation)));
        $('exercises').append(article);
    });
    document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(other => {
            const active = other === tab;
            other.setAttribute('aria-pressed', String(active));
            $(other.dataset.tab).hidden = !active;
        });
    }));
    $('theme').addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme === 'dark' ||
            (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    });
    const storageKey = `maths-tutor:v1:${lesson.id}`;
    let records = [];
    let storageReadable = true;
    let quiz = null;
    const warnStorage = message => {
        $('storage-warning').hidden = false;
        $('storage-warning').textContent = message;
    };
    try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
        if (!validRecords(stored)) throw new Error('Invalid maths session results');
        records = stored;
    } catch (error) {
        storageReadable = false;
        console.warn('Maths tutor: cannot read session results.', error);
        warnStorage('Uložené výsledky nelze načíst. Nové výsledky zůstanou jen v této stránce; původní úložiště nepřepíšeme.');
    }
    const points = value => String(value).replace('.', ',');
    function renderRecords() {
        $('session-results').replaceChildren();
        if (!records.length) $('session-results').append(node('li', 'Zatím žádné výsledky.'));
        records.forEach(record => $('session-results').append(node('li',
            `${MODE_NAMES[record.mode]}: ${points(record.total)}/${record.maximum} b. Známka: ${record.grade}`)));
    }
    function appendFeedback(container, exercise, answers, score, number) {
        exercise.steps.forEach((step, index) => {
            const label = exercise.difficulty === 'easy' ? `${number}${'abcd'[index]}` : `${number}.${index + 1}`;
            const result = score.steps[index];
            container.append(node('h3', `${label}: ${step.prompt}`),
                node('p', `${result.message} Tvoje odpověď: ${answers[index] || '(bez odpovědi)'}`, result.correct ? 'correct' : 'incorrect'),
                node('p', `Body za výpočet: ${points(result.correct ? POINTS[exercise.difficulty] / exercise.steps.length : 0)}.`),
                node('p', `Správná odpověď: ${formatAnswer(step.answer)}. ${step.solution}`));
        });
        container.append(node('p', exercise.explanation),
            node('p', `Body: ${points(score.total)}${score.accuracy ? ' (včetně 1 bodu za všechny čtyři správné odpovědi)' : ''}.`));
    }
    function showExercise() {
        const exercise = quiz.exercises[quiz.index];
        quiz.locked = false;
        $('progress').textContent = `Úloha ${quiz.index + 1} / ${quiz.exercises.length} · nejvýše ${maximumPoints([exercise])} b`;
        $('question').textContent = exercise.prompt;
        $('answers').replaceChildren();
        $('feedback').hidden = true;
        $('next').hidden = true;
        exercise.steps.forEach((step, index) => {
            const label = node('label', `${quiz.index + 1}${exercise.difficulty === 'easy' ? 'abcd'[index] : `.${index + 1}`}: ${step.prompt}`);
            label.htmlFor = `answer-${index}`;
            const input = node('input');
            input.type = 'text';
            input.id = label.htmlFor;
            input.autocomplete = 'off';
            input.maxLength = 80;
            input.spellcheck = false;
            input.setAttribute('aria-describedby', 'answer-help');
            $('answers').append(label, input);
        });
        const submit = node('button', 'Odpovědět');
        submit.type = 'submit';
        $('answers').append(submit);
        $('question').focus();
    }
    function finish() {
        quiz.finished = true;
        $('game').hidden = true;
        $('results').hidden = false;
        const total = quiz.answers.reduce((sum, answer) => sum + answer.score.total, 0);
        const maximum = maximumPoints(quiz.exercises);
        const mark = grade(total, maximum);
        $('grade').textContent = `Body: ${points(total)}/${maximum} (${points(Math.round(total / maximum * 10000) / 100)} %). Známka: ${mark}`;
        $('summary').replaceChildren();
        quiz.answers.forEach((answer, index) => {
            const item = node('li');
            item.append(node('strong', answer.exercise.prompt));
            appendFeedback(item, answer.exercise, answer.values, answer.score, index + 1);
            $('summary').append(item);
        });
        records.push({ mode: quiz.mode, total, maximum, grade: mark });
        if (storageReadable) {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(records));
                $('storage-warning').hidden = true;
                $('storage-warning').textContent = '';
            } catch (error) {
                console.warn('Maths tutor: cannot save session results.', error);
                warnStorage('Výsledky se nepodařilo uložit. Nové výsledky jsou vidět jen do obnovení této stránky.');
            }
        }
        renderRecords();
        $('results-title').focus();
    }
    $('answers').addEventListener('submit', event => {
        event.preventDefault();
        if (!quiz || quiz.locked || quiz.finished) return;
        quiz.locked = true;
        const exercise = quiz.exercises[quiz.index];
        const values = [...$('answers').querySelectorAll('input')].map(input => input.value.trim());
        const score = scoreExercise(exercise, values);
        quiz.answers.push({ exercise, values, score });
        $('answers').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
        $('feedback').replaceChildren();
        appendFeedback($('feedback'), exercise, values, score, quiz.index + 1);
        $('feedback').hidden = false;
        $('next').textContent = quiz.index === quiz.exercises.length - 1 ? 'Zobrazit výsledek' : 'Další úloha';
        $('next').hidden = false;
        $('next').focus();
    });
    document.querySelectorAll('[data-mode]').forEach(control => control.addEventListener('click', () => {
        quiz = { mode: control.dataset.mode, exercises: selectExercises(lesson.exercises, control.dataset.mode),
            index: 0, answers: [], locked: false, finished: false };
        $('setup').hidden = true;
        $('results').hidden = true;
        $('game').hidden = false;
        showExercise();
    }));
    $('next').addEventListener('click', () => {
        if (!quiz || !quiz.locked || quiz.finished) return;
        quiz.index++;
        if (quiz.index === quiz.exercises.length) finish();
        else showExercise();
    });
    $('restart').addEventListener('click', () => {
        $('results').hidden = true;
        $('setup').hidden = false;
        document.querySelector('[data-mode]').focus();
    });
    renderRecords();
}

function formatAnswer(answer) {
    if (answer.format === 'fraction') return `${answer.numerator}/${answer.denominator}`;
    const value = answer.value.replace('.', ',');
    return answer.format === 'length' ? `${value} ${answer.unit}` : value;
}

if (typeof document !== 'undefined') initializeMaths(JSON.parse(document.getElementById('lesson-data').textContent));
if (typeof module !== 'undefined') module.exports = {
    formatAnswer, checkAnswer, selectExercises, scoreExercise, maximumPoints, grade, validRecords
};
