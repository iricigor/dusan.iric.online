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

test('subjects author JSON only and website owns shared page behavior and technical review', () => {
    const common = profiles.find(profile => profile.name === 'tutor-common').body;
    for (const text of ['JSON only', 'technical page checks', 'rendered educational content']) {
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
    const website = profiles.find(profile => profile.name === 'tutor-website').body.replace(/\s+/g, ' ');
    for (const text of ['actual generated HTML', 'correct/partial/incorrect answers',
        'storage warnings', 'both themes', 'offline use', 'easy-to-hard ordering',
        'technical review findings', 'Return language or', 'unexercised behavior']) {
        assert.ok(website.includes(text), `Missing technical review rule: ${text}`);
    }
});

test('common owns shared pedagogy and workflow without duplicating website technical rules', () => {
    const common = profiles.find(profile => profile.name === 'tutor-common').body;
    for (const rule of ['`subtitle`', 'easy to medium to hard', 'full-credit',
        'partial-credit', 'confirmed', 'transcription', 'read/search guidance helper',
        'do not execute builds/browser', 'permission for that exact file',
        'approval', 'default', 'errors', 'outside the repository']) {
        assert.ok(common.includes(rule), rule);
    }
    for (const technicalRule of ['15000', '1615', '1625', 'partial.credit', '2000 m', '80/60/40/20']) {
        assert.ok(!common.includes(technicalRule), `Common must reference website rules: ${technicalRule}`);
    }
    const maths = profiles.find(profile => profile.name === 'tutor-maths').body;
    assert.ok(maths.includes('If the question fixes the target unit'));
    assert.ok(maths.includes('not length `2000 m`'));
});

test('website owns numerical task quotas while subjects retain educational difficulty definitions', () => {
    for (const name of ['tutor-common', 'tutor-history', 'tutor-maths']) {
        const body = profiles.find(profile => profile.name === name).body;
        assert.ok(body.includes('authoringRequirements'), name);
        assert.ok(body.includes('quizModes'), name);
        assert.doesNotMatch(body, /at least \d+|50[-–]100|6\/15\/9|1\/2\/2/);
    }
    const website = profiles.find(profile => profile.name === 'tutor-website').body;
    assert.ok(website.includes('bank-size requirements'));
    assert.ok(website.includes('supported legacy banks valid'));
    for (const name of ['tutor-history', 'tutor-maths']) {
        const body = profiles.find(profile => profile.name === name).body;
        for (const level of ['Easy', 'Medium', 'Hard']) assert.ok(body.includes(`**${level}:**`), name);
    }
    const history = profiles.find(profile => profile.name === 'tutor-history').body;
    for (const rule of ['true/false', 'four-option', 'short-answer', 'year questions']) {
        assert.ok(history.includes(rule), rule);
    }
    const maths = profiles.find(profile => profile.name === 'tutor-maths').body;
    for (const rule of ['four independent', 'one answer field', 'three connected', 'own expected answer']) {
        assert.ok(maths.includes(rule), rule);
    }
});

test('history owns accurate year-tolerance wording and verified first-mention biographies', () => {
    const history = profiles.find(profile => profile.name === 'tutor-history').body;
    for (const rule of ['never the accepted absolute year endpoints', 'asymmetric or exclusive',
        'after submission', 'Do not change scoring', 'title or role', 'birth–death dates',
        'father', 'dates and territory of their reign', 'first mention',
        'cannot be verified', 'glossary entry', 'do not insert']) {
        assert.ok(history.includes(rule), rule);
    }
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
