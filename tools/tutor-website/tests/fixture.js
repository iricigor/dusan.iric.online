'use strict';

// Structural test data, not a prepared teaching default.
function mathsLesson() {
    const answer = value => ({ format: 'integer', value: String(value) });
    const step = value => ({
        prompt: `${value} + 1 = ?`, hint: 'Přidej jednu jednotku.',
        answer: answer(value + 1), solution: `K číslu ${value} přičti jednu. Výsledek je ${value + 1}.`
    });
    return {
        version: 2, subject: 'maths', language: 'cs-CZ', id: 'technicka-kontrola',
        topic: 'Technická kontrola počítání', audience: 'Jednoduché počítání pro děti.',
        original: [{ heading: 'Zadání', text: 'Procvičování jednoduchého počítání.' }],
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

// Mixed-format interaction fixture only; not reviewed teaching content.
function mathsAssessmentLesson() {
    const lesson = mathsLesson();
    lesson.exercises.filter(exercise => exercise.difficulty === 'easy').forEach(exercise => {
        exercise.explanation = 'Každou odpověď ověř samostatně podle jejího řešení.';
        exercise.steps = [
            { prompt: '2 + 1 = ?', hint: 'Přidej jednu.', answer: { format: 'integer', value: '3' },
                solution: 'Ke dvěma přičti jednu: 2 + 1 = 3.' },
            { prompt: 'Jaký zlomek je jedna ze dvou stejných částí?', hint: 'Jde o polovinu.',
                answer: { format: 'fraction', numerator: '1', denominator: '2' },
                solution: 'Jedna část ze dvou stejných částí je 1/2.' },
            { prompt: '1 + 0,5 = ?', hint: 'Přidej polovinu.', answer: { format: 'decimal', value: '1.5' },
                solution: 'Jedna a polovina je 1,5.' },
            { prompt: 'Převeď 150 cm na metry.', hint: 'Sto centimetrů je jeden metr.',
                answer: { format: 'length', value: '1.5', unit: 'm' },
                solution: '150 : 100 = 1,5. Délka je 1,5 m.' }
        ];
    });
    return lesson;
}

module.exports = { mathsLesson, mathsAssessmentLesson };
