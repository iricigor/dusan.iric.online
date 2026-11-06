'use strict';

function initializeTutorSpeech({ node, button }, host = window) {
    const synthesis = host.speechSynthesis;
    const available = synthesis && typeof host.SpeechSynthesisUtterance === 'function';
    const controls = new Set();
    let current = null;
    let deadline = null;
    const englishVoice = () => synthesis.getVoices().find(voice => /^en(?:[-_]|$)/i.test(voice.lang) && voice.localService);
    function stop() {
        if (!current) return;
        const playing = current;
        current = null;
        clearTimeout(deadline);
        synthesis.cancel();
        playing.status.textContent = 'Poslech zastaven. Můžeš ho přehrát znovu.';
    }
    function fail(control, message, error) {
        if (current === control) stop();
        console.error('Tutor: English listening failed.', error || message);
        control.status.textContent = message;
    }
    function createControls(audio) {
        const panel = node('div', undefined, 'listening-controls');
        const status = node('p', available ? 'Poslech používá místní anglický hlas zařízení.' :
            'Tento prohlížeč nepodporuje poslech. Otevři lekci v prohlížeči s podporou hlasového čtení.');
        status.setAttribute('role', 'status');
        const control = { status };
        const play = button('Přehrát anglický poslech', () => {
            stop();
            if (!available) {
                fail(control, 'Tento prohlížeč nepodporuje poslech.');
                return;
            }
            let voice;
            try {
                voice = englishVoice();
            } catch (error) {
                fail(control, 'Seznam hlasů se nepodařilo načíst. Zkus poslech znovu.', error);
                return;
            }
            if (!voice) {
                fail(control, 'Místní anglický hlas není dostupný. Nainstaluj anglický hlas v nastavení zařízení a zkus poslech znovu.');
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
            const playback = { status, utterance };
            current = playback;
            status.textContent = 'Spouštíme poslech…';
            const completed = message => {
                if (current !== playback) return;
                current = null;
                clearTimeout(deadline);
                status.textContent = message;
            };
            utterance.onstart = () => {
                if (current !== playback) return;
                clearTimeout(deadline);
                status.textContent = 'Přehrává se poslech. Můžeš ho zastavit nebo zopakovat.';
                deadline = setTimeout(() => fail(playback, 'Poslech nedokončil přehrávání. Zkus to znovu.'), 300000);
            };
            utterance.onend = () => completed('Poslech dokončen. Můžeš ho zopakovat.');
            utterance.onerror = event => {
                if (current === playback) fail(playback, 'Poslech se nepodařilo přehrát. Zkus to znovu.', event.error);
            };
            deadline = setTimeout(() => fail(playback, 'Poslech se nespustil. Zkus to znovu.'), 10000);
            try {
                synthesis.speak(utterance);
            } catch (error) {
                fail(playback, 'Poslech se nepodařilo spustit. Zkus to znovu.', error);
            }
        });
        const cancel = button('Zastavit poslech', stop);
        if (!available) {
            play.disabled = true;
            cancel.disabled = true;
        }
        panel.append(play, cancel, status);
        controls.forEach(existing => { if (!existing.status.isConnected) controls.delete(existing); });
        controls.add(control);
        return panel;
    }
    if (available) synthesis.addEventListener('voiceschanged', () => {
        let voice;
        try {
            voice = englishVoice();
        } catch (error) {
            console.error('Tutor: cannot load English voices.', error);
            controls.forEach(control => { control.status.textContent = 'Seznam hlasů se nepodařilo načíst. Zkus poslech znovu.'; });
            return;
        }
        if (voice) controls.forEach(control => {
            if (current?.status !== control.status && control.status.isConnected) control.status.textContent = 'Anglický hlas je připraven. Můžeš spustit poslech.';
        });
    });
    host.addEventListener('pagehide', stop);
    return { controls: createControls, stop };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { initializeTutorSpeech };
