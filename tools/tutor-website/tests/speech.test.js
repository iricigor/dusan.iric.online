'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeTutorSpeech } = require('../speech.js');

function fixture(voices = [{ lang: 'en-GB', localService: true }], supported = true) {
    const node = (tag, text) => ({ tag, textContent: text, isConnected: true,
        children: [], append(...children) { this.children.push(...children); }, setAttribute() {} });
    const button = (text, action) => ({ textContent: text, click: action });
    const events = {};
    const utterances = [];
    let cancelled = 0;
    let voiceList = voices;
    const synthesis = {
        getVoices: () => voiceList, addEventListener: (event, action) => { events[event] = action; },
        speak: utterance => { utterances.push(utterance); },
        cancel: () => { cancelled++; }
    };
    const host = { speechSynthesis: supported ? synthesis : undefined, SpeechSynthesisUtterance: function(text) { this.text = text; },
        addEventListener: (event, action) => { events[event] = action; } };
    const controller = initializeTutorSpeech({ node, button }, host);
    const panel = controller.controls({ text: 'I have got a comic.', language: 'en-GB' });
    return { controller, host, synthesis, utterances, events, play: panel.children[0], stop: panel.children[1],
        status: panel.children[2], cancelled: () => cancelled, voices: value => { voiceList = value; } };
}

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
