'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateLesson } = require('./validate.js');

function renderLesson(lesson) {
    validateLesson(lesson);
    const escapeHtml = text => text.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const data = JSON.stringify(lesson).replace(/[<>&\u2028\u2029]/g,
        char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const replacements = {
        TITLE: escapeHtml(lesson.topic),
        STYLES: fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'),
        DATA: data,
        APP: fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
    };
    return fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
        .replace(/@@(TITLE|STYLES|DATA|APP)@@/g, (_, key) => replacements[key]);
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
