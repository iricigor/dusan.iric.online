'use strict';

const tutorQuiz = {
    MODES: { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] },
    POINTS: { easy: 10, medium: 20, hard: 30 },
    shuffle(items, random = Math.random) {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1));
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    },
    grade(total, maximum) {
        return total >= maximum * 80 / 100 ? 1 : total >= maximum * 60 / 100 ? 2 :
            total >= maximum * 40 / 100 ? 3 : total >= maximum * 20 / 100 ? 4 : 5;
    },
    formatDuration(milliseconds) {
        if (milliseconds < 1000) return 'méně než 1 s';
        const seconds = Math.round(milliseconds / 1000);
        return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    },
    questionBank(lesson, subject) {
        const questions = (lesson.questions || lesson.exercises).map(subject.exportQuestion);
        return {
            subject: lesson.subject || 'history', lessonId: lesson.id, topic: lesson.topic,
            summary: {
                totalQuestions: questions.length,
                byDifficulty: Object.fromEntries(['easy', 'medium', 'hard'].map(level =>
                    [level, questions.filter(question => question.difficulty === level).length]))
            },
            questions
        };
    }
};

if (typeof module !== 'undefined') module.exports = tutorQuiz;

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
    const iconNode = icon => {
        const element = node('span', icon, 'card-icon');
        element.setAttribute('aria-hidden', 'true');
        return element;
    };
    const hints = [];
    const hint = (text, explanation, tag = 'p') => {
        const block = node('div', undefined, 'hint');
        const prompt = paragraph(text, tag);
        prompt.className = 'hint-prompt';
        const content = paragraph(explanation);
        content.className = 'hint-content';
        content.id = `hint-content-${hints.length + 1}`;
        const setOpen = expanded => {
            content.hidden = !expanded;
            trigger.setAttribute('aria-expanded', String(expanded));
        };
        const trigger = button('Nápověda ', () => {
            setOpen(content.hidden);
            syncLearningControls();
        }, 'hint-toggle');
        trigger.append(iconNode('💡'));
        trigger.setAttribute('aria-controls', content.id);
        setOpen(false);
        prompt.prepend(trigger);
        block.append(prompt, content);
        hints.push({ content, setOpen });
        return block;
    };
    const heading = (text, icon, fallback) => {
        const element = node('h2');
        element.append(iconNode(icon || fallback), node('span', text, 'heading-text'));
        return element;
    };
    const focusContent = element => {
        element.focus({ preventScroll: true });
        const top = $('page-header').getBoundingClientRect().bottom + 16;
        const bounds = element.getBoundingClientRect();
        if (bounds.top < top || bounds.bottom > innerHeight) {
            element.style.scrollMarginTop = `${top}px`;
            element.scrollIntoView({ block: 'start' });
        }
    };
    let definitionTrigger = null;
    const positionDefinition = () => {
        if (!definitionTrigger || !$('definition').matches(':popover-open')) return;
        const anchor = definitionTrigger.getBoundingClientRect();
        const panel = $('definition');
        const bounds = panel.getBoundingClientRect();
        const gap = 12;
        const top = anchor.bottom + gap + bounds.height <= innerHeight
            ? anchor.bottom + gap : anchor.top - gap - bounds.height;
        panel.style.left = `${Math.max(gap, Math.min(anchor.left, innerWidth - bounds.width - gap))}px`;
        panel.style.top = `${Math.max(gap, Math.min(top, innerHeight - bounds.height - gap))}px`;
    };
    const closeDefinition = (restoreFocus = false) => {
        const trigger = definitionTrigger;
        $('definition').hidePopover();
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        definitionTrigger = null;
        if (restoreFocus && trigger) trigger.focus({ preventScroll: true });
    };
    const definition = (trigger, title, text, icon = '📖') => {
        if (definitionTrigger === trigger && $('definition').matches(':popover-open')) {
            closeDefinition(true);
            return;
        }
        if (definitionTrigger) definitionTrigger.setAttribute('aria-expanded', 'false');
        definitionTrigger = trigger;
        trigger.setAttribute('aria-controls', 'definition');
        trigger.setAttribute('aria-expanded', 'true');
        $('definition-title').replaceChildren(iconNode(icon), node('span', title));
        $('definition-text').textContent = text;
        $('definition').showPopover();
        positionDefinition();
        $('definition-close').focus({ preventScroll: true });
    };
    const definitionButton = (label, title, text, className, icon) => {
        const trigger = button(label, () => definition(trigger, title, text, icon), className);
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', 'definition');
        trigger.setAttribute('aria-expanded', 'false');
        return trigger;
    };
    $('definition-close').addEventListener('click', () => closeDefinition(true));
    $('definition').addEventListener('toggle', event => {
        if (event.newState === 'closed' && definitionTrigger) {
            const restoreFocus = $('definition').contains(document.activeElement) || document.activeElement === document.body;
            closeDefinition(restoreFocus);
        }
    });
    const closeGlossary = (restoreFocus = true) => {
        closeDefinition();
        $('glossary-drawer').hidePopover();
        $('glossary-toggle').setAttribute('aria-expanded', 'false');
        if (restoreFocus && !$('glossary-toggle').hidden) $('glossary-toggle').focus({ preventScroll: true });
    };
    $('glossary-toggle').addEventListener('click', () => {
        if ($('glossary-drawer').matches(':popover-open')) {
            closeGlossary();
            return;
        }
        closeDefinition();
        $('glossary-drawer').showPopover();
        $('glossary-toggle').setAttribute('aria-expanded', 'true');
        $('glossary-close').focus({ preventScroll: true });
    });
    $('glossary-close').addEventListener('click', () => closeGlossary());
    const dismissGlossaryOutside = event => {
        if ($('glossary-drawer').matches(':popover-open') &&
            !$('glossary-drawer').contains(event.target) &&
            !$('definition').contains(event.target) &&
            !$('glossary-toggle').contains(event.target)) closeGlossary(false);
    };
    document.addEventListener('pointerdown', dismissGlossaryOutside);
    document.addEventListener('focusin', dismissGlossaryOutside);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && $('definition').matches(':popover-open')) {
            event.preventDefault();
            closeDefinition(true);
        } else if (event.key === 'Escape' && $('glossary-drawer').matches(':popover-open')) {
            event.preventDefault();
            closeGlossary();
        }
    });
    window.addEventListener('resize', positionDefinition);
    document.addEventListener('scroll', positionDefinition, true);
    const forms = new Map();
    lesson.glossary.forEach(entry => [entry.term, ...entry.forms].forEach(form => forms.set(form.toLocaleLowerCase('cs'), entry)));
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...forms.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const paragraph = (text, tag = 'p') => {
        const element = node(tag);
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            element.append(document.createTextNode(text.slice(offset, match.index)));
            const entry = forms.get(match[0].toLocaleLowerCase('cs'));
            element.append(definitionButton(match[0], entry.term, entry.definition, 'term', entry.icon));
            offset = match.index + match[0].length;
        }
        element.append(document.createTextNode(text.slice(offset)));
        return element;
    };
    const styles = { note: 'Poznámka', example: 'Příklad', tip: 'Tip', warning: 'Pozor',
        comment: 'Komentář', fun: 'Zajímavost', quote: 'Citace' };
    const styleParagraph = (element, style = 'plain', labelled = true) => {
        if (style !== 'plain') {
            element.className = `${element.className || ''} callout callout-${style}`.trim();
            if (labelled) element.prepend(node('strong', `${styles[style]}: `, 'callout-label'));
            else element.setAttribute('aria-label', styles[style]);
        }
        return element;
    };
    const paragraphs = blocks => (blocks || []).map(block =>
        styleParagraph(paragraph(block.text, block.style === 'quote' ? 'blockquote' : 'p'), block.style));
    const context = { $, node, button, disclose, hint, paragraph, paragraphs, heading };
    $('topic').textContent = lesson.topic;
    $('subtitle').textContent = lesson.subtitle || 'Každým krokem objevíš něco nového. Zkus to!';
    lesson.original.forEach((section, index) => {
        const article = node('article', undefined, 'card');
        article.append(heading(section.heading, section.icon, '📄'));
        const text = node('div', undefined, 'original-text');
        const corrections = (lesson.corrections || []).filter(correction => correction.section === index)
            .sort((a, b) => section.text.indexOf(a.quote) - section.text.indexOf(b.quote));
        (section.paragraphs || [{ style: 'plain', text: section.text }]).forEach((block, blockIndex) => {
            if (blockIndex) text.append(document.createTextNode('\n\n'));
            const content = node(block.style === 'quote' ? 'blockquote' : 'p');
            let offset = 0;
            for (const correction of corrections.filter(item => block.text.includes(item.quote))) {
                const start = block.text.indexOf(correction.quote);
                content.append(document.createTextNode(block.text.slice(offset, start)));
                const mark = definitionButton(correction.quote, 'Historická oprava', correction.explanation, 'correction', '🔎');
                mark.title = correction.explanation;
                content.append(mark);
                offset = start + correction.quote.length;
            }
            content.append(document.createTextNode(block.text.slice(offset)));
            text.append(styleParagraph(content, block.style, false));
        });
        styleParagraph(article, section.style);
        article.append(text);
        $('original-content').append(article);
    });
    subject.renderLearning(context, lesson);
    const learningDetails = [...$('learning-content').querySelectorAll('details')];
    const syncLearningControls = () => {
        $('expand-learning').disabled = learningDetails.every(details => details.open) && hints.every(hint => !hint.content.hidden);
        $('collapse-learning').disabled = learningDetails.every(details => !details.open) && hints.every(hint => hint.content.hidden);
    };
    const setLearningOpen = open => {
        learningDetails.forEach(details => { details.open = open; });
        hints.forEach(hint => hint.setOpen(open));
        syncLearningControls();
    };
    $('expand-learning').addEventListener('click', () => setLearningOpen(true));
    $('collapse-learning').addEventListener('click', () => setLearningOpen(false));
    $('learning-content').addEventListener('toggle', syncLearningControls, true);
    syncLearningControls();
    lesson.glossary.forEach(entry => {
        const trigger = definitionButton(entry.term, entry.term, entry.definition, undefined, entry.icon);
        trigger.prepend(iconNode(entry.icon || '📖'));
        $('glossary').append(trigger);
    });
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let requestedTab = tabs[0];
    let tabTransition;
    let tabEntrance;
    reducedMotion.addEventListener('change', event => {
        if (event.matches) {
            tabTransition?.skipTransition();
            tabEntrance?.cancel();
        }
    });
    const activateTab = tab => {
        if (tab === requestedTab) return;
        requestedTab = tab;
        tabTransition?.skipTransition();
        tabEntrance?.cancel();
        const update = () => {
            if (tab !== requestedTab) return;
            closeGlossary(false);
            $('glossary-toggle').hidden = tab.dataset.tab !== 'learning';
            $('learning-controls').hidden = tab.dataset.tab !== 'learning';
            $('quiz-tools').hidden = tab.dataset.tab !== 'quiz';
            if ($('quiz-tools').hidden) $('quiz-tools').open = false;
            pauseAnswerClock();
            tabs.forEach(other => {
                const active = other === tab;
                other.setAttribute('aria-selected', String(active));
                other.tabIndex = active ? 0 : -1;
                $(other.dataset.tab).hidden = !active;
            });
            resumeAnswerClock();
        };
        if (typeof document.startViewTransition === 'function' && !reducedMotion.matches) {
            tabTransition = document.startViewTransition(update);
            tabTransition.ready.catch(error => {
                if (error.name !== 'AbortError') console.error('Animaci přepnutí záložky se nepodařilo spustit.', error);
            });
        } else {
            update();
            const panel = $(tab.dataset.tab);
            if (!reducedMotion.matches && typeof panel.animate === 'function') {
                tabEntrance = panel.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
                    { duration: 300, easing: 'ease-out' });
            }
        }
    };
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activateTab(tab));
        tab.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const target = {
                ArrowRight: (index + 1) % tabs.length,
                ArrowLeft: (index + tabs.length - 1) % tabs.length,
                Home: 0,
                End: tabs.length - 1
            }[event.key];
            if (target === undefined) return;
            event.preventDefault();
            activateTab(tabs[target]);
            tabs[target].focus();
        });
    });
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && systemTheme.matches);
    const syncTheme = () => $('theme').setAttribute('aria-checked', String(isDark()));
    syncTheme();
    systemTheme.addEventListener('change', syncTheme);
    $('theme').addEventListener('click', () => {
        document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
        syncTheme();
    });
    subject.rules.forEach(rule => $('scoring').append(node('li', rule)));
    $('answer-help').textContent = subject.answerHelp || '';
    $('answer-help').hidden = !subject.answerHelp;
    $('quiz-export').addEventListener('click', () => {
        $('export-error').hidden = true;
        let url;
        let link;
        try {
            const json = JSON.stringify(tutorQuiz.questionBank(lesson, subject), null, 2) + '\n';
            url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
            link = node('a');
            link.href = url;
            link.download = `${lesson.id}-otazky.json`;
            document.body.append(link);
            link.click();
        } catch (error) {
            console.error('Tutor: cannot export question bank.', error);
            $('export-error').textContent = 'JSON se nepodařilo stáhnout. Zkus to znovu.';
            $('export-error').hidden = false;
        } finally {
            if (link) link.remove();
            if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    });
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
            typeof row.time !== 'string' || !subject.validRecord(row) ||
            (row.answerDurationMs !== undefined && (!Number.isSafeInteger(row.answerDurationMs) || row.answerDurationMs < 0)))) {
            throw new Error('Invalid tutor session results');
        }
        records = stored;
    } catch (error) {
        storageReadable = false;
        console.warn('Tutor: cannot read session results.', error);
        warnStorage('Uložené výsledky nelze načíst. Nové výsledky zůstanou jen v této stránce; původní úložiště nepřepíšeme.');
    }
    const points = value => String(value).replace('.', ',');
    function pauseAnswerClock() {
        if (quiz && quiz.answerStarted !== null) {
            quiz.questionElapsedMs += Math.max(0, performance.now() - quiz.answerStarted);
            quiz.answerStarted = null;
        }
    }
    function resumeAnswerClock() {
        if (quiz && !quiz.locked && !quiz.finished && !$('quiz').hidden && !document.hidden && quiz.answerStarted === null) {
            quiz.answerStarted = performance.now();
        }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAnswerClock();
        else resumeAnswerClock();
    });
    function renderLeaderboard() {
        const container = $('leaderboard-content');
        container.replaceChildren();
        if (!records.length) {
            container.append(node('p', 'Zatím žádné výsledky.'));
            return;
        }
        const table = node('table');
        table.append(node('caption', 'Pořadí pokusů v této relaci. Doba odpovídání nezahrnuje čtení zpětné vazby. Starší pokusy ji nemají zaznamenanou.'));
        const head = node('thead');
        const labels = node('tr');
        ['Pořadí', 'Hráč', 'Kdy', 'Doba odpovídání', 'Obtížnost', 'Body', 'Známka'].forEach(label => {
            const cell = node('th', label);
            cell.scope = 'col';
            labels.append(cell);
        });
        head.append(labels);
        const body = node('tbody');
        [...records].sort(subject.compareResults).forEach((record, index) => {
            const row = node('tr');
            if (record.id === currentRunId) {
                row.className = 'current';
                row.setAttribute('aria-current', 'true');
                $('leaderboard-rank').textContent = `Tvůj poslední pokus: ${index + 1}. místo z ${records.length} pokusů v této relaci.`;
                $('leaderboard-rank').hidden = false;
            }
            [`${index + 1}.`, record.name, record.time,
                record.answerDurationMs === undefined ? 'Nezaznamenáno' : tutorQuiz.formatDuration(record.answerDurationMs),
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
        const answerDurationMs = Math.round(quiz.answerDurationMs);
        $('answer-duration').textContent = `Doba odpovídání: ${tutorQuiz.formatDuration(answerDurationMs)}. Čtení vysvětlení se nepočítá.`;
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
            time: new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
            answerDurationMs,
            ...(subject.speedBonus ? { duration: Math.round(answerDurationMs / 1000) } : { maximum: result.maximum })
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
        $('leaderboard').open = false;
        $('leaderboard').hidden = false;
        focusContent($('results-title'));
    }
    function submit(values) {
        if (!quiz || quiz.locked || quiz.finished) return;
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
        $('difficulty').textContent = { easy: 'Lehký začátek', medium: 'Další krok', hard: 'Závěrečná výzva' }[question.difficulty];
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
                const remaining = Math.max(0, 1 - (performance.now() - quiz.questionStarted) / 15000);
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
        $('quiz-tools').open = false;
        $('setup').hidden = true;
        $('results').hidden = true;
        $('leaderboard').hidden = true;
        $('game').hidden = false;
        $('score').textContent = 'Skóre: 0 b';
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
