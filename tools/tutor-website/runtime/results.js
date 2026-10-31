'use strict';

function initializeTutorResults(lesson, subject, context) {
    const { $, node, points } = context;
    const storageKey = `${subject.storagePrefix}:${lesson.id}`;
    let records = [];
    let storageReadable = true;
    let currentRunId = null;
    const warnStorage = message => {
        $('storage-warning').hidden = false;
        $('storage-warning').textContent = message;
    };
    try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(stored) || stored.some(row =>
            !row || typeof row.id !== 'string' || typeof row.name !== 'string' ||
            (row.name.match(/\p{L}/gu) || []).length < 3 || row.name.length > 60 ||
            typeof row.time !== 'string' || !subject.validRecord(row) ||
            (row.answerDurationMs !== undefined && (!Number.isSafeInteger(row.answerDurationMs) || row.answerDurationMs < 0)))) {
            throw new Error('Invalid tutor session results');
        }
        records = stored;
    } catch (error) {
        storageReadable = false;
        console.warn('Tutor: cannot read session results.', error);
        warnStorage('Uložené výsledky nelze načíst. Nové výsledky zůstanou jen v této stránce; původní úložiště nepřepíšeme.');
    }
    function renderLeaderboard() {
        const container = $('leaderboard-content');
        container.replaceChildren();
        if (!records.length) {
            container.append(node('p', 'Zatím žádné výsledky.'));
            return;
        }
        const table = node('table');
        table.append(node('caption', 'Pořadí pokusů v této relaci. Doba odpovídání nezahrnuje čtení zpětné vazby. Starší pokusy ji nemají zaznamenanou.'));
        const head = node('thead');
        const labels = node('tr');
        ['Pořadí', 'Hráč', 'Kdy', 'Doba odpovídání', 'Obtížnost', 'Body', 'Známka'].forEach(label => {
            const cell = node('th', label);
            cell.scope = 'col';
            labels.append(cell);
        });
        head.append(labels);
        const body = node('tbody');
        [...records].sort(subject.compareResults).forEach((record, index) => {
            const row = node('tr');
            if (record.id === currentRunId) {
                row.className = 'current';
                row.setAttribute('aria-current', 'true');
                $('leaderboard-rank').textContent = `Tvůj poslední pokus: ${index + 1}. místo z ${records.length} pokusů v této relaci.`;
                $('leaderboard-rank').hidden = false;
            }
            [`${index + 1}.`, record.name, record.time,
                record.answerDurationMs === undefined ? 'Nezaznamenáno' : tutorQuiz.formatDuration(record.answerDurationMs),
                { easy: 'Lehká', medium: 'Střední', hard: 'Těžká' }[record.mode], `${points(record.total)} b`, String(record.grade)]
                .forEach(value => row.append(node('td', value)));
            body.append(row);
        });
        table.append(head, body);
        container.append(table);
    }
    function save(name, mode, result, answerDurationMs) {
        currentRunId = crypto.randomUUID();
        records.push({
            id: currentRunId, name, mode, total: result.total, grade: result.grade,
            time: new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
            answerDurationMs,
            ...(subject.speedBonus ? { duration: Math.round(answerDurationMs / 1000) } : { maximum: result.maximum })
        });
        if (storageReadable) {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(records));
                $('storage-warning').hidden = true;
                $('storage-warning').textContent = '';
            } catch (error) {
                console.warn('Tutor: cannot save session results.', error);
                warnStorage('Výsledky se nepodařilo uložit. Nové výsledky jsou vidět jen do obnovení této stránky.');
            }
        }
        renderLeaderboard();
    }
    return { save, renderLeaderboard };
}
