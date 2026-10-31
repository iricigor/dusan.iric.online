'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../examples/defenestrace.json');
const mathsLesson = require('../examples/zlomky-a-prevody-delky.json');
const { page } = require('./helpers/runtime.js');

test('both subjects record answering only, excluding feedback and time outside the visible quiz', () => {
    for (const subject of ['history', 'maths']) {
        const runtime = page(subject);
        runtime.start('easy');
        for (let index = 0; index < 3; index++) {
            runtime.advance(1000);
            runtime.confirm(false, 20000);
            runtime.tab('learning');
            runtime.advance(2000);
            runtime.visible(false);
            runtime.advance(30000);
            runtime.visible(true);
            runtime.advance(500);
            if (subject === 'history') {
                const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
                if (question.options) runtime.get('answers').children[question.answer].dispatch('click');
                else {
                    runtime.get('answer-input').value = question.acceptedAnswers[0];
                    runtime.get('answers').dispatch('submit');
                }
                assert.doesNotMatch(runtime.get('feedback').textContent, /bonus \+/);
            } else runtime.get('answers').dispatch('submit');
            runtime.advance(60000);
            runtime.get('next').dispatch('click');
        }
        const record = runtime.records()[0];
        assert.equal(record.answerDurationMs, 10500, subject);
        assert.equal(runtime.intervals.size, 0);
        assert.match(runtime.get('answer-duration').textContent, /Doba odpovídání: 11 s/);
        assert.equal(runtime.get('leaderboard').open, true);
        assert.match(runtime.get('leaderboard-rank').textContent, /1\. místo z 1 pokusů/);
        assert.match(runtime.get('leaderboard-content').textContent, /KdyDoba odpovídání/);
        if (subject === 'maths') assert.equal(record.duration, undefined);
        else assert.equal(record.duration, 11);

        const legacy = { ...record };
        delete legacy.answerDurationMs;
        const restored = page(subject, [legacy]);
        assert.match(restored.get('leaderboard-content').textContent, /Nezaznamenáno/);
        assert.equal(restored.get('storage-warning').textContent, '');
        for (const invalid of [-1, 1.5, '1000', null]) {
            const corrupt = page(subject, [{ ...record, answerDurationMs: invalid }]);
            assert.match(corrupt.get('storage-warning').textContent, /nelze načíst/);
            assert.equal(corrupt.warnings.length, 1);
            assert.equal(corrupt.records()[0].answerDurationMs, invalid);
        }
    }
});

test('unfinished quizzes guard unload and tab activation, preserving canceled attempts and discarding confirmed ones', () => {
    for (const subject of ['history', 'maths']) {
        const runtime = page(subject);
        const answer = () => {
            if (subject === 'maths') runtime.get('answers').dispatch('submit');
            else {
                const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
                if (question.options) runtime.get('answers').children[question.answer].dispatch('click');
                else {
                    runtime.get('answer-input').value = question.acceptedAnswers[0];
                    runtime.get('answers').dispatch('submit');
                }
            }
        };
        assert.equal(runtime.unloadProtected(), false, subject);
        runtime.tab('learning');
        runtime.key('learning', 'End');
        assert.equal(runtime.selectedTab(), 'quiz');
        assert.equal(runtime.confirmations.length, 0);
        runtime.start('easy');
        assert.equal(runtime.unloadProtected(), true);
        const unload = runtime.unload();
        assert.equal(unload.defaultPrevented, true);
        assert.equal(unload.returnValue, '');
        const question = runtime.get('question').textContent;
        const controls = [...runtime.get('answers').children];
        const input = controls.find(control => control.tag === 'input');
        if (input) input.value = 'rozpracovaná odpověď';
        const timers = [...runtime.intervals.keys()];
        runtime.openTab('learning');
        assert.equal(runtime.get('quiz-leave-dialog').open, true);
        runtime.advance(1000);
        runtime.visible(false);
        runtime.advance(1000);
        runtime.visible(true);
        runtime.get('answers').dispatch('submit');
        assert.equal(runtime.get('quiz-progress').value, 0, 'a modal cannot submit an answer');
        runtime.get('quiz-leave-dialog').dispatch('cancel');
        assert.equal(runtime.get('quiz-leave-dialog').open, false, 'Escape keeps the attempt');
        assert.equal(runtime.selectedTab(), 'quiz');
        assert.deepEqual([...runtime.intervals.keys()], timers);
        runtime.advance(1000);
        runtime.tab('quiz');
        assert.equal(runtime.confirmations.length, 0, 'same tab does not warn');
        for (const key of ['ArrowLeft', 'ArrowRight', 'Home']) {
            runtime.key('quiz', key);
            assert.equal(runtime.selectedTab(), 'quiz');
        }
        runtime.tab('learning');
        assert.equal(runtime.selectedTab(), 'quiz');
        assert.equal(runtime.get('question').textContent, question);
        assert.deepEqual(runtime.get('answers').children, controls);
        if (input) assert.equal(input.value, 'rozpracovaná odpověď');
        assert.deepEqual([...runtime.intervals.keys()], timers, 'cancel does not restart timers');
        assert.equal(runtime.get('quiz-progress').value, 0);
        assert.equal(runtime.unloadProtected(), true, 'canceling unload keeps the guard');
        answer();
        const score = runtime.get('score').textContent;
        runtime.openTab('learning');
        runtime.get('next').dispatch('click');
        assert.equal(runtime.get('question').textContent, question, 'a modal cannot advance feedback');
        runtime.get('quiz-stay').dispatch('click');
        runtime.tab('original');
        assert.equal(runtime.get('score').textContent, score);
        assert.equal(runtime.get('quiz-progress').value, 1);
        assert.equal(runtime.intervals.size, 0);
        runtime.get('next').dispatch('click');
        runtime.confirm(true);
        runtime.key('quiz', 'Home');
        assert.equal(runtime.selectedTab(), 'original');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.unload().defaultPrevented, false);
        assert.equal(runtime.intervals.size, 0);
        assert.equal(runtime.get('game').hidden, true);
        assert.equal(runtime.get('setup').hidden, false);
        assert.equal(runtime.get('score').textContent, 'Skóre: 0 b');
        assert.equal(runtime.get('quiz-progress').value, 0);
        assert.equal(runtime.get('answers').children.length, 0);
        assert.equal(runtime.records().length, 0, 'abandonment does not save a result');
        runtime.get('answers').dispatch('submit');
        runtime.get('next').dispatch('click');
        const promptCount = runtime.confirmations.length;
        runtime.tab('quiz');
        assert.equal(runtime.confirmations.length, promptCount);
        runtime.start('easy');
        assert.equal(runtime.intervals.size, subject === 'history' ? 1 : 0);
        for (let index = 0; index < 3; index++) {
            runtime.advance(1000);
            answer();
            assert.equal(runtime.unloadProtected(), true, 'final feedback is still unfinished');
            runtime.get('next').dispatch('click');
        }
        assert.equal(runtime.records()[0].answerDurationMs, 3000, 'new attempt has no abandoned duration');
        assert.equal(runtime.unloadProtected(), false);
        runtime.tab('learning');
        runtime.key('learning', 'End');
        assert.equal(runtime.confirmations.length, promptCount, 'finished attempt does not warn');
        runtime.get('restart').dispatch('click');
        runtime.tab('original');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.confirmations.length, promptCount, 'setup after restart does not warn');
        runtime.tab('quiz');
        runtime.start('easy');
        runtime.tab('learning');
        assert.equal(runtime.selectedTab(), 'learning', 'pointer confirmation also abandons');
        assert.equal(runtime.records().length, 1, 'previously completed results survive abandonment');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.intervals.size, 0);
        assert.ok(runtime.confirmations.every(dialog => dialog === 'quiz-leave-dialog'));
    }
});
