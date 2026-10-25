'use strict';

const MODES = { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] };
const POINTS = { easy: 10, medium: 20, hard: 30 };

function normalizeAnswer(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('cs').replace(/y/g, 'i').trim().replace(/\s+/g, ' ');
}

function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function selectQuestions(questions, mode, random = Math.random) {
    if (!Object.hasOwn(MODES, mode)) throw new Error(`Unknown quiz mode: ${mode}`);
    const selected = [];
    ['easy', 'medium', 'hard'].forEach((level, index) => {
        const pool = questions.filter(q => q.difficulty === level);
        const count = MODES[mode][index];
        if (pool.length < count) throw new Error(`Not enough ${level} questions`);
        if (mode === 'hard' && level === 'hard') {
            const years = pool.filter(q => q.year);
            if (!years.length) throw new Error('Hard mode needs a year question');
            const year = shuffle(years, random)[0];
            selected.push(year, ...shuffle(pool.filter(q => q.id !== year.id), random).slice(0, count - 1));
        } else {
            selected.push(...shuffle(pool, random).slice(0, count));
        }
    });
    return shuffle(selected, random);
}

function scoreAnswer(question, answer, elapsedMs) {
    let fraction = 0;
    if (question.type !== 'text') {
        fraction = answer === question.answer ? 1 : 0;
    } else if (question.year) {
        if (/^[0-9]{1,4}$/.test(answer.trim())) {
            const difference = Math.abs(Number(answer.trim()) - Number(question.acceptedAnswers[0]));
            fraction = difference === 0 ? 1 : difference < 10 ? 0.5 : 0;
        }
    } else {
        fraction = question.acceptedAnswers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer)) ? 1 : 0;
    }
    const base = POINTS[question.difficulty] * fraction;
    const bonus = fraction === 1 && elapsedMs >= 0 && elapsedMs < 15000 ? base : 0;
    return { fraction, base, bonus, total: base + bonus };
}

function grade(base, maximum) {
    const percentage = base / maximum;
    return percentage >= .8 ? 1 : percentage >= .6 ? 2 : percentage >= .4 ? 3 : percentage >= .2 ? 4 : 5;
}

function compareResults(a, b) {
    return b.total - a.total || a.duration - b.duration;
}

const historySubject = {
    storagePrefix: 'history-tutor:v1',
    speedBonus: true,
    rules: 'Lehká otázka: 10 bodů. Střední: 20 bodů. Těžká: 30 bodů. Za zcela správnou odpověď za méně než 15 sekund získáš 2× body. Potom můžeš dál odpovídat za základní body. Známka nezávisí na rychlosti: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5.',
    select: (lesson, mode) => selectQuestions(lesson.questions, mode),
    maximum: questions => questions.reduce((sum, question) => sum + POINTS[question.difficulty], 0),
    score: (question, values, elapsed) => scoreAnswer(question, values[0], elapsed),
    acceptSubmission: values => typeof values[0] !== 'string' || Boolean(values[0].trim()),
    fields: question => [{ id: 'answer-input', label: 'Tvoje odpověď', inputMode: question.year ? 'numeric' : undefined }],
    compareResults,
    validRecord: row => Object.hasOwn(MODES, row.mode) && Number.isFinite(row.total) && row.total >= 0 &&
        Number.isFinite(row.duration) && row.duration >= 0 && Number.isInteger(row.grade) && row.grade >= 1 && row.grade <= 5,
    renderLearning({ $, node, paragraph, disclose }, lesson) {
        const chunks = node('div');
        chunks.id = 'chunks';
        lesson.chunks.forEach(chunk => {
            const article = node('article', undefined, 'card');
            article.append(node('h2', chunk.heading), paragraph(chunk.sentences.join(' ')),
                disclose('Nápověda: jednodušeji', node('p', chunk.explanation)));
            chunks.append(article);
        });
        $('learning-content').append(chunks);
    },
    feedback({ node }, container, { question, values, score }) {
        const correct = question.type === 'text' ? question.acceptedAnswers[0] : question.options[question.answer];
        const display = question.type === 'text' ? values[0] : question.options[values[0]];
        const label = score.fraction === 1 ? 'Správně!' : score.fraction > 0 ? 'Blízko! Máš polovinu bodů.' : 'Tentokrát ne. Zkus to příště!';
        container.append(node('p', `${label} Tvoje odpověď: ${display}. Správná odpověď: ${correct}. ${question.explanation} Body: ${score.total}${score.bonus ? ` (bonus +${score.bonus})` : ''}.`,
            score.fraction > 0 ? 'correct success' : 'incorrect failure'));
    },
    result(answers, questions) {
        const base = answers.reduce((sum, answer) => sum + answer.score.base, 0);
        const bonus = answers.reduce((sum, answer) => sum + answer.score.bonus, 0);
        const maximum = historySubject.maximum(questions);
        const mark = grade(base, maximum);
        return { total: base + bonus, maximum, grade: mark,
            text: `Body: ${base + bonus} (základ ${base}/${maximum}, bonus ${bonus}). Známka: ${mark}` };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeAnswer, shuffle, selectQuestions, scoreAnswer, grade, compareResults };
}
if (typeof document !== 'undefined') {
    initializeTutor(JSON.parse(document.getElementById('lesson-data').textContent), historySubject);
}
