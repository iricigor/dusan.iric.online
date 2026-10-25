'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lesson = require('../examples/defenestrace.json');
const mathsLesson = require('../examples/zlomky-a-prevody-delky.json');

// Minimal DOM and clock for exercising the real runtime without dependencies.
class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.listeners = {};
        this.dataset = {};
        this.style = {};
        this.hidden = false;
        this.value = '';
        this.text = '';
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    getBoundingClientRect() { return { top: 350, bottom: 400 }; }
    scrollIntoView() {}
    hidePopover() { this.open = false; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    dispatch(event) { this.listeners[event]?.({ preventDefault() {} }); }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(selector.split(', ').includes(child.tag) ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
}

function page(subject = 'history', stored = []) {
    const source = subject === 'history' ? lesson : mathsLesson;
    const shared = path.join(__dirname, '..');
    const template = fs.readFileSync(path.join(shared, 'template.html'), 'utf8')
        .replace('@@TIMING@@', subject === 'history' ? '<div id="bonus"><div id="bonus-bar"></div></div>' : '');
    assert.doesNotMatch(template, /type="checkbox"|id="speed"/);
    const elements = new Map([...template.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
    elements.get('lesson-data').textContent = JSON.stringify(source);
    elements.get('player').value = 'Tester';
    const modes = ['easy', 'medium', 'hard'].map(mode => {
        const element = new Element('button');
        element.dataset.mode = mode;
        return element;
    });
    const tabs = ['original', 'learning', 'quiz'].map(tab => {
        const element = new Element('button');
        element.dataset.tab = tab;
        return element;
    });
    let now = 0;
    let serial = 0;
    const intervals = new Map();
    const storageKey = `${subject}-tutor:v${subject === 'history' ? 1 : 2}:${source.id}`;
    const storage = new Map([[storageKey, JSON.stringify(stored)]]);
    const documentListeners = {};
    const warnings = [];
    const context = {
        innerHeight: 900,
        window: { addEventListener() {} },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        document: {
            documentElement: { dataset: {} },
            hidden: false,
            addEventListener: (event, listener) => { documentListeners[event] = listener; },
            baseURI: 'https://example.org/',
            createElement: tag => new Element(tag),
            createTextNode: text => {
                const element = new Element('#text');
                element.textContent = text;
                return element;
            },
            getElementById: id => elements.get(id) ||
                elements.get('answers').children.find(child => child.id === id),
            querySelectorAll: selector => selector === '[data-mode]' ? modes : selector === '[data-tab]' ? tabs : []
        },
        performance: { now: () => now },
        setInterval: callback => { intervals.set(++serial, callback); return serial; },
        clearInterval: id => intervals.delete(id),
        sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        crypto: { randomUUID: () => `run-${++serial}` },
        URL, console: { ...console, warn: (...args) => warnings.push(args) }
    };
    vm.runInNewContext(fs.readFileSync(path.join(shared, 'assessment.js'), 'utf8') + '\n' +
        fs.readFileSync(path.join(shared, 'runtime.js'), 'utf8') + '\n' +
        fs.readFileSync(path.join(shared, `${subject}.js`), 'utf8'), context);
    return {
        get: id => context.document.getElementById(id),
        start: mode => modes.find(control => control.dataset.mode === mode).dispatch('click'),
        tab: name => tabs.find(control => control.dataset.tab === name).dispatch('click'),
        visible: visible => {
            context.document.hidden = !visible;
            documentListeners.visibilitychange();
        },
        advance: milliseconds => {
            now += milliseconds;
            [...intervals.values()].forEach(callback => callback());
        },
        intervals,
        warnings,
        records: () => JSON.parse(storage.get(storageKey) || '[]')
    };
}

test('every mode and restarted run enables the bonus, waits for progression and stores totals', () => {
    const runtime = page();
    for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
        runtime.start(mode);
        assert.equal(runtime.get('score').textContent, 'Skóre: 0 b');
        assert.equal(runtime.get('quiz-progress').max, count);
        for (let index = 0; index < count; index++) {
            assert.equal(runtime.get('quiz-progress').value, index);
            assert.equal(runtime.get('bonus').textContent, '');
            assert.equal(runtime.get('bonus-bar').style.transform, 'scaleX(1)');
            assert.equal(runtime.intervals.size, 1);
            const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
            runtime.advance(14999);
            if (question.type === 'text') {
                runtime.get('answer-input').value = question.acceptedAnswers[0];
                runtime.get('answers').dispatch('submit');
            } else {
                runtime.get('answers').children[question.answer].dispatch('click');
            }
            assert.match(runtime.get('feedback').textContent, /bonus \+/);
            assert.equal(runtime.get('quiz-progress').value, index + 1);
            assert.equal(runtime.intervals.size, 0);
            const progress = runtime.get('progress').textContent;
            runtime.advance(20000);
            assert.equal(runtime.get('progress').textContent, progress);
            runtime.get('next').dispatch('click');
        }
        assert.ok(runtime.get('grade').textContent.includes(`Body: ${2 * maximum} (z\u00e1klad ${maximum}/${maximum}, bonus ${maximum}). Zn\u00e1mka: 1`));
        assert.equal(runtime.get('summary').children.length, count);
        const record = runtime.records().at(-1);
        assert.equal(record.mode, mode);
        assert.equal(record.total, 2 * maximum);
        assert.equal(record.grade, 1);
        assert.equal(record.answerDurationMs, count * 14999);
        assert.equal(record.duration, Math.round(count * 14999 / 1000));
        assert.equal(runtime.get('score').textContent, `Skóre: ${record.total} b`);
        assert.ok(runtime.get('leaderboard-content').textContent.includes(`${2 * maximum} b`));
        runtime.get('restart').dispatch('click');
        assert.equal(runtime.get('setup').hidden, false);
    }
    assert.equal(runtime.records().length, 3);
});

test('deadline leaves answers available and speed changes totals, not grades or partial credit', () => {
    for (const elapsed of [14999, 15000, 60000]) {
        const runtime = page();
        runtime.start('hard');
        for (let index = 0; index < 10; index++) {
            const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
            runtime.advance(elapsed);
            if (elapsed >= 15000) {
                assert.equal(runtime.get('bonus-bar').style.transform, 'scaleX(0)');
                assert.equal(runtime.intervals.size, 0);
                assert.equal(runtime.get('feedback').hidden, true);
                assert.equal(runtime.get('next').hidden, true);
            }
            if (question.type === 'text') {
                runtime.get('answer-input').value = question.id === 'h-defenestrace' ? '1619' : 'wrong';
                runtime.get('answers').dispatch('submit');
                assert.doesNotMatch(runtime.get('feedback').textContent, /bonus \+/);
            } else {
                runtime.get('answers').children[question.answer].dispatch('click');
            }
            runtime.get('next').dispatch('click');
        }
        const bonus = elapsed < 15000 ? 120 : 0;
        assert.ok(runtime.get('grade').textContent.includes(`Body: ${135 + bonus} (z\u00e1klad 135/210, bonus ${bonus}). Zn\u00e1mka: 2`));
        assert.equal(runtime.records()[0].total, 135 + bonus);
        assert.equal(runtime.get('score').textContent, `Skóre: ${135 + bonus} b`);
        assert.equal(runtime.records()[0].grade, 2);
        assert.ok(runtime.get('leaderboard-content').textContent.includes(`${135 + bonus} b`));
        assert.equal(runtime.intervals.size, 0);
    }
});

test('both subjects record answering only, excluding feedback and time outside the visible quiz', () => {
    for (const subject of ['history', 'maths']) {
        const runtime = page(subject);
        runtime.start('easy');
        for (let index = 0; index < 3; index++) {
            runtime.advance(1000);
            runtime.tab('learning');
            runtime.advance(20000);
            runtime.tab('quiz');
            runtime.advance(2000);
            runtime.visible(false);
            runtime.advance(30000);
            runtime.visible(true);
            runtime.advance(500);
            if (subject === 'history') {
                const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
                if (question.options) runtime.get('answers').children[question.answer].dispatch('click');
                else {
                    runtime.get('answer-input').value = question.acceptedAnswers[0];
                    runtime.get('answers').dispatch('submit');
                }
                assert.doesNotMatch(runtime.get('feedback').textContent, /bonus \+/);
            } else runtime.get('answers').dispatch('submit');
            runtime.advance(60000);
            runtime.get('next').dispatch('click');
        }
        const record = runtime.records()[0];
        assert.equal(record.answerDurationMs, 10500, subject);
        assert.equal(runtime.intervals.size, 0);
        assert.match(runtime.get('answer-duration').textContent, /Doba odpovídání: 11 s/);
        assert.equal(runtime.get('leaderboard').open, false);
        assert.match(runtime.get('leaderboard-rank').textContent, /1\. místo z 1 pokusů/);
        assert.match(runtime.get('leaderboard-content').textContent, /KdyDoba odpovídání/);
        if (subject === 'maths') assert.equal(record.duration, undefined);
        else assert.equal(record.duration, 11);

        const legacy = { ...record };
        delete legacy.answerDurationMs;
        const restored = page(subject, [legacy]);
        assert.match(restored.get('leaderboard-content').textContent, /Nezaznamenáno/);
        assert.equal(restored.get('storage-warning').textContent, '');
        for (const invalid of [-1, 1.5, '1000', null]) {
            const corrupt = page(subject, [{ ...record, answerDurationMs: invalid }]);
            assert.match(corrupt.get('storage-warning').textContent, /nelze načíst/);
            assert.equal(corrupt.warnings.length, 1);
            assert.equal(corrupt.records()[0].answerDurationMs, invalid);
        }
    }
});
