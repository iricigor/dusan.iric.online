'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { capabilities, renderLesson, build } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { knownWords, oneLetterApart } = require('../assessment.js');
const { selectExercises, scoreExercise, subjectForLesson, contentSize, originalNotes, englishKnownWords, alignLetters } = require('../english.js');
const { MODES } = require('../runtime.js');
const lesson = require('../examples/my-collections.json');

function writtenExercise(value, { difficulty = 'medium', skill = 'meaning', type = 'text', excludedWords = [] } = {}) {
    return {
        difficulty, skill, type, acceptedAnswers: [value], answerLanguage: 'en-GB',
        assessment: {
            input: 'text', exact: { type: 'string', value, normalization: 'language' },
            ...(skill === 'meaning' ? { partial: { match: { type: 'typo', values: [value], excludedWords } } } : {})
        }
    };
}

test('typing alignment separates spelling operations from genuine capitalization differences', () => {
    const exercise = writtenExercise('July');
    for (const [raw, fraction, labels] of [
        ['July', 1, []],
        ['jJuly', 0.8, ['překlepy']],
        ['july', 0.8, ['velká a malá písmena']],
        ['juli', 0.6, ['velká a malá písmena', 'překlepy']],
        ['Jly', 0.8, ['překlepy']],
        ['jly', 0.6, ['velká a malá písmena', 'překlepy']],
        ['uJly', 0.8, ['překlepy']],
        ['ujly', 0.6, ['velká a malá písmena', 'překlepy']],
        ['Jule', 0.8, ['překlepy']]
    ]) {
        const result = scoreExercise(exercise, [raw], new Set());
        assert.equal(result.fraction, fraction, raw);
        assert.deepEqual(result.assessment.mistakes.map(mistake => mistake.label), labels, raw);
    }
    assert.deepEqual(alignLetters('aAa', 'Aa'), { edits: 1, capitalization: 0, pairs: [[1, 0], [2, 1]] });
    assert.deepEqual(alignLetters('uJly', 'July').pairs, [[0, 1], [1, 0], [2, 2], [3, 3]]);
    assert.equal(scoreExercise(writtenExercise('Žába'), ['žába'], new Set()).fraction, 0.8);
    assert.equal(scoreExercise(writtenExercise('Žába'), ['Zába'], new Set()).fraction, 0.8);
});

test('case-aware alignment preserves the existing adjacent-swap edit distance', () => {
    const distance = (left, right) => {
        const a = [...left.toLowerCase()], b = [...right.toLowerCase()];
        const table = Array.from({ length: a.length + 1 }, () => Array(b.length + 1));
        for (let i = 0; i <= a.length; i++) table[i][0] = i;
        for (let j = 0; j <= b.length; j++) table[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1,
                    table[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
                if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                    table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
                }
            }
        }
        return table[a.length][b.length];
    };
    const words = [''];
    let level = [''];
    for (let size = 1; size <= 3; size++) {
        level = level.flatMap(prefix => ['a', 'A', 'b'].map(letter => prefix + letter));
        words.push(...level);
    }
    for (const left of words) {
        for (const right of words) {
            const result = alignLetters(left, right);
            assert.equal(result.edits, distance(left, right), `${left}/${right}`);
            assert.equal(result.capitalization, result.pairs.filter(([i, j]) =>
                left[i].toLowerCase() === right[j].toLowerCase() && left[i] !== right[j]).length);
        }
    }
});

test('integer results keep historical storage intact and reject fractional new records explicitly', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'runtime', 'results.js'), 'utf8');
    const subject = subjectForLesson(lesson);
    const currentKey = `${subject.storagePrefix}:${lesson.id}`;
    const previousKey = `${subject.previousStoragePrefix}:${lesson.id}`;
    const historical = JSON.stringify([
        { id: 'old-fraction', name: 'Tester', mode: 'hard', total: 126.8, maximum: 210, grade: 2, time: 'včera' },
        { id: 'old-integer', name: 'Tester', mode: 'hard', total: 126, maximum: 210, grade: 2, time: 'včera' }
    ]);
    const fractional = JSON.stringify([
        { id: 'invalid', name: 'Tester', mode: 'hard', total: 126.8, maximum: 210, grade: 2, time: 'dnes' }
    ]);
    for (const stored of [null, fractional]) {
        const storage = new Map([[previousKey, historical]]);
        if (stored) storage.set(currentKey, stored);
        const node = (tag, text = '') => ({
            text, hidden: true, children: [],
            append(...items) { this.children.push(...items); },
            replaceChildren() { this.children = []; },
            setAttribute() {},
            get textContent() { return this.text + this.children.map(child => child.textContent).join(''); },
            set textContent(value) { this.text = value; this.children = []; }
        });
        const elements = new Map(['storage-warning', 'leaderboard-content', 'leaderboard-rank'].map(id => [id, node('div')]));
        const warnings = [];
        const context = {
            sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
            console: { warn: (...args) => warnings.push(args) },
            crypto: { randomUUID: () => 'new-run' },
            tutorQuiz: require('../runtime.js')
        };
        vm.runInNewContext(source, context);
        const results = context.initializeTutorResults(lesson, subject, {
            $: id => elements.get(id), node, points: String
        });
        results.renderLeaderboard();
        if (!stored) {
            assert.ok(elements.get('leaderboard-content').textContent.includes(subject.previousResultsNotice));
            assert.equal(elements.get('storage-warning').hidden, true);
        } else {
            assert.equal(elements.get('storage-warning').hidden, false);
            assert.match(elements.get('storage-warning').textContent, /původní úložiště nepřepíšeme/);
            assert.equal(warnings.length, 1);
        }
        results.save('Tester', 'hard', { total: 142, maximum: 210, grade: 2 }, 12345);
        assert.equal(storage.get(previousKey), historical);
        if (stored) assert.equal(storage.get(currentKey), stored, 'invalid new storage is not overwritten');
        else {
            const records = JSON.parse(storage.get(currentKey));
            assert.equal(records.length, 1);
            assert.equal(records[0].total, 142);
            assert.ok(elements.get('leaderboard-content').textContent.includes(subject.previousResultsNotice));
            assert.doesNotMatch(elements.get('leaderboard-content').textContent, /126[.,]8/);
        }
    }
});

test('all partial-credit tiers yield integer question points, totals and record values', () => {
    const rawAnswers = ['abcdef', 'abcde', 'abcd', 'abc', 'ab', 'a'];
    const fractions = [1, 0.8, 0.6, 0.4, 0, 0];
    const subject = subjectForLesson(lesson);
    for (const difficulty of ['easy', 'medium', 'hard']) {
        const question = writtenExercise('abcdef', { difficulty });
        const scores = rawAnswers.map(raw => scoreExercise(question, [raw], new Set()));
        assert.deepEqual(scores.map(score => score.fraction), fractions, difficulty);
        const maximum = { easy: 10, medium: 20, hard: 30 }[difficulty];
        assert.deepEqual(scores.map(score => score.total), fractions.map(fraction => Math.round(maximum * fraction)));
        for (const score of scores) {
            for (const points of [score.base, score.bonus, score.total]) assert.equal(Number.isInteger(points), true);
        }
        assert.match(scores[3].assessment.message, /40 % bodů/);
        assert.match(scores[4].assessment.message, /Body nezískáváš/);
        const result = subject.result(scores.map(score => ({ score })), scores.map(() => question));
        assert.equal(Number.isInteger(result.total), true);
        assert.doesNotMatch(result.text, /\d[.,]\d/);
    }
    assert.equal(subject.validRecord({ mode: 'hard', total: 126.8, maximum: 210, grade: 2 }), false);
    assert.equal(subject.validRecord({ mode: 'hard', total: 142, maximum: 210, grade: 2 }), true);
    assert.equal(subject.storagePrefix, 'english-tutor:v5:integer-v1');
    assert.equal(subject.previousStoragePrefix, 'english-tutor:v5');
});

test('English vocabulary excludes internal authoring strings without changing the shared collector', () => {
    const source = structuredClone(lesson);
    const before = englishKnownWords(source);
    assert.equal(before.has('bog'), false);
    source.id = 'bog';
    source.review = 'bog';
    source.audience = 'bog';
    source.highlights = [{ target: 'bog', quote: 'bog', color: 'yellow' }];
    source.sources = [{ title: 'bog', url: 'https://example.org/bog' }];
    source.exercises.forEach(exercise => {
        exercise.id = 'bog';
        exercise.assessment.internalNote = 'bog';
    });
    assert.deepEqual(englishKnownWords(source), before);
    assert.equal(knownWords(source).has('bog'), true, 'the shared collector is unchanged');
    const exercise = writtenExercise('box');
    assert.equal(scoreExercise(exercise, ['bog'], englishKnownWords(source)).fraction, 0.8);
    assert.equal(subjectForLesson(source).score(exercise, ['bog']).fraction, 0.8);
    source.glossary.push({ term: 'bog', definition: 'Bažina.', forms: ['bog'] });
    assert.equal(scoreExercise(exercise, ['bog'], englishKnownWords(source)).fraction, 0);
    assert.equal(scoreExercise(writtenExercise('box', { excludedWords: ['bog'] }), ['bog'], before).fraction, 0);
});

test('English vocabulary collects only explicit educational text and displayed correction notes', () => {
    const source = {
        topic: 'topicword', subtitle: 'subtitleword', comicIntroduction: 'introword', comicGuidance: 'guidanceword',
        original: [{ heading: 'sourceheading', text: 'sourceword', panelDescription: 'panelword',
            paragraphs: [{ text: 'paragraphword', style: 'hiddenstyle' }] }],
        chunks: [{ heading: 'chunkheading', sentences: ['sentenceword'], explanation: 'explanationword',
            audio: { text: 'audioword', language: 'hiddenlanguage' }, paragraphs: [{ text: 'learningword' }] }],
        glossary: [{ term: 'termword', definition: 'definitionword', forms: ['formword'] }],
        exercises: [{ prompt: 'promptword', text: 'exerciseword', explanation: 'feedbackword',
            audio: { text: 'listeningword' }, options: ['optionword'], words: ['bankword'],
            acceptedAnswers: ['answerword'], skill: 'hiddenskill',
            assessment: { partial: { match: { excludedWords: ['hiddenexclusion'] } } } }],
        originalNotes: [
            { kind: 'spelling', quote: 'quoteword', explanation: 'correctionword' },
            { kind: 'spellingVariant', quote: 'hiddenvariant', explanation: 'hiddenvariantnote' }
        ]
    };
    const vocabulary = englishKnownWords(source);
    assert.deepEqual([...vocabulary].sort(), [
        'topicword', 'subtitleword', 'introword', 'guidanceword', 'sourceheading', 'sourceword', 'panelword',
        'paragraphword', 'chunkheading', 'sentenceword', 'explanationword', 'audioword', 'learningword',
        'termword', 'definitionword', 'formword', 'promptword', 'exerciseword', 'feedbackword',
        'listeningword', 'optionword', 'bankword', 'answerword', 'quoteword', 'correctionword'
    ].sort());
});

test('screenshot answer boundaries remain correct under the new scale', () => {
    const vocabulary = new Set(['her', 'their', 'její', 'jejich']);
    for (const [expected, raw, options, points] of [
        ['Lily and Finn', 'Lily and finn', { difficulty: 'hard' }, 24],
        ['When is her birthday?', 'When is her birthday', { difficulty: 'hard', skill: 'grammar', type: 'wordOrder' }, 24],
        ['their', 'ther', { skill: 'grammar' }, 0],
        ['their', 'her', { skill: 'grammar' }, 0],
        ['their', 'ther', { skill: 'spelling' }, 0],
        ['Toto je jejich dort.', 'toto je její dort', { difficulty: 'hard', skill: 'grammar' }, 0]
    ]) {
        assert.equal(scoreExercise(writtenExercise(expected, options), [raw], vocabulary).total, points, raw);
    }
    const alternatives = writtenExercise('July');
    alternatives.acceptedAnswers.push('juli');
    assert.equal(scoreExercise(alternatives, ['juli'], new Set()).fraction, 1, 'full-credit alternatives win');
});

test('original listening passes exact English section text to the shared player only', () => {
    const adapter = subjectForLesson(lesson);
    const audio = [];
    const children = [];
    const context = { speech: { controls: value => { audio.push(value); return value; } } };
    const article = { append: child => children.push(child) };
    const sections = [
        { language: 'en-GB', text: 'Look!\nMy collektion!', panelDescription: 'Dítě ukazuje sbírku.' },
        { language: 'en-GB', text: '"Wow!"\n\nIt\'s big!', paragraphs: [
            { style: 'quote', text: '"Wow!"' }, { style: 'plain', text: 'It\'s big!' }
        ] },
        { language: 'en-GB', text: 'Use have got with I and you.' },
        { language: 'en-GB', text: '', panelDescription: 'Tichý obrázek.' },
        { language: 'cs-CZ', text: 'České vysvětlení.' },
        { text: 'An unmarked section.' }
    ];
    const before = structuredClone(sections);
    sections.forEach(section => adapter.renderOriginalControls(context, article, section));
    assert.deepEqual(audio, sections.slice(0, 3).map(section => ({
        text: section.text, language: 'en-GB'
    })));
    assert.deepEqual(children, audio);
    assert.deepEqual(sections, before);
});

test('English comics preserve separate panel descriptions and exact image text, including silent panels', () => {
    const source = structuredClone(lesson);
    source.original = [
        { heading: 'Obrázek 1', language: 'en-GB', panelDescription: 'Dítě ukazuje sbírku.', text: 'Look!\nMy collektion!' },
        { heading: 'Obrázek 2', language: 'en-GB', panelDescription: 'Kamarád se usmívá.', text: '"Wow!"\n\nIt\'s big!',
            paragraphs: [{ style: 'quote', text: '"Wow!"' }, { style: 'plain', text: 'It\'s big!' }] },
        { heading: 'Obrázek 3', language: 'en-GB', panelDescription: 'Děti společně prohlížejí krabici.', text: '' }
    ];
    source.originalNotes = [{ section: 0, quote: 'collektion', kind: 'spelling', explanation: 'Správně je collection.' }];
    const before = structuredClone(source);
    assert.equal(validateLesson('english', source), source);
    const html = renderLesson('english', source);
    assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), source);
    const plain = structuredClone(source);
    plain.original.forEach(section => { delete section.panelDescription; });
    assert.deepEqual(contentSize(source), contentSize(plain), 'Czech descriptions do not count as English source text');
    assert.deepEqual(source, before);
    const reject = (edit, pattern) => {
        const copy = structuredClone(source);
        edit(copy);
        assert.throws(() => validateLesson('english', copy), pattern);
    };
    reject(copy => { delete copy.original[2].panelDescription; }, /blank/);
    reject(copy => { copy.original[2].text = '  '; }, /allowed shape/);
    reject(copy => { copy.original[0].panelDescription = ''; }, /blank/);
    reject(copy => { copy.original[0].panelDescription = { html: 'description' }; }, /expected string/);
    reject(copy => { delete copy.original[0].text; }, /missing text/);
    reject(copy => { copy.original[1].paragraphs[0].text = 'Wow!'; }, /exactly preserve/);
    for (const subject of ['history', 'maths']) {
        const other = structuredClone(require(subject === 'history' ? '../examples/defenestrace.json' : '../examples/zlomky-a-prevody-delky.json'));
        other.original[0].panelDescription = 'Popis obrázku.';
        assert.throws(() => validateLesson(subject, other), /forbidden/);
    }
});

test('comic introductions and general guidance are optional, English-only and separate from source material', () => {
    const source = structuredClone(lesson);
    source.original = [{ heading: 'Obrázek 1', language: 'en-GB', panelDescription: 'Dítě ukazuje sbírku.', text: 'Look at my collection!' }];
    const introduction = 'Dítě ukazuje kamarádovi svou sbírku.';
    const guidance = 'Čti obrázky postupně.';
    const size = contentSize(source);
    for (const context of [{}, { comicIntroduction: introduction }, { comicGuidance: guidance },
        { comicIntroduction: introduction, comicGuidance: guidance }]) {
        const copy = { ...structuredClone(source), ...context };
        const before = structuredClone(copy);
        assert.equal(validateLesson('english', copy), copy);
        const html = renderLesson('english', copy);
        assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), copy);
        assert.deepEqual(contentSize(copy), size, 'Czech introductory prose is not English source content');
        assert.deepEqual(copy, before);
    }
    for (const key of ['comicIntroduction', 'comicGuidance']) {
        for (const value of ['', '  ', 1, null, { text: introduction }]) {
            assert.throws(() => validateLesson('english', { ...source, [key]: value }),
                new RegExp(`\\$\\.${key}:`));
        }
        assert.throws(() => validateLesson('english', { ...lesson, [key]: introduction }),
            new RegExp(`\\$\\.${key}: requires an original comic panel`));
        for (const subject of ['history', 'maths']) {
            const other = structuredClone(require(subject === 'history' ? '../examples/defenestrace.json' : '../examples/zlomky-a-prevody-delky.json'));
            other[key] = introduction;
            assert.throws(() => validateLesson(subject, other), /forbidden/);
        }
    }
});

test('original spelling notes are always visible and UK/US notes use a lesson-wide threshold', () => {
    assert.deepEqual(originalNotes(lesson), []);
    const spelling = { section: 0, quote: 'collektion', kind: 'spelling', explanation: 'Správně je collection.' };
    const variants = ['favorite', 'center', 'organization', 'color'].map((quote, index) => ({
        section: index % 2, quote, kind: 'spellingVariant', explanation: 'Platná americká varianta; sjednoť styl.'
    }));
    for (const count of [0, 1, 2, 3, 4]) {
        const source = { originalNotes: [spelling, ...variants.slice(0, count)] };
        const before = structuredClone(source);
        const notes = originalNotes(source);
        assert.equal(notes.length, 1 + (count >= 3 ? count : 0), `${count} variants`);
        assert.equal(notes[0].title, 'Pravopisná chyba');
        assert.ok(notes.slice(1).every(note => note.title === 'Pravopisná varianta (UK/US)'));
        assert.deepEqual(subjectForLesson({ ...lesson, ...source }).originalCorrections, notes);
        assert.deepEqual(source, before);
        assert.equal(originalNotes({ originalNotes: variants.slice(0, count) }).length, count >= 3 ? count : 0);
    }
});

test('original spelling notes validate source locations, shapes and paragraph boundaries', () => {
    const source = structuredClone(lesson);
    source.original = [{ heading: 'Zdroj', language: 'en-GB', text: 'A collektion.\n\nMy favorite colour.',
        paragraphs: [{ style: 'plain', text: 'A collektion.' }, { style: 'quote', text: 'My favorite colour.' }] }];
    source.originalNotes = [
        { section: 0, quote: 'collektion', kind: 'spelling', explanation: 'Správně je collection.' },
        { section: 0, quote: 'favorite', kind: 'spellingVariant', explanation: 'Platná americká varianta.' }
    ];
    assert.equal(validateLesson('english', source), source);
    assert.doesNotThrow(() => renderLesson('english', source));
    const reject = (edit, pattern) => {
        const copy = structuredClone(source);
        edit(copy);
        assert.throws(() => validateLesson('english', copy), pattern);
    };
    reject(copy => { copy.originalNotes[0].section = 99; }, /originalNotes.*exactly one occurrence/);
    reject(copy => { copy.originalNotes[0].section = -1; }, /minimum/);
    reject(copy => { copy.originalNotes[0].quote = 'absent'; }, /exactly one occurrence/);
    reject(copy => { copy.originalNotes[0].quote = ' '; }, /blank/);
    reject(copy => { copy.originalNotes[0].explanation = ''; }, /blank/);
    reject(copy => { copy.originalNotes[0].kind = 'grammar'; }, /spellingVariant/);
    reject(copy => { delete copy.originalNotes[0].kind; }, /missing kind/);
    reject(copy => { copy.originalNotes[0].html = '<b>Unsafe</b>'; }, /unknown property/);
    reject(copy => { copy.originalNotes.push({ ...copy.originalNotes[0] }); }, /overlaps/);
    reject(copy => { copy.originalNotes.push({ ...copy.originalNotes[0], quote: 'A collektion.' }); }, /overlaps/);
    reject(copy => { copy.originalNotes[0].quote = 'collektion.\n\nMy'; }, /within one styled/);
    reject(copy => {
        delete copy.original[0].paragraphs;
        copy.original[0].text += ' Another collektion.';
    }, /exactly one occurrence/);
    for (const subject of ['history', 'maths']) {
        const other = structuredClone(require(subject === 'history' ? '../examples/defenestrace.json' : '../examples/zlomky-a-prevody-delky.json'));
        other.originalNotes = [];
        assert.throws(() => validateLesson(subject, other), /forbidden/);
    }
});

test('English discovery, prepared content size, coverage and guarded standalone generation', t => {
    const discovery = capabilities('english');
    assert.equal(discovery.version, 5);
    assert.equal(discovery.timing, 'none');
    assert.equal(discovery.listening.microphone, false);
    assert.equal(discovery.listening.playback, 'single-play-pause-resume-button');
    assert.equal(discovery.listening.availability, 'single-page-warning');
    assert.equal(discovery.listening.voiceSelection, 'documented-local-male-female-pair');
    assert.deepEqual(Object.keys(discovery.quizModes), Object.keys(MODES));
    for (const key of ['schemaPath', 'validatorPath', 'builderPath', 'contractPath', 'examplePath']) {
        assert.ok(path.isAbsolute(discovery[key]) && fs.existsSync(discovery[key]));
    }
    assert.equal(validateLesson('english', lesson), lesson);
    assert.deepEqual(contentSize(lesson), { englishWords: 949, englishSentences: 125 });
    const types = new Set(lesson.exercises.map(exercise => exercise.type));
    assert.deepEqual([...types].sort(), discovery.authoringRequirements.exerciseTypes.sort());
    for (const [level, minimum] of Object.entries(discovery.authoringRequirements.recommendedByDifficulty)) {
        assert.ok(lesson.exercises.filter(exercise => exercise.difficulty === level).length >= minimum);
    }
    assert.equal(lesson.exercises.length, 30);
    assert.deepEqual(new Set(lesson.exercises.filter(exercise => exercise.direction).map(exercise => exercise.direction)), new Set(['en-cs', 'cs-en']));
    const html = renderLesson('english', lesson);
    assert.match(html, /data-subject="english"/);
    assert.match(html, /Angličtina/);
    assert.doesNotMatch(html, /id="bonus"|@@[A-Z_]+@@|getUserMedia|SpeechRecognition/);
    assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), lesson);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'english-build-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const inputPath = path.join(directory, 'lesson.json');
    const outputPath = path.join(directory, 'lesson.html');
    fs.writeFileSync(inputPath, JSON.stringify(lesson));
    const request = { operation: 'build', subject: 'english', artifactDirectory: directory, inputPath, outputPath };
    assert.equal(build(request).outputPath, outputPath);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), html);
    assert.throws(() => build(request), /EEXIST/);
});

test('English has progressive non-repeating selection, canonical credit and time-independent results', () => {
    const subject = subjectForLesson(lesson);
    const vocabulary = englishKnownWords(lesson);
    for (const exercise of lesson.exercises) {
        const values = [exercise.options ? exercise.answer : exercise.acceptedAnswers[0]];
        const scored = scoreExercise(exercise, values, vocabulary);
        assert.equal(scored.fraction, 1, exercise.id);
        assert.equal(scored.bonus, 0);
    }
    for (const [mode, counts] of Object.entries(MODES)) {
        const selected = selectExercises(lesson.exercises, mode, () => 0.4);
        assert.deepEqual(['easy', 'medium', 'hard'].map(level => selected.filter(exercise => exercise.difficulty === level).length), counts);
        assert.equal(new Set(selected.map(exercise => exercise.id)).size, selected.length);
        const difficulties = selected.map(exercise => ['easy', 'medium', 'hard'].indexOf(exercise.difficulty));
        assert.deepEqual(difficulties, [...difficulties].sort());
        const answers = selected.map(question => ({ score: subject.score(question, [question.options ? question.answer : question.acceptedAnswers[0]], 999999) }));
        const result = subject.result(answers, selected);
        assert.equal(result.total, subject.maximum(selected));
        assert.equal(result.grade, 1);
        assert.equal(subject.validRecord({ ...result, mode }), true);
        assert.equal(subject.validRecord({ ...result, mode, total: result.total + 5 }), false);
    }
    assert.equal(subject.compareResults({ total: 20, answerDurationMs: 1 }, { total: 20, answerDurationMs: 99999 }), 0);
    assert.throws(() => selectExercises(lesson.exercises, 'unknown'), /Unknown/);
    assert.throws(() => selectExercises([...lesson.exercises, lesson.exercises[0]], 'easy'), /Duplicate/);
    assert.throws(() => selectExercises([], 'easy'), /Not enough/);
});

test('English grading accepts declared translations, preserves word boundaries and makes a final full stop optional', () => {
    const exercise = lesson.exercises.find(exercise => exercise.id === 'translate-key-ring');
    const vocabulary = englishKnownWords(lesson);
    assert.equal(scoreExercise(exercise, ['  PŘÍVĚSEK   NA KLÍČE  '], vocabulary).fraction, 0.8);
    for (const raw of ['kroužek na klíče']) {
        assert.equal(scoreExercise(exercise, [raw], vocabulary).fraction, 1);
    }
    assert.equal(scoreExercise(exercise, ['přívěsek na klíče.'], vocabulary).fraction, 1);
    assert.ok(scoreExercise(exercise, ['privesek na klice'], vocabulary).fraction < 1);
    for (const raw of ['přívěseknaklíče', 'klíče']) {
        assert.equal(scoreExercise(exercise, [raw], vocabulary).fraction, 0);
    }
    const gap = lesson.exercises.find(exercise => exercise.id === 'gap-i');
    assert.equal(scoreExercise(gap, ['HAVE'], vocabulary).fraction, 0.8);
    assert.equal(scoreExercise(gap, ['has'], vocabulary).fraction, 0);
});

test('English partial mistakes combine capitalization, apostrophes, end marks and bounded typos', () => {
    const task = (value, { difficulty = 'easy', skill = 'meaning', excludedWords = [] } = {}) => ({
        difficulty, skill, type: 'translation', answerLanguage: 'en-GB', acceptedAnswers: [value],
        assessment: {
            input: 'text', exact: { type: 'string', value, normalization: 'language' },
            ...(skill === 'meaning' ? { partial: { match: { type: 'typo', values: [value], excludedWords } } } : {})
        }
    });
    const vocabulary = new Set(['apple', 'apples', 'magazine', 'magazines', 'live', 'love', 'shelf', 'shelves', 'box']);
    const score = (value, raw, options) => scoreExercise(task(value, options), [raw], vocabulary);
    assert.equal(score('My birthday is in July.', 'my birthday is in july').fraction, 0.8);
    assert.equal(score('My birthday is in July.', 'my birthday is in july.').fraction, 0.8);
    assert.equal(score('I have got a comic?', 'i have got a comic').fraction, 0.6);
    assert.equal(score("I've got a comic?", 'Ive got a comic?').fraction, 0.8);
    assert.equal(score("I've got a comic?", 'ive got a comic').fraction, 0.4);
    assert.equal(score('magazine', 'magazin', { skill: 'grammar' }).fraction, 0);
    assert.equal(score('Look!', 'Look').fraction, 0.8);
    assert.equal(score('Look.', 'Look').fraction, 1);
    assert.equal(score('Look', 'Look.').fraction, 1);
    assert.equal(score('Look!', 'Look.').fraction, 0.8);
    assert.equal(score('magazine', 'magazin').fraction, 0.8);
    assert.equal(score('magazine', 'magzaine').fraction, 0.8);
    assert.equal(score('magazine', 'magzainee').fraction, 0.6);
    assert.equal(score('magazine', 'xyzab').fraction, 0);
    assert.equal(score('magazine', 'magazines').fraction, 0);
    assert.equal(score('box', 'bog').fraction, 0.8);
    assert.equal(score('box', 'bxo').fraction, 0.8);
    assert.equal(score('live', 'love').fraction, 0);
    assert.equal(score('like', 'likes', { excludedWords: ['likes'] }).fraction, 0);
    assert.equal(score('a green dinosaur', 'a gren dinosaur').fraction, 1);
    assert.equal(score('a green dinosaur', 'a gren dinosuar').fraction, 0.8);
    assert.equal(score('a green dinosaur', 'a gren dnosaure').fraction, 0.6);
    assert.equal(score('a green dinosaur', 'a gn dnosaure').fraction, 0);
    assert.equal(score('a green dinosaur', 'green a dinosaur').fraction, 0);
    assert.equal(score('a  green   dinosaur', 'a green dinosaur').fraction, 1);
    assert.equal(score('abcdefghij', 'abcdefghiX').fraction, 1);
    assert.equal(score('abcdefghij', 'abcdefgXXj').fraction, 0.8);
    assert.equal(score('samolepka', 'samolepkaa', { answerLanguage: 'cs-CZ' }).fraction, 0.8);
    assert.equal(score('magazine', 'MAGAZINE').fraction, 0.8);
    assert.equal(score('magazine', 'magazin', { difficulty: 'hard' }).total, 24);
    assert.match(score('My birthday is in July.', 'my birthday is in july').assessment.message, /80 % bodů/);
    assert.match(score('My birthday is in July.', 'my birthday is in july.').assessment.message, /velká a malá písmena/);
    assert.match(score("I've got a comic?", 'ive got a comic').assessment.message, /40 % bodů/);
    assert.match(score("I've got a comic?", 'ive got a com').assessment.message, /Body nezískáváš/);
    assert.equal(score('magazine', 'a'.repeat(81)).assessment.valid, false);

    const feedback = [];
    const node = (tag, text) => ({ tag, text });
    const question = { ...task('My birthday is in July.'), explanation: 'Věta je o narozeninách.' };
    const result = score('My birthday is in July.', 'my birthday is in july');
    subjectForLesson(lesson).feedback({ node }, { append: (...items) => feedback.push(...items) }, {
        question, values: ['my birthday is in july'], score: result
    });
    assert.ok(feedback.some(item => item.text === 'Tvoje odpověď: my birthday is in july'));
    assert.ok(feedback.some(item => item.text === 'Správná odpověď: My birthday is in July.'));
    assert.equal(feedback.some(item => item.text?.includes('July..')), false);

    assert.equal(oneLetterApart('word', 'wrd'), true);
    assert.equal(oneLetterApart('abc', 'abdc'), false);
    assert.throws(() => scoreExercise(task('magazine'), ['magazin']), /lesson vocabulary/);
});

test('English validation rejects mismatched, unsafe or ambiguous authoring without changing legacy policies', () => {
    const reject = (edit, pattern) => {
        const copy = structuredClone(lesson);
        edit(copy);
        assert.throws(() => validateLesson('english', copy), pattern);
    };
    reject(copy => { copy.version = 4; }, /Invalid English|Invalid english/);
    reject(copy => { copy.exercises[0].answer = 2; }, /Invalid english/);
    reject(copy => { copy.exercises[0].assessment.exact.value = '1'; }, /correct option|canonical/);
    reject(copy => { copy.exercises.find(e => e.direction === 'en-cs').answerLanguage = 'en-GB'; }, /translation direction/);
    reject(copy => { copy.exercises.find(e => e.type === 'listening').text = 'Spoiler'; }, /forbidden/);
    reject(copy => { delete copy.exercises.find(e => e.type === 'listening').audio; }, /missing audio/);
    reject(copy => { copy.exercises.find(e => e.type === 'listening').audio.language = 'cs-CZ'; }, /en-GB/);
    reject(copy => { copy.exercises.find(e => e.type === 'gapFill').text = 'No blank'; }, /answer blank/);
    reject(copy => { copy.exercises.find(e => e.type === 'wordOrder').words.pop(); }, /every offered word/);
    reject(copy => { copy.exercises.find(e => e.assessment.partial).skill = 'spelling'; }, /cannot award typo/);
    reject(copy => { copy.exercises.find(e => e.assessment.partial).skill = 'grammar'; }, /cannot award typo/);
    reject(copy => { copy.exercises.find(e => e.assessment.partial).assessment.partial.match.values = ['unrelated']; }, /full-credit alternatives/);
    reject(copy => { delete copy.exercises.find(e => e.id === 'translate-box').assessment.partial; }, /require explicit typo-tolerance targets/);
    reject(copy => { copy.exercises.find(e => e.acceptedAnswers).assessment.exact.normalization = 'czech'; }, /language-normalized/);
    reject(copy => { copy.exercises.find(e => e.acceptedAnswers).acceptedAnswers.push('extra'); }, /declared acceptedAnswers|canonical/);
    const legacy = structuredClone(lesson);
    legacy.exercises.find(e => e.id === 'translate-box').assessment.partial.credit = 0.5;
    assert.equal(validateLesson('english', legacy), legacy);
    assert.equal(scoreExercise(legacy.exercises.find(e => e.id === 'translate-box'), ['bog'], englishKnownWords(legacy)).fraction, 0.8);
    const history = structuredClone(require('../examples/defenestrace.json'));
    history.questions.find(q => q.type === 'text').assessment.partial = {
        credit: 0.5, match: { type: 'typo', values: ['test'], excludedWords: [] }
    };
    assert.throws(() => validateLesson('history', history), /only supported for English/);
});

test('compact listening is opt-in and original playback respects explicit paragraph languages', () => {
    const copy = structuredClone(lesson);
    copy.listeningUi = 'compact';
    copy.original = [{
        heading: 'Komiks', language: 'en-GB',
        text: "Dvě děti slaví narozeniny.\n\nIt's our birthday!",
        paragraphs: [
            { style: 'comment', language: 'cs-CZ', text: 'Dvě děti slaví narozeniny.' },
            { style: 'plain', language: 'en-GB', text: "It's our birthday!" }
        ]
    }];
    assert.equal(validateLesson('english', copy), copy);
    assert.equal(subjectForLesson(copy).compactListening, true);
    assert.deepEqual(subjectForLesson(copy).originalAudio(copy.original[0]), { text: "It's our birthday!", language: 'en-GB' });
    assert.equal(contentSize(copy).englishWords, contentSize(lesson).englishWords + 3);
    assert.equal(subjectForLesson(copy).originalAudio({ language: 'cs-CZ', text: 'Pouze český popis.' }), null);
    assert.equal(subjectForLesson(lesson).compactListening, false);
    assert.equal(subjectForLesson(lesson).originalAudio(copy.original[0]), null);
    delete copy.original[0].paragraphs[0].language;
    assert.throws(() => validateLesson('english', copy), /explicit paragraph language/);
    copy.listeningUi = 'unsupported';
    assert.throws(() => validateLesson('english', copy), /compact/);
    const maths = structuredClone(require('../examples/zlomky-a-prevody-delky.json'));
    maths.listeningUi = 'compact';
    assert.throws(() => validateLesson('maths', maths), /Invalid maths/);
    delete maths.listeningUi;
    maths.original[0].paragraphs = [{ style: 'plain', language: 'cs-CZ', text: maths.original[0].text }];
    assert.throws(() => validateLesson('maths', maths), /English-only/);
});
