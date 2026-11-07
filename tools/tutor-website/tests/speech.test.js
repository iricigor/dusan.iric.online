'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeTutorSpeech } = require('../speech.js');

function fixture(voices = [{ lang: 'en-GB', localService: true }], supported = true, compact = false) {
    const node = (tag, text, className) => ({ tag, textContent: text, className, isConnected: true, dataset: {},
        attributes: {}, children: [], append(...children) { this.children.push(...children); },
        setAttribute(key, value) { this.attributes[key] = value; } });
    const button = (text, action) => Object.assign(node('button', text), {
        click() { if (!this.disabled) action(); }
    });
    const events = {};
    const utterances = [];
    let cancelled = 0;
    let paused = 0;
    let resumed = 0;
    let voiceList = voices;
    const synthesis = {
        getVoices: () => voiceList, addEventListener: (event, action) => { events[event] = action; },
        speak: utterance => { utterances.push(utterance); },
        cancel: () => { cancelled++; },
        pause: () => { paused++; synthesis.paused = true; },
        resume: () => { resumed++; synthesis.paused = false; }
    };
    const host = { speechSynthesis: supported ? synthesis : undefined, SpeechSynthesisUtterance: function(text) { this.text = text; },
        addEventListener: (event, action) => { events[event] = action; } };
    const controller = initializeTutorSpeech({ node, button, compact }, host);
    const panel = controller.controls({ text: 'I have got a comic.', language: 'en-GB' });
    return { controller, host, synthesis, utterances, events, play: panel.children[0], stop: panel.children[1],
        status: panel.children[compact ? 1 : 2], cancelled: () => cancelled,
        paused: () => paused, resumed: () => resumed, voices: value => { voiceList = value; } };
}

const male = { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true };
const female = { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true };

test('listening permits replay, uses English local voices, cancels and ignores stale utterance events', () => {
    const page = fixture();
    page.play.click();
    const first = page.utterances[0];
    assert.equal(first.text, 'I have got a comic.');
    assert.equal(first.lang, 'en-GB');
    assert.equal(first.voice.localService, true);
    assert.equal(first.rate, 0.85);
    first.onstart();
    page.play.click();
    const second = page.utterances[1];
    second.onstart();
    first.onend();
    first.onerror({ error: 'cancelled' });
    assert.match(page.status.textContent, /Přehrává/);
    assert.equal(page.cancelled(), 1);
    second.onend();
    assert.match(page.status.textContent, /dokončen/);
    page.play.click();
    page.stop.click();
    assert.match(page.status.textContent, /zastaven/);
    page.play.click();
    page.events.pagehide();
    assert.equal(page.cancelled(), 3);
});

test('missing APIs and voices stay explicit, and asynchronously loaded local English voices allow retry', t => {
    t.mock.method(console, 'error', () => {});
    const unsupported = fixture([], false);
    assert.equal(unsupported.play.disabled, true);
    assert.match(unsupported.status.textContent, /nepodporuje/);
    const missing = fixture([{ lang: 'cs-CZ', localService: true }, { lang: 'en-US', localService: false }]);
    missing.play.click();
    assert.match(missing.status.textContent, /není dostupný/);
    assert.equal(missing.utterances.length, 0);
    missing.voices([{ lang: 'en-US', localService: true }]);
    missing.events.voiceschanged();
    assert.match(missing.status.textContent, /připraven/);
    missing.play.click();
    missing.utterances[0].onerror({ error: 'audio-busy' });
    assert.match(missing.status.textContent, /nepodařilo přehrát/);
    assert.equal(missing.cancelled(), 1);
    missing.synthesis.speak = () => { throw new Error('speech failed'); };
    missing.play.click();
    assert.match(missing.status.textContent, /nepodařilo spustit/);
});

test('failed startup, missing completion and voice API errors produce visible diagnostics', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'error', () => {});
    const page = fixture();
    page.play.click();
    t.mock.timers.tick(10000);
    assert.match(page.status.textContent, /nespustil/);
    page.play.click();
    page.utterances.at(-1).onstart();
    t.mock.timers.tick(300000);
    assert.match(page.status.textContent, /nedokončil/);
    page.synthesis.getVoices = () => { throw new Error('voice list failed'); };
    page.play.click();
    assert.match(page.status.textContent, /Seznam hlasů/);
    assert.ok(console.error.mock.calls.length >= 3);
});

test('compact controls pause and resume the same utterance, exclude paused time and reset after completion', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = fixture([male, female], true, true);
    assert.equal(page.controller.notice.hidden, true);
    assert.equal(page.status.textContent, '');
    page.play.click();
    const utterance = page.utterances[0];
    assert.equal(page.play.dataset.state, 'starting');
    utterance.onstart();
    assert.equal(page.play.dataset.state, 'playing');
    page.play.click();
    assert.equal(page.paused(), 1);
    assert.equal(page.play.dataset.state, 'paused');
    t.mock.timers.tick(600000);
    assert.equal(page.play.dataset.state, 'paused');
    page.play.click();
    assert.equal(page.resumed(), 1);
    assert.equal(page.utterances.length, 1);
    assert.equal(page.play.dataset.state, 'playing');
    utterance.onend();
    assert.equal(page.play.dataset.state, 'idle');
    assert.equal(page.status.className, 'visually-hidden');
});

test('original playback stops instead of pausing and another clip safely replaces paused speech', () => {
    const page = fixture([male, female], true, true);
    const original = page.controller.controls({ text: "It's our birthday!", language: 'en-GB' }, { mode: 'stop' });
    const play = original.children[0];
    play.click();
    page.utterances.at(-1).onstart();
    play.click();
    assert.equal(page.cancelled(), 1);
    assert.equal(page.paused(), 0);
    assert.equal(play.dataset.state, 'idle');
    page.play.click();
    const old = page.utterances.at(-1);
    old.onstart();
    page.play.click();
    play.click();
    const next = page.utterances.at(-1);
    next.onstart();
    assert.equal(page.synthesis.paused, false);
    assert.equal(page.play.dataset.state, 'idle');
    old.onend();
    old.onerror({ error: 'cancelled' });
    assert.equal(play.dataset.state, 'playing');
    page.events.pagehide();
    assert.equal(play.dataset.state, 'idle');
});

test('compact voice selection recognizes only verified local voices and never silently replaces a missing selection', () => {
    const page = fixture([male, female], true, true);
    const [man, woman] = page.controller.voiceSelector.children;
    assert.equal(man.attributes['aria-pressed'], 'true');
    assert.equal(woman.attributes['aria-pressed'], 'false');
    page.play.click();
    page.utterances.at(-1).onstart();
    woman.click();
    assert.equal(page.play.dataset.state, 'idle');
    assert.equal(page.cancelled(), 1);
    assert.equal(woman.attributes['aria-pressed'], 'true');
    page.play.click();
    assert.equal(page.utterances.at(-1).voice, female);
    page.voices([male]);
    page.events.voiceschanged();
    assert.equal(woman.disabled, true);
    assert.equal(man.attributes['aria-pressed'], 'false');
    assert.equal(page.play.disabled, true);
    assert.match(page.controller.notice.textContent, /Zvolený hlas/);
    const count = page.utterances.length;
    page.play.click();
    assert.equal(page.utterances.length, count);
    man.click();
    page.play.click();
    assert.equal(page.utterances.at(-1).voice, male);
    page.controller.stop();
    page.voices([{ name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: false },
        { name: 'Unknown woman voice', lang: 'en-GB', localService: true }]);
    page.events.voiceschanged();
    assert.equal(man.disabled, true);
    assert.equal(woman.disabled, true);
    assert.equal(page.play.disabled, true);
});

test('compact missing, unsupported, unknown and late voices use one shared warning without per-clip chatter', t => {
    t.mock.method(console, 'error', () => {});
    const unsupported = fixture([], false, true);
    assert.equal(unsupported.play.disabled, true);
    assert.match(unsupported.controller.notice.textContent, /nepodporuje/);
    assert.equal(unsupported.status.textContent, '');
    const page = fixture([], true, true);
    const another = page.controller.controls({ text: 'Hello.', language: 'en-GB' });
    assert.match(page.controller.notice.textContent, /není dostupný/);
    assert.equal(page.status.textContent, '');
    assert.equal(another.children[1].textContent, '');
    page.voices([{ name: 'Unknown', lang: 'en-GB', localService: true }]);
    page.events.voiceschanged();
    assert.match(page.controller.notice.textContent, /neumíme označit/);
    assert.equal(page.play.disabled, false);
    page.play.click();
    assert.equal(page.utterances.length, 1);
    page.controller.stop();
    page.voices([male, female]);
    page.events.voiceschanged();
    assert.equal(page.controller.notice.hidden, true);
    page.synthesis.getVoices = () => { throw new Error('voices failed'); };
    page.events.voiceschanged();
    assert.match(page.controller.notice.textContent, /Seznam hlasů/);
    assert.equal(page.play.disabled, true);
    assert.equal(page.status.className, 'visually-hidden');
});

test('compact playback exposes failures and recovers with idle buttons', t => {
    t.mock.method(console, 'error', () => {});
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = fixture([male, female], true, true);
    page.play.click();
    t.mock.timers.tick(10000);
    assert.equal(page.play.dataset.state, 'idle');
    assert.equal(page.status.className, 'listening-error');
    assert.match(page.status.textContent, /nespustil/);
    page.play.click();
    page.utterances.at(-1).onstart();
    page.synthesis.pause = () => { throw new Error('pause failed'); };
    page.play.click();
    assert.equal(page.play.dataset.state, 'idle');
    assert.match(page.status.textContent, /pozastavit/);
    page.play.click();
    page.utterances.at(-1).onerror({ error: 'audio-busy' });
    assert.equal(page.status.attributes.role, 'alert');
    assert.match(page.status.textContent, /přehrát/);
    page.synthesis.speak = () => { throw new Error('start failed'); };
    page.play.click();
    assert.equal(page.play.dataset.state, 'idle');
    assert.match(page.status.textContent, /spustit/);
});

test('compact cancellation failures are explicit and do not start overlapping clips', t => {
    t.mock.method(console, 'error', () => {});
    const page = fixture([male, female], true, true);
    const other = page.controller.controls({ text: 'Hello.', language: 'en-GB' });
    page.play.click();
    page.utterances.at(-1).onstart();
    const cancel = page.synthesis.cancel;
    page.synthesis.cancel = () => { throw new Error('cancel failed'); };
    other.children[0].click();
    assert.equal(page.utterances.length, 1);
    assert.match(page.status.textContent, /zastavit/);
    assert.equal(page.status.attributes.role, 'alert');
    page.synthesis.cancel = cancel;
    other.children[0].click();
    assert.equal(page.utterances.length, 2);
    page.controller.stop();
});
