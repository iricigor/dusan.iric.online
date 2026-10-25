'use strict';

function initializeMaths(lesson) {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const disclose = (label, ...content) => {
        const details = node('details');
        details.append(node('summary', label), ...content);
        return details;
    };
    const forms = new Map();
    lesson.glossary.forEach(entry => [entry.term, ...entry.forms].forEach(form => forms.set(form.toLocaleLowerCase('cs'), entry)));
    const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...forms.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const termButton = (text, entry) => {
        const button = node('button', text, 'term');
        button.type = 'button';
        button.addEventListener('click', () => {
            $('definition-title').textContent = entry.term;
            $('definition-text').textContent = entry.definition;
            $('definition').showModal();
        });
        return button;
    };
    const paragraph = text => {
        const element = node('p');
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            element.append(document.createTextNode(text.slice(offset, match.index)));
            element.append(termButton(match[0], forms.get(match[0].toLocaleLowerCase('cs'))));
            offset = match.index + match[0].length;
        }
        element.append(document.createTextNode(text.slice(offset)));
        return element;
    };
    $('topic').textContent = lesson.topic;
    $('audience').textContent = lesson.audience;
    lesson.examples.forEach(example => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', example.heading), paragraph(example.prompt), disclose('Nápověda', paragraph(example.hint)));
        const steps = node('ol');
        example.steps.forEach(step => {
            const item = node('li');
            item.append(disclose('Odkrýt krok', paragraph(step.calculation), paragraph(step.explanation)));
            steps.append(item);
        });
        article.append(steps, disclose('Výsledek', paragraph(example.answer)));
        $('examples').append(article);
    });
    lesson.glossary.forEach(entry => $('glossary').append(termButton(entry.term, entry)));
    const levels = { easy: 'Lehká skupina', medium: 'Slovní úloha', hard: 'Úloha ve třech krocích' };
    lesson.exercises.forEach((exercise, index) => {
        const article = node('article', undefined, 'card');
        article.append(node('h2', `${index + 1}. ${levels[exercise.difficulty]}`), paragraph(exercise.prompt));
        exercise.steps.forEach((step, stepIndex) => {
            const label = exercise.difficulty === 'easy' ? `${index + 1}${'abcd'[stepIndex]}` : `${index + 1}.${stepIndex + 1}`;
            article.append(node('h3', `${label}: ${step.prompt}`), disclose('Nápověda', paragraph(step.hint)),
                disclose('Řešení', paragraph(`Správná odpověď: ${formatAnswer(step.answer)}`), paragraph(step.solution)));
        });
        article.append(disclose('Vysvětlení celé úlohy', paragraph(exercise.explanation)));
        $('exercises').append(article);
    });
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
}

function formatAnswer(answer) {
    if (answer.format === 'fraction') return `${answer.numerator}/${answer.denominator}`;
    const value = answer.value.replace('.', ',');
    return answer.format === 'length' ? `${value} ${answer.unit}` : value;
}

if (typeof document !== 'undefined') initializeMaths(JSON.parse(document.getElementById('lesson-data').textContent));
if (typeof module !== 'undefined') module.exports = { formatAnswer };
