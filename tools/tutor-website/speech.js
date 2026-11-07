'use strict';

function voiceGender(voice) {
    if (!voice?.localService || !/^en(?:[-_]|$)/i.test(voice.lang)) return null;
    // Web Speech exposes no gender. Only recognize documented Microsoft voices.
    const name = /^Microsoft ([a-z]+)(?: Desktop)?(?: - .+)?$/i.exec(voice.name || '')?.[1].toLowerCase();
    const genders = {
        david: 'male', mark: 'male', george: 'male', james: 'male', richard: 'male',
        ravi: 'male', sean: 'male', guy: 'male', ryan: 'male', prabhat: 'male',
        zira: 'female', hazel: 'female', susan: 'female', catherine: 'female',
        linda: 'female', heera: 'female', jenny: 'female', aria: 'female',
        sonia: 'female', neerja: 'female'
    };
    return Object.hasOwn(genders, name) ? genders[name] : null;
}

function initializeTutorSpeech({ node, button, warning, voiceSwitch }, host = window) {
    const synthesis = host.speechSynthesis;
    const available = synthesis && typeof host.SpeechSynthesisUtterance === 'function';
    let selectedGender = null;
    let voices = [];
    let pair = {};
    let current = null;
    let deadline = null;
    const showWarning = message => {
        warning.textContent = message ? `🎧 ${message}` : '';
        warning.hidden = !message;
    };
    const reset = control => {
        control.icon.textContent = '🎧';
        control.label.textContent = 'Poslouchej';
        control.toggle.setAttribute('aria-label', 'Přehrát anglický poslech');
        control.toggle.setAttribute('aria-pressed', 'false');
    };
    const updateButton = playback => {
        const paused = playback.phase === 'paused';
        playback.control.icon.textContent = paused ? '▶️' : '⏸️';
        playback.control.label.textContent = paused ? 'Pokračuj' : 'Pauza';
        playback.control.toggle.setAttribute('aria-label', paused ? 'Pokračovat v anglickém poslechu' : 'Pozastavit anglický poslech');
        playback.control.toggle.setAttribute('aria-pressed', String(!paused));
    };
    const showError = (control, message, error) => {
        console.error('Tutor: English listening failed.', error || message);
        control.status.textContent = message;
        control.status.hidden = false;
    };
    function stop() {
        if (!current) return;
        const playing = current;
        current = null;
        clearTimeout(deadline);
        reset(playing.control);
        try {
            synthesis.cancel();
            if (synthesis.paused) synthesis.resume();
        } catch (error) {
            showError(playing.control, 'Poslech se nepodařilo zastavit. Zkus to znovu.', error);
        }
    }
    function fail(control, message, error) {
        if (current?.control === control) stop();
        showError(control, message, error);
    }
    function refreshVoices() {
        if (!available) {
            showWarning('Tento prohlížeč nepodporuje poslech. Otevři lekci v prohlížeči s podporou hlasového čtení.');
            voiceSwitch.hidden = true;
            return false;
        }
        try {
            voices = synthesis.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang) && voice.localService);
        } catch (error) {
            console.error('Tutor: cannot load English voices.', error);
            showWarning('Seznam hlasů se nepodařilo načíst. Zkus poslech znovu.');
            voiceSwitch.hidden = true;
            return false;
        }
        pair = {
            male: voices.find(voice => voiceGender(voice) === 'male'),
            female: voices.find(voice => voiceGender(voice) === 'female')
        };
        const hasPair = Boolean(pair.male && pair.female);
        voiceSwitch.hidden = !hasPair;
        voiceSwitch.disabled = !hasPair;
        if (hasPair) {
            selectedGender ||= voiceGender(voices.find(voice => voice.default)) || voiceGender(voices.find(voice => voiceGender(voice)));
            voiceSwitch.setAttribute('aria-checked', String(selectedGender === 'female'));
            voiceSwitch.title = selectedGender === 'female' ? 'Přepnout na mužský hlas' : 'Přepnout na ženský hlas';
        } else selectedGender = null;
        showWarning(voices.length ? '' : 'Místní anglický hlas není dostupný. Nainstaluj anglický hlas v nastavení zařízení a zkus poslech znovu.');
        if (!voices.length) stop();
        return voices.length > 0;
    }
    function schedule(playback, remaining, message) {
        clearTimeout(deadline);
        playback.remaining = remaining;
        playback.deadlineAt = Date.now() + remaining;
        playback.timeoutMessage = message;
        deadline = setTimeout(() => {
            if (current === playback) fail(playback.control, message);
        }, remaining);
    }
    function togglePause(playback) {
        const paused = playback.phase === 'paused';
        try {
            if (paused) {
                playback.phase = playback.beforePause;
                schedule(playback, playback.remaining, playback.timeoutMessage);
                synthesis.resume();
            } else {
                playback.remaining = Math.max(0, playback.deadlineAt - Date.now());
                playback.beforePause = playback.phase;
                playback.phase = 'paused';
                clearTimeout(deadline);
                synthesis.pause();
            }
            if (current === playback) updateButton(playback);
        } catch (error) {
            fail(playback.control, paused ? 'Poslech se nepodařilo obnovit. Zkus to znovu.' : 'Poslech se nepodařilo pozastavit. Zkus to znovu.', error);
        }
    }
    function createControls(audio) {
        const panel = node('div', undefined, 'listening-controls');
        const status = node('p');
        status.hidden = true;
        status.setAttribute('role', 'status');
        const icon = node('span', undefined, 'listening-icon');
        icon.setAttribute('aria-hidden', 'true');
        const label = node('span');
        const control = { status, icon, label };
        const toggle = button('', () => {
            if (current?.control === control) {
                togglePause(current);
                return;
            }
            stop();
            status.textContent = '';
            status.hidden = true;
            if (!refreshVoices()) return;
            const voice = selectedGender ? pair[selectedGender] : voices.find(voice => voice.default) || voices[0];
            let utterance;
            try {
                utterance = new host.SpeechSynthesisUtterance(audio.text);
            } catch (error) {
                fail(control, 'Poslech se nepodařilo připravit. Zkus to znovu.', error);
                return;
            }
            utterance.lang = audio.language;
            utterance.voice = voice;
            utterance.rate = 0.85;
            const playback = { control, utterance, phase: 'starting' };
            current = playback;
            utterance.onstart = () => {
                if (current !== playback) return;
                if (playback.phase === 'paused') {
                    playback.beforePause = 'playing';
                    playback.remaining = 300000;
                    playback.timeoutMessage = 'Poslech nedokončil přehrávání. Zkus to znovu.';
                } else {
                    playback.phase = 'playing';
                    schedule(playback, 300000, 'Poslech nedokončil přehrávání. Zkus to znovu.');
                }
            };
            utterance.onend = () => {
                if (current !== playback) return;
                current = null;
                clearTimeout(deadline);
                reset(control);
            };
            utterance.onerror = event => {
                if (current === playback) fail(control, 'Poslech se nepodařilo přehrát. Zkus to znovu.', event.error);
            };
            schedule(playback, 10000, 'Poslech se nespustil. Zkus to znovu.');
            updateButton(playback);
            try {
                if (synthesis.paused) synthesis.resume();
                synthesis.speak(utterance);
            } catch (error) {
                fail(control, 'Poslech se nepodařilo spustit. Zkus to znovu.', error);
            }
        }, 'listening-toggle');
        control.toggle = toggle;
        toggle.append(icon, label);
        toggle.disabled = !available;
        reset(control);
        panel.append(toggle, status);
        return panel;
    }
    const maleIcon = node('span', '👨', 'voice-male');
    const femaleIcon = node('span', '👩', 'voice-female');
    maleIcon.setAttribute('aria-hidden', 'true');
    femaleIcon.setAttribute('aria-hidden', 'true');
    voiceSwitch.append(maleIcon, femaleIcon);
    voiceSwitch.addEventListener('click', () => {
        if (!refreshVoices() || voiceSwitch.hidden) return;
        stop();
        selectedGender = selectedGender === 'female' ? 'male' : 'female';
        refreshVoices();
    });
    if (available) synthesis.addEventListener('voiceschanged', refreshVoices);
    refreshVoices();
    host.addEventListener('pagehide', stop);
    return { controls: createControls, stop };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { initializeTutorSpeech, voiceGender };
