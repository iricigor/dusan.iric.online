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
        this.attributes = {};
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    get firstElementChild() { return this.children[0]; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute() {}
    focus() {}
    getBoundingClientRect() { return { top: 350, bottom: 400 }; }
    scrollIntoView() {}
    hidePopover() { this.open = false; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    dispatch(event, properties = {}) { this.listeners[event]?.({ preventDefault() {}, ...properties }); }
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
    const windowListeners = new Map();
    const confirmations = [];
    let confirmResult = false;
    let confirmDuration = 0;
    const warnings = [];
    const context = {
        Math: Object.assign(Object.create(Math), { random: () => .999999 }),
        innerHeight: 900,
        window: {
            addEventListener: (event, listener) => { windowListeners.set(event, listener); },
            removeEventListener: (event, listener) => {
                if (windowListeners.get(event) === listener) windowListeners.delete(event);
            },
            confirm: message => {
                confirmations.push(message);
                now += confirmDuration;
                return confirmResult;
            }
        },
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
    tabs.find(control => control.dataset.tab === 'quiz').dispatch('click');
    return {
        get: id => context.document.getElementById(id),
        start: mode => modes.find(control => control.dataset.mode === mode).dispatch('click'),
        tab: name => tabs.find(control => control.dataset.tab === name).dispatch('click'),
        key: (name, key) => tabs.find(control => control.dataset.tab === name).dispatch('keydown', { key }),
        selectedTab: () => tabs.find(control => control.getAttribute('aria-selected') === 'true').dataset.tab,
        confirm: (result, duration = 0) => { confirmResult = result; confirmDuration = duration; },
        confirmations,
        unloadProtected: () => windowListeners.has('beforeunload'),
        unload: () => {
            const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
            windowListeners.get('beforeunload')?.(event);
            return event;
        },
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
        assert.equal(runtime.get('leaderboard').open, true);
        runtime.get('restart').dispatch('click');
        assert.equal(runtime.get('setup').hidden, false);
        assert.equal(runtime.get('leaderboard').open, false);
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
            runtime.confirm(false, 20000);
            runtime.tab('learning');
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
        assert.equal(runtime.get('leaderboard').open, true);
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

test('unfinished quizzes guard unload and tab activation, preserving canceled attempts and discarding confirmed ones', () => {
    for (const subject of ['history', 'maths']) {
        const runtime = page(subject);
        const answer = () => {
            if (subject === 'maths') runtime.get('answers').dispatch('submit');
            else {
                const question = lesson.questions.find(q => q.prompt === runtime.get('question').textContent);
                if (question.options) runtime.get('answers').children[question.answer].dispatch('click');
                else {
                    runtime.get('answer-input').value = question.acceptedAnswers[0];
                    runtime.get('answers').dispatch('submit');
                }
            }
        };
        assert.equal(runtime.unloadProtected(), false, subject);
        runtime.tab('learning');
        runtime.key('learning', 'End');
        assert.equal(runtime.selectedTab(), 'quiz');
        assert.equal(runtime.confirmations.length, 0);
        runtime.start('easy');
        assert.equal(runtime.unloadProtected(), true);
        const unload = runtime.unload();
        assert.equal(unload.defaultPrevented, true);
        assert.equal(unload.returnValue, '');
        const question = runtime.get('question').textContent;
        const controls = [...runtime.get('answers').children];
        const input = controls.find(control => control.tag === 'input');
        if (input) input.value = 'rozpracovaná odpověď';
        const timers = [...runtime.intervals.keys()];
        runtime.advance(1000);
        runtime.tab('quiz');
        assert.equal(runtime.confirmations.length, 0, 'same tab does not warn');
        for (const key of ['ArrowLeft', 'ArrowRight', 'Home']) {
            runtime.key('quiz', key);
            assert.equal(runtime.selectedTab(), 'quiz');
        }
        runtime.tab('learning');
        assert.equal(runtime.selectedTab(), 'quiz');
        assert.equal(runtime.get('question').textContent, question);
        assert.deepEqual(runtime.get('answers').children, controls);
        if (input) assert.equal(input.value, 'rozpracovaná odpověď');
        assert.deepEqual([...runtime.intervals.keys()], timers, 'cancel does not restart timers');
        assert.equal(runtime.get('quiz-progress').value, 0);
        assert.equal(runtime.unloadProtected(), true, 'canceling unload keeps the guard');
        answer();
        const score = runtime.get('score').textContent;
        runtime.tab('original');
        assert.equal(runtime.get('score').textContent, score);
        assert.equal(runtime.get('quiz-progress').value, 1);
        assert.equal(runtime.intervals.size, 0);
        runtime.get('next').dispatch('click');
        runtime.confirm(true);
        runtime.key('quiz', 'Home');
        assert.equal(runtime.selectedTab(), 'original');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.unload().defaultPrevented, false);
        assert.equal(runtime.intervals.size, 0);
        assert.equal(runtime.get('game').hidden, true);
        assert.equal(runtime.get('setup').hidden, false);
        assert.equal(runtime.get('score').textContent, 'Skóre: 0 b');
        assert.equal(runtime.get('quiz-progress').value, 0);
        assert.equal(runtime.get('answers').children.length, 0);
        assert.equal(runtime.records().length, 0, 'abandonment does not save a result');
        runtime.get('answers').dispatch('submit');
        runtime.get('next').dispatch('click');
        const promptCount = runtime.confirmations.length;
        runtime.tab('quiz');
        assert.equal(runtime.confirmations.length, promptCount);
        runtime.start('easy');
        assert.equal(runtime.intervals.size, subject === 'history' ? 1 : 0);
        for (let index = 0; index < 3; index++) {
            runtime.advance(1000);
            answer();
            assert.equal(runtime.unloadProtected(), true, 'final feedback is still unfinished');
            runtime.get('next').dispatch('click');
        }
        assert.equal(runtime.records()[0].answerDurationMs, 3000, 'new attempt has no abandoned duration');
        assert.equal(runtime.unloadProtected(), false);
        runtime.tab('learning');
        runtime.key('learning', 'End');
        assert.equal(runtime.confirmations.length, promptCount, 'finished attempt does not warn');
        runtime.get('restart').dispatch('click');
        runtime.tab('original');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.confirmations.length, promptCount, 'setup after restart does not warn');
        runtime.tab('quiz');
        runtime.start('easy');
        runtime.tab('learning');
        assert.equal(runtime.selectedTab(), 'learning', 'pointer confirmation also abandons');
        assert.equal(runtime.records().length, 1, 'previously completed results survive abandonment');
        assert.equal(runtime.unloadProtected(), false);
        assert.equal(runtime.intervals.size, 0);
        assert.ok(runtime.confirmations.every(message => /ukončíš.*odpovědi, body a postup se ztratí/.test(message)));
    }
});
