'use strict';

const { schemaErrors, validateLesson: validateHistory } = require('../history-tutor/validate.js');
const mathsSchema = require('./maths.schema.json');

function validateLesson(subject, lesson) {
    if (subject === 'history') return validateHistory(lesson);
    if (subject !== 'maths') throw new Error(`Unsupported subject: ${subject}`);
    const errors = schemaErrors(lesson, mathsSchema);
    if (errors.length) throw new Error(`Invalid maths lesson:\n${errors.join('\n')}`);
    const normalize = text => text.trim().normalize('NFC').toLocaleLowerCase('cs');
    const unique = (items, location) => {
        if (new Set(items.map(normalize)).size !== items.length) errors.push(`${location}: values must be unique ignoring case and whitespace`);
    };
    const progression = ['simple', 'complex', 'everyday', 'challenge'];
    lesson.examples.forEach((example, index) => {
        if (example.kind !== progression[index]) errors.push(`$.examples[${index}].kind: expected ${progression[index]} in teaching progression`);
    });
    unique(lesson.examples.map(example => example.prompt), '$.examples prompts');
    unique(lesson.exercises.map(exercise => exercise.id), '$.exercises ids');
    unique(lesson.exercises.map(exercise => exercise.prompt), '$.exercises prompts');
    unique(lesson.glossary.map(entry => entry.term), '$.glossary terms');
    const forms = new Map();
    lesson.glossary.forEach((entry, index) => {
        for (const form of new Set([entry.term, ...entry.forms].map(normalize))) {
            if (forms.has(form)) errors.push(`$.glossary[${index}]: ambiguous form "${form}" also belongs to ${forms.get(form)}`);
            forms.set(form, entry.term);
        }
    });
    for (const [level, minimum] of Object.entries({ easy: 2, medium: 5, hard: 3 })) {
        if (lesson.exercises.filter(exercise => exercise.difficulty === level).length < minimum) {
            errors.push(`$.exercises: needs at least ${minimum} ${level} tasks for all quiz modes`);
        }
    }
    if (errors.length) throw new Error(`Invalid maths lesson:\n${errors.join('\n')}`);
    return lesson;
}

module.exports = { validateLesson };
