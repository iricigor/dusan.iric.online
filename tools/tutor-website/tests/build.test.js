'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capabilities, renderLesson } = require('../build.js');
const { validateLesson } = require('../validate.js');
const { mathsLesson } = require('./fixture.js');
const history = require('../examples/defenestrace.json');
const maths = require('../examples/zlomky-a-prevody-delky.json');
const { formatAnswer, scoreExercise, maximumPoints, PROGRESSIVE_MODES } = require('../maths.js');
const { MODES } = require('../runtime.js');

test('complete embedded current and legacy lessons regenerate without migration or data loss', () => {
    const legacyHistory = structuredClone(history);
    legacyHistory.version = 1;
    delete legacyHistory.subject;
    delete legacyHistory.language;
    delete legacyHistory.subtitle;
    legacyHistory.questions.forEach(question => { delete question.assessment; });
    const legacyMaths = mathsLesson();
    legacyMaths.version = 2;
    delete legacyMaths.subtitle;
    legacyMaths.exercises.forEach(exercise => exercise.steps.forEach(step => { delete step.assessment; }));
    for (const [subject, lesson] of [
        ['history', history], ['history', legacyHistory],
        ['maths', maths], ['maths', mathsLesson()], ['maths', legacyMaths]
    ]) {
        const before = JSON.stringify(lesson);
        const html = renderLesson(subject, lesson);
        const exported = JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]);
        assert.deepEqual(exported, lesson);
        assert.equal(validateLesson(subject, exported), exported);
        assert.equal(renderLesson(subject, exported), html);
        assert.equal(JSON.stringify(lesson), before);
    }
});

test('discovery identifies real subject-version contracts and untimed maths assessment', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        for (const key of ['schemaPath', 'validatorPath', 'builderPath', 'contractPath', 'examplePath']) {
            assert.ok(path.isAbsolute(result[key]));
            assert.ok(fs.existsSync(result[key]), result[key]);
        }
        assert.equal(result.timing, subject === 'maths' ? 'none' : 'mandatory-speed-bonus-before-15000ms');
        assert.equal(result.version, subject === 'maths' ? 4 : 3);
        assert.deepEqual(result.tabs, ['original', 'learning', 'quiz']);
        assert.equal(result.playerNameRequired, true);
        assert.equal(result.answerDuration, 'active-answering-only-excludes-feedback-and-hidden-quiz');
        assert.equal(result.assessment, 'available');
        assert.equal(result.generation, 'lesson-and-quiz');
    }
    assert.throws(() => capabilities('science'), /Unsupported subject/);
    assert.throws(() => renderLesson('history', maths), /Invalid lesson/);
    assert.throws(() => renderLesson('maths', history), /Invalid maths lesson/);
});

test('capabilities own subject counts and expose runtime mixes without shared mutations', () => {
    for (const subject of ['history', 'maths']) {
        const result = capabilities(subject);
        const progressive = subject === 'maths';
        const modes = progressive ? PROGRESSIVE_MODES : MODES;
        assert.deepEqual(result.authoringRequirements, {
            taskUnit: progressive ? 'whole-exercise' : 'question',
            minimumTasks: 30,
            minimumByDifficulty: progressive ? { easy: 3, medium: 4, hard: 3 } : { easy: 2, medium: 5, hard: 3 },
            recommendedByDifficulty: progressive ? { easy: 9, medium: 12, hard: 9 } : { easy: 6, medium: 15, hard: 9 },
            ...(progressive ? { minimumMediumByType: { choice: 2, number: 2 }, recommendedMediumByType: { choice: 6, number: 6 } } : {}),
            preferredTaskRange: { min: progressive ? 30 : 50, max: 100 },
            minimumTasksEnforcedByValidator: false
        });
        for (const [mode, mix] of Object.entries(modes)) assert.deepEqual(Object.values(result.quizModes[mode]), mix);
        const lesson = structuredClone(progressive ? maths : history);
        const key = progressive ? 'exercises' : 'questions';
        lesson[key] = Object.entries(result.authoringRequirements.minimumByDifficulty).flatMap(([level, count]) =>
            progressive && level === 'medium'
                ? ['choice', 'number'].flatMap(type => lesson[key].filter(task => task.difficulty === level && task.type === type).slice(0, 2))
                : lesson[key].filter(task => task.difficulty === level).slice(0, count));
        assert.equal(lesson[key].length, 10);
        assert.equal(validateLesson(subject, lesson), lesson);
        const fresh = capabilities(subject);
        result.quizModes.easy.easy = 100;
        result.authoringRequirements.minimumByDifficulty.easy = 100;
        if (progressive) result.authoringRequirements.minimumMediumByType.choice = 100;
        assert.deepEqual(capabilities(subject), fresh);
    }
});

test('prepared banks satisfy their distinct quotas with complete canonical full-credit answers', () => {
    const { scoreAnswer } = require('../history.js');
    for (const subject of ['history', 'maths']) {
        const lesson = JSON.parse(fs.readFileSync(capabilities(subject).examplePath, 'utf8'));
        validateLesson(subject, lesson);
        const tasks = lesson.questions || lesson.exercises;
        assert.equal(tasks.length, 30);
        assert.equal(new Set(tasks.map(task => task.prompt.trim().toLocaleLowerCase('cs'))).size, tasks.length);
        assert.deepEqual(Object.fromEntries(['easy', 'medium', 'hard'].map(level =>
            [level, tasks.filter(task => task.difficulty === level).length])), capabilities(subject).authoringRequirements.recommendedByDifficulty);
        tasks.forEach(task => {
            if (subject === 'history') {
                const answers = task.type === 'text' ? task.acceptedAnswers : [task.answer];
                answers.forEach(answer => assert.equal(scoreAnswer(task, answer, 20000).fraction, 1, task.id));
            } else {
                const values = task.options ? [task.answer] : task.steps.map(step => formatAnswer(step.answer));
                assert.equal(scoreExercise(task, values).total, maximumPoints([task]), task.id);
            }
        });
    }
});
