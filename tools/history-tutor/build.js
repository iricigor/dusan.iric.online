'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateLesson } = require('./validate.js');
const { renderPage } = require('../tutor-website/page.js');

function renderLesson(lesson) {
    validateLesson(lesson);
    return renderPage(lesson, path.join(__dirname, 'app.js'), 'history');
}

function build(input, output, force = false) {
    const source = path.resolve(input);
    const destination = path.resolve(output);
    const root = path.resolve(__dirname, '..', '..');
    const within = (file, directory) => {
        const relative = path.relative(directory, file);
        return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    };
    if (destination === source || path.extname(destination).toLowerCase() !== '.html') {
        throw new Error('Output must be a separate .html file, not the lesson JSON.');
    }
    for (const folder of ['gems', 'tools', '.github']) {
        if (within(destination, path.join(root, folder))) throw new Error(`Do not write generated HTML inside ${folder}. Use a session artifact directory.`);
    }
    const html = renderLesson(JSON.parse(fs.readFileSync(source, 'utf8')));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, html, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
    return destination;
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.length < 2 || args.length > 3 || (args.length === 3 && args[2] !== '--force')) {
            throw new Error('Usage: node tools\\history-tutor\\build.js <lesson.json> <output.html> [--force]');
        }
        console.log(`Built standalone lesson: ${build(args[0], args[1], args[2] === '--force')}`);
    } catch (error) {
        console.error(`History tutor build failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { build, renderLesson };
