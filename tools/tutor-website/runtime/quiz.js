'use strict';

function initializeTutorQuiz(lesson, subject, context) {
    const { $, node, button, points, focusContent, closeQuizTools } = context;
    subject.rules.forEach(rule => $('scoring').append(node('li', rule)));
    if (subject.modeCounts) document.querySelectorAll('[data-mode]').forEach(control => {
        const count = subject.modeCounts[control.dataset.mode];
        control.querySelector('.mode-count').textContent = `${count} ${count < 5 ? 'úlohy' : 'úloh'}`;
    });
    $('answer-help').textContent = subject.answerHelp || '';
    $('answer-help').hidden = !subject.answerHelp;
    $('quiz-export').addEventListener('click', () => {
        $('export-error').hidden = true;
        let url;
        let link;
        try {
            const json = JSON.stringify(lesson, null, 2) + '\n';
            url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
            link = node('a');
            link.href = url;
            link.download = `${lesson.id}-lekce.json`;
            document.body.append(link);
            link.click();
            closeQuizTools(true);
        } catch (error) {
            console.error('Tutor: cannot export lesson.', error);
            $('export-error').textContent = 'JSON se nepodařilo stáhnout. Zkus to znovu.';
            $('export-error').hidden = false;
        } finally {
            if (link) link.remove();
            if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    });
    const results = initializeTutorResults(lesson, subject, context);
    let quiz = null;
    let timer = null;
    let printPausedAt = null;
    const warnBeforeUnload = event => {
        if (!quiz || quiz.finished) return;
        event.preventDefault();
        event.returnValue = '';
    };
    function abandonQuiz() {
        pauseAnswerClock();
        clearInterval(timer);
        timer = null;
        quiz = null;
        window.removeEventListener('beforeunload', warnBeforeUnload);
        $('game').hidden = true;
        $('results').hidden = true;
        $('setup').hidden = false;
        $('answers').replaceChildren();
        $('feedback').replaceChildren();
        $('feedback').hidden = true;
        $('next').hidden = true;
        $('score').textContent = 'Skóre: 0 b';
        $('quiz-progress').value = 0;
        $('leaderboard').hidden = false;
        $('leaderboard').open = false;
    }
    function pauseAnswerClock() {
        if (quiz && quiz.answerStarted !== null) {
            quiz.questionElapsedMs += Math.max(0, performance.now() - quiz.answerStarted);
            quiz.answerStarted = null;
        }
    }
    function resumeAnswerClock() {
        if (quiz && !quiz.locked && !quiz.finished && !$('quiz').hidden && !document.hidden &&
            !$('quiz-leave-dialog').open && quiz.answerStarted === null) {
            if (printPausedAt !== null) return;
            quiz.answerStarted = performance.now();
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAnswerClock();
        else resumeAnswerClock();
    });
    function finish() {
        quiz.finished = true;
        window.removeEventListener('beforeunload', warnBeforeUnload);
        clearInterval(timer);
        $('game').hidden = true;
        $('results').hidden = false;
        const result = subject.result(quiz.answers, quiz.questions);
        $('grade').textContent = result.text;
        const answerDurationMs = Math.round(quiz.answerDurationMs);
        $('answer-duration').textContent = `Doba odpovídání: ${tutorQuiz.formatDuration(answerDurationMs)}. Čtení vysvětlení se nepočítá.`;
        $('summary').replaceChildren();
        quiz.answers.forEach((answer, index) => {
            const item = node('li');
            item.append(node('strong', answer.question.prompt));
            subject.feedback(context, item, answer, index + 1);
            $('summary').append(item);
        });
        results.save(quiz.name, quiz.mode, result, answerDurationMs);
        $('leaderboard').open = true;
        $('leaderboard').hidden = false;
        focusContent($('results-title'));
    }
    function submit(values) {
        if (!quiz || quiz.locked || quiz.finished || $('quiz-leave-dialog').open || printPausedAt !== null) return;
        if (!subject.acceptSubmission(values)) {
            $('feedback').textContent = 'Nejdřív napiš odpověď.';
            $('feedback').hidden = false;
            return;
        }
        pauseAnswerClock();
        quiz.locked = true;
        quiz.answerDurationMs += quiz.questionElapsedMs;
        clearInterval(timer);
        const question = quiz.questions[quiz.index];
        const elapsed = subject.speedBonus ? performance.now() - quiz.questionStarted : 0;
        const answer = { question, values, score: subject.score(question, values, elapsed) };
        quiz.answers.push(answer);
        $('score').textContent = `Skóre: ${points(quiz.answers.reduce((sum, item) => sum + item.score.total, 0))} b`;
        $('quiz-progress').value = quiz.answers.length;
        $('answers').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
        $('feedback').replaceChildren();
        subject.feedback(context, $('feedback'), answer, quiz.index + 1);
        const full = answer.score.total === subject.maximum([question]) ||
            answer.score.fraction === 1;
        $('feedback').className = full ? 'success' : answer.score.total > 0 ? 'encouragement' : 'try-again';
        $('feedback').hidden = false;
        $('next').textContent = quiz.index === quiz.questions.length - 1 ? 'Zobrazit výsledek' : 'Další úloha';
        $('next').hidden = false;
        $('next').focus();
    }
    function showQuestion() {
        clearInterval(timer);
        quiz.locked = false;
        quiz.questionElapsedMs = 0;
        quiz.answerStarted = null;
        const question = quiz.questions[quiz.index];
        $('progress').textContent = `Úloha ${quiz.index + 1} / ${quiz.questions.length} · nejvýše ${subject.maximum([question])} b`;
        $('quiz-progress').max = quiz.questions.length;
        $('quiz-progress').value = quiz.answers.length;
        $('question').replaceChildren(node('span', question.prompt, 'question-enter'));
        $('question-icon').textContent = question.icon || (subject.speedBonus ? '🏰' : '📐');
        $('difficulty').textContent = (subject.difficultyLabels ||
            { easy: 'Lehký začátek', medium: 'Další krok', hard: 'Závěrečná výzva' })[question.difficulty];
        $('difficulty').dataset.level = question.difficulty;
        $('answers').replaceChildren();
        $('feedback').hidden = true;
        $('next').hidden = true;
        if (question.options) {
            question.options.forEach((option, index) => $('answers').append(button(option, () => submit([index]))));
        } else {
            subject.fields(question, quiz.index).forEach(field => {
                const label = node('label', field.label);
                label.htmlFor = field.id;
                const input = node('input');
                input.type = 'text';
                input.id = field.id;
                input.autocomplete = 'off';
                input.maxLength = 80;
                input.spellcheck = false;
                if (field.inputMode) input.inputMode = field.inputMode;
                if (subject.answerHelp) input.setAttribute('aria-describedby', 'answer-help');
                $('answers').append(label, input);
            });
            const send = node('button', 'Odpovědět');
            send.type = 'submit';
            $('answers').append(send);
        }
        if (subject.speedBonus) {
            quiz.questionStarted = performance.now();
            const update = () => {
                const elapsed = (printPausedAt ?? performance.now()) - quiz.questionStarted;
                const remaining = Math.max(0, 1 - elapsed / 15000);
                $('bonus').style.opacity = String(Math.max(0, 1 - elapsed / 12000));
                $('bonus-bar').style.transform = `scaleX(${remaining})`;
                if (!remaining) clearInterval(timer);
            };
            update();
            timer = setInterval(update, 100);
        }
        focusContent($('question'));
        resumeAnswerClock();
    }
    $('answers').addEventListener('submit', event => {
        event.preventDefault();
        if (quiz && !quiz.questions[quiz.index]?.options) {
            submit([...$('answers').querySelectorAll('input')].map(input => input.value.trim()));
        }
    });
    document.querySelectorAll('[data-mode]').forEach(control => control.addEventListener('click', () => {
        if ($('quiz-leave-dialog').open || printPausedAt !== null) return;
        if (quiz && !quiz.finished && $('setup').hidden) return;
        const name = $('player').value.trim();
        if ((name.match(/\p{L}/gu) || []).length < 3 || name.length > 60) {
            $('name-error').textContent = 'Napiš jméno nebo přezdívku s alespoň třemi písmeny, nejvýše 60 znaků.';
            $('player').setAttribute('aria-invalid', 'true');
            $('player').focus();
            return;
        }
        $('name-error').textContent = '';
        $('player').removeAttribute('aria-invalid');
        quiz = {
            name, mode: control.dataset.mode, questions: subject.select(lesson, control.dataset.mode),
            index: 0, answers: [], locked: false, finished: false,
            answerDurationMs: 0, questionElapsedMs: 0, answerStarted: null
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        $('quiz-tools').open = false;
        $('setup').hidden = true;
        $('results').hidden = true;
        $('leaderboard').hidden = true;
        $('game').hidden = false;
        $('score').textContent = 'Skóre: 0 b';
        showQuestion();
    }));
    $('next').addEventListener('click', () => {
        if (!quiz || !quiz.locked || quiz.finished || $('quiz-leave-dialog').open || printPausedAt !== null) return;
        quiz.index++;
        if (quiz.index === quiz.questions.length) finish();
        else showQuestion();
    });
    $('restart').addEventListener('click', () => {
        if (!quiz?.finished) return;
        $('results').hidden = true;
        $('setup').hidden = false;
        $('leaderboard').open = false;
        $('player').focus();
    });
    results.renderLeaderboard();
    return {
        isActive: () => !!quiz && !quiz.finished, pauseAnswerClock, resumeAnswerClock, abandonQuiz,
        selectedQuestions: () => quiz ? [...quiz.questions] : [],
        pauseForPrint() {
            pauseAnswerClock();
            printPausedAt = performance.now();
        },
        resumeAfterPrint() {
            if (quiz && subject.speedBonus && printPausedAt !== null) {
                quiz.questionStarted += Math.max(0, performance.now() - printPausedAt);
            }
            printPausedAt = null;
            resumeAnswerClock();
        }
    };
}
