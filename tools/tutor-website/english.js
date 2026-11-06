'use strict';

const { MODES, POINTS, shuffle, grade } = typeof module !== 'undefined' && module.exports
    ? require('./runtime.js') : tutorQuiz;
const { evaluate, knownWords } = typeof module !== 'undefined' && module.exports
    ? require('./assessment.js') : tutorAssessment;

function selectExercises(exercises, mode, random = Math.random) {
    if (!Object.hasOwn(MODES, mode)) throw new Error(`Unknown English quiz mode: ${mode}`);
    if (new Set(exercises.map(exercise => exercise.id)).size !== exercises.length) throw new Error('Duplicate English task ids');
    return ['easy', 'medium', 'hard'].flatMap((level, index) => {
        const pool = exercises.filter(exercise => exercise.difficulty === level);
        if (pool.length < MODES[mode][index]) throw new Error(`Not enough ${level} English tasks`);
        return shuffle(pool, random).slice(0, MODES[mode][index]);
    });
}

function scoreExercise(exercise, answers, vocabulary) {
    const raw = exercise.options ? String(answers[0]) : answers[0];
    const validChoice = !exercise.options || (Number.isInteger(answers[0]) && answers[0] >= 0 && answers[0] < exercise.options.length);
    const assessment = validChoice ? evaluate(exercise.assessment, raw, { knownWords: vocabulary }) :
        { fraction: 0, correct: false, valid: false, message: 'Vyber jednu z nabízených odpovědí.' };
    const base = POINTS[exercise.difficulty] * assessment.fraction;
    return { fraction: assessment.fraction, base, bonus: 0, total: base, assessment };
}

const maximumPoints = exercises => exercises.reduce((sum, exercise) => sum + POINTS[exercise.difficulty], 0);

function contentSize(lesson) {
    const passages = [
        ...lesson.original.filter(section => section.language === 'en-GB').map(section => section.text),
        ...lesson.chunks.flatMap(chunk => chunk.sentences),
        ...lesson.glossary.map(entry => entry.term),
        ...lesson.exercises.flatMap(exercise => [
            ...(exercise.text && exercise.direction !== 'cs-en' ? [exercise.text] : []),
            ...(exercise.audio ? [exercise.audio.text] : []),
            ...(exercise.words || []),
            ...(exercise.type === 'choice' ? exercise.options : [])
        ])
    ];
    return {
        englishWords: passages.reduce((sum, text) => sum + (text.match(/\p{L}+(?:['’]\p{L}+)*/gu) || []).length, 0),
        englishSentences: passages.reduce((sum, text) => sum + (text.match(/[.!?]+(?=\s|$)/g) || []).length, 0)
    };
}

function subjectForLesson(lesson) {
    const vocabulary = knownWords(lesson);
    return {
        storagePrefix: 'english-tutor:v5',
        speedBonus: false,
        listening: true,
        icon: '📚',
        rules: [
            'Lehká úloha: 10 bodů. Střední: 20 bodů. Těžká: 30 bodů.',
            'Nespěchej. Poslech můžeš opakovat bez omezení a bez ztráty bodů. Nepoužíváme mikrofon.',
            'Uznáváme uvedené správné varianty, bez ohledu na velikost písmen a mezery navíc. Znaménka a diakritiku zachovej.',
            'Pokud to úloha dovoluje, jeden překlep v odpovědi ve slově s alespoň čtyřmi písmeny získá polovinu bodů. Pravopisné úlohy, změny gramatiky a pořadí slov tuto výhodu nemají.',
            'Známka: 1 od 80 %, 2 od 60 %, 3 od 40 %, 4 od 20 %, jinak 5. Rychlost ani opakování poslechu nemění body nebo pořadí.'
        ],
        answerHelp: 'Piš podle zadání anglicky nebo česky. U překladu může být více správných variant. U řazení použij všechna nabízená slova. Po odeslání už odpověď nezměníš.',
        select: (source, mode) => selectExercises(source.exercises, mode),
        maximum: maximumPoints,
        score: (exercise, answers) => scoreExercise(exercise, answers, vocabulary),
        acceptSubmission: values => typeof values[0] === 'number' || Boolean(values[0]?.trim()),
        optionLanguage: exercise => exercise.type === 'trueFalse' ? 'cs-CZ' : 'en-GB',
        fields: exercise => [{ id: 'answer-input', label: exercise.answerLanguage === 'cs-CZ' ? 'Tvoje odpověď česky' : 'Tvoje odpověď anglicky', language: exercise.answerLanguage }],
        compareResults: (a, b) => b.total - a.total,
        validRecord: row => Object.hasOwn(MODES, row.mode) &&
            row.maximum === MODES[row.mode].reduce((sum, count, index) => sum + count * [10, 20, 30][index], 0) &&
            Number.isFinite(row.total) && row.total >= 0 && row.total <= row.maximum &&
            Number.isInteger(row.total / 5) && row.grade === grade(row.total, row.maximum),
        renderLearning({ $, node, paragraph, heading, hint, paragraphs, speech }, source) {
            source.chunks.forEach((chunk, index) => {
                const article = node('article', undefined, 'card');
                article.id = `learning-chunk-${index}`;
                article.dataset.learningCard = 'true';
                article.tabIndex = -1;
                const english = paragraph(chunk.sentences.join(' '), 'p', { target: `chunks.${index}.sentences` });
                english.lang = 'en-GB';
                article.append(heading(chunk.heading, chunk.icon, '📚'), english,
                    hint('Jak tomu rozumět?', chunk.explanation, 'p', { explanation: `chunks.${index}.explanation` }),
                    ...paragraphs(chunk.paragraphs, `chunks.${index}.paragraphs`));
                if (chunk.audio) article.append(speech.controls(chunk.audio));
                $('learning-content').append(article);
            });
        },
        renderQuestion({ $, node, speech }, exercise) {
            const material = $('question-material');
            if (exercise.text) {
                const text = node('p', exercise.text);
                text.lang = exercise.direction === 'cs-en' ? 'cs-CZ' : 'en-GB';
                material.append(text);
            }
            if (exercise.words) {
                const bank = node('p', 'Slova: ');
                const words = node('span', exercise.words.join(' / '));
                words.lang = 'en-GB';
                bank.append(words);
                material.append(bank);
            }
            if (exercise.audio) material.append(speech.controls(exercise.audio));
            material.hidden = !material.children.length;
        },
        feedback({ node }, container, { question, values, score }) {
            const correct = question.options ? question.options[question.answer] : question.acceptedAnswers[0];
            const actual = question.options ? question.options[values[0]] : values[0];
            container.append(node('p', `${score.assessment.message} Tvoje odpověď: ${actual || '(bez odpovědi)'}.`),
                node('p', `${score.fraction === 1 ? '' : `Správná odpověď: ${correct}. `}${question.explanation}`),
                node('p', `Body: ${score.total}.`));
            if (question.audio) {
                const transcript = node('p', `Text poslechu: ${question.audio.text}`);
                transcript.lang = question.audio.language;
                container.append(transcript);
            }
        },
        result(answers, questions) {
            const total = answers.reduce((sum, answer) => sum + answer.score.total, 0);
            const maximum = maximumPoints(questions);
            const mark = grade(total, maximum);
            return { total, maximum, grade: mark, text: `Body: ${total}/${maximum}. Známka: ${mark}` };
        }
    };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { selectExercises, scoreExercise, maximumPoints, subjectForLesson, contentSize };
if (typeof document !== 'undefined') {
    const englishLesson = JSON.parse(document.getElementById('lesson-data').textContent);
    initializeTutor(englishLesson, subjectForLesson(englishLesson));
}
