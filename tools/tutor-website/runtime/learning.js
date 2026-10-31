'use strict';

function initializeTutorLearning(lesson, subject) {
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
    const closeQuizTools = (restoreFocus = false) => {
        if (!$('quiz-tools').open) return;
        $('quiz-tools').open = false;
        if (restoreFocus) $('quiz-tools').querySelector('summary').focus({ preventScroll: true });
    };
    const dismissGlossaryOutside = event => {
        if ($('glossary-drawer').matches(':popover-open') &&
            !$('glossary-drawer').contains(event.target) &&
            !$('definition').contains(event.target) &&
            !$('glossary-toggle').contains(event.target)) closeGlossary(false);
    };
    document.addEventListener('pointerdown', dismissGlossaryOutside);
    document.addEventListener('focusin', dismissGlossaryOutside);
    const dismissQuizToolsOutside = event => {
        if (!$('quiz-tools').contains(event.target)) closeQuizTools();
    };
    document.addEventListener('pointerdown', dismissQuizToolsOutside);
    document.addEventListener('focusin', dismissQuizToolsOutside);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && $('definition').matches(':popover-open')) {
            event.preventDefault();
            closeDefinition(true);
        } else if (event.key === 'Escape' && $('glossary-drawer').matches(':popover-open')) {
            event.preventDefault();
            closeGlossary();
        } else if (event.key === 'Escape' && $('quiz-tools').open) {
            event.preventDefault();
            closeQuizTools(true);
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
    return { ...context, focusContent, closeGlossary, closeQuizTools };
}
