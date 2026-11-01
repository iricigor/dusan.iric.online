'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('../examples/defenestrace.json');
const mathsLesson = require('../examples/zlomky-a-prevody-delky.json');
const { page } = require('./helpers/runtime.js');

test('the whole bonus indicator fades over 12 seconds without changing its 15-second deadline', () => {
    const runtime = page();
    runtime.start('easy');
    for (const [advance, opacity, remaining] of [
        [0, 1, 1], [6000, .5, .6], [6000, 0, .2], [2000, 0, 1 / 15], [1000, 0, 0], [1000, 0, 0]
    ]) {
        runtime.advance(advance);
        assert.equal(Number(runtime.get('bonus').style.opacity), opacity);
        const scale = Number(runtime.get('bonus-bar').style.transform.match(/scaleX\((.*)\)/)[1]);
        assert.ok(Math.abs(scale - remaining) < 1e-12);
        assert.equal(runtime.get('feedback').hidden, true);
        assert.equal(runtime.get('next').hidden, true);
    }
    assert.equal(runtime.intervals.size, 0);
});

test('every mode and restarted run enables the bonus, waits for progression and stores totals', () => {
    const runtime = page();
    for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
        runtime.start(mode);
        assert.equal(runtime.get('score').textContent, 'Skóre: 0 b');
        assert.equal(runtime.get('quiz-progress').max, count);
        for (let index = 0; index < count; index++) {
            assert.equal(runtime.get('quiz-progress').value, index);
            assert.equal(runtime.get('bonus').textContent, '');
            assert.equal(runtime.get('bonus').style.opacity, '1');
            assert.equal(runtime.get('bonus-bar').style.transform, 'scaleX(1)');
            assert.equal(runtime.intervals.size, 1);
            const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
            runtime.advance(14999);
            assert.equal(runtime.get('bonus').style.opacity, '0');
            if (question.type === 'text') {
                runtime.get('answer-input').value = question.acceptedAnswers[0];
                runtime.get('answers').dispatch('submit');
            } else {
                runtime.get('answers').children[question.answer].dispatch('click');
            }
            assert.match(runtime.get('feedback').textContent, /bonus \+/);
            assert.equal(runtime.get('quiz-progress').value, index + 1);
            assert.equal(runtime.intervals.size, 0);
            const progress = runtime.get('progress').textContent;
            runtime.advance(20000);
            assert.equal(runtime.get('progress').textContent, progress);
            runtime.get('next').dispatch('click');
        }
        assert.ok(runtime.get('grade').textContent.includes(`Body: ${2 * maximum} (z\u00e1klad ${maximum}/${maximum}, bonus ${maximum}). Zn\u00e1mka: 1`));
        assert.equal(runtime.get('summary').children.length, count);
        const record = runtime.records().at(-1);
        assert.equal(record.mode, mode);
        assert.equal(record.total, 2 * maximum);
        assert.equal(record.grade, 1);
        assert.equal(record.answerDurationMs, count * 14999);
        assert.equal(record.duration, Math.round(count * 14999 / 1000));
        assert.equal(runtime.get('score').textContent, `Skóre: ${record.total} b`);
        assert.ok(runtime.get('leaderboard-content').textContent.includes(`${2 * maximum} b`));
        assert.equal(runtime.get('leaderboard').open, true);
        runtime.get('restart').dispatch('click');
        assert.equal(runtime.get('setup').hidden, false);
        assert.equal(runtime.get('leaderboard').open, false);
    }
    assert.equal(runtime.records().length, 3);
});
test('deadline leaves answers available and speed changes totals, not grades or partial credit', () => {
    for (const elapsed of [14999, 15000, 60000]) {
        const runtime = page();
        runtime.start('hard');
        for (let index = 0; index < 10; index++) {
            const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
            runtime.advance(elapsed);
            if (elapsed >= 15000) {
                assert.equal(runtime.get('bonus-bar').style.transform, 'scaleX(0)');
                assert.equal(runtime.get('bonus').style.opacity, '0');
                assert.equal(runtime.intervals.size, 0);
                assert.equal(runtime.get('feedback').hidden, true);
                assert.equal(runtime.get('next').hidden, true);
            }
            if (question.type === 'text') {
                runtime.get('answer-input').value = question.id === 'h-defenestrace' ? '1619' : 'wrong';
                runtime.get('answers').dispatch('submit');
                assert.doesNotMatch(runtime.get('feedback').textContent, /bonus \+/);
            } else {
                runtime.get('answers').children[question.answer].dispatch('click');
            }
            runtime.get('next').dispatch('click');
        }
        const bonus = elapsed < 15000 ? 120 : 0;
        assert.ok(runtime.get('grade').textContent.includes(`Body: ${135 + bonus} (z\u00e1klad 135/210, bonus ${bonus}). Zn\u00e1mka: 2`));
        assert.equal(runtime.records()[0].total, 135 + bonus);
        assert.equal(runtime.get('score').textContent, `Skóre: ${135 + bonus} b`);
        assert.equal(runtime.records()[0].grade, 2);
        assert.ok(runtime.get('leaderboard-content').textContent.includes(`${135 + bonus} b`));
        assert.equal(runtime.intervals.size, 0);
    }
});
