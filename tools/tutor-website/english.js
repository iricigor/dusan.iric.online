'use strict';

const { MODES, POINTS, shuffle, grade } = typeof module !== 'undefined' && module.exports
    ? require('./runtime.js') : tutorQuiz;
const { evaluate, parseInput, normalizeLanguage, knownWords } = typeof module !== 'undefined' && module.exports
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

function alignLetters(left, right) {
    const a = [...left], b = [...right];
    const lowerA = a.map(letter => letter.toLocaleLowerCase('cs'));
    const lowerB = b.map(letter => letter.toLocaleLowerCase('cs'));
    const distance = Array.from({ length: a.length + 1 }, () => Array(b.length + 1));
    const step = (previous, edits, pairs = []) => ({
        previous, pairs, edits: previous.edits + edits,
        capitalization: previous.capitalization + pairs.filter(([i, j]) =>
            lowerA[i] === lowerB[j] && a[i] !== b[j]).length
    });
    distance[0][0] = { edits: 0, capitalization: 0, pairs: [] };
    for (let index = 1; index <= a.length; index++) distance[index][0] = step(distance[index - 1][0], 1);
    for (let index = 1; index <= b.length; index++) distance[0][index] = step(distance[0][index - 1], 1);
    for (let row = 1; row <= a.length; row++) {
        for (let column = 1; column <= b.length; column++) {
            const candidates = [
                step(distance[row - 1][column], 1),
                step(distance[row][column - 1], 1),
                step(distance[row - 1][column - 1], Number(lowerA[row - 1] !== lowerB[column - 1]),
                    [[row - 1, column - 1]])
            ];
            if (row > 1 && column > 1 && lowerA[row - 1] === lowerB[column - 2] && lowerA[row - 2] === lowerB[column - 1]) {
                candidates.push(step(distance[row - 2][column - 2], 1,
                    [[row - 2, column - 1], [row - 1, column - 2]]));
            }
            distance[row][column] = candidates.reduce((best, candidate) =>
                candidate.edits < best.edits ||
                (candidate.edits === best.edits && candidate.capitalization < best.capitalization) ? candidate : best);
        }
    }
    const result = distance[a.length][b.length];
    const pairs = [];
    for (let current = result; current.previous; current = current.previous) pairs.push(...current.pairs);
    return { edits: result.edits, capitalization: result.capitalization, pairs: pairs.sort(([i], [j]) => i - j) };
}

function englishKnownWords(lesson) {
    const paragraphs = value => (value || []).map(paragraph => paragraph.text);
    return knownWords([
        lesson.topic, lesson.subtitle, lesson.comicIntroduction, lesson.comicGuidance,
        ...(lesson.original || []).flatMap(section =>
            [section.heading, section.text, section.panelDescription, ...paragraphs(section.paragraphs)]),
        ...(lesson.chunks || []).flatMap(chunk =>
            [chunk.heading, ...chunk.sentences, chunk.explanation, chunk.audio?.text, ...paragraphs(chunk.paragraphs)]),
        ...(lesson.glossary || []).flatMap(entry => [entry.term, entry.definition, ...entry.forms]),
        ...(lesson.exercises || []).flatMap(exercise => [
            exercise.prompt, exercise.text, exercise.explanation, exercise.audio?.text,
            ...(exercise.options || []), ...(exercise.words || []), ...(exercise.acceptedAnswers || [])
        ]),
        ...originalNotes(lesson).flatMap(note => [note.quote, note.explanation])
    ]);
}

function answerTokens(value) {
    return value.match(/[\p{L}]+(?:['’][\p{L}]+)*|[^\p{L}]+/gu) || [];
}

function terminalPunctuation(value) {
    const mark = value.match(/[.!?]$/)?.[0] || '';
    return { body: mark ? value.slice(0, -1) : value, mark };
}

const normalizeWhitespace = value => value.normalize('NFC').trim().replace(/\s+/g, ' ');

function apostrophePositions(word) {
    const positions = [];
    let letters = 0;
    for (const character of word) {
        if (/[’']/u.test(character)) positions.push(letters);
        else letters++;
    }
    return positions;
}

function answerDifferences(raw, expected, exercise, vocabulary) {
    const actualText = normalizeWhitespace(raw);
    const expectedText = normalizeWhitespace(expected);
    const actual = terminalPunctuation(actualText);
    const target = terminalPunctuation(expectedText);
    const punctuationMistakes = target.mark === '?' || target.mark === '!'
        ? Number(actual.mark !== target.mark)
        : Number(actual.mark === '?' || actual.mark === '!');
    const actualTokens = answerTokens(actual.body);
    const expectedTokens = answerTokens(target.body);
    if (actualTokens.length !== expectedTokens.length) return null;

    let capitalizationMistakes = 0;
    let apostropheMistakes = 0;
    let typoOperations = 0;
    const typo = exercise.assessment.partial?.match;
    const excluded = new Set((typo?.excludedWords || []).map(normalizeLanguage));

    for (let index = 0; index < actualTokens.length; index++) {
        const answerToken = actualTokens[index];
        const expectedToken = expectedTokens[index];
        const isWord = /^\p{L}/u.test(answerToken) && /^\p{L}/u.test(expectedToken);
        if (!isWord) {
            if (answerToken.replace(/[’']/gu, "'") !== expectedToken.replace(/[’']/gu, "'")) return null;
            continue;
        }

        const answerLetters = answerToken.replace(/[’']/gu, '').toLocaleLowerCase('cs');
        const expectedLetters = expectedToken.replace(/[’']/gu, '').toLocaleLowerCase('cs');
        const answerPositions = apostrophePositions(answerToken);
        const expectedPositions = apostrophePositions(expectedToken);
        if (answerPositions.some(position => !expectedPositions.includes(position))) return null;
        apostropheMistakes += expectedPositions.filter(position => !answerPositions.includes(position)).length;

        const alignment = alignLetters(answerToken.replace(/[’']/gu, ''), expectedToken.replace(/[’']/gu, ''));
        capitalizationMistakes += alignment.capitalization;
        const edits = alignment.edits;
        if (edits) {
            if (typo?.type !== 'typo' || exercise.skill !== 'meaning' || exercise.type === 'wordOrder') return null;
            if (!(vocabulary instanceof Set)) throw new Error('Typo assessment requires the lesson vocabulary');
            if (vocabulary.has(answerLetters) || excluded.has(answerLetters)) return null;
            typoOperations += edits;
        }
    }

    const letterCount = (expectedText.match(/\p{L}/gu) || []).length;
    const typoMistakes = letterCount >= 10 ? Math.max(0, typoOperations - 1) : typoOperations;
    const mistakes = [
        ...(capitalizationMistakes ? [{ count: 1, label: 'velká a malá písmena' }] : []),
        ...(apostropheMistakes ? [{ count: apostropheMistakes, label: 'chybějící apostrofy' }] : []),
        ...(punctuationMistakes ? [{ count: punctuationMistakes, label: 'koncové znaménko' }] : []),
        ...(typoMistakes ? [{ count: typoMistakes, label: 'překlepy' }] : [])
    ];
    return { mistakes, count: mistakes.reduce((sum, mistake) => sum + mistake.count, 0) };
}

function evaluateEnglishAnswer(exercise, raw, vocabulary) {
    const parsed = parseInput(exercise.assessment, raw);
    if (parsed.error) return { fraction: 0, correct: false, valid: false, status: 'invalid', message: parsed.error };

    const candidates = exercise.acceptedAnswers.map(answer =>
        answerDifferences(parsed.text, answer, exercise, vocabulary)).filter(Boolean);
    if (!candidates.length) {
        return {
            fraction: 0, correct: false, valid: true, status: 'incorrect',
            message: 'Tentokrát to nevyšlo. Porovnej svůj postup s řešením.'
        };
    }
    const result = candidates.reduce((best, candidate) => candidate.count < best.count ? candidate : best);
    const fraction = [1, 0.8, 0.6, 0.4][result.count] ?? 0;
    const details = result.mistakes.map(mistake =>
        `${mistake.label}${mistake.count > 1 ? ` (${mistake.count})` : ''}`).join(', ');
    const message = result.count === 0 ? 'Správně.' : result.count >= 4
        ? `Tentokrát ${result.count} drobných chyb (${details}). Body nezískáváš.`
        : `Částečně správně: ${details}. Získáváš ${Math.round(fraction * 100)} % bodů.`;
    return {
        fraction, correct: fraction === 1, valid: true,
        status: fraction === 1 ? 'correct' : fraction > 0 ? 'partial' : 'incorrect',
        message, mistakes: result.mistakes
    };
}

function scoreExercise(exercise, answers, vocabulary) {
    const raw = exercise.options ? String(answers[0]) : answers[0];
    const validChoice = !exercise.options || (Number.isInteger(answers[0]) && answers[0] >= 0 && answers[0] < exercise.options.length);
    const assessment = !validChoice ? { fraction: 0, correct: false, valid: false, message: 'Vyber jednu z nabízených odpovědí.' } :
        exercise.options ? evaluate(exercise.assessment, raw, { knownWords: vocabulary }) :
            evaluateEnglishAnswer(exercise, raw, vocabulary);
    const base = Math.round(POINTS[exercise.difficulty] * assessment.fraction);
    return { fraction: assessment.fraction, base, bonus: 0, total: base, assessment };
}

const maximumPoints = exercises => exercises.reduce((sum, exercise) => sum + POINTS[exercise.difficulty], 0);
const formatPoints = value => String(value).replace('.', ',');

function originalNotes(lesson) {
    const notes = lesson.originalNotes || [];
    const variants = notes.filter(note => note.kind === 'spellingVariant').length;
    return notes.filter(note => note.kind !== 'spellingVariant' || variants >= 3).map(note => ({
        ...note,
        title: note.kind === 'spelling' ? 'Pravopisná chyba' : 'Pravopisná varianta (UK/US)'
    }));
}

function contentSize(lesson) {
    const passages = [
        ...lesson.original.flatMap(section => (section.paragraphs || [section])
            .filter(block => (block.language || section.language) === 'en-GB').map(block => block.text)),
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
    const vocabulary = englishKnownWords(lesson);
    const notes = originalNotes(lesson);
    return {
        storagePrefix: 'english-tutor:v5:integer-v1',
        previousStoragePrefix: 'english-tutor:v5',
        previousResultsNotice: 'Starší pokusy zůstávají uložené beze změny pro původní stránku. Nové pokusy mají jiné bodování a samostatné pořadí; starší body nezaokrouhlujeme ani nepřepočítáváme.',
        speedBonus: false,
        listening: true,
        compactListening: lesson.listeningUi === 'compact',
        icon: '📚',
        originalCorrections: notes,
        renderOriginalIntroduction({ $, node }, source) {
            if (!source.original.some(section => section.panelDescription)) return;
            const introduction = node('div', undefined, 'comic-context');
            introduction.lang = 'cs-CZ';
            introduction.append(node('h2', 'Jak číst přepis'), node('p', [
                source.comicIntroduction,
                'Menší český text popisuje obrázky. Text z komiksu je přepsaný beze změn.',
                source.comicGuidance || 'Čti obrázky postupně. Anglický text každého obrázku si můžeš také poslechnout.'
            ].filter(Boolean).join(' '), 'comic-description-note'));
            $('original-content').append(introduction);
        },
        renderOriginalControls({ speech }, article, section) {
            if (section.language === 'en-GB' && section.text.trim()) {
                article.append(speech.controls({ text: section.text, language: section.language }));
            }
        },
        renderOriginalNotes({ node }, article, section, index) {
            notes.filter(note => note.section === index).forEach(note => {
                const block = node('aside', undefined,
                    `original-note callout callout-${note.kind === 'spelling' ? 'warning' : 'note'}`);
                block.append(node('strong', `${note.title}: `, 'callout-label'));
                const quote = node('q', note.quote);
                quote.lang = section.language;
                block.append(quote, node('p', note.explanation));
                article.append(block);
            });
        },
        rules: [
            'Lehká úloha: 10 bodů. Střední: 20 bodů. Těžká: 30 bodů.',
            'Nespěchej. Poslech můžeš opakovat bez omezení a bez ztráty bodů. Nepoužíváme mikrofon.',
            'Závěrečná tečka nevadí. Velká písmena a apostrofy hlídej; u otázek a zvolání nezapomeň na ? nebo !.',
            'Za jednu drobnou chybu získáš 80 % bodů, za dvě 60 %, za tři 40 % a za čtyři nebo více 0 bodů. Body jsou vždy celá čísla. Chyby ve velkých písmenech v celé odpovědi počítáme jako jednu; každý chybějící apostrof a povinné ? nebo ! jako další.',
            'V úlohách na význam: u odpovědí kratších než 10 písmen se jeden překlep počítá jako drobná chyba. U odpovědí s 10 a více písmeny první překlep nevadí, další se počítají.',
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
            Number.isInteger(row.total) && row.grade === grade(row.total, row.maximum),
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
        originalAudio(section) {
            if (lesson.listeningUi !== 'compact') return null;
            const text = (section.paragraphs || [section])
                .filter(block => (block.language || section.language) === 'en-GB')
                .map(block => block.text).join('\n\n');
            return text ? { text, language: 'en-GB' } : null;
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
            const points = formatPoints(score.total);
            container.append(node('p', score.assessment.message),
                node('p', `Tvoje odpověď: ${actual || '(bez odpovědi)'}`),
                ...(score.fraction === 1 ? [] : [node('p', `Správná odpověď: ${correct}`)]),
                node('p', question.explanation), node('p', `Body: ${points}.`));
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
            return { total, maximum, grade: mark, text: `Body: ${formatPoints(total)}/${maximum}. Známka: ${mark}` };
        }
    };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { selectExercises, scoreExercise, maximumPoints, subjectForLesson, contentSize, originalNotes, englishKnownWords, alignLetters };
if (typeof document !== 'undefined') {
    const englishLesson = JSON.parse(document.getElementById('lesson-data').textContent);
    initializeTutor(englishLesson, subjectForLesson(englishLesson));
}
