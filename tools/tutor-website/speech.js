'use strict';

function initializeTutorSpeech({ node, button, compact = false }, host = window) {
    const synthesis = host.speechSynthesis;
    const available = synthesis && typeof host.SpeechSynthesisUtterance === 'function';
    const controls = new Set();
    let current = null;
    let deadline = null;
    let voices = [];
    let selectedGender = null;
    let voiceError = '';
    const englishVoices = () => synthesis.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang) && voice.localService);
    // Microsoft's supported Narrator table identifies these installed US voices.
    const genderNames = {
        male: ['Microsoft David - English (United States)', 'Microsoft Mark - English (United States)'],
        female: ['Microsoft Zira - English (United States)']
    };
    const genderOf = voice => voice.lang.toLowerCase() === 'en-us' ?
        Object.keys(genderNames).find(gender => genderNames[gender].includes(voice.name)) : undefined;
    const selectedVoice = () => selectedGender ? voices.find(voice => genderOf(voice) === selectedGender) : voices[0];
    const notice = compact ? node('p', undefined, 'listening-notice') : null;
    const voiceSelector = compact ? node('div', undefined, 'voice-selector') : null;
    const voiceButtons = {};
    if (compact) {
        notice.id = 'listening-notice';
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
        if (!compact) return;
        const action = state === 'paused' ? ['▶', 'Pokračovat'] :
            state === 'playing' && control.mode === 'pause' ? ['⏸', 'Pozastavit'] :
                state === 'playing' || state === 'starting' ? ['■', 'Zastavit'] : ['▶', 'Přehraj si'];
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
        }
    }
    function updateAvailability() {
        const voice = selectedVoice();
        const missing = Object.keys(genderNames).filter(gender => !voices.some(item => genderOf(item) === gender));
        const message = !available ? 'Tento prohlížeč nepodporuje poslech. Otevři lekci v prohlížeči s podporou hlasového čtení.' :
            voiceError || (!voices.length ? 'Místní anglický hlas není dostupný. Nainstaluj anglický hlas v nastavení zařízení.' :
                !voice ? 'Zvolený hlas už není dostupný. Vyber dostupný hlas nahoře nebo jej nainstaluj v nastavení zařízení.' :
                    missing.length === 2 ? 'Anglický poslech je dostupný, ale jeho hlas neumíme označit jako mužský nebo ženský. Přepínač proto není dostupný.' :
                        missing.length ? `${missing[0] === 'male' ? 'Mužský' : 'Ženský'} hlas není dostupný. Jeho přepínač je vypnutý; můžeš použít druhý hlas.` : '');
        notice.textContent = message;
        notice.hidden = !message;
        for (const gender of Object.keys(genderNames)) {
            const control = voiceButtons[gender];
            control.disabled = Boolean(voiceError) || missing.includes(gender);
            control.setAttribute('aria-pressed', String(!control.disabled && selectedGender === gender));
            control.title = control.disabled ? `${gender === 'male' ? 'Mužský' : 'Ženský'} místní anglický hlas není dostupný.` :
                `${gender === 'male' ? 'Mužský' : 'Ženský'} hlas`;
        }
        controls.forEach(control => { control.play.disabled = !available || Boolean(voiceError) || !voice; });
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
        if (!selectedGender && voices.length) selectedGender = genderOf(voices[0]) || null;
        if (current && !voices.includes(current.utterance.voice) &&
            !voices.some(voice => voice.name === current.utterance.voice.name && voice.lang === current.utterance.voice.lang)) stop();
        updateAvailability();
    }
    function stop() {
        if (!current) return true;
        const playing = current;
        current = null;
        try {
            synthesis.cancel();
        } catch (error) {
            current = playing;
            console.error('Tutor: cannot stop English listening.', error);
            status(playing.control, 'Poslech se nepodařilo zastavit. Zkus to znovu.', true);
            return false;
        }
        clearTimeout(deadline);
        updateButton(playing.control);
        status(playing.control, 'Poslech zastaven. Můžeš ho přehrát znovu.');
        return true;
    }
    function fail(control, message, error) {
        if (current?.control === control) stop();
        console.error('Tutor: English listening failed.', error || message);
        status(control, message, true);
    }
    function watchPlayback(playback) {
        clearTimeout(deadline);
        deadline = setTimeout(() => {
            if (current === playback) fail(playback.control, 'Poslech nedokončil přehrávání. Zkus to znovu.');
        }, 300000);
    }
    function togglePlayback(control) {
        const playback = current;
        if (playback?.control !== control) return false;
        if (control.mode === 'stop' || playback.state === 'starting') {
            stop();
            return true;
        }
        try {
            if (playback.state === 'paused') {
                synthesis.resume();
                if (current !== playback) return true;
                playback.state = 'playing';
                watchPlayback(playback);
                status(control, 'Poslech pokračuje.');
            } else {
                synthesis.pause();
                if (current !== playback) return true;
                playback.state = 'paused';
                clearTimeout(deadline);
                status(control, 'Poslech pozastaven.');
            }
            updateButton(control, playback.state);
        } catch (error) {
            fail(control, 'Poslech se nepodařilo pozastavit nebo obnovit. Zkus to znovu.', error);
        }
        return true;
    }
    function playAudio(control, audio) {
        if (compact && togglePlayback(control)) return;
        if (!stop()) return;
        if (!available) {
            fail(control, 'Tento prohlížeč nepodporuje poslech.');
            return;
        }
        let voice;
        try {
            if (compact) {
                refreshVoices();
                voice = selectedVoice();
            } else voice = englishVoices()[0];
        } catch (error) {
            fail(control, 'Seznam hlasů se nepodařilo načíst. Zkus poslech znovu.', error);
            return;
        }
        if (!voice) {
            if (!compact) fail(control, 'Místní anglický hlas není dostupný. Nainstaluj anglický hlas v nastavení zařízení a zkus poslech znovu.');
            return;
        }
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
        status(control, 'Spouštíme poslech…');
        utterance.onstart = () => {
            if (current !== playback) return;
            playback.state = 'playing';
            updateButton(control, playback.state);
            status(control, compact ? 'Přehrává se poslech.' : 'Přehrává se poslech. Můžeš ho zastavit nebo zopakovat.');
            watchPlayback(playback);
        };
        utterance.onend = () => {
            if (current !== playback) return;
            current = null;
            clearTimeout(deadline);
            updateButton(control);
            status(control, 'Poslech dokončen. Můžeš ho zopakovat.');
        };
        utterance.onerror = event => {
            if (current === playback) fail(control, 'Poslech se nepodařilo přehrát. Zkus to znovu.', event.error);
        };
        deadline = setTimeout(() => {
            if (current === playback) fail(control, 'Poslech se nespustil. Zkus to znovu.');
        }, 10000);
        try {
            if (compact && synthesis.paused) synthesis.resume();
            synthesis.speak(utterance);
        } catch (error) {
            fail(control, 'Poslech se nepodařilo spustit. Zkus to znovu.', error);
        }
    }
    function createControls(audio, { mode = 'pause' } = {}) {
        const panel = node('div', undefined, compact ? 'listening-controls listening-compact' : 'listening-controls');
        const message = node('p', compact ? '' : available ? 'Poslech používá místní anglický hlas zařízení.' :
            'Tento prohlížeč nepodporuje poslech. Otevři lekci v prohlížeči s podporou hlasového čtení.');
        message.setAttribute('role', 'status');
        const control = { status: message, mode };
        const play = button(compact ? '' : 'Přehrát anglický poslech', () => playAudio(control, audio));
        control.play = play;
        if (compact) {
            play.className = 'listening-toggle';
            control.icon = node('span', undefined, 'listening-icon');
            control.icon.setAttribute('aria-hidden', 'true');
            control.label = node('span');
            play.append(control.icon, control.label);
            updateButton(control);
            message.className = 'visually-hidden';
            panel.append(play, message);
        } else {
            const cancel = button('Zastavit poslech', stop);
            if (!available) {
                play.disabled = true;
                cancel.disabled = true;
            }
            panel.append(play, cancel, message);
        }
        controls.forEach(existing => { if (!existing.status.isConnected) controls.delete(existing); });
        controls.add(control);
        if (compact) updateAvailability();
        return panel;
    }
    if (available) synthesis.addEventListener('voiceschanged', () => {
        if (compact) {
            refreshVoices();
            return;
        }
        let voice;
        try {
            voice = englishVoices()[0];
        } catch (error) {
            console.error('Tutor: cannot load English voices.', error);
            controls.forEach(control => { control.status.textContent = 'Seznam hlasů se nepodařilo načíst. Zkus poslech znovu.'; });
            return;
        }
        if (voice) controls.forEach(control => {
            if (current?.control !== control && control.status.isConnected) control.status.textContent = 'Anglický hlas je připraven. Můžeš spustit poslech.';
        });
    });
    if (compact) refreshVoices();
    host.addEventListener('pagehide', stop);
    return { controls: createControls, stop, voiceSelector, notice };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { initializeTutorSpeech };
