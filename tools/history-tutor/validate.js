'use strict';

const fs = require('node:fs');
const path = require('node:path');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson.schema.json'), 'utf8'));

// Only the JSON Schema keywords used by the local contract are needed.
function schemaErrors(value, rule, location = '$') {
    const errors = [];
    const fail = message => errors.push(`${location}: ${message}`);
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if ('const' in rule && !equal(value, rule.const)) fail(`expected ${JSON.stringify(rule.const)}`);
    if (rule.enum && !rule.enum.includes(value)) fail(`expected one of ${rule.enum.join(', ')}`);
    if (rule.type) {
        const valid = {
            object: value !== null && typeof value === 'object' && !Array.isArray(value),
            array: Array.isArray(value),
            integer: Number.isInteger(value),
            boolean: typeof value === 'boolean',
            string: typeof value === 'string'
        }[rule.type];
        if (!valid) return [...errors, `${location}: expected ${rule.type}`];
    }
    if (typeof value === 'string') {
        if (rule.minLength && value.trim().length < rule.minLength) fail('must not be blank');
        if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) fail(`must match ${rule.pattern}`);
    }
    if (typeof value === 'number') {
        if (rule.minimum !== undefined && value < rule.minimum) fail(`minimum is ${rule.minimum}`);
        if (rule.maximum !== undefined && value > rule.maximum) fail(`maximum is ${rule.maximum}`);
    }
    if (Array.isArray(value)) {
        if (rule.minItems !== undefined && value.length < rule.minItems) fail(`needs at least ${rule.minItems} items`);
        if (rule.maxItems !== undefined && value.length > rule.maxItems) fail(`allows at most ${rule.maxItems} items`);
        if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('items must be unique');
        if (rule.items) value.forEach((item, index) => errors.push(...schemaErrors(item, rule.items, `${location}[${index}]`)));
    } else if (value !== null && typeof value === 'object') {
        for (const key of rule.required || []) {
            if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
        }
        for (const [key, item] of Object.entries(value)) {
            if (rule.properties && Object.hasOwn(rule.properties, key)) {
                errors.push(...schemaErrors(item, rule.properties[key], `${location}.${key}`));
            } else if (rule.additionalProperties === false) {
                fail(`unknown property ${key}`);
            }
        }
    }
    for (const child of rule.allOf || []) errors.push(...schemaErrors(value, child, location));
    if (rule.anyOf && !rule.anyOf.some(child => schemaErrors(value, child).length === 0)) fail('does not match any allowed shape');
    if (rule.not && schemaErrors(value, rule.not).length === 0) fail('contains forbidden properties');
    if (rule.if && schemaErrors(value, rule.if).length === 0 && rule.then) {
        errors.push(...schemaErrors(value, rule.then, location));
    }
    return errors;
}

function validateLesson(lesson) {
    const errors = schemaErrors(lesson, schema);
    if (errors.length) throw new Error(`Invalid lesson:\n${errors.join('\n')}`);
    const fail = message => errors.push(message);
    const unique = (values, label) => {
        const normalized = values.map(value => value.trim().normalize('NFC').toLocaleLowerCase('cs'));
        if (new Set(normalized).size !== values.length) fail(`${label} must be unique (ignoring case)`);
    };
    unique(lesson.questions.map(q => q.id), 'Question ids');
    unique(lesson.questions.map(q => q.prompt), 'Question prompts');
    unique(lesson.glossary.map(entry => entry.term), 'Glossary terms');
    const forms = new Map();
    lesson.glossary.forEach(entry => {
        for (const form of new Set([entry.term, ...entry.forms].map(text => text.toLocaleLowerCase('cs')))) {
            if (forms.has(form)) fail(`Glossary form "${form}" belongs to multiple terms`);
            forms.set(form, entry.term);
        }
    });
    for (const [level, minimum] of Object.entries({ easy: 2, medium: 5, hard: 3 })) {
        if (lesson.questions.filter(q => q.difficulty === level).length < minimum) {
            fail(`Question pool needs at least ${minimum} ${level} questions`);
        }
    }
    if (!lesson.questions.some(q => q.year)) fail('Question pool needs a hard year question');
    lesson.questions.forEach(q => {
        if (q.options) unique(q.options, `Options for ${q.id}`);
    });
    const urls = new Set(lesson.sources.map(source => source.url));
    for (const source of lesson.sources) {
        try {
            const url = new URL(source.url);
            if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('not a public HTTPS URL');
        } catch {
            fail(`Invalid source URL: ${source.url}`);
        }
    }
    const ranges = new Map();
    lesson.corrections.forEach((correction, index) => {
        const text = lesson.original[correction.section]?.text;
        if (!text || !text.includes(correction.quote) || text.indexOf(correction.quote) !== text.lastIndexOf(correction.quote)) {
            fail(`Correction ${index} must quote exactly one occurrence in its original section`);
            return;
        }
        if (!urls.has(correction.sourceUrl)) fail(`Correction ${index} must refer to a listed source`);
        const start = text.indexOf(correction.quote);
        const end = start + correction.quote.length;
        const sectionRanges = ranges.get(correction.section) || [];
        if (sectionRanges.some(range => start < range.end && end > range.start)) fail(`Correction ${index} overlaps another correction`);
        sectionRanges.push({ start, end });
        ranges.set(correction.section, sectionRanges);
    });
    if (errors.length) throw new Error(`Invalid lesson:\n${errors.join('\n')}`);
    return lesson;
}

module.exports = { validateLesson };
