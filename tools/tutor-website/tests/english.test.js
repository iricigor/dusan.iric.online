'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { capabilities, renderLesson, build } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { evaluate, knownWords, oneLetterApart } = require('../assessment.js');
const { selectExercises, scoreExercise, subjectForLesson, contentSize, originalNotes } = require('../english.js');
const { MODES } = require('../runtime.js');
const lesson = require('../examples/my-collections.json');

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
    const vocabulary = knownWords(lesson);
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

test('English normalization accepts declared translations without removing word boundaries, accents or punctuation', () => {
    const exercise = lesson.exercises.find(exercise => exercise.id === 'translate-key-ring');
    for (const raw of ['  PŘÍVĚSEK   NA KLÍČE  ', 'kroužek na klíče']) {
        assert.equal(evaluate(exercise.assessment, raw).fraction, 1);
    }
    for (const raw of ['privesek na klice', 'přívěseknaklíče', 'klíče', 'přívěsek na klíče.']) {
        assert.equal(evaluate(exercise.assessment, raw).fraction, 0);
    }
    const gap = lesson.exercises.find(exercise => exercise.id === 'gap-i');
    assert.equal(evaluate(gap.assessment, 'HAVE').fraction, 1);
    assert.equal(evaluate(gap.assessment, 'has').fraction, 0);
});

test('one-word and multi-word typo policies enforce one letter operation in the entire answer', () => {
    const vocabulary = new Set(['apple', 'apples', 'magazine', 'magazines', 'live', 'love', 'shelf', 'shelves']);
    const policy = value => ({
        input: 'text', exact: { type: 'string', value, normalization: 'language' },
        partial: { credit: 0.5, match: { type: 'typo', values: [value], excludedWords: ['liked', 'likes'] } }
    });
    const score = (value, raw) => evaluate(policy(value), raw, { knownWords: vocabulary }).fraction;
    for (const raw of ['magazin', 'magazzine', 'magazone', 'magzaine']) assert.equal(score('magazine', raw), 0.5, raw);
    for (const raw of ['magazines', 'magzaien', 'magzin', 'maga zine', '', 'x'.repeat(81)]) assert.equal(score('magazine', raw), 0, raw);
    assert.equal(score('magazine', 'MAGAZINE'), 1);
    assert.equal(score('box', 'bxo'), 0);
    assert.equal(score('apple', 'apples'), 0);
    assert.equal(score('live', 'love'), 0);
    assert.equal(score('like', 'likes'), 0);
    assert.equal(score('a green dinosaur', 'a gren dinosaur'), 0.5);
    assert.equal(score('a green dinosaur', 'a gren dinosuar'), 0);
    assert.equal(score('a green dinosaur', 'green a dinosaur'), 0);
    assert.equal(score('a green dinosaur', 'a green dinosaur.'), 0);
    assert.equal(score('a green dinosaur', 'a  green   dinosaur'), 1);
    assert.equal(score('samolepka', 'samolepkaa'), 0.5);
    assert.equal(oneLetterApart('word', 'wrd'), true);
    assert.equal(oneLetterApart('abc', 'abdc'), false);
    assert.throws(() => evaluate(policy('magazine'), 'magazin'), /lesson vocabulary/);
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
    reject(copy => { copy.exercises.find(e => e.acceptedAnswers).assessment.exact.normalization = 'czech'; }, /language-normalized/);
    reject(copy => { copy.exercises.find(e => e.acceptedAnswers).acceptedAnswers.push('extra'); }, /declared acceptedAnswers|canonical/);
    const history = structuredClone(require('../examples/defenestrace.json'));
    history.questions.find(q => q.type === 'text').assessment.partial = {
        credit: 0.5, match: { type: 'typo', values: ['test'], excludedWords: [] }
    };
    assert.throws(() => validateLesson('history', history), /only supported for English/);
});
