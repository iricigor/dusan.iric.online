'use strict';

const tutorPrinting = {
    selectPractice(bank, difficulty, count, random = Math.random) {
        if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new Error('Unknown practice difficulty');
        const pool = bank.filter(question => question.difficulty === difficulty);
        if (!Number.isSafeInteger(count) || count < 1 || count > pool.length) {
            throw new Error(`Practice count must be between 1 and ${pool.length}`);
        }
        const shuffle = typeof module !== 'undefined' && module.exports
            ? require('../runtime.js').shuffle : tutorQuiz.shuffle;
        return shuffle(pool, random).slice(0, count);
    }
};

if (typeof module !== 'undefined') module.exports = tutorPrinting;

function initializeTutorPrinting(lesson, subject, { $, node }, quiz) {
    const dialog = $('print-dialog');
    const bank = lesson.exercises || lesson.questions;
    let kind;
    let selected = [];
    let fromQuiz = false;
    let trigger;

    function renderSheet() {
        const sheet = node('div', undefined, 'print-document');
        sheet.append(node('h1', lesson.topic), node('h2', kind === 'test' ? 'Test' : 'Pracovní list'),
            node('p', 'Jméno: ______________________________    Datum: ______________'),
            node('p', 'Piš odpovědi do volného místa. U výběru zakroužkuj jednu možnost.'));
        selected.forEach((question, index) => {
            const article = node('article', undefined, 'print-question');
            article.dataset.questionId = question.id;
            const heading = node('div', undefined, 'print-question-heading');
            heading.append(node('h3', `${index + 1}. ${question.prompt}`));
            if (question.options) {
                const options = node('ol', undefined, 'print-options');
                question.options.forEach(option => options.append(node('li', option)));
                heading.append(options);
                article.append(heading, node('div', undefined, 'print-working'));
            } else {
                article.append(heading);
                subject.fields(question, index).forEach(field => {
                    const part = node('div', undefined, 'print-part');
                    part.append(node('p', field.label), node('div', undefined, 'print-working'));
                    article.append(part);
                });
            }
            sheet.append(article);
        });
        if ($('print-key').checked) {
            const key = node('section', undefined, 'print-answer-key');
            key.append(node('h2', 'Klíč s odpověďmi'));
            selected.forEach((question, index) => {
                const item = node('article', undefined, 'print-key-question');
                item.dataset.questionId = question.id;
                item.append(node('h3', `${index + 1}. ${question.prompt}`));
                subject.printAnswers(question, index).forEach(answer => {
                    const part = node('div', undefined, 'print-key-part');
                    part.append(node('p', `${answer.label}: ${answer.answer}`));
                    if (answer.solution) part.append(node('p', answer.solution));
                    item.append(part);
                });
                item.append(node('p', question.explanation));
                key.append(item);
            });
            sheet.append(key);
        }
        $('print-sheet').replaceChildren(sheet);
        $('print-preview').replaceChildren(sheet.cloneNode(true));
    }

    function prepare(reselect = true) {
        $('print-error').hidden = true;
        $('print-now').disabled = false;
        $('print-sheet').replaceChildren();
        $('print-preview').replaceChildren();
        if (kind === 'practice') {
            const difficulty = $('practice-difficulty').value;
            const available = bank.filter(question => question.difficulty === difficulty).length;
            $('practice-count').max = String(available);
            $('practice-available').textContent = `V této obtížnosti je k dispozici ${available} úloh.`;
            const count = Number($('practice-count').value);
            if (!Number.isSafeInteger(count) || count < 1 || count > available) {
                selected = [];
                $('print-error').textContent = available
                    ? `Zvol celý počet úloh od 1 do ${available}. Další úlohy v této obtížnosti nejsou k dispozici.`
                    : 'V této obtížnosti nejsou žádné úlohy. Zvol jinou obtížnost.';
                $('print-error').hidden = false;
                $('print-now').disabled = true;
                $('practice-count').setAttribute('aria-invalid', 'true');
                return;
            }
            $('practice-count').removeAttribute('aria-invalid');
            if (reselect || !selected.length) selected = tutorPrinting.selectPractice(bank, difficulty, count);
        } else if (reselect && !fromQuiz) {
            selected = subject.select(lesson, $('print-mode').value);
        }
        renderSheet();
    }

    function open(type, control) {
        kind = type;
        trigger = control;
        selected = type === 'test' ? quiz.selectedQuestions() : [];
        fromQuiz = selected.length > 0;
        $('print-title').textContent = type === 'test' ? 'Vytisknout test' : 'Pracovní list';
        $('print-mode-row').hidden = type !== 'test' || fromQuiz;
        $('practice-settings').hidden = type !== 'practice';
        $('print-selection').textContent = fromQuiz
            ? 'Test obsahuje stejné úlohy ve stejném pořadí jako vybraný online kvíz.'
            : type === 'test' ? 'Vyber test. Online kvíz se tím nespustí ani nezmění.'
                : 'Úlohy vybereme bez opakování z banky této lekce.';
        quiz.pauseForPrint();
        dialog.showModal();
        update();
    }

    function update(reselect = true) {
        try {
            prepare(reselect);
        } catch (error) {
            console.error('Tutor: cannot prepare printable sheet.', error);
            $('print-sheet').replaceChildren();
            $('print-preview').replaceChildren();
            $('print-error').textContent = 'List se nepodařilo připravit. Zkus jiný výběr nebo list znovu otevři.';
            $('print-error').hidden = false;
            $('print-now').disabled = true;
        }
    }

    $('print-test').addEventListener('click', () => open('test', $('print-test')));
    $('practice-sheet').addEventListener('click', () => open('practice', $('practice-sheet')));
    ['print-mode', 'practice-difficulty', 'practice-count'].forEach(id =>
        $(id).addEventListener('change', () => update()));
    $('print-key').addEventListener('change', () => update(false));
    $('print-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        $('print-sheet').replaceChildren();
        $('print-preview').replaceChildren();
        quiz.resumeAfterPrint();
        trigger.focus();
    });
    $('print-now').addEventListener('click', () => {
        if ($('print-now').disabled) return;
        try {
            window.print();
        } catch (error) {
            console.error('Tutor: cannot print sheet.', error);
            $('print-error').textContent = 'Tisk se nepodařilo otevřít. Zkus to znovu.';
            $('print-error').hidden = false;
        }
    });
}
