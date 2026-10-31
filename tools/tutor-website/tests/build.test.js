'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities, renderLesson } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { mathsLesson } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const { formatAnswer } = require('../maths.js');
const { questionBank, MODES } = require('../runtime.js');

test('question bank export counts complete tasks and includes canonical answers without learner data', () => {
    for (const [subject, lesson] of [['history', history], ['maths', mathsLesson()]]) {
        const before = JSON.stringify(lesson);
        const adapter = require(`../${subject}.js`);
        const result = questionBank(lesson, adapter);
        const tasks = lesson.questions || lesson.exercises;
        assert.deepEqual(Object.keys(result), ['subject', 'lessonId', 'topic', 'summary', 'questions']);
        assert.equal(result.subject, subject);
        assert.equal(result.lessonId, lesson.id);
        assert.equal(result.summary.totalQuestions, tasks.length);
        assert.deepEqual(result.summary.byDifficulty, subject === 'history'
            ? { easy: 6, medium: 15, hard: 9 } : { easy: 2, medium: 5, hard: 3 });
        assert.deepEqual(result.questions.map(question => question.id), tasks.map(question => question.id));
        result.questions.forEach((question, index) => {
            if (subject === 'history') {
                assert.deepEqual(question.correctAnswers, tasks[index].type === 'text'
                    ? tasks[index].acceptedAnswers : [tasks[index].options[tasks[index].answer]]);
            } else {
                assert.deepEqual(question.steps.map(step => step.correctAnswer), tasks[index].steps.map(step => formatAnswer(step.answer)));
                assert.deepEqual(question.steps.map(step => step.answer), tasks[index].steps.map(step => step.answer));
            }
            assert.deepEqual(question.assessment, tasks[index].assessment);
        });
        assert.equal(JSON.stringify(lesson), before);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    }
    const legacy = { ...history, version: 1 };
    delete legacy.subject;
    assert.equal(questionBank(legacy, require('../history.js')).subject, 'history');
});

test('discovery identifies real contracts and available untimed maths assessment', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        for (const key of ['schemaPath', 'validatorPath', 'builderPath', 'contractPath', 'examplePath']) {
            assert.ok(path.isAbsolute(result[key]));
            assert.ok(fs.existsSync(result[key]), result[key]);
        }
        assert.equal(result.timing, subject === 'maths' ? 'none' : 'mandatory-speed-bonus-before-15000ms');
        assert.equal(result.version, 3);
        assert.deepEqual(result.tabs, ['original', 'learning', 'quiz']);
        assert.equal(result.playerNameRequired, true);
        assert.equal(result.answerDuration, 'active-answering-only-excludes-feedback-and-hidden-quiz');
    }
    assert.equal(capabilities('maths').assessment, 'available');
    assert.equal(capabilities('maths').generation, 'lesson-and-quiz');
    assert.throws(() => capabilities('science'), /Unsupported subject/);
    assert.throws(() => renderLesson('history', mathsLesson()), /Invalid lesson/);
    assert.throws(() => renderLesson('maths', history), /Invalid maths lesson/);
});

test('capabilities own new-authoring counts and expose the runtime quiz mixes without shared mutations', () => {
    const quizModes = {
        easy: { easy: 1, medium: 1, hard: 1 },
        medium: { easy: 1, medium: 2, hard: 2 },
        hard: { easy: 2, medium: 5, hard: 3 }
    };
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        assert.deepEqual(result.authoringRequirements, {
            taskUnit: subject === 'history' ? 'question' : 'whole-exercise',
            minimumTasks: 30,
            minimumByDifficulty: { easy: 2, medium: 5, hard: 3 },
            recommendedByDifficulty: { easy: 6, medium: 15, hard: 9 },
            preferredTaskRange: { min: subject === 'history' ? 50 : 30, max: 100 },
            minimumTasksEnforcedByValidator: false
        });
        assert.deepEqual(result.quizModes, quizModes);
        for (const [mode, mix] of Object.entries(MODES)) {
            assert.deepEqual(Object.values(result.quizModes[mode]), mix);
        }
        const lesson = JSON.parse(fs.readFileSync(result.examplePath, 'utf8'));
        const poolKey = subject === 'history' ? 'questions' : 'exercises';
        lesson[poolKey] = Object.entries(result.authoringRequirements.minimumByDifficulty)
            .flatMap(([level, count]) => lesson[poolKey].filter(task => task.difficulty === level).slice(0, count));
        assert.equal(lesson[poolKey].length, 10);
        assert.equal(validateLesson(subject, lesson), lesson);
        const legacy = structuredClone(lesson);
        legacy.version = subject === 'history' ? 1 : 2;
        delete legacy.subtitle;
        if (subject === 'history') {
            delete legacy.subject;
            delete legacy.language;
            legacy.questions.forEach(question => { delete question.assessment; });
        } else legacy.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
        assert.equal(validateLesson(subject, legacy), legacy);
        result.quizModes.easy.easy = 100;
        result.authoringRequirements.minimumByDifficulty.easy = 100;
        assert.deepEqual(capabilities(subject).quizModes, quizModes);
        assert.equal(capabilities(subject).authoringRequirements.minimumByDifficulty.easy, 2);
        assert.equal(MODES.easy[0], 1);
    }
});

test('one prepared maths lesson combines fraction calculations and length conversions in every quiz mode', () => {
    const { selectExercises, scoreExercise, maximumPoints, checkAnswer } = require('../maths.js');
    const maths = require('../examples/zlomky-a-prevody-delky.json');
    assert.equal(maths.id, 'zlomky-a-prevody-delky');
    assert.equal(maths.topic, 'Zlomky a převody jednotek délky');
    assert.deepEqual(maths.exercises.map(exercise => exercise.steps.map(step => formatAnswer(step.answer))), [
        ['6', '15', '1/2', '0,25'], ['300', '5', '2000', '15'],
        ['12'], ['95'], ['150'], ['2/5'], ['750'],
        ['200', '400', '100'], ['600', '1800', '600'], ['45', '75', '15'],
        ['1/4', '2/3', '0,6', '18'], ['6', '4,5', '700', '1,25'],
        ['25', '60', '500', '75'], ['0,125', '0,75', '1,5', '1,75'],
        ['115'], ['7'], ['6'], ['56'], ['1,75'], ['15'], ['1/4'], ['13,5'], ['300'], ['4'],
        ['1200', '1800', '1200'], ['60', '36', '18'], ['200', '150', '500'],
        ['200', '235', '2,35'], ['150', '50', '200'], ['180', '120', '15']
    ]);
    for (const [mode, count, maximum] of [['easy', 3, 61], ['medium', 5, 111], ['hard', 10, 212]]) {
        for (const random of [() => 0, () => .999999, Math.random]) {
            const questions = selectExercises(maths.exercises, mode, random);
            assert.equal(questions.length, count);
            assert.equal(new Set(questions.map(question => question.id)).size, count);
            assert.equal(maximumPoints(questions), maximum);
            assert.ok(questions.some(question => /centimetr|metr|decimetr/.test(question.steps[0].prompt)));
            assert.ok(questions.some(question => /\d\/\d|zlom|polovin|třetin|čtvrtin|osmin|pětin/.test(question.prompt)));
            const score = questions.reduce((sum, question) =>
                sum + scoreExercise(question, question.steps.map(step => formatAnswer(step.answer))).total, 0);
            assert.equal(score, maximum);
        }
    }
    assert.equal(scoreExercise(maths.exercises[0], ['6', '15', '3/6', '0.25']).steps[2].fraction, .5);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0,25').correct, true);
    assert.equal(checkAnswer(maths.exercises[0].steps[3].answer, '0.25').correct, true);
    const hard = maths.exercises[7];
    assert.equal(scoreExercise(hard, ['', ...hard.steps.slice(1).map(step => formatAnswer(step.answer))]).total, 20);
});

test('both prepared banks contain 30 distinct tasks with complete export and canonical full-credit answers', () => {
    const { scoreAnswer } = require('../history.js');
    const { scoreExercise } = require('../maths.js');
    for (const subject of ['history', 'maths']) {
        const lesson = JSON.parse(fs.readFileSync(capabilities(subject).examplePath, 'utf8'));
        validateLesson(subject, lesson);
        const tasks = lesson.questions || lesson.exercises;
        assert.ok(tasks.length >= 30, `${subject}: whole tasks, not maths steps`);
        assert.equal(new Set(tasks.map(task => task.prompt.trim().toLocaleLowerCase('cs'))).size, tasks.length);
        const exported = questionBank(lesson, require(`../${subject}.js`));
        assert.deepEqual(exported.summary, { totalQuestions: 30, byDifficulty: { easy: 6, medium: 15, hard: 9 } });
        tasks.forEach(task => {
            if (subject === 'history') {
                const answers = task.type === 'text' ? task.acceptedAnswers : [task.answer];
                answers.forEach(answer => assert.equal(scoreAnswer(task, answer, 20000).fraction, 1, task.id));
            } else {
                assert.ok(scoreExercise(task, task.steps.map(step => formatAnswer(step.answer))).steps.every(step => step.correct), task.id);
            }
        });
    }
});

test('all default fixed-unit questions accept and display numbers without requiring unit suffixes', () => {
    const { checkAnswer, scoreExercise } = require('../maths.js');
    const maths = require('../examples/zlomky-a-prevody-delky.json');
    const expected = {
        'ctyri-prevody': ['300', '5', '2000', '15'],
        'dve-tycky': ['95'],
        'stuha-na-darek': ['150'],
        'cesta-do-knihovny': ['750'],
        'provaz-na-kusy': ['200', '400', '100'],
        'vylet-na-etapy': ['600', '1800', '600'],
        'stuzka-na-masle': ['45', '75', '15']
    };
    for (const [id, answers] of Object.entries(expected)) {
        const exercise = maths.exercises.find(task => task.id === id);
        const result = scoreExercise(exercise, answers);
        assert.ok(result.steps.every(step => step.correct), id);
        exercise.steps.forEach((step, index) => {
            assert.equal(step.answer.format, 'integer');
            assert.equal(step.assessment.input, 'number');
            assert.equal(formatAnswer(step.answer), answers[index]);
            assert.equal(checkAnswer(step.answer, String(Number(answers[index]) + 1), step.assessment).correct, false);
        });
    }
    const conversion = maths.exercises.find(task => task.id === 'ctyri-prevody').steps[2];
    assert.equal(checkAnswer(conversion.answer, '2000', conversion.assessment).fraction, 1);
    assert.equal(checkAnswer(conversion.answer, '2', conversion.assessment).fraction, 0);
    assert.equal(checkAnswer(conversion.answer, '2000 m', conversion.assessment).valid, false);
});
