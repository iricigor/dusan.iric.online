'use strict';

const assert = require('node:assert/strict');

async function checkHistoryQuiz({ evaluate }) {
    for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
        const result = await evaluate(`(async () => {
            const $ = id => document.getElementById(id);
            const lesson = JSON.parse($('lesson-data').textContent);
            window.answerClock = 0;
            Object.defineProperty(performance, 'now', { configurable: true, value: () => window.answerClock });
            await window.switchTutorTab('quiz');
            $('player').value = 'Kontrola';
            const random = Math.random;
            if (${JSON.stringify(mode)} === 'hard') Math.random = () => .999999;
            $('quiz-tools').open = true;
            document.querySelector('[data-mode="${mode}"]').click();
            Math.random = random;
            if ($('quiz-tools').open) throw new Error('Export tools obscure a newly started quiz');
            const bonus = $('bonus').textContent === '' && $('bonus').getAttribute('aria-hidden') === 'true' &&
                $('bonus-bar').style.transform === 'scaleX(1)';
            if ($('score').textContent !== 'Skóre: 0 b' || $('quiz-progress').value !== 0 ||
                $('quiz-progress').max !== ${count}) throw new Error('Invalid initial quiz status');
            let total = 0;
            let partials = 0;
            let previousLevel = -1;
            for (let index = 0; index < ${count}; index++) {
                const question = lesson.questions.find(q => q.prompt === $('question').textContent);
                const level = ['easy', 'medium', 'hard'].indexOf(question.difficulty);
                if (level < previousLevel) throw new Error('History difficulty went backwards');
                previousLevel = level;
                window.answerClock += 2000;
                if (question.type === 'text') {
                    const partialYear = ${JSON.stringify(mode)} === 'hard' && question.id === 'h-bitva';
                    $('answer-input').value = partialYear ? '1618' : question.acceptedAnswers[0];
                    if (partialYear) partials++;
                    $('answers').requestSubmit();
                } else $('answers').querySelectorAll('button')[question.answer].click();
                const partialYear = ${JSON.stringify(mode)} === 'hard' && question.id === 'h-bitva';
                total += partialYear ? 15 : { easy: 10, medium: 20, hard: 30 }[question.difficulty] * 2;
                if (partialYear && (!$('feedback').textContent.includes('polovinu bodů') ||
                    $('feedback').textContent.includes('bonus +'))) throw new Error('Incorrect history partial feedback/bonus');
                if ($('score').textContent !== 'Skóre: ' + total + ' b' ||
                    $('quiz-progress').value !== index + 1) throw new Error('Wrong history quiz status');
                if ($('feedback').hidden || $('next').hidden) throw new Error('Missing feedback');
                const feedback = $('feedback').textContent;
                $('answers').dispatchEvent(new Event('submit', { cancelable: true }));
                if ($('feedback').textContent !== feedback) throw new Error('Duplicate submission changed feedback');
                window.answerClock += 30000;
                $('next').click();
            }
            const record = JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1);
            if (record.answerDurationMs !== ${count} * 2000 || record.duration !== ${count} * 2) throw new Error('History duration includes feedback');
            if ($('results-title').getBoundingClientRect().top < $('page-header').getBoundingClientRect().bottom) throw new Error('History completion covered by sticky header');
            if (!$('leaderboard').open || !$('leaderboard-rank').textContent.includes('místo')) throw new Error('Rank not in expanded leaderboard');
            $('leaderboard').querySelector('summary').click();
            if ($('leaderboard').open) throw new Error('Completion leaderboard cannot be collapsed');
            $('leaderboard').querySelector('summary').click();
            const result = {
                bonus, partials, summary: $('summary').children.length,
                grade: $('grade').textContent, visible: !$('results').hidden,
                saved: JSON.parse(sessionStorage.getItem('history-tutor:v1:' + lesson.id)).at(-1).total,
                fits: document.documentElement.scrollWidth <= innerWidth
            };
            $('restart').click();
            if ($('leaderboard').open) throw new Error('Restart leaves leaderboard expanded');
            return result;
        })()`);
        assert.equal(result.bonus, true);
        assert.equal(result.summary, count);
        assert.equal(result.visible, true);
        assert.equal(result.fits, true);
        const base = maximum - (mode === 'hard' ? 15 : 0);
        const bonus = maximum - (mode === 'hard' ? 30 : 0);
        assert.equal(result.partials, mode === 'hard' ? 1 : 0);
        assert.equal(result.saved, base + bonus);
        assert.match(result.grade, new RegExp(`základ ${base}/${maximum}, bonus ${bonus}.*Známka: 1`));
    }
}

module.exports = { checkHistoryQuiz };
