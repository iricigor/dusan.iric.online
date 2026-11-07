'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeTutorSpeech, voiceGender } = require('../speech.js');

const male = { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true };
const female = { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true };

function fixture(voices = [{ lang: 'en-GB', localService: true }], supported = true) {
    const node = (tag, text = '', className) => ({ tag, textContent: text, className, isConnected: true,
        children: [], attributes: {}, events: {},
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, action) { this.events[name] = action; } });
    const button = (text, action, className) => ({ ...node('button', text, className), click: action });
    const events = {};
    const utterances = [];
    let cancelled = 0;
    let paused = 0;
    let resumed = 0;
    let voiceList = voices;
    const synthesis = {
        getVoices: () => voiceList, addEventListener: (event, action) => { events[event] = action; },
        speak: utterance => { utterances.push(utterance); },
        pause: () => { paused++; synthesis.paused = true; },
        resume: () => { resumed++; synthesis.paused = false; },
        cancel: () => { cancelled++; }
    };
    const host = { speechSynthesis: supported ? synthesis : undefined, SpeechSynthesisUtterance: function(text) { this.text = text; },
        addEventListener: (event, action) => { events[event] = action; } };
    const warning = node('p');
    const voiceSwitch = node('button');
    const controller = initializeTutorSpeech({ node, button, warning, voiceSwitch }, host);
    const audio = { text: 'I have got a comic.', language: 'en-GB' };
    const panel = controller.controls(audio);
    return { controller, host, synthesis, utterances, events, panel, audio,
        play: panel.children[0], icon: panel.children[0].children[0], label: panel.children[0].children[1],
        status: panel.children[1], warning, voiceSwitch,
        cancelled: () => cancelled, paused: () => paused, resumed: () => resumed,
        voices: value => { voiceList = value; } };
}

test('one listening button plays, pauses, resumes, replays and ignores stale utterance events', () => {
    const page = fixture();
    assert.equal(page.panel.children.filter(child => child.tag === 'button').length, 1);
    assert.equal(page.warning.hidden, true);
    assert.equal(page.status.hidden, true);
    page.play.click();
    const first = page.utterances[0];
    assert.equal(first.text, 'I have got a comic.');
    assert.equal(first.lang, 'en-GB');
    assert.equal(first.voice.localService, true);
    assert.equal(first.rate, 0.85);
    first.onstart();
    assert.equal(page.label.textContent, 'Pauza');
    page.play.click();
    assert.equal(page.paused(), 1);
    assert.equal(page.label.textContent, 'Pokračuj');
    assert.equal(page.play.attributes['aria-pressed'], 'false');
    page.play.click();
    assert.equal(page.resumed(), 1);
    assert.equal(page.label.textContent, 'Pauza');
    assert.equal(page.utterances.length, 1, 'resume uses the same utterance');
    first.onend();
    assert.equal(page.label.textContent, 'Poslouchej');
    page.play.click();
    const second = page.utterances[1];
    const another = page.controller.controls(page.audio);
    another.children[0].click();
    assert.equal(page.cancelled(), 1);
    assert.equal(page.label.textContent, 'Poslouchej');
    second.onstart();
    second.onend();
    second.onerror({ error: 'cancelled' });
    assert.equal(another.children[0].children[1].textContent, 'Pauza');
    page.events.pagehide();
    assert.equal(page.cancelled(), 2);
    assert.equal(another.children[0].children[1].textContent, 'Poslouchej');
});

test('unavailable listening shows only a global warning and loaded voices clear it without ready messages', t => {
    t.mock.method(console, 'error', () => {});
    const unsupported = fixture([], false);
    assert.equal(unsupported.play.disabled, true);
    assert.match(unsupported.warning.textContent, /nepodporuje/);
    assert.equal(unsupported.status.hidden, true);
    assert.equal(unsupported.voiceSwitch.hidden, true);
    const missing = fixture([{ lang: 'cs-CZ', localService: true }, { lang: 'en-US', localService: false }]);
    const another = missing.controller.controls(missing.audio);
    missing.play.click();
    another.children[0].click();
    assert.match(missing.warning.textContent, /není dostupný/);
    assert.equal(missing.status.textContent, '');
    assert.equal(another.children[1].textContent, '');
    assert.equal(missing.utterances.length, 0);
    missing.voices([{ lang: 'en-US', localService: true }]);
    missing.events.voiceschanged();
    assert.equal(missing.warning.hidden, true);
    assert.equal(missing.warning.textContent, '');
    assert.equal(missing.status.hidden, true);
    missing.play.click();
    missing.utterances[0].onerror({ error: 'audio-busy' });
    assert.match(missing.status.textContent, /nepodařilo přehrát/);
    assert.equal(missing.status.hidden, false);
    assert.equal(missing.cancelled(), 1);
    missing.synthesis.speak = () => { throw new Error('speech failed'); };
    missing.play.click();
    assert.match(missing.status.textContent, /nepodařilo spustit/);
});

test('gender switching uses only documented local voice identities, stops playback and follows voice loading', () => {
    for (const voice of [male, { ...male, name: 'Microsoft George - English (Great Britain)', lang: 'en-GB' }]) {
        assert.equal(voiceGender(voice), 'male');
    }
    assert.equal(voiceGender(female), 'female');
    for (const voice of [undefined, { ...male, localService: false }, { ...female, lang: 'cs-CZ' },
        { ...male, name: 'David' }, { ...male, name: 'Unknown male voice' }, { ...female, name: 'Microsoft Unknown' }]) {
        assert.equal(voiceGender(voice), null);
    }
    const page = fixture([male, { ...female, default: true }]);
    assert.equal(page.voiceSwitch.hidden, false);
    assert.equal(page.voiceSwitch.attributes['aria-checked'], 'true');
    page.play.click();
    assert.equal(page.utterances[0].voice.name, female.name);
    page.play.click();
    page.voiceSwitch.events.click();
    assert.equal(page.cancelled(), 1);
    assert.equal(page.synthesis.paused, false, 'switch clears the synthesizer pause state');
    assert.equal(page.voiceSwitch.attributes['aria-checked'], 'false');
    page.play.click();
    assert.equal(page.utterances[1].voice.name, male.name);
    page.voices([{ lang: 'en-GB', name: 'Unclassified', localService: true }]);
    page.events.voiceschanged();
    assert.equal(page.voiceSwitch.hidden, true);
    assert.equal(page.warning.hidden, true);
    page.controller.stop();
    page.voices([]);
    page.events.voiceschanged();
    assert.equal(page.warning.hidden, false);
    page.voices([male, female]);
    page.events.voiceschanged();
    assert.equal(page.voiceSwitch.hidden, false);
    assert.equal(page.warning.hidden, true);
});

test('startup and completion deadlines suspend while paused and resume with the remaining time', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    t.mock.method(console, 'error', () => {});
    const page = fixture();
    page.play.click();
    t.mock.timers.tick(5000);
    page.play.click();
    t.mock.timers.tick(600000);
    assert.equal(page.status.hidden, true);
    page.play.click();
    t.mock.timers.tick(5000);
    assert.match(page.status.textContent, /nespustil/);
    page.play.click();
    page.utterances.at(-1).onstart();
    t.mock.timers.tick(100000);
    page.play.click();
    t.mock.timers.tick(600000);
    assert.equal(page.status.hidden, true);
    page.play.click();
    t.mock.timers.tick(200000);
    assert.match(page.status.textContent, /nedokončil/);
    page.play.click();
    page.play.click();
    page.utterances.at(-1).onstart();
    t.mock.timers.tick(600000);
    assert.equal(page.status.hidden, true, 'late startup cannot unpause the button or deadline');
    assert.equal(page.label.textContent, 'Pokračuj');
    page.controller.stop();
});

test('voice-list, preparation, pause, resume and cancellation failures remain explicit', t => {
    t.mock.method(console, 'error', () => {});
    const page = fixture();
    page.synthesis.getVoices = () => { throw new Error('voice list failed'); };
    page.play.click();
    assert.match(page.warning.textContent, /Seznam hlasů/);
    assert.equal(page.status.hidden, true);
    page.synthesis.getVoices = () => [male];
    page.host.SpeechSynthesisUtterance = function() { throw new Error('prepare failed'); };
    page.play.click();
    assert.match(page.status.textContent, /připravit/);
    page.host.SpeechSynthesisUtterance = function(text) { this.text = text; };
    page.play.click();
    page.synthesis.pause = () => { throw new Error('pause failed'); };
    page.play.click();
    assert.match(page.status.textContent, /pozastavit/);
    page.synthesis.pause = () => { page.synthesis.paused = true; };
    page.play.click();
    page.play.click();
    page.synthesis.resume = () => { throw new Error('resume failed'); };
    page.play.click();
    assert.match(page.status.textContent, /obnovit/);
    page.synthesis.paused = false;
    page.play.click();
    page.synthesis.cancel = () => { throw new Error('cancel failed'); };
    page.controller.stop();
    assert.match(page.status.textContent, /zastavit/);
    assert.ok(console.error.mock.calls.length >= 5);
});
