'use strict';

const { MODES, POINTS, shuffle, grade } = typeof module !== 'undefined' && module.exports
    ? require('./runtime.js') : tutorQuiz;

const { evaluate, normalizeAnswer, legacyHistoryPolicy } = typeof module !== 'undefined' && module.exports
    ? require('./assessment.js') : tutorAssessment;

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
            const hard = [year, ...shuffle(pool.filter(q => q.id !== year.id), random).slice(0, count - 1)];
            selected.push(...shuffle(hard, random));
        } else {
            selected.push(...shuffle(pool, random).slice(0, count));
        }
    });
    return selected;
}

function scoreAnswer(question, answer, elapsedMs) {
    const result = evaluate(question.assessment || legacyHistoryPolicy(question), typeof answer === 'number' ? String(answer) : answer);
    const { fraction } = result;
    const base = POINTS[question.difficulty] * fraction;
    const bonus = fraction === 1 && elapsedMs >= 0 && elapsedMs < 15000 ? base : 0;
    return { fraction, base, bonus, total: base + bonus, assessment: result };
}

function compareResults(a, b) {
    return b.total - a.total || (a.answerDurationMs ?? a.duration * 1000) - (b.answerDurationMs ?? b.duration * 1000);
}

const historySubject = {
    storagePrefix: 'history-tutor:v1',
    speedBonus: true,
    rules: [
        'Lehká otázka: 10 bodů. Střední: 20 bodů. Těžká: 30 bodů.',
        'Za zcela správnou odpověď za méně než 15 sekund získáš 2× body. Tenký proužek ukazuje, dokud je bonus dostupný. Potom můžeš dál odpovídat za základní body. Nemusíš spěchat.',
        'Známka nezávisí na rychlosti: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5.',
        'Pokusy řadíme podle bodů. Při stejných bodech rozhoduje kratší doba odpovídání. Čtení vysvětlení ani pobyt mimo kvíz se do ní nepočítají. U starších pokusů zůstává původní celková doba.'
    ],
    select: (lesson, mode) => selectQuestions(lesson.questions, mode),
    maximum: questions => questions.reduce((sum, question) => sum + POINTS[question.difficulty], 0),
    score: (question, values, elapsed) => scoreAnswer(question, values[0], elapsed),
    acceptSubmission: values => typeof values[0] !== 'string' || Boolean(values[0].trim()),
    fields: question => [{ id: 'answer-input', label: 'Tvoje odpověď', inputMode: question.year ? 'numeric' : undefined }],
    compareResults,
    validRecord: row => Object.hasOwn(MODES, row.mode) && Number.isFinite(row.total) && row.total >= 0 &&
        Number.isFinite(row.duration) && row.duration >= 0 && Number.isInteger(row.grade) && row.grade >= 1 && row.grade <= 5,
    renderLearning({ $, node, paragraphs, hint, heading }, lesson) {
        const chunks = node('div');
        chunks.id = 'chunks';
        lesson.chunks.forEach((chunk, index) => {
            const article = node('article', undefined, 'card');
            article.id = `learning-chunk-${index}`;
            article.dataset.learningCard = 'true';
            article.tabIndex = -1;
            article.append(heading(chunk.heading, chunk.icon, '🏰'),
                hint(chunk.sentences.join(' '), chunk.explanation, 'p', {
                    prompt: `chunks.${index}.sentences`, explanation: `chunks.${index}.explanation`
                }), ...paragraphs(chunk.paragraphs, `chunks.${index}.paragraphs`));
            chunks.append(article);
        });
        $('learning-content').append(chunks);
    },
    feedback({ node }, container, { question, values, score }) {
        const correct = question.type === 'text' ? question.acceptedAnswers[0] : question.options[question.answer];
        const display = question.type === 'text' ? values[0] : question.options[values[0]];
        const label = score.fraction === 1 ? 'Správně!' : score.fraction > 0 ? 'Blízko! Máš polovinu bodů.' : 'Tentokrát ne. Zkus to příště!';
        container.append(node('p', `${score.assessment.valid ? label : score.assessment.message} Tvoje odpověď: ${display}. Správná odpověď: ${correct}. ${question.explanation} Body: ${score.total}${score.bonus ? ` (bonus +${score.bonus})` : ''}.`,
            score.fraction > 0 ? 'correct' : 'incorrect'));
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
