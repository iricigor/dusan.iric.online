'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const directory = path.join(root, '.github', 'agents');
const names = ['tutor-common', 'tutor-history', 'tutor-maths', 'tutor-website'];
const profiles = names.map(name => {
    const text = fs.readFileSync(path.join(directory, `${name}.agent.md`), 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
    assert.ok(match, `${name} must have frontmatter and instructions`);
    return { name, header: match[1], body: match[2] };
});

test('tutor profiles have consistent names and documented frontmatter fields', () => {
    const supported = new Set([
        'name', 'description', 'user-invocable', 'disable-model-invocation', 'tools'
    ]);
    profiles.forEach(({ name, header, body }) => {
        const keys = header.split(/\r?\n/).map(line => {
            const match = line.match(/^([a-z-]+): (.+)$/);
            assert.ok(match, `${name} uses flat frontmatter`);
            assert.ok(supported.has(match[1]), `${name}: unsupported field ${match[1]}`);
            return match[1];
        });
        assert.equal(new Set(keys).size, keys.length, `${name}: duplicate fields`);
        assert.match(header, new RegExp(`^name: ${name}$`, 'm'));
        assert.match(header, /^description: .+/m);
        assert.ok(body.length < 30000, `${name}: prompt exceeds documented limit`);
    });
});

test('subject tutors are opt-in and internal helpers allow only programmatic selection', () => {
    profiles.forEach(({ name, header }) => {
        const subject = name === 'tutor-history' || name === 'tutor-maths';
        assert.match(header, new RegExp(`^user-invocable: ${subject}$`, 'm'));
        assert.match(header, new RegExp(`^disable-model-invocation: ${subject}$`, 'm'));
        const tools = header.match(/^tools: (.+)$/m);
        if (tools) {
            assert.deepEqual(JSON.parse(tools[1]), ['read', 'search']);
            assert.equal(name, 'tutor-common');
        }
    });
});

test('subject and website profiles explicitly load common guidance and handoff instructions', () => {
    profiles.filter(profile => profile.name !== 'tutor-common').forEach(({ body }) => {
        assert.ok(body.includes('Read `.github\\agents\\tutor-common.agent.md` first'));
    });
    for (const name of ['tutor-history', 'tutor-maths']) {
        const { body } = profiles.find(profile => profile.name === name);
        assert.ok(body.includes('`tutor-website`'));
        assert.ok(body.includes('`.github\\agents\\tutor-website.agent.md`'));
    }
});

test('agent file references resolve and website owns the single shared contract', () => {
    profiles.forEach(({ name, body }) => {
        const references = body.matchAll(/`((?:\.github|tools)\\[^`*]+)`/g);
        for (const [, reference] of references) {
            const target = path.join(root, ...reference.split('\\'));
            assert.ok(fs.existsSync(target), `${name}: missing ${reference}`);
        }
    });

    const { body } = profiles.find(profile => profile.name === 'tutor-website');
    for (const filename of ['lesson.schema.json', 'validate.js', 'build.js']) {
        assert.ok(body.includes(`\`tools\\tutor-website\\${filename}\``));
    }
});

test('agents require JSON-only authorship and the common page and name-required quiz flow', () => {
    const common = profiles.find(profile => profile.name === 'tutor-common').body;
    for (const text of ['JSON only', 'Původní text, Učit se, Hrát si', 'name or nickname', 'comma or a dot']) {
        assert.ok(common.includes(text), `Missing shared rule: ${text}`);
    }
    for (const name of ['tutor-history', 'tutor-maths', 'tutor-website']) {
        const body = profiles.find(profile => profile.name === name).body;
        assert.ok(body.includes('JSON only'), `${name}: JSON-only responsibility`);
        assert.ok(body.includes('Původní text'), `${name}: original tab`);
        assert.ok(body.includes('name/nickname'), `${name}: common name requirement`);
    }
    const maths = profiles.find(profile => profile.name === 'tutor-maths').body;
    assert.ok(maths.includes('version 3'));
    assert.ok(maths.includes('separate practice tab'));
});

test('common guidance owns motivation, answer variants and easy-to-hard progression', () => {
    const common = profiles.find(profile => profile.name === 'tutor-common').body;
    for (const rule of ['`subtitle`', '`acceptedAnswers`', 'easy to medium to hard', '`paragraphs`', '7/4, 1 3/4', '`assessment`', '`partial.credit`', '`0.5`', 'target unit', '`2000`, not `2000 m`']) {
        assert.ok(common.includes(rule), rule);
    }
    const maths = profiles.find(profile => profile.name === 'tutor-maths').body;
    assert.ok(maths.includes('If the question fixes the target unit'));
    assert.ok(maths.includes('not length `2000 m`'));
});

test('both tutors reuse discoverable prepared JSON for default or empty requests', () => {
    const common = profiles.find(profile => profile.name === 'tutor-common').body;
    for (const text of ['supplies no topic or source', 'capabilities.examplePath', 'copy it unchanged', 'Explicit topics/material take']) {
        assert.ok(common.includes(text), `Missing default rule: ${text}`);
    }
    for (const name of ['tutor-history', 'tutor-maths']) {
        const body = profiles.find(profile => profile.name === name).body;
        assert.ok(body.includes('default/example request or no supplied topic/material'), name);
        assert.ok(body.includes('capabilities.examplePath'), name);
    }
    const maths = profiles.find(profile => profile.name === 'tutor-maths').body;
    assert.ok(maths.includes('one combined lesson'));
    assert.ok(maths.includes('fraction calculations and length-unit conversions'));
});
