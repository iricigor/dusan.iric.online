'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderPage } = require('./page.js');
const { validateLesson } = require('./validate.js');
const { renderLesson: renderHistory } = require('../history-tutor/build.js');

function capabilities(subject) {
    if (!['history', 'maths'].includes(subject)) throw new Error(`Unsupported subject: ${subject}`);
    return {
        subject, version: subject === 'history' ? 1 : 2, language: 'cs-CZ', standalone: true,
        tabs: ['original', 'learning', 'quiz'], playerNameRequired: true,
        schemaPath: subject === 'history' ? path.resolve(__dirname, '..', 'history-tutor', 'lesson.schema.json') : path.join(__dirname, 'maths.schema.json'),
        validatorPath: path.join(__dirname, 'validate.js'),
        builderPath: __filename,
        contractPath: path.join(__dirname, 'README.md'),
        examplePath: subject === 'history' ? path.resolve(__dirname, '..', 'history-tutor', 'examples', 'defenestrace.json') : null,
        generation: 'lesson-and-quiz',
        assessment: 'available',
        timing: subject === 'history' ? 'mandatory-speed-bonus-before-15000ms' : 'none',
        limitations: [
            'Czech language, educational accuracy and taught coverage require subject-tutor review.',
            ...(subject === 'maths' ? ['Symbolic algebra and interactive geometry are unsupported; starter lessons belong to #32.'] : [])
        ]
    };
}

function renderLesson(subject, lesson) {
    validateLesson(subject, lesson);
    if (subject === 'history') return renderHistory(lesson);
    return renderPage(lesson, path.join(__dirname, 'maths.js'), 'maths');
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
    const keys = ['operation', 'subject', 'artifactDirectory', 'inputPath', 'outputPath', 'overwriteApproved'];
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
    const html = renderLesson(request.subject, lesson);
    if (fs.existsSync(output) && fs.statSync(output).nlink > 1) throw new Error('Output has multiple hard links; choose a new artifact path');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, { encoding: 'utf8', flag: request.overwriteApproved ? 'w' : 'wx' });
    return { inputPath: input, outputPath: output, generation: supported.generation, assessment: supported.assessment, limitations: supported.limitations };
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

module.exports = { capabilities, renderLesson, build };
