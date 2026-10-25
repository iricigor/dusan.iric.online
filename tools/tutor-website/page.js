'use strict';

const fs = require('node:fs');
const path = require('node:path');

function renderPage(lesson, appPath, subject) {
    const escapeHtml = text => text.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const replacements = {
        TITLE: escapeHtml(lesson.topic),
        SUBJECT: subject === 'history' ? 'Dějepis' : 'Matematika',
        TIMING: subject === 'history' ? '<p id="bonus" role="status"></p>' : '',
        STYLES: fs.readFileSync(path.join(__dirname, '..', 'history-tutor', 'styles.css'), 'utf8'),
        DATA: JSON.stringify(lesson).replace(/[<>&\u2028\u2029]/g,
            char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`),
        APP: fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8') + '\n' + fs.readFileSync(appPath, 'utf8')
    };
    return fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
        .replace(/@@(TITLE|SUBJECT|TIMING|STYLES|DATA|APP)@@/g, (_, key) => replacements[key]);
}

module.exports = { renderPage };
