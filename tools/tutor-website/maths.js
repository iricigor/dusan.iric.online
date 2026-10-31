'use strict';

const { MODES, POINTS, shuffle, grade } = typeof module !== 'undefined' && module.exports
    ? require('./runtime.js') : tutorQuiz;
const { evaluate, legacyMathsPolicy } = typeof module !== 'undefined' && module.exports
    ? require('./assessment.js') : tutorAssessment;

function checkAnswer(expected, raw, assessment) {
    return evaluate(assessment || legacyMathsPolicy(expected), raw);
}

const PROGRESSIVE_MODES = { easy: [1, 2, 1], medium: [2, 2, 2], hard: [3, 4, 3] };
const PROGRESSIVE_MINIMUM = Object.fromEntries(['easy', 'medium', 'hard'].map((level, index) =>
    [level, Math.max(...Object.values(PROGRESSIVE_MODES).map(mix => mix[index]))]));
const PROGRESSIVE_MEDIUM_MINIMUM = { choice: PROGRESSIVE_MINIMUM.medium / 2, number: PROGRESSIVE_MINIMUM.medium / 2 };

const isProgressive = exercise => Object.hasOwn(exercise, 'type');

function selectExercises(exercises, mode, random = Math.random) {
    const progressive = exercises.some(isProgressive);
    if (progressive && !exercises.every(isProgressive)) throw new Error('Cannot mix legacy and progressive maths tasks');
    const modes = progressive ? PROGRESSIVE_MODES : MODES;
    if (!Object.hasOwn(modes, mode)) throw new Error(`Unknown maths quiz mode: ${mode}`);
    if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) throw new Error('Duplicate maths task ids');
    const selected = [];
    ['easy', 'medium', 'hard'].forEach((level, index) => {
        const pool = exercises.filter(exercise => exercise.difficulty === level);
        const count = modes[mode][index];
        if (pool.length < count) throw new Error(`Not enough ${level} maths tasks`);
        if (progressive && level === 'medium') {
            const medium = ['choice', 'number'].flatMap(type => {
                const typed = pool.filter(exercise => exercise.type === type);
                if (typed.length < count / 2) throw new Error(`Not enough medium ${type} maths tasks`);
                return shuffle(typed, random).slice(0, count / 2);
            });
            selected.push(...shuffle(medium, random));
        } else selected.push(...shuffle(pool, random).slice(0, count));
    });
    return selected;
}

function maximumPoints(exercises) {
    return exercises.reduce((sum, exercise) => sum + POINTS[exercise.difficulty] + (!isProgressive(exercise) && exercise.difficulty === 'easy' ? 1 : 0), 0);
}

function scoreExercise(exercise, answers) {
    if (exercise.options) {
        const index = answers[0];
        const result = Number.isInteger(index) && index >= 0 && index < exercise.options.length
            ? evaluate(exercise.assessment, String(index))
            : { fraction: 0, correct: false, valid: false, message: 'Vyber jednu z nabízených odpovědí.' };
        const base = result.fraction * POINTS[exercise.difficulty];
        return { steps: [result], base, accuracy: 0, total: base };
    }
    const steps = exercise.steps.map((step, index) => checkAnswer(step.answer, answers[index] || '', step.assessment));
    const base = steps.reduce((sum, step) => sum + step.fraction, 0) * POINTS[exercise.difficulty] / steps.length;
    const accuracy = !isProgressive(exercise) && exercise.difficulty === 'easy' && steps.every(step => step.correct) ? 1 : 0;
    return { steps, base, accuracy, total: base + accuracy };
}

function validRecords(records, version = 3) {
    const modes = version === 4 ? PROGRESSIVE_MODES : MODES;
    return Array.isArray(records) && records.every(row => row && Object.hasOwn(modes, row.mode) &&
        row.maximum === modes[row.mode].reduce((sum, count, index) => sum + count * [version === 4 ? 10 : 11, 20, 30][index], 0) &&
        Number.isFinite(row.total) && row.total >= 0 && row.total <= row.maximum &&
        Number.isInteger(row.total * 4) && row.grade === grade(row.total, row.maximum));
}

function formatAnswer(answer) {
    if (answer.format === 'fraction') return `${answer.numerator}/${answer.denominator}`;
    const value = answer.value.replace('.', ',');
    return answer.format === 'length' ? `${value} ${answer.unit}` : value;
}

const mathsSubject = {
    storagePrefix: 'maths-tutor:v2',
    speedBonus: false,
    rules: [
        'Lehká skupina: 4 × 2,5 bodu + 1 bod za vše zcela správně. Střední úloha: 20 bodů. Těžká úloha: 3 × 10 bodů.',
        'Každý krok má vlastní body. Pokud úloha uznává částečnou odpověď, získáš polovinu bodů za krok.',
        'Známka: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5. Počítají se i body za všechny správné lehké výpočty.',
        'Nemusíš spěchat. Dobu odpovídání ukážeme až ve výsledku. Čtení vysvětlení ani pobyt mimo kvíz se nepočítají. Doba nemění body, známku ani pořadí pokusů.'
    ],
    answerHelp: 'Řiď se zadáním. V číselném poli napiš jen číslo v jednotce určené otázkou. Jednotku připiš jen v poli označeném „včetně jednotky“: mm, cm, dm, m nebo km (například 1,5 m). Stejnou hodnotu lze zapsat různě: 7/4 = 1 3/4 = 1,75 a 0.5 = 1/2. Pokud úloha žádá určitý zápis, jiný zápis může získat jen část bodů nebo žádné. Prázdná odpověď získá 0 bodů. Po odeslání už odpovědi nezměníš.',
    select: (lesson, mode) => selectExercises(lesson.exercises, mode),
    maximum: maximumPoints,
    score: scoreExercise,
    acceptSubmission: () => true,
    fields: (exercise, index) => exercise.steps.map((step, stepIndex) => ({
        id: `answer-${stepIndex}`,
        label: `${index + 1}${exercise.difficulty === 'easy' ? 'abcd'[stepIndex] : `.${stepIndex + 1}`}: ${step.prompt}${step.answer.format === 'length' ? ' (včetně jednotky)' : ''}`
    })),
    compareResults: (a, b) => b.total - a.total,
    validRecord: row => validRecords([row]),
    renderLearning({ $, node, paragraph, paragraphs, disclose, hint, heading }, lesson) {
        const examples = node('div');
        examples.id = 'examples';
        lesson.examples.forEach((example, index) => {
            const key = `examples.${index}`;
            const article = node('article', undefined, 'card');
            article.id = `learning-example-${index}`;
            article.dataset.learningCard = 'true';
            article.append(heading(example.heading, example.icon, '📐'),
                hint(example.prompt, example.hint, 'p', { prompt: `${key}.prompt`, explanation: `${key}.hint` }),
                ...paragraphs(example.paragraphs, `${key}.paragraphs`));
            const steps = node('ol');
            example.steps.forEach((step, stepIndex) => {
                const item = node('li');
                const detail = disclose('Odkrýt krok', paragraph(step.calculation, 'p', { target: `${key}.steps.${stepIndex}.calculation` }),
                    paragraph(step.explanation, 'p', { target: `${key}.steps.${stepIndex}.explanation` }));
                item.append(detail);
                steps.append(item);
            });
            const answer = disclose('Výsledek', paragraph(example.answer, 'p', { target: `${key}.answer` }));
            article.append(steps, answer);
            examples.append(article);
        });
        const intro = node('article', undefined, 'card');
        intro.append(heading('Teď to zkus samostatně', undefined, '✏️'),
            node('p', 'Začni lehkými příklady a postupuj k těžším. Nejprve počítej bez pomoci. Nápovědu nebo řešení si otevři, až je potřebuješ.'));
        const exercises = node('div');
        exercises.id = 'exercises';
        const levels = lesson.version === 4
            ? { easy: 'Porozumění: ano/ne', medium: 'Výběr nebo jeden výpočet', hard: 'Navazující výpočty' }
            : { easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' };
        const ordered = ['easy', 'medium', 'hard'].flatMap(level => lesson.exercises.filter(exercise => exercise.difficulty === level));
        ordered.forEach((exercise, index) => {
            const key = `exercises.${lesson.exercises.indexOf(exercise)}`;
            const article = node('article', undefined, 'card');
            article.id = `learning-exercise-${exercise.id}`;
            article.dataset.learningCard = 'true';
            article.append(heading(`${index + 1}. ${levels[exercise.difficulty]}`, exercise.icon, '✏️'),
                paragraph(exercise.prompt, 'p', { target: `${key}.prompt` }));
            if (exercise.options) {
                article.append(paragraph(`Možnosti: ${exercise.options.join(' · ')}`),
                    hint('Nápověda', exercise.hint, 'h3', { explanation: `${key}.hint` }),
                    disclose('Řešení', paragraph(`Správná odpověď: ${exercise.options[exercise.answer]}`),
                        paragraph(exercise.solution, 'p', { target: `${key}.solution` })));
            }
            (exercise.steps || []).forEach((step, stepIndex) => {
                const label = exercise.difficulty === 'easy' ? `${index + 1}${'abcd'[stepIndex]}` : `${index + 1}.${stepIndex + 1}`;
                article.append(hint(`${label}: ${step.prompt}`, step.hint, 'h3', {
                    prompt: `${key}.steps.${stepIndex}.prompt`, explanation: `${key}.steps.${stepIndex}.hint`, prefix: label.length + 2
                }), disclose('Řešení', paragraph(`Správná odpověď: ${formatAnswer(step.answer)}`),
                    paragraph(step.solution, 'p', { target: `${key}.steps.${stepIndex}.solution` })));
            });
            article.append(disclose('Vysvětlení celé úlohy', paragraph(exercise.explanation, 'p', { target: `${key}.explanation` })));
            exercises.append(article);
        });
        $('learning-content').append(examples, intro, exercises);
    },
    feedback({ node }, container, { question: exercise, values, score }, number) {
        const points = value => String(value).replace('.', ',');
        if (exercise.options) {
            const result = score.steps[0];
            container.append(node('p', `${result.message} Tvoje odpověď: ${exercise.options[values[0]] ?? '(bez odpovědi)'}`,
                result.correct ? 'correct' : 'incorrect'),
                node('p', `Správná odpověď: ${exercise.options[exercise.answer]}. ${exercise.solution}`));
        }
        (exercise.steps || []).forEach((step, index) => {
            const label = exercise.difficulty === 'easy' ? `${number}${'abcd'[index]}` : `${number}.${index + 1}`;
            const result = score.steps[index];
            container.append(node('h3', `${label}: ${step.prompt}`),
                node('p', `${result.message} Tvoje odpověď: ${values[index] || '(bez odpovědi)'}`, result.fraction > 0 ? 'correct' : 'incorrect'),
                node('p', `Body za výpočet: ${points(result.fraction * POINTS[exercise.difficulty] / exercise.steps.length)}.`),
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

function subjectForLesson(lesson) {
    if (lesson.version !== 4) return mathsSubject;
    return {
        ...mathsSubject,
        storagePrefix: 'maths-tutor:v4',
        difficultyLabels: { easy: 'Porozumění: ano/ne', medium: 'Výběr nebo jeden výpočet', hard: 'Navazující výpočty' },
        answerHelp: 'U otázek s možnostmi vyber jednu odpověď. Do číselných polí napiš jen číslo, bez jednotky nebo výrazu jako x = 180. Uznáváme přesně rovnocenná čísla: 7/4 = 1 3/4 = 1,75 a 0.5 = 1/2, pokud zadání nevyžaduje určitý zápis. Prázdná nebo neplatná odpověď získá 0 bodů. Po odeslání už odpovědi nezměníš.',
        modeCounts: Object.fromEntries(Object.entries(PROGRESSIVE_MODES).map(([mode, mix]) => [mode, mix.reduce((sum, count) => sum + count, 0)])),
        validRecord: row => validRecords([row], 4),
        rules: [
            'Lehká otázka ano/ne: 10 bodů. Střední výběr nebo jeden výpočet: 20 bodů. Těžká úloha: 30 bodů rozdělených rovnoměrně mezi její 2 až 4 odpovědi.',
            'V každém kvízu je výběr odpovědi i jeden samostatný výpočet. Obtížnosti jdou od lehké k těžké. Za správnost není další bonus.',
            'Každá číselná odpověď má vlastní body. Pokud zadání nabízí částečné uznání, získáš polovinu bodů za daný krok. Výběr odpovědi nemá částečné body.',
            'Známka: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5. Maximum lehkého kvízu je 80, středního 120 a těžkého 200 bodů.',
            mathsSubject.rules[3]
        ]
    };
}

if (typeof document !== 'undefined') {
    const lesson = JSON.parse(document.getElementById('lesson-data').textContent);
    initializeTutor(lesson, subjectForLesson(lesson));
}
if (typeof module !== 'undefined') module.exports = {
    formatAnswer, checkAnswer, selectExercises, scoreExercise, maximumPoints, grade, validRecords,
    PROGRESSIVE_MODES, PROGRESSIVE_MINIMUM, PROGRESSIVE_MEDIUM_MINIMUM, subjectForLesson
};
