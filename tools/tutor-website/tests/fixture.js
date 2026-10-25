'use strict';

// Structural test data, not a starter teaching lesson (#32).
function mathsLesson() {
    const answer = value => ({ format: 'integer', value: String(value) });
    const step = value => ({
        prompt: `${value} + 1 = ?`, hint: 'Přidej jednu jednotku.',
        answer: answer(value + 1), solution: `K číslu ${value} přičti jednu. Výsledek je ${value + 1}.`
    });
    return {
        version: 1, subject: 'maths', language: 'cs-CZ', id: 'technicka-kontrola',
        topic: 'Technická kontrola počítání', audience: 'Jednoduché počítání pro děti.',
        glossary: [{ term: 'jednotka', definition: 'Jedna část celku.', forms: ['jednotku'] }],
        examples: ['simple', 'complex', 'everyday', 'challenge'].map((kind, index) => ({
            kind, heading: ['Jednoduchý příklad', 'Složitější příklad', 'Příklad ze života', 'Výzva'][index],
            prompt: `Máš ${index + 1} jablek a dostaneš další jedno. Kolik jablek máš?`,
            hint: 'Přidej jednu jednotku.',
            steps: [{ calculation: `${index + 1} + 1 = ${index + 2}`, explanation: 'Přičtením jedné dostaneš následující číslo.' }],
            answer: `Máš ${index + 2} jablek.`
        })),
        exercises: ['easy', 'easy', 'medium', 'medium', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard'].map((difficulty, index) => ({
            id: `uloha-${index + 1}`, difficulty,
            prompt: `V úloze ${index + 1} postupně přidávej jablka do košíku.`,
            explanation: 'Každý výsledek najdeš přičtením jedné.',
            steps: Array.from({ length: { easy: 4, medium: 1, hard: 3 }[difficulty] }, (_, offset) => step(index + offset + 1))
        }))
    };
}

module.exports = { mathsLesson };
