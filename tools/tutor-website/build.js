'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderPage } = require('./page.js');
const { validateLesson } = require('./validate.js');
const { MODES } = require('./runtime.js');
const { PROGRESSIVE_MODES, PROGRESSIVE_MEDIUM_MINIMUM } = require('./maths.js');
const { colors } = require('./highlights.js');

const PUBLICATION_ORIGIN = 'https://dusan.iric.online/';

function capabilities(subject) {
    if (!['history', 'maths'].includes(subject)) throw new Error(`Unsupported subject: ${subject}`);
    const levels = ['easy', 'medium', 'hard'];
    const modes = subject === 'maths' ? PROGRESSIVE_MODES : MODES;
    return {
        subject, version: subject === 'maths' ? 4 : 3, language: 'cs-CZ', standalone: true,
        tabs: ['original', 'learning', 'quiz'], playerNameRequired: true,
        schemaPath: path.join(__dirname, 'lesson.schema.json'),
        validatorPath: path.join(__dirname, 'validate.js'),
        builderPath: __filename,
        contractPath: path.join(__dirname, 'README.md'),
        examplePath: path.join(__dirname, 'examples', subject === 'history' ? 'defenestrace.json' : 'zlomky-a-prevody-delky.json'),
        generation: 'lesson-and-quiz',
        assessment: 'available',
        authoringRequirements: {
            taskUnit: subject === 'history' ? 'question' : 'whole-exercise',
            minimumTasks: 30,
            minimumByDifficulty: Object.fromEntries(levels.map((level, index) =>
                [level, Math.max(...Object.values(modes).map(mix => mix[index]))])),
            recommendedByDifficulty: subject === 'maths' ? { easy: 9, medium: 12, hard: 9 } : { easy: 6, medium: 15, hard: 9 },
            ...(subject === 'maths' ? {
                minimumMediumByType: { ...PROGRESSIVE_MEDIUM_MINIMUM }, recommendedMediumByType: { choice: 6, number: 6 },
                learningExamples: { topicOnlyDefault: 6, countPolicy: 'source-coverage-or-user-agreement', quizBankInLearning: false }
            } : {}),
            preferredTaskRange: { min: subject === 'history' ? 50 : 30, max: 100 },
            minimumTasksEnforcedByValidator: false
        },
        quizModes: Object.fromEntries(Object.entries(modes).map(([mode, mix]) =>
            [mode, Object.fromEntries(levels.map((level, index) => [level, mix[index]]))])),
        timing: subject === 'history' ? 'mandatory-speed-bonus-before-15000ms' : 'none',
        answerDuration: 'active-answering-only-excludes-feedback-and-hidden-quiz',
        inlineHighlighting: { colors: [...colors], tabs: ['original', 'learning'], childStorage: 'tab-session-including-reloads' },
        optionalTimeline: subject === 'history',
        limitations: [
            'Czech language, educational accuracy and taught coverage require subject-tutor review.',
            ...(subject === 'maths' ? ['Arbitrary symbolic answer evaluation and interactive geometry are unsupported; one-step equations with numerical answers are supported.'] : [])
        ]
    };
}

function getPublicationUrl(subject, lessonId, publicationPath = `test/${lessonId}.html`) {
    if (!['history', 'maths'].includes(subject)) throw new Error(`Unsupported subject: ${subject}`);
    if (typeof publicationPath !== 'string' || publicationPath.startsWith('/') ||
        /[?#\\]/.test(publicationPath) || !publicationPath.endsWith('.html')) {
        throw new Error('publicationPath must be a relative .html path under the site root');
    }
    const segments = publicationPath.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
        throw new Error('publicationPath must not contain empty or traversal segments');
    }
    const encodedPath = segments.map(segment => encodeURIComponent(segment)).join('/');
    return new URL(encodedPath, PUBLICATION_ORIGIN).href;
}

function renderLesson(subject, lesson, publicationPath) {
    validateLesson(subject, lesson);
    return renderPage(lesson, subject, getPublicationUrl(subject, lesson.id, publicationPath));
}

function within(file, directory) {
    const relative = path.relative(directory, file);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// Resolve links in existing ancestors even when the final output does not exist.
function canonical(file) {
    try {
        fs.lstatSync(file);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const parent = path.dirname(file);
        if (parent === file) throw new Error(`Cannot resolve path: ${file}`);
        return path.join(canonical(parent), path.basename(file));
    }
    return fs.realpathSync(file);
}

function build(request) {
    const keys = ['operation', 'subject', 'artifactDirectory', 'inputPath', 'outputPath', 'publicationPath', 'overwriteApproved'];
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Build handoff must be an object');
    for (const key of Object.keys(request)) if (!keys.includes(key)) throw new Error(`Unknown handoff field: ${key}`);
    if (request.operation !== 'build') throw new Error('Expected operation: build');
    const supported = capabilities(request.subject);
    if (request.overwriteApproved !== undefined && typeof request.overwriteApproved !== 'boolean') throw new Error('overwriteApproved must be a boolean');
    for (const key of ['artifactDirectory', 'inputPath', 'outputPath']) {
        if (typeof request[key] !== 'string' || !path.isAbsolute(request[key])) throw new Error(`${key} must be an absolute path`);
    }
    const root = canonical(path.resolve(__dirname, '..', '..'));
    const directory = canonical(request.artifactDirectory);
    const input = canonical(request.inputPath);
    const output = canonical(request.outputPath);
    if (within(directory, root) || within(input, root) || within(output, root)) throw new Error('Draft artifacts must stay outside the repository; publication requires separate approval');
    if (!within(input, directory) || !within(output, directory)) throw new Error('Input and output must resolve inside artifactDirectory (including links)');
    if (input === output || path.extname(output).toLowerCase() !== '.html') throw new Error('Output must be a separate .html file');
    const lesson = JSON.parse(fs.readFileSync(input, 'utf8'));
    validateLesson(request.subject, lesson);
    const lessonUrl = getPublicationUrl(request.subject, lesson.id, request.publicationPath);
    const html = renderPage(lesson, request.subject, lessonUrl);
    if (fs.existsSync(output) && fs.statSync(output).nlink > 1) throw new Error('Output has multiple hard links; choose a new artifact path');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, { encoding: 'utf8', flag: request.overwriteApproved ? 'w' : 'wx' });
    return {
        inputPath: input, outputPath: output, publicationUrl: lessonUrl,
        generation: supported.generation, assessment: supported.assessment, limitations: supported.limitations
    };
}

if (require.main === module) {
    try {
        const [operation, argument, ...extra] = process.argv.slice(2);
        if (extra.length || !argument || !['capabilities', 'build'].includes(operation)) {
            throw new Error('Usage: node tools\\tutor-website\\build.js capabilities <history|maths> OR build <handoff.json>');
        }
        const result = operation === 'capabilities' ? capabilities(argument) : build(JSON.parse(fs.readFileSync(argument, 'utf8')));
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(`Tutor website failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { capabilities, getPublicationUrl, renderLesson, build };
