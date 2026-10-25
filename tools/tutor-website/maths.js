'use strict';

const MODES = { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] };
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

function formatAnswer(answer) {
    if (answer.format === 'fraction') return `${answer.numerator}/${answer.denominator}`;
    const value = answer.value.replace('.', ',');
    return answer.format === 'length' ? `${value} ${answer.unit}` : value;
}

const mathsSubject = {
    storagePrefix: 'maths-tutor:v2',
    speedBonus: false,
    rules: 'Lehká skupina: 4 × 2,5 bodu + 1 bod za vše správně. Střední úloha: 20 bodů. Těžká úloha: 3 × 10 bodů. Každý krok má vlastní body. Známka: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5. Počítají se i body za všechny správné lehké výpočty. Nemusíš spěchat.',
    answerHelp: 'Celé číslo piš bez jednotky. Zlomek piš jako 1/2. Desetinné číslo může mít čárku nebo tečku. Délka musí mít jednotku mm, cm, dm, m nebo km (například 1,5 m). Prázdná odpověď získá 0 bodů. Po odeslání už odpovědi nezměníš.',
    select: (lesson, mode) => selectExercises(lesson.exercises, mode),
    maximum: maximumPoints,
    score: scoreExercise,
    acceptSubmission: () => true,
    fields: (exercise, index) => exercise.steps.map((step, stepIndex) => ({
        id: `answer-${stepIndex}`,
        label: `${index + 1}${exercise.difficulty === 'easy' ? 'abcd'[stepIndex] : `.${stepIndex + 1}`}: ${step.prompt}`
    })),
    compareResults: (a, b) => b.total - a.total,
    validRecord: row => validRecords([row]),
    renderLearning({ $, node, paragraph, disclose }, lesson) {
        const examples = node('div');
        examples.id = 'examples';
        lesson.examples.forEach((example, index) => {
            const article = node('article', undefined, 'card');
            const hint = disclose('Nápověda', paragraph(example.hint));
            hint.open = index === 0;
            article.append(node('h2', example.heading), paragraph(example.prompt), hint);
            const steps = node('ol');
            example.steps.forEach((step, stepIndex) => {
                const item = node('li');
                const detail = disclose('Odkrýt krok', paragraph(step.calculation), paragraph(step.explanation));
                detail.open = index === 0 || (index === 1 && stepIndex === 0);
                item.append(detail);
                steps.append(item);
            });
            const answer = disclose('Výsledek', paragraph(example.answer));
            answer.open = index === 0;
            article.append(steps, answer);
            examples.append(article);
        });
        const intro = node('article', undefined, 'card');
        intro.append(node('h2', 'Teď to zkus samostatně'),
            node('p', 'Začni lehkými příklady a postupuj k těžším. Nejprve počítej bez pomoci. Nápovědu nebo řešení si otevři, až je potřebuješ.'));
        const exercises = node('div');
        exercises.id = 'exercises';
        const levels = { easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' };
        const ordered = ['easy', 'medium', 'hard'].flatMap(level => lesson.exercises.filter(exercise => exercise.difficulty === level));
        ordered.forEach((exercise, index) => {
            const article = node('article', undefined, 'card');
            article.append(node('h2', `${index + 1}. ${levels[exercise.difficulty]}`), paragraph(exercise.prompt));
            exercise.steps.forEach((step, stepIndex) => {
                const label = exercise.difficulty === 'easy' ? `${index + 1}${'abcd'[stepIndex]}` : `${index + 1}.${stepIndex + 1}`;
                article.append(node('h3', `${label}: ${step.prompt}`), disclose('Nápověda', paragraph(step.hint)),
                    disclose('Řešení', paragraph(`Správná odpověď: ${formatAnswer(step.answer)}`), paragraph(step.solution)));
            });
            article.append(disclose('Vysvětlení celé úlohy', paragraph(exercise.explanation)));
            exercises.append(article);
        });
        $('learning-content').append(examples, intro, exercises);
    },
    feedback({ node }, container, { question: exercise, values, score }, number) {
        const points = value => String(value).replace('.', ',');
        exercise.steps.forEach((step, index) => {
            const label = exercise.difficulty === 'easy' ? `${number}${'abcd'[index]}` : `${number}.${index + 1}`;
            const result = score.steps[index];
            container.append(node('h3', `${label}: ${step.prompt}`),
                node('p', `${result.message} Tvoje odpověď: ${values[index] || '(bez odpovědi)'}`, result.correct ? 'correct' : 'incorrect'),
                node('p', `Body za výpočet: ${points(result.correct ? POINTS[exercise.difficulty] / exercise.steps.length : 0)}.`),
                node('p', `Správná odpověď: ${formatAnswer(step.answer)}. ${step.solution}`));
        });
        container.append(node('p', exercise.explanation),
            node('p', `Body: ${points(score.total)}${score.accuracy ? ' (včetně 1 bodu za všechny čtyři správné odpovědi)' : ''}.`));
    },
    result(answers, questions) {
        const total = answers.reduce((sum, answer) => sum + answer.score.total, 0);
        const maximum = maximumPoints(questions);
        const mark = grade(total, maximum);
        const points = value => String(value).replace('.', ',');
        return { total, maximum, grade: mark,
            text: `Body: ${points(total)}/${maximum} (${points(Math.round(total / maximum * 10000) / 100)} %). Známka: ${mark}` };
    }
};

if (typeof document !== 'undefined') initializeTutor(JSON.parse(document.getElementById('lesson-data').textContent), mathsSubject);
if (typeof module !== 'undefined') module.exports = {
    formatAnswer, checkAnswer, selectExercises, scoreExercise, maximumPoints, grade, validRecords
};
