'use strict';

function initializeTutor(lesson, subject) {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const button = (text, action, className) => {
        const element = node('button', text, className);
        element.type = 'button';
        element.addEventListener('click', action);
        return element;
    };
    const disclose = (label, ...content) => {
        const details = node('details');
        details.append(node('summary', label), ...content);
        return details;
    };
    const definition = (title, text) => {
        $('definition-title').textContent = title;
        $('definition-text').textContent = text;
        $('definition').showModal();
    };
    const forms = new Map();
    lesson.glossary.forEach(entry => [entry.term, ...entry.forms].forEach(form => forms.set(form.toLocaleLowerCase('cs'), entry)));
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...forms.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const paragraph = text => {
        const element = node('p');
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            element.append(document.createTextNode(text.slice(offset, match.index)));
            const entry = forms.get(match[0].toLocaleLowerCase('cs'));
            element.append(button(match[0], () => definition(entry.term, entry.definition), 'term'));
            offset = match.index + match[0].length;
        }
        element.append(document.createTextNode(text.slice(offset)));
        return element;
    };
    const context = { $, node, button, disclose, paragraph };
    $('topic').textContent = lesson.topic;
    $('audience').textContent = lesson.audience;
    if (lesson.review !== undefined) {
        $('original-review').hidden = false;
        $('review').textContent = lesson.review;
        lesson.sources.forEach(source => {
            const item = node('li');
            const link = node('a', source.title);
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            item.append(link);
            $('sources').append(item);
        });
    }
    lesson.original.forEach((section, index) => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', section.heading));
        const text = node('p', undefined, 'original-text');
        const corrections = (lesson.corrections || []).filter(correction => correction.section === index)
            .sort((a, b) => section.text.indexOf(a.quote) - section.text.indexOf(b.quote));
        let offset = 0;
        for (const correction of corrections) {
            const start = section.text.indexOf(correction.quote);
            text.append(document.createTextNode(section.text.slice(offset, start)));
            const mark = button(correction.quote, () => definition('Historická oprava', correction.explanation), 'correction');
            mark.title = correction.explanation;
            text.append(mark);
            offset = start + correction.quote.length;
        }
        text.append(document.createTextNode(section.text.slice(offset)));
        article.append(text);
        $('original-content').append(article);
    });
    subject.renderLearning(context, lesson);
    lesson.glossary.forEach(entry => $('glossary').append(button(entry.term, () => definition(entry.term, entry.definition))));
    document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(other => {
            const active = other === tab;
            other.setAttribute('aria-pressed', String(active));
            $(other.dataset.tab).hidden = !active;
        });
    }));
    $('theme').addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme === 'dark' ||
            (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    });
    $('scoring').textContent = subject.rules;
    $('answer-help').textContent = subject.answerHelp || '';
    $('answer-help').hidden = !subject.answerHelp;
    const storageKey = `${subject.storagePrefix}:${lesson.id}`;
    let records = [];
    let storageReadable = true;
    let currentRunId = null;
    let quiz = null;
    let timer = null;
    const warnStorage = message => {
        $('storage-warning').hidden = false;
        $('storage-warning').textContent = message;
    };
    try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(stored) || stored.some(row =>
            !row || typeof row.id !== 'string' || typeof row.name !== 'string' ||
            (row.name.match(/\p{L}/gu) || []).length < 3 || row.name.length > 60 ||
            typeof row.time !== 'string' || !subject.validRecord(row))) {
            throw new Error('Invalid tutor session results');
        }
        records = stored;
    } catch (error) {
        storageReadable = false;
        console.warn('Tutor: cannot read session results.', error);
        warnStorage('Uložené výsledky nelze načíst. Nové výsledky zůstanou jen v této stránce; původní úložiště nepřepíšeme.');
    }
    const points = value => String(value).replace('.', ',');
    function renderLeaderboard() {
        const container = $('leaderboard-content');
        container.replaceChildren();
        if (!records.length) {
            container.append(node('p', 'Zatím žádné výsledky.'));
            return;
        }
        const table = node('table');
        const head = node('thead');
        const labels = node('tr');
        ['Hráč', 'Čas', ...(subject.speedBonus ? ['Délka'] : []), 'Obtížnost', 'Body', 'Známka'].forEach(label => {
            const cell = node('th', label);
            cell.scope = 'col';
            labels.append(cell);
        });
        head.append(labels);
        const body = node('tbody');
        [...records].sort(subject.compareResults).forEach(record => {
            const row = node('tr');
            if (record.id === currentRunId) {
                row.className = 'current';
                row.setAttribute('aria-current', 'true');
            }
            [record.name, record.time, ...(subject.speedBonus ? [`${record.duration} s`] : []),
                { easy: 'Lehká', medium: 'Střední', hard: 'Těžká' }[record.mode], `${points(record.total)} b`, String(record.grade)]
                .forEach(value => row.append(node('td', value)));
            body.append(row);
        });
        table.append(head, body);
        container.append(table);
    }
    function finish() {
        quiz.finished = true;
        clearInterval(timer);
        $('game').hidden = true;
        $('results').hidden = false;
        const result = subject.result(quiz.answers, quiz.questions);
        $('grade').textContent = result.text;
        $('summary').replaceChildren();
        quiz.answers.forEach((answer, index) => {
            const item = node('li');
            item.append(node('strong', answer.question.prompt));
            subject.feedback(context, item, answer, index + 1);
            $('summary').append(item);
        });
        currentRunId = crypto.randomUUID();
        records.push({
            id: currentRunId, name: quiz.name, mode: quiz.mode, total: result.total, grade: result.grade,
            time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
            ...(subject.speedBonus ? { duration: Math.round((performance.now() - quiz.started) / 1000) } : { maximum: result.maximum })
        });
        if (storageReadable) {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(records));
                $('storage-warning').hidden = true;
                $('storage-warning').textContent = '';
            } catch (error) {
                console.warn('Tutor: cannot save session results.', error);
                warnStorage('Výsledky se nepodařilo uložit. Nové výsledky jsou vidět jen do obnovení této stránky.');
            }
        }
        renderLeaderboard();
        $('leaderboard').hidden = false;
        $('results-title').focus();
    }
    function submit(values) {
        if (!quiz || quiz.locked || quiz.finished) return;
        if (!subject.acceptSubmission(values)) {
            $('feedback').textContent = 'Nejdřív napiš odpověď.';
            $('feedback').hidden = false;
            return;
        }
        quiz.locked = true;
        clearInterval(timer);
        const question = quiz.questions[quiz.index];
        const elapsed = subject.speedBonus ? performance.now() - quiz.questionStarted : 0;
        const answer = { question, values, score: subject.score(question, values, elapsed) };
        quiz.answers.push(answer);
        $('answers').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
        $('feedback').replaceChildren();
        subject.feedback(context, $('feedback'), answer, quiz.index + 1);
        $('feedback').hidden = false;
        $('next').textContent = quiz.index === quiz.questions.length - 1 ? 'Zobrazit výsledek' : 'Další úloha';
        $('next').hidden = false;
        $('next').focus();
    }
    function showQuestion() {
        clearInterval(timer);
        quiz.locked = false;
        const question = quiz.questions[quiz.index];
        $('progress').textContent = `Úloha ${quiz.index + 1} / ${quiz.questions.length} · nejvýše ${subject.maximum([question])} b`;
        $('question').textContent = question.prompt;
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
                const remaining = Math.max(0, Math.ceil((15000 - (performance.now() - quiz.questionStarted)) / 1000));
                $('bonus').textContent = remaining ? `2× bonus: ${remaining} s` : 'Bonus skončil. Na odpověď máš stále čas.';
                if (!remaining) clearInterval(timer);
            };
            update();
            timer = setInterval(update, 1000);
        }
        $('question').focus();
    }
    $('answers').addEventListener('submit', event => {
        event.preventDefault();
        if (quiz && !quiz.questions[quiz.index]?.options) {
            submit([...$('answers').querySelectorAll('input')].map(input => input.value.trim()));
        }
    });
    document.querySelectorAll('[data-mode]').forEach(control => control.addEventListener('click', () => {
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
            ...(subject.speedBonus ? { started: performance.now() } : {})
        };
        $('setup').hidden = true;
        $('results').hidden = true;
        $('leaderboard').hidden = true;
        $('game').hidden = false;
        showQuestion();
    }));
    $('next').addEventListener('click', () => {
        if (!quiz || !quiz.locked || quiz.finished) return;
        quiz.index++;
        if (quiz.index === quiz.questions.length) finish();
        else showQuestion();
    });
    $('restart').addEventListener('click', () => {
        if (!quiz?.finished) return;
        $('results').hidden = true;
        $('setup').hidden = false;
        $('player').focus();
    });
    renderLeaderboard();
}
