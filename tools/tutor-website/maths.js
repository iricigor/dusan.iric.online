'use strict';

const { MODES, POINTS, shuffle, grade } = typeof module !== 'undefined' && module.exports
    ? require('./runtime.js') : tutorQuiz;
const { evaluate, legacyMathsPolicy } = typeof module !== 'undefined' && module.exports
    ? require('./assessment.js') : tutorAssessment;

function checkAnswer(expected, raw, assessment) {
    return evaluate(assessment || legacyMathsPolicy(expected), raw);
}

function selectExercises(exercises, mode, random = Math.random) {
    if (!Object.hasOwn(MODES, mode)) throw new Error(`Unknown maths quiz mode: ${mode}`);
    if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) throw new Error('Duplicate maths task ids');
    const selected = [];
    ['easy', 'medium', 'hard'].forEach((level, index) => {
        const pool = exercises.filter(exercise => exercise.difficulty === level);
        if (pool.length < MODES[mode][index]) throw new Error(`Not enough ${level} maths tasks`);
        selected.push(...shuffle(pool, random).slice(0, MODES[mode][index]));
    });
    return selected;
}

function maximumPoints(exercises) {
    return exercises.reduce((sum, exercise) => sum + POINTS[exercise.difficulty] + (exercise.difficulty === 'easy' ? 1 : 0), 0);
}

function scoreExercise(exercise, answers) {
    const steps = exercise.steps.map((step, index) => checkAnswer(step.answer, answers[index] || '', step.assessment));
    const base = steps.reduce((sum, step) => sum + step.fraction, 0) * POINTS[exercise.difficulty] / steps.length;
    const accuracy = exercise.difficulty === 'easy' && steps.every(step => step.correct) ? 1 : 0;
    return { steps, base, accuracy, total: base + accuracy };
}

function validRecords(records) {
    return Array.isArray(records) && records.every(row => row && Object.hasOwn(MODES, row.mode) &&
        row.maximum === MODES[row.mode].reduce((sum, count, index) => sum + count * [11, 20, 30][index], 0) &&
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
        lesson.examples.forEach(example => {
            const article = node('article', undefined, 'card');
            article.append(heading(example.heading, example.icon, '📐'),
                hint(example.prompt, example.hint), ...paragraphs(example.paragraphs));
            const steps = node('ol');
            example.steps.forEach(step => {
                const item = node('li');
                const detail = disclose('Odkrýt krok', paragraph(step.calculation), paragraph(step.explanation));
                item.append(detail);
                steps.append(item);
            });
            const answer = disclose('Výsledek', paragraph(example.answer));
            article.append(steps, answer);
            examples.append(article);
        });
        const intro = node('article', undefined, 'card');
        intro.append(heading('Teď to zkus samostatně', undefined, '✏️'),
            node('p', 'Začni lehkými příklady a postupuj k těžším. Nejprve počítej bez pomoci. Nápovědu nebo řešení si otevři, až je potřebuješ.'));
        const exercises = node('div');
        exercises.id = 'exercises';
        const levels = { easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' };
        const ordered = ['easy', 'medium', 'hard'].flatMap(level => lesson.exercises.filter(exercise => exercise.difficulty === level));
        ordered.forEach((exercise, index) => {
            const article = node('article', undefined, 'card');
            article.append(heading(`${index + 1}. ${levels[exercise.difficulty]}`, exercise.icon, '✏️'), paragraph(exercise.prompt));
            exercise.steps.forEach((step, stepIndex) => {
                const label = exercise.difficulty === 'easy' ? `${index + 1}${'abcd'[stepIndex]}` : `${index + 1}.${stepIndex + 1}`;
                article.append(hint(`${label}: ${step.prompt}`, step.hint, 'h3'),
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

if (typeof document !== 'undefined') initializeTutor(JSON.parse(document.getElementById('lesson-data').textContent), mathsSubject);
if (typeof module !== 'undefined') module.exports = {
    formatAnswer, checkAnswer, selectExercises, scoreExercise, maximumPoints, grade, validRecords
};
