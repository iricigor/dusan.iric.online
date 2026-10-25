'use strict';

const MODES = { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] };
const POINTS = { easy: 10, medium: 20, hard: 30 };
const MODE_NAMES = { easy: 'Lehká', medium: 'Střední', hard: 'Těžká' };

function normalizeAnswer(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('cs').replace(/y/g, 'i').trim().replace(/\s+/g, ' ');
}

function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function selectQuestions(questions, mode, random = Math.random) {
    if (!Object.hasOwn(MODES, mode)) throw new Error(`Unknown quiz mode: ${mode}`);
    const selected = [];
    ['easy', 'medium', 'hard'].forEach((level, index) => {
        const pool = questions.filter(q => q.difficulty === level);
        const count = MODES[mode][index];
        if (pool.length < count) throw new Error(`Not enough ${level} questions`);
        if (mode === 'hard' && level === 'hard') {
            const years = pool.filter(q => q.year);
            if (!years.length) throw new Error('Hard mode needs a year question');
            const year = shuffle(years, random)[0];
            selected.push(year, ...shuffle(pool.filter(q => q.id !== year.id), random).slice(0, count - 1));
        } else {
            selected.push(...shuffle(pool, random).slice(0, count));
        }
    });
    return shuffle(selected, random);
}

function scoreAnswer(question, answer, elapsedMs) {
    let fraction = 0;
    if (question.type !== 'text') {
        fraction = answer === question.answer ? 1 : 0;
    } else if (question.year) {
        if (/^[0-9]{1,4}$/.test(answer.trim())) {
            const difference = Math.abs(Number(answer.trim()) - Number(question.acceptedAnswers[0]));
            fraction = difference === 0 ? 1 : difference < 10 ? 0.5 : 0;
        }
    } else {
        fraction = question.acceptedAnswers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer)) ? 1 : 0;
    }
    const base = POINTS[question.difficulty] * fraction;
    const bonus = fraction === 1 && elapsedMs >= 0 && elapsedMs < 15000 ? base : 0;
    return { fraction, base, bonus, total: base + bonus };
}

function grade(base, maximum) {
    const percentage = base / maximum;
    return percentage >= .8 ? 1 : percentage >= .6 ? 2 : percentage >= .4 ? 3 : percentage >= .2 ? 4 : 5;
}

function compareResults(a, b) {
    return b.total - a.total || a.duration - b.duration;
}

function initialize(lesson) {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => {
        const result = document.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    };
    const safeUrl = raw => {
        try {
            const parsed = new URL(String(raw), document.baseURI);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : 'about:blank';
        } catch (_) {
            return 'about:blank';
        }
    };
    const button = (text, action, className) => {
        const result = node('button', text, className);
        result.type = 'button';
        result.addEventListener('click', action);
        return result;
    };
    const storageKey = `history-tutor:v1:${lesson.id}`;
    let quiz = null;
    let timer = null;
    let currentRunId = null;
    let records = [];
    const warnStorage = message => {
        $('storage-warning').textContent = message;
        $('storage-warning').hidden = false;
    };
    try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(stored) || stored.some(row =>
            !row || typeof row.id !== 'string' || typeof row.name !== 'string' ||
            !Object.hasOwn(MODES, row.mode) || !Number.isFinite(row.total) || row.total < 0 ||
            !Number.isFinite(row.duration) || row.duration < 0 || !Number.isInteger(row.grade) ||
            row.grade < 1 || row.grade > 5 || typeof row.time !== 'string')) {
            throw new Error('Invalid leaderboard data');
        }
        records = stored;
    } catch (error) {
        console.warn('History tutor: cannot read session results.', error);
        warnStorage('Uložené výsledky nelze načíst. Nové výsledky se zatím zobrazí jen v této stránce.');
    }
    function definition(title, text) {
        $('definition-title').textContent = title;
        $('definition-text').textContent = text;
        $('definition').showModal();
    }
    const forms = new Map();
    lesson.glossary.forEach(entry => [entry.term, ...entry.forms].forEach(form => forms.set(form.toLocaleLowerCase('cs'), entry)));
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const termPattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...forms.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    function appendTerms(parent, text) {
        let offset = 0;
        for (const match of text.matchAll(termPattern)) {
            parent.append(document.createTextNode(text.slice(offset, match.index)));
            const entry = forms.get(match[0].toLocaleLowerCase('cs'));
            parent.append(button(match[0], () => definition(entry.term, entry.definition), 'term'));
            offset = match.index + match[0].length;
        }
        parent.append(document.createTextNode(text.slice(offset)));
    }
    $('topic').textContent = lesson.topic;
    $('audience').textContent = lesson.audience;
    $('review').textContent = lesson.review;
    lesson.sources.forEach(source => {
        const item = node('li');
        const link = node('a', source.title);
        link.href = safeUrl(source.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        $('sources').append(item);
    });
    lesson.original.forEach((section, index) => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', section.heading));
        const paragraph = node('p', undefined, 'original-text');
        const corrections = lesson.corrections.filter(c => c.section === index)
            .sort((a, b) => section.text.indexOf(a.quote) - section.text.indexOf(b.quote));
        let offset = 0;
        for (const correction of corrections) {
            const start = section.text.indexOf(correction.quote);
            paragraph.append(document.createTextNode(section.text.slice(offset, start)));
            const mark = button(correction.quote, () => definition('Historická oprava', correction.explanation), 'correction');
            mark.title = correction.explanation;
            paragraph.append(mark);
            offset = start + correction.quote.length;
        }
        paragraph.append(document.createTextNode(section.text.slice(offset)));
        article.append(paragraph);
        $('original-content').append(article);
    });
    lesson.chunks.forEach(chunk => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', chunk.heading));
        const paragraph = node('p');
        appendTerms(paragraph, chunk.sentences.join(' '));
        const hint = node('details');
        hint.append(node('summary', 'Nápověda: jednodušeji'), node('p', chunk.explanation));
        article.append(paragraph, hint);
        $('chunks').append(article);
    });
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
    function renderLeaderboard() {
        const container = $('leaderboard-content');
        container.replaceChildren();
        if (!records.length) {
            container.append(node('p', 'Zatím žádné výsledky. Zkus první kvíz!'));
            return;
        }
        const table = node('table');
        const head = node('thead');
        const labels = node('tr');
        ['Hráč', 'Čas', 'Délka', 'Obtížnost', 'Body', 'Známka'].forEach(label => {
            const cell = node('th', label);
            cell.scope = 'col';
            labels.append(cell);
        });
        head.append(labels);
        const body = node('tbody');
        [...records].sort(compareResults).forEach(record => {
            const row = node('tr');
            if (record.id === currentRunId) {
                row.className = 'current';
                row.setAttribute('aria-current', 'true');
            }
            [record.name, record.time, `${record.duration} s`, MODE_NAMES[record.mode], `${record.total} b`, String(record.grade)]
                .forEach(value => row.append(node('td', value)));
            body.append(row);
        });
        table.append(head, body);
        container.append(table);
    }
    function finish() {
        clearInterval(timer);
        $('game').hidden = true;
        $('results').hidden = false;
        const base = quiz.answers.reduce((sum, answer) => sum + answer.score.base, 0);
        const bonus = quiz.answers.reduce((sum, answer) => sum + answer.score.bonus, 0);
        const maximum = quiz.questions.reduce((sum, question) => sum + POINTS[question.difficulty], 0);
        const mark = grade(base, maximum);
        $('summary').replaceChildren();
        quiz.answers.forEach(answer => {
            const item = node('li');
            item.append(node('strong', answer.question.prompt));
            const result = answer.score.fraction === 1 ? 'Správně' : answer.score.fraction > 0 ? 'Částečně správně' : 'Nesprávně';
            item.append(node('p', `${result}. Tvoje odpověď: ${answer.display}`, answer.score.fraction === 1 ? 'correct' : 'incorrect'));
            item.append(node('p', `Správná odpověď: ${answer.correct}`));
            item.append(node('p', `${answer.score.total} b${answer.score.bonus ? ` (bonus +${answer.score.bonus} b)` : ''}. ${answer.question.explanation}`));
            $('summary').append(item);
        });
        $('grade').textContent = `Body: ${base + bonus} (základ ${base}/${maximum}, bonus ${bonus}). Známka: ${mark}`;
        currentRunId = crypto.randomUUID();
        records.push({
            id: currentRunId, name: quiz.name, mode: quiz.mode, total: base + bonus,
            grade: mark, duration: Math.round((performance.now() - quiz.started) / 1000),
            time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
        });
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(records));
        } catch (error) {
            console.warn('History tutor: cannot save session results.', error);
            warnStorage('Výsledky se nepodařilo uložit. Jsou vidět jen do obnovení této stránky.');
        }
        renderLeaderboard();
        $('leaderboard').hidden = false;
        $('results-title').focus();
    }
    function submit(answer) {
        if (quiz.locked) return;
        const question = quiz.questions[quiz.index];
        if (typeof answer === 'string' && !answer.trim()) {
            $('feedback').textContent = 'Nejdřív napiš odpověď.';
            $('feedback').hidden = false;
            return;
        }
        quiz.locked = true;
        clearInterval(timer);
        const score = scoreAnswer(question, answer, performance.now() - quiz.questionStarted);
        const correct = question.type === 'text' ? question.acceptedAnswers[0] : question.options[question.answer];
        const display = question.type === 'text' ? answer : question.options[answer];
        quiz.answers.push({ question, display, correct, score });
        $('answers').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
        const label = score.fraction === 1 ? 'Správně!' : score.fraction > 0 ? 'Blízko! Máš polovinu bodů.' : 'Tentokrát ne. Zkus to příště!';
        $('feedback').textContent = `${label} Správná odpověď: ${correct}. ${question.explanation} Body: ${score.total}${score.bonus ? ` (bonus +${score.bonus})` : ''}.`;
        $('feedback').className = score.fraction > 0 ? 'correct success' : 'incorrect failure';
        $('feedback').hidden = false;
        $('next').textContent = quiz.index === quiz.questions.length - 1 ? 'Zobrazit výsledek' : 'Další otázka';
        $('next').hidden = false;
        $('next').focus();
    }
    function showQuestion() {
        clearInterval(timer);
        quiz.locked = false;
        const question = quiz.questions[quiz.index];
        $('progress').textContent = `Otázka ${quiz.index + 1} / ${quiz.questions.length} · ${POINTS[question.difficulty]} b`;
        $('question').textContent = question.prompt;
        $('feedback').hidden = true;
        $('next').hidden = true;
        $('answers').replaceChildren();
        if (question.type === 'text') {
            const label = node('label', 'Tvoje odpověď');
            label.htmlFor = 'answer-input';
            const input = node('input');
            input.id = 'answer-input';
            input.type = 'text';
            input.autocomplete = 'off';
            if (question.year) input.inputMode = 'numeric';
            const send = node('button', 'Odpovědět');
            send.type = 'submit';
            $('answers').append(label, input, send);
        } else {
            question.options.forEach((option, index) => $('answers').append(button(option, () => submit(index))));
        }
        quiz.questionStarted = performance.now();
        const update = () => {
            const remaining = Math.max(0, Math.ceil((15000 - (performance.now() - quiz.questionStarted)) / 1000));
            $('bonus').textContent = remaining ? `2× bonus: ${remaining} s` : 'Bonus skončil. Na odpověď máš stále čas.';
            if (!remaining) clearInterval(timer);
        };
        update();
        timer = setInterval(update, 1000);
        $('question').focus();
    }
    $('answers').addEventListener('submit', event => {
        event.preventDefault();
        if (quiz && !quiz.locked && $('answer-input')) submit($('answer-input').value);
    });
    document.querySelectorAll('[data-mode]').forEach(control => control.addEventListener('click', () => {
        const name = $('player').value.trim();
        if ((name.match(/\p{L}/gu) || []).length < 3) {
            $('name-error').textContent = 'Napiš jméno s alespoň třemi písmeny.';
            $('player').setAttribute('aria-invalid', 'true');
            $('player').focus();
            return;
        }
        $('name-error').textContent = '';
        $('player').removeAttribute('aria-invalid');
        quiz = {
            name, mode: control.dataset.mode,
            questions: selectQuestions(lesson.questions, control.dataset.mode),
            index: 0, answers: [], started: performance.now(), locked: false
        };
        $('setup').hidden = true;
        $('results').hidden = true;
        $('leaderboard').hidden = true;
        $('game').hidden = false;
        showQuestion();
    }));
    $('next').addEventListener('click', () => {
        if (!quiz.locked) return;
        quiz.index++;
        if (quiz.index === quiz.questions.length) finish();
        else showQuestion();
    });
    $('restart').addEventListener('click', () => {
        $('results').hidden = true;
        $('setup').hidden = false;
        $('player').focus();
    });
    renderLeaderboard();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeAnswer, shuffle, selectQuestions, scoreAnswer, grade, compareResults };
}
if (typeof document !== 'undefined') {
    initialize(JSON.parse(document.getElementById('lesson-data').textContent));
}
