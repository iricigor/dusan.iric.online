'use strict';

// Only the JSON Schema keywords used by the local contract are needed.
function schemaErrors(value, rule, location = '$', root = rule) {
    const errors = [];
    const check = (item, child, at = location) => schemaErrors(item, child, at, root);
    const fail = message => errors.push(`${location}: ${message}`);
    if (rule.$ref) {
        if (rule.$ref.startsWith('#/')) {
            const target = rule.$ref.slice(2).split('/').reduce((current, key) => current?.[key], root);
            if (!target) throw new Error(`Unknown schema reference: ${rule.$ref}`);
            errors.push(...check(value, target));
        } else {
            throw new Error(`Unsupported schema reference: ${rule.$ref}`);
        }
    }
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
        if (rule.maxLength !== undefined && value.length > rule.maxLength) fail(`allows at most ${rule.maxLength} characters`);
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
        if (rule.items) value.forEach((item, index) => errors.push(...check(item, rule.items, `${location}[${index}]`)));
    } else if (value !== null && typeof value === 'object') {
        for (const key of rule.required || []) {
            if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
        }
        for (const [key, item] of Object.entries(value)) {
            if (rule.properties && Object.hasOwn(rule.properties, key)) {
                errors.push(...check(item, rule.properties[key], `${location}.${key}`));
            } else if (rule.additionalProperties === false) {
                fail(`unknown property ${key}`);
            }
        }
    }
    for (const child of rule.allOf || []) errors.push(...check(value, child));
    if (rule.anyOf && !rule.anyOf.some(child => check(value, child).length === 0)) fail('does not match any allowed shape');
    if (rule.not && check(value, rule.not).length === 0) fail('contains forbidden properties');
    if (rule.if) {
        const branch = check(value, rule.if).length === 0 ? rule.then : rule.else;
        if (branch) errors.push(...check(value, branch));
    }
    return errors;
}

module.exports = { schemaErrors };
