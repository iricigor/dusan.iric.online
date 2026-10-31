'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readRuntimeSource } = require('../../page.js');
const lesson = require('../../examples/defenestrace.json');
const mathsLesson = require('../../examples/zlomky-a-prevody-delky.json');

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
        this.classList = {
            contains: name => (this.className || '').split(' ').includes(name),
            add: name => { this.className = `${this.className || ''} ${name}`; }
        };
        this.style.setProperty = (name, value) => { this.style[name] = value; };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    get firstElementChild() { return this.children[0]; }
    append(...children) {
        children.forEach(child => {
            if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
            child.parent = this;
            this.children.push(child);
        });
    }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute() {}
    focus() {}
    getBoundingClientRect() { return { top: 350, bottom: 400, height: 50, left: 0, right: 200, width: 200 }; }
    scrollIntoView() {}
    normalize() {}
    checkVisibility() { return false; }
    before(child) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = this.parent;
        this.parent.children.splice(this.parent.children.indexOf(this), 0, child);
    }
    hidePopover() { this.open = false; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    dispatch(event, properties = {}) { this.listeners[event]?.({ preventDefault() {}, ...properties }); }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [
            ...(selector.split(', ').includes(child.tag) ||
                (selector === '[data-learning-card]' && child.dataset.learningCard) ||
                (selector.startsWith('.') && child.classList.contains(selector.slice(1))) ? [child] : []),
            ...child.querySelectorAll(selector)
        ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
}

function page(subject = 'history', stored = []) {
    const source = structuredClone(subject === 'history' ? lesson : mathsLesson);
    // This clock/quiz fixture exercises legacy lessons without optional presentation metadata.
    delete source.highlights;
    delete source.timeline;
    const shared = path.join(__dirname, '..', '..');
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
    vm.runInNewContext(readRuntimeSource(subject), context);
    tabs.find(control => control.dataset.tab === 'quiz').dispatch('click');
    const navigate = (name, event, properties) => {
        tabs.find(control => control.dataset.tab === name).dispatch(event, properties);
        if (elements.get('quiz-leave-dialog').open) {
            confirmations.push('quiz-leave-dialog');
            now += confirmDuration;
            elements.get(confirmResult ? 'quiz-leave' : 'quiz-stay').dispatch('click');
        }
    };
    return {
        get: id => context.document.getElementById(id),
        start: mode => modes.find(control => control.dataset.mode === mode).dispatch('click'),
        tab: name => navigate(name, 'click'),
        openTab: name => tabs.find(control => control.dataset.tab === name).dispatch('click'),
        key: (name, key) => navigate(name, 'keydown', { key }),
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

module.exports = { page };
