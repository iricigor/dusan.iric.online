'use strict';

const { schemaErrors } = require('./schema.js');
const schema = require('./lesson.schema.json');
const { parseNumber, parseInput, compare, evaluate, normalizeLanguage, knownWords } = require('./assessment.js');
const { authored } = require('./highlights.js');
const { PROGRESSIVE_MINIMUM, PROGRESSIVE_MEDIUM_MINIMUM } = require('./maths.js');

function validateAssessment(policy, location, errors, subject) {
    const check = (matcher, at) => {
        if (matcher.type === 'array') return matcher.items.forEach((item, index) => check(item, `${at}.items[${index}]`));
        if (matcher.type === 'typo') {
            if (subject !== 'english' || policy.input !== 'text') errors.push(`${at}: typo credit is only supported for English text answers`);
            return;
        }
        if (matcher.normalization === 'language' && subject !== 'english') errors.push(`${at}: language normalization is only supported for English lessons`);
        if (matcher.type === 'number') {
            if (matcher.value.includes(',') || !parseNumber(matcher.value)) errors.push(`${at}.value: expected a bounded exact number with decimal point`);
        } else if (matcher.type === 'range') {
            const min = parseNumber(matcher.min);
            const max = parseNumber(matcher.max);
            if (matcher.min.includes(',') || matcher.max.includes(',') || !min || !max) errors.push(`${at}: range bounds must be bounded exact numbers with decimal points`);
            else if (compare(min, max) > 0 || (compare(min, max) === 0 && !(matcher.includeMin && matcher.includeMax))) {
                errors.push(`${at}: range must be ordered and nonempty`);
            }
        } else if (policy.input !== 'text') {
            if (matcher.normalization === 'czech') errors.push(`${at}: Czech spelling normalization is only allowed for text input`);
            const parsed = parseInput(policy, matcher.value);
            if (parsed.error) errors.push(`${at}.value: ${parsed.error}`);
        }
    };
    check(policy.exact, `${location}.exact`);
    if (policy.partial) check(policy.partial.match, `${location}.partial.match`);
}

function validateLesson(subject, lesson) {
    if (!['history', 'maths', 'english'].includes(subject)) throw new Error(`Unsupported subject: ${subject}`);
    const label = subject === 'history' ? 'Invalid lesson' : `Invalid ${subject} lesson`;
    const errors = schemaErrors(lesson, schema);
    if (lesson?.subject !== subject && !(subject === 'history' && lesson?.version === 1 && lesson.subject === undefined)) {
        errors.push(`$.subject: expected ${subject}`);
    }
    if (errors.length) throw new Error(`${label}:\n${errors.join('\n')}`);
    if (lesson.version >= 3) {
        const check = (policy, canonical, at) => {
            const before = errors.length;
            validateAssessment(policy, `${at}.assessment`, errors, subject);
            if (errors.length === before && canonical.some(answer => !evaluate(policy, answer, { knownWords: knownWords(lesson) }).correct)) {
                errors.push(`${at}.assessment.exact: must award full credit to every canonical answer`);
            }
        };
        if (subject === 'history') lesson.questions.forEach((question, index) => {
            const at = `$.questions[${index}]`;
            if (question.options && question.assessment.input !== 'number') errors.push(`${at}.assessment.input: choice answers require number input (option index)`);
            if (question.year && question.assessment.input !== 'number') errors.push(`${at}.assessment.input: year answers require number input`);
            check(question.assessment, question.type === 'text' ? question.acceptedAnswers : [String(question.answer)], at);
        });
        else if (subject === 'english') lesson.exercises.forEach((exercise, index) => {
            const at = `$.exercises[${index}]`;
            const policy = exercise.assessment;
            if (exercise.options) {
                if (exercise.answer >= exercise.options.length) errors.push(`${at}.answer: must refer to an offered option`);
                if (policy.exact.value !== String(exercise.answer)) errors.push(`${at}.assessment.exact: must match only the correct option index`);
                check(policy, [String(exercise.answer)], at);
                return;
            }
            const matchers = policy.exact.type === 'array' ? policy.exact.items : [policy.exact];
            if (matchers.some(matcher => matcher.type !== 'string' || matcher.normalization !== 'language')) {
                errors.push(`${at}.assessment.exact: English written answers require language-normalized string alternatives`);
            } else {
                const expected = exercise.acceptedAnswers.map(normalizeLanguage);
                const declared = matchers.map(matcher => normalizeLanguage(matcher.value));
                if (expected.length !== declared.length || expected.some(answer => !declared.includes(answer))) {
                    errors.push(`${at}.assessment.exact: must contain exactly the declared acceptedAnswers`);
                }
                if (new Set(expected).size !== expected.length) errors.push(`${at}.acceptedAnswers: duplicate normalized alternatives`);
            }
            if (exercise.skill === 'meaning' && !policy.partial) {
                errors.push(`${at}.assessment.partial: meaning answers require explicit typo-tolerance targets`);
            }
            if (policy.partial) {
                const typo = policy.partial.match;
                if (typo.type !== 'typo') errors.push(`${at}.assessment.partial: English only supports bounded typo credit`);
                else if (exercise.skill !== 'meaning' || exercise.type === 'wordOrder') errors.push(`${at}.assessment.partial: spelling and grammar tasks cannot award typo credit`);
                else if (typo.values.length !== exercise.acceptedAnswers.length ||
                    typo.values.some(value => !exercise.acceptedAnswers.map(normalizeLanguage).includes(normalizeLanguage(value)))) {
                    errors.push(`${at}.assessment.partial: typo targets must equal the full-credit alternatives`);
                }
            }
            if (exercise.type === 'translation' && exercise.answerLanguage !== (exercise.direction === 'en-cs' ? 'cs-CZ' : 'en-GB')) {
                errors.push(`${at}.answerLanguage: must match the translation direction`);
            }
            if (exercise.type === 'gapFill' && !exercise.text.includes('____')) errors.push(`${at}.text: gap-fill requires an ____ answer blank`);
            if (exercise.words) {
                const bank = [...exercise.words].map(normalizeLanguage).sort().join('|');
                if (exercise.words.some(word => /\s/.test(word) || !/^[\p{L}'’]+$/u.test(word))) errors.push(`${at}.words: use individual words without punctuation`);
                exercise.acceptedAnswers.forEach(answer => {
                    if (normalizeLanguage(answer).replace(/[.!?]$/, '').split(' ').sort().join('|') !== bank) {
                        errors.push(`${at}.acceptedAnswers: must use every offered word exactly once`);
                    }
                });
            }
            check(policy, exercise.acceptedAnswers, at);
        });
        else lesson.exercises.forEach((exercise, index) => {
            if (exercise.options) {
                const at = `$.exercises[${index}]`;
                if (exercise.answer >= exercise.options.length) errors.push(`${at}.answer: must refer to an offered option`);
                check(exercise.assessment, [String(exercise.answer)], at);
                return;
            }
            exercise.steps.forEach((step, stepIndex) => {
                const at = `$.exercises[${index}].steps[${stepIndex}]`;
                const answer = step.answer;
                if (answer.format === 'length' ? step.assessment.input !== 'length' || step.assessment.unit !== answer.unit : step.assessment.input !== 'number') {
                    errors.push(`${at}.assessment: input/unit must match the expected maths answer dimension`);
                }
                const canonical = answer.format === 'fraction' ? `${answer.numerator}/${answer.denominator}` :
                    answer.format === 'length' ? `${answer.value} ${answer.unit}` : answer.value;
                check(step.assessment, [canonical], at);
            });
        });
        if (errors.length) throw new Error(`${label}:\n${errors.join('\n')}`);
    }
    const normalize = text => text.trim().normalize('NFC').toLocaleLowerCase('cs');
    const unique = (items, location) => {
        if (new Set(items.map(normalize)).size !== items.length) errors.push(`${location}: values must be unique ignoring case and whitespace`);
    };
    const poolKey = subject === 'history' ? 'questions' : 'exercises';
    const pool = lesson[poolKey];
    errors.push(...authored(lesson).errors);
    (lesson.timeline || []).forEach((event, index) => {
        const at = `$.timeline[${index}]`;
        if (event.chunk >= lesson.chunks.length) errors.push(`${at}.chunk: must refer to an existing learning chunk`);
        if (event.year === 0 || event.lifespan?.birth === 0 || event.lifespan?.death === 0) {
            errors.push(`${at}: historical years must not be zero`);
        }
        if (event.lifespan && (event.lifespan.birth >= event.lifespan.death ||
            event.year < event.lifespan.birth || event.year > event.lifespan.death)) {
            errors.push(`${at}.lifespan: birth and death must be ordered and contain the event year`);
        }
    });
    lesson.original.forEach((section, index) => {
        if (section.paragraphs && section.paragraphs.map(block => block.text).join('\n\n') !== section.text) {
            errors.push(`$.original[${index}].paragraphs: text joined by blank lines must exactly preserve the original section text`);
        }
    });
    if (subject === 'english' && !lesson.original.some(section => section.panelDescription)) {
        for (const key of ['comicIntroduction', 'comicGuidance']) {
            if (Object.hasOwn(lesson, key)) errors.push(`$.${key}: requires an original comic panel with panelDescription`);
        }
    }
    unique(pool.map(task => task.id), `$.${poolKey} ids`);
    unique(pool.map(task => task.prompt), `$.${poolKey} prompts`);
    unique(lesson.glossary.map(entry => entry.term), '$.glossary terms');
    const forms = new Map();
    lesson.glossary.forEach((entry, index) => {
        for (const form of new Set([entry.term, ...entry.forms].map(normalize))) {
            if (forms.has(form)) errors.push(`$.glossary[${index}]: ambiguous form "${form}" also belongs to ${forms.get(form)}`);
            forms.set(form, entry.term);
        }
    });
    const minimums = lesson.version === 4 ? PROGRESSIVE_MINIMUM : { easy: 2, medium: 5, hard: 3 };
    for (const [level, minimum] of Object.entries(minimums)) {
        if (pool.filter(task => task.difficulty === level).length < minimum) {
            errors.push(`$.${poolKey}: needs at least ${minimum} ${level} tasks for all quiz modes`);
        }
    }
    if (subject === 'maths') {
        if (lesson.version === 4) {
            for (const [type, minimum] of Object.entries(PROGRESSIVE_MEDIUM_MINIMUM)) {
                if (pool.filter(task => task.difficulty === 'medium' && task.type === type).length < minimum) {
                    errors.push(`$.exercises: needs at least ${minimum} medium ${type} tasks for all quiz modes`);
                }
            }
            pool.forEach(exercise => {
                if (exercise.options) unique(exercise.options, `$.exercises options for ${exercise.id}`);
            });
        }
        if (lesson.version !== 4) {
            const progression = ['simple', 'complex', 'everyday', 'challenge'];
            if (lesson.examples.length !== 4) errors.push('$.examples: expected four legacy worked examples');
            lesson.examples.forEach((example, index) => {
                if (example.kind !== progression[index]) errors.push(`$.examples[${index}].kind: expected ${progression[index]} in teaching progression`);
            });
        }
        unique(lesson.examples.map(example => example.prompt), '$.examples prompts');
    } else if (subject === 'history') {
        if (!pool.some(question => question.year)) errors.push('$.questions: needs a hard year question');
        pool.forEach(question => {
            if (question.options) unique(question.options, `$.questions options for ${question.id}`);
        });
        const urls = new Set(lesson.sources.map(source => source.url));
        for (const source of lesson.sources) {
            try {
                const url = new URL(source.url);
                if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('not a public HTTPS URL');
            } catch {
                errors.push(`$.sources: invalid source URL: ${source.url}`);
            }
            if (subject !== 'english') {
                (lesson.chunks || []).forEach((chunk, index) => {
                    if (chunk.audio) errors.push(`$.chunks[${index}].audio: listening is English-only`);
                });
                lesson.original.forEach((section, index) => {
                    if (section.language && section.language !== 'cs-CZ') errors.push(`$.original[${index}].language: non-English lessons must remain Czech`);
                });
            } else pool.forEach(exercise => {
                if (exercise.options) unique(exercise.options, `$.exercises options for ${exercise.id}`);
            });
        }
    }
    if (subject === 'history' || subject === 'english') {
        const key = subject === 'history' ? 'corrections' : 'originalNotes';
        const urls = new Set((lesson.sources || []).map(source => source.url));
        const ranges = new Map();
        (lesson[key] || []).forEach((correction, index) => {
            const text = lesson.original[correction.section]?.text;
            if (!text || !text.includes(correction.quote) || text.indexOf(correction.quote) !== text.lastIndexOf(correction.quote)) {
                errors.push(`$.${key}[${index}]: must quote exactly one occurrence in its original section`);
                return;
            }
            if (subject === 'history' && !urls.has(correction.sourceUrl)) errors.push(`$.${key}[${index}]: must refer to a listed source`);
            const paragraphs = lesson.original[correction.section].paragraphs;
            if (paragraphs && !paragraphs.some(block => block.text.includes(correction.quote))) {
                errors.push(`$.${key}[${index}]: quote must stay within one styled original paragraph`);
            }
            const start = text.indexOf(correction.quote);
            const end = start + correction.quote.length;
            const sectionRanges = ranges.get(correction.section) || [];
            if (sectionRanges.some(range => start < range.end && end > range.start)) errors.push(`$.${key}[${index}]: overlaps another correction`);
            sectionRanges.push({ start, end });
            ranges.set(correction.section, sectionRanges);
        });
    }
    if (errors.length) throw new Error(`${label}:\n${errors.join('\n')}`);
    return lesson;
}

module.exports = { validateLesson };
