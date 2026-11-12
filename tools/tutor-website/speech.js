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

function initializeTutorSpeech({ node, button, compact = false, warning, voiceSwitch }, host = window) {
    const synthesis = host.speechSynthesis;
    const available = synthesis && typeof host.SpeechSynthesisUtterance === 'function';
    let selectedGender = null;
    let voices = [];
    let pair = {};
    const controls = new Set();
    let current = null;
    let deadline = null;
    let voiceError = '';
    const englishVoices = () => synthesis.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang) && voice.localService);
    const genderNames = ['male', 'female'];
    const genderOf = voice => voiceGender(voice) || undefined;
    const selectedVoice = () => selectedGender ? voices.find(voice => genderOf(voice) === selectedGender) :
        voices.find(voice => voice.default) || voices[0];
    const notice = warning;
    const voiceSelector = compact ? node('div', undefined, 'voice-selector') : null;
    const voiceButtons = {};
    if (compact) {
        notice.id ||= 'listening-notice';
        notice.className = `${notice.className || ''} listening-notice`.trim();
        notice.hidden = true;
        notice.setAttribute('role', 'status');
        voiceSelector.setAttribute('role', 'group');
        voiceSelector.setAttribute('aria-label', 'Hlas anglického poslechu');
        voiceSelector.setAttribute('aria-describedby', notice.id);
        for (const [gender, icon, label] of [['male', '👨', 'Mužský hlas'], ['female', '👩', 'Ženský hlas']]) {
            const control = button('', () => {
                if (!voices.some(voice => genderOf(voice) === gender)) return;
                if (!stop()) return;
                selectedGender = gender;
                updateAvailability();
            });
            const mark = node('span', icon);
            mark.setAttribute('aria-hidden', 'true');
            control.append(mark);
            control.setAttribute('aria-label', label);
            control.setAttribute('aria-pressed', 'false');
            control.title = label;
            voiceButtons[gender] = control;
            voiceSelector.append(control);
        }
    }
    function updateButton(control, state = 'idle') {
        const action = state === 'paused' ? ['▶', 'Pokračuj'] :
            (state === 'playing' || state === 'starting') && control.mode !== 'stop' ? ['⏸', 'Pauza'] :
                state === 'playing' || state === 'starting' ? ['■', 'Zastav'] : ['🎧', 'Poslouchej'];
        control.icon.textContent = action[0];
        control.label.textContent = action[1];
        control.play.setAttribute('aria-label', `${action[1]} anglický poslech`);
        control.play.setAttribute('aria-pressed', String(state === 'playing' || state === 'starting'));
        control.play.dataset.state = state;
    }
    function status(control, message, failed = false) {
        control.status.textContent = message;
        if (compact) {
            control.status.className = failed ? 'listening-error' : 'visually-hidden';
            control.status.setAttribute('role', failed ? 'alert' : 'status');
        } else {
            control.status.hidden = !failed;
            control.status.className = failed ? 'listening-error' : '';
        }
    }
    function updateAvailability() {
        const voice = selectedVoice();
        const missing = genderNames.filter(gender => !voices.some(item => genderOf(item) === gender));
        const message = !available ? 'Tento prohlížeč nepodporuje poslech. Otevři lekci v prohlížeči s podporou hlasového čtení.' :
            voiceError || (!voices.length ? 'Místní anglický hlas není dostupný. Nainstaluj anglický hlas v nastavení zařízení.' :
                compact && !voice ? 'Zvolený hlas už není dostupný. Vyber dostupný hlas nahoře nebo jej nainstaluj v nastavení zařízení.' :
                    compact && missing.length === 2 ? 'Anglický poslech je dostupný, ale jeho hlas neumíme označit jako mužský nebo ženský. Přepínač proto není dostupný.' :
                        compact && missing.length ? `${missing[0] === 'male' ? 'Mužský' : 'Ženský'} hlas není dostupný. Jeho přepínač je vypnutý; můžeš použít druhý hlas.` : '');
        notice.textContent = message ? `🎧 ${message}` : '';
        notice.hidden = !message;
        for (const gender of genderNames) {
            if (compact) {
                const control = voiceButtons[gender];
                control.disabled = Boolean(voiceError) || missing.includes(gender);
                control.setAttribute('aria-pressed', String(!control.disabled && selectedGender === gender));
                control.title = control.disabled ? `${gender === 'male' ? 'Mužský' : 'Ženský'} místní anglický hlas není dostupný.` :
                    `${gender === 'male' ? 'Mužský' : 'Ženský'} hlas`;
            }
        }
        controls.forEach(control => { control.play.disabled = !available || (compact && (Boolean(voiceError) || !voice)); });
        if (voiceSwitch) {
            voiceSwitch.hidden = compact || !pair.male || !pair.female;
            voiceSwitch.disabled = voiceSwitch.hidden;
            if (!voiceSwitch.hidden) {
                voiceSwitch.setAttribute('aria-checked', String(selectedGender === 'female'));
                voiceSwitch.title = selectedGender === 'female' ? 'Přepnout na mužský hlas' : 'Přepnout na ženský hlas';
            }
        }
    }
    function refreshVoices() {
        try {
            voices = available ? englishVoices() : [];
            voiceError = '';
        } catch (error) {
            voices = [];
            voiceError = 'Seznam hlasů se nepodařilo načíst. Obnov stránku a zkus to znovu.';
            console.error('Tutor: cannot load English voices.', error);
        }
        pair = {
            male: voices.find(voice => genderOf(voice) === 'male'),
            female: voices.find(voice => genderOf(voice) === 'female')
        };
        if (!compact && (!pair.male || !pair.female)) selectedGender = null;
        if (!selectedGender && voices.length && (compact || (pair.male && pair.female))) {
            selectedGender = genderOf(voices.find(voice => voice.default)) || genderOf(voices.find(voice => genderOf(voice))) || null;
        }
        if (current && !voices.includes(current.utterance.voice) &&
            !voices.some(voice => voice.name === current.utterance.voice.name && voice.lang === current.utterance.voice.lang)) stop();
        updateAvailability();
    }
    function stop() {
        if (!current) return true;
        const playback = current;
        current = null;
        try {
            synthesis.cancel();
            if (synthesis.paused) synthesis.resume();
        } catch (error) {
            current = playback;
            console.error('Tutor: cannot stop English listening.', error);
            status(playback.control, 'Poslech se nepodařilo zastavit. Zkus to znovu.', true);
            return false;
        }
        clearTimeout(deadline);
        updateButton(playback.control);
        status(playback.control, '', false);
        return true;
    }
    function fail(control, message, error) {
        if (current?.control === control) stop();
        console.error('Tutor: English listening failed.', error || message);
        status(control, message, true);
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
    function togglePlayback(control) {
        const playback = current;
        if (playback?.control !== control) return false;
        if (control.mode === 'stop') {
            stop();
            return true;
        }
        const paused = playback.state === 'paused';
        try {
            if (paused) {
                playback.state = playback.beforePause || 'playing';
                schedule(playback, playback.remaining, playback.timeoutMessage);
                synthesis.resume();
            } else {
                playback.remaining = Math.max(0, playback.deadlineAt - Date.now());
                playback.beforePause = playback.state;
                playback.state = 'paused';
                clearTimeout(deadline);
                synthesis.pause();
            }
            if (current === playback) updateButton(control, playback.state);
        } catch (error) {
            fail(control, paused ? 'Poslech se nepodařilo obnovit. Zkus to znovu.' : 'Poslech se nepodařilo pozastavit. Zkus to znovu.', error);
        }
        return true;
    }
    function playAudio(control, audio) {
        if (togglePlayback(control)) return;
        if (!stop()) return;
        refreshVoices();
        const voice = selectedVoice();
        if (!voice) return;
        status(control, '', false);
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
        const playback = { control, utterance, state: 'starting' };
        current = playback;
        updateButton(control, playback.state);
        utterance.onstart = () => {
            if (current !== playback) return;
            if (playback.state === 'paused') {
                playback.beforePause = 'playing';
                playback.remaining = 300000;
                playback.timeoutMessage = 'Poslech nedokončil přehrávání. Zkus to znovu.';
            } else {
                playback.state = 'playing';
                schedule(playback, 300000, 'Poslech nedokončil přehrávání. Zkus to znovu.');
            }
            updateButton(control, playback.state);
        };
        utterance.onend = () => {
            if (current !== playback) return;
            current = null;
            clearTimeout(deadline);
            updateButton(control);
            status(control, '', false);
        };
        utterance.onerror = event => {
            if (current === playback) fail(control, 'Poslech se nepodařilo přehrát. Zkus to znovu.', event.error);
        };
        schedule(playback, 10000, 'Poslech se nespustil. Zkus to znovu.');
        try {
            if (synthesis.paused) synthesis.resume();
            synthesis.speak(utterance);
        } catch (error) {
            fail(control, 'Poslech se nepodařilo spustit. Zkus to znovu.', error);
        }
    }
    function createControls(audio, { mode = 'pause' } = {}) {
        const panel = node('div', undefined, `listening-controls${compact ? ' listening-compact' : ''}`);
        const message = node('p');
        message.setAttribute('role', 'status');
        const control = { status: message, mode };
        const play = button('', () => playAudio(control, audio), 'listening-toggle');
        control.play = play;
        play.disabled = !available;
        control.icon = node('span', undefined, 'listening-icon');
        control.icon.setAttribute('aria-hidden', 'true');
        control.label = node('span');
        play.append(control.icon, control.label);
        if (compact) message.className = 'visually-hidden';
        else message.hidden = true;
        updateButton(control);
        panel.append(play, message);
        controls.forEach(existing => { if (!existing.status.isConnected) controls.delete(existing); });
        controls.add(control);
        if (compact) updateAvailability();
        return panel;
    }
    if (available) synthesis.addEventListener('voiceschanged', refreshVoices);
    if (voiceSwitch) {
        const maleIcon = node('span', '👨', 'voice-male');
        const femaleIcon = node('span', '👩', 'voice-female');
        maleIcon.setAttribute('aria-hidden', 'true');
        femaleIcon.setAttribute('aria-hidden', 'true');
        voiceSwitch.append(maleIcon, femaleIcon);
        voiceSwitch.addEventListener('click', () => {
            if (!pair.male || !pair.female || !stop()) return;
            selectedGender = selectedGender === 'female' ? 'male' : 'female';
            updateAvailability();
        });
    }
    refreshVoices();
    host.addEventListener('pagehide', stop);
    return { controls: createControls, stop, voiceSelector, notice };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { initializeTutorSpeech, voiceGender };
