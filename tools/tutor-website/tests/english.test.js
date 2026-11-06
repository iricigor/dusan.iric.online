'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { capabilities, renderLesson, build } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { evaluate, knownWords, oneLetterApart } = require('../assessment.js');
const { selectExercises, scoreExercise, subjectForLesson, contentSize } = require('../english.js');
const { MODES } = require('../runtime.js');
const lesson = require('../examples/my-collections.json');

test('English discovery, prepared content size, coverage and guarded standalone generation', t => {
    const discovery = capabilities('english');
    assert.equal(discovery.version, 5);
    assert.equal(discovery.timing, 'none');
    assert.equal(discovery.listening.microphone, false);
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
