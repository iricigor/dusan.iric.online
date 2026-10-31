'use strict';

const tutorHighlights = (() => {
    const colors = ['yellow', 'blue', 'green'];
    const targets = lesson => {
        const result = new Map();
        const add = (key, text) => result.set(key, text);
        const paragraphs = (item, key) => (item.paragraphs || []).forEach((block, index) =>
            add(`${key}.paragraphs.${index}.text`, block.text));
        lesson.original.forEach((section, index) => add(`original.${index}.text`, section.text));
        (lesson.chunks || []).forEach((chunk, index) => {
            const key = `chunks.${index}`;
            add(`${key}.sentences`, chunk.sentences.join(' '));
            add(`${key}.explanation`, chunk.explanation);
            paragraphs(chunk, key);
        });
        (lesson.examples || []).forEach((example, index) => {
            const key = `examples.${index}`;
            ['prompt', 'hint', 'answer'].forEach(field => add(`${key}.${field}`, example[field]));
            paragraphs(example, key);
            example.steps.forEach((step, stepIndex) => ['calculation', 'explanation'].forEach(field =>
                add(`${key}.steps.${stepIndex}.${field}`, step[field])));
        });
        (lesson.exercises || []).forEach((exercise, index) => {
            const key = `exercises.${index}`;
            ['prompt', 'explanation'].forEach(field => add(`${key}.${field}`, exercise[field]));
            exercise.steps.forEach((step, stepIndex) => ['prompt', 'hint', 'solution'].forEach(field =>
                add(`${key}.steps.${stepIndex}.${field}`, step[field])));
        });
        return result;
    };
    const boundary = (text, index) => index === 0 || index === text.length ||
        !(/[\uD800-\uDBFF]/.test(text[index - 1]) && /[\uDC00-\uDFFF]/.test(text[index]));
    const validRange = (range, text, allowRemoval = false) => range && Number.isInteger(range.start) &&
        Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length &&
        boundary(text, range.start) && boundary(text, range.end) &&
        (colors.includes(range.color) || (allowRemoval && range.color === null));
    const replaceRange = (ranges, replacement) => {
        const next = [];
        for (const range of ranges) {
            if (range.end <= replacement.start || range.start >= replacement.end) next.push({ ...range });
            else {
                if (range.start < replacement.start) next.push({ ...range, end: replacement.start });
                if (range.end > replacement.end) next.push({ ...range, start: replacement.end });
            }
        }
        next.push({ ...replacement });
        next.sort((a, b) => a.start - b.start);
        return next.reduce((merged, range) => {
            const last = merged.at(-1);
            if (last && last.end === range.start && last.color === range.color) last.end = range.end;
            else merged.push(range);
            return merged;
        }, []);
    };
    const authored = lesson => {
        const textTargets = targets(lesson);
        const ranges = new Map();
        const errors = [];
        (lesson.highlights || []).forEach((highlight, index) => {
            const at = `$.highlights[${index}]`;
            const text = textTargets.get(highlight.target);
            if (text === undefined) {
                errors.push(`${at}.target: expected a supported original or learning text target`);
                return;
            }
            const start = text.indexOf(highlight.quote);
            const range = { start, end: start + highlight.quote.length, color: highlight.color };
            if (start < 0 || start !== text.lastIndexOf(highlight.quote) || !validRange(range, text)) {
                errors.push(`${at}.quote: must match exactly one complete passage in the target text`);
                return;
            }
            const previous = ranges.get(highlight.target) || [];
            if (previous.some(item => item.start < range.end && item.end > range.start)) {
                errors.push(`${at}.quote: overlaps another authored highlight`);
            } else ranges.set(highlight.target, replaceRange(previous, range));
        });
        return { ranges, errors };
    };

    function initialize(lesson, document) {
        const $ = id => document.getElementById(id);
        const source = targets(lesson);
        const defaults = authored(lesson).ranges;
        const roots = [];
        const edits = new Map();
        const tools = $('highlight-tools');
        const actions = [...tools.querySelectorAll('[data-highlight-action]')];
        const key = `tutor-highlights:v1:${lesson.subject || 'history'}:${lesson.id}`;
        let tab = 'original';
        let pending = [];
        let storageUsable = true;
        const warn = (message, error) => {
            $('highlight-warning').hidden = false;
            $('highlight-warning').textContent = message;
            console.warn(message, error);
        };
        try {
            const saved = sessionStorage.getItem(key);
            if (saved !== null) {
                const record = JSON.parse(saved);
                if (!record || record.version !== 1 || !Array.isArray(record.edits)) throw new Error('Invalid highlight record');
                for (const edit of record.edits) {
                    const text = source.get(edit.target);
                    if (text === undefined || edit.text !== text || edits.has(edit.target) || !Array.isArray(edit.ranges) ||
                        edit.ranges.some((range, index) => !validRange(range, text, true) ||
                            (index && range.start < edit.ranges[index - 1].end))) throw new Error('Invalid or outdated highlight ranges');
                    edits.set(edit.target, edit.ranges);
                }
            }
        } catch (error) {
            edits.clear();
            storageUsable = false;
            warn('Uložené zvýraznění nelze načíst. Nové změny zůstanou jen do obnovení stránky; původní uložená data ponecháváme.', error);
        }
        const effective = target => {
            let ranges = defaults.get(target) || [];
            for (const edit of edits.get(target) || []) ranges = replaceRange(ranges, edit);
            return ranges.filter(range => range.color !== null);
        };
        const paint = entry => {
            const { root, target, offset } = entry;
            for (const mark of root.querySelectorAll('mark[data-highlight-color]')) mark.replaceWith(...mark.childNodes);
            root.normalize();
            const ranges = effective(target);
            if (!ranges.length) return;
            const walker = document.createTreeWalker(root, 4);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            let position = offset;
            for (const textNode of nodes) {
                const text = textNode.textContent;
                const end = position + text.length;
                const matches = ranges.filter(range => range.start < end && range.end > position);
                if (matches.length) {
                    const fragment = document.createDocumentFragment();
                    let consumed = 0;
                    for (const range of matches) {
                        const start = Math.max(0, range.start - position);
                        const stop = Math.min(text.length, range.end - position);
                        fragment.append(document.createTextNode(text.slice(consumed, start)));
                        const mark = document.createElement('mark');
                        mark.dataset.highlightColor = range.color;
                        mark.textContent = text.slice(start, stop);
                        fragment.append(mark);
                        consumed = stop;
                    }
                    fragment.append(document.createTextNode(text.slice(consumed)));
                    textNode.replaceWith(fragment);
                }
                position = end;
            }
        };
        const sync = () => actions.forEach(action => { action.disabled = !pending.length; });
        const capture = () => {
            const selection = document.getSelection();
            if (selection?.isCollapsed && tools.contains(document.activeElement)) return;
            pending = [];
            if (selection && !selection.isCollapsed && selection.rangeCount === 1 && tab !== 'quiz') {
                const range = selection.getRangeAt(0);
                for (const entry of roots) {
                    if (entry.root.closest('[role="tabpanel"]').id !== tab || !entry.root.checkVisibility() ||
                        !range.intersectsNode(entry.root)) continue;
                    const whole = document.createRange();
                    whole.selectNodeContents(entry.root);
                    let start = 0;
                    let end = entry.root.textContent.length;
                    const prefix = document.createRange();
                    prefix.selectNodeContents(entry.root);
                    if (range.compareBoundaryPoints(0, whole) > 0) {
                        prefix.setEnd(range.startContainer, range.startOffset);
                        start = prefix.toString().length;
                    }
                    if (range.compareBoundaryPoints(2, whole) < 0) {
                        prefix.setEnd(range.endContainer, range.endOffset);
                        end = prefix.toString().length;
                    }
                    start += entry.offset;
                    end += entry.offset;
                    const text = source.get(entry.target);
                    if (!boundary(text, start)) start--;
                    if (!boundary(text, end)) end++;
                    if (end > start) pending.push({ target: entry.target, start, end });
                }
            }
            sync();
        };
        const save = () => {
            if (!storageUsable) return false;
            try {
                sessionStorage.setItem(key, JSON.stringify({ version: 1, edits: [...edits].map(([target, ranges]) =>
                    ({ target, text: source.get(target), ranges })) }));
                $('highlight-warning').hidden = true;
                return true;
            } catch (error) {
                warn('Zvýraznění se nepodařilo uložit. Tato změna zůstane jen do obnovení stránky.', error);
                return false;
            }
        };
        for (const action of actions) {
            action.addEventListener('pointerdown', event => event.preventDefault());
            action.addEventListener('click', () => {
                if (!pending.length) return;
                const color = action.dataset.highlightAction === 'remove' ? null : action.dataset.highlightAction;
                const changed = new Set();
                for (const range of pending) {
                    edits.set(range.target, replaceRange(edits.get(range.target) || [], { start: range.start, end: range.end, color }));
                    changed.add(range.target);
                }
                for (const entry of roots) if (changed.has(entry.target)) paint(entry);
                pending = [];
                document.getSelection().removeAllRanges();
                sync();
                const saved = save();
                $('highlight-status').textContent = `${color === null ? 'Zvýraznění odstraněno.' : 'Text zvýrazněn.'} ${saved
                    ? 'Uloženo v této kartě prohlížeče.' : 'Změna není uložená pro obnovení stránky.'}`;
                tools.querySelector('summary').focus({ preventScroll: true });
            });
        }
        document.addEventListener('selectionchange', capture);
        document.addEventListener('pointerup', () => {
            capture();
            if (pending.length) tools.open = true;
        });
        document.addEventListener('keydown', event => {
            if (event.altKey && event.code === 'KeyH' && tab !== 'quiz') {
                event.preventDefault();
                capture();
                tools.open = true;
                (actions.find(action => !action.disabled) || tools.querySelector('summary')).focus();
            } else if (event.key === 'Escape' && tools.open) {
                tools.open = false;
                if (tools.contains(document.activeElement)) tools.querySelector('summary').focus();
            }
        });
        document.addEventListener('pointerdown', event => {
            if (!tools.contains(event.target)) {
                tools.open = false;
                pending = [];
                sync();
            }
        });
        sync();
        return {
            register(root, target, offset = 0) {
                root.dataset.highlightTarget = target;
                const entry = { root, target, offset };
                roots.push(entry);
                paint(entry);
            },
            setTab(name) {
                tab = name;
                tools.hidden = name === 'quiz';
                tools.open = false;
                pending = [];
                sync();
            }
        };
    }
    return { colors, targets, authored, boundary, validRange, replaceRange, initialize };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = tutorHighlights;
