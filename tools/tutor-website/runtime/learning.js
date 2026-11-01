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
    const highlighting = tutorHighlights.initialize(lesson, document);
    const hints = [];
    const hint = (text, explanation, tag = 'p', targets = {}) => {
        const block = node('div', undefined, 'hint');
        const prompt = paragraph(text, tag, { target: targets.prompt, prefix: targets.prefix });
        prompt.className = 'hint-prompt';
        const content = paragraph(explanation, 'p', { target: targets.explanation });
        content.className = 'hint-content';
        content.id = `hint-content-${hints.length + 1}`;
        const drawer = node('div', undefined, 'hint-drawer');
        drawer.append(content);
        let animation;
        const setOpen = (expanded, animate = true) => {
            const from = drawer.getBoundingClientRect().height;
            animation?.cancel();
            trigger.setAttribute('aria-expanded', String(expanded));
            drawer.inert = !expanded;
            content.hidden = false;
            drawer.hidden = false;
            const finish = () => {
                content.hidden = !expanded;
                drawer.hidden = !expanded;
                animation = undefined;
            };
            if (!animate || !drawer.checkVisibility() || matchMedia('(prefers-reduced-motion: reduce)').matches) {
                finish();
                return;
            }
            const current = drawer.animate([
                { height: `${from}px`, opacity: expanded ? .4 : 1 },
                { height: `${expanded ? drawer.getBoundingClientRect().height : 0}px`, opacity: expanded ? 1 : 0 }
            ], { duration: 220, easing: 'ease-out' });
            animation = current;
            current.finished.then(() => {
                if (animation === current) finish();
            }).catch(error => {
                if (error.name !== 'AbortError') console.error('Animaci nápovědy se nepodařilo dokončit.', error);
            });
        };
        const trigger = button('', () => {
            setOpen(trigger.getAttribute('aria-expanded') !== 'true');
            syncLearningControls();
        }, 'hint-toggle');
        trigger.append(iconNode('💡'), document.createTextNode(' '), node('span', 'Nápověda'));
        trigger.setAttribute('aria-controls', content.id);
        block.append(prompt, trigger, drawer);
        setOpen(false, false);
        hints.push({ content, setOpen, get open() { return trigger.getAttribute('aria-expanded') === 'true'; } });
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
        // Layout dimensions stay stable while the popup's flip transforms its painted bounds.
        const bounds = { width: panel.offsetWidth, height: panel.offsetHeight };
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
        const panel = $('definition');
        panel.classList.remove('definition-flip');
        if (trigger.classList.contains('term') && trigger.closest('#learning-content')) {
            // Replay the entrance when another term replaces an already-open popup.
            void panel.offsetWidth;
            panel.classList.add('definition-flip');
        }
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
    const paragraph = (text, tag = 'p', highlight = {}) => {
        const element = node(tag);
        const prefix = highlight.prefix || 0;
        if (prefix) element.append(document.createTextNode(text.slice(0, prefix)));
        text = text.slice(prefix);
        const container = highlight.target ? node('span', undefined, 'highlight-text') : element;
        const linkedEntries = new Set();
        let offset = 0;
        for (const match of text.matchAll(pattern)) {
            container.append(document.createTextNode(text.slice(offset, match.index)));
            const entry = forms.get(match[0].toLocaleLowerCase('cs'));
            if (linkedEntries.has(entry)) container.append(document.createTextNode(match[0]));
            else {
                container.append(definitionButton(match[0], entry.term, entry.definition, 'term', entry.icon));
                linkedEntries.add(entry);
            }
            offset = match.index + match[0].length;
        }
        container.append(document.createTextNode(text.slice(offset)));
        if (highlight.target) {
            element.append(container);
            highlighting.register(container, highlight.target);
        }
        return element;
    };
    const styles = { note: 'Poznámka', example: 'Příklad', tip: 'Tip', warning: 'Pozor',
        comment: 'Komentář', fun: 'Zajímavost', quote: 'Citace', important: 'Důležité' };
    const styleParagraph = (element, style = 'plain', labelled = true) => {
        if (style !== 'plain') {
            element.className = `${element.className || ''} callout callout-${style}`.trim();
            if (labelled) {
                const label = node('strong', `${styles[style]}: `, 'callout-label');
                if (style === 'important') label.prepend(iconNode('⭐'));
                element.prepend(label);
            } else {
                element.setAttribute('aria-label', styles[style]);
                if (style === 'important') element.setAttribute('role', 'note');
            }
        }
        return element;
    };
    const paragraphs = (blocks, target) => (blocks || []).map((block, index) =>
        styleParagraph(paragraph(block.text, block.style === 'quote' ? 'blockquote' : 'p',
            { target: target ? `${target}.${index}.text` : undefined }), block.style));
    const context = { $, node, button, disclose, hint, paragraph, paragraphs, heading };
    $('topic').textContent = lesson.topic;
    $('subtitle').textContent = lesson.subtitle || 'Každým krokem objevíš něco nového. Zkus to!';
    lesson.original.forEach((section, index) => {
        const article = node('article', undefined, 'card');
        article.append(heading(section.heading, section.icon, '📄'));
        const text = node('div', undefined, 'original-text');
        const corrections = (lesson.corrections || []).filter(correction => correction.section === index)
            .sort((a, b) => section.text.indexOf(a.quote) - section.text.indexOf(b.quote));
        let paragraphOffset = 0;
        (section.paragraphs || [{ style: 'plain', text: section.text }]).forEach((block, blockIndex) => {
            if (blockIndex) text.append(document.createTextNode('\n\n'));
            const content = node(block.style === 'quote' ? 'blockquote' : 'p');
            const source = node('span', undefined, 'highlight-text');
            let offset = 0;
            for (const correction of corrections.filter(item => block.text.includes(item.quote))) {
                const start = block.text.indexOf(correction.quote);
                source.append(document.createTextNode(block.text.slice(offset, start)));
                const mark = definitionButton(correction.quote, 'Historická oprava', correction.explanation, 'correction', '🔎');
                mark.title = correction.explanation;
                source.append(mark);
                offset = start + correction.quote.length;
            }
            source.append(document.createTextNode(block.text.slice(offset)));
            content.append(source);
            highlighting.register(source, `original.${index}.text`, paragraphOffset);
            paragraphOffset += block.text.length + 2;
            text.append(styleParagraph(content, block.style, false));
        });
        styleParagraph(article, section.style);
        article.append(text);
        $('original-content').append(article);
    });
    subject.renderLearning(context, lesson);
    $('learning-content').append($('practice-tools'));
    const learning = initializeLearning(lesson, document);
    const learningDetails = [...$('learning-content').querySelectorAll('details')];
    const syncLearningControls = () => {
        $('expand-learning').disabled = learningDetails.every(details => details.open) && hints.every(hint => hint.open);
        $('collapse-learning').disabled = learningDetails.every(details => !details.open) && hints.every(hint => !hint.open);
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
    return { ...context, focusContent, closeGlossary, closeQuizTools, highlighting, learning,
        finishLearningAnimations: () => hints.forEach(hint => hint.setOpen(hint.open, false)) };
}
