'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lesson = require('../examples/defenestrace.json');

// Minimal DOM and clock for exercising the real runtime without dependencies.
class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.listeners = {};
        this.dataset = {};
        this.hidden = false;
        this.value = '';
        this.text = '';
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    addEventListener(event, listener) { this.listeners[event] = listener; }
    dispatch(event) { this.listeners[event]?.({ preventDefault() {} }); }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(selector.split(', ').includes(child.tag) ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
}

function page() {
    const template = fs.readFileSync(path.join(__dirname, '..', 'template.html'), 'utf8');
    assert.doesNotMatch(template, /type="checkbox"|id="speed"/);
    const elements = new Map([...template.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
    elements.get('lesson-data').textContent = JSON.stringify(lesson);
    elements.get('player').value = 'Tester';
    const modes = ['easy', 'medium', 'hard'].map(mode => {
        const element = new Element('button');
        element.dataset.mode = mode;
        return element;
    });
    let now = 0;
    let serial = 0;
    const intervals = new Map();
    const storage = new Map();
    const context = {
        document: {
            baseURI: 'https://example.org/',
            createElement: tag => new Element(tag),
            createTextNode: text => {
                const element = new Element('#text');
                element.textContent = text;
                return element;
            },
            getElementById: id => elements.get(id) ||
                elements.get('answers').children.find(child => child.id === id),
            querySelectorAll: selector => selector === '[data-mode]' ? modes : []
        },
        performance: { now: () => now },
        setInterval: callback => { intervals.set(++serial, callback); return serial; },
        clearInterval: id => intervals.delete(id),
        sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        crypto: { randomUUID: () => `run-${++serial}` },
        URL, console
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
    return {
        get: id => context.document.getElementById(id),
        start: mode => modes.find(control => control.dataset.mode === mode).dispatch('click'),
        advance: milliseconds => {
            now += milliseconds;
            [...intervals.values()].forEach(callback => callback());
        },
        intervals,
        records: () => JSON.parse(storage.get(`history-tutor:v1:${lesson.id}`) || '[]')
    };
}

test('every mode and restarted run enables the bonus, waits for progression and stores totals', () => {
    const runtime = page();
    for (const [mode, count, maximum] of [['easy', 3, 60], ['medium', 5, 110], ['hard', 10, 210]]) {
        runtime.start(mode);
        for (let index = 0; index < count; index++) {
            assert.equal(runtime.get('bonus').textContent, '2\u00d7 bonus: 15 s');
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
                assert.match(runtime.get('bonus').textContent, /Bonus skon/);
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
        assert.equal(runtime.records()[0].grade, 2);
        assert.ok(runtime.get('leaderboard-content').textContent.includes(`${135 + bonus} b`));
        assert.equal(runtime.intervals.size, 0);
    }
});
